"""Visual QA 的計算（純 Python + numpy，不依賴 bpy）：輪廓 IoU、外框 IoU、色差、投影。

「像不像參考圖」不交給 AI 主觀判斷，用可以重算、可以比較前後的數字：
- 輪廓 IoU：模型剪影和參考輪廓重疊的比例（1 = 完全重合）
- 外框 IoU：每個元件投影到正面的外框和參考框的重疊比例（位置、比例對不對）
- ΔE：顏色差（CIE76，約 2.3 是人眼勉強分辨得出來，> 30 是明顯不同的顏色）
"""

import numpy as np


def polygon_mask(points, width, height):
    """正規化座標（0～1、原點左上）的多邊形 → (height, width) 布林遮罩。

    掃描線填色：每一列在像素中心的高度，算出和多邊形每條邊的交點，排序後兩兩配對填滿。
    凹多邊形也適用（交點數一定是偶數）。比逐像素做「點在多邊形內」快上百倍。
    """
    mask = np.zeros((height, width), dtype=bool)
    pts = [(x * width, y * height) for x, y in points]
    count = len(pts)
    for row in range(height):
        y = row + 0.5
        xs = []
        for i in range(count):
            (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % count]
            # 半開區間 [min, max)：頂點剛好在掃描線上時只算一次，交點才會成對
            if (y0 <= y < y1) or (y1 <= y < y0):
                xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            start = max(int(np.ceil(a - 0.5)), 0)
            end = min(int(np.floor(b - 0.5)), width - 1)
            if end >= start:
                mask[row, start:end + 1] = True
    return mask


def iou(a, b):
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / union) if union else 1.0


def bbox_iou(a, b):
    """[x0, y0, x1, y1] 兩個框的 IoU。"""
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    area = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / area if area > 0 else 0.0


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#" + "".join(f"{int(round(min(max(c, 0.0), 1.0) * 255)):02X}" for c in rgb)


def srgb_to_lab(rgb):
    """sRGB（0～1）→ CIE Lab（D65）。人眼對顏色差的感受在 Lab 空間比較接近直線距離。"""
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    x = (0.4124 * lin[0] + 0.3576 * lin[1] + 0.1805 * lin[2]) / 0.95047
    y = (0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]) / 1.0
    z = (0.0193 * lin[0] + 0.1192 * lin[1] + 0.9505 * lin[2]) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 216 / 24389 else (24389 / 27 * t + 16) / 116

    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def delta_e(a, b):
    """CIE76 色差。a、b 可以是 hex 字串或 (r, g, b)（0～1）。"""
    la = srgb_to_lab(hex_to_rgb(a) if isinstance(a, str) else a)
    lb = srgb_to_lab(hex_to_rgb(b) if isinstance(b, str) else b)
    return float(np.sqrt(sum((p - q) ** 2 for p, q in zip(la, lb))))


def median_color(pixels, bbox):
    """pixels：(h, w, ≥3)、左上為原點、sRGB 0～1；bbox：正規化 [x0, y0, x1, y1]。

    用中位數而不是平均：水彩的紙紋、線稿的黑線不會把顏色拉偏。
    """
    h, w = pixels.shape[:2]
    x0, y0, x1, y1 = bbox
    region = pixels[int(y0 * h):max(int(y1 * h), int(y0 * h) + 1), int(x0 * w):max(int(x1 * w), int(x0 * w) + 1), :3]
    return tuple(float(v) for v in np.median(region.reshape(-1, 3), axis=0))


def project_bbox(world_min, world_max, frame):
    """正面正交視角（相機看 +Y）：世界 x → 影像 u、世界 z → 影像 v（往下為正），回傳正規化 [u0, v0, u1, v1]。"""
    cx, cz = frame["center"]
    width_px, height_px = frame["pixels"]
    height_m = frame["height_m"]
    width_m = height_m * width_px / height_px
    left, top = cx - width_m / 2, cz + height_m / 2
    return [(world_min[0] - left) / width_m, (top - world_max[2]) / height_m,
            (world_max[0] - left) / width_m, (top - world_min[2]) / height_m]


def grade(value, pass_at, warn_at):
    """越大越好的指標：≥ pass_at → pass、≥ warn_at → warn、否則 fail。"""
    return "pass" if value >= pass_at else "warn" if value >= warn_at else "fail"
