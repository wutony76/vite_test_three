"""門窗零件（profile = opening / glass）。

窗框和窗櫺是同一個 grid_slab：窗格是貫穿的洞，整個窗框是 1 個封閉幾何島，
不是四根木條加兩根窗櫺疊在一起。
"""

from .. import shapes
from . import register


def _frame_lines(lo, hi, frame, bar, panes):
    """窗框外緣 → 每一格窗格 → 窗櫺 → ... → 窗框外緣，回傳格線與窗格所在的格子索引。"""
    inner = (hi - lo) - 2 * frame
    pane = (inner - (panes - 1) * bar) / panes
    lines = [lo, lo + frame]
    pane_index = []
    position = lo + frame
    for k in range(panes):
        pane_index.append(len(lines) - 1)
        position += pane
        lines.append(position)
        if k < panes - 1:
            position += bar
            lines.append(position)
    lines.append(hi)
    return lines, pane_index


def _frame(ctx, cols, rows):
    frame = min(ctx.param("frame", 0.07), ctx.w * 0.2, ctx.h * 0.2)
    bar = min(ctx.param("bar", 0.045), frame)
    xs, x_panes = _frame_lines(-ctx.hw, ctx.hw, frame, bar, cols)
    zs, z_panes = _frame_lines(0.0, ctx.h, frame, bar, rows)
    cells = {}
    for i in x_panes:
        for j in z_panes:
            cells[(i, j)] = ("hole", len(cells))
    return shapes.grid_slab(xs, zs, -ctx.hd, ctx.hd, cells, "xzy", ctx.material)


@register("window")
def build_window(ctx):
    cols, rows = ctx.param("panes", [2, 2])
    data = _frame(ctx, int(cols), int(rows))
    # 窗台：往前凸出的一條，窗下會多一道陰影。secondary_density 太低時省略
    if ctx.param("sill", True) and ctx.density("secondary") >= 0.3:
        data.extend(shapes.box(-ctx.hw - 0.03, -ctx.hd - 0.05, -0.02, ctx.hw + 0.03, -ctx.hd + 0.04, 0.04,
                               ctx.material))
    return data


@register("shop_window")
def build_shop_window(ctx):
    vertical, horizontal = ctx.param("mullions", [1, 1])
    return _frame(ctx, int(vertical) + 1, int(horizontal) + 1)


@register("glass_pane")
def build_glass_pane(ctx):
    """單面玻璃，法線朝正面（-y）。glass profile 允許開放邊界。"""
    hw, h = ctx.hw, ctx.h
    return shapes.single([(-hw, 0.0, 0.0), (-hw, 0.0, h), (hw, 0.0, h), (hw, 0.0, 0.0)], [(0, 3, 2, 1)], ctx.material)


@register("door")
def build_door(ctx):
    """門 = 門框（ㄇ字＋門檻）+ 門片 + 門把。

    門片上的玻璃不是另外貼的：子元件 glass_pane 的位置在門片上挖成凹槽，玻璃放進槽裡。
    secondary_density ≥ 0.5 時，門片下半部再加一塊淺凹的門板。
    """
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    frame = min(ctx.param("frame", 0.07), ctx.w * 0.15)
    sill = 0.03
    data = shapes.grid_slab([-hw, -hw + frame, hw - frame, hw], [0.0, sill, h - frame, h],
                            -hd, hd, {(1, 1): ("hole", 0)}, "xzy", ctx.material)

    gap = 0.005
    sx0, sx1 = -hw + frame + gap, hw - frame - gap
    sz0, sz1 = sill + gap, h - frame - gap
    sy0, sy1 = -hd + min(0.02, ctx.d * 0.2), hd - min(0.02, ctx.d * 0.2)
    regions = []
    for (x0, _y0, z0), (x1, _y1, z1) in ctx.child_rects("glass_pane"):
        regions.append((max(x0, sx0 + 0.04), min(x1, sx1 - 0.04), max(z0, sz0 + 0.04), min(z1, sz1 - 0.04),
                        min(0.045, (sy1 - sy0) * 0.75)))
    if ctx.density("secondary") >= 0.5:
        top = min((r[2] for r in regions), default=sz1) - 0.12
        if top - (sz0 + 0.12) > 0.2:
            regions.append((sx0 + 0.09, sx1 - 0.09, sz0 + 0.12, top, min(0.015, (sy1 - sy0) * 0.3)))
    xs = shapes.breakpoints(sx0, sx1, [v for r in regions for v in r[:2]])
    zs = shapes.breakpoints(sz0, sz1, [v for r in regions for v in r[2:4]])
    cells = {}
    # 玻璃後面的槽底要暗（門內側是室內）；用門本身的顏色時，透過玻璃看起來像一塊黃綠色（Phase 5 色差檢查發現）
    glass_floor = ctx.param_mat("glass_niche_material")
    glass_count = len(ctx.child_rects("glass_pane"))
    for index, (x0, x1, z0, z1, depth) in enumerate(regions):
        floor = glass_floor if index < glass_count else ctx.material
        for cell in shapes.cells_in(xs, zs, x0, x1, z0, z1):
            cells[cell] = ("niche", index, depth, floor)
    data.extend(shapes.grid_slab(xs, zs, sy0, sy1, cells, "xzy", ctx.material))

    if ctx.param("handle", True) and ctx.density("tertiary") > 0:
        knob_x = sx1 - 0.09
        profile = [(0.014, 0.01), (0.014, -0.025), (0.028, -0.035), (0.028, -0.055), (0.0, -0.06)]
        data.extend(shapes.lathe(profile, 6, ctx.param_mat("handle_material"), axis="y",
                                 center=(knob_x, sy0, h * 0.45)))
    return data
