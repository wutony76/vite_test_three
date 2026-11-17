"""動物：第二版卡通小豬（pig_v2）的零件。

為什麼拆成好幾個零件（身體、四隻腳、兩隻耳朵、尾巴）：
  Three.js 端要讓腳前後擺、耳朵晃、尾巴搖，這些部位必須是獨立的節點；
  第一版小豬把所有部位 Voxel Remesh 成一團，連顏色都融掉，只能整隻一起移動。
"""

import math

from .. import shapes
from . import register


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------

def _rotate_x(v, angle):
    c, s = math.cos(angle), math.sin(angle)
    return (v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c)


def _rotate_y(v, angle):
    c, s = math.cos(angle), math.sin(angle)
    return (v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c)


def _fit_into_bounds(data, ctx):
    """等比縮放＋平移，讓整個零件剛好塞進自己的 bounds（x ±hw、y ±hd、z 0～h）。

    耳朵、尾巴是「先畫形狀、再旋轉傾斜」，轉完的大小很難手算；
    少了這一步，零件會超出 plan 的 bounds（Geometry QA 會報），或縮在框裡一小角。
    """
    xs, ys, zs = zip(*data.verts)
    size = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
    scale = min(ctx.w / size[0], ctx.d / size[1], ctx.h / size[2])
    cx, cy, z0 = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)
    return data.map(lambda v: ((v[0] - cx) * scale, (v[1] - cy) * scale, (v[2] - z0) * scale))


def _ellipse_ring(y, zc, rx, rz, count):
    """垂直於 Y 軸的橢圓環（身體的一個切面）。"""
    return [(rx * math.cos(math.tau * k / count), y, zc + rz * math.sin(math.tau * k / count)) for k in range(count)]


# ---------------------------------------------------------------------------
# 身體＋頭：一條沿 Y 軸的 loft
# ---------------------------------------------------------------------------

@register("pig_body")
def build_pig_body(ctx):
    """屁股（+Y）→ 圓肚子 → 微收的脖子 → 比身體大的頭 → 扁圓柱豬鼻（-Y 最前端）。

    整隻是同一條 loft，所以是 1 個封閉的幾何島（organic profile 要求 =1）；
    豬鼻只是最後一段換材質，不是另外黏一顆球上去。
    下面的數字是「佔 bounds 的比例」：y 以 hd 為單位（-1 = 最前、+1 = 最後），z、半徑以 h 為單位。
    """
    head = ctx.param("head_ratio", 1.12)       # 頭的半徑 ÷ 肚子的半徑（Q 版 > 1）
    neck = ctx.param("neck_pinch", 0.9)        # 脖子半徑 ÷ 肚子半徑
    snout_mat = ctx.param_mat("snout_material", ctx.material)
    count = max(10, ctx.segments(1.2))
    hd, h = ctx.hd, ctx.h
    belly_rx, belly_rz = min(ctx.hw * 0.8, h * 0.4), h * 0.36
    head_r = belly_rz * head

    # (y 比例, 中心高度比例, rx, rz)
    sections = [
        (1.00, 0.36, belly_rx * 0.30, belly_rz * 0.32),   # 屁股尖（尾巴從這附近長出來）
        (0.86, 0.36, belly_rx * 0.78, belly_rz * 0.78),
        (0.60, 0.365, belly_rx, belly_rz),                # 肚子最寬
        (0.28, 0.38, belly_rx * 0.97, belly_rz * 0.97),
        (0.02, 0.43, belly_rx * neck, belly_rz * neck),   # 脖子
        (-0.20, 0.52, head_r * 0.92, head_r * 0.9),
        (-0.44, 0.55, head_r, head_r),                    # 頭最大（Q 版：比肚子大）
        (-0.66, 0.535, head_r * 0.93, head_r * 0.91),
        (-0.80, 0.50, head_r * 0.68, head_r * 0.66),      # 臉往前收
        (-0.83, 0.47, head_r * 0.44, head_r * 0.36),      # 豬鼻起點（臉上的台階）
        (-1.00, 0.47, head_r * 0.44, head_r * 0.36),      # 豬鼻正面
    ]
    rings = [_ellipse_ring(-yf * -hd, zf * h, rx, rz, count) for yf, zf, rx, rz in sections]
    # 每段（環與環之間）一個材質：最後一段是豬鼻側面，端面跟著最後一段一起用豬鼻色
    mats = [ctx.material] * (len(rings) - 2) + [snout_mat]
    return shapes.loft(rings, mats)


# ---------------------------------------------------------------------------
# 腳
# ---------------------------------------------------------------------------

@register("pig_leg")
def build_pig_leg(ctx):
    """短短的圓柱腿，底部一圈深色蹄。上端會插進肚子裡，所以從外面看不到接縫。"""
    hoof = ctx.param_mat("hoof_material", ctx.material)
    r = min(ctx.hw, ctx.hd) * 0.92
    h = ctx.h
    taper = ctx.param("taper", 1.0)  # 腳底半徑 ÷ 腿頂半徑；< 1 是上粗下細的圓錐腳（存錢筒）
    bottom = r * taper
    profile = [
        (0.0, 0.0),
        (bottom * 0.9, 0.0),                   # 蹄底
        (bottom * 0.97, h * 0.2),              # 蹄
        (bottom * 0.93 + (r - bottom) * 0.1, h * 0.23),  # 蹄和腿的交界往內收一點，看得出是兩段
        (bottom + (r - bottom) * 0.5, h * 0.45),
        (r, h),
        (0.0, h),
    ]
    mats = [hoof, hoof, ctx.material, ctx.material, ctx.material, ctx.material]
    return shapes.lathe(profile, max(8, ctx.segments(0.8)), mats)


# ---------------------------------------------------------------------------
# 耳朵
# ---------------------------------------------------------------------------

@register("pig_ear")
def build_pig_ear(ctx):
    """三角形厚片：正面（朝前）深粉色、背面和側邊身體色；尖端往前垂、往外張。"""
    inner = ctx.param_mat("inner_material", ctx.material)
    side = ctx.param("side", 1)
    half, tall, thick = 0.5, 1.0, ctx.param("thickness", 0.18)
    # 正面三角形（y = -thick/2）與背面三角形（y = +thick/2）；尖端在 z = tall
    # 正面多一個中間點，讓耳朵有一點「凹進去」的厚度感
    front = [(-half, -thick / 2, 0.0), (half, -thick / 2, 0.0), (0.0, -thick / 2, tall)]
    back = [(-half * 1.05, thick / 2, 0.0), (half * 1.05, thick / 2, 0.0), (0.0, thick / 2, tall * 1.04)]
    verts = front + back
    faces = [
        (0, 1, 2),                      # 正面（內側）
        (5, 4, 3),                      # 背面
        (0, 3, 4, 1),                   # 底邊（插進頭裡）
        (1, 4, 5, 2),                   # 右斜邊
        (2, 5, 3, 0),                   # 左斜邊
    ]
    mats = [inner, ctx.material, ctx.material, ctx.material, ctx.material]
    data = shapes.single(verts, faces, mats)
    # 往前傾 tilt_forward 度（繞 X 軸，尖端往 -Y）、往外張 splay 度（繞 Y 軸，尖端往外側）
    forward = math.radians(ctx.param("tilt_forward", 55))
    splay = math.radians(ctx.param("splay", 18))
    data.map(lambda v: _rotate_y(_rotate_x(v, -forward), splay * side))
    return _fit_into_bounds(data, ctx)


# ---------------------------------------------------------------------------
# 尾巴＋小花
# ---------------------------------------------------------------------------

def _flower(center, radius, thickness, petal_mat, center_mat, tilt):
    """五瓣小花：一片星形厚片（1 個封閉島）＋中間一顆花心。

    花瓣不是 5 顆球擺一圈：用「半徑隨角度起伏」的環 loft 成厚片，5 個花瓣天生連在一起。
    """
    count = 40

    def petal_radius(t):
        # |cos(2.5t)| 每圈有 5 個峰 → 5 片花瓣；0.45 是花瓣之間凹進去的深度
        return radius * (0.55 + 0.45 * abs(math.cos(2.5 * t)))

    def ring(z, shrink):
        return [(petal_radius(t) * shrink * math.cos(t), petal_radius(t) * shrink * math.sin(t), z)
                for t in (math.tau * k / count for k in range(count))]

    disc = shapes.loft([ring(-thickness / 2, 0.92), ring(0.0, 1.0), ring(thickness / 2, 0.92)], petal_mat)
    bud = shapes.blob((0.0, 0.0, thickness * 0.5), (radius * 0.36, radius * 0.36, radius * 0.24), center_mat,
                      segments=8, rings=4)
    disc.extend(bud)
    cx, cy, cz = center
    # 花朵面向後上方（從小豬背後、斜上方看得到花）：先讓花面朝 +Y，再往上抬 tilt
    return disc.map(lambda v: (lambda w: (w[0] + cx, w[1] + cy, w[2] + cz))(_rotate_x(v, -(math.pi / 2 - tilt))))


@register("pig_tail")
def build_pig_tail(ctx):
    """從屁股往後長出、捲一圈半的螺旋小尾巴；尾端一朵黃色五瓣小花。"""
    petal = ctx.param_mat("flower_material", ctx.material)
    bud = ctx.param_mat("flower_center_material", petal)
    steps = 16
    turns = 1.5
    path = []
    for k in range(steps + 1):
        t = k / steps
        angle = math.tau * turns * t
        coil = 0.28 * (1.0 - 0.35 * t)            # 越往外圈越小
        path.append((coil * math.sin(angle), -0.1 + 0.9 * t, 0.3 + coil * (1.0 - math.cos(angle)) * 0.9 + 0.15 * t))
    data = shapes.sweep(path, 0.075, 6, ctx.material)
    end = path[-1]
    data.extend(_flower((end[0], end[1] + 0.06, end[2] + 0.12), 0.5, 0.1, petal, bud, math.radians(35)))
    return _fit_into_bounds(data, ctx)


# ---------------------------------------------------------------------------
# 臉上的小點（腮紅）
# ---------------------------------------------------------------------------

@register("pig_face_dots")
def build_pig_face_dots(ctx):
    """左右臉頰各一片扁圓片，貼在 bounds 的左右兩端（plan 把 bounds 對準頭的兩側）。"""
    data = shapes.MeshData()
    r = min(ctx.d, ctx.h) * 0.32
    for side in (-1.0, 1.0):
        dot = shapes.blob((0.0, 0.0, 0.0), (r, r, r * 0.22), ctx.material, segments=10, rings=3)
        # 圓片的法線從 +Z 轉成朝外側、略朝前：先繞 Y 轉 90° 朝外，再繞 Z 讓它略朝前
        yaw = math.radians(28) * side
        dot.map(lambda v, s=side, yw=yaw: _rotate_y(v, s * math.pi / 2))
        dot.map(lambda v, yw=yaw: (v[0] * math.cos(yw) + v[1] * math.sin(yw),
                                   -v[0] * math.sin(yw) + v[1] * math.cos(yw), v[2]))
        dot.translate(side * (ctx.hw - r * 0.3), 0.0, ctx.h * 0.5)
        data.extend(dot)
    return data


# ---------------------------------------------------------------------------
# 粉紅色存錢筒小豬（pig_v2 第二款造型）
# ---------------------------------------------------------------------------

# (y 比例, 中心高度比例, rx 比例, rz 比例)；y 比例 +1 = 屁股、-1 = 豬鼻正面
_PIGGY_KEYS = [
    (1.00, 0.52, 0.25, 0.25),
    (0.90, 0.52, 0.62, 0.62),
    (0.70, 0.51, 0.88, 0.88),
    (0.40, 0.50, 1.00, 1.00),
    (0.05, 0.50, 1.00, 1.00),
    (-0.30, 0.51, 0.95, 0.95),
    (-0.55, 0.53, 0.82, 0.80),
    (-0.72, 0.55, 0.58, 0.56),   # 臉的正面
]
_PIGGY_SNOUT = (0.55, 0.40, 0.32)  # 豬鼻：中心高度、rx、rz 比例
# 環的 y 比例：屁股和臉這種曲率大的地方排密一點，輪廓才圓順，不會一段一段折
_PIGGY_RINGS = [1.0, 0.96, 0.9, 0.82, 0.7, 0.55, 0.38, 0.2, 0.02, -0.16, -0.32, -0.46, -0.58, -0.66, -0.72]
_RING_COUNT = 28                     # 每環 28 點：比 20 點圓，網頁端再做平滑著色就看不出折面


def _piggy_section(yf):
    """在關鍵切面之間線性內插，回傳 (中心高度比例, rx 比例, rz 比例)。"""
    keys = _PIGGY_KEYS
    for (y0, *a), (y1, *b) in zip(keys, keys[1:]):
        if y1 <= yf <= y0:
            t = (yf - y0) / (y1 - y0)
            return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
    return tuple(keys[0][1:] if yf > keys[0][0] else keys[-1][1:])


def _piggy_frame(body_bounds):
    (x0, y0, z0), (x1, y1, z1) = body_bounds
    return {"cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2, "z0": z0, "hd": (y1 - y0) / 2, "h": z1 - z0,
            "rx": (x1 - x0) / 2 * 0.98, "rz": (z1 - z0) * 0.48}


def _piggy_point(frame, yf, k):
    """身體表面（資產座標）：y 比例 yf、第 k 個角度格（k=0 在 +X 赤道，k 增加往上轉）。"""
    zf, rxf, rzf = _piggy_section(yf)
    t = math.tau * k / _RING_COUNT
    return (frame["cx"] + frame["rx"] * rxf * math.cos(t),
            frame["cy"] + yf * frame["hd"],
            frame["z0"] + zf * frame["h"] + frame["rz"] * rzf * math.sin(t))


def _to_local(ctx, point):
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    return (point[0] - (x0 + x1) / 2, point[1] - (y0 + y1) / 2, point[2] - z0)


@register("piggy_body")
def build_piggy_body(ctx):
    """圓胖的存錢筒身體＋頭（一條 loft，1 個封閉島），前端扁圓柱豬鼻。

    肚子是完整的圓弧，不再往內凹：小豬在畫面上很小，半透明肚子窗裡的金幣看不到，
    凹槽反而讓肚子看起來凹陷。
    """
    frame = _piggy_frame(ctx.comp["bounds"])
    snout_mat = ctx.param_mat("snout_material", ctx.material)
    rings = [[_to_local(ctx, _piggy_point(frame, yf, k)) for k in range(_RING_COUNT)] for yf in _PIGGY_RINGS]
    # 豬鼻：臉正面先往內收一圈（台階），再往前伸出扁圓柱
    zf, rxf, rzf = _PIGGY_SNOUT
    for yf in (-0.76, -1.0):
        ring = []
        for k in range(_RING_COUNT):
            t = math.tau * k / _RING_COUNT
            ring.append(_to_local(ctx, (frame["cx"] + frame["rx"] * rxf * math.cos(t), frame["cy"] + yf * frame["hd"],
                                        frame["z0"] + zf * frame["h"] + frame["rz"] * rzf * math.sin(t))))
        rings.append(ring)
    mats = [ctx.material] * (len(rings) - 2) + [snout_mat]
    return shapes.loft(rings, mats)


def _coin(radius, thick, face_mat, rim_mat):
    """一枚金幣：沿 Z 的扁圓柱，正反面中間金色、外圈一道深金色邊。"""
    profile = [(0.0, -thick / 2), (radius * 0.78, -thick / 2), (radius, -thick * 0.25), (radius, thick * 0.25),
               (radius * 0.78, thick / 2), (0.0, thick / 2)]
    return shapes.lathe(profile, 12, [face_mat, rim_mat, rim_mat, rim_mat, face_mat])


@register("piggy_slot")
def build_piggy_slot(ctx):
    """背上的投幣孔：沿前後方向的深色長圓（跑道形），從身體表面微微凸出一點。"""
    hw, hd = ctx.hw * 0.9, ctx.hd * 0.95
    # 逆時針：後端半圓（右 → 後 → 左），再接前端半圓（左 → 前 → 右）
    outline = [(hw * math.cos(math.pi * k / 6), (hd - hw) + hw * math.sin(math.pi * k / 6)) for k in range(7)]
    outline += [(hw * math.cos(math.pi + math.pi * k / 6), -(hd - hw) + hw * math.sin(math.pi + math.pi * k / 6))
                for k in range(7)]
    return shapes.prism(outline, 0.0, ctx.h, "xyz", ctx.material)


@register("piggy_top_coin")
def build_piggy_top_coin(ctx):
    """插在投幣孔上的金幣：立著（正面朝左右），下半截藏在身體裡。"""
    rim = ctx.param_mat("rim_material", ctx.material)
    radius = min(ctx.hd, ctx.h / 2)
    coin = _coin(radius, ctx.w, ctx.material, rim)
    # 沿 Z 的金幣轉成沿 X（正面朝左右），再把圓心放到 bounds 中間
    return coin.map(lambda v: (v[2], v[1], v[0] + ctx.h / 2))
