"""Low Poly 直立街機 Hi-Orbit。

正面朝 -Y，+Z 朝上，1 單位 = 1 公尺。
機殼用側視輪廓擠出，側板藍／橘飾條是同一張封閉 Mesh 的環面，
不是另外貼上的方塊。

    Blender --background --factory-startup --python tools/blender/scripts/build_hi_orbit.py
"""

import math
import os
import sys

try:
    import bpy
    from mathutils import Vector
except ImportError:  # 本機拓撲測試，不需要 Blender
    bpy = None
    Vector = None

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

# 側視輪廓 (y, z)，背面在 y=0，正面朝 -Y。順時針（從 +X 看）。
PROFILE = [
    (0.00, 0.00),
    (0.00, 1.58),
    (-0.12, 1.72),
    (-0.40, 1.86),
    (-0.56, 1.86),
    (-0.56, 1.64),
    (-0.48, 1.58),
    (-0.48, 1.08),
    (-0.76, 1.00),
    (-0.80, 0.88),
    (-0.54, 0.82),
    (-0.54, 0.08),
    (-0.50, 0.00),
]

HALF_W = 0.35
BLUE_INSET = 0.032
ORANGE_INSET = 0.020

# 輪廓邊  i → i+1  的材質名稱
WALL_MATERIAL = {
    0: "wood",
    1: "wood",
    2: "wood",
    3: "black",
    4: "orange",
    5: "black",
    6: "black",
    7: "red",
    8: "red_dark",
    9: "black",
    10: "blue",
    11: "wood",
    12: "wood",
}

MATERIALS = [
    ("HiOrbit_Wood", (0.27, 0.15, 0.08), 0.74),
    ("HiOrbit_Black", (0.07, 0.05, 0.045), 0.62),
    ("HiOrbit_Red", (0.68, 0.14, 0.06), 0.5),
    ("HiOrbit_RedDark", (0.42, 0.10, 0.06), 0.55),
    ("HiOrbit_Blue", (0.13, 0.36, 0.72), 0.48),
    ("HiOrbit_Orange", (0.86, 0.34, 0.08), 0.48),
    ("HiOrbit_Night", (0.055, 0.065, 0.11), 0.7),
    ("HiOrbit_Desert", (0.86, 0.62, 0.22), 0.78),
    ("HiOrbit_Yellow", (0.95, 0.74, 0.08), 0.42),
    ("HiOrbit_Screen", (0.015, 0.035, 0.03), 0.18),
    ("HiOrbit_White", (0.90, 0.87, 0.78), 0.55),
    ("HiOrbit_Ufo", (0.20, 0.46, 0.78), 0.4),
    ("HiOrbit_UfoDome", (0.62, 0.80, 0.90), 0.35),
    ("HiOrbit_UfoLight", (0.95, 0.91, 0.72), 0.4),
    ("HiOrbit_Beam", (0.96, 0.92, 0.70), 0.45),
    ("HiOrbit_Mountain", (0.75, 0.36, 0.14), 0.7),
    ("HiOrbit_MountainFar", (0.55, 0.36, 0.20), 0.72),
    ("HiOrbit_Cactus", (0.55, 0.52, 0.18), 0.65),
    ("HiOrbit_Rock", (0.78, 0.30, 0.12), 0.7),
    ("HiOrbit_RockBlue", (0.24, 0.46, 0.74), 0.55),
    ("HiOrbit_Cabin", (0.40, 0.22, 0.11), 0.7),
    ("HiOrbit_CabinRoof", (0.24, 0.12, 0.07), 0.72),
    ("HiOrbit_Window", (0.12, 0.20, 0.26), 0.25),
    ("HiOrbit_Wheel", (0.10, 0.09, 0.08), 0.7),
    ("HiOrbit_Person", (0.04, 0.035, 0.03), 0.6),
    ("HiOrbit_Star", (0.96, 0.90, 0.55), 0.4),
    ("HiOrbit_Stream", (0.20, 0.50, 0.78), 0.35),
    ("HiOrbit_Stripe", (0.90, 0.42, 0.12), 0.5),
    ("HiOrbit_Button", (0.90, 0.04, 0.03), 0.32),
]

MAT_INDEX = {
    "wood": 0, "black": 1, "red": 2, "red_dark": 3, "blue": 4, "orange": 5,
    "night": 6, "desert": 7, "yellow": 8, "screen": 9, "white": 10,
    "ufo": 11, "ufo_dome": 12, "ufo_light": 13, "beam": 14,
    "mountain": 15, "mountain_far": 16, "cactus": 17, "rock": 18, "rock_blue": 19,
    "cabin": 20, "cabin_roof": 21, "window": 22, "wheel": 23, "person": 24,
    "star": 25, "stream": 26, "stripe": 27, "button": 28,
}


def _area(poly):
    total = 0.0
    for i, (y, z) in enumerate(poly):
        y2, z2 = poly[(i + 1) % len(poly)]
        total += y * z2 - y2 * z
    return total * 0.5


def _offset_polygon(poly, dist):
    """把多邊形往內縮 dist。dist > 0 變小。"""
    sign = 1.0 if _area(poly) > 0 else -1.0
    count = len(poly)
    lines = []
    for i in range(count):
        y1, z1 = poly[i]
        y2, z2 = poly[(i + 1) % count]
        dy, dz = y2 - y1, z2 - z1
        length = math.hypot(dy, dz)
        if length < 1e-8:
            raise RuntimeError("輪廓有零長度邊")
        inward_y = sign * (-dz / length)
        inward_z = sign * (dy / length)
        lines.append((y1 + inward_y * dist, z1 + inward_z * dist, dy, dz))
    shrunk = []
    for i in range(count):
        y1, z1, dy1, dz1 = lines[(i - 1) % count]
        y2, z2, dy2, dz2 = lines[i]
        det = dy1 * dz2 - dz1 * dy2
        if abs(det) < 1e-10:
            shrunk.append((y2, z2))
        else:
            t = ((y2 - y1) * dz2 - (z2 - z1) * dy2) / det
            shrunk.append((y1 + t * dy1, z1 + t * dz1))
    return shrunk


def _segments_hit(poly):
    count = len(poly)

    def cross(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])

    hits = []
    for i in range(count):
        a, b = poly[i], poly[(i + 1) % count]
        for j in range(i + 1, count):
            if (i + 1) % count == j or (j + 1) % count == i or (i == 0 and j == count - 1):
                continue
            c, d = poly[j], poly[(j + 1) % count]
            d1, d2 = cross(c, d, a), cross(c, d, b)
            d3, d4 = cross(a, b, c), cross(a, b, d)
            separated = ((d1 > 1e-9 and d2 < -1e-9) or (d1 < -1e-9 and d2 > 1e-9)) and (
                (d3 > 1e-9 and d4 < -1e-9) or (d3 < -1e-9 and d4 > 1e-9)
            )
            if separated:
                hits.append((i, j))
    return hits


def _ear_clip(poly):
    """簡單多邊形切成三角形，索引對應原本的點序。"""
    count = len(poly)
    if count < 3:
        raise RuntimeError("多邊形少於 3 點")
    order = list(range(count))
    if _area(poly) < 0:
        order.reverse()

    def point(slot):
        return poly[order[slot]]

    def is_convex(i, j, k):
        ay, az = point(i)
        by, bz = point(j)
        cy, cz = point(k)
        return (by - ay) * (cz - az) - (bz - az) * (cy - ay) > 1e-12

    def contains(i, j, k, p):
        def side(u, v, w):
            return (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0])

        a, b, c = point(i), point(j), point(k)
        return side(a, b, p) >= -1e-9 and side(b, c, p) >= -1e-9 and side(c, a, p) >= -1e-9

    triangles = []
    guard = 0
    while len(order) > 3 and guard < 1000:
        guard += 1
        slots = len(order)
        clipped = False
        for i in range(slots):
            prev = (i - 1) % slots
            nxt = (i + 1) % slots
            if not is_convex(prev, i, nxt):
                continue
            if any(
                contains(prev, i, nxt, point(j))
                for j in range(slots)
                if j not in (prev, i, nxt)
            ):
                continue
            triangles.append((order[prev], order[i], order[nxt]))
            del order[i]
            clipped = True
            break
        if not clipped:
            raise RuntimeError("耳切失敗，多邊形可能自交")
    if len(order) != 3:
        raise RuntimeError("耳切沒有切完")
    triangles.append((order[0], order[1], order[2]))
    return triangles


def _min_edge(verts, faces):
    shortest = 1e9
    for face in faces:
        for i, index in enumerate(face):
            ax, ay, az = verts[index]
            bx, by, bz = verts[face[(i + 1) % len(face)]]
            shortest = min(shortest, math.dist((ax, ay, az), (bx, by, bz)))
    return shortest


def cabinet_geometry(profile=None, x0=-HALF_W, x1=HALF_W):
    """機殼：外輪廓擠出 + 兩圈側飾條 + 內側夜空。回傳 verts, faces, material index。"""
    profile = profile or PROFILE
    mid = _offset_polygon(profile, BLUE_INSET)
    inner = _offset_polygon(profile, BLUE_INSET + ORANGE_INSET)
    if _segments_hit(mid) or _segments_hit(inner):
        raise RuntimeError("側板內縮後自交")
    count = len(profile)
    verts = []

    def add_loop(loop, x):
        start = len(verts)
        verts.extend((x, y, z) for y, z in loop)
        return start

    outer_l = add_loop(profile, x0)
    mid_l = add_loop(mid, x0)
    inner_l = add_loop(inner, x0)
    outer_r = add_loop(profile, x1)
    mid_r = add_loop(mid, x1)
    inner_r = add_loop(inner, x1)

    faces = []
    materials = []

    def add(face, name):
        faces.append(tuple(face))
        materials.append(MAT_INDEX[name])

    def ring(outer_base, inner_base, name):
        for i in range(count):
            j = (i + 1) % count
            add((outer_base + i, outer_base + j, inner_base + j, inner_base + i), name)

    ring(outer_l, mid_l, "blue")
    ring(mid_l, inner_l, "orange")
    ring(outer_r, mid_r, "blue")
    ring(mid_r, inner_r, "orange")

    for a, b, c in _ear_clip(inner):
        add((inner_l + a, inner_l + c, inner_l + b), "night")
        add((inner_r + a, inner_r + b, inner_r + c), "night")

    for i in range(count):
        j = (i + 1) % count
        add((outer_l + i, outer_l + j, outer_r + j, outer_r + i), WALL_MATERIAL[i])

    if _min_edge(verts, faces) < 1e-4:
        raise RuntimeError("機殼有退化邊")
    return verts, faces, materials


def _boundary_edges(verts, faces):
    counts = {}
    for face in faces:
        for i, index in enumerate(face):
            a, b = index, face[(i + 1) % len(face)]
            key = (a, b) if a < b else (b, a)
            counts[key] = counts.get(key, 0) + 1
    bad = {edge: n for edge, n in counts.items() if n != 2}
    return bad


class Accum:
    """把多個封閉小零件收成一個 Mesh（裝飾品允許多個幾何島）。"""

    def __init__(self):
        self.verts = []
        self.faces = []
        self.materials = []

    def add(self, verts, faces, name):
        base = len(self.verts)
        self.verts.extend(verts)
        index = MAT_INDEX[name]
        for face in faces:
            self.faces.append(tuple(i + base for i in face))
            self.materials.append(index)

    def add_box(self, corner_min, corner_max, name):
        (x0, y0, z0), (x1, y1, z1) = corner_min, corner_max
        if x1 < x0:
            x0, x1 = x1, x0
        if y1 < y0:
            y0, y1 = y1, y0
        if z1 < z0:
            z0, z1 = z1, z0
        verts = [
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
        ]
        faces = [
            (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
            (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        ]
        self.add(verts, faces, name)

    def add_prism_yz(self, poly, x0, x1, name):
        triangles = _ear_clip(poly)
        count = len(poly)
        verts = [(x0, y, z) for y, z in poly] + [(x1, y, z) for y, z in poly]
        faces = []
        for a, b, c in triangles:
            faces.append((a, c, b))
            faces.append((count + a, count + b, count + c))
        for i in range(count):
            j = (i + 1) % count
            faces.append((i, j, count + j, count + i))
        self.add(verts, faces, name)

    def add_prism_xz(self, poly, y0, y1, name):
        triangles = _ear_clip(poly)
        count = len(poly)
        verts = [(x, y0, z) for x, z in poly] + [(x, y1, z) for x, z in poly]
        faces = []
        for a, b, c in triangles:
            faces.append((a, c, b))
            faces.append((count + a, count + b, count + c))
        for i in range(count):
            j = (i + 1) % count
            faces.append((i, j, count + j, count + i))
        self.add(verts, faces, name)

    def add_disc_yz(self, cy, cz, ry, rz, x0, x1, name, segments=8):
        poly = [
            (cy + math.cos(math.tau * i / segments) * ry, cz + math.sin(math.tau * i / segments) * rz)
            for i in range(segments)
        ]
        self.add_prism_yz(poly, x0, x1, name)

    def add_grid_xz(self, xs, zs, solid, y0, y1, name):
        """把方格裡指定的格子擠出成一塊實心，共享邊的格子不會留下內部面。"""
        nx = len(xs)
        stride = nx * len(zs)
        verts = [(x, y0, z) for z in zs for x in xs]
        verts += [(x, y1, z) for z in zs for x in xs]
        solid = set(solid)

        def vid(i, j, back=False):
            return (stride if back else 0) + j * nx + i

        faces = []
        for i, j in solid:
            f00, f10 = vid(i, j), vid(i + 1, j)
            f01, f11 = vid(i, j + 1), vid(i + 1, j + 1)
            b00, b10 = vid(i, j, True), vid(i + 1, j, True)
            b01, b11 = vid(i, j + 1, True), vid(i + 1, j + 1, True)
            faces.append((f00, f01, f11, f10))
            faces.append((b00, b10, b11, b01))
            if (i, j - 1) not in solid:
                faces.append((f00, f10, b10, b00))
            if (i, j + 1) not in solid:
                faces.append((f01, b01, b11, f11))
            if (i - 1, j) not in solid:
                faces.append((f00, b00, b01, f01))
            if (i + 1, j) not in solid:
                faces.append((f10, f11, b11, b10))
        used = sorted({index for face in faces for index in face})
        remap = {old: new for new, old in enumerate(used)}
        self.add([verts[index] for index in used], [tuple(remap[i] for i in face) for face in faces], name)

    def add_cylinder(self, base, direction, radius, height, name, segments=8):
        dx, dy, dz = direction
        length = math.hypot(dx, dy, dz) or 1.0
        dx, dy, dz = dx / length, dy / length, dz / length
        helper = (1.0, 0.0, 0.0) if abs(dz) > 0.85 else (0.0, 0.0, 1.0)
        sx = dy * helper[2] - dz * helper[1]
        sy = dz * helper[0] - dx * helper[2]
        sz = dx * helper[1] - dy * helper[0]
        sl = math.hypot(sx, sy, sz) or 1.0
        sx, sy, sz = sx / sl, sy / sl, sz / sl
        ux, uy, uz = dy * sz - dz * sy, dz * sx - dx * sz, dx * sy - dy * sx
        ring = []
        for i in range(segments):
            angle = math.tau * i / segments
            ring.append((
                base[0] + (sx * math.cos(angle) + ux * math.sin(angle)) * radius,
                base[1] + (sy * math.cos(angle) + uy * math.sin(angle)) * radius,
                base[2] + (sz * math.cos(angle) + uz * math.sin(angle)) * radius,
            ))
        top = [(p[0] + dx * height, p[1] + dy * height, p[2] + dz * height) for p in ring]
        verts = ring + top
        faces = []
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((i, j, segments + j, segments + i))
        faces.append(tuple(range(segments - 1, -1, -1)))
        faces.append(tuple(range(segments, segments * 2)))
        self.add(verts, faces, name)


def _layer_x(side, layer, thickness=0.0045):
    inner = side * (HALF_W + 0.004 + layer * thickness)
    outer = side * (HALF_W + 0.004 + (layer + 1) * thickness)
    return (min(inner, outer), max(inner, outer))


def _depth(forward):
    """側視圖上，0 是背面，正值往玩家（-Y）。"""
    return -forward


def _build_side_art(accum, side):
    def slab(poly, layer, name):
        x0, x1 = _layer_x(side, layer)
        # 左側的繞向交給法線重算；點序維持在 yz
        yz = [(_depth(forward), z) for forward, z in poly]
        accum.add_prism_yz(yz, x0, x1, name)

    def disc(forward, z, ry, rz, layer, name, segments=8):
        x0, x1 = _layer_x(side, layer)
        accum.add_disc_yz(_depth(forward), z, ry, rz, x0, x1, name, segments)

    # 沙漠地面
    slab([
        (0.09, 0.14), (0.44, 0.13), (0.46, 0.36), (0.30, 0.50), (0.10, 0.44),
    ], 0, "desert")
    # 遠山、近山
    slab([(0.10, 0.46), (0.22, 0.78), (0.34, 0.48)], 1, "mountain_far")
    slab([(0.24, 0.44), (0.36, 0.70), (0.46, 0.40)], 1, "mountain")
    # 溪流
    slab([
        (0.34, 0.16), (0.40, 0.20), (0.44, 0.16), (0.47, 0.22),
        (0.44, 0.28), (0.38, 0.24), (0.34, 0.28),
    ], 1, "stream")

    # 星星
    for forward, z, size in (
        (0.14, 1.55, 0.012), (0.28, 1.62, 0.009), (0.18, 1.38, 0.008),
        (0.36, 1.46, 0.01), (0.12, 1.22, 0.008), (0.40, 1.28, 0.011),
    ):
        slab([
            (forward, z + size), (forward + size, z),
            (forward, z - size), (forward - size, z),
        ], 1, "star")

    # 仙人掌（靠背面）
    slab([(0.11, 0.18), (0.15, 0.18), (0.15, 0.46), (0.11, 0.46)], 2, "cactus")
    slab([(0.15, 0.34), (0.22, 0.34), (0.22, 0.39), (0.15, 0.39)], 2, "cactus")
    slab([(0.19, 0.39), (0.23, 0.39), (0.23, 0.50), (0.19, 0.50)], 2, "cactus")

    # 露營車
    slab([
        (0.16, 0.40), (0.34, 0.40), (0.36, 0.46), (0.35, 0.56), (0.18, 0.57), (0.15, 0.48),
    ], 2, "white")
    slab([(0.18, 0.50), (0.27, 0.50), (0.27, 0.545), (0.18, 0.545)], 3, "window")
    slab([(0.175, 0.455), (0.345, 0.455), (0.345, 0.477), (0.175, 0.477)], 3, "stripe")
    slab([(0.175, 0.478), (0.345, 0.478), (0.345, 0.492), (0.175, 0.492)], 3, "blue")
    disc(0.20, 0.40, 0.028, 0.028, 3, "wheel", 6)
    disc(0.31, 0.40, 0.028, 0.028, 3, "wheel", 6)

    # 小木屋（比較靠前面）
    slab([(0.36, 0.44), (0.45, 0.44), (0.45, 0.58), (0.36, 0.58)], 2, "cabin")
    slab([(0.345, 0.58), (0.465, 0.58), (0.40, 0.67)], 2, "cabin_roof")
    slab([(0.39, 0.44), (0.43, 0.44), (0.43, 0.52), (0.39, 0.52)], 3, "black")

    # 岩石
    slab([(0.28, 0.16), (0.36, 0.15), (0.37, 0.28), (0.30, 0.30)], 2, "rock")
    slab([(0.36, 0.14), (0.44, 0.15), (0.43, 0.26), (0.37, 0.22)], 2, "rock")
    slab([(0.40, 0.18), (0.46, 0.17), (0.47, 0.27), (0.41, 0.25)], 2, "rock_blue")

    # 小型飛碟
    for forward, z, scale in ((0.16, 1.50, 0.7), (0.30, 1.58, 0.55), (0.38, 1.34, 0.5)):
        disc(forward, z, 0.045 * scale, 0.016 * scale, 2, "ufo", 8)
        disc(forward, z + 0.02 * scale, 0.022 * scale, 0.016 * scale, 3, "ufo_dome", 6)

    # 大飛碟、光柱、人影
    disc(0.26, 1.30, 0.11, 0.03, 2, "ufo", 10)
    disc(0.26, 1.345, 0.05, 0.028, 3, "ufo_dome", 8)
    for shift in (-0.07, 0.0, 0.07):
        disc(0.26 + shift, 1.285, 0.012, 0.012, 3, "ufo_light", 5)
    slab([
        (0.24, 1.27), (0.28, 1.27), (0.33, 0.92), (0.19, 0.92),
    ], 3, "beam")
    # 人影要比光柱再外側一層
    disc(0.26, 1.10, 0.018, 0.022, 4, "person", 6)
    slab([(0.248, 0.98), (0.272, 0.98), (0.278, 1.07), (0.242, 1.07)], 4, "person")
    slab([(0.250, 0.90), (0.262, 0.90), (0.262, 0.978), (0.250, 0.978)], 4, "person")
    slab([(0.264, 0.90), (0.276, 0.90), (0.276, 0.978), (0.264, 0.978)], 4, "person")


def _build_front_art(accum):
    """投幣門兩側的正面圖，貼在下方面板外側。"""
    face_y = -0.54

    def slab(poly, layer, name):
        thickness = 0.004
        y1 = face_y - 0.004 - layer * thickness
        y0 = y1 - thickness
        accum.add_prism_xz(poly, y0, y1, name)

    # 左側露營車
    slab([
        (-0.30, 0.16), (-0.16, 0.16), (-0.15, 0.22), (-0.16, 0.32), (-0.29, 0.33), (-0.31, 0.24),
    ], 0, "white")
    slab([(-0.27, 0.26), (-0.19, 0.26), (-0.19, 0.305), (-0.27, 0.305)], 1, "window")
    slab([(-0.295, 0.215), (-0.165, 0.215), (-0.165, 0.238), (-0.295, 0.238)], 1, "stripe")
    # 右側仙人掌
    slab([(0.18, 0.16), (0.23, 0.16), (0.23, 0.46), (0.18, 0.46)], 0, "cactus")
    slab([(0.23, 0.32), (0.30, 0.32), (0.30, 0.37), (0.23, 0.37)], 0, "cactus")
    slab([(0.26, 0.37), (0.31, 0.37), (0.31, 0.48), (0.26, 0.48)], 0, "cactus")
    slab([(0.14, 0.15), (0.20, 0.14), (0.19, 0.22), (0.13, 0.20)], 0, "rock")


def _build_letters(accum):
    """招牌 HI-ORBIT。有洞的字母用同一張格子，筆畫之間不另外疊方塊。"""
    scale = 0.100
    depth0 = -0.578
    depth1 = -0.562
    z_base = 1.695

    def poly(origin, points):
        xz = [(origin + x * scale, z_base + z * scale) for x, z in points]
        accum.add_prism_xz(xz, depth0, depth1, "yellow")

    def grid(origin, xs, zs, solid):
        accum.add_grid_xz(
            [origin + x * scale for x in xs],
            [z_base + z * scale for z in zs],
            solid, depth0, depth1, "yellow",
        )

    glyphs = []

    def add(width, draw):
        glyphs.append((width, draw))

    add(0.86, lambda origin: poly(origin, [
        (0, 0), (0.22, 0), (0.22, 0.38), (0.64, 0.38), (0.64, 0), (0.86, 0),
        (0.86, 1), (0.64, 1), (0.64, 0.60), (0.22, 0.60), (0.22, 1), (0, 1),
    ]))
    add(0.28, lambda origin: poly(origin, [(0.02, 0), (0.26, 0), (0.26, 1), (0.02, 1)]))
    add(0.42, lambda origin: poly(origin, [(0, 0.42), (0.42, 0.42), (0.42, 0.58), (0, 0.58)]))
    add(0.80, lambda origin: grid(
        origin, [0, 0.18, 0.62, 0.80], [0, 0.20, 0.80, 1],
        [(i, j) for i in range(3) for j in range(3) if not (i == 1 and j == 1)],
    ))

    def draw_r(origin):
        grid(
            origin, [0, 0.20, 0.50, 0.74], [0, 0.34, 0.50, 0.76, 1],
            [(0, 0), (0, 1), (1, 1), (2, 1), (0, 2), (2, 2), (0, 3), (1, 3), (2, 3)],
        )
        # 斜腳停在中橫下方一點點，避免和中橫貼成同一批頂點
        poly(origin, [(0.24, 0), (0.70, 0), (0.50, 0.33), (0.22, 0.33)])

    add(0.78, draw_r)
    add(0.76, lambda origin: grid(
        origin, [0, 0.18, 0.52, 0.74], [0, 0.18, 0.40, 0.60, 0.82, 1],
        [(i, j) for i in range(3) for j in range(5) if (i, j) not in {(1, 1), (1, 3)}],
    ))
    add(0.28, lambda origin: poly(origin, [(0.02, 0), (0.26, 0), (0.26, 1), (0.02, 1)]))
    add(0.78, lambda origin: poly(origin, [
        (0.28, 0), (0.50, 0), (0.50, 0.74), (0.78, 0.74),
        (0.78, 1), (0, 1), (0, 0.74), (0.28, 0.74),
    ]))

    gap = 0.11
    total = sum(width for width, _ in glyphs) + gap * (len(glyphs) - 1)
    cursor = -total * scale / 2
    for width, draw in glyphs:
        draw(cursor)
        cursor += (width + gap) * scale


def _surface_normal():
    """操作台斜面的外向法線（大致朝上、朝玩家）。"""
    y1, z1 = PROFILE[7]
    y2, z2 = PROFILE[8]
    dy, dz = y2 - y1, z2 - z1
    length = math.hypot(dy, dz)
    # 兩個法線裡，朝 +Z 的那個是台面外側
    ny, nz = -dz / length, dy / length
    if nz < 0:
        ny, nz = -ny, -nz
    return ny, nz


def _on_deck(along, x):
    y1, z1 = PROFILE[7]
    y2, z2 = PROFILE[8]
    y = y1 + (y2 - y1) * along
    z = z1 + (z2 - z1) * along
    return (x, y, z)


def build_decorations():
    side = Accum()
    _build_side_art(side, +1)
    _build_side_art(side, -1)

    front = Accum()
    _build_front_art(front)

    letters = Accum()
    _build_letters(letters)

    stick = Accum()
    ny, nz = _surface_normal()

    def planted(along, x, sink=0.006):
        px, py, pz = _on_deck(along, x)
        return (px, py - ny * sink, pz - nz * sink)

    base = planted(0.42, -0.12)
    # 底蓋埋進操作台，避免和紅色台面貼成同一層
    stick.add_cylinder(base, (0, ny, nz), 0.022, 0.018, "black", 8)
    stick.add_cylinder(
        (base[0], base[1] + ny * 0.012, base[2] + nz * 0.012),
        (0, ny, nz), 0.011, 0.078, "black", 6,
    )
    ball = (
        base[0],
        base[1] + ny * 0.084,
        base[2] + nz * 0.084,
    )
    _add_sphere(stick, ball, 0.032, "button")

    buttons = Accum()
    for x in (0.07, 0.17):
        buttons.add_cylinder(planted(0.60, x, sink=0.004), (0, ny, nz), 0.028, 0.026, "button", 8)

    door = Accum()
    # 門比正面圖更靠玩家，才不會和圖卡在同一層
    door.add_box((-0.15, -0.592, 0.30), (0.09, -0.566, 0.70), "black")
    door.add_box((-0.10, -0.608, 0.52), (-0.02, -0.590, 0.62), "red")
    door.add_box((0.01, -0.608, 0.52), (0.09, -0.590, 0.62), "red_dark")
    door.add_box((-0.07, -0.604, 0.36), (0.05, -0.590, 0.43), "wheel")

    screen = Accum()
    screen.add_box((-0.29, -0.468, 1.15), (0.29, -0.448, 1.51), "screen")

    return {
        "SideArt": side,
        "FrontArt": front,
        "MarqueeText": letters,
        "Joystick": stick,
        "Buttons": buttons,
        "CoinDoor": door,
        "CRT": screen,
    }


def _add_sphere(accum, center, radius, name, segments=8, rings=4):
    verts = [(center[0], center[1], center[2] + radius)]
    for ring in range(1, rings):
        pitch = math.pi * ring / rings
        for seg in range(segments):
            yaw = math.tau * seg / segments
            verts.append((
                center[0] + math.cos(yaw) * math.sin(pitch) * radius,
                center[1] + math.sin(yaw) * math.sin(pitch) * radius,
                center[2] + math.cos(pitch) * radius,
            ))
    verts.append((center[0], center[1], center[2] - radius))
    faces = []
    for seg in range(segments):
        nxt = (seg + 1) % segments
        faces.append((0, 1 + seg, 1 + nxt))
    for ring in range(rings - 2):
        row = 1 + ring * segments
        nxt_row = row + segments
        for seg in range(segments):
            nxt = (seg + 1) % segments
            faces.append((row + seg, nxt_row + seg, nxt_row + nxt, row + nxt))
    bottom = len(verts) - 1
    last = 1 + (rings - 2) * segments
    for seg in range(segments):
        nxt = (seg + 1) % segments
        faces.append((bottom, last + nxt, last + seg))
    accum.add(verts, faces, name)


def assert_closed(verts, faces, label):
    bad = _boundary_edges(verts, faces)
    if bad:
        sample = list(bad.items())[:6]
        raise RuntimeError(f"{label} 不是封閉流形，例外邊 {sample}")


def test_geometry():
    verts, faces, materials = cabinet_geometry()
    assert_closed(verts, faces, "Cabinet")
    if len(materials) != len(faces):
        raise RuntimeError("材質索引數量和面數不一致")
    decorations = build_decorations()
    for name, accum in decorations.items():
        assert_closed(accum.verts, accum.faces, name)
        if len(accum.materials) != len(accum.faces):
            raise RuntimeError(f"{name} 材質索引數量不一致")
    inner = _offset_polygon(PROFILE, BLUE_INSET + ORANGE_INSET)
    if len(_ear_clip(inner)) != len(inner) - 2:
        raise RuntimeError("內側夜空沒有切成 n-2 個三角形")
    print("geometry ok", {name: len(accum.faces) for name, accum in decorations.items()}, "cabinet", len(faces))


def _material_payload():
    return [{"name": name, "color": color, "roughness": rough} for name, color, rough in MATERIALS]


def _must(result, step):
    report = result.get("report") or {}
    checks = report.get("checks") or {}
    brief = {
        "step": step,
        "ok": result.get("ok"),
        "status": report.get("status"),
        "errors": result.get("errors"),
        "faces": checks.get("faces"),
        "components": checks.get("components"),
        "non_manifold": checks.get("non_manifold_edges"),
        "boundary": checks.get("boundary_edges"),
        "ngons": checks.get("ngons"),
        "degenerate": checks.get("degenerate_faces"),
    }
    print(brief)
    if not result.get("ok"):
        raise RuntimeError(f"{step} 失敗：{result.get('errors')}")
    return result


def _remove_object(obj):
    mesh = obj.data if obj.type == "MESH" else None
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh is not None and mesh.users == 0:
        bpy.data.meshes.remove(mesh)


def _cleanup_previous():
    collection = bpy.data.collections.get("HiOrbit")
    if collection is not None:
        for obj in list(collection.objects):
            _remove_object(obj)
        bpy.data.collections.remove(collection)
    root = bpy.data.objects.get("HiOrbit")
    if root is not None:
        for obj in [root, *list(root.children_recursive)]:
            if obj.name in bpy.data.objects:
                _remove_object(obj)
    for mesh in list(bpy.data.meshes):
        if mesh.name.startswith("HiOrbit") or mesh.name.startswith("Cabinet__backup"):
            if mesh.users == 0:
                bpy.data.meshes.remove(mesh)
    own_backups = (
        "Cabinet__backup", "CRT__backup", "SideArt__backup", "FrontArt__backup",
        "MarqueeText__backup", "Joystick__backup", "Buttons__backup", "CoinDoor__backup",
    )
    for mesh in list(bpy.data.meshes):
        if mesh.name.startswith(own_backups) and mesh.users <= 1:
            bpy.data.meshes.remove(mesh)
    for material in list(bpy.data.materials):
        if material.name.startswith("HiOrbit_") and material.users == 0:
            bpy.data.materials.remove(material)
    for name, color, rough in MATERIALS:
        material = bpy.data.materials.get(name)
        if material is None or material.node_tree is None:
            continue
        rgba = (*color, 1.0)
        bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if bsdf is not None:
            bsdf.inputs["Base Color"].default_value = rgba
            bsdf.inputs["Roughness"].default_value = rough
        material.diffuse_color = rgba


def _placement():
    min_x = None
    for name in ("House_Root", "Burger"):
        root = bpy.data.objects.get(name)
        if root is None:
            continue
        for obj in [root, *root.children_recursive]:
            if obj.type != "MESH":
                continue
            for corner in obj.bound_box:
                world = obj.matrix_world @ Vector(corner)
                min_x = world.x if min_x is None else min(min_x, world.x)
    if min_x is None:
        return (0.0, 0.0, 0.0)
    return (min_x - HALF_W - 2.2, 0.0, 0.0)


def _finish_object(api, name):
    _must(api.repair_mesh_topology(name), f"repair {name}")
    _must(api.optimize_lowpoly_mesh(name), f"optimize {name}")
    return _must(api.validate_mesh_topology(name), f"validate {name}")


def build():
    import lowpoly_kit

    lowpoly_kit = lowpoly_kit.reload_all()
    api = lowpoly_kit.api
    from lowpoly_kit import mesh_builder

    _cleanup_previous()
    test_geometry()

    location = _placement()
    root = mesh_builder.create_empty("HiOrbit", collection="HiOrbit", location=location)
    payload = _material_payload()
    verts, faces, indices = cabinet_geometry()
    _must(api.create_connected_mesh(
        "Cabinet", verts, faces, collection="HiOrbit", profile="building_shell",
        materials=payload, material_indices=indices, parent=root,
    ), "create Cabinet")

    # 招牌：橘框留下，內側改黑
    _must(api.extrude_mesh_region(
        "Cabinet",
        {"normal": (0, -1, 0), "bounds": [[-0.40, -0.58, 1.66], [0.40, -0.54, 1.84]]},
        mode="inset", thickness=0.022, material_index=MAT_INDEX["black"],
    ), "inset marquee")

    # 螢幕：黑框 → 藍框 → 往內推成凹槽
    _must(api.extrude_mesh_region(
        "Cabinet",
        {"normal": (0, -1, 0), "bounds": [[-0.40, -0.50, 1.12], [0.40, -0.46, 1.56]]},
        mode="inset", thickness=0.030, material_index=MAT_INDEX["blue"],
    ), "inset screen bezel")
    _must(api.extrude_mesh_region(
        "Cabinet",
        {"normal": (0, -1, 0), "bounds": [[-0.30, -0.50, 1.16], [0.30, -0.46, 1.50]]},
        mode="inset_extrude", thickness=0.016, depth=-0.07, material_index=MAT_INDEX["screen"],
    ), "extrude screen recess")

    # 下方面板：藍框 → 橘框 → 沙漠底
    _must(api.extrude_mesh_region(
        "Cabinet",
        {"normal": (0, -1, 0), "bounds": [[-0.40, -0.56, 0.12], [0.40, -0.52, 0.78]]},
        mode="inset", thickness=0.026, material_index=MAT_INDEX["orange"],
    ), "inset front outer")
    _must(api.extrude_mesh_region(
        "Cabinet",
        {"normal": (0, -1, 0), "bounds": [[-0.30, -0.56, 0.18], [0.30, -0.52, 0.70]]},
        mode="inset", thickness=0.016, material_index=MAT_INDEX["desert"],
    ), "inset front inner")

    profiles = {
        "CRT": "glass",
        "MarqueeText": "decoration",
        "Joystick": "decoration",
        "Buttons": "decoration",
        "CoinDoor": "decoration",
        "SideArt": "decoration",
        "FrontArt": "decoration",
    }
    for name, accum in build_decorations().items():
        _must(api.create_connected_mesh(
            name, accum.verts, accum.faces, collection="HiOrbit", profile=profiles[name],
            materials=payload, material_indices=accum.materials, parent=root,
        ), f"create {name}")

    reports = {"Cabinet": _finish_object(api, "Cabinet")}
    for name in profiles:
        reports[name] = _finish_object(api, name)

    output = os.path.abspath(os.path.join(
        HERE, "..", "..", "..", "public", "models", "hi_orbit", "hi_orbit.glb",
    ))
    exported = _must(api.prepare_for_gltf(root, output), "export")
    for name in ["Cabinet", *profiles.keys()]:
        api.clear_backups(name)
    print({"placement": tuple(round(v, 3) for v in location), "glb": output})
    print({"export": exported.get("changes", {}).get("export")})
    return {"root": root.name, "reports": reports, "export": exported, "glb": output}


if __name__ == "__main__":
    if bpy is None:
        test_geometry()
    else:
        build()
