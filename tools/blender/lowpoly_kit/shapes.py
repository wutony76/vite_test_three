"""幾何產生器：只算頂點和面，不依賴 bpy，Blender 外也能測試拓撲。

和 primitive 堆疊的差別：
- primitive 堆疊：每個方塊、球各自封閉，彼此只是「擺在一起」，Join 後還是好幾個幾何島。
- 這裡的產生器：一個形狀從頭到尾共用頂點（loft 的環與環之間、lathe 的每一圈之間、
  grid_slab 的每一格之間），天生就是一個連續封閉的幾何島。

所有產生器都回傳 MeshData：verts、faces、每個面的材質名稱。
法線方向不在這裡保證；Blender 端會對封閉的 mesh 統一重算成朝外（glass 平面例外，由呼叫端決定方向）。
"""

import math

# ---------------------------------------------------------------------------
# MeshData
# ---------------------------------------------------------------------------


class MeshData:
    """一個 Object 的幾何。可以由多個部件組成（例如燈的支架 + 燈籠），每個部件本身是封閉的。"""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.mats = []  # 每個面的材質名稱，Blender 端轉成 material_index

    def add(self, verts, faces, mat):
        """加入一個部件。mat 可以是單一材質名稱，或是和 faces 等長的清單。"""
        mats = list(mat) if isinstance(mat, (list, tuple)) else [mat] * len(faces)
        if len(mats) != len(faces):
            raise ValueError(f"材質數 {len(mats)} 和面數 {len(faces)} 不一致")
        base = len(self.verts)
        self.verts.extend(tuple(float(c) for c in v) for v in verts)
        self.faces.extend(tuple(i + base for i in face) for face in faces)
        self.mats.extend(mats)
        return self

    def extend(self, other):
        return self.add(other.verts, other.faces, other.mats)

    def map(self, fn):
        """對所有頂點套用 fn((x, y, z)) -> (x, y, z)。"""
        self.verts = [tuple(fn(v)) for v in self.verts]
        return self

    def translate(self, dx=0.0, dy=0.0, dz=0.0):
        return self.map(lambda v: (v[0] + dx, v[1] + dy, v[2] + dz))

    def material_names(self):
        """依第一次出現的順序列出材質，Blender 端照這個順序建立 material slot。"""
        seen = []
        for name in self.mats:
            if name not in seen:
                seen.append(name)
        return seen


def single(verts, faces, mat):
    return MeshData().add(verts, faces, mat)


# ---------------------------------------------------------------------------
# 座標軸對應
# ---------------------------------------------------------------------------

def _mapper(axes):
    """axes 是三個字母，例如 "xzy"：第 1 個參數放到 x、第 2 個放到 z、第 3 個放到 y。

    同一個產生器（例如格狀板）可以立著用（牆、窗框：u→x、v→z、厚度→y），
    也可以平放（女兒牆壓頂：u→x、v→y、厚度→z），不用寫兩份。
    """
    order = ["xyz".index(a) for a in axes]
    if sorted(order) != [0, 1, 2]:
        raise ValueError(f"axes 必須是 x、y、z 的排列，拿到 {axes!r}")

    def to_xyz(a, b, c):
        out = [0.0, 0.0, 0.0]
        out[order[0]], out[order[1]], out[order[2]] = a, b, c
        return tuple(out)

    return to_xyz


class _VertexPool:
    """以座標去重的頂點表：相同位置只建立一個頂點，相鄰的面才會真正共用頂點。"""

    def __init__(self, to_xyz):
        self.to_xyz = to_xyz
        self.index = {}
        self.verts = []

    def __call__(self, a, b, c):
        point = self.to_xyz(a, b, c)
        key = tuple(round(v, 7) for v in point)
        if key not in self.index:
            self.index[key] = len(self.verts)
            self.verts.append(point)
        return self.index[key]


# ---------------------------------------------------------------------------
# 基本形狀
# ---------------------------------------------------------------------------

def box(x0, y0, z0, x1, y1, z1, mat):
    verts = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
    ]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return single(verts, faces, mat)


def rect(hx, hy, z, cx=0.0, cy=0.0):
    """水平長方形環（逆時針），給 loft 用。"""
    return [(cx - hx, cy - hy, z), (cx + hx, cy - hy, z), (cx + hx, cy + hy, z), (cx - hx, cy + hy, z)]


# ---------------------------------------------------------------------------
# grid_slab：可以挖凹槽（niche）和貫穿洞（hole）的格狀板
# ---------------------------------------------------------------------------

def grid_slab(us, vs, w0, w1, cells, axes, mat):
    """us、vs：兩個方向的格線（遞增）；厚度從 w0（正面）到 w1（背面）。

    cells：{(i, j): spec}，沒列出的格子是實心。spec 可以是：
    - ("niche", region, depth, mat)：從正面往內退 depth 的凹槽（門窗洞、門片上的玻璃槽）
    - ("hole", region)：貫穿到背面的洞（窗框中的窗格）
    同一個 region 的格子共用凹槽底面，只在 region 外圍補側壁。

    為什麼不建好方塊再 Boolean 挖洞：Boolean 的切口常常產生 ngon 和細碎的三角形；
    這裡先把所有開口邊界變成格線，每一面都是 quad，正面、背面、側面切同樣的格線，所以沒有 T 字接點。
    限制：開口不可以碰到板的外緣，不同 region 不可以相鄰。
    """
    nu, nv = len(us) - 1, len(vs) - 1
    pool = _VertexPool(_mapper(axes))
    faces, mats = [], []

    def quad(a, b, c, d, m):
        faces.append((a, b, c, d))
        mats.append(m)

    def region_of(i, j):
        spec = cells.get((i, j))
        return (spec[0], spec[1]) if spec else None

    for (i, j), spec in cells.items():
        if not (0 < i < nu - 1 and 0 < j < nv - 1):
            raise ValueError(f"開口格 ({i}, {j}) 碰到板的外緣，無法保持封閉")
        if spec[0] == "niche" and not 0 < spec[2] < (w1 - w0):
            raise ValueError(f"凹槽深度 {spec[2]} 必須介於 0 和板厚 {w1 - w0} 之間")

    for i in range(nu):
        for j in range(nv):
            u0, u1, v0, v1 = us[i], us[i + 1], vs[j], vs[j + 1]
            spec = cells.get((i, j))
            kind = spec[0] if spec else "solid"
            # 背面：只有貫穿洞沒有背面
            if kind != "hole":
                quad(pool(u0, v0, w1), pool(u0, v1, w1), pool(u1, v1, w1), pool(u1, v0, w1), mat)
            if kind == "solid":
                quad(pool(u0, v0, w0), pool(u1, v0, w0), pool(u1, v1, w0), pool(u0, v1, w0), mat)
                continue
            # 凹槽底面
            inner = w0 + spec[2] if kind == "niche" else w1
            # 凹槽側壁用板子本身的材質（窗洞側面是牆的厚度），只有槽底用 niche 的材質
            wall_mat = mat
            if kind == "niche":
                quad(pool(u0, v0, inner), pool(u1, v0, inner), pool(u1, v1, inner), pool(u0, v1, inner), spec[3])
            # 側壁：鄰格不屬於同一個 region 時，在這條邊上補一片
            here = region_of(i, j)
            for (ni, nj), (a, b) in (
                ((i, j - 1), ((u0, v0), (u1, v0))),
                ((i + 1, j), ((u1, v0), (u1, v1))),
                ((i, j + 1), ((u1, v1), (u0, v1))),
                ((i - 1, j), ((u0, v1), (u0, v0))),
            ):
                if region_of(ni, nj) != here:
                    quad(pool(a[0], a[1], w0), pool(b[0], b[1], w0),
                         pool(b[0], b[1], inner), pool(a[0], a[1], inner), wall_mat)

    # 四個側面：沿著格線切開，才能和正面、背面的邊緣共用頂點
    for j in range(nv):
        for u in (us[0], us[-1]):
            quad(pool(u, vs[j], w0), pool(u, vs[j], w1), pool(u, vs[j + 1], w1), pool(u, vs[j + 1], w0), mat)
    for i in range(nu):
        for v in (vs[0], vs[-1]):
            quad(pool(us[i], v, w0), pool(us[i + 1], v, w0), pool(us[i + 1], v, w1), pool(us[i], v, w1), mat)

    return single(pool.verts, faces, mats)


def breakpoints(lo, hi, values, merge=0.005):
    """把開口邊界整理成格線：限制在 [lo, hi]、排序、合併太接近的值。

    少了合併：兩個開口邊界只差 1 mm 時會產生 1 mm 寬的細長格子，bevel 時容易重疊。
    """
    result = [lo, hi]
    for value in sorted(values):
        if lo + merge < value < hi - merge and all(abs(value - r) > merge for r in result):
            result.append(value)
    return sorted(result)


def cells_in(us, vs, u0, u1, v0, v1):
    """回傳中心落在矩形內的格子索引。"""
    picked = []
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            cu, cv = (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2
            if u0 < cu < u1 and v0 < cv < v1:
                picked.append((i, j))
    return picked


# ---------------------------------------------------------------------------
# prism：2D 輪廓擠出（端面用 ear clipping 三角化）
# ---------------------------------------------------------------------------

def _signed_area(points):
    return sum(points[i][0] * points[(i + 1) % len(points)][1] - points[(i + 1) % len(points)][0] * points[i][1]
               for i in range(len(points))) / 2


def _point_in_triangle(p, a, b, c):
    def cross(o, s, t):
        return (s[0] - o[0]) * (t[1] - o[1]) - (s[1] - o[1]) * (t[0] - o[0])
    d1, d2, d3 = cross(a, b, p), cross(b, c, p), cross(c, a, p)
    return d1 >= 0 and d2 >= 0 and d3 >= 0


def triangulate_polygon(points):
    """Ear clipping：把（可能凹的）簡單多邊形切成三角形，回傳索引三元組。

    凹多邊形（貓的輪廓、階梯的側面）如果直接當一個 ngon，Three.js 匯出時的自動三角化
    可能切出跑到輪廓外面的三角形；自己切，結果可預期。
    """
    count = len(points)
    order = list(range(count))
    if _signed_area(points) < 0:
        order.reverse()
    triangles = []
    guard = 0
    while len(order) > 3 and guard < count * count:
        guard += 1
        for k in range(len(order)):
            i, j, m = order[k - 1], order[k], order[(k + 1) % len(order)]
            a, b, c = points[i], points[j], points[m]
            convex = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 1e-12
            if not convex:
                continue
            if any(_point_in_triangle(points[o], a, b, c) for o in order if o not in (i, j, m)):
                continue
            triangles.append((i, j, m))
            order.pop(k)
            break
        else:
            raise ValueError("輪廓不是簡單多邊形（可能自我交叉），無法三角化")
    triangles.append(tuple(order))
    return triangles


def prism(outline, a0, a1, axes, mat):
    """outline：(p, q) 輪廓點；沿第三軸從 a0 擠到 a1。axes 同 _mapper，例如 "yzx"。"""
    to_xyz = _mapper(axes)
    count = len(outline)
    verts = [to_xyz(p, q, a0) for p, q in outline] + [to_xyz(p, q, a1) for p, q in outline]
    if count == 4 or (count == 3):
        caps = [tuple(range(count))]
    else:
        caps = triangulate_polygon(outline)
    faces = []
    for cap in caps:
        faces.append(tuple(cap))
        faces.append(tuple(i + count for i in reversed(cap)))
    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, j + count, i + count))
    return single(verts, faces, mat)


# ---------------------------------------------------------------------------
# loft / lathe / sweep / blob
# ---------------------------------------------------------------------------

def loft(rings, mat, cap_start=True, cap_end=True):
    """依序連接多個頂點數相同的環。mat 可以是單一材質，或每段（環與環之間）一個材質的清單。

    端面：4 點以下直接一個面；更多點時加一個中心點做扇形，避免 ngon。
    """
    n = len(rings[0])
    if any(len(r) != n for r in rings):
        raise ValueError("loft 的每個環頂點數必須相同")
    band_mats = list(mat) if isinstance(mat, (list, tuple)) else [mat] * (len(rings) - 1)
    verts = [p for ring in rings for p in ring]
    faces, mats = [], []
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append((k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i))
            mats.append(band_mats[k])

    def cap(ring_index, reverse, m):
        base = ring_index * n
        ids = [base + i for i in range(n)]
        if reverse:
            ids.reverse()
        if n <= 4:
            faces.append(tuple(ids))
            mats.append(m)
            return
        ring = rings[ring_index]
        center = tuple(sum(p[c] for p in ring) / n for c in range(3))
        verts.append(center)
        ci = len(verts) - 1
        for i in range(n):
            faces.append((ids[i], ids[(i + 1) % n], ci))
            mats.append(m)

    if cap_start:
        cap(0, True, band_mats[0])
    if cap_end:
        cap(len(rings) - 1, False, band_mats[-1])
    return single(verts, faces, mats)


def lathe(profile, segments, mat, axis="z", center=(0.0, 0.0, 0.0), phase=0.0):
    """旋轉體。profile：[(半徑, 軸向位置)]，從起點排到終點；半徑 0 的端點收成極點。

    mat 可以是每段 profile 一個材質的清單：路燈的燈柱和燈罩在同一個旋轉體上，
    只有燈罩那一段用發光材質，整支路燈仍然是 1 個幾何島。
    """
    cx, cy, cz = center

    def point(r, a, k):
        t = phase + math.tau * k / segments
        c, s = r * math.cos(t), r * math.sin(t)
        if axis == "z":
            return (cx + c, cy + s, cz + a)
        if axis == "y":
            return (cx + c, cy + a, cz + s)
        return (cx + a, cy + c, cz + s)

    bands = list(mat) if isinstance(mat, (list, tuple)) else [mat] * (len(profile) - 1)
    if len(bands) != len(profile) - 1:
        raise ValueError("lathe 的材質清單長度必須是 profile 點數 - 1")
    if any(r <= 0 for r, _ in profile[1:-1]):
        raise ValueError("只有 profile 的第一點和最後一點可以是半徑 0")

    verts, faces, mats = [], [], []
    rows = []  # 每個 profile 點對應的頂點索引；極點只有一個頂點
    for r, a in profile:
        if r <= 0:
            verts.append(point(0.0, a, 0))
            rows.append([len(verts) - 1])
        else:
            start = len(verts)
            verts.extend(point(r, a, k) for k in range(segments))
            rows.append(list(range(start, start + segments)))

    for b in range(len(profile) - 1):
        lo, hi = rows[b], rows[b + 1]
        for k in range(segments):
            k2 = (k + 1) % segments
            if len(lo) == 1:
                faces.append((lo[0], hi[k], hi[k2]))
            elif len(hi) == 1:
                faces.append((lo[k], lo[k2], hi[0]))
            else:
                faces.append((lo[k], lo[k2], hi[k2], hi[k]))
            mats.append(bands[b])

    # 半徑不是 0 的端點要補端面（扇形）
    for row, r_a, m, rev in ((rows[0], profile[0], bands[0], True), (rows[-1], profile[-1], bands[-1], False)):
        if len(row) == 1:
            continue
        r, a = r_a
        verts.append(point(0.0, a, 0))
        ci = len(verts) - 1
        for k in range(segments):
            k2 = (k + 1) % segments
            faces.append((row[k2], row[k], ci) if rev else (row[k], row[k2], ci))
            mats.append(m)
    return single(verts, faces, mats)


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _norm(a):
    length = math.sqrt(_dot(a, a))
    if length < 1e-12:
        raise ValueError("向量長度為 0")
    return (a[0] / length, a[1] / length, a[2] / length)


def sweep(path, radius, sides, mat, phase=math.pi / 4):
    """沿路徑掃出管狀（支架、藤蔓莖）。

    方向用 parallel transport：每一段把上一段的法向量投影到新的切面上。
    少了它（每段各自找垂直向量），路徑轉彎處的截面會突然旋轉，管子看起來被扭過。
    """
    if len(path) < 2:
        raise ValueError("sweep 至少需要 2 個點")
    tangents = []
    for k in range(len(path)):
        a = path[max(k - 1, 0)]
        b = path[min(k + 1, len(path) - 1)]
        tangents.append(_norm(_sub(b, a)))
    ref = (0.0, 0.0, 1.0) if abs(tangents[0][2]) < 0.9 else (1.0, 0.0, 0.0)
    normal = _norm(_cross(tangents[0], ref))
    rings = []
    for k, (p, t) in enumerate(zip(path, tangents)):
        if k > 0:
            d = _dot(normal, t)
            normal = _norm((normal[0] - d * t[0], normal[1] - d * t[1], normal[2] - d * t[2]))
        binormal = _cross(t, normal)
        ring = []
        for s in range(sides):
            angle = phase + math.tau * s / sides
            c, sn = math.cos(angle) * radius, math.sin(angle) * radius
            ring.append(tuple(p[i] + c * normal[i] + sn * binormal[i] for i in range(3)))
        rings.append(ring)
    return loft(rings, mat)


def blob(center, radii, mat, segments=6, rings=4, jitter=0.0, rng=None):
    """低面數橢球：樹冠、植物葉團。jitter 讓表面略不規則（需要 rng 才會固定）。"""
    rx, ry, rz = radii
    profile = [(0.0, -rz)]
    for k in range(1, rings):
        phi = math.pi * k / rings
        profile.append((math.sin(phi), -math.cos(phi) * rz))
    profile.append((0.0, rz))
    # 先做單位半徑的旋轉體，再把 x、y 分別縮放成 rx、ry
    shape = lathe(profile, segments, mat, axis="z", phase=(rng.random() if rng else 0.0))
    cx, cy, cz = center

    def scale(v):
        f = 1.0 + (rng.uniform(-jitter, jitter) if (rng and jitter) else 0.0)
        return (cx + v[0] * rx * f, cy + v[1] * ry * f, cz + v[2] * f)

    return shape.map(scale)


def fluted_frustum(
    r_bottom,
    r_top,
    height,
    mat_body,
    mat_cap,
    *,
    flutes=10,
    flute_depth=0.09,
    rings=7,
    segments=20,
    cap_fraction=0.14,
    phase=0.0,
):
    """肋狀圓台（布丁模具形）：單一封閉幾何，頂部可換成焦糖材質帶。

    r_bottom > r_top 時底寬頂窄。flute_depth 為肋條相對半徑的起伏比例。
    """
    if rings < 2 or segments < flutes * 2:
        raise ValueError("fluted_frustum 需要 rings ≥ 2 且 segments ≥ 2×flutes")
    if not 0 < cap_fraction < 1:
        raise ValueError("cap_fraction 必須在 (0, 1)")

    verts = []
    grid = []
    cap_z = height * (1.0 - cap_fraction)

    for ri in range(rings + 1):
        z = height * ri / rings
        row = []
        t = ri / rings
        r_mean = r_bottom + (r_top - r_bottom) * t
        for si in range(segments):
            theta = phase + math.tau * si / segments
            r = r_mean * (1.0 + flute_depth * math.cos(flutes * theta))
            verts.append((r * math.cos(theta), r * math.sin(theta), z))
            row.append(len(verts) - 1)
        grid.append(row)

    bottom_i = len(verts)
    verts.append((0.0, 0.0, 0.0))
    top_i = len(verts)
    verts.append((0.0, 0.0, height))

    faces, mats = [], []

    for si in range(segments):
        si2 = (si + 1) % segments
        faces.append((grid[0][si2], grid[0][si], bottom_i))
        mats.append(mat_body)

    for ri in range(rings):
        z_mid = height * (ri + 0.5) / rings
        m = mat_cap if z_mid >= cap_z else mat_body
        for si in range(segments):
            si2 = (si + 1) % segments
            faces.append((grid[ri][si], grid[ri][si2], grid[ri + 1][si2], grid[ri + 1][si]))
            mats.append(m)

    for si in range(segments):
        si2 = (si + 1) % segments
        faces.append((grid[rings][si], grid[rings][si2], top_i))
        mats.append(mat_cap)

    return single(verts, faces, mats)


def rotate_x(data, angle, pivot=(0.0, 0.0, 0.0)):
    """繞 x 軸旋轉（A 字黑板的斜板）。"""
    c, s = math.cos(angle), math.sin(angle)
    py, pz = pivot[1], pivot[2]
    return data.map(lambda v: (v[0], py + (v[1] - py) * c - (v[2] - pz) * s, pz + (v[1] - py) * s + (v[2] - pz) * c))


# ---------------------------------------------------------------------------
# 拓撲統計（測試與除錯用）
# ---------------------------------------------------------------------------

def topology_stats(data):
    """邊被幾個面使用、幾何島數、退化面數、外框。和 Blender 端的驗證同一套定義。"""
    edges = {}
    for face in data.faces:
        for i in range(len(face)):
            a, b = face[i], face[(i + 1) % len(face)]
            key = (a, b) if a < b else (b, a)
            edges[key] = edges.get(key, 0) + 1

    parent = list(range(len(data.verts)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for a, b in edges:
        parent[find(a)] = find(b)
    used = {i for face in data.faces for i in face}

    degenerate = 0
    for face in data.faces:
        pts = [data.verts[i] for i in face]
        n = [0.0, 0.0, 0.0]
        for i in range(len(pts)):
            p, q = pts[i], pts[(i + 1) % len(pts)]
            n[0] += (p[1] - q[1]) * (p[2] + q[2])
            n[1] += (p[2] - q[2]) * (p[0] + q[0])
            n[2] += (p[0] - q[0]) * (p[1] + q[1])
        if math.sqrt(_dot(n, n)) / 2 < 1e-8 or len(set(face)) != len(face):
            degenerate += 1

    xs = [v[0] for v in data.verts] or [0.0]
    ys = [v[1] for v in data.verts] or [0.0]
    zs = [v[2] for v in data.verts] or [0.0]
    return {
        "faces": len(data.faces),
        "triangles": sum(len(f) - 2 for f in data.faces),
        "boundary_edges": sum(1 for c in edges.values() if c == 1),
        "non_manifold_edges": sum(1 for c in edges.values() if c > 2),
        "islands": len({find(i) for i in used}),
        "loose_verts": len(data.verts) - len(used),
        "degenerate_faces": degenerate,
        "bounds": [[min(xs), min(ys), min(zs)], [max(xs), max(ys), max(zs)]],
    }
