"""裝飾零件（profile = decoration）：招牌、海報、燈具、黑板、貓、花槽、盆栽、藤蔓。

decoration 允許多個幾何島（Phase 4 會限制在 8 個以內），但每個島本身仍是封閉的，
而且盡量用一個旋轉體做完整個零件：路燈的底座、燈柱、燈籠、頂蓋就是同一個 lathe。
"""

import math

from .. import shapes
from . import register


@register("sign_disc")
def build_sign_disc(ctx):
    """圓形招牌：沿 y 軸旋轉的圓盤。tertiary_density ≥ 0.5 時正面中間略凹，留出一圈外框。"""
    radius = min(ctx.hw, ctx.h / 2)
    front, back = -ctx.hd, ctx.hd
    profile = [(0.0, back), (radius, back), (radius, front)]
    if ctx.density("tertiary") >= 0.5:
        rim = min(0.03, radius * 0.15)
        recess = min(0.012, ctx.d * 0.4)
        profile += [(radius - rim, front), (radius - rim, front + recess), (0.0, front + recess)]
    else:
        profile += [(0.0, front)]
    return shapes.lathe(profile, ctx.segments(2.0), ctx.material, axis="y", center=(0.0, 0.0, ctx.h / 2))


@register("poster")
def build_poster(ctx):
    """櫥窗內的海報：幾張薄卡片，數量隨 tertiary_density，顏色輪流使用 accent_materials。"""
    accents = [ctx.mat(m) for m in ctx.param("accent_materials", [ctx.material])]
    count = min(6, ctx.count(3, 6))
    data = shapes.MeshData()
    cols = 2
    rows = math.ceil(count / cols)
    cell_w, cell_h = ctx.w / cols, ctx.h / rows
    for k in range(count):
        c, r = k % cols, k // cols
        cw = cell_w * ctx.rng.uniform(0.6, 0.85)
        ch = cell_h * ctx.rng.uniform(0.55, 0.8)
        cx = -ctx.hw + (c + 0.5) * cell_w + ctx.rng.uniform(-0.05, 0.05) * cell_w
        cz = (r + 0.5) * cell_h
        y0 = -ctx.hd + ctx.rng.uniform(0.0, ctx.d * 0.5)
        data.extend(shapes.box(cx - cw / 2, y0, cz - ch / 2, cx + cw / 2, y0 + min(0.01, ctx.d * 0.3), cz + ch / 2,
                               accents[k % len(accents)]))
    return data


def _lantern_profile(radius, height):
    """燈籠的 (半徑, 高度) 輪廓與每段材質：底座 → 發光燈罩 → 外擴的頂蓋 → 尖頂。"""
    profile = [
        (0.0, 0.0), (0.4 * radius, 0.0), (0.4 * radius, 0.06 * height), (0.8 * radius, 0.16 * height),
        (0.95 * radius, 0.62 * height), (radius, 0.66 * height), (0.45 * radius, 0.9 * height), (0.0, height),
    ]
    roles = ["frame", "frame", "frame", "glow", "frame", "frame", "frame"]
    return profile, roles


@register("wall_lamp")
def build_wall_lamp(ctx):
    """壁燈：牆上的固定板 + L 形支架（sweep）+ 燈籠（lathe，燈罩那段發光）。"""
    frame_mat, glow_mat = ctx.material, ctx.param_mat("glow_material")
    radius = min(ctx.hw * 0.85, ctx.hd * 0.95)
    height = min(0.5, ctx.h * 0.45)
    lamp_y = -ctx.hd + radius
    lamp_z0 = ctx.h - height - 0.02
    arm_z = lamp_z0 - 0.08
    wall_y = ctx.hd

    # 牆上的支架是一條往下延伸的長條（原圖的壁燈支架幾乎拉到燈具框的底部）
    data = shapes.box(-0.04, wall_y - 0.025, ctx.h * 0.04, 0.04, wall_y, arm_z + 0.08, frame_mat)
    path = [(0.0, wall_y - 0.02, arm_z), (0.0, lamp_y + 0.06, arm_z), (0.0, lamp_y, arm_z + 0.05),
            (0.0, lamp_y, lamp_z0 + 0.02)]
    data.extend(shapes.sweep(path, 0.016, 6, frame_mat))
    profile, roles = _lantern_profile(radius, height)
    mats = [glow_mat if role == "glow" else frame_mat for role in roles]
    data.extend(shapes.lathe(profile, ctx.segments(0.75), mats, center=(0.0, lamp_y, lamp_z0)))
    return data


@register("wall_light")
def build_wall_light(ctx):
    """牆上的小圓燈：沿 y 軸的半球，底座一圈是燈座材質，球面發光。"""
    radius = min(ctx.hw, ctx.h / 2)
    depth = min(ctx.d * 0.85, radius * 0.9)
    base_mat = ctx.param_mat("base_material")
    profile = [(radius, 0.0), (radius, -0.2 * depth), (0.8 * radius, -0.45 * depth),
               (0.45 * radius, -0.85 * depth), (0.0, -depth)]
    mats = [base_mat, ctx.material, ctx.material, ctx.material]
    return shapes.lathe(profile, ctx.segments(1.0), mats, axis="y", center=(0.0, ctx.hd, ctx.h / 2))


@register("street_lamp")
def build_street_lamp(ctx):
    """路燈：底座、燈柱、燈籠、頂蓋全部在同一個 lathe 上，整支是 1 個封閉幾何島。"""
    r = min(ctx.hw, ctx.hd)
    h = ctx.h
    lantern = min(0.9, h * 0.2)
    glow = ctx.param_mat("glow_material")
    profile = [
        (0.0, 0.0), (0.6 * r, 0.0), (0.6 * r, 0.1), (0.4 * r, 0.18), (0.18 * r, 0.4),     # 底座
        (0.18 * r, h - lantern - 0.08), (0.32 * r, h - lantern - 0.04),                   # 燈柱與燈頸
        (0.3 * r, h - lantern), (0.55 * r, h - lantern + 0.04),                            # 燈籠底盤
        (0.85 * r, h - 0.38 * lantern),                                                    # 燈罩（發光）
        (r, h - 0.34 * lantern), (0.35 * r, h - 0.12 * lantern), (0.0, h),                 # 頂蓋
    ]
    mats = [ctx.material] * 8 + [glow] + [ctx.material] * 3
    return shapes.lathe(profile, ctx.segments(0.75), mats)


@register("chalkboard_sign")
def build_chalkboard_sign(ctx):
    """A 字立牌：前後兩片斜板在頂端交會，再加一根頂部橫桿。"""
    hd, h = ctx.hd, ctx.h
    thickness = min(0.03, ctx.d * 0.1)
    length = math.hypot(h, hd)
    tilt = math.asin(hd / length)
    frame_mat = ctx.param_mat("frame_material")
    data = shapes.MeshData()
    for sign, base_y in ((-1.0, -hd), (1.0, hd)):
        board = shapes.box(-ctx.hw * 0.95, -thickness / 2, 0.0, ctx.hw * 0.95, thickness / 2, length, ctx.material)
        # 繞 x 軸轉 a 時，板子的上方向 (0,0,1) 會變成 (0, -sin a, cos a)。
        # 前板（底在 -hd）要往 +y 倒向頂點 → a = -tilt；後板（底在 +hd）往 -y 倒 → a = +tilt
        shapes.rotate_x(board, sign * tilt)
        board.translate(0.0, base_y, 0.0)
        data.extend(board)
    data.extend(shapes.box(-ctx.hw, -0.03, h - 0.05, ctx.hw, 0.03, h, frame_mat))
    return data


# 坐姿貓的剪影（正規化座標：u 由左到右、v 由下到上），尾巴在右下捲起
_CAT = [
    (0.10, 0.00), (0.62, 0.00), (0.80, 0.02), (0.95, 0.10), (1.00, 0.25), (0.93, 0.33),
    (0.88, 0.22), (0.80, 0.13), (0.66, 0.12), (0.66, 0.35), (0.58, 0.55), (0.60, 0.70),
    (0.60, 0.86), (0.57, 1.00), (0.49, 0.86), (0.35, 0.86), (0.27, 1.00), (0.24, 0.86),
    (0.24, 0.70), (0.28, 0.56), (0.12, 0.30),
]


@register("cat_silhouette")
def build_cat_silhouette(ctx):
    outline = [(-ctx.hw + u * ctx.w, v * ctx.h) for u, v in _CAT]
    return shapes.prism(outline, -ctx.hd, ctx.hd, "xzy", ctx.material)


def _foliage(ctx, data, center_xy, z0, top, spread, count):
    """植物葉團：數個低面數橢球，大小與位置由元件的固定亂數決定。"""
    plant = ctx.param_mat("plant_material")
    cx, cy = center_xy
    height = max(top - z0, 0.05)
    for k in range(count):
        radius = height * (0.42 if k == 0 else ctx.rng.uniform(0.24, 0.34))
        radius = min(radius, spread[0], spread[1])
        # 側邊的葉團平均分布在一圈上、往外推到接近邊緣：植物要填滿 plan 給的框，
        # 太集中在中間的話，正面看起來比參考圖小一圈（Phase 5 位置 IoU 只有 0.5）
        angle = math.tau * k / max(count - 1, 1) + ctx.rng.uniform(-0.4, 0.4)
        dist = 0.0 if k == 0 else ctx.rng.uniform(0.8, 1.0)
        px = cx + math.cos(angle) * dist * (spread[0] - radius)
        py = cy + math.sin(angle) * dist * (spread[1] - radius)
        pz = min(z0 + radius * 0.8 + ctx.rng.uniform(0, height * 0.25), top - radius)
        data.extend(shapes.blob((px, py, pz), (radius, radius * 0.9, radius * 0.85), plant,
                                segments=ctx.segments(0.75, minimum=5), rings=3, jitter=0.12, rng=ctx.rng))


@register("planter_box")
def build_planter_box(ctx):
    """窗台花槽：上寬下窄的槽（頂面往下凹出土面）+ 一排植物葉團。"""
    hw, hd = ctx.hw, ctx.hd
    box_h = ctx.h * 0.45
    wall = min(0.03, hd * 0.2)
    rings = [shapes.rect(hw * 0.92, hd * 0.85, 0.0), shapes.rect(hw, hd, box_h),
             shapes.rect(hw - wall, hd - wall, box_h), shapes.rect(hw - wall, hd - wall, box_h - 0.04)]
    data = shapes.loft(rings, ctx.material)
    count = min(6, ctx.count(2, 6))
    for k in range(count):
        x = -hw + wall + (k + 0.5) * (ctx.w - 2 * wall) / count
        _foliage(ctx, data, (x, 0.0), box_h - 0.02, ctx.h, (ctx.w / count / 1.6, hd), 1)
    return data


@register("pot_plant")
def build_pot_plant(ctx):
    """盆栽：盆子是一個 lathe（盆身、盆緣、往下凹的土面），上面是植物葉團。"""
    radius = min(ctx.hw, ctx.hd) * 0.7
    pot_h = ctx.h * 0.35
    profile = [(0.0, 0.0), (0.75 * radius, 0.0), (radius, 0.85 * pot_h), (1.1 * radius, 0.85 * pot_h),
               (1.1 * radius, pot_h), (0.92 * radius, pot_h), (0.92 * radius, 0.9 * pot_h), (0.0, 0.9 * pot_h)]
    data = shapes.lathe(profile, ctx.segments(1.0), ctx.material)
    count = min(5, ctx.count(2, 5))
    _foliage(ctx, data, (0.0, 0.0), 0.85 * pot_h, ctx.h, (ctx.hw, ctx.hd), count)
    return data


@register("vine")
def build_vine(ctx):
    """藤蔓：彎曲的莖（sweep）+ 沿著莖交錯長出的葉子。"""
    plant = ctx.param_mat("plant_material")
    steps = 7
    path = [(math.sin(k * 1.3) * ctx.hw * 0.35, math.cos(k * 0.9) * ctx.hd * 0.25, ctx.h * k / steps)
            for k in range(steps + 1)]
    data = shapes.sweep(path, min(0.012, ctx.hw * 0.1), 4, ctx.material)
    count = min(7, ctx.count(3, 7))
    for k in range(count):
        t = (k + 1) / (count + 1)
        p = path[int(t * steps)]
        # 葉子繞著莖輪流長在四個方向：只在 x 方向左右交錯的話，從側面看藤蔓是扁的
        angle = k * math.pi / 2 + math.pi / 4
        size = min(ctx.hw, ctx.hd) * ctx.rng.uniform(0.35, 0.5)
        reach_x, reach_y = ctx.hw - size, ctx.hd - size
        data.extend(shapes.blob((p[0] + math.cos(angle) * reach_x * 0.9, p[1] + math.sin(angle) * reach_y * 0.9, p[2]),
                                (size, size * 0.7, size * 0.7), plant, segments=5, rings=3, jitter=0.1, rng=ctx.rng))
    return data
