"""街機／遊戲機台（kitbash 貼紙風格）。

主體用側視輪廓擠出成單一 building_shell；側面模組與操控台為 decoration 島。
座標：原點在 footprint 中心地面，正面朝 -Y。
"""

import math

from .. import shapes
from . import register

# 側視輪廓 (forward_depth, z)，0 為背面，負值往玩家（-Y）
_SHELL_PROFILE = [
    (0.00, 0.00),
    (0.00, 1.52),
    (-0.06, 1.68),
    (-0.38, 1.78),
    (-0.48, 1.74),
    (-0.48, 1.08),
    (-0.72, 1.02),
    (-0.78, 0.88),
    (-0.52, 0.82),
    (-0.50, 0.10),
    (-0.44, 0.00),
]

_EDGE_MATERIAL = {
    0: "black",
    1: "teal",
    2: "teal",
    3: "orange",
    4: "teal",
    5: "teal",
    6: "white",
    7: "white",
    8: "teal",
    9: "teal",
    10: "black",
}


def _area(poly):
    total = 0.0
    for i, (y, z) in enumerate(poly):
        y2, z2 = poly[(i + 1) % len(poly)]
        total += y * z2 - y2 * z
    return total * 0.5


def _offset_polygon(poly, dist):
    sign = 1.0 if _area(poly) > 0 else -1.0
    count = len(poly)
    lines = []
    for i in range(count):
        y1, z1 = poly[i]
        y2, z2 = poly[(i + 1) % count]
        dy, dz = y2 - y1, z2 - z1
        length = math.hypot(dy, dz)
        if length < 1e-8:
            raise ValueError("輪廓有零長度邊")
        inward_y = sign * (-dz / length)
        inward_z = sign * (dy / length)
        lines.append((y1 + inward_y * dist, z1 + inward_z * dist, dy, dz))
    shrunk = []
    for i in range(count):
        y1, z1, dy1, dz1 = lines[(i - 1) % count]
        y2, z2, dy2, dz2 = lines[i]
        det = dy1 * dz2 - dz1 * dy2
        if abs(det) < 1e-10:
            shrunk.append((y2, z2))
        else:
            t = ((y2 - y1) * dz2 - (z2 - z1) * dy2) / det
            shrunk.append((y1 + t * dy1, z1 + t * dz1))
    return shrunk


def _ear_clip(poly):
    count = len(poly)
    if count < 3:
        raise ValueError("多邊形少於 3 點")
    order = list(range(count))
    if _area(poly) < 0:
        order.reverse()

    def point(slot):
        return poly[order[slot]]

    def is_convex(i, j, k):
        ay, az = point(i)
        by, bz = point(j)
        cy, cz = point(k)
        return (by - ay) * (cz - az) - (bz - az) * (cy - ay) > 1e-12

    triangles = []
    guard = 0
    while len(order) > 3 and guard < 1000:
        guard += 1
        slots = len(order)
        clipped = False
        for i in range(slots):
            prev = (i - 1) % slots
            nxt = (i + 1) % slots
            if not is_convex(prev, i, nxt):
                continue
            triangles.append((order[prev], order[i], order[nxt]))
            del order[i]
            clipped = True
            break
        if not clipped:
            raise ValueError("耳切失敗")
    if len(order) != 3:
        raise ValueError("耳切沒有切完")
    triangles.append((order[0], order[1], order[2]))
    return triangles


def _extrude_profile(profile, half_w, depth, hd, teal_mat, orange_mat):
    """輪廓擠成 ±X 的封閉殼；背面貼齊 +hd，正面朝 -Y。"""
    inset = _offset_polygon(profile, 0.028 * (depth / 0.72))
    count = len(profile)
    data = shapes.MeshData()
    verts = []

    def y_pos(forward):
        return hd - forward

    def add_loop(loop, x):
        start = len(verts)
        verts.extend((x, y_pos(fy), z) for fy, z in loop)
        return start

    outer_l = add_loop(profile, -half_w)
    inner_l = add_loop(inset, -half_w)
    outer_r = add_loop(profile, half_w)
    inner_r = add_loop(inset, half_w)

    faces = []
    mats = []

    def push(face, mat):
        faces.append(tuple(face))
        mats.append(mat)

    for i in range(count):
        j = (i + 1) % count
        push((outer_l + i, outer_l + j, inner_l + j, inner_l + i), orange_mat)
        push((outer_r + i, inner_r + i, inner_r + j, outer_r + j), orange_mat)

    for a, b, c in _ear_clip(inset):
        push((inner_l + a, inner_l + c, inner_l + b), teal_mat)
        push((inner_r + a, inner_r + b, inner_r + c), teal_mat)

    for i in range(count):
        j = (i + 1) % count
        edge_mat = _EDGE_MATERIAL.get(i, teal_mat)
        push((outer_l + i, outer_l + j, outer_r + j, outer_r + i), edge_mat)

    data.add(verts, faces, mats)
    return data


def _scale_profile(profile, target_h, target_depth):
    z0 = min(z for _, z in profile)
    z1 = max(z for _, z in profile)
    y_min = min(y for y, _ in profile)
    y_max = max(y for y, _ in profile)
    sz = target_h / max(z1 - z0, 1e-6)
    sy = target_depth / max(y_max - y_min, 1e-6)
    return [(-y * sy, (z - z0) * sz) for y, z in profile]


@register("arcade_cabinet")
def build_arcade_cabinet(ctx):
    depth = ctx.d * 0.94
    profile = _scale_profile(_SHELL_PROFILE, ctx.h * 0.98, depth)
    half_w = ctx.hw * 0.96
    data = _extrude_profile(profile, half_w, depth, ctx.hd, ctx.mat("teal"), ctx.mat("orange"))
    return data


@register("arcade_controls")
def build_arcade_controls(ctx):
    """白色操控台 + 雙搖桿 + 中央圓鈕。"""
    frame = ctx.mat("white")
    red = ctx.mat("red")
    blue = ctx.mat("blue")
    black = ctx.mat("black")
    data = shapes.MeshData()
    # 台面板
    data.extend(shapes.box(-ctx.hw, -ctx.hd, 0.0, ctx.hw, ctx.hd, ctx.h * 0.12, frame))
    stick_r = min(ctx.w, ctx.d) * 0.11
    stick_h = min(ctx.h * 0.72, ctx.h * 0.78)
    for side in (-1, 1):
        cx = side * ctx.w * 0.28
        profile = [
            (0.0, 0.0),
            (stick_r, 0.0),
            (stick_r * 0.85, stick_h * 0.4),
            (stick_r * 0.35, stick_h * 0.92),
            (0.0, stick_h),
        ]
        data.extend(
            shapes.lathe(profile, ctx.segments(1.2), red, axis="z", center=(cx, ctx.hd * 0.35, ctx.h * 0.32))
        )
        data.extend(shapes.box(cx - stick_r * 0.5, -ctx.hd * 0.4, 0.0, cx + stick_r * 0.5, ctx.hd * 0.2, ctx.h * 0.12, black))
    dial_r = min(ctx.w, ctx.d) * 0.14
    data.extend(
        shapes.lathe(
            [(0.0, 0.0), (dial_r, 0.0), (dial_r * 0.9, ctx.h * 0.10), (0.0, ctx.h * 0.12)],
            ctx.segments(1.0),
            blue,
            axis="z",
            center=(0.0, ctx.hd * 0.15, ctx.h * 0.38),
        )
    )
    return data


@register("arcade_kitbash")
def build_arcade_kitbash(ctx):
    """左側 kitbash 模組：相機、圓盤、堆疊面板。"""
    orange = ctx.mat("orange")
    white = ctx.mat("white")
    teal = ctx.mat("teal")
    black = ctx.mat("black")
    grey = ctx.mat("grey")
    red = ctx.mat("red")
    data = shapes.MeshData()
    x_out = ctx.hw * 0.95
    thick = ctx.d * 0.14

    def slab(x0, x1, y0, y1, z0, z1, mat):
        data.extend(shapes.box(x0, y0, z0, x1, y1, z1, mat))

    # 頂部橘色相機
    z_cam = ctx.h * 0.82
    slab(x_out * 0.55, x_out, -ctx.hd * 0.35, ctx.hd * 0.15, z_cam, z_cam + ctx.h * 0.12, orange)
    lens_r = ctx.w * 0.06
    data.extend(
        shapes.lathe(
            [(0.0, 0.0), (lens_r, 0.0), (lens_r * 0.85, ctx.h * 0.05), (0.0, ctx.h * 0.06)],
            ctx.segments(1.0),
            black,
            axis="y",
            center=(x_out * 0.72, -ctx.hd * 0.62, z_cam + ctx.h * 0.055),
        )
    )

    # 白色大圓盤
    z_disc = ctx.h * 0.52
    disc_r = ctx.w * 0.22
    data.extend(
        shapes.lathe(
            [(disc_r, -thick / 2), (disc_r * 0.35, -thick / 2), (disc_r * 0.35, thick / 2), (disc_r, thick / 2)],
            ctx.segments(1.2),
            white,
            axis="x",
            center=(x_out * 0.72, 0.0, z_disc),
        )
    )
    data.extend(shapes.box(x_out * 0.55, -disc_r, z_disc - disc_r * 0.35, x_out, disc_r, z_disc + disc_r * 0.35, black))

    # 中段灰面板 + 小搖桿
    z_panel = ctx.h * 0.32
    slab(x_out * 0.5, x_out, -ctx.hd * 0.25, ctx.hd * 0.3, z_panel, z_panel + ctx.h * 0.16, grey)
    data.extend(
        shapes.lathe(
            [(0.0, 0.0), (ctx.w * 0.04, 0.0), (ctx.w * 0.035, ctx.h * 0.08), (0.0, ctx.h * 0.09)],
            8,
            red,
            axis="z",
            center=(x_out * 0.72, ctx.hd * 0.05, z_panel + ctx.h * 0.09),
        )
    )

    # 底部模組堆疊
    z_base = ctx.h * 0.06
    slab(x_out * 0.45, x_out, -ctx.hd * 0.4, ctx.hd * 0.45, 0.0, z_base + ctx.h * 0.34, teal)
    slab(x_out * 0.52, x_out * 0.85, -ctx.hd * 0.12, ctx.hd * 0.28, z_base + ctx.h * 0.18, z_base + ctx.h * 0.30, orange)
    return data
