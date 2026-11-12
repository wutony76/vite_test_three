"""可無縫平鋪（tileable）的雜訊。

一般的雜訊貼到牆上，每張貼圖的接縫都會看到一條線。無縫的做法是讓雜訊「週期性」：
格點（lattice）的亂數表在邊界繞回來（第 period 格 = 第 0 格），左邊緣和右邊緣就會接得起來。

所有函式的輸出：float32 陣列 (size, size)，值大致在 0～1；同一個 seed 每次結果都一樣。
"""

import numpy as np


def rng(seed):
    """固定種子的亂數產生器。PCG64 在不同平台、不同 numpy 版本產生的序列相同。"""
    return np.random.Generator(np.random.PCG64(int(seed) & 0xFFFFFFFFFFFF))


def _smooth(t):
    # smootherstep：在格點處一階、二階導數都是 0，雜訊看不出格子
    return t * t * t * (t * (t * 6 - 15) + 10)


def value_noise(size, period, seed, stretch=(1, 1)):
    """週期性 value noise。period：一張圖裡有幾個格子（整數才能無縫）。

    stretch=(sx, sy)：x、y 方向的格子數倍率。木紋要「沿 u 方向拉長」，就讓 u 的格子少、v 的格子多。
    """
    px, py = max(1, int(round(period * stretch[0]))), max(1, int(round(period * stretch[1])))
    table = rng(seed).random((py, px), dtype=np.float32)
    x = np.arange(size, dtype=np.float32) * px / size
    y = np.arange(size, dtype=np.float32) * py / size
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = _smooth(x - x0), _smooth(y - y0)
    x1, y1 = (x0 + 1) % px, (y0 + 1) % py  # 繞回第 0 格：無縫的關鍵
    x0, y0 = x0 % px, y0 % py
    a = table[np.ix_(y0, x0)]
    b = table[np.ix_(y0, x1)]
    c = table[np.ix_(y1, x0)]
    d = table[np.ix_(y1, x1)]
    fx, fy = fx[None, :], fy[:, None]
    top = a + (b - a) * fx
    bottom = c + (d - c) * fx
    return (top + (bottom - top) * fy).astype(np.float32)


def fbm(size, period, seed, octaves=4, gain=0.5, stretch=(1, 1)):
    """分形布朗運動：好幾層雜訊疊加，每層格子加倍、強度減半。

    只有一層的話表面像「大塊斑點」；疊上細層才有手繪顏料的層次。結果正規化到 0～1。
    """
    total = np.zeros((size, size), dtype=np.float32)
    amplitude, weight = 1.0, 0.0
    for octave in range(octaves):
        total += amplitude * value_noise(size, period * 2 ** octave, seed + octave * 7919, stretch)
        weight += amplitude
        amplitude *= gain
    total /= weight
    low, high = float(total.min()), float(total.max())
    return (total - low) / (high - low + 1e-6)


def voronoi(size, cells, seed, jitter=0.85, stretch=(1, 1)):
    """週期性 Voronoi（細胞雜訊）：石塊、葉片、玉米粒的基礎。

    每個格子放一個隨機點；每個像素找最近（f1）與第二近（f2）的點。
    - f2 - f1 很小 → 在兩個細胞的交界：石縫、葉片邊緣
    - cell_id → 每個細胞自己的亂數：每塊石頭顏色略有不同
    在 3×3 個鄰居格子裡找就夠了（點不會跑出自己的格子）；鄰居格子索引取餘數 → 無縫。
    """
    cx, cy = max(1, int(round(cells * stretch[0]))), max(1, int(round(cells * stretch[1])))
    generator = rng(seed)
    points = generator.random((cy, cx, 2), dtype=np.float32) * jitter + (1 - jitter) / 2
    ids = generator.permutation(cx * cy).reshape(cy, cx).astype(np.float32) / (cx * cy)

    gx = (np.arange(size, dtype=np.float32) + 0.5) * cx / size
    gy = (np.arange(size, dtype=np.float32) + 0.5) * cy / size
    ix, iy = np.floor(gx).astype(int), np.floor(gy).astype(int)
    f1 = np.full((size, size), np.inf, dtype=np.float32)
    f2 = np.full((size, size), np.inf, dtype=np.float32)
    owner = np.zeros((size, size), dtype=np.float32)
    center_x = np.zeros((size, size), dtype=np.float32)
    center_y = np.zeros((size, size), dtype=np.float32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            nx, ny = ix + dx, iy + dy
            wx, wy = nx % cx, ny % cy
            px = nx[None, :] + points[wy[:, None], wx[None, :], 0]
            py = ny[:, None] + points[wy[:, None], wx[None, :], 1]
            dist = np.sqrt((px - gx[None, :]) ** 2 + (py - gy[:, None]) ** 2)
            closer = dist < f1
            f2 = np.where(closer, f1, np.minimum(f2, dist))
            f1 = np.where(closer, dist, f1)
            owner = np.where(closer, ids[wy[:, None], wx[None, :]], owner)
            center_x = np.where(closer, px - gx[None, :], center_x)
            center_y = np.where(closer, py - gy[:, None], center_y)
    return {"f1": f1, "f2": f2, "edge": f2 - f1, "id": owner, "dx": center_x, "dy": center_y}


def blur(field, radius):
    """週期性的方框模糊（np.roll 繞回邊界），做兩次接近高斯。用來算凹處（cavity）。"""
    if radius < 1:
        return field
    out = field.astype(np.float32)
    for _ in range(2):
        for axis in (0, 1):
            acc = np.zeros_like(out)
            for offset in range(-radius, radius + 1):
                acc += np.roll(out, offset, axis=axis)
            out = acc / (2 * radius + 1)
    return out


def gradient(field):
    """週期性中央差分：回傳 (d/dx, d/dy)，單位是「每像素」。y 向下（圖片列的方向）。"""
    gx = (np.roll(field, -1, axis=1) - np.roll(field, 1, axis=1)) * 0.5
    gy = (np.roll(field, -1, axis=0) - np.roll(field, 1, axis=0)) * 0.5
    return gx, gy
