"""屋頂零件：四坡屋頂、人字屋頂、山牆飾板。

屋瓦不逐片建模（幾百片瓦 = 幾百個島、上萬個面），而是在屋頂表面做「階梯狀的瓦列」：
每一列瓦的下緣往外凸出一點點，側面看起來是鋸齒狀，正面看起來是一排排的瓦，
整個屋頂仍然是 1 個封閉幾何島，煙囪也能 Union 進去。
"""

import math

from .. import shapes
from . import register


def _courses(ctx):
    count = max(1, int(ctx.param("courses", 5)))
    lip = min(ctx.param("lip", 0.07), ctx.hw * 0.08, ctx.hd * 0.08)
    return count, lip


@register("roof_hip")
def build_roof_hip(ctx):
    """四坡屋頂（實心）：由屋簷往上疊長方形環，每一列瓦多一個往外凸的環，最上面是一條窄屋脊。

    屋脊做成很窄的長條而不是一條線：四個點擠成一條線會產生面積為 0 的退化面。
    """
    hw, hd, h = ctx.hw, ctx.hd, ctx.h
    count, lip = _courses(ctx)
    ridge_x = max(hw * ctx.param("ridge_ratio", 0.4), 0.05)
    ridge_y = min(0.06, hd * 0.05)

    def half(t):
        # t：高度比例（0 = 屋簷、1 = 屋脊）。屋簷處留出 lip 的空間，凸出後剛好碰到 bounds
        return (ridge_x + (hw - lip - ridge_x) * (1 - t), ridge_y + (hd - lip - ridge_y) * (1 - t))

    rise = h / count
    rings = [shapes.rect(hw, hd, 0.0)]
    for k in range(1, count):
        t = k / count
        hx, hy = half(t)
        rings.append(shapes.rect(hx, hy, k * rise - rise * 0.15))   # 這一列瓦的上緣
        rings.append(shapes.rect(hx + lip, hy + lip, k * rise))       # 下一列瓦的下緣（往外凸）
    hx, hy = half(1.0)
    rings.append(shapes.rect(hx, hy, h))
    return shapes.loft(rings, ctx.material)


def _offset_line(p0, p1, distance, toward):
    """把 p0→p1 這條線往 toward 那一側平移 distance（垂直於線的距離）。"""
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]
    length = math.hypot(dx, dz)
    nx, nz = dz / length, -dx / length
    if nx * (toward[0] - p0[0]) + nz * (toward[1] - p0[1]) < 0:
        nx, nz = -nx, -nz
    return (p0[0] + nx * distance, p0[1] + nz * distance), (p1[0] + nx * distance, p1[1] + nz * distance)


def _intersect(a0, a1, b0, b1):
    d = (a1[0] - a0[0]) * (b1[1] - b0[1]) - (a1[1] - a0[1]) * (b1[0] - b0[0])
    t = ((b0[0] - a0[0]) * (b1[1] - b0[1]) - (b0[1] - a0[1]) * (b1[0] - b0[0])) / d
    return (a0[0] + (a1[0] - a0[0]) * t, a0[1] + (a1[1] - a0[1]) * t)


def _at_height(p0, p1, z):
    t = (z - p0[1]) / (p1[1] - p0[1])
    return (p0[0] + (p1[0] - p0[0]) * t, z)


def _gable_outline(hw, h, ridge_x, count, lip, thickness):
    """∧ 形屋頂斷面（x, z）：外緣兩坡各自的鋸齒瓦列 + 內緣（屋底面）。

    厚度是「垂直於坡面」的距離：只用垂直方向的厚度時，陡坡的實際厚度會薄到幾公分，
    wobble、倒角之後就自我交叉（Phase 6 前置建 test02 門廊時，自我交叉檢查抓到的）。
    水平跨距太短（< 3 × lip × 列數）的坡面，鋸齒會擠在一起，所以減少列數，最少 1 列（平坡）。
    """
    left0, right0 = (-hw + lip, 0.0), (hw - lip, 0.0)
    ridge = (ridge_x, h)
    inside = (ridge_x, h * 0.3)

    def slope(base, outward):
        span = abs(ridge_x - base[0])
        n = max(1, min(count, int(span / (3 * lip))))
        points = []
        for k in range(1, n):
            t = k / n
            x = base[0] + (ridge_x - base[0]) * t
            rise = h / n
            points += [(x, k * rise - rise * 0.15), (x + outward * lip, k * rise)]
        return points

    left_pts = slope(left0, -1.0)
    right_pts = slope(right0, 1.0)
    outline = [(-hw, 0.0)] + left_pts + [ridge]
    for k in range(len(right_pts) - 2, -1, -2):
        outline += [right_pts[k + 1], right_pts[k]]
    outline.append((hw, 0.0))
    a0, a1 = _offset_line(left0, ridge, thickness, inside)
    b0, b1 = _offset_line(right0, ridge, thickness, inside)
    apex = _intersect(a0, a1, b0, b1)
    outline += [_at_height(b0, b1, 0.0), apex, _at_height(a0, a1, 0.0)]
    return outline


@register("roof_gable")
def build_roof_gable(ctx):
    """人字屋頂（厚殼）：∧ 形斷面沿 y（深度）擠出，屋脊和正面垂直，正面看得到山牆。

    ridge_at：屋脊在左右之間的位置（0～1）。參考圖帶俯角時，用偏一側的屋脊近似「一大片斜瓦面」。
    底下是空的，所以山牆的三角形要由 gable_trim 補上。
    """
    count, lip = _courses(ctx)
    ridge_x = -ctx.hw + ctx.w * min(max(ctx.param("ridge_at", 0.5), 0.05), 0.95)
    thickness = min(ctx.param("thickness", 0.2), ctx.h * 0.4)
    outline = _gable_outline(ctx.hw, ctx.h, ridge_x, count, lip, thickness)
    return shapes.prism(outline, -ctx.hd, ctx.hd, "xzy", ctx.material)


@register("gable_trim")
def build_gable_trim(ctx):
    """山牆飾板：A 字形木板（一個 ∧ 形的島）+ 三角形的山牆填充板，secondary_density 高時加中柱。"""
    hw, h = ctx.hw, ctx.h
    apex = -hw + ctx.w * ctx.param("apex_at", 0.5)
    board = min(ctx.param("board", 0.12), h * 0.3)
    dx_left = board * (apex + hw) / h
    dx_right = board * (hw - apex) / h
    boards = [(-hw, 0.0), (apex, h), (hw, 0.0), (hw - dx_right, 0.0), (apex, h - board), (-hw + dx_left, 0.0)]
    data = shapes.prism(boards, -ctx.hd, ctx.hd, "xzy", ctx.material)
    # 填充板略往後退，正面看木板會浮在牆面上，有一點層次
    infill = [(-hw + dx_left, 0.0), (hw - dx_right, 0.0), (apex, h - board)]
    # 前後都往內退：和木板的正面、背面錯開，同一個位置不會有兩個頂點（重複頂點檢查）
    data.extend(shapes.prism(infill, -ctx.hd * 0.3, ctx.hd * 0.7, "xzy", ctx.param_mat("infill_material")))
    if ctx.density("secondary") >= 0.6:
        post = board * 0.4
        data.extend(shapes.box(apex - post, -ctx.hd, 0.0, apex + post, ctx.hd, h - board * 1.5, ctx.material))
    return data
