"""福特 Econoline 露營車（low poly 遊戲資產）。

側視輪廓擠出成單一 building_shell；輪胎為獨立 decoration。
原點在 footprint 中心、底面貼地，正面朝 -Y。
"""

import math

from .. import shapes
from . import register
from .arcade import _ear_clip, _offset_polygon, _scale_profile

# 側視 (forward, z)，forward 0 = 車尾 (+Y)，負值朝車頭 (-Y)
# chibi：車身偏短、白頂偏高（forward 0＝車尾，負值＝車頭）
_VAN_SIDE_PROFILE = [
    (0.00, 0.00),
    (0.00, 1.05),
    (0.00, 2.18),
    (-0.72, 2.42),
    (-1.55, 2.48),
    (-2.45, 2.48),
    (-3.05, 2.45),
    (-3.48, 2.12),
    (-3.82, 1.58),
    (-4.02, 1.02),
    (-4.12, 0.42),
    (-4.10, 0.00),
]


def _edge_materials(profile, body, camper, chrome, black):
    """依輪廓高度分段指定材質。"""
    mats = []
    for i, (_, z) in enumerate(profile):
        if z >= 2.25:
            mats.append(camper)
        elif z >= 1.22 and i >= 6:
            mats.append(body)
        elif z < 0.25:
            mats.append(black)
        elif z < 0.55:
            mats.append(chrome)
        else:
            mats.append(body)
    return mats


def _van_shell(ctx, profile, half_w, depth, hd, body, camper, chrome, black):
    edge_mats = _edge_materials(profile, body, camper, chrome, black)
    inset = _offset_polygon(profile, 0.032 * (depth / 4.2))
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
        push((outer_l + i, outer_l + j, inner_l + j, inner_l + i), body)
        push((outer_r + i, inner_r + i, inner_r + j, outer_r + j), body)

    for a, b, c in _ear_clip(inset):
        push((inner_l + a, inner_l + c, inner_l + b), body)
        push((inner_r + a, inner_r + b, inner_r + c), body)

    for i in range(count):
        j = (i + 1) % count
        push((outer_l + i, outer_l + j, outer_r + j, outer_r + i), edge_mats[i])

    data.add(verts, faces, mats)
    return data


@register("econoline_camper")
def build_econoline_camper(ctx):
    depth = ctx.d * 0.98
    profile = _scale_profile(_VAN_SIDE_PROFILE, ctx.h * 0.97, depth)
    half_w = ctx.hw * 0.94
    body = ctx.mat("body_gold")
    camper = ctx.mat("camper_white")
    chrome = ctx.mat("chrome")
    black = ctx.mat("trim_black")
    return _van_shell(ctx, profile, half_w, depth, ctx.hd, body, camper, chrome, black)


@register("vehicle_wheel")
def build_vehicle_wheel(ctx):
    """鋼圈輪胎：軸向沿 X，底面貼在 z=0。半徑由 bounds 的 Y／Z 跨度決定（非輪胎厚度）。"""
    tire = ctx.mat("tire")
    hub = ctx.mat("chrome")
    r = min(ctx.hd, ctx.h * 0.5) * 0.96
    half = max(ctx.hw * 0.88, 0.07)
    segs = ctx.segments(0.75, 10)
    profile = [
        (0.0, -half),
        (r * 0.58, -half * 0.55),
        (r, -half * 0.2),
        (r, half * 0.2),
        (r * 0.58, half * 0.55),
        (0.0, half),
    ]
    data = shapes.lathe(profile, segs, [tire, tire, tire, tire, tire], axis="x")
    hub_r = r * 0.38
    hub_profile = [
        (0.0, -half * 0.35),
        (hub_r, -half * 0.18),
        (hub_r, half * 0.18),
        (0.0, half * 0.35),
    ]
    data.extend(shapes.lathe(hub_profile, max(8, segs // 2), hub, axis="x"))
    return data.translate(0, 0, r)


@register("vehicle_bumper")
def build_vehicle_bumper(ctx):
    chrome = ctx.material
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    depth = max(ctx.d * 0.88, 0.08)
    return shapes.box(-hw, -hd, 0.02, hw, -hd + depth, h, chrome)


@register("vehicle_grille")
def build_vehicle_grille(ctx):
    chrome = ctx.material
    black = ctx.mat("trim_black")
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    data = shapes.box(-hw * 0.96, -hd, 0.04, hw * 0.96, -hd + ctx.d * 0.12, h * 0.96, black)
    data.extend(shapes.box(-hw, -hd, 0.06, hw, hd * 0.22, h * 0.92, chrome))
    return data


@register("vehicle_headlight")
def build_vehicle_headlight(ctx):
    chrome = ctx.mat("chrome")
    glass = ctx.mat("glass")
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    data = shapes.box(-hw, -hd, h * 0.08, hw, hd, h * 0.92, chrome)
    data.extend(
        shapes.box(-hw * 0.72, -hd - 0.01, h * 0.22, hw * 0.72, -hd + hd * 0.35, h * 0.78, glass)
    )
    return data


@register("side_mirror")
def build_side_mirror(ctx):
    chrome = ctx.mat("chrome")
    glass = ctx.mat("glass")
    black = ctx.mat("trim_black")
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    data = shapes.box(-hw * 0.35, -hd, h * 0.05, hw * 0.35, hd, h * 0.95, black)
    data.extend(shapes.box(-hw * 0.85, -hd - 0.02, h * 0.52, hw * 0.85, hd + 0.02, h * 0.98, glass))
    data.extend(shapes.box(-hw, -hd * 0.5, h * 0.35, hw, hd * 0.5, h * 0.52, chrome))
    return data


@register("vehicle_antenna")
def build_vehicle_antenna(ctx):
    black = ctx.mat("trim_black")
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    data = shapes.box(-hw * 0.18, -hd * 0.18, 0.0, hw * 0.18, hd * 0.18, h * 0.92, black)
    data.extend(shapes.box(-hw * 0.32, -hd * 0.32, h * 0.9, hw * 0.32, hd * 0.32, h * 1.05, ctx.material))
    return data


@register("camper_side_window")
def build_camper_side_window(ctx):
    frame = ctx.material
    glass = ctx.mat("glass")
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    f = min(0.05, hw * 0.18)
    data = shapes.box(-hw, -hd, 0.0, hw, hd, h, frame)
    data.extend(shapes.box(-hw + f, -hd * 0.35, f, hw - f, hd * 0.35, h - f, glass))
    return data


@register("vehicle_windshield")
def build_vehicle_windshield(ctx):
    """前擋風玻璃（上緣高、下緣貼 hood，向車尾傾斜）。"""
    glass = ctx.material
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    y_back, y_front = hd * 0.55, -hd
    z_bot, z_top = h * 0.08, h * 0.96
    return shapes.single(
        [
            (-hw, y_back, z_bot),
            (-hw, y_front, z_top),
            (hw, y_front, z_top),
            (hw, y_back, z_bot),
        ],
        [(0, 1, 2, 3)],
        glass,
    )


@register("vehicle_side_glass")
def build_vehicle_side_glass(ctx):
    """側窗玻璃（法線朝 -X）。"""
    glass = ctx.material
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    x = -hw
    return shapes.single(
        [(x, -hd, 0.0), (x, hd, 0.0), (x, hd, h), (x, -hd, h)],
        [(0, 1, 2, 3)],
        glass,
    )


@register("vehicle_side_door")
def build_vehicle_side_door(ctx):
    """側滑門：門框 + 上窗玻璃 + 門把（貼在車側，薄片沿 X）。"""
    body = ctx.material
    glass = ctx.mat("glass")
    black = ctx.mat("trim_black")
    chrome = ctx.mat("chrome")
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    data = shapes.box(-hw, -hd, 0.0, hw, hd, h, body)
    win_z0 = h * 0.52
    data.extend(
        shapes.box(-hw * 0.92, -hd - 0.012, win_z0, hw * 0.92, hd + 0.012, h * 0.94, glass)
    )
    data.extend(shapes.box(-hw, -hd * 0.55, h * 0.48, hw, hd * 0.55, h * 0.52, black))
    data.extend(
        shapes.box(hw * 0.55, -hd * 0.35, h * 0.38, hw * 0.92, hd * 0.35, h * 0.48, chrome)
    )
    return data
