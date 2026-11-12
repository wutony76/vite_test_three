"""材質區域的視覺指標（純 numpy，不依賴 bpy）：Visual QA v2 用來比較「表面像不像」。

輪廓 IoU 只能判斷形狀；這裡比較的是表面：
- 材質相似度：Lab 色彩直方圖的交集（1 = 顏色分布完全相同）。比中位數色差更能反映「木紋的深淺分布」
- 細節密度：Sobel 梯度強度的平均。純色表面接近 0；有木紋、磚縫時變大
- 紋理比例：自相關找出圖樣的重複週期（px）。磚高 8 cm 的牆，週期換成公尺應該接近 0.08
- 風格指紋：平均飽和度、明度對比。手繪資產彼此接近；混進一張寫實照片時會明顯偏離

輸入一律是 (h, w, ≥3) 的 sRGB 0～1 陣列（第 0 列在上面）＋ 布林遮罩。
"""

import numpy as np

HIST_BINS = (6, 8, 8)  # L、a、b 各切幾格。太細的話，同一種材質因為筆觸位置不同也會被判成不像
LAB_RANGE = ((0, 100), (-60, 60), (-60, 80))


def srgb_to_lab_array(rgb):
    """向量化的 sRGB → Lab（和 metrics.srgb_to_lab 同一套公式）。"""
    rgb = np.clip(np.asarray(rgb, dtype=np.float64)[..., :3], 0, 1)
    lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    x = (lin @ np.array([0.4124, 0.3576, 0.1805])) / 0.95047
    y = lin @ np.array([0.2126, 0.7152, 0.0722])
    z = (lin @ np.array([0.0193, 0.1192, 0.9505])) / 1.08883

    def f(t):
        return np.where(t > 216 / 24389, np.cbrt(t), (24389 / 27 * t + 16) / 116)

    fx, fy, fz = f(x), f(y), f(z)
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def lab_histogram(pixels, mask):
    lab = srgb_to_lab_array(pixels[mask])
    hist, _ = np.histogramdd(lab, bins=HIST_BINS, range=LAB_RANGE)
    total = hist.sum()
    return hist / total if total else hist


def color_similarity(a, mask_a, b, mask_b):
    """直方圖交集：兩個分布重疊的比例，0～1。"""
    return float(np.minimum(lab_histogram(a, mask_a), lab_histogram(b, mask_b)).sum())


def luminance(pixels):
    rgb = pixels[..., :3]
    return 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]


def detail_density(pixels, mask):
    """遮罩內的平均 Sobel 梯度強度（亮度每像素的變化量）。邊界像素不算，避免把輪廓算成細節。"""
    gray = luminance(pixels).astype(np.float64)
    padded = np.pad(gray, 1, mode="edge")
    gx = (padded[:-2, 2:] + 2 * padded[1:-1, 2:] + padded[2:, 2:]
          - padded[:-2, :-2] - 2 * padded[1:-1, :-2] - padded[2:, :-2]) / 8
    gy = (padded[2:, :-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:]
          - padded[:-2, :-2] - 2 * padded[:-2, 1:-1] - padded[:-2, 2:]) / 8
    magnitude = np.hypot(gx, gy)
    inner = mask.copy()
    inner[1:-1, 1:-1] &= mask[:-2, 1:-1] & mask[2:, 1:-1] & mask[1:-1, :-2] & mask[1:-1, 2:]
    inner[[0, -1], :] = False
    inner[:, [0, -1]] = False
    return float(magnitude[inner].mean()) if inner.any() else 0.0


def dominant_period(pixels, mask, axis=0, min_lag=3):
    """沿 axis（0 = 垂直、1 = 水平）的主週期（px）。找不到明顯的重複時回傳 None。

    做法：取遮罩外框內的亮度，減去平均後算自相關（用 FFT），找第一個明顯的峰值。
    例如磚牆的垂直週期就是一塊磚加一條磚縫的高度。
    """
    rows, cols = np.where(mask)
    if rows.size == 0:
        return None
    crop = luminance(pixels)[rows.min():rows.max() + 1, cols.min():cols.max() + 1].astype(np.float64)
    crop_mask = mask[rows.min():rows.max() + 1, cols.min():cols.max() + 1]
    crop = np.where(crop_mask, crop - crop[crop_mask].mean(), 0.0)
    signal = crop.mean(axis=1 - axis)  # 沿另一個方向平均成 1 維訊號
    n = signal.size
    if n < min_lag * 3:
        return None
    spectrum = np.fft.rfft(signal, 2 * n)
    corr = np.fft.irfft(spectrum * np.conj(spectrum))[:n]
    if corr[0] <= 1e-12:
        return None
    corr = corr / corr[0]
    for lag in range(min_lag, n // 2):
        if corr[lag] > corr[lag - 1] and corr[lag] >= corr[lag + 1] and corr[lag] > 0.2:
            return float(lag)
    return None


def style_fingerprint(pixels, mask):
    """平均飽和度與明度對比（HSV 的 S 平均、V 標準差）。"""
    rgb = pixels[mask][:, :3].astype(np.float64)
    if rgb.size == 0:
        return {"saturation": 0.0, "contrast": 0.0}
    high, low = rgb.max(axis=1), rgb.min(axis=1)
    saturation = np.where(high > 1e-6, (high - low) / np.maximum(high, 1e-6), 0)
    return {"saturation": round(float(saturation.mean()), 3), "contrast": round(float(high.std()), 3)}


def compare_region(reference, render, mask, scale_m=None, meters_per_px=None):
    """一個材質區域的所有指標。scale_m 與 meters_per_px 都有時，才比較紋理比例。"""
    result = {
        "similarity": round(color_similarity(reference, mask, render, mask), 3),
        "detail_reference": round(detail_density(reference, mask), 4),
        "detail_render": round(detail_density(render, mask), 4),
        "style_reference": style_fingerprint(reference, mask),
        "style_render": style_fingerprint(render, mask),
    }
    base = result["detail_reference"]
    result["detail_ratio"] = round(result["detail_render"] / base, 2) if base > 1e-4 else None
    if scale_m and meters_per_px:
        period = dominant_period(render, mask, axis=0)
        result["period_render_m"] = round(period * meters_per_px, 3) if period else None
        result["scale_ratio"] = round(result["period_render_m"] / scale_m, 2) if period else None
    return result
