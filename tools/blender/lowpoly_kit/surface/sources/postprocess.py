"""外部圖片（圖庫、AI 生成、手繪）進入 pipeline 前的整理（純 numpy）。

外部圖片常見的問題，和對應的處理：
- 不能平鋪（邊緣接不起來）→ make_seamless
- 寫實照片的顏色、光影和手繪資產不搭 → palette_lock：把明暗映射到材質的三色色票，再分階
- 尺寸不是 2 的次方、不是要的大小 → resize（GPU 產生 mipmap 需要 2 的次方才最有效率）
- 沒有法線、粗糙度 → height_from_luminance + 常數 ORM
"""

import numpy as np

from ..painter import noise
from ..painter.stylize import _map_palette, height_to_normal, soft_posterize


def resize(image, size, wrap=True):
    """雙線性縮放到 size × size。wrap=True 時取樣在邊界繞回（平鋪貼圖縮放後仍然無縫）。"""
    height, width = image.shape[:2]
    if (height, width) == (size, size):
        return image.astype(np.float32)
    ys = (np.arange(size, dtype=np.float32) + 0.5) * height / size - 0.5
    xs = (np.arange(size, dtype=np.float32) + 0.5) * width / size - 0.5
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    fy, fx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    if wrap:
        y1, x1, y0, x0 = (y0 + 1) % height, (x0 + 1) % width, y0 % height, x0 % width
    else:
        y1, x1 = np.clip(y0 + 1, 0, height - 1), np.clip(x0 + 1, 0, width - 1)
        y0, x0 = np.clip(y0, 0, height - 1), np.clip(x0, 0, width - 1)
    a, b = image[y0][:, x0], image[y0][:, x1]
    c, d = image[y1][:, x0], image[y1][:, x1]
    return ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy).astype(np.float32)


def make_seamless(image, blend=0.25):
    """把一般圖片變成可平鋪：和「平移半張的自己」混合。

    平移半張（np.roll）之後，原本的邊界跑到圖片中央，而新的邊界是原圖的中央（本來就連續）。
    所以：靠近邊界用平移版（邊界連續）、靠近中央用原圖（避開平移版在中央的接縫），中間平滑過渡。
    """
    size_y, size_x = image.shape[:2]
    rolled = np.roll(np.roll(image, size_y // 2, axis=0), size_x // 2, axis=1)
    wy = np.clip(np.minimum(np.arange(size_y), size_y - 1 - np.arange(size_y)) / (size_y * blend), 0, 1)
    wx = np.clip(np.minimum(np.arange(size_x), size_x - 1 - np.arange(size_x)) / (size_x * blend), 0, 1)
    weight = np.minimum(wy[:, None], wx[None, :])[..., None]
    return (image * weight + rolled * (1 - weight)).astype(np.float32)


def luminance(image):
    rgb = image[:, :, :3]
    return (0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]).astype(np.float32)


def palette_lock(image, palette, strength=0.7):
    """依亮度把圖片重新上色到 [陰影, 基底, 高光] 色票，再和原圖按 strength 混合。

    亮度先用 2%～98% 百分位拉到 0～1：照片常常整張偏暗或偏亮，直接映射會全部落在陰影色。
    strength = 1 完全換成色票（最統一）；0 保留原圖（例如人工手繪、已經是正確色調的圖）。
    """
    lum = luminance(image)
    low, high = np.percentile(lum, 2), np.percentile(lum, 98)
    value = np.clip((lum - low) / max(high - low, 1e-4), 0, 1)
    value = 0.2 + 0.7 * soft_posterize(value)  # 留出最深與最亮的空間，給磨損與髒污
    painted = _map_palette(value, palette)
    rgb = image[:, :, :3] * (1 - strength) + painted * strength
    alpha = image[:, :, 3:4] if image.shape[2] == 4 else np.ones(image.shape[:2] + (1,), np.float32)
    return np.concatenate([np.clip(rgb, 0, 1), alpha], axis=2).astype(np.float32)


def height_from_luminance(image, blur_radius=1):
    """沒有高度圖時，用亮度近似（暗 = 凹）。先輕微模糊，避免雜訊變成滿滿的小凸點。"""
    return noise.blur(luminance(image), blur_radius)


def derived_maps(base, spec):
    """只有 base color 時，補上 ORM（常數粗糙度 + 由亮度推的小尺度 AO）與 normal。"""
    size = base.shape[0]
    height = height_from_luminance(base)
    ones = np.ones((size, size), np.float32)
    occlusion = 0.75 + 0.25 * np.clip(height / max(float(height.mean()), 1e-4), 0, 1)
    orm = np.stack([occlusion, ones * spec["roughness"], ones * spec["metallic"], ones], axis=2)
    normal = np.concatenate([height_to_normal(height, spec["normal_strength"] * 0.6), ones[..., None]], axis=2)
    return {"orm": orm.astype(np.float32), "normal": normal.astype(np.float32)}


def prepare_external(base, spec, seamless=True, lock=0.7):
    """外部 base color → 完整的三張圖。"""
    image = resize(base if base.shape[2] == 4 else np.concatenate(
        [base[:, :, :3], np.ones(base.shape[:2] + (1,), np.float32)], axis=2), spec["size"], wrap=seamless)
    if seamless and spec["tileable"]:
        image = make_seamless(image)
    if lock > 0:
        image = palette_lock(image, spec["palette"], lock)
    return {"base": image, **derived_maps(image, spec)}
