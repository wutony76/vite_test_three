"""復古街機（retro_arcade）：依 tools/img/game_machine.jpg 的向量貼紙風街機重新建模。

零件（前綴 rm_）：
  - rm_cabinet：青綠機身，側面輪廓（yz）沿 x 擠出（1 個封閉島）
  - rm_side_art：兩側下半部的橘色彩繪側板（同一條輪廓的下半段，薄板）
  - rm_marquee：頂上招牌箱＋深色面板＋兩顆小燈
  - rm_box：單純的盒子（招牌箱右上的紅盒）
  - rm_bezel：斜螢幕框（奶油色板）＋發光螢幕，跟著機身的斜螢幕面
  - rm_controls：操作台（奶油檯面、橘色前緣、兩支紅球搖桿、圓鈕、投幣口）
  - rm_coin_door：投幣門（深灰面板、橘色旋鈕、小窗）
  - 左側 kitbash（全部朝 -x）：rm_camera 相機、rm_speaker 喇叭、rm_knob_box 旋鈕盒、rm_candy_box 糖果按鈕盒、rm_vent_box 通風箱
  - rm_feet：四個腳墊

機身輪廓（CABINET_PROFILE）是共用的：螢幕框要貼在斜螢幕面上、側板要跟著機身下半部的輪廓，
所以都從同一組點算。座標是資產座標（原點在機身底面中心、+Z 朝上、正面朝 -Y），最後用 _local() 換成零件局部座標。
"""

import math

from .. import shapes
from . import register

# 機身側面輪廓（y, z）：從背面底部開始，背面 → 頂 → 招牌箱下緣 → 斜螢幕 → 操作台下 → 正面 → 踢腳板
CABINET_PROFILE = [
    (0.45, 0.05),
    (0.45, 1.85),
    (-0.35, 1.85),
    (-0.35, 1.52),    # 招牌箱往前突出的下緣
    (-0.12, 1.48),    # 斜螢幕上緣（往內凹）
    (-0.2, 1.0),      # 斜螢幕下緣
    (-0.3, 0.95),     # 操作台底下
    (-0.42, 0.9),
    (-0.42, 0.2),     # 正面
    (-0.36, 0.12),    # 踢腳板內縮
    (-0.36, 0.05),
]
SCREEN_TOP = (-0.12, 1.48)
SCREEN_BOTTOM = (-0.2, 1.0)


def _local(ctx, p):
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    return (p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2, p[2] - z0)


def _local_data(ctx, data):
    return data.map(lambda v: _local(ctx, v))


def _slab(corner_fn, mat):
    """8 個角（corner_fn(i, j, k)，i/j/k ∈ {0,1}）組成的六面體：斜面上的板子用這個做"""
    verts = [corner_fn(i, j, k) for k in (0, 1) for j in (0, 1) for i in (0, 1)]
    # 頂點順序：k（前後）、j（上下）、i（左右）
    faces = [
        (0, 2, 3, 1),  # k=0
        (4, 5, 7, 6),  # k=1
        (0, 1, 5, 4),  # j=0
        (2, 6, 7, 3),  # j=1
        (0, 4, 6, 2),  # i=0
        (1, 3, 7, 5),  # i=1
    ]
    return shapes.single(verts, faces, mat)


def _screen_frame():
    """斜螢幕面的座標系：沿螢幕往上的方向 v、朝外（前上方）的法線 n（都是 yz 平面上的單位向量）"""
    dy, dz = SCREEN_TOP[0] - SCREEN_BOTTOM[0], SCREEN_TOP[1] - SCREEN_BOTTOM[1]
    length = math.hypot(dy, dz)
    v = (dy / length, dz / length)
    n = (-v[1], v[0])  # 往前（-y）、稍微往上
    if n[0] > 0:
        n = (-n[0], -n[1])
    return v, n, length


def _on_screen(x, s, out):
    """斜螢幕面上的點：x、沿螢幕往上的距離 s（從下緣算）、往外 out"""
    v, n, _ = _screen_frame()
    return (x, SCREEN_BOTTOM[0] + v[0] * s + n[0] * out, SCREEN_BOTTOM[1] + v[1] * s + n[1] * out)


# ─────────────────────────────── 機身 ───────────────────────────────

@register("rm_cabinet")
def build_rm_cabinet(ctx):
    """青綠機身：側面輪廓沿 x 擠出（1 個封閉島）。"""
    (x0, _y0, _z0), (x1, _y1, _z1) = ctx.comp["bounds"]
    data = shapes.prism(CABINET_PROFILE, x0, x1, "yzx", ctx.material)
    return _local_data(ctx, data)


@register("rm_side_art")
def build_rm_side_art(ctx):
    """兩側下半部的橘色彩繪側板：機身輪廓的下半段（操作台以下），貼在兩側外面 0.02 厚。"""
    (x0, _y0, z0), (x1, _y1, z1) = ctx.comp["bounds"]
    top = z1
    outline = [(0.45, z0), (0.45, top), (-0.42, top), (-0.42, 0.2), (-0.36, 0.12), (-0.36, z0)]
    data = shapes.MeshData()
    data.extend(shapes.prism(outline, x0, x0 + 0.02, "yzx", ctx.material))
    data.extend(shapes.prism(outline, x1 - 0.02, x1, "yzx", ctx.material))
    return _local_data(ctx, data)


@register("rm_box")
def build_rm_box(ctx):
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    return _local_data(ctx, shapes.box(x0, y0, z0, x1, y1, z1, ctx.material))


@register("rm_marquee")
def build_rm_marquee(ctx):
    """頂上招牌箱：奶油色盒＋前面一塊深色面板＋面板上兩顆橘色小燈。"""
    panel = ctx.param_mat("panel_material", ctx.material)
    light = ctx.param_mat("light_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    data = shapes.MeshData()
    data.extend(shapes.box(x0, y0 + 0.03, z0, x1, y1, z1, ctx.material))
    px0, px1 = x0 + 0.1, x1 - 0.1
    data.extend(shapes.box(px0, y0, z0 + 0.08, px1, y0 + 0.04, z1 - 0.1, panel))
    for lx in (px0 + 0.1, px0 + 0.22):
        data.extend(shapes.lathe([(0.0, y0 - 0.025), (0.035, y0 - 0.02), (0.035, y0 + 0.01)], 8, light, axis="y",
                                 center=(lx, 0.0, (z0 + z1) / 2)))
    return _local_data(ctx, data)


@register("rm_bezel")
def build_rm_bezel(ctx):
    """斜螢幕框：奶油色板貼在斜螢幕面上（往外 0～0.03），前面一塊比較小的發光螢幕（往外 0.03～0.045）。"""
    screen = ctx.param_mat("screen_material", ctx.material)
    (x0, _y0, _z0), (x1, _y1, _z1) = ctx.comp["bounds"]
    _v, _n, length = _screen_frame()
    data = shapes.MeshData()

    def plate(xa, xb, s0, s1, out0, out1, mat):
        return _slab(lambda i, j, k: _on_screen(xa if i == 0 else xb, s0 if j == 0 else s1, out0 if k == 0 else out1), mat)

    data.extend(plate(x0, x1, 0.0, length, -0.02, 0.03, ctx.material))
    data.extend(plate(x0 + 0.08, x1 - 0.08, 0.07, length - 0.07, 0.031, 0.045, screen))
    return _local_data(ctx, data)


@register("rm_controls")
def build_rm_controls(ctx):
    """操作台：奶油色檯面、橘色前緣板、兩支紅球搖桿（黑桿紅球一個旋轉體）、中間一顆黑色圓鈕、前緣兩個投幣口。"""
    front_mat = ctx.param_mat("front_material", ctx.material)
    ball = ctx.param_mat("ball_material", ctx.material)
    knob = ctx.param_mat("knob_material", ctx.material)
    slot = ctx.param_mat("slot_material", ctx.material)
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    deck_top = z0 + 0.18
    data = shapes.MeshData()
    # 檯面（往後伸進機身裡，看不到接縫）
    data.extend(shapes.box(x0, y0 + 0.04, deck_top - 0.1, x1, y1, deck_top, ctx.material))
    # 橘色前緣
    data.extend(shapes.box(x0 - 0.01, y0, z0, x1 + 0.01, y0 + 0.04, deck_top + 0.01, front_mat))
    # 兩支搖桿：黑桿＋紅球
    for sx in (x0 + 0.22, x1 - 0.22):
        profile = [(0.0, deck_top - 0.02), (0.05, deck_top - 0.02), (0.05, deck_top + 0.01), (0.015, deck_top + 0.02),
                   (0.015, deck_top + 0.13), (0.06, deck_top + 0.15), (0.065, deck_top + 0.2), (0.04, deck_top + 0.24),
                   (0.0, deck_top + 0.25)]
        mats = [knob, knob, knob, knob, ball, ball, ball, ball]
        data.extend(shapes.lathe(profile, 10, mats, center=(sx, y0 + 0.2, 0.0)))
    # 中間的黑色圓鈕
    data.extend(shapes.lathe([(0.0, deck_top - 0.01), (0.08, deck_top - 0.01), (0.075, deck_top + 0.04), (0.0, deck_top + 0.05)],
                             12, knob, center=((x0 + x1) / 2, y0 + 0.2, 0.0)))
    # 投幣口（前緣上兩個深色小方塊）
    for cx in ((x0 + x1) / 2 - 0.2, (x0 + x1) / 2 + 0.2):
        data.extend(shapes.box(cx - 0.07, y0 - 0.012, z0 + 0.05, cx + 0.07, y0 + 0.005, z0 + 0.12, slot))
    return _local_data(ctx, data)


@register("rm_coin_door")
def build_rm_coin_door(ctx):
    """投幣門：深灰面板＋右邊一顆橘色旋鈕（朝前）＋左上一個小黑窗。"""
    knob = ctx.param_mat("knob_material", ctx.material)
    window = ctx.param_mat("window_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    data = shapes.MeshData()
    data.extend(shapes.box(x0, y0 + 0.02, z0, x1, y1, z1, ctx.material))
    data.extend(shapes.box(x0 + 0.05, y0 + 0.005, z1 - 0.2, x0 + 0.24, y0 + 0.02, z1 - 0.06, window))
    data.extend(shapes.lathe([(0.0, y0 - 0.06), (0.05, y0 - 0.05), (0.06, y0 + 0.0), (0.05, y0 + 0.03)], 10, knob, axis="y",
                             center=(x1 - 0.1, 0.0, (z0 + z1) / 2 - 0.05)))
    return _local_data(ctx, data)


# ─────────────────────────────── 左側 kitbash（朝 -x） ───────────────────────────────

@register("rm_camera")
def build_rm_camera(ctx):
    """左上角的橘色相機：方盒＋朝左的鏡頭（奶油色鏡筒、深色鏡片）＋頂上奶油色提把。"""
    lens = ctx.param_mat("lens_material", ctx.material)
    trim = ctx.param_mat("trim_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    bx0 = x0 + 0.1  # 盒子左緣，左邊 0.1 留給鏡頭
    cy, cz = (y0 + y1) / 2, (z0 + z1 - 0.06) / 2
    data = shapes.MeshData()
    data.extend(shapes.box(bx0, y0, z0, x1 + 0.03, y1, z1 - 0.06, ctx.material))
    # 鏡頭：沿 x 的旋轉體（鏡筒奶油色、前端深色鏡片）
    r = min(y1 - y0, z1 - z0) * 0.3
    profile = [(r * 0.9, bx0 + 0.01), (r, bx0 - 0.03), (r, x0 + 0.03), (r * 0.8, x0 + 0.02), (0.0, x0 + 0.01)]
    data.extend(shapes.lathe(profile, 12, [trim, trim, lens, lens], axis="x", center=(0.0, cy, cz)))
    # 提把：盒子頂上一條奶油色的 ㄇ 形管
    hx = (bx0 + x1) / 2
    data.extend(shapes.sweep([(hx, y0 + 0.06, z1 - 0.07), (hx, y0 + 0.06, z1 - 0.01), (hx, y1 - 0.06, z1 - 0.01),
                              (hx, y1 - 0.06, z1 - 0.07)], 0.015, 5, trim))
    return _local_data(ctx, data)


@register("rm_speaker")
def build_rm_speaker(ctx):
    """左側的大喇叭圓盤（朝左）：奶油色外圈＋深灰喇叭網（同一個旋轉體），網上五個深色圓孔。"""
    grille = ctx.param_mat("grille_material", ctx.material)
    hole = ctx.param_mat("hole_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    cy, cz = (y0 + y1) / 2, (z0 + z1) / 2
    R = min(y1 - y0, z1 - z0) / 2
    wall = x1 + 0.02  # 插進機身一點點
    face = x0 + 0.02
    profile = [(R * 0.9, wall), (R, wall - 0.04), (R, face + 0.03), (R * 0.92, face), (R * 0.72, face + 0.02), (R * 0.68, face + 0.04),
               (0.0, face + 0.04)]
    mats = [ctx.material, ctx.material, ctx.material, ctx.material, ctx.material, grille]
    data = shapes.lathe(profile, 20, mats, axis="x", center=(0.0, cy, cz))
    # 五個圓孔：中間一個、周圍四個
    for oy, oz in ((0.0, 0.0), (R * 0.36, 0.0), (-R * 0.36, 0.0), (0.0, R * 0.36), (0.0, -R * 0.36)):
        data.extend(shapes.lathe([(0.0, face + 0.035), (R * 0.12, face + 0.035), (R * 0.12, face + 0.05), (0.0, face + 0.05)], 8, hole,
                                 axis="x", center=(0.0, cy + oy, cz + oz)))
    return _local_data(ctx, data)


def _side_knob(x_face, cy, cz, radius, height, mat):
    """從盒子左側面（x_face）往左凸出的圓鈕（沿 x 的旋轉體）"""
    return shapes.lathe([(radius * 0.9, x_face + 0.01), (radius, x_face - height * 0.4), (radius * 0.85, x_face - height),
                         (0.0, x_face - height - 0.005)], 10, mat, axis="x", center=(0.0, cy, cz))


@register("rm_knob_box")
def build_rm_knob_box(ctx):
    """左側旋鈕盒：深灰盒（朝左那面）＋一顆大橘鈕、兩顆紅色小鈕。"""
    big = ctx.param_mat("knob_material", ctx.material)
    small = ctx.param_mat("small_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    face = x0 + 0.06
    data = shapes.MeshData()
    data.extend(shapes.box(face, y0, z0, x1 + 0.02, y1, z1, ctx.material))
    cz = (z0 + z1) / 2
    data.extend(_side_knob(face, y0 + (y1 - y0) * 0.32, cz, 0.065, 0.06, big))
    data.extend(_side_knob(face, y0 + (y1 - y0) * 0.75, cz + 0.05, 0.035, 0.04, small))
    data.extend(_side_knob(face, y0 + (y1 - y0) * 0.75, cz - 0.05, 0.035, 0.04, small))
    return _local_data(ctx, data)


@register("rm_candy_box")
def build_rm_candy_box(ctx):
    """左側糖果按鈕盒：深灰盒＋一排彩色圓按鈕（params.colors 依序）。"""
    colors = [ctx.mat(name) for name in ctx.param("colors", [ctx.material])]
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    face = x0 + 0.04
    data = shapes.MeshData()
    data.extend(shapes.box(face, y0, z0, x1 + 0.02, y1, z1, ctx.material))
    cz = (z0 + z1) / 2
    for k, mat in enumerate(colors):
        cy = y0 + (y1 - y0) * (k + 0.5) / len(colors)
        data.extend(_side_knob(face, cy, cz, 0.03, 0.035, mat))
    return _local_data(ctx, data)


@register("rm_vent_box")
def build_rm_vent_box(ctx):
    """左下的奶油色盒子：朝左那面三條深色通風槽。"""
    vent = ctx.param_mat("vent_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    face = x0 + 0.01
    data = shapes.MeshData()
    data.extend(shapes.box(face, y0, z0, x1 + 0.02, y1, z1, ctx.material))
    for k in range(3):
        z = z1 - 0.1 - k * 0.07
        data.extend(shapes.box(x0, y0 + 0.08, z - 0.018, face + 0.004, y1 - 0.08, z + 0.018, vent))
    return _local_data(ctx, data)


@register("rm_feet")
def build_rm_feet(ctx):
    """四個腳墊。"""
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    data = shapes.MeshData()
    for fx in (x0, x1 - 0.1):
        for fy in (y0, y1 - 0.1):
            data.extend(shapes.box(fx, fy, z0, fx + 0.1, fy + 0.1, z1 + 0.01, ctx.material))
    return _local_data(ctx, data)
