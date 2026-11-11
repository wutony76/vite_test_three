"""把 ReferenceSpec 的元件框、輪廓疊到原圖上，並從原圖取樣色票，用來人工校正分析結果。

    Blender --background --factory-startup --python-exit-code 1 \\
        --python tools/blender/scripts/overlay_reference.py -- <reference.json> <輸出.png>

為什麼用 Blender 跑：Blender 內建 numpy，也能讀寫圖片，不需要另外安裝 Pillow。
輸出的 PNG 只是校正用的暫存檔，不要放進版控。
"""

import json
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.dirname(HERE))

from lowpoly_kit.pipeline import validate_plan  # noqa: E402

# 每個元件框輪流使用的顏色（RGBA，0～1）
COLORS = [
    (1.0, 0.0, 0.0), (0.0, 0.6, 1.0), (1.0, 0.0, 1.0), (0.0, 0.8, 0.0),
    (1.0, 0.5, 0.0), (0.4, 0.0, 1.0), (0.0, 0.0, 0.0), (0.0, 0.9, 0.9),
]


def load_rgba(path):
    """讀圖成 (高, 寬, 4) 的陣列，第 0 列是圖片最上方。

    Blender 的 pixels 從左下角開始存，和一般圖片（左上角）上下相反，所以要翻轉。
    少了翻轉，畫出來的框會上下顛倒。
    """
    image = bpy.data.images.load(path)
    width, height = image.size
    buffer = np.empty(width * height * 4, dtype=np.float32)
    image.pixels.foreach_get(buffer)
    bpy.data.images.remove(image)
    return np.flipud(buffer.reshape(height, width, 4)).copy()


def save_rgba(pixels, path):
    height, width = pixels.shape[:2]
    image = bpy.data.images.new("overlay", width, height, alpha=True)
    image.pixels.foreach_set(np.flipud(pixels).ravel())
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)


def to_px(bbox, width, height):
    x0, y0, x1, y1 = bbox
    return int(x0 * width), int(y0 * height), int(x1 * width) - 1, int(y1 * height) - 1


def draw_rect(pixels, bbox, color, thickness=3):
    height, width = pixels.shape[:2]
    x0, y0, x1, y1 = to_px(bbox, width, height)
    rgba = (*color, 1.0)
    pixels[y0:y0 + thickness, x0:x1 + 1] = rgba
    pixels[max(y1 - thickness + 1, 0):y1 + 1, x0:x1 + 1] = rgba
    pixels[y0:y1 + 1, x0:x0 + thickness] = rgba
    pixels[y0:y1 + 1, max(x1 - thickness + 1, 0):x1 + 1] = rgba


def draw_polyline(pixels, points, color, closed=True):
    height, width = pixels.shape[:2]
    pairs = list(zip(points, points[1:] + (points[:1] if closed else [])))
    for (ax, ay), (bx, by) in pairs:
        steps = int(max(abs(bx - ax) * width, abs(by - ay) * height)) + 1
        for t in np.linspace(0.0, 1.0, steps):
            x = int((ax + (bx - ax) * t) * (width - 1))
            y = int((ay + (by - ay) * t) * (height - 1))
            pixels[max(y - 1, 0):y + 2, max(x - 1, 0):x + 2] = (*color, 1.0)


def sample_hex(pixels, bbox):
    """取區域內的中位數顏色。用中位數而不是平均：水彩紙紋與線稿的黑線不會把顏色拉偏。"""
    height, width = pixels.shape[:2]
    x0, y0, x1, y1 = to_px(bbox, width, height)
    region = pixels[y0:y1 + 1, x0:x1 + 1, :3].reshape(-1, 3)
    rgb = np.clip(np.median(region, axis=0), 0, 1)
    return "#" + "".join(f"{int(round(v * 255)):02X}" for v in rgb)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if len(argv) != 2:
        raise SystemExit("用法：... -- <reference.json> <輸出.png>")
    reference_path, output = argv

    result = validate_plan(reference_path)
    if not result["ok"]:
        print(json.dumps(result["errors"], ensure_ascii=False, indent=2))
        raise SystemExit(1)
    with open(reference_path, encoding="utf-8") as handle:
        reference = json.load(handle)

    pixels = load_rgba(os.path.join(REPO_ROOT, reference["image"]["path"]))
    print("元件框圖例：")
    for index, component in enumerate(reference["components"]):
        color = COLORS[index % len(COLORS)]
        draw_rect(pixels, component["bbox"], color)
        print(f"  {index:2d} {component['id']:<16} rgb={color}")
    draw_polyline(pixels, reference["silhouette"]["outline"], (1.0, 1.0, 1.0))

    print("\n色票取樣（宣告值 → 原圖中位數）：")
    for color in reference["palette"]:
        if "sample" in color:
            print(f"  {color['name']:<14} {color['hex']} → {sample_hex(pixels, color['sample'])}")

    os.makedirs(os.path.dirname(os.path.abspath(output)), exist_ok=True)
    save_rgba(pixels, output)
    print(f"\n輸出：{output}")


main()
