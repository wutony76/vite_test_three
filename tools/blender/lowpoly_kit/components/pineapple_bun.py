"""菠蘿麵包（pineapple_bun）：菠蘿油（上下兩半夾一片厚奶油）＋頂上插一塊卡通木牌「Welcome / HFYY world.」。

零件（前綴 pb_）：
  - pb_bun_bottom：下半顆，旋轉體（lathe）：底部圓、側面外鼓，上方切口是平的麵包心（crumb 材質）
  - pb_butter：厚奶油片：圓角矩形一層層 loft 起來（上下緣往內收，像切過的奶油邊角），略斜放
  - pb_bun_top：上半顆酥皮圓頂，旋轉體＋「龜裂格」：圓頂上撒幾個種子方向（voronoi），
    每個頂點看自己離最近、第二近的種子差多少，差很少 = 在兩格交界 → 往內壓成溝，格子中間略鼓起。
    只移動頂點、不加面，所以整顆仍是 1 個封閉島（organic profile 要求）
  - pb_sign_stakes：兩根木樁（多邊形斷面的 sweep），一根稍歪
  - pb_sign_board：兩片上下疊的歪斜木板（不規則輪廓沿 y 擠出），木樁在板子後面
  - pb_sign_moss：木板上緣幾叢青苔（壓扁的 blob）＋小紅菇（菇柄、菇傘各一個旋轉體）

座標：builder 回傳零件局部座標（原點在 bounds 底面中心、z 介於 0～h、-y 是正面）。
形狀先依「設計比例」做出來，最後用 _fit() 縮放平移到剛好填滿 bounds：Geometry QA 會檢查超出 bounds、尺寸不足。
"""

import math

from .. import shapes
from . import register


def _signed_area(points):
    return sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(points, points[1:] + points[:1])) / 2


def _prism_out(outline, a0, a1, axes, mat):
    """prism，保證面朝外（奇數次軸互換時輪廓要反過來，見 dance_machine._prism_out）。"""
    odd = axes in ("xzy", "yxz", "zyx")
    ccw = _signed_area(outline) > 0
    if odd == ccw:
        outline = list(reversed(outline))
    return shapes.prism(outline, a0, a1, axes, mat)


def _fit(ctx, data, axes="xyz"):
    """把 data 縮放、平移到剛好填滿零件局部 bounds（x ±hw、y ±hd、z 0～h）。axes 裡沒有的軸只置中不縮放。"""
    lo = [min(v[i] for v in data.verts) for i in range(3)]
    hi = [max(v[i] for v in data.verts) for i in range(3)]
    target_lo = (-ctx.hw, -ctx.hd, 0.0)
    target_hi = (ctx.hw, ctx.hd, ctx.h)
    scale, offset = [], []
    for i, name in enumerate("xyz"):
        span = max(hi[i] - lo[i], 1e-9)
        s = (target_hi[i] - target_lo[i]) / span if name in axes else 1.0
        scale.append(s)
        # 縮放後的中心對到目標中心
        offset.append((target_lo[i] + target_hi[i]) / 2 - (lo[i] + hi[i]) / 2 * s)
    return data.map(lambda v: tuple(v[i] * scale[i] + offset[i] for i in range(3)))


# ─────────────────────────────── 麵包 ───────────────────────────────

@register("pb_bun_bottom")
def build_pb_bun_bottom(ctx):
    """下半顆：底部圓潤、側面外鼓；最上面一圈往內收到切口，切口（最後一段）是米白麵包心。"""
    crumb = ctx.param_mat("crumb_material", "crumb")
    r, h = 1.0, 0.66
    profile = [
        (0.0, 0.0),
        (0.55 * r, 0.02),
        (0.80 * r, 0.08),
        (0.95 * r, 0.20),
        (1.00 * r, 0.36),
        (0.98 * r, 0.52),
        (0.93 * r, h),
        (0.0, h),
    ]
    mats = [ctx.material] * (len(profile) - 2) + [crumb]
    data = shapes.lathe(profile, ctx.segments(2.6, minimum=24), mats, axis="z", phase=ctx.rng.random() * 0.2)
    return _fit(ctx, data)


def _seed_directions(rng, count):
    """圓頂上的龜裂格種子：在上半球大致均勻撒點（費波那契螺旋＋一點亂數，格子大小才不會差太多）。"""
    seeds = []
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(count):
        # z 從接近頂點到接近赤道（赤道以下是切口，不需要格子）
        z = 1.0 - (i + 0.5) / count * 0.95
        ring = math.sqrt(max(0.0, 1 - z * z))
        a = i * golden + rng.uniform(-0.25, 0.25)
        x, y = math.cos(a) * ring, math.sin(a) * ring
        z += rng.uniform(-0.03, 0.03)
        n = math.sqrt(x * x + y * y + z * z)
        seeds.append((x / n, y / n, z / n))
    return seeds


@register("pb_bun_top")
def build_pb_bun_top(ctx):
    """上半顆菠蘿酥皮圓頂：平底（麵包心切口）＋圓頂，圓頂上壓出龜裂格的溝。

    溝的那些面換成 groove_material（深一點的橘褐色）：只壓凹的話，遠看幾乎看不出格子；
    換材質不會多出幾何島（同一個網格裡只是面的材質不同）。
    """
    crumb = ctx.param_mat("crumb_material", "crumb")
    groove_mat = ctx.param_mat("groove_material", ctx.material)
    cells = int(ctx.param("cells", 22))
    groove = float(ctx.param("groove_depth", 0.035)) / max(ctx.h, 1e-6)  # 換成設計比例（高 1）
    r = 1.0
    # 先做一個「高 1、半徑 1」的圓頂，最後 _fit 到 bounds
    rings = max(14, ctx.segments(1.4, minimum=14))
    profile = [(0.0, 0.0), (0.97 * r, 0.0), (1.0 * r, 0.06)]
    for k in range(1, rings):
        t = k / rings * (math.pi / 2)
        profile.append((math.cos(t) * r, 0.06 + math.sin(t) * 0.94))
    profile.append((0.0, 1.0))
    mats = [crumb] + [ctx.material] * (len(profile) - 2)
    data = shapes.lathe(profile, ctx.segments(4.0, minimum=40), mats, axis="z", phase=ctx.rng.random() * 0.2)

    seeds = _seed_directions(ctx.rng, cells)
    edges = []  # 每個頂點「多靠近溝」：1 = 溝底、0 = 格子裡

    def crackle(v):
        x, y, z = v
        # 平底和切口邊那一圈不動（只壓圓頂）
        if z < 0.07:
            edges.append(0.0)
            return v
        n = math.sqrt(x * x + y * y + z * z) or 1.0
        d = (x / n, y / n, z / n)
        dots = sorted((sum(d[i] * s[i] for i in range(3)) for s in seeds), reverse=True)
        # 最近、第二近的種子夾角差：0 = 剛好在兩格交界（溝底），越大越靠格子中心
        gap = math.acos(max(-1.0, min(1.0, dots[1]))) - math.acos(max(-1.0, min(1.0, dots[0])))
        edge = max(0.0, 1.0 - gap / 0.14)          # 溝的寬度（弧度）
        center = min(1.0, gap / 0.45)              # 格子中心略鼓
        # 越靠近切口，溝越淺（側邊下緣不要被切得坑坑巴巴）
        fade = min(1.0, (z - 0.07) / 0.2)
        edges.append(edge * fade)
        push = -groove * edge ** 1.2 + groove * 0.45 * center
        k = 1.0 + push * fade
        # 沿著「球心 → 頂點」方向推進推出（圓頂近似半球，球心就在底面中心）
        return (x * k, y * k, z * k)

    data.map(crackle)
    # 一個面的頂點平均「靠近溝」超過一半，就換成溝的材質
    for i, face in enumerate(data.faces):
        if data.mats[i] != ctx.material:
            continue
        if sum(edges[j] for j in face) / len(face) > 0.42:
            data.mats[i] = groove_mat
    return _fit(ctx, data)


@register("pb_butter")
def build_pb_butter(ctx):
    """厚奶油片：圓角矩形，上下緣往內收（倒角），整片繞 z 轉 yaw_deg 斜放。"""
    a, b = 1.0, 0.8           # 長、寬（設計比例）
    corner = 0.1
    steps = 3                 # 每個圓角幾段

    def outline(inset):
        pts = []
        hw, hd, rc = a / 2 - inset, b / 2 - inset, max(corner - inset, 0.02)
        for cx, cy, a0 in ((hw - rc, hd - rc, 0), (-hw + rc, hd - rc, 90), (-hw + rc, -hd + rc, 180), (hw - rc, -hd + rc, 270)):
            for s in range(steps + 1):
                t = math.radians(a0 + 90 * s / steps)
                pts.append((cx + math.cos(t) * rc, cy + math.sin(t) * rc))
        return pts

    t = 0.14                  # 厚度（設計比例）
    bevel = 0.025
    levels = [(0.0, bevel), (bevel, 0.0), (t - bevel, 0.0), (t, bevel)]
    rings = [[(x, y, z) for x, y in outline(inset)] for z, inset in levels]
    data = shapes.loft(rings, ctx.material)
    yaw = math.radians(float(ctx.param("yaw_deg", -12)))
    c, s = math.cos(yaw), math.sin(yaw)
    data.map(lambda v: (v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]))
    return _fit(ctx, data)


# ─────────────────────────────── 木牌 ───────────────────────────────

@register("pb_sign_stakes")
def build_pb_sign_stakes(ctx):
    """兩根木樁：六角斷面的 sweep，稍微有點彎、一根往外歪；頂端是平的。"""
    count = int(ctx.param("count", 2))
    lean = math.radians(float(ctx.param("lean_deg", 4)))
    data = shapes.MeshData()
    radius = 0.045
    for i in range(count):
        x = -0.26 + 0.52 * i / max(count - 1, 1)
        tilt = lean * (1 if i == count - 1 else -0.4)
        path = []
        for k in range(5):
            z = ctx.h * k / 4
            bend = math.sin(k / 4 * math.pi) * 0.01 * (1 if i % 2 else -1)
            path.append((x + math.sin(tilt) * z + bend, 0.0, z))
        data.extend(shapes.sweep(path, radius * (1.0 + 0.08 * i), 6, ctx.material, phase=ctx.rng.random()))
    return _fit(ctx, data, axes="xz")


def _plank_outline(rng, x0, x1, z0, z1, rot_deg):
    """一片木板的正面輪廓（x, z）：上下緣各有一點起伏、兩端削成不規則的斜角，最後繞中心轉 rot_deg。"""
    pts = []
    # 下緣：左 → 右
    for k in range(6):
        t = k / 5
        pts.append((x0 + 0.03 + (x1 - x0 - 0.06) * t, z0 + rng.uniform(-0.008, 0.008)))
    # 右端：兩個點，削斜
    pts.append((x1, z0 + (z1 - z0) * rng.uniform(0.2, 0.4)))
    pts.append((x1 - rng.uniform(0.0, 0.03), z0 + (z1 - z0) * rng.uniform(0.7, 0.9)))
    # 上緣：右 → 左
    for k in range(6):
        t = k / 5
        pts.append((x1 - 0.03 - (x1 - x0 - 0.06) * t, z1 + rng.uniform(-0.008, 0.008)))
    # 左端
    pts.append((x0 + rng.uniform(0.0, 0.03), z0 + (z1 - z0) * rng.uniform(0.6, 0.85)))
    pts.append((x0, z0 + (z1 - z0) * rng.uniform(0.15, 0.35)))
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    r = math.radians(rot_deg)
    c, s = math.cos(r), math.sin(r)
    return [(cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c) for x, z in pts]


@register("pb_sign_board")
def build_pb_sign_board(ctx):
    """兩片歪斜木板：下片短一點往右偏、上片長一點往左偏，各自轉一點角度；板子之間留一條細縫。"""
    planks = int(ctx.param("planks", 2))
    tilt = float(ctx.param("tilt_deg", -4))
    data = shapes.MeshData()
    w, h = ctx.w, ctx.h
    gap = 0.012
    plank_h = (h - gap * (planks - 1)) / planks
    for i in range(planks):
        z0 = i * (plank_h + gap)
        z1 = z0 + plank_h
        # 下片往右偏、上片往左偏，看起來是手工釘上去的
        shift = (0.03 if i % 2 == 0 else -0.03)
        x0 = -w / 2 + 0.04 + shift
        x1 = w / 2 - 0.04 + shift
        rot = tilt * (0.6 if i % 2 == 0 else -0.5) + ctx.rng.uniform(-1.0, 1.0)
        outline = _plank_outline(ctx.rng, x0, x1, z0, z1, rot)
        data.extend(_prism_out(outline, -ctx.hd, ctx.hd, "xzy", ctx.material))
    return _fit(ctx, data, axes="xz")


@register("pb_sign_moss")
def build_pb_sign_moss(ctx):
    """木板上緣的青苔（壓扁、略不規則的 blob）＋小紅菇（菇柄＋半圓菇傘，各一個旋轉體）。"""
    cap = ctx.param_mat("cap_material", "shroom_red")
    stem = ctx.param_mat("stem_material", "shroom_stem")
    tufts = int(ctx.param("tufts", 4))
    shrooms = int(ctx.param("shrooms", 2))
    data = shapes.MeshData()
    # 青苔：沿上緣排開（左邊多一點），每叢長短不一
    xs = [-0.42, -0.12, 0.2, 0.45, -0.3, 0.05][:tufts]
    for x in xs:
        length = ctx.rng.uniform(0.09, 0.16)
        data.extend(shapes.blob((x, 0.0, 0.035), (length, 0.05, 0.03), ctx.material, segments=7, rings=4, jitter=0.12, rng=ctx.rng))
    # 小紅菇：長在左右兩邊的青苔上
    spots = [(-0.4, 0.0), (0.42, 0.01)][:shrooms]
    for i, (x, y) in enumerate(spots):
        sh = 0.08 + 0.025 * i
        data.extend(shapes.lathe([(0.0, 0.0), (0.016, 0.0), (0.013, sh), (0.0, sh)], 6, stem, axis="z", center=(x, y, 0.03)))
        cr = 0.045 + 0.012 * i
        cap_profile = [(0.0, 0.0), (cr, 0.0), (cr * 0.9, cr * 0.45), (cr * 0.55, cr * 0.8), (0.0, cr * 0.95)]
        data.extend(shapes.lathe(cap_profile, 8, cap, axis="z", center=(x, y, 0.03 + sh - 0.01)))
    return _fit(ctx, data)
