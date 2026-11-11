"""Palette atlas（純 Python + numpy）：把 plan 的所有不透明顏色畫在一張小貼圖上。

為什麼要這樣做：每種顏色一個材質時，一個用了 3 種顏色的燈就是 3 個 primitive（3 次 draw call）。
改成「所有不透明的面共用一個材質、用 UV 指到貼圖上自己的色格」，一個 Object 通常就只剩 1 個 primitive。

座標約定（容易弄錯，集中寫在這裡）：
- 這裡的像素陣列以「左上角」為原點，第 0 列是最上面一列（和一般圖片、glTF 一樣）
- Blender 的 UV 原點在左下角，所以色格 (col, row) 的 UV 是 ((col+0.5)/N, 1-(row+0.5)/N)
- Blender 圖片的 pixels 從最下面一列開始存，寫進 Blender 時要上下翻轉（由 build/appearance.py 處理）
"""

import numpy as np

GRID = 8  # 8×8 = 64 格
SIZES = {"atlas64": 64, "atlas256": 256}


def is_opaque(spec):
    return spec.get("alpha", 1.0) >= 1.0


def layout(specs):
    """不透明材質依 plan 順序配置到色格：{材質名稱: (col, row)}。玻璃不放進 atlas。"""
    opaque = [s for s in specs if is_opaque(s)]
    if len(opaque) > GRID * GRID:
        raise ValueError(f"不透明材質 {len(opaque)} 種，超過 atlas 的 {GRID * GRID} 格")
    return {spec["name"]: (index % GRID, index // GRID) for index, spec in enumerate(opaque)}


def cell_uv(col, row):
    """色格中心的 Blender UV。整個面的 loop 都放在這一點：面就是一個純色，不需要展 UV。"""
    return ((col + 0.5) / GRID, 1.0 - (row + 0.5) / GRID)


def hex_to_rgb(hex_value):
    value = hex_value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _paint(size, cells, values):
    """cells：{名稱: (col, row)}；values：{名稱: (r, g, b)}。回傳 (size, size, 4) 陣列，左上為原點。"""
    cell = size // GRID
    pixels = np.ones((size, size, 4), dtype=np.float32)
    for name, (col, row) in cells.items():
        r, g, b = values[name]
        pixels[row * cell:(row + 1) * cell, col * cell:(col + 1) * cell, :3] = (r, g, b)
    return pixels


def color_pixels(specs, size):
    """Base color 貼圖（sRGB）：色格填 hex 原色。"""
    cells = layout(specs)
    return _paint(size, cells, {s["name"]: hex_to_rgb(s["hex"]) for s in specs if s["name"] in cells})


def mr_pixels(specs, size):
    """metallicRoughness 貼圖（Non-Color）：glTF 規定 G = roughness、B = metallic，R 不使用（填 1）。

    少了這張，所有顏色合併成一個材質後，金屬路燈和粗糙的灰泥牆就會變成同樣的質感。
    """
    cells = layout(specs)
    return _paint(size, cells, {
        s["name"]: (1.0, s.get("roughness", 0.8), s.get("metallic", 0.0)) for s in specs if s["name"] in cells
    })
