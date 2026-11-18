"""街角小店（earth_mamas，招牌「Happy Fat」）：參考圖的兩層小店，改成 mainHall 的香菇屋風格。

一樓店面、門窗、雨遮、腰線、圍籬等用零件庫既有的 kind；這裡只放新的零件：
  - em_arc_shell：二樓以上的牆，頂部跟著半弧面屋頂的曲線
  - em_arc_roof：半弧面屋頂（四分之一橢圓的厚弧板，前後邊緣一條深色邊，像菇傘）
  - em_window：香菇屋風格的窗（圓角綠框、深色玻璃、木十字、窗台、可選小花箱）
  - em_sign：圓角木招牌＋綠框（字用 decal）
  - em_chimney：石頭煙囪＋頂上一頂小菇傘
  - em_hanger：屋簷垂下的香菇串

牆和屋頂要密合、香菇串要剛好掛在屋簷下，所以三者共用同一條弧線（_roof_inner_z）。
所有共用數字都是資產座標（原點在底座中心地面、+Z 朝上、正面朝 -Y），最後用 _local() 換成零件局部座標。
"""

import math

from .. import shapes
from . import register
from .mushroom_house import _mini_shiitake

# 屋頂弧線的預設值（plan 的 params 沒給時用這些；牆、屋頂、香菇串都讀同一組）
_ROOF = {"left_x": -2.6, "right_x": 2.6, "eave_z": 6.4, "top_z": 10.6, "overhang": 0.35, "thickness": 0.4, "depth": 1.6}


def _roof_params(ctx):
    return {k: ctx.param(k, v) for k, v in _ROOF.items()}


def _roof_inner_z(r, x):
    """屋頂內側（底面）在 x 處的高度：以 (left_x, eave_z) 為中心、半徑 (寬 + 出簷, 高) 的四分之一橢圓。

    左端最高（top_z）、往右彎下來到 right_x + overhang 時回到 eave_z → 「半弧面」。
    牆頂用同一條線，所以牆和屋頂完全密合，不會有縫。
    """
    W = r["right_x"] - r["left_x"] + r["overhang"]
    H = r["top_z"] - r["eave_z"]
    u = min(max((x - r["left_x"]) / W, 0.0), 1.0)
    return r["eave_z"] + H * math.sqrt(max(0.0, 1.0 - u * u))


# 二樓牆的弧度：俯看是圓角（超橢圓，p 越小越圓）、側看中段鼓起 SHELL_BELLY（像菇屋的胖肚子）
SHELL_ROUND_P = 4.0
SHELL_BELLY = 0.08


def shell_half_depth(r, x, z, z0=3.5):
    """二樓牆在 (x, z) 處「從中心到正面」的距離。窗戶、招牌用它算出貼牆的位置。

    - 俯看圓角：|u|^p + |v|^p = 1 的超橢圓（u = x 的相對位置）。兩端收窄成圓角而不是直角
    - 側看鼓肚：sin(π·t) 在高度中段最大、底和頂為 0（頂端要剛好接住屋頂）
    """
    half_w = (r["right_x"] - r["left_x"]) / 2
    cx = (r["right_x"] + r["left_x"]) / 2
    u = min(abs(x - cx) / half_w, 0.985)
    base = r["depth"] * (1.0 - u ** SHELL_ROUND_P) ** (1.0 / SHELL_ROUND_P)
    top = _roof_inner_z(r, x)
    t = min(max((z - z0) / max(top - z0, 1e-6), 0.0), 1.0)
    return base * (1.0 + SHELL_BELLY * math.sin(math.pi * t))


def _local(ctx, p):
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    return (p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2, p[2] - z0)


def _local_data(ctx, data):
    return data.map(lambda v: _local(ctx, v))


@register("em_arc_shell")
def build_em_arc_shell(ctx):
    """二樓以上的牆：有弧度的「胖桶子」，頂部跟著半弧面屋頂。一條沿 X 的 loft（1 個封閉島）。

    每個 x 取一個直立的切面環：正面從下往上（y = -shell_half_depth）、到頂後沿屋頂高度橫過去、
    背面從上往下回到底。俯看四角是圓的、側看中段鼓起，所以牆不再是方方正正的長方體。
    """
    r = _roof_params(ctx)
    (_x0, _y0, z0), _ = ctx.comp["bounds"]
    left, right = r["left_x"], r["right_x"]
    columns, rows = 28, 8
    rings = []
    for i in range(columns + 1):
        x = left + (right - left) * i / columns
        top = _roof_inner_z(r, x)
        front, back = [], []
        for k in range(rows + 1):
            z = z0 + (top - z0) * k / rows
            d = shell_half_depth(r, x, z, z0)
            front.append((x, -d, z))
            back.append((x, d, z))
        rings.append(front + list(reversed(back)))
    data = shapes.loft(rings, ctx.material)
    return _local_data(ctx, data)


@register("em_corner_pillars")
def build_em_corner_pillars(ctx):
    """一樓四個角的圓柱：把方正的店面轉角包成圓弧（一樓有門窗開口，整面牆不能彎，只把轉角變圓）。"""
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    radius = ctx.param("radius", 0.34)
    data = shapes.MeshData()
    for cx in (x0 + radius, x1 - radius):
        for cy in (y0 + radius, y1 - radius):
            data.extend(shapes.lathe([(0.0, z0), (radius, z0), (radius * 1.04, z0 + 0.25), (radius, z1 - 0.1), (0.0, z1)],
                                     14, ctx.material, center=(cx, cy, 0.0)))
    return _local_data(ctx, data)


@register("em_arc_roof")
def build_em_arc_roof(ctx):
    """半弧面屋頂：沿 Y 擠出的「月牙形」厚弧板，前後各一條深色邊（三段，中間留 1 mm 縫避免重複頂點）。

    月牙形輪廓：內側弧線（＝牆頂那條）從左到右，再沿外側弧線（半徑多一個厚度）從右回到左，
    左端再往左延伸一段出簷。
    """
    rim = ctx.param_mat("rim_material", ctx.material)
    r = _roof_params(ctx)
    t, ov = r["thickness"], r["overhang"]
    left = r["left_x"]
    W = r["right_x"] - left + ov
    H = r["top_z"] - r["eave_z"]
    steps = 22
    inner, outer = [], []
    for k in range(steps + 1):
        theta = (math.pi / 2) * k / steps
        inner.append((left + W * math.sin(theta), r["eave_z"] + H * math.cos(theta)))
        outer.append((left + (W + t) * math.sin(theta), r["eave_z"] + (H + t) * math.cos(theta)))
    # 輪廓（逆時針）：左端出簷 → 內弧（左上 → 右下）→ 外弧倒回來（右下 → 左上）→ 左端出簷頂
    outline = [(left - ov, r["top_z"])] + inner + list(reversed(outer)) + [(left - ov, r["top_z"] + t)]
    d = r["depth"] + ov
    rim_w = 0.18
    data = shapes.MeshData()
    data.extend(shapes.prism(outline, -d, -d + rim_w, "xzy", rim))
    data.extend(shapes.prism(outline, -d + rim_w + 0.001, d - rim_w - 0.001, "xzy", ctx.material))
    data.extend(shapes.prism(outline, d - rim_w, d, "xzy", rim))
    return _local_data(ctx, data)


def _rounded_rect_path(cx, cz, w, h, radius, y, gap=0.02):
    """圓角長方形的（幾乎）閉合路徑，給 sweep 掃窗框。頭尾留一點縫，避免重複頂點。"""
    hw, hh = w / 2 - radius, h / 2 - radius
    pts = []
    corners = [(hw, -hh, -math.pi / 2), (hw, hh, 0.0), (-hw, hh, math.pi / 2), (-hw, -hh, math.pi)]
    for ox, oz, a0 in corners:
        for k in range(5):
            a = a0 + (math.pi / 2) * k / 4
            pts.append((cx + ox + radius * math.cos(a), y, cz + oz + radius * math.sin(a)))
    pts.append((pts[0][0] - gap, y, pts[0][2]))
    return pts


@register("em_window")
def build_em_window(ctx):
    """香菇屋風格的窗：圓角綠框（掃出的管）、深色玻璃、木十字、窗台；可選小花箱＋一團葉子。

    shape = "round" 時是圓窗。窗貼在二樓牆的正面（y = -depth），框往外凸一點。
    """
    glass = ctx.param_mat("glass_material", ctx.material)
    wood = ctx.param_mat("wood_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    r = _roof_params(ctx)
    cx = (x0 + x1) / 2
    # 牆有弧度：窗戶貼在「這扇窗中心那一點」的牆面上（取上下緣中比較外凸的，框才不會埋進鼓起的牆）
    wall_y = -max(shell_half_depth(r, cx, z) for z in (z0 + 0.4, (z0 + z1) / 2, z1 - 0.1))
    data = shapes.MeshData()
    if ctx.param("shape", "rect") == "round":
        radius = min(x1 - x0, z1 - z0) / 2 - 0.08
        cz = (z0 + z1) / 2
        ring = [(cx + radius * math.cos(a), wall_y - 0.06, cz + radius * math.sin(a))
                for a in ((math.tau - 0.05) * k / 20 for k in range(21))]
        data.extend(shapes.sweep(ring, 0.07, 6, ctx.material))
        disc = [(cx + (radius - 0.02) * math.cos(a), cz + (radius - 0.02) * math.sin(a)) for a in (math.tau * k / 16 for k in range(16))]
        data.extend(shapes.prism(disc, wall_y - 0.04, wall_y + 0.08, "xzy", glass))
        data.extend(shapes.box(cx - radius, wall_y - 0.07, cz - 0.04, cx + radius, wall_y - 0.02, cz + 0.04, wood))
        data.extend(shapes.box(cx - 0.04, wall_y - 0.075, cz - radius, cx + 0.04, wall_y - 0.025, cz + radius, wood))
        return _local_data(ctx, data)
    w = (x1 - x0) - 0.14
    # 下方留 0.42 給窗台和小花箱（花箱最低點剛好在 bounds 底邊上方一點）
    h = (z1 - z0) - 0.55
    cz = z0 + 0.42 + h / 2
    data.extend(shapes.sweep(_rounded_rect_path(cx, cz, w, h, 0.14, wall_y - 0.06), 0.06, 6, ctx.material))
    data.extend(shapes.box(cx - w / 2 + 0.03, wall_y - 0.04, cz - h / 2 + 0.03, cx + w / 2 - 0.03, wall_y + 0.08, cz + h / 2 - 0.03, glass))
    data.extend(shapes.box(cx - w / 2 + 0.05, wall_y - 0.075, cz - 0.035, cx + w / 2 - 0.05, wall_y - 0.025, cz + 0.035, wood))
    data.extend(shapes.box(cx - 0.035, wall_y - 0.08, cz - h / 2 + 0.05, cx + 0.035, wall_y - 0.03, cz + h / 2 - 0.05, wood))
    sill_z = cz - h / 2 - 0.1
    data.extend(shapes.box(cx - w / 2 - 0.08, wall_y - 0.28, sill_z - 0.06, cx + w / 2 + 0.08, wall_y + 0.02, sill_z + 0.04, wood))
    if ctx.param("flower_box", False):
        box_mat = ctx.param_mat("box_material", wood)
        plant = ctx.param_mat("plant_material", wood)
        data.extend(shapes.box(cx - w / 2, wall_y - 0.3, sill_z - 0.28, cx + w / 2, wall_y - 0.06, sill_z - 0.07, box_mat))
        data.extend(shapes.blob((cx, wall_y - 0.18, sill_z + 0.08), (w / 2, 0.14, 0.14), plant, segments=8, rings=3))
    return _local_data(ctx, data)


@register("em_sign")
def build_em_sign(ctx):
    """圓角木招牌（厚片）＋綠色圓角框。字是 plan 裡的 decal，貼在招牌正面。"""
    frame = ctx.param_mat("frame_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    w, h = (x1 - x0) - 0.1, (z1 - z0) - 0.1
    radius = 0.28
    hw, hh = w / 2 - radius, h / 2 - radius
    outline = []
    for ox, oz, a0 in ((hw, -hh, -math.pi / 2), (hw, hh, 0.0), (-hw, hh, math.pi / 2), (-hw, -hh, math.pi)):
        for k in range(5):
            a = a0 + (math.pi / 2) * k / 4
            outline.append((cx + ox + radius * math.cos(a), cz + oz + radius * math.sin(a)))
    r = _roof_params(ctx)
    # 招牌貼在鼓起的牆面前：取招牌範圍內最外凸的牆面，再往外 0.12
    wall = max(shell_half_depth(r, x, z) for x in (x0 + 0.3, cx, x1 - 0.3) for z in (z0 + 0.1, cz, z1 - 0.1))
    front = -wall - 0.3
    data = shapes.prism(outline, front, -wall + 0.08, "xzy", ctx.material)
    data.extend(shapes.sweep(_rounded_rect_path(cx, cz, w + 0.02, h + 0.02, radius, front - 0.02), 0.06, 6, frame))
    return _local_data(ctx, data)


@register("em_chimney")
def build_em_chimney(ctx):
    """石頭煙囪（方柱）＋頂上一頂小菇傘（旋轉體，傘緣一圈深色）。"""
    cap_mat = ctx.param_mat("cap_material", ctx.material)
    rim = ctx.param_mat("rim_material", cap_mat)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = min(x1 - x0, y1 - y0) / 2 * 0.62
    stack_top = z1 - 0.65
    data = shapes.box(cx - half, cy - half, z0, cx + half, cy + half, stack_top, ctx.material)
    R = min(x1 - x0, y1 - y0) / 2
    profile = [(0.0, stack_top - 0.05), (R * 0.95, stack_top), (R, stack_top + 0.12), (R * 0.85, stack_top + 0.35),
               (R * 0.45, z1 - 0.06), (0.0, z1)]
    data.extend(shapes.lathe(profile, 14, [rim, rim, cap_mat, cap_mat, cap_mat], center=(cx, cy, 0.0)))
    return _local_data(ctx, data)


@register("em_hanger")
def build_em_hanger(ctx):
    """屋簷垂下的香菇串：從屋頂底面（前緣附近）往下一條細繩，串 count 朵小香菇。"""
    cap = ctx.param_mat("cap_material", ctx.material)
    stem = ctx.param_mat("stem_material", ctx.material)
    r = _roof_params(ctx)
    x = ctx.param("x", 2.2)
    count = ctx.param("count", 3)
    length = ctx.param("length", 1.5)
    y = -(r["depth"] + r["overhang"]) + 0.15
    top_z = _roof_inner_z(r, x) + 0.05  # 繩子頂端埋進屋頂底面一點點
    bottom = (x, y, top_z - length)
    data = shapes.sweep([(x, y, top_z), bottom], 0.025, 4, ctx.material)
    spacing = (length - 0.4) / max(count, 1)
    for k in range(count):
        z = bottom[2] + 0.15 + spacing * k
        scale = 1.0 - 0.1 * k / max(count - 1, 1) + 0.05 * math.sin(k * 2.1 + x)
        data.extend(_mini_shiitake((x, y, z), scale, cap, stem))
    return _local_data(ctx, data)
