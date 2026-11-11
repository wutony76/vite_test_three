"""建築結構零件：牆、壓頂、地基、煙囪、柱、樑、雨遮、雨棚、台階。

這些都是 building_shell：一個 Object 必須是 1 個封閉幾何島。
"""

import math

from .. import shapes
from . import register


@register("wall_block")
def build_wall_block(ctx):
    """有門窗凹槽的牆體（整棟建築的主體）。

    門窗不是另外貼上去的面，而是在牆上往內退 reveal 的凹槽，門窗 Object 再放進凹槽裡，
    側面看得到牆的厚度，光影才有層次。
    regions 裡的 edit 區域（例如剝落的磚面）只切格線，讓之後的 extrude 選得到剛好那一塊。
    """
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    reveal = min(ctx.param("reveal", 0.15), ctx.d * 0.5)
    niche_mat = ctx.param_mat("niche_material")
    xs = shapes.breakpoints(-hw, hw, [v for r in ctx.regions for v in (r["x0"], r["x1"])])
    zs = shapes.breakpoints(0.0, h, [v for r in ctx.regions for v in (r["z0"], r["z1"])])
    cells = {}
    for index, region in enumerate(r for r in ctx.regions if r["role"] == "opening"):
        for cell in shapes.cells_in(xs, zs, region["x0"], region["x1"], region["z0"], region["z1"]):
            cells[cell] = ("niche", index, reveal, niche_mat)
    return shapes.grid_slab(xs, zs, -hd, hd, cells, "xzy", ctx.material)


@register("coping")
def build_coping(ctx):
    """女兒牆壓頂：平放的口字形板，中間是貫穿的洞（下面就是屋頂）。"""
    ring = min(ctx.param("ring_width", 0.2), ctx.hw * 0.4, ctx.hd * 0.4)
    xs = [-ctx.hw, -ctx.hw + ring, ctx.hw - ring, ctx.hw]
    ys = [-ctx.hd, -ctx.hd + ring, ctx.hd - ring, ctx.hd]
    return shapes.grid_slab(xs, ys, 0.0, ctx.h, {(1, 1): ("hole", 0)}, "xyz", ctx.material)


@register("foundation")
def build_foundation(ctx):
    """地基。primary_quality ≥ 2 時做成兩階：上層往內縮，牆腳會多一道陰影線。"""
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    if ctx.detail["primary_quality"] < 2:
        return shapes.box(-hw, -hd, 0.0, hw, hd, h, ctx.material)
    step = min(0.04, hw * 0.1)
    rings = [shapes.rect(hw, hd, 0.0), shapes.rect(hw, hd, h * 0.55),
             shapes.rect(hw - step, hd - step, h * 0.55), shapes.rect(hw - step, hd - step, h)]
    return shapes.loft(rings, ctx.material)


@register("chimney")
def build_chimney(ctx):
    """煙囪：煙囪身 → 外擴的頂蓋 → 往下凹的煙道，一次 loft 完成。

    底部往下多埋 10 cm：Boolean Union 時兩個物件必須真的重疊，
    只是「剛好貼齊」的共平面很容易讓 Boolean 失敗或留下破面。
    """
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    bury = ctx.param("bury", 0.1)
    if ctx.density("secondary") < 0.4:
        return shapes.box(-hw, -hd, -bury, hw, hd, h, ctx.material)
    flare, cap = min(0.035, hw * 0.2), min(0.12, h * 0.2)
    inner = min(0.06, hw * 0.35)
    body_hw, body_hd = hw - flare, hd - flare
    rings = [
        shapes.rect(body_hw, body_hd, -bury),
        shapes.rect(body_hw, body_hd, h - cap),
        shapes.rect(hw, hd, h - cap),
        shapes.rect(hw, hd, h),
        shapes.rect(hw - inner, hd - inner, h),
        shapes.rect(hw - inner, hd - inner, h - cap * 1.6),
    ]
    return shapes.loft(rings, ctx.material)


@register("pillar")
def build_pillar(ctx):
    return shapes.box(-ctx.hw, -ctx.hd, 0.0, ctx.hw, ctx.hd, ctx.h, ctx.material)


@register("beam")
def build_beam(ctx):
    return shapes.box(-ctx.hw, -ctx.hd, 0.0, ctx.hw, ctx.hd, ctx.h, ctx.material)


@register("canopy")
def build_canopy(ctx):
    """小雨遮：往前下斜的厚板（梯形斷面沿 x 擠出）。"""
    hd, h = ctx.hd, ctx.h
    thickness = min(0.06, h * 0.6)
    drop = h - thickness
    outline = [(hd, h), (-hd, h - drop), (-hd, 0.0), (hd, h - thickness)]
    return shapes.prism(outline, -ctx.hw, ctx.hw, "yzx", ctx.material)


@register("awning")
def build_awning(ctx):
    """雨棚：斜頂 + 正面立板的實心塊，頂面做成瓦楞（Test A 用它取代屋瓦）。

    做法：沿 x 排一串 YZ 斷面，奇數斷面的頂點往上抬 rib_height，再用 loft 連起來。
    頂面變成一條條往前延伸的稜線，正面立板的上緣也跟著起伏，一個封閉幾何島就有瓦楞感。
    """
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    ribs = int(ctx.param("ribs", 8)) if ctx.param("corrugated", False) else 0
    rib_h = min(ctx.param("rib_height", 0.035), h * 0.1)
    drop = min(ctx.d * math.tan(math.radians(ctx.param("slope_deg", 15))), h * 0.4)
    top_wall = h - rib_h
    samples = 2 * ribs + 1 if ribs else 2
    rings = []
    for k in range(samples):
        x = -hw + ctx.w * k / (samples - 1)
        lift = rib_h if (ribs and k % 2 == 1) else 0.0
        rings.append([
            (x, hd, 0.0),
            (x, hd, top_wall + lift),
            (x, -hd, top_wall - drop + lift),
            (x, -hd, 0.0),
        ])
    return shapes.loft(rings, ctx.material)


@register("steps")
def build_steps(ctx):
    """台階：階梯輪廓（凹多邊形）沿 x 擠出，側面用 ear clipping 切三角形。"""
    hd, h = ctx.hd, ctx.h
    count = max(1, int(ctx.param("count", 3)))
    rise, run = h / count, ctx.d / count
    outline = [(-hd, 0.0), (hd, 0.0), (hd, h)]
    for k in range(count - 1, 0, -1):
        outline.append((-hd + k * run, (k + 1) * rise))
        outline.append((-hd + k * run, k * rise))
    outline.append((-hd, rise))
    return shapes.prism(outline, -ctx.hw, ctx.hw, "yzx", ctx.material)
