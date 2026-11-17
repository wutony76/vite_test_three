"""寶箱：中空的木箱身、金色包邊、往後打開的拱形箱蓋、鎖頭。

箱子裡的漢堡不在這裡做：由 Three.js 用既有的 burger.glb 堆出來（數量、位置之後好調）。
所以箱身是「中空、內底墊高」：漢堡放在墊高的內底上，才會滿到箱口以上。
"""

import math

from .. import shapes
from . import register


def _local(ctx, x, y, z):
    """資產座標 → 這個零件的局部座標（原點在零件 bounds 的底面中心）。"""
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    return (x - (x0 + x1) / 2, y - (y0 + y1) / 2, z - z0)


def _box(ctx, x0, y0, z0, x1, y1, z1, mat):
    a = _local(ctx, x0, y0, z0)
    b = _local(ctx, x1, y1, z1)
    return shapes.box(a[0], a[1], a[2], b[0], b[1], b[2], mat)


@register("chest_body")
def build_chest_body(ctx):
    """中空木箱：外牆 → 箱口那圈邊 → 往下到墊高的內底。一條 loft，是 1 個封閉的幾何島。

    四個環都是長方形（4 個點），loft 依序連起來：外底 → 外頂 → 內頂 → 內底，頭尾各補一個面。
    內牆和內底用深色：箱子裡面照不到光，深色才看得出「有深度」。
    """
    inner = ctx.param_mat("inner_material", ctx.material)
    wall = ctx.param("wall", 0.025)
    floor = ctx.param("floor_height", ctx.h * 0.6)
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    rings = [
        shapes.rect(hw, hd, 0.0),
        shapes.rect(hw, hd, h),
        shapes.rect(hw - wall, hd - wall, h),
        shapes.rect(hw - wall, hd - wall, floor),
    ]
    return shapes.loft(rings, [ctx.material, ctx.material, inner])


@register("chest_bands")
def build_chest_bands(ctx):
    """金色包邊：正面、背面各兩條直條，加上箱口上緣一圈（前、後、左、右四條）。

    包邊比箱身外牆多凸出一點（t），從外面看是「釘在箱子上的金屬條」，不會跟木頭表面打架閃爍。
    """
    t = 0.008
    sw = ctx.param("strap_width", 0.035) / 2
    # 箱身的外牆（資產座標）：bands 的 bounds 比箱身大一圈，往內縮回箱身
    bx, by, bh = ctx.hw - 0.01, ctx.hd - 0.01, ctx.h - 0.005
    data = shapes.MeshData()
    for sx in ctx.param("strap_x", [-0.16, 0.16]):
        data.extend(_box(ctx, sx - sw, -by - t, 0.0, sx + sw, -by + 0.002, bh, ctx.material))
        data.extend(_box(ctx, sx - sw, by - 0.002, 0.0, sx + sw, by + t, bh, ctx.material))
    rim = 0.025
    data.extend(_box(ctx, -bx - t, -by - t, bh - rim, bx + t, -by + 0.02, bh + 0.004, ctx.material))
    data.extend(_box(ctx, -bx - t, by - 0.02, bh - rim, bx + t, by + t, bh + 0.004, ctx.material))
    # 左右兩條比前後兩條往內縮 1 mm：角落若剛好重疊在同一點，會變成「位置相同卻沒合併」的重複頂點（拓撲驗證會擋）
    data.extend(_box(ctx, -bx - t + 0.001, -by + 0.021, bh - rim, -bx + 0.02, by - 0.021, bh + 0.003, ctx.material))
    data.extend(_box(ctx, bx - 0.02, -by + 0.021, bh - rim, bx + t - 0.001, by - 0.021, bh + 0.003, ctx.material))
    return data


@register("chest_lid")
def build_chest_lid(ctx):
    """拱形箱蓋（打開的）。

    先在「蓋著」的姿勢做：沿 X 軸 loft 一串半橢圓切面（拱頂 + 平底），兩條金色包邊的位置
    切面略放大，看起來是凸起的金屬拱條；整個箱蓋仍是 1 個封閉島。
    再繞背面上緣的鉸鍊往後轉 open_degrees，最後換成這個零件的局部座標。
    """
    band = ctx.param_mat("band_material", ctx.material)
    hinge_y, hinge_z = ctx.param("hinge", [0.17, 0.22])
    depth = ctx.param("depth", 0.34)
    dome = ctx.param("dome", 0.1)
    open_rad = -math.radians(ctx.param("open_degrees", 110))
    sw = ctx.param("strap_width", 0.035) / 2
    hw = ctx.hw - 0.005
    arc = 14

    def section(scale):
        """一個切面（鉸鍊在 y=0、z=0；前緣在 y=-depth）。scale > 1 = 金屬拱條，往外凸一點"""
        cy = -depth / 2
        pts = []
        for k in range(arc + 1):
            a = math.pi * k / arc  # 從前緣（0）沿拱頂到後緣（π）
            y = cy - math.cos(a) * depth / 2
            z = math.sin(a) * dome
            # 拱條（scale > 1）連底邊也往外移一點（z 往下 lip）：
            # 平底是一條直線，拱條和箱蓋的底邊若都在 z=0，兩圈之間的台階面會是面積 0 的退化面
            lip = 0.004 if scale > 1.0 else 0.0
            pts.append((cy + (y - cy) * scale, z * scale - lip))
        return pts  # 底邊（後緣 → 前緣）由 loft 的端點自然接起來

    def ring(x, scale):
        out = []
        c, s = math.cos(open_rad), math.sin(open_rad)
        for y, z in section(scale):
            yy, zz = y * c - z * s, y * s + z * c
            out.append(_local(ctx, x, hinge_y + yy, hinge_z + zz))
        return out

    raise_scale = 1.06
    xs, mats = [(-hw, 1.0)], []
    for sx in ctx.param("strap_x", [-0.16, 0.16]):
        xs += [(sx - sw, 1.0), (sx - sw, raise_scale), (sx + sw, raise_scale), (sx + sw, 1.0)]
    xs.append((hw, 1.0))
    rings = [ring(x, sc) for x, sc in xs]
    for (xa, sa), (xb, sb) in zip(xs, xs[1:]):
        mats.append(band if (sa > 1.0 or sb > 1.0) else ctx.material)
    return shapes.loft(rings, mats)


@register("chest_lock")
def build_chest_lock(ctx):
    """正面上緣的金色鎖頭（一塊板）＋深色鑰匙孔（往前凸一點的小方塊）。"""
    keyhole = ctx.param_mat("keyhole_material", ctx.material)
    data = _box(ctx, -0.03, -0.188, 0.135, 0.03, -0.17, 0.212, ctx.material)
    data.extend(_box(ctx, -0.007, -0.193, 0.15, 0.007, -0.186, 0.182, keyhole))
    return data
