"""自然物：樹幹、樹冠。"""

import math

from .. import shapes
from . import register


@register("tree_trunk")
def build_tree_trunk(ctx):
    """樹幹：底部略為外擴（樹根）、往上收細的旋轉體。"""
    radius = min(ctx.hw, ctx.hd)
    taper = ctx.param("taper", 0.7)
    profile = [(0.0, 0.0), (radius, 0.0), (radius * 0.75, ctx.h * 0.15), (radius * taper * 0.75, ctx.h),
               (0.0, ctx.h)]
    return shapes.lathe(profile, ctx.segments(0.75), ctx.material)


@register("tree_canopy")
def build_tree_canopy(ctx):
    """樹冠：幾顆重疊的橢球。這裡還是多個島，orchestrator 會用 Voxel Remesh 融成 1 個。"""
    data = shapes.MeshData()
    blobs = max(1, int(ctx.param("blobs", 3)))
    # 主球不要太大、側球要往外推：側球大半被主球包住的話，Remesh 後只剩一顆圓球，看不出樹冠的起伏
    main = min(ctx.hw, ctx.hd, ctx.h / 2) * 0.7
    # 主球底部貼齊 bounds 底緣：樹幹的頂端會插進樹冠裡。
    # 少了這點，Remesh 會讓表面略往內縮，樹幹和樹冠之間就出現一道縫
    main_z = main * 0.9
    data.extend(shapes.blob((0.0, 0.0, main_z), (main, main, main * 0.95), ctx.material,
                            segments=ctx.segments(1.0), rings=5, jitter=0.08, rng=ctx.rng))
    for k in range(1, blobs):
        r = main * ctx.rng.uniform(0.6, 0.75)
        angle = 2.4 * k
        offset = min(main * 0.75, min(ctx.hw, ctx.hd) - r)
        cx = offset * math.cos(angle)
        cy = offset * math.sin(angle)
        cz = min(main_z + main * 0.55, ctx.h - r)
        data.extend(shapes.blob((cx, cy, cz), (r, r, r * 0.9), ctx.material,
                                segments=ctx.segments(1.0), rings=4, jitter=0.08, rng=ctx.rng))
    return data


@register("rock_pile")
def build_rock_pile(ctx):
    """石堆：一顆顆低面數的石塊由下往上堆，填滿 bounds（每顆都是封閉的島，最多 8 顆）。

    每層幾顆：在「層高 ≤ 1.36 × 石塊半徑」的前提下取最多的顆數。
    少了這個條件，層與層之間會出現空隙，石塊看起來像浮在半空中。
    """
    w, h = ctx.w, ctx.h
    count = max(1, min(8, int(ctx.param("stones", 6))))
    per_layer = 1
    for candidate in range(1, count + 1):
        rx = w / (2 * candidate)
        layers = math.ceil(count / candidate)
        if h / layers <= 1.36 * rx:
            per_layer = candidate
    rx_base = w / (2 * per_layer)
    layers = math.ceil(count / per_layer)
    layer_h = h / layers
    data = shapes.MeshData()
    placed = 0
    for layer in range(layers):
        in_layer = min(per_layer, count - placed)
        rz = min(max(0.62 * layer_h, 0.4 * rx_base), 0.9 * rx_base, h / 2)
        cz = rz if layers == 1 else rz + layer * (h - 2 * rz) / (layers - 1)
        # 下大上小：最上層的石塊縮到 65%。全部一樣大的話，窄高的石堆會疊成一根柱子
        shrink = 1.0 - 0.35 * (layer / (layers - 1) if layers > 1 else 0.0)
        for j in range(in_layer):
            rx = rx_base * shrink * ctx.rng.uniform(0.9, 1.05)
            ry = min(ctx.hd, rx) * 0.85
            slot = w / in_layer
            cx = -ctx.hw + (j + 0.5) * slot
            if in_layer == 1:
                # 一層只有一顆時左右交錯，石堆的輪廓才會凹凸不平
                cx += (1 if layer % 2 else -1) * (ctx.hw - rx) * ctx.rng.uniform(0.4, 0.9)
            else:
                cx += ctx.rng.uniform(-0.12, 0.12) * rx
            cx = max(-ctx.hw + rx, min(ctx.hw - rx, cx))
            cy = ctx.rng.uniform(-0.5, 0.5) * (ctx.hd - ry)
            data.extend(shapes.blob((cx, cy, cz), (rx, ry, rz), ctx.material, segments=6, rings=4, jitter=0.16, rng=ctx.rng))
            placed += 1
    return data


@register("bush")
def build_bush(ctx):
    """灌木：葉團由下往上、由大到小堆成一叢，左右交錯，填滿 bounds 的高度。"""
    plant = ctx.param_mat("plant_material")
    count = max(2, min(6, ctx.count(3, 6)))
    data = shapes.MeshData()
    for k in range(count):
        f = k / (count - 1)
        r = min(ctx.hw, ctx.hd * 1.2, ctx.h / 2) * (0.95 - 0.4 * f)
        ry = min(r, ctx.hd)
        cz = r * 0.85 + f * max(ctx.h - r * 0.85 - r, 0.0)
        side = 1 if k % 2 else -1
        cx = side * (ctx.hw - r) * ctx.rng.uniform(0.3, 1.0)
        cy = ctx.rng.uniform(-0.4, 0.4) * (ctx.hd - ry)
        data.extend(shapes.blob((cx, cy, cz), (r, ry, r * 0.85), plant, segments=ctx.segments(0.75, minimum=5), rings=4,
                                jitter=0.12, rng=ctx.rng))
    return data
