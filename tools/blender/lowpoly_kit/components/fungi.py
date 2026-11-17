"""菇類：香菇（shiitake）的菇傘、十字花刀、菇柄。

菇傘和菇柄分成兩個零件（兩個節點），Three.js 端才能分別調「菇傘大小」和「菇柄高低」；
十字花刀掛在菇傘底下（plan 的 parent），菇傘縮放時花刀跟著一起縮放、不會脫離表面。
"""

import math

from .. import shapes
from . import register

# 菇傘剖面（正規化）：(半徑 ÷ 菇傘半徑, 高度 ÷ 菇傘高度)，從底面中心一路畫到頂端
#   0～2：底面菌褶（中間高、往外斜下，跟真的香菇一樣）
#   3～4：邊緣往內捲的那一圈
#   5～10：外側圓頂
_CAP_PROFILE = [
    (0.0, 0.22),
    (0.233, 0.22),
    (0.667, 0.15),
    (0.833, 0.08),
    (0.90, 0.0),
    (0.983, 0.16),
    (1.0, 0.38),
    (0.94, 0.66),     # 香菇的傘頂比蘑菇平：肩膀比較寬、頂端比較平
    (0.80, 0.86),
    (0.52, 0.97),
    (0.0, 1.0),
]
_DOME_START = 6  # 從這一點開始是外側圓頂（十字花刀要貼在這段上）


def _dome_height(rn):
    """圓頂上半徑比例 rn（0～1）處的高度比例：沿剖面的圓頂段線性內插。"""
    dome = _CAP_PROFILE[_DOME_START:]
    for (r0, z0), (r1, z1) in zip(dome, dome[1:]):
        if r1 <= rn <= r0:
            t = (rn - r0) / (r1 - r0) if r1 != r0 else 0.0
            return z0 + (z1 - z0) * t
    return dome[0][1] if rn > dome[0][0] else dome[-1][1]


@register("mushroom_cap")
def build_mushroom_cap(ctx):
    """饅頭形菇傘：一個旋轉體（1 個封閉島）。底面菌褶、捲邊、圓頂各用不同材質。"""
    gills = ctx.param_mat("gills_material", ctx.material)
    rim = ctx.param_mat("rim_material", ctx.material)
    radius, height = min(ctx.hw, ctx.hd), ctx.h
    profile = [(rn * radius, zn * height) for rn, zn in _CAP_PROFILE]
    # 每段（相鄰兩個剖面點之間）一個材質：前 3 段菌褶、接著 2 段捲邊、其餘是傘面
    mats = [gills, gills, gills, rim, rim] + [ctx.material] * (len(profile) - 6)
    return shapes.lathe(profile, max(24, ctx.segments(2.4)), mats)


@register("mushroom_stem")
def build_mushroom_stem(ctx):
    """短粗的菇柄：底部略寬、切口平；上端會插進菇傘底面（所以頂端看不到）。"""
    r = min(ctx.hw, ctx.hd) * 0.9
    h = ctx.h
    profile = [(0.0, 0.0), (r * 1.08, 0.0), (r * 1.1, h * 0.08), (r * 1.0, h * 0.45), (r * 0.94, h), (0.0, h)]
    return shapes.lathe(profile, max(16, ctx.segments(1.4)), ctx.material)


@register("mushroom_cross")
def build_mushroom_cross(ctx):
    """十字花刀：4 片葉形（兩端尖、中間寬）的薄片，沿著圓頂曲面彎，露出米白色的菇肉。

    每片是一條 loft：沿長度方向取多個切面，每個切面是「上緣 5 點 + 下緣 3 點」的扁平剖面，
    上緣比圓頂高一點點（看得到）、下緣埋進圓頂裡（不會從側面看到縫）。
    需要 params.cap_bounds（菇傘的 bounds）才能算出圓頂高度；本身的座標以自己的 bounds 為原點。
    """
    (cx0, cy0, cz0), (cx1, cy1, cz1) = ctx.param("cap_bounds")
    cap_r = min(cx1 - cx0, cy1 - cy0) / 2
    cap_h = cz1 - cz0
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    ox, oy = (x0 + x1) / 2 - (cx0 + cx1) / 2, (y0 + y1) / 2 - (cy0 + cy1) / 2
    length = min(ctx.hw, ctx.hd)          # 每片從中心往外的長度
    width = length * 0.17                 # 葉片最寬處的半寬（參考圖的花刀細長）
    lift, bury = cap_h * 0.012, cap_h * 0.05

    def surface(px, py, dz):
        rn = math.hypot(px, py) / cap_r
        z = cz0 + _dome_height(min(rn, 1.0)) * cap_h + dz
        return (px - ox, py - oy, z - z0)

    data = shapes.MeshData()
    steps = 9
    for arm in range(4):
        a = math.pi / 4 + arm * math.pi / 2         # 斜 45° 的 X 形，和參考圖一樣
        ux, uy = math.cos(a), math.sin(a)
        vx, vy = -uy, ux
        rings = []
        for k in range(steps + 1):
            u = 0.03 + 0.93 * k / steps                # 兩端留一點：寬度 0 會產生退化面
            w = width * math.sin(math.pi * u) ** 0.8  # 葉形：兩端尖、中間寬
            cxp, cyp = ux * u * length, uy * u * length
            ring = [surface(cxp + vx * w * v, cyp + vy * w * v, lift) for v in (-1.0, -0.5, 0.0, 0.5, 1.0)]
            ring += [surface(cxp + vx * w * v, cyp + vy * w * v, -bury) for v in (1.0, 0.0, -1.0)]
            rings.append(ring)
        data.extend(shapes.loft(rings, ctx.material))
    return data
