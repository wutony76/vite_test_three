"""場景的地形、道路與擺放幾何（純 Python，不依賴 bpy）。

- 高度場：起伏 × 整平遮罩。建築與道路底下的遮罩是 0，所以那裡的高度剛好是 0，
  建築不會陷進坡裡、道路不會被小山穿過；離開一段距離後才平滑地升起成丘陵。
- 外框（footprint）：旋轉後的長方形，用來判斷建築互相重疊、壓到道路、超出地形。
"""

import math
import random

from .. import shapes


# ---------------------------------------------------------------------------
# 旋轉長方形與 polyline 的幾何
# ---------------------------------------------------------------------------

class Footprint:
    """平面上的旋轉長方形：中心 (cx, cy)、半寬 hx、半深 hy、繞 z 旋轉 angle（弧度）。"""

    def __init__(self, cx, cy, hx, hy, angle):
        self.cx, self.cy, self.hx, self.hy, self.angle = cx, cy, hx, hy, angle
        self.cos, self.sin = math.cos(angle), math.sin(angle)

    def to_local(self, x, y):
        dx, dy = x - self.cx, y - self.cy
        return dx * self.cos + dy * self.sin, -dx * self.sin + dy * self.cos

    def to_world(self, u, v):
        return self.cx + u * self.cos - v * self.sin, self.cy + u * self.sin + v * self.cos

    def corners(self):
        return [self.to_world(u, v) for u, v in ((-self.hx, -self.hy), (self.hx, -self.hy), (self.hx, self.hy), (-self.hx, self.hy))]

    def samples(self, n=7):
        """外框內 n × n 個取樣點（含邊緣）。"""
        return [self.to_world(-self.hx + 2 * self.hx * i / (n - 1), -self.hy + 2 * self.hy * j / (n - 1))
                for i in range(n) for j in range(n)]

    def distance(self, x, y):
        """點到外框的距離（在外框內為 0）。"""
        u, v = self.to_local(x, y)
        du, dv = max(abs(u) - self.hx, 0.0), max(abs(v) - self.hy, 0.0)
        return math.hypot(du, dv)

    def contains(self, x, y, margin=0.0):
        u, v = self.to_local(x, y)
        return abs(u) <= self.hx + margin and abs(v) <= self.hy + margin


def footprint_of(dimensions, location, rotation_z_deg=0.0, scale=1.0):
    """資產的 dimensions（w × d，原點在中心）擺到場景後的外框。"""
    return Footprint(location[0], location[1], dimensions["w"] / 2 * scale, dimensions["d"] / 2 * scale,
                     math.radians(rotation_z_deg))


def footprints_overlap(a, b):
    """分離軸定理（SAT）：兩個凸多邊形不重疊，若且唯若存在一條軸，兩者投影上去沒有交集。
    長方形只需要檢查兩個長方形各自的兩個邊方向，共 4 條軸。"""
    ca, cb = a.corners(), b.corners()
    for rect in (a, b):
        for ax, ay in ((rect.cos, rect.sin), (-rect.sin, rect.cos)):
            pa = [x * ax + y * ay for x, y in ca]
            pb = [x * ax + y * ay for x, y in cb]
            if max(pa) <= min(pb) or max(pb) <= min(pa):
                return False
    return True


def distance_to_polyline(x, y, polyline):
    best = float("inf")
    for (x0, y0), (x1, y1) in zip(polyline, polyline[1:]):
        dx, dy = x1 - x0, y1 - y0
        length2 = dx * dx + dy * dy
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / length2))
        best = min(best, math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)))
    return best


# ---------------------------------------------------------------------------
# 高度場
# ---------------------------------------------------------------------------

def _smoothstep(edge0, edge1, x):
    if edge1 <= edge0:
        return 0.0 if x < edge0 else 1.0
    t = min(max((x - edge0) / (edge1 - edge0), 0.0), 1.0)
    return t * t * (3 - 2 * t)


class TerrainField:
    """height(x, y) = amplitude × 起伏(0～1) × 整平遮罩(0～1)。同一個 seed 每次結果相同。"""

    def __init__(self, terrain, flat_zones=(), roads=()):
        params = terrain.get("params", {})
        self.size = terrain["size"]
        self.kind = terrain["kind"]
        self.amplitude = params.get("amplitude", 1.0) if self.kind == "grid_hills" else 0.0
        self.frequency = params.get("frequency", 0.12)
        self.margin = params.get("flatten_margin", 4.0)
        self.resolution = params.get("resolution", 48)
        rng = random.Random(params.get("seed", 0))
        # 3 組不同頻率與方向的 sin × sin：單一組會變成整齊的蛋盒狀起伏
        self.waves = [(rng.uniform(0.7, 1.3) * self.frequency * scale, rng.uniform(0, math.tau),
                       rng.uniform(0.7, 1.3) * self.frequency * scale, rng.uniform(0, math.tau), weight)
                      for scale, weight in ((1.0, 0.6), (2.1, 0.28), (4.3, 0.12))]
        self.flat_zones = list(flat_zones)   # Footprint
        self.roads = list(roads)             # (polyline, half_width)

    def bumps(self, x, y):
        value = sum(w * math.sin(fx * x + px) * math.sin(fy * y + py) for fx, px, fy, py, w in self.waves)
        return 0.5 + 0.5 * value  # 約 0～1

    def mask(self, x, y):
        """0 = 必須平坦（建築、道路底下），1 = 自由起伏。中間用 smoothstep 平滑過渡。"""
        nearest = float("inf")
        for zone in self.flat_zones:
            nearest = min(nearest, zone.distance(x, y))
        for polyline, half in self.roads:
            nearest = min(nearest, max(distance_to_polyline(x, y, polyline) - half, 0.0))
        return _smoothstep(0.3, 0.3 + self.margin, nearest)

    def height(self, x, y):
        if self.amplitude == 0:
            return 0.0
        return self.amplitude * self.bumps(x, y) * self.mask(x, y)


def terrain_mesh(field, material):
    """resolution × resolution 的格狀地面（1 個島、外緣是開放邊）。"""
    n = max(4, int(field.resolution))
    sx, sy = field.size
    verts = []
    for j in range(n + 1):
        for i in range(n + 1):
            x, y = -sx / 2 + sx * i / n, -sy / 2 + sy * j / n
            verts.append((x, y, field.height(x, y)))
    faces = [(j * (n + 1) + i, j * (n + 1) + i + 1, (j + 1) * (n + 1) + i + 1, (j + 1) * (n + 1) + i)
             for j in range(n) for i in range(n)]
    return shapes.single(verts, faces, material)


def road_mesh(polyline, width, material, z=0.03, step=1.0):
    """沿 polyline 掃出帶狀面：每約 step 公尺取一點，用前後方向的平均法線做斜接，轉角不會裂開或重疊。"""
    points = [polyline[0]]
    for (x0, y0), (x1, y1) in zip(polyline, polyline[1:]):
        count = max(1, int(math.ceil(math.hypot(x1 - x0, y1 - y0) / step)))
        points += [(x0 + (x1 - x0) * k / count, y0 + (y1 - y0) * k / count) for k in range(1, count + 1)]
    half = width / 2
    verts = []
    for k, (x, y) in enumerate(points):
        a = points[max(k - 1, 0)]
        b = points[min(k + 1, len(points) - 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        length = math.hypot(tx, ty) or 1.0
        nx, ny = -ty / length, tx / length
        verts += [(x + nx * half, y + ny * half, z), (x - nx * half, y - ny * half, z)]
    faces = [(2 * k, 2 * k + 1, 2 * k + 3, 2 * k + 2) for k in range(len(points) - 1)]
    return shapes.single(verts, faces, material)
