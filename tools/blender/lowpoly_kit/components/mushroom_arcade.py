"""香菇電子遊樂中心（mushroom_arcade）：參考圖的兩層遊樂中心，用 mainHall 香菇屋的語彙簡化。

零件（全部是新的 kind，前綴 ma_）：
  - ma_base：圓角方形底座平台
  - ma_block：圓角方塊屋身（俯看超橢圓、側看中段微微鼓起，像香菇屋的胖肚子）
  - ma_band：樓層之間的木腰帶（圓角厚板）＋下緣一圈青苔細邊
  - ma_neon_ring：繞屋身一圈的青色霓虹燈條
  - ma_door：綠色八角拱門框＋內圈霓虹＋發光的門內面板
  - ma_window：框（可選青色像素框／木框）＋發光玻璃＋直窗格＋窗台
  - ma_sign：圓角木招牌＋深色字面＋綠框；可以貼牆，也可以立在屋頂（兩根支柱）
  - ma_spotted_cluster：三朵發光紫香菇，傘上的白色斑點是「把傘面上幾個面換成白色材質」，不加幾何
  - ma_big_mushroom：大紫香菇（菇柄＋傘一個旋轉體），傘邊垂下的吊飾「繩＋珠＋小香菇」也各是一個旋轉體
  - ma_cabinet：大街機台（側面輪廓擠出）＋紫色側板＋發光螢幕＋搖桿按鈕
  - ma_mini_shrooms：底座四周的小紫菇

貼在牆上的零件（門、窗、招牌）要知道牆在哪：plan 的 params.wall_bounds 給「所屬屋身」的 bounds，
用和 ma_block 同一個公式（_wall_front）算出牆面，零件再往外放 —— 牆有弧度，平平放上去邊緣會懸空或陷進牆裡。
所有共用數字都是資產座標（原點在底座中心地面、+Z 朝上、正面朝 -Y），最後用 _local() 換成零件局部座標。
"""

import math

from .. import shapes
from . import register
from .earth_mamas import _ROOF, _roof_inner_z, shell_half_depth

# 屋身的圓角程度（超橢圓指數）：越大越接近方形。
# 6 = 四角還是圓的，但正面平的範圍比較大：窗內畫面（decal）是平的，靠轉角的窗在 4 時畫面會超出彎曲的窗框
ROUND_P = 6.0
# 屋身側面中段鼓出的比例（相對於半深度）
BELLY = 0.05


def _local(ctx, p):
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    return (p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2, p[2] - z0)


def _local_data(ctx, data):
    return data.map(lambda v: _local(ctx, v))


def _superellipse(cx, cy, hw, hd, p, count, scale=1.0, phase=0.0):
    """俯看的圓角方形（超橢圓）：|x/hw|^p + |y/hd|^p = 1，從正面中央開始逆時針取 count 點。"""
    pts = []
    e = 2.0 / p
    for i in range(count):
        t = phase + math.tau * i / count - math.pi / 2  # 從 -y（正面）開始
        c, s = math.cos(t), math.sin(t)
        x = cx + hw * scale * math.copysign(abs(c) ** e, c)
        y = cy + hd * scale * math.copysign(abs(s) ** e, s)
        pts.append((x, y))
    return pts


def _block_frame(bounds, p=ROUND_P, belly=BELLY):
    (x0, y0, z0), (x1, y1, z1) = bounds
    return {"cx": (x0 + x1) / 2, "cy": (y0 + y1) / 2, "hw": (x1 - x0) / 2, "hd": (y1 - y0) / 2,
            "z0": z0, "z1": z1, "p": p, "belly": belly}


def _bulge(f, z):
    """高度 z 處的鼓出倍率：底、頂為 1，中段最大 1 + belly"""
    t = min(max((z - f["z0"]) / max(f["z1"] - f["z0"], 1e-6), 0.0), 1.0)
    return 1.0 + f["belly"] * math.sin(math.pi * t)


def _wall_front(f, x, z):
    """屋身正面在 (x, z) 處的 y（負值，越小越往外）。

    - 一般屋身（ma_block）：超橢圓＋中段鼓出，跟 ma_block 的形狀是同一個公式
    - 弧形牆（Happy Fat 的 em_arc_shell，頂部跟著半弧屋頂）：用 earth_mamas 的 shell_half_depth
    """
    if f.get("arc"):
        return -shell_half_depth(f["roof"], x, z, f["z0"])
    u = min(abs(x - f["cx"]) / f["hw"], 0.985)
    half = f["hd"] * (1.0 - u ** f["p"]) ** (1.0 / f["p"])
    return f["cy"] - half * _bulge(f, z)


def _wall_front_min(f, xs, zs):
    """一塊範圍內牆面最外側（最小 y）：貼牆的零件要從這裡再往外，才不會有地方陷進牆裡"""
    return min(_wall_front(f, x, z) for x in xs for z in zs)


def _wall(ctx):
    arc = ctx.param("arc_wall")
    if arc:
        # 貼在弧形牆（em_arc_shell）上：arc_wall = 那面牆的屋頂參數＋牆底高度 z0
        roof = {k: arc.get(k, v) for k, v in _ROOF.items()}
        return {"arc": True, "roof": roof, "z0": arc.get("z0", 3.5)}
    bounds = ctx.param("wall_bounds")
    if not bounds:
        return None
    return _block_frame(bounds, ctx.param("wall_round_p", ROUND_P), ctx.param("wall_belly", BELLY))


def _conform_slab(f, cx, z0, z1, half_width, out, depth, mat, nx=12, nz=10):
    """貼著彎曲牆面的面板（玻璃、門內面板）：每個高度一圈切面，前緣每一點都照牆面公式算深度。

    平的面板放在有弧度的牆上，邊緣會凸出一塊（看得到厚度）或陷進牆裡；
    這裡前面永遠在牆面外 out、後面埋進牆裡 depth，所以整片都剛好浮在牆面上。
    half_width(z)：這個高度面板的半寬（拱門上面會變窄）。
    """
    rings = []
    for k in range(nz + 1):
        z = z0 + (z1 - z0) * k / nz
        hw = max(half_width(z), 0.02)
        xs = [cx - hw + 2 * hw * i / nx for i in range(nx + 1)]
        front = [(x, _wall_front(f, x, z) - out, z) for x in xs]
        back = [(x, _wall_front(f, x, z) + depth, z) for x in reversed(xs)]
        rings.append(front + back)
    return shapes.loft(rings, mat)


def _on_wall(f, points, out):
    """把 (x, z) 路徑換成貼在牆面外 out 的 3D 點（沒有牆就用 out 當 y）"""
    if f is None:
        return [(x, out, z) for x, z in points]
    return [(x, _wall_front(f, x, z) - out, z) for x, z in points]


def _closed_path(points, gap=0.02):
    """首尾留一點縫的「幾乎閉合」路徑：sweep 不能真的閉合（首尾重複頂點會變成非流形）"""
    a, b = points[0], points[1]
    d = math.dist(a, b) or 1.0
    head = tuple(a[i] + (b[i] - a[i]) * gap / d for i in range(3))
    return [head] + points[1:] + [points[0]]


def _rounded_rect(cx, cz, w, h, radius, steps=4):
    """xz 平面上的圓角長方形輪廓（逆時針）"""
    radius = min(radius, w / 2 - 1e-3, h / 2 - 1e-3)
    hw, hh = w / 2 - radius, h / 2 - radius
    pts = []
    for ox, oz, a0 in ((hw, -hh, -math.pi / 2), (hw, hh, 0.0), (-hw, hh, math.pi / 2), (-hw, -hh, math.pi)):
        for k in range(steps + 1):
            a = a0 + (math.pi / 2) * k / steps
            pts.append((cx + ox + radius * math.cos(a), cz + oz + radius * math.sin(a)))
    return pts


# ─────────────────────────────── 主體 ───────────────────────────────

@register("ma_base")
def build_ma_base(ctx):
    """圓角方形底座：超橢圓輪廓沿 z 擠出（1 個封閉島）。"""
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    outline = _superellipse((x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, ctx.param("round_p", 5.0), 48)
    data = shapes.prism(outline, z0, z1, "xyz", ctx.material)
    return _local_data(ctx, data)


@register("ma_block")
def build_ma_block(ctx):
    """圓角方塊屋身：每個高度一圈超橢圓，由下往上 loft（1 個封閉島）；中段微微鼓出。"""
    f = _block_frame(ctx.comp["bounds"], ctx.param("round_p", ROUND_P), ctx.param("belly", BELLY))
    rows, count = 8, 56
    rings = []
    for k in range(rows + 1):
        z = f["z0"] + (f["z1"] - f["z0"]) * k / rows
        scale = _bulge(f, z)
        rings.append([(x, y, z) for x, y in _superellipse(f["cx"], f["cy"], f["hw"], f["hd"], f["p"], count, scale)])
    data = shapes.loft(rings, ctx.material)
    return _local_data(ctx, data)


@register("ma_band")
def build_ma_band(ctx):
    """樓層之間的木腰帶：圓角厚板（上半）＋下緣一圈稍微大一點的青苔細邊（兩個島）。"""
    lip = ctx.param_mat("lip_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    cx, cy, hw, hd = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    p = ctx.param("round_p", ROUND_P)
    lip_h = (z1 - z0) * 0.28
    data = shapes.MeshData()
    # 木板：比青苔邊小 0.04（青苔邊從下面露出來一圈）
    wood = _superellipse(cx, cy, hw - 0.04, hd - 0.04, p, 56)
    data.extend(shapes.prism(wood, z0 + lip_h + 0.002, z1, "xyz", ctx.material))
    moss = _superellipse(cx, cy, hw, hd, p, 56)
    data.extend(shapes.prism(moss, z0, z0 + lip_h, "xyz", lip))
    return _local_data(ctx, data)


@register("ma_neon_ring")
def build_ma_neon_ring(ctx):
    """繞屋身一圈的青色霓虹燈條：params.rings = [{"bounds": 所繞的腰帶 bounds, "z": 高度}]，每圈一條細管。"""
    data = shapes.MeshData()
    for ring in ctx.param("rings", []):
        (x0, y0, _z0), (x1, y1, _z1) = ring["bounds"]
        cx, cy, hw, hd = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
        pts = [(x, y, ring["z"]) for x, y in _superellipse(cx, cy, hw + 0.035, hd + 0.035, ROUND_P, 44)]
        data.extend(shapes.sweep(_closed_path(pts), 0.04, 5, ctx.material))
    return _local_data(ctx, data)


# ─────────────────────────────── 門、窗 ───────────────────────────────

def _octa_arch(cx, z0, w, h, inset=0.0):
    """八角拱門輪廓（xz 平面，逆時針）：下半是直邊、上半切兩個斜角＋平頂（參考圖的八角門框）"""
    hw = w / 2 - inset
    top = z0 + h - inset
    shoulder = z0 + h * 0.62
    chamfer = hw * 0.55
    bottom = z0
    return [(cx - hw, bottom), (cx + hw, bottom), (cx + hw, shoulder), (cx + hw - chamfer, top), (cx - hw + chamfer, top),
            (cx - hw, shoulder)]


def _densify(outline, step=0.15):
    """把輪廓每條邊切成好幾段：沿彎曲的牆貼時，每一點才能各自算牆面深度"""
    out = []
    for i, a in enumerate(outline):
        b = outline[(i + 1) % len(outline)]
        n = max(1, int(math.dist(a, b) / step))
        for k in range(n):
            t = k / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


@register("ma_door")
def build_ma_door(ctx):
    """綠色八角拱門：門框是沿輪廓掃出的粗管、內圈一道青色霓虹細管、門內一塊發光面板（店內，decal 貼在上面）。

    三樣都逐點貼著彎曲的牆面（_conform_slab、_on_wall）：牆有弧度，平平放上去邊緣會凸出一塊。
    """
    neon = ctx.param_mat("neon_material", ctx.material)
    inner = ctx.param_mat("inner_material", ctx.material)
    (x0, y0, z0), (x1, _y1, z1) = ctx.comp["bounds"]
    cx, w, h = (x0 + x1) / 2, x1 - x0, z1 - z0
    f = _wall(ctx)
    data = shapes.MeshData()
    # 門內發光面板：八角形，肩膀以上兩邊斜收
    hw0 = w / 2 - 0.16
    shoulder = z0 + h * 0.62
    top = z1 - 0.16
    chamfer = hw0 * 0.55

    def half_width(z):
        if z <= shoulder:
            return hw0
        return hw0 - chamfer * (z - shoulder) / max(top - shoulder, 1e-6)

    data.extend(_conform_slab(f, cx, z0, top, half_width, 0.03, 0.3, inner, nx=8, nz=8))
    # 綠色門框（粗管）、內圈青色霓虹（細管）
    frame = _on_wall(f, _densify(_octa_arch(cx, z0, w, h, inset=0.12)), 0.1)
    data.extend(shapes.sweep(_closed_path(frame), 0.12, 6, ctx.material))
    glow = _on_wall(f, _densify(_octa_arch(cx, z0, w, h, inset=0.3)), 0.12)
    data.extend(shapes.sweep(_closed_path(glow), 0.035, 6, neon))
    return _local_data(ctx, data)


@register("ma_window")
def build_ma_window(ctx):
    """窗：發光玻璃（貼著牆面，decal 貼在上面）＋外框（粗管，逐點貼牆）＋直窗格（columns − 1 條）＋窗台。"""
    glass = ctx.param_mat("glass_material", ctx.material)
    mullion = ctx.param_mat("mullion_material", ctx.material)
    (x0, y0, z0), (x1, _y1, z1) = ctx.comp["bounds"]
    cx, w = (x0 + x1) / 2, x1 - x0
    f = _wall(ctx)
    sill_h = 0.14
    gz0 = z0 + sill_h  # 窗台在 bounds 底下那一段，窗本體在上面
    cz, h = (gz0 + z1) / 2, z1 - gz0
    data = shapes.MeshData()
    # 發光玻璃：圓角長方形的半寬隨高度變（四角圓）
    gw, gh, radius = w - 0.18, h - 0.18, 0.12
    gz_lo, gz_hi = cz - gh / 2, cz + gh / 2

    def half_width(z):
        dz = max(0.0, max(gz_lo + radius - z, z - (gz_hi - radius)))
        return gw / 2 - radius + math.sqrt(max(radius * radius - dz * dz, 0.0))

    data.extend(_conform_slab(f, cx, gz_lo, gz_hi, half_width, 0.02, 0.3, glass, nx=8, nz=6))
    # 外框：粗管，逐點貼牆
    frame = _on_wall(f, _densify(_rounded_rect(cx, cz, w - 0.1, h - 0.1, 0.16)), 0.08)
    data.extend(shapes.sweep(_closed_path(frame), 0.08, 6, ctx.material))
    # 直窗格：細方條，深度照那條窗格所在 x 的牆面
    columns = max(1, int(ctx.param("columns", 2)))
    for k in range(1, columns):
        x = x0 + 0.09 + (w - 0.18) * k / columns
        wall_y = min(_wall_front(f, x, z) for z in (gz_lo, cz, gz_hi)) if f else y0
        data.extend(shapes.box(x - 0.035, wall_y - 0.07, gz_lo + 0.03, x + 0.035, wall_y + 0.1, gz_hi - 0.03, mullion))
    # 窗台：在窗的正下方，深度取這段牆面最外側
    wall_y = min(_wall_front(f, x, gz0) for x in (x0, cx, x1)) if f else y0
    data.extend(shapes.box(x0 - 0.02, wall_y - 0.2, z0, x1 + 0.02, wall_y + 0.12, gz0, mullion))
    return _local_data(ctx, data)


# ─────────────────────────────── 招牌 ───────────────────────────────

@register("ma_sign")
def build_ma_sign(ctx):
    """圓角木招牌＋深色字面＋外框（字是 decal，貼在字面上）。

    - 有 params.wall_bounds：貼在那面牆前（從牆面最外側往外）
    - params.stand = true：立在屋頂上，招牌在上半，兩根木柱撐到 bounds 底
    - 都沒有：照 bounds 的 y 範圍放（例如從側牆伸出來的直立招牌）
    """
    frame = ctx.param_mat("frame_material", ctx.material)
    face = ctx.param_mat("face_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    cx = (x0 + x1) / 2
    stand = bool(ctx.param("stand", False))
    board_z0 = z0 + (z1 - z0) * 0.22 if stand else z0
    cz, w, h = (board_z0 + z1) / 2, x1 - x0, z1 - board_z0
    f = _wall(ctx)
    if f:
        # 招牌是掛上去的平板：前面平的、在牆面最外側再往外；背面伸到牆面最內側再往裡，邊緣不會露縫
        xs, zs = (x0, cx, x1), (board_z0, cz, z1)
        outer = _wall_front_min(f, xs, zs)
        inner = max(_wall_front(f, x, z) for x in xs for z in zs)
        front = outer - 0.22
        back = inner + 0.08
    else:
        front, back = y0, y1
    radius = min(0.22, w * 0.2, h * 0.2)
    data = shapes.MeshData()
    # 木板（整塊）
    data.extend(shapes.prism(_rounded_rect(cx, cz, w - 0.08, h - 0.08, radius), front + 0.04, back, "xzy", ctx.material))
    # 深色字面：比木板小一圈、往前凸 0.02（decal 貼在這上面）
    data.extend(shapes.prism(_rounded_rect(cx, cz, w - 0.3, h - 0.3, radius * 0.7), front + 0.02, front + 0.06, "xzy", face))
    # 外框（管）
    rim = [(x, front + 0.03, z) for x, z in _densify(_rounded_rect(cx, cz, w - 0.1, h - 0.1, radius))]
    data.extend(shapes.sweep(_closed_path(rim), 0.05, 6, frame))
    if stand:
        for px in (x0 + w * 0.22, x1 - w * 0.22):
            data.extend(shapes.box(px - 0.07, front + 0.06, z0, px + 0.07, back - 0.02, board_z0 + 0.1, ctx.material))
    return _local_data(ctx, data)


# ─────────────────────────────── 香菇 ───────────────────────────────

def _roof_base(ctx, x, fallback):
    """params.on_roof（半弧屋頂的參數，跟 em_arc_roof 同一組）：x 處屋頂「外側」的高度，香菇種在這上面。

    屋頂是彎的（左高右低），同一叢香菇每朵的底部高度都不一樣；
    沒給 on_roof 就用 bounds 的底（平的屋頂平台）。往下埋 0.06，菇柄跟屋頂之間不會有縫。
    """
    roof = ctx.param("on_roof")
    if not roof:
        return fallback
    r = {k: roof.get(k, v) for k, v in _ROOF.items()}
    return _roof_inner_z(r, x) + r["thickness"] - 0.06


def _mushroom_profile(R, stem_r, stem_h, cap_h, z0=0.0):
    """菇柄＋菇傘一條旋轉體剖面（從菇柄底 → 傘底菌褶 → 傘緣 → 圓頂 → 頂點），回傳 (profile, 每段的角色)"""
    profile = [
        (0.0, z0),
        (stem_r * 1.15, z0),
        (stem_r, z0 + stem_h * 0.3),
        (stem_r * 0.92, z0 + stem_h),            # 菇柄頂（插進傘底）
        (R * 0.55, z0 + stem_h + cap_h * 0.12),  # 菌褶往外
        (R * 0.97, z0 + stem_h + cap_h * 0.02),
        (R, z0 + stem_h + cap_h * 0.16),          # 傘緣
        (R * 0.9, z0 + stem_h + cap_h * 0.5),
        (R * 0.66, z0 + stem_h + cap_h * 0.84),
        (R * 0.32, z0 + stem_h + cap_h * 0.98),
        (0.0, z0 + stem_h + cap_h),
    ]
    roles = ["stem", "stem", "stem", "under", "under", "rim", "cap", "cap", "cap", "cap"]
    return profile, roles


def _mushroom(center, R, stem_r, stem_h, cap_h, mats, segments=16):
    profile, roles = _mushroom_profile(R, stem_r, stem_h, cap_h)
    return shapes.lathe(profile, segments, [mats[r] for r in roles], center=center)


def _add_spots(data, start, center, mats, cap_mat, spot_mat, rng, chance=0.22):
    """把傘面（cap 材質、朝上的面）中的一部分換成白色斑點材質：不加幾何、不增加島數"""
    for i in range(start, len(data.faces)):
        if data.mats[i] != cap_mat:
            continue
        verts = [data.verts[v] for v in data.faces[i]]
        z = sum(v[2] for v in verts) / len(verts)
        if z < center[2] and rng.random() < 0.5:
            continue
        if rng.random() < chance:
            data.mats[i] = spot_mat


@register("ma_spotted_cluster")
def build_ma_spotted_cluster(ctx):
    """屋頂一叢三朵發光紫香菇（一大兩小），傘上有白色斑點（換材質的面，不加幾何）。"""
    stem = ctx.param_mat("stem_material", ctx.material)
    spot = ctx.param_mat("spot_material", ctx.material)
    rim = ctx.param_mat("rim_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    w, d, h = x1 - x0, y1 - y0, z1 - z0
    mats = {"stem": stem, "under": rim, "rim": rim, "cap": ctx.material}
    # (x 比例, y 比例, 傘半徑比例, 總高比例)：一朵大的在中後、兩朵小的在前面左右
    layout = ((0.5, 0.55, 0.36, 1.0), (0.2, 0.3, 0.2, 0.55), (0.8, 0.25, 0.22, 0.62))
    data = shapes.MeshData()
    for fx, fy, fr, fh in layout:
        R = min(w, d) * fr
        total = h * fh
        cap_h = R * 0.75
        cx = x0 + w * fx
        base = _roof_base(ctx, cx, z0)
        # 種在屋頂上時，高度以「屋頂表面到 bounds 頂」算：底部被屋頂抬高了，還用 bounds 的高度會長出 bounds 外
        total = (z1 - base) * fh
        cap_h = min(cap_h, total * 0.45)
        center = (cx, y0 + d * fy, base)
        start = len(data.faces)
        data.extend(_mushroom(center, R, R * 0.22, total - cap_h, cap_h, mats, 18))
        _add_spots(data, start, (center[0], center[1], base + total - cap_h * 0.5), mats, ctx.material, spot, ctx.rng)
    return _local_data(ctx, data)


def _hanger(top, length, rng, string, cap, stem):
    """一條吊飾：「繩 → 珠 → 繩 → 倒掛的小香菇 → 繩 → 尾端小珠」做成一個旋轉體（1 個島）"""
    x, y, ztop = top
    s = 0.025  # 繩子半徑
    bead = 0.09 + rng.random() * 0.03
    z = ztop
    seg = length / 6
    profile = [(0.0, z), (s, z - 0.01)]
    roles = ["s"]
    # 珠
    profile += [(s, z - seg), (bead, z - seg - bead), (s, z - seg - bead * 2)]
    roles += ["s", "b", "b"]
    z2 = z - seg * 3
    # 小香菇（傘朝上：先是傘頂，再往下到傘緣、菌褶、菇柄）
    cap_r = 0.16 + rng.random() * 0.05
    profile += [(s, z2 + 0.18), (cap_r * 0.6, z2 + 0.15), (cap_r, z2 + 0.06), (cap_r * 0.9, z2), (0.05, z2 - 0.02),
                (0.05, z2 - 0.16)]
    roles += ["s", "c", "c", "c", "st", "st"]
    z3 = z2 - 0.16 - seg
    profile += [(s, z3), (0.06, z3 - 0.06), (0.0, z3 - 0.13)]
    roles += ["s", "b", "b"]
    mats = {"s": string, "b": cap, "c": cap, "st": stem}
    return shapes.lathe(profile, 8, [mats[r] for r in roles], center=(x, y, 0.0))


@register("ma_big_mushroom")
def build_ma_big_mushroom(ctx):
    """大紫香菇：菇柄＋傘（深紫邊、粉紫菌褶）一個旋轉體；傘邊垂下 hangers 條吊飾（各一個旋轉體）。"""
    stem = ctx.param_mat("stem_material", ctx.material)
    rim = ctx.param_mat("rim_material", ctx.material)
    under = ctx.param_mat("under_material", ctx.material)
    string = ctx.param_mat("string_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    R = min(x1 - x0, y1 - y0) / 2
    total = z1 - z0
    z0 = _roof_base(ctx, cx, z0)
    total = z1 - z0  # 種在屋頂上時底部被抬高，高度改以屋頂表面到 bounds 頂算
    cap_h = min(R * 0.62, total * 0.45)
    stem_h = total - cap_h
    data = _mushroom((cx, cy, z0), R, R * 0.2, stem_h, cap_h, {"stem": stem, "under": under, "rim": rim, "cap": ctx.material}, 20)
    count = int(ctx.param("hangers", 3))
    for k in range(count):
        # 吊飾掛在傘緣內側、偏正面（-y）那一半，看得到
        a = -math.pi / 2 + (k - (count - 1) / 2) * 0.9
        top = (cx + math.cos(a) * R * 0.78, cy + math.sin(a) * R * 0.78, z0 + stem_h + cap_h * 0.08)
        length = min(stem_h * 0.8, 1.0 + 0.25 * ((k * 7) % 3))
        data.extend(_hanger(top, length, ctx.rng, string, ctx.material, stem))
    return _local_data(ctx, data)


@register("ma_mini_shrooms")
def build_ma_mini_shrooms(ctx):
    """底座四周的小紫菇：沿底座邊緣挑 6 個位置，各一朵（菇柄＋傘一個旋轉體）。"""
    stem = ctx.param_mat("stem_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    cx, cy, hw, hd = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2
    h = z1 - z0
    # (超橢圓上的角度比例, 大小比例)：避開正面中央的大門
    spots = ((0.03, 0.9), (0.12, 0.7), (0.38, 1.0), (0.58, 0.8), (0.82, 0.95), (0.93, 0.75))
    data = shapes.MeshData()
    for frac, size in spots:
        t = math.tau * frac - math.pi / 2
        c, s = math.cos(t), math.sin(t)
        x = cx + (hw - 0.35) * math.copysign(abs(c) ** 0.4, c)
        y = cy + (hd - 0.35) * math.copysign(abs(s) ** 0.4, s)
        R = 0.28 * size
        data.extend(_mushroom((x, y, z0), R, R * 0.3, h * size - R * 0.7, R * 0.7,
                              {"stem": stem, "under": stem, "rim": ctx.material, "cap": ctx.material}, 8))
    return _local_data(ctx, data)


# ─────────────────────────────── 街機台 ───────────────────────────────

@register("ma_cabinet")
def build_ma_cabinet(ctx):
    """大街機台：側面輪廓（yz）沿 x 擠出成機身；兩側紫色側板（同輪廓稍大）；斜螢幕一塊發光板；搖桿＋三顆按鈕。"""
    trim = ctx.param_mat("trim_material", ctx.material)
    screen = ctx.param_mat("screen_material", ctx.material)
    button = ctx.param_mat("button_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    d, h = y1 - y0, z1 - z0
    # 側面輪廓（y, z）：正面朝 -y。從背面底部逆時針：背面 → 頂 → 招牌前緣 → 斜螢幕 → 操作台 → 下段正面
    prof = [
        (y1, z0),
        (y1, z1),
        (y0 + d * 0.18, z1),
        (y0 + d * 0.18, z0 + h * 0.86),     # 頂上招牌的下緣
        (y0 + d * 0.38, z0 + h * 0.82),
        (y0 + d * 0.22, z0 + h * 0.56),     # 斜螢幕下緣
        (y0, z0 + h * 0.5),                  # 操作台前緣
        (y0, z0 + h * 0.45),
        (y0 + d * 0.16, z0 + h * 0.42),
        (y0 + d * 0.16, z0),
    ]
    side_w = 0.08
    data = shapes.MeshData()
    data.extend(shapes.prism(prof, x0 + side_w + 0.002, x1 - side_w - 0.002, "yzx", ctx.material))
    # 紫色側板：同輪廓、往外多 0.04
    grow = [(y + (0.04 if y == y1 else -0.04 if y <= y0 + d * 0.2 else 0.0), z) for y, z in prof]
    data.extend(shapes.prism(grow, x0, x0 + side_w, "yzx", trim))
    data.extend(shapes.prism(grow, x1 - side_w, x1, "yzx", trim))
    # 斜螢幕：貼在 (y0+0.38d, 0.82h) → (y0+0.22d, 0.56h) 那條斜面上，往外凸 0.02
    a = (y0 + d * 0.38, z0 + h * 0.82)
    b = (y0 + d * 0.22, z0 + h * 0.56)
    nx, nz = -(b[1] - a[1]), (b[0] - a[0])  # 斜面法線（朝外前上方）
    nl = math.hypot(nx, nz)
    nx, nz = nx / nl * 0.03, nz / nl * 0.03
    inset = 0.12
    ta = (a[0] + (b[0] - a[0]) * 0.08, a[1] + (b[1] - a[1]) * 0.08)
    tb = (a[0] + (b[0] - a[0]) * 0.92, a[1] + (b[1] - a[1]) * 0.92)
    quad = [(ta[0] - nx, ta[1] - nz), (tb[0] - nx, tb[1] - nz), (tb[0] + nx * 0.1, tb[1] + nz * 0.1), (ta[0] + nx * 0.1, ta[1] + nz * 0.1)]
    data.extend(shapes.prism(quad, x0 + side_w + inset, x1 - side_w - inset, "yzx", screen))
    # 搖桿＋三顆按鈕（立在操作台上）
    deck_z = z0 + h * 0.5
    stick_x = x0 + (x1 - x0) * 0.3
    data.extend(shapes.lathe([(0.0, deck_z - 0.02), (0.035, deck_z - 0.02), (0.03, deck_z + 0.2), (0.09, deck_z + 0.24),
                              (0.07, deck_z + 0.32), (0.0, deck_z + 0.34)], 8, button, center=(stick_x, y0 + d * 0.1, 0.0)))
    for k in range(3):
        bx = x0 + (x1 - x0) * (0.55 + 0.13 * k)
        data.extend(shapes.lathe([(0.0, deck_z - 0.03), (0.06, deck_z - 0.03), (0.06, deck_z + 0.04), (0.0, deck_z + 0.06)],
                                 8, button, center=(bx, y0 + d * 0.1, 0.0)))
    return _local_data(ctx, data)
