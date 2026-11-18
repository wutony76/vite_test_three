"""跳舞機（dance_machine）：原創設計的「電波 STEP!」雙人跳舞機，配合 GameHall（電 • 波 • 町）的霓虹配色。

整台由兩塊組成：後面是高機台（大螢幕＋頂上招牌＋兩側喇叭塔），前面是給玩家踩的舞台（兩組 3×3 踏板、箭頭會發光），
舞台最前緣有一支 U 形扶手（玩家站在舞台上、面向螢幕，扶手在背後）。

零件（前綴 dm_）：
  - dm_cabinet：機身，側面輪廓（yz）沿 x 擠出（1 個封閉島）：上段往前突出（招牌箱下緣）、中段螢幕往後微傾
  - dm_screen：螢幕（發光面板，decal 貼箭頭譜面）＋外框（管）
  - dm_marquee：頂上招牌箱（深色字面，decal「電波 STEP!」）＋上緣一條燈管
  - dm_speakers：機身兩側的喇叭塔（方箱）＋每座兩顆喇叭（旋轉體）
  - dm_controls：螢幕下方的小操作台（斜面板）＋左右各三顆按鈕
  - dm_stage：舞台平台＋兩塊金屬踏板底
  - dm_arrows：8 個發光箭頭（每位玩家上下左右），箭頭輪廓直接擠出（1 個箭頭 1 個島）
  - dm_bar：舞台前緣的 U 形扶手（一條管）＋中間一支直柱
  - dm_neon：舞台上緣一圈燈管＋機身正面兩側的直燈管

座標是資產座標（原點在整台底面中心、+Z 朝上、正面（玩家那側）朝 -Y），最後用 _local() 換成零件局部座標。
prism 的 axes 是奇數次互換（"xzy"）時，輪廓要順時針排面才會朝外（見 _prism_out）。
"""

import math

from .. import shapes
from . import register

# 機身側面輪廓（y, z）：逆時針（y 往右、z 往上），從背面底部開始 → 背面 → 頂 → 招牌箱前緣 → 螢幕 → 操作台 → 正面
CABINET_PROFILE = [
    (0.8, 0.0),
    (0.8, 2.3),
    (-0.05, 2.3),
    (-0.05, 1.9),     # 招牌箱下緣（往前突出）
    (0.12, 1.86),     # 螢幕上緣（往內凹，螢幕往後微傾）
    (0.06, 1.05),     # 螢幕下緣
    (-0.12, 1.0),     # 操作台
    (-0.12, 0.92),
    (0.02, 0.88),
    (0.02, 0.0),
]
SCREEN_TOP = (0.12, 1.86)
SCREEN_BOTTOM = (0.06, 1.05)


def _local(ctx, p):
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    return (p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2, p[2] - z0)


def _local_data(ctx, data):
    return data.map(lambda v: _local(ctx, v))


def _signed_area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def _prism_out(outline, a0, a1, axes, mat):
    """prism，但保證面朝外：

    axes 是偶數次互換（"yzx"、"zxy"）時逆時針的輪廓擠出來面朝外；奇數次（"xzy"、"yxz"、"zyx"）會整個翻過來。
    這裡依 axes 決定輪廓該順時針還是逆時針，少了這步，網頁上那塊會變黑或看穿。
    """
    odd = axes in ("xzy", "yxz", "zyx")
    ccw = _signed_area(outline) > 0
    if odd == ccw:
        outline = list(reversed(outline))
    return shapes.prism(outline, a0, a1, axes, mat)


def _box(x0, y0, z0, x1, y1, z1, mat):
    return shapes.box(min(x0, x1), min(y0, y1), min(z0, z1), max(x0, x1), max(y0, y1), max(z0, z1), mat)


# ─────────────────────────────── 機台 ───────────────────────────────

@register("dm_cabinet")
def build_dm_cabinet(ctx):
    (x0, _y0, _z0), (x1, _y1, _z1) = ctx.comp["bounds"]
    data = _prism_out(CABINET_PROFILE, x0, x1, "yzx", ctx.material)
    return _local_data(ctx, data)


@register("dm_screen")
def build_dm_screen(ctx):
    """螢幕：貼在機身的斜螢幕面上（往外凸一點），外框是沿螢幕四邊掃出的管。"""
    frame = ctx.param_mat("frame_material", ctx.material)
    (x0, _y0, _z0), (x1, _y1, _z1) = ctx.comp["bounds"]
    (ya, za), (yb, zb) = SCREEN_TOP, SCREEN_BOTTOM
    # 斜面的「往外」方向：切線 (ty, tz) 轉 90°，取朝 -y（玩家那側）的那一個
    ty, tz = yb - ya, zb - za
    length = math.hypot(ty, tz)
    ny, nz = tz / length, -ty / length
    if ny > 0:
        ny, nz = -ny, -nz
    inset = 0.06

    def on_face(t, out):
        y = ya + ty * t + ny * out
        z = za + tz * t + nz * out
        return y, z

    t0, t1 = 0.05, 0.95
    quad = [on_face(t0, -0.02), on_face(t1, -0.02), on_face(t1, 0.035), on_face(t0, 0.035)]
    data = shapes.MeshData()
    data.extend(_prism_out(quad, x0 + inset, x1 - inset, "yzx", ctx.material))
    # 外框：沿螢幕四邊（逆時針）掃一圈，首尾留縫（sweep 不能真的閉合）
    corners = []
    for x, t in ((x0 + inset, t0), (x1 - inset, t0), (x1 - inset, t1), (x0 + inset, t1)):
        y, z = on_face(t, 0.04)
        corners.append((x, y, z))
    path = []
    for i in range(4):
        a, b = corners[i], corners[(i + 1) % 4]
        for k in range(3):
            s = k / 3
            path.append(tuple(a[j] + (b[j] - a[j]) * s for j in range(3)))
    head = path[0]
    nxt = path[1]
    d = math.dist(head, nxt)
    path[0] = tuple(head[j] + (nxt[j] - head[j]) * 0.02 / d for j in range(3))
    path.append(corners[0])
    data.extend(shapes.sweep(path, 0.035, 6, frame))
    return _local_data(ctx, data)


@register("dm_marquee")
def build_dm_marquee(ctx):
    """頂上招牌：機身頂端往前突出的那段正面貼一塊深色字面（decal 貼這裡），上緣一條燈管。"""
    face = ctx.param_mat("face_material", ctx.material)
    tube = ctx.param_mat("tube_material", ctx.material)
    (x0, y0, z0), (x1, _y1, z1) = ctx.comp["bounds"]
    data = shapes.MeshData()
    front = -0.05  # 機身招牌箱的正面
    data.extend(_box(x0 + 0.08, front - 0.04, z0 + 0.06, x1 - 0.08, front + 0.02, z1 - 0.08, face))
    # 上緣燈管：沿招牌頂前緣橫向一條
    data.extend(shapes.sweep([(x0 + 0.04, front - 0.03, z1 - 0.03), (x1 - 0.04, front - 0.03, z1 - 0.03)], 0.03, 6, tube))
    return _local_data(ctx, data)


@register("dm_speakers")
def build_dm_speakers(ctx):
    """機身兩側的喇叭塔：方箱＋正面兩顆喇叭（淺盤狀旋轉體，中間凹一點）。"""
    cone = ctx.param_mat("cone_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    width = ctx.param("tower_width", 0.34)
    data = shapes.MeshData()
    for tx0, tx1 in ((x0, x0 + width), (x1 - width, x1)):
        data.extend(_box(tx0, y0, z0, tx1, y1, z1, ctx.material))
        cx = (tx0 + tx1) / 2
        r = width * 0.36
        for cz in (z0 + (z1 - z0) * 0.32, z0 + (z1 - z0) * 0.68):
            # 喇叭：外圈凸出、中間凹進（從正面看像一個碗）
            data.extend(shapes.lathe([(0.0, y0 - 0.02), (r * 0.35, y0 - 0.02), (r, y0 - 0.06), (r, y0 + 0.02), (0.0, y0 + 0.02)],
                                     12, cone, axis="y", center=(cx, 0.0, cz)))
    return _local_data(ctx, data)


@register("dm_controls")
def build_dm_controls(ctx):
    """螢幕下方的小操作台（機身輪廓裡已經有那塊突出的台面），左右各三顆按鈕立在台面上。"""
    button = ctx.param_mat("button_material", ctx.material)
    middle = ctx.param_mat("middle_material", button)
    (x0, _y0, _z0), (x1, _y1, _z1) = ctx.comp["bounds"]
    deck_z = 1.0
    deck_y = -0.07
    data = shapes.MeshData()
    w = x1 - x0
    for side in (x0 + w * 0.2, x1 - w * 0.2):
        for k, dx in enumerate((-0.09, 0.0, 0.09)):
            mat = middle if k == 1 else button
            data.extend(shapes.lathe([(0.0, deck_z - 0.02), (0.035, deck_z - 0.02), (0.035, deck_z + 0.03), (0.0, deck_z + 0.045)],
                                     8, mat, center=(side + dx, deck_y, 0.0)))
    return _local_data(ctx, data)


# ─────────────────────────────── 舞台 ───────────────────────────────

def _pad_cells(params):
    """兩位玩家的踏板：回傳 [(玩家中心 x, 中心 y, 格子大小)]"""
    cell = params["cell"]
    return [(cx, params["pad_y"], cell) for cx in params["pad_x"]]


@register("dm_stage")
def build_dm_stage(ctx):
    """舞台平台（一整塊）＋兩塊金屬踏板底（稍微凸起，3×3 格的範圍）。"""
    plate = ctx.param_mat("plate_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    top = z0 + ctx.param("height", 0.16)
    data = shapes.MeshData()
    data.extend(_box(x0, y0, z0, x1, y1, top, ctx.material))
    pads = {"cell": ctx.param("cell", 0.27), "pad_x": ctx.param("pad_x"), "pad_y": ctx.param("pad_y")}
    for cx, cy, cell in _pad_cells(pads):
        half = cell * 1.5 + 0.02
        data.extend(_box(cx - half, cy - half, top - 0.01, cx + half, cy + half, z1, plate))
    return _local_data(ctx, data)


def _arrow_outline(cx, cy, size, angle):
    """箭頭輪廓（俯看，逆時針），尖端朝 angle（0 = 朝 +y，也就是朝螢幕）"""
    s = size / 2
    # 朝 +y 的箭頭：箭頭三角＋箭身
    pts = [(0.0, s), (-s, 0.0), (-s * 0.42, 0.0), (-s * 0.42, -s), (s * 0.42, -s), (s * 0.42, 0.0), (s, 0.0)]
    c, sn = math.cos(angle), math.sin(angle)
    return [(cx + x * c - y * sn, cy + x * sn + y * c) for x, y in pts]


@register("dm_arrows")
def build_dm_arrows(ctx):
    """8 個發光箭頭：每位玩家上（朝螢幕）、下、左、右各一個，放在 3×3 格的十字位置。

    每個方向一種顏色（params.colors：上、下、左、右），箭頭輪廓直接擠出成薄片，1 個箭頭 1 個島。
    """
    (_x0, _y0, z0), (_x1, _y1, z1) = ctx.comp["bounds"]
    colors = ctx.param("colors")
    pads = {"cell": ctx.param("cell", 0.27), "pad_x": ctx.param("pad_x"), "pad_y": ctx.param("pad_y")}
    data = shapes.MeshData()
    for cx, cy, cell in _pad_cells(pads):
        size = cell * 0.78
        # (方向角, x 偏移, y 偏移, 顏色)：上 = 朝螢幕（+y）
        for angle, dx, dy, mat in ((0.0, 0, 1, colors[0]), (math.pi, 0, -1, colors[1]),
                                   (math.pi / 2, -1, 0, colors[2]), (-math.pi / 2, 1, 0, colors[3])):
            outline = _arrow_outline(cx + dx * cell, cy + dy * cell, size, angle)
            data.extend(_prism_out(outline, z0, z1, "xyz", mat))
    return _local_data(ctx, data)


@register("dm_bar")
def build_dm_bar(ctx):
    """舞台前緣的 U 形扶手：一條管從左邊地面往上、橫過去、再往下到右邊（轉角先折一個小斜角）；中間一支直柱。"""
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    y = (y0 + y1) / 2
    r = 0.04
    bend = 0.08
    xl, xr = x0 + r, x1 - r
    path = [(xl, y, z0), (xl, y, z1 - r - bend), (xl + bend, y, z1 - r), (xr - bend, y, z1 - r), (xr, y, z1 - r - bend), (xr, y, z0)]
    data = shapes.MeshData()
    data.extend(shapes.sweep(path, r, 6, ctx.material))
    cx = (x0 + x1) / 2
    data.extend(_box(cx - 0.035, y - 0.035, z0, cx + 0.035, y + 0.035, z1 - r, ctx.material))
    return _local_data(ctx, data)


@register("dm_neon")
def build_dm_neon(ctx):
    """燈管：舞台上緣一圈（params.stage：[x0, y0, x1, y1, z]）＋機身正面兩側直燈管（params.posts：[[x, y, z0, z1], ...]）。"""
    data = shapes.MeshData()
    sx0, sy0, sx1, sy1, sz = ctx.param("stage")
    r = ctx.param("radius", 0.025)
    ring = [(sx0, sy0, sz), (sx1, sy0, sz), (sx1, sy1, sz), (sx0, sy1, sz)]
    path = []
    for i in range(4):
        a, b = ring[i], ring[(i + 1) % 4]
        for k in range(2):
            s = k / 2
            path.append(tuple(a[j] + (b[j] - a[j]) * s for j in range(3)))
    d = math.dist(path[0], path[1])
    path[0] = tuple(path[0][j] + (path[1][j] - path[0][j]) * 0.03 / d for j in range(3))
    path.append(ring[0])
    data.extend(shapes.sweep(path, r, 6, ctx.material))
    for px, py, pz0, pz1 in ctx.param("posts", []):
        data.extend(shapes.sweep([(px, py, pz0), (px, py, pz1)], r, 6, ctx.material))
    return _local_data(ctx, data)
