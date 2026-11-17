"""奇幻香菇屋（mushroom_house）：葫蘆形屋身、斜戴的大菇傘、門窗、小藍菇、吊飾、水窪底座、地上小物。

門、窗、小藍菇要「貼在」彎曲的屋身上，吊飾要「掛在」斜斜的菇傘邊上，
所以這裡把屋身的剖面（_BODY_PROFILE）和菇傘的擺法（_cap_transform）寫成共用函式：
每個零件用同一套數字算出自己在表面上的位置和朝向，屋身改形狀時門窗會跟著走，不會懸空或埋進牆裡。

所有共用數字都是「資產座標」（原點在底座中心地面、+Z 朝上、正面朝 -Y），
每個零件最後再用 _local() 換成自己 bounds 的局部座標。
"""

import math

from .. import shapes
from . import register

# 屋身剖面 (半徑, 高度)：三層葫蘆（下層最胖、中層、頂層小一點），兩個脖子各圍一圈青苔，
# 頂端伸進菇傘裡（被菇傘蓋住）。使用者要求從兩層加成三層：中間多一個白色的球
_BODY_PROFILE = [
    (0.0, 0.0),
    (1.75, 0.0),   # 第一層加寬加胖（使用者要求）：舊版 1.45 / 1.6 / 1.68 / 1.5
    (1.95, 0.3),
    (2.05, 1.2),
    (1.82, 2.2),
    (1.2, 2.9),
    (0.95, 3.3),   # 第一個脖子（青苔）
    (1.1, 3.7),
    (1.38, 4.5),   # 中層
    (1.25, 5.2),
    (0.92, 5.7),   # 第二個脖子（青苔）
    (1.05, 6.1),
    (1.28, 6.8),   # 頂層
    (1.15, 7.5),
    (0.9, 7.9),
    (0.68, 8.5),
    (0.0, 8.7),
]
_MOSS_BANDS = ((3.05, 3.55), (5.5, 5.95))  # 青苔帶窄一點：太寬會把中層的白色擠得很小

# 菇傘：中心在 (0, 0, CAP_BASE_Z)，剖面 (半徑, 高度)；先做「正著戴」的，再整個斜過去
_CAP_BASE_Z = 7.5  # 屋身加了一層（+2.3 m），菇傘跟著往上
_CAP_PROFILE = [
    (0.0, 0.9),    # 底面中心（往上凹，屋身頂端伸進來）
    (1.0, 0.75),
    (2.2, 0.35),
    (3.05, 0.0),   # 底面外緣
    (3.2, 0.1),    # 紅色木板邊
    (3.25, 0.45),
    (3.0, 0.75),   # 圓頂
    (2.4, 1.35),
    (1.4, 1.85),
    (0.0, 2.05),
]
_CAP_UNDER, _CAP_RIM = 3, 2  # 前 3 段是底面、接著 2 段是木板邊，其餘是圓頂


def _local(ctx, p):
    (x0, y0, z0), (x1, y1, _z1) = ctx.comp["bounds"]
    return (p[0] - (x0 + x1) / 2, p[1] - (y0 + y1) / 2, p[2] - z0)


def _local_data(ctx, data):
    return data.map(lambda v: _local(ctx, v))


def body_radius(z):
    """屋身在高度 z 的半徑（剖面線性內插）。"""
    pts = _BODY_PROFILE
    for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return 0.0


def _rotate(v, axis, angle):
    """Rodrigues：v 繞單位向量 axis 轉 angle。"""
    c, s = math.cos(angle), math.sin(angle)
    d = shapes._dot(axis, v)
    cr = shapes._cross(axis, v)
    return tuple(v[i] * c + cr[i] * s + axis[i] * d * (1 - c) for i in range(3))


def _cap_transform(tilt_degrees, toward_degrees):
    """菇傘的斜法：低的那一側朝 toward（方位角，度；0 = +X、90 = +Y），傾斜 tilt 度。

    回傳 f(p)：把「正著戴、中心在原點」的菇傘座標換到資產座標。
    """
    a = math.radians(toward_degrees)
    low = (math.cos(a), math.sin(a), 0.0)
    # 讓 +Z 往「低側的反方向」倒：轉軸 = Z × (−low)
    axis = shapes._norm(shapes._cross((0.0, 0.0, 1.0), (-low[0], -low[1], 0.0)))
    tilt = math.radians(tilt_degrees)

    def f(p):
        q = _rotate(p, axis, tilt)
        return (q[0], q[1], q[2] + _CAP_BASE_Z)

    return f


def _surface_frame(azimuth_degrees, z, out=0.0):
    """屋身表面在 (方位角, 高度) 的點與方向：回傳 (中心點, 水平切線 u, 往上 v, 朝外 n)。

    方位角 270° = 正面（-Y）。n 用剖面的斜率修正：表面是斜的時候，門窗也會跟著微微仰或俯。
    """
    a = math.radians(azimuth_degrees)
    radial = (math.cos(a), math.sin(a), 0.0)
    r = body_radius(z)
    dz = 0.05
    slope = (body_radius(z + dz) - body_radius(z - dz)) / (2 * dz)  # dr/dz
    n = shapes._norm((radial[0], radial[1], -slope))
    u = (-math.sin(a), math.cos(a), 0.0)
    v = shapes._cross(n, u)
    center = (radial[0] * (r + out), radial[1] * (r + out), z)
    return center, u, v, n


def _frame_map(center, u, v, n):
    """局部 (a, b, c) → 資產座標：a 沿 u（水平）、b 沿 v（往上）、c 沿 n（往外）。"""
    return lambda p: tuple(center[i] + u[i] * p[0] + v[i] * p[1] + n[i] * p[2] for i in range(3))


@register("mush_body")
def build_mush_body(ctx):
    """葫蘆形屋身：一個旋轉體（1 個封閉島），脖子那幾段換成青苔色。"""
    moss = ctx.param_mat("moss_material", ctx.material)
    mats = []
    for (_r0, z0), (_r1, z1) in zip(_BODY_PROFILE, _BODY_PROFILE[1:]):
        mid = (z0 + z1) / 2
        mats.append(moss if any(lo <= mid <= hi for lo, hi in _MOSS_BANDS) else ctx.material)
    data = shapes.lathe(_BODY_PROFILE, max(24, ctx.segments(2.4)), mats)
    return _local_data(ctx, data)


@register("mush_house_cap")
def build_mush_house_cap(ctx):
    """大菇傘：旋轉體（底面黃橘、邊緣紅木板、圓頂紫藍），整個斜戴。1 個封閉島。"""
    rim = ctx.param_mat("rim_material", ctx.material)
    under = ctx.param_mat("under_material", ctx.material)
    mats = [under] * _CAP_UNDER + [rim] * _CAP_RIM
    mats += [ctx.material] * (len(_CAP_PROFILE) - 1 - len(mats))
    data = shapes.lathe(_CAP_PROFILE, max(28, ctx.segments(2.8)), mats)
    place = _cap_transform(ctx.param("tilt_degrees", 12), ctx.param("tilt_toward_degrees", 210))
    data.map(place)
    return _local_data(ctx, data)


def _arch_outline(width, height, steps=10):
    """拱形輪廓（下方長方形 + 上方半圓），逆時針；座標 (a, b)，底邊中心在原點。"""
    w = width / 2
    straight = height - w
    pts = [(-w, 0.0), (w, 0.0), (w, straight)]
    for k in range(1, steps):
        t = math.pi * k / steps
        pts.append((w * math.cos(t), straight + w * math.sin(t)))
    pts.append((-w, straight))
    return pts


@register("mush_door")
def build_mush_door(ctx):
    """拱門：木板紋理的門板＋綠色拱形門框＋兩條鐵鉸鍊＋黃銅門把＋門上方一扇小圓窗。

    門板用 door_wood 材質（plan 裡帶 Surface Engine 的 planks 木板貼圖），看得出一片片直木板和木紋；
    鉸鍊、門把、小圓窗是幾何，讓門面有層次（使用者要求「更精緻的材質設計」）。
    整扇門面向「門中心那個方位」的屋身法線，邊緣靠門框蓋住和彎牆的縫。
    """
    frame_mat = ctx.param_mat("frame_material", ctx.material)
    iron = ctx.param_mat("iron_material", ctx.material)
    brass = ctx.param_mat("brass_material", ctx.material)
    glass = ctx.param_mat("glass_material", ctx.material)
    (x0, y0, z0), (x1, y1, z1) = ctx.comp["bounds"]
    cx = ctx.param("door_x", (x0 + x1) / 2)
    width, height = 1.2, 2.1
    z_mid = z0 + height * 0.45
    r = body_radius(z_mid)
    azimuth = math.degrees(math.atan2(-math.sqrt(max(r * r - cx * cx, 0.01)), cx))
    center, u, v, n = _surface_frame(azimuth, z0 + 0.02)
    # 門板是平的、牆是凸的：門要放在「門高度範圍內最凸的那一點」的牆面上，
    # 不然門板中段會被凸出來的牆蓋住（實測第一版門板中間露出一塊白牆）。
    # 往後的厚度（-0.35）會埋進牆裡，所以門的下緣也不會有縫
    r_max = max(body_radius(z0 + height * k / 10) for k in range(11))
    a = math.radians(azimuth)
    foot = (math.cos(a) * (r_max - 0.08), math.sin(a) * (r_max - 0.08), z0 + 0.02)
    base = _frame_map(foot, u, (0.0, 0.0, 1.0), (math.cos(a), math.sin(a), 0.0))
    data = shapes.MeshData()
    # 1. 門板：拱形厚片，前面在 +0.14
    outline = _arch_outline(width, height)
    door = shapes.prism(outline, -0.35, 0.02, "xyz", ctx.material)  # (a, b) 是門面，第三軸是厚度
    data.extend(door.map(lambda p: base((p[0], p[1], p[2] + 0.12))))
    # 2. 門框：沿拱線掃一圈粗管（左下 → 左邊直線頂 → 沿半圓過拱頂 → 右邊直線頂 → 右下）
    w = width / 2 + 0.04
    straight = height - width / 2
    path = [(-w, 0.0, 0.18), (-w, straight, 0.18)]
    for k in range(1, 12):
        theta = math.pi - math.pi * k / 12
        path.append((w * math.cos(theta), straight + w * math.sin(theta), 0.18))
    path += [(w, straight, 0.18), (w, 0.0, 0.18)]
    data.extend(shapes.sweep(path, 0.13, 8, frame_mat).map(base))
    # 3. 兩條鐵鉸鍊：從左邊門框往右延伸到門板中間，尾端收成箭頭形（低多邊形的鍛鐵感）
    for hz in (height * 0.22, height * 0.62):
        strap = [(-w + 0.08, hz - 0.06), (0.05, hz - 0.06), (0.16, hz), (0.05, hz + 0.06), (-w + 0.08, hz + 0.06)]
        data.extend(shapes.prism(strap, 0.14, 0.18, "xyz", iron).map(base))
    # 4. 黃銅門把：右側一顆圓球
    data.extend(shapes.blob((width * 0.32, height * 0.42, 0.2), (0.07, 0.07, 0.06), brass, segments=8, rings=4).map(base))
    # 5. 小圓窗：門上方的深色玻璃＋綠色圓框（框留一點縫，避免頭尾頂點重疊）
    win_r, win_z = 0.17, straight + 0.05
    glass_ring = [(win_r * math.cos(math.tau * k / 12), win_z + win_r * math.sin(math.tau * k / 12)) for k in range(12)]
    data.extend(shapes.prism(glass_ring, 0.1, 0.15, "xyz", glass).map(base))
    ring = [((win_r + 0.03) * math.cos(t), win_z + (win_r + 0.03) * math.sin(t), 0.16)
            for t in ((math.tau - 0.05) * k / 16 for k in range(17))]
    data.extend(shapes.sweep(ring, 0.04, 5, frame_mat).map(base))
    return _local_data(ctx, data)


def _ring_path(radius, sides, phase=0.0, gap=0.04):
    """（幾乎）閉合的環形路徑：頭尾留一點點縫，避免 sweep 的兩端剛好疊在一起變成重複頂點。"""
    count = sides
    pts = []
    for k in range(count + 1):
        t = phase + (math.tau - gap) * k / count
        pts.append((radius * math.cos(t), radius * math.sin(t), 0.0))
    return pts


@register("mush_window")
def build_mush_window(ctx):
    """窗戶：深色玻璃（薄片）、窗框（掃出的環：圓窗或八角窗）、木十字窗格、上方一片小木簷。"""
    glass = ctx.param_mat("glass_material", ctx.material)
    wood = ctx.param_mat("wood_material", ctx.material)
    radius = ctx.param("radius", 0.5)
    shape = ctx.param("shape", "round")
    center, u, v, n = _surface_frame(ctx.param("azimuth", 270), ctx.param("z", 2.0))
    place = _frame_map(center, u, v, n)
    data = shapes.MeshData()
    sides = 8 if shape == "octagon" else 20
    phase = math.pi / 8 if shape == "octagon" else 0.0
    # 玻璃：多邊形厚片，表面略凹進牆面（-0.06），四周靠窗框蓋住
    outline = [(radius * math.cos(phase + math.tau * k / sides), radius * math.sin(phase + math.tau * k / sides))
               for k in range(sides)]
    data.extend(shapes.prism(outline, -0.3, -0.04, "xyz", glass).map(place))
    # 窗框
    data.extend(shapes.sweep(_ring_path(radius + 0.04, sides, phase), 0.1, 6, ctx.material).map(place))
    # 木十字
    t = 0.06
    data.extend(shapes.box(-radius * 0.95, -t, -0.08, radius * 0.95, t, 0.04, wood).map(place))
    data.extend(shapes.box(-t, -radius * 0.95, -0.12, t, radius * 0.95, 0.02, wood).map(place))
    # 小木簷：窗戶上方一片往外斜出的木板
    roof = shapes.box(-radius * 1.25, radius + 0.08, -0.05, radius * 1.25, radius + 0.24, 0.45, wood)
    tilt = math.radians(-18)
    roof.map(lambda p: (p[0], radius + 0.16 + (p[1] - radius - 0.16) * math.cos(tilt) - p[2] * math.sin(tilt),
                        (p[1] - radius - 0.16) * math.sin(tilt) + p[2] * math.cos(tilt)))
    data.extend(roof.map(place))
    return _local_data(ctx, data)


@register("mush_shelves")
def build_mush_shelves(ctx):
    """屋身右側長出的小藍菇（扁扁的半圓片，一半埋進牆裡）＋兩片小木片。"""
    wood = ctx.param_mat("wood_material", ctx.material)
    data = shapes.MeshData()
    spots = [(320, 4.05, 0.32), (330, 3.75, 0.26), (340, 2.55, 0.3), (350, 2.25, 0.28), (2, 1.95, 0.26), (12, 1.7, 0.22)]
    for az, z, size in spots:
        center, u, v, n = _surface_frame(az, z)
        place = _frame_map(center, u, v, n)
        cap = shapes.blob((0.0, 0.0, 0.0), (size, size * 0.24, size * 0.85), ctx.material, segments=10, rings=3)
        # blob 的 y 是扁的方向 → 轉成「往上薄」：(a, b, c) = (x, y, z) 的 y 當 b（上下）、z 當往外
        data.extend(cap.map(lambda p: place((p[0], p[1], p[2] * 0.9))))
    for az, z in ((305, 3.2), (355, 3.0)):
        center, u, v, n = _surface_frame(az, z)
        place = _frame_map(center, u, v, n)
        data.extend(shapes.box(-0.2, -0.07, -0.1, 0.2, 0.07, 0.18, wood).map(place))
    return _local_data(ctx, data)


# 菇傘上的香菇串：(菇傘上的方位角, 繩長, 香菇幾朵)。每串一個零件（decoration 最多 8 個島：繩子 1 + 香菇最多 5）
HANGER_STRINGS = ((200, 2.6, 4), (250, 2.0, 3), (300, 2.9, 5), (340, 2.4, 4))


def _mini_shiitake(center, scale, cap_mat, stem_mat):
    """一朵小香菇（菇柄＋菇傘）做成「一個」旋轉體：從菇柄底部往上、到菇傘底面、再繞過傘緣到傘頂。

    一朵就是 1 個封閉島 → 一串 3～5 朵加繩子，島數還在 decoration 的上限內。
    """
    s = scale
    profile = [
        (0.0, -0.18 * s),   # 菇柄底
        (0.07 * s, -0.18 * s),
        (0.07 * s, 0.02 * s),
        (0.3 * s, 0.0),     # 菇傘底面（往外）
        (0.33 * s, 0.06 * s),
        (0.28 * s, 0.14 * s),
        (0.15 * s, 0.2 * s),
        (0.0, 0.22 * s),    # 傘頂
    ]
    mats = [stem_mat, stem_mat, stem_mat, cap_mat, cap_mat, cap_mat, cap_mat]
    return shapes.lathe(profile, 10, mats, center=center)


@register("mush_hanger")
def build_mush_hanger(ctx):
    """菇傘邊垂下的一條香菇串：一條細繩，繩上串著 3～5 朵小香菇（菇傘朝上、大小略有變化）。"""
    cap = ctx.param_mat("cap_material", ctx.material)
    stem = ctx.param_mat("stem_material", ctx.material)
    az, length, count = HANGER_STRINGS[ctx.param("index", 0)]
    place_cap = _cap_transform(ctx.param("tilt_degrees", 12), ctx.param("tilt_toward_degrees", 210))
    a = math.radians(az)
    top = place_cap((math.cos(a) * 2.75, math.sin(a) * 2.75, 0.18))  # 傘底面靠邊的位置
    bottom = (top[0], top[1], top[2] - length)
    data = shapes.MeshData()
    data.extend(shapes.sweep([(top[0], top[1], top[2] + 0.1), bottom], 0.025, 4, ctx.material))
    # 香菇從繩子下端往上排，間距平均；越下面的越大一點（像真的一串晾著的香菇）
    spacing = (length - 0.45) / max(count, 1)
    for k in range(count):
        z = bottom[2] + 0.15 + spacing * k
        scale = 1.0 - 0.12 * k / max(count - 1, 1) + 0.06 * math.sin(k * 2.3 + az)
        data.extend(_mini_shiitake((bottom[0], bottom[1], z), scale, cap, stem))
    return _local_data(ctx, data)


@register("mush_puddle")
def build_mush_puddle(ctx):
    """粉紫色不規則水窪（星形起伏的薄片，1 個島）＋三片小圓石。"""
    rng = ctx.rng
    count = 28
    outline = []
    for k in range(count):
        t = math.tau * k / count
        # 幾個不同頻率的 sin 疊起來 → 邊緣起伏不規則，但不會自我交叉
        wobble = 0.82 + 0.1 * math.sin(3 * t + 0.6) + 0.06 * math.sin(5 * t + 1.9) + 0.03 * math.sin(9 * t)
        outline.append((math.cos(t) * ctx.hw * wobble, math.sin(t) * ctx.hd * wobble))
    data = shapes.prism(outline, 0.0, ctx.h * 0.8, "xyz", ctx.material)
    for x, y, r in ((-1.4, -2.6, 0.35), (0.4, -2.9, 0.3), (1.9, -2.2, 0.25)):
        data.extend(shapes.blob((x, y, ctx.h * 0.5), (r, r * 0.8, 0.05), ctx.material, segments=8, rings=3, rng=rng))
    return data


@register("mush_props")
def build_mush_props(ctx):
    """地上小物：左邊一叢紅色珊瑚狀小菇（幾根彎曲的掃線）、右邊一根木樁＋一圈繩、旁邊一截小木頭。"""
    coral = ctx.param_mat("coral_material", ctx.material)
    data = shapes.MeshData()
    # 珊瑚：從同一個根部往不同方向彎上去
    base = (-2.1, -1.2, 0.0)
    for k, (dx, dy, h) in enumerate(((-0.35, -0.1, 1.0), (0.2, -0.25, 1.2), (0.05, 0.25, 0.85))):
        path = [(base[0] + dx * t * t + 0.06 * k, base[1] + dy * t * t, h * t) for t in (i / 6 for i in range(7))]
        data.extend(shapes.sweep(path, 0.1 - 0.015 * k, 6, coral))
    # 木樁
    # 木樁放在陽台外側（第一層加胖後陽台變大，舊位置 (2.25, -0.9) 會被欄杆穿過）
    post = shapes.lathe([(0.0, 0.0), (0.22, 0.0), (0.2, 1.05), (0.0, 1.1)], 8, ctx.material, center=(2.8, -0.2, 0.0))
    data.extend(post)
    # 繩圈：掃一圈細管繞在木樁中段
    ring = [(2.8 + 0.25 * math.cos(t), -0.2 + 0.25 * math.sin(t), 0.6) for t in (5.9 * k / 20 for k in range(21))]
    data.extend(shapes.sweep(ring, 0.04, 4, coral))
    # 小木頭（橫躺）
    data.extend(shapes.lathe([(0.0, 0.0), (0.14, 0.0), (0.14, 0.55), (0.0, 0.55)], 8, ctx.material, axis="x",
                             center=(1.75, -1.6, 0.14)))
    return _local_data(ctx, data)


def _door_azimuth(door_x, z):
    """門中心 x（資產座標）在高度 z 對應的屋身方位角（度）：門在正面偏右。"""
    r = body_radius(z)
    return math.degrees(math.atan2(-math.sqrt(max(r * r - door_x * door_x, 0.01)), door_x))


@register("mush_balcony")
def build_mush_balcony(ctx):
    """門口延伸出去的半圓形陽台：木平台（厚片）＋一圈欄杆柱＋扶手（沿弧線掃出）＋前方一階台階。

    平台的圓心在門前牆面上，朝門的方位往外伸；門本身墊高到平台上（plan 裡 door 的 bounds z0 = 平台高）。
    """
    deck_h = ctx.param("deck_height", 0.32)
    radius = ctx.param("radius", 1.35)
    az = math.radians(_door_azimuth(ctx.param("door_x", 0.47), 1.0))
    out = (math.cos(az), math.sin(az), 0.0)
    side = (-math.sin(az), math.cos(az), 0.0)
    wall = body_radius(0.3) - 0.25  # 平台後緣插進牆裡一點，不會跟牆分開
    origin = (out[0] * wall, out[1] * wall, 0.0)

    def place(a, b, z):
        """a 沿牆面水平（side）、b 往外（out）"""
        return (origin[0] + side[0] * a + out[0] * b, origin[1] + side[1] * a + out[1] * b, z)

    data = shapes.MeshData()
    # 平台：半圓（往外那一側）＋後緣一點點直邊，逆時針
    steps = 14
    outline = [(radius * math.cos(math.pi * k / steps), radius * math.sin(math.pi * k / steps) + 0.25)
               for k in range(steps + 1)]
    outline += [(-radius, 0.0), (radius, 0.0)]
    outline = outline[-1:] + outline[:-1]
    deck = shapes.prism(outline, 0.0, deck_h, "xyz", ctx.material)
    data.extend(deck.map(lambda p: place(p[0], p[1], p[2])))
    # 欄杆柱：沿半圓外緣（門前那段留空，人才走得出去）
    rail_h = 0.75
    # 4 根柱子（左右各兩根）：decoration 最多 8 個島 = 平台 1 + 柱子 4 + 扶手 2 + 台階 1
    angles = [0.0, math.pi * 0.3, math.pi * 0.7, math.pi]
    for t in angles:
        a, b = (radius - 0.1) * math.cos(t), (radius - 0.1) * math.sin(t) + 0.25
        x, y, _ = place(a, b, 0.0)
        data.extend(shapes.lathe([(0.0, deck_h - 0.05), (0.06, deck_h - 0.05), (0.06, deck_h + rail_h), (0.0, deck_h + rail_h + 0.02)],
                                 6, ctx.material, center=(x, y, 0.0)))
    # 扶手：兩段弧（左段、右段），中間門前留開口
    for t0, t1 in ((0.0, math.pi * 0.4), (math.pi * 0.6, math.pi)):
        path = [place((radius - 0.1) * math.cos(t), (radius - 0.1) * math.sin(t) + 0.25, deck_h + rail_h)
                for t in (t0 + (t1 - t0) * k / 6 for k in range(7))]
        data.extend(shapes.sweep(path, 0.05, 6, ctx.material))
    # 台階：門前開口外的一階
    step = shapes.box(-0.45, radius + 0.15, 0.0, 0.45, radius + 0.55, deck_h * 0.5, ctx.material)
    data.extend(step.map(lambda p: place(p[0], p[1], p[2])))
    return _local_data(ctx, data)


@register("mush_bunny_ears")
def build_mush_bunny_ears(ctx):
    """菇傘頂上的長兔耳：跟屋頂同色的扁長 loft，一隻直立、一隻尖端往後彎。
    （第一版外白內粉；使用者要求整隻改成跟屋頂一樣的粉紅，內側那層就拿掉了）

    耳朵根部算在「正著戴的菇傘」座標裡（圓頂上），再用 _cap_transform 一起斜過去，
    所以耳朵永遠長在菇傘上、跟著菇傘的傾斜走。
    """
    length = ctx.param("length", 3.2)
    place_cap = _cap_transform(ctx.param("tilt_degrees", 12), ctx.param("tilt_toward_degrees", 210))
    data = shapes.MeshData()
    for side, bend in ((-1.0, 0.0), (1.0, 1.0)):
        # 根部在圓頂上（半徑 0.85 處），耳朵往外張 14°、往後仰 8°
        root = (side * 0.85, 0.15, 1.8)
        splay, lean = math.radians(14) * side, math.radians(8)
        rings_outer = []
        steps = 9
        for k in range(steps + 1):
            t = k / steps
            # 中心線：往上，外張、後仰；彎的那隻在上半段越來越往後折
            back = lean * t + (bend * 1.1 * max(0.0, t - 0.45) ** 1.6)
            cx = root[0] + math.sin(splay) * length * t
            cy = root[1] + math.sin(back) * length * t
            cz = root[2] + math.cos(splay) * math.cos(back) * length * t
            # 寬度：根部窄、中段最寬、尖端收圓
            w = 0.42 * math.sin(math.pi * (0.12 + 0.8 * t)) + 0.05
            d = 0.16 * (1 - 0.6 * t) + 0.04
            rings_outer.append([(cx + w * math.cos(a), cy + d * math.sin(a), cz)
                                for a in (math.tau * j / 10 for j in range(10))])
        data.extend(shapes.loft(rings_outer, ctx.material).map(place_cap))
    return _local_data(ctx, data)
