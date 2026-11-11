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
