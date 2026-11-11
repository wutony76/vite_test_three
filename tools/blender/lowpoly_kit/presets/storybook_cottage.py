"""水彩故事屋：高瘦白塔、橘瓦屋頂、左側圓石堆、右側歪斜門廊。

座標（Blender，+Z 朝上，正面朝 -Y，1 單位 = 1 公尺）。
幾何全部用連續的頂點／面建立，不用 primitive 堆疊再 Join。
煙囪、煙管、蓋子先各自封閉，再 Boolean Union 進屋頂。
圓石堆先融成一坨，再 Voxel Remesh。
"""

import math

import bpy
from mathutils import Vector

from .. import api, mesh_builder
from ..result import KitError

MATERIALS = {
    "plaster": ("LPK_Cottage_Plaster", (0.93, 0.89, 0.82), 0.85, 0.0),
    "roof": ("LPK_Cottage_Roof", (0.74, 0.26, 0.07), 0.7, 0.0),
    "stone": ("LPK_Cottage_Stone", (0.62, 0.58, 0.52), 0.9, 0.0),
    "rock": ("LPK_Cottage_Rock", (0.58, 0.52, 0.48), 0.95, 0.0),
    "wood": ("LPK_Cottage_Wood", (0.46, 0.27, 0.13), 0.8, 0.0),
    "wood_dark": ("LPK_Cottage_WoodDark", (0.30, 0.17, 0.08), 0.75, 0.0),
    "glass": ("LPK_Cottage_Glass", (0.55, 0.74, 0.84), 0.08, 0.0),
    "brick": ("LPK_Cottage_Brick", (0.58, 0.30, 0.20), 0.85, 0.0),
    "metal": ("LPK_Cottage_Metal", (0.32, 0.33, 0.35), 0.35, 0.85),
    "leaf": ("LPK_Cottage_Leaf", (0.30, 0.46, 0.16), 0.9, 0.0),
    "flower_red": ("LPK_Cottage_FlowerRed", (0.82, 0.28, 0.16), 0.7, 0.0),
    "flower_yellow": ("LPK_Cottage_FlowerYellow", (0.92, 0.72, 0.22), 0.7, 0.0),
}

_BOX_FACES = (
    (0, 3, 2, 1),
    (4, 5, 6, 7),
    (0, 1, 5, 4),
    (1, 2, 6, 5),
    (2, 3, 7, 6),
    (3, 0, 4, 7),
)


def _check(result, step):
    if not result["ok"]:
        raise KitError(result["errors"][0]["code"], f"{step}：{result['errors'][0]['message']}")
    return result


def _material(key):
    name, color, roughness, metallic = MATERIALS[key]
    material = mesh_builder.get_or_create_material(name, color, roughness=roughness)
    bsdf = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metallic
    material.diffuse_color = (*color, 1.0)
    return material


def _append(verts, faces, more_verts, more_faces):
    base = len(verts)
    verts.extend(more_verts)
    faces.extend(tuple(index + base for index in face) for face in more_faces)


def _box_verts(corners):
    return [tuple(corner) for corner in corners]


def _prism_x(outline_yz, x0, x1, cap_faces):
    """把 YZ 輪廓沿 X 擠出。cap_faces 用輪廓索引，避免端面變成 ngon。"""
    count = len(outline_yz)
    verts = [(x0, y, z) for y, z in outline_yz] + [(x1, y, z) for y, z in outline_yz]
    faces = []
    for cap in cap_faces:
        faces.append(tuple(cap))
        faces.append(tuple(index + count for index in reversed(cap)))
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, nxt + count, index + count))
    return verts, faces


def _uv_sphere(center, radii, segments=6, rings=4):
    cx, cy, cz = center
    rx, ry, rz = radii
    verts = []
    for ring in range(rings + 1):
        polar = math.pi * ring / rings
        z = cz + rz * math.cos(polar)
        radius = math.sin(polar)
        if ring == 0 or ring == rings:
            verts.append((cx, cy, z))
            continue
        for segment in range(segments):
            azimuth = math.tau * segment / segments
            verts.append((
                cx + rx * radius * math.cos(azimuth),
                cy + ry * radius * math.sin(azimuth),
                z,
            ))

    def index(ring, segment):
        if ring == 0:
            return 0
        if ring == rings:
            return 1 + (rings - 1) * segments
        return 1 + (ring - 1) * segments + (segment % segments)

    faces = []
    for segment in range(segments):
        faces.append((index(0, 0), index(1, segment + 1), index(1, segment)))
        faces.append((index(rings, 0), index(rings - 1, segment), index(rings - 1, segment + 1)))
    for ring in range(1, rings - 1):
        for segment in range(segments):
            faces.append((
                index(ring, segment),
                index(ring, segment + 1),
                index(ring + 1, segment + 1),
                index(ring + 1, segment),
            ))
    return verts, faces


def _frustum(center_xy, z0, z1, radius0, radius1, sides=6):
    cx, cy = center_xy
    verts = []
    for z, radius in ((z0, radius0), (z1, radius1)):
        for side in range(sides):
            angle = math.tau * side / sides
            verts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle), z))
    faces = [tuple(range(sides)), tuple(range(2 * sides - 1, sides - 1, -1))]
    for side in range(sides):
        nxt = (side + 1) % sides
        faces.append((side, nxt, nxt + sides, side + sides))
    return verts, faces


def _beam(start, end, half=0.03):
    origin = Vector(start)
    target = Vector(end)
    direction = target - origin
    side = direction.cross(Vector((0.0, 0.0, 1.0)))
    if side.length < 1e-6:
        side = Vector((1.0, 0.0, 0.0))
    side.normalize()
    up = direction.cross(side).normalized()
    side *= half
    up *= half
    ring = (
        (side + up, -side + up, -side - up, side - up),
    )
    verts = []
    for point in (origin, target):
        for offset in ring[0]:
            verts.append(tuple(point + offset))
    faces = [
        (0, 1, 2, 3),
        (4, 7, 6, 5),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    ]
    return verts, faces


def _gable(x0, x1, y_front, y_ridge, y_back, left_z, right_z, thickness):
    """左右兩端高度可以不同的厚人字頂，封閉且只有一個幾何島。"""

    def section(x, z_front, z_ridge, z_back):
        return [
            (x, y_front, z_front),
            (x, y_ridge, z_ridge),
            (x, y_back, z_back),
            (x, y_back, z_back + thickness),
            (x, y_ridge, z_ridge + thickness),
            (x, y_front, z_front + thickness),
        ]

    verts = section(x0, *left_z) + section(x1, *right_z)
    caps = ((0, 1, 4, 5), (1, 2, 3, 4))
    faces = []
    for cap in caps:
        faces.append(cap)
        faces.append(tuple(index + 6 for index in reversed(cap)))
    for index in range(6):
        nxt = (index + 1) % 6
        faces.append((index, nxt, nxt + 6, index + 6))
    return verts, faces


def _hip_roof():
    """主屋頂：正面屋簷中間下凹，右側屋脊較低，厚殼包住牆頂。"""
    # 0 左前、1 正面下凹、2 右前、3 右後、4 左後、5 左屋脊、6 右屋脊
    top = [
        (-1.72, -1.72, 4.22),
        (0.05, -1.86, 3.98),
        (1.70, -1.64, 4.18),
        (1.62, 1.58, 4.36),
        (-1.62, 1.58, 4.42),
        (-0.62, -0.08, 5.32),
        (0.48, -0.02, 5.12),
    ]
    bottom = [
        (-1.40, -1.38, 3.98),
        (0.04, -1.50, 3.74),
        (1.38, -1.32, 3.94),
        (1.30, 1.24, 4.12),
        (-1.30, 1.24, 4.18),
        (-0.62, -0.08, 5.08),
        (0.48, -0.02, 4.88),
    ]
    verts = top + bottom
    faces = [
        (0, 1, 5),
        (1, 2, 6, 5),
        (2, 3, 6),
        (3, 4, 5, 6),
        (4, 0, 5),
        (7, 12, 8),
        (8, 12, 13, 9),
        (9, 13, 10),
        (10, 13, 12, 11),
        (11, 12, 7),
        (0, 7, 8, 1),
        (1, 8, 9, 2),
        (2, 9, 10, 3),
        (3, 10, 11, 4),
        (4, 11, 7, 0),
    ]
    return verts, faces


def _purge_previous():
    for obj in list(bpy.data.objects):
        if obj.name == "StorybookCottage_Root" or obj.name.startswith("Cottage_"):
            bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.name.startswith("Cottage_") and mesh.users <= 1:
            bpy.data.meshes.remove(mesh)


def _create(name, verts, faces, root, profile, materials, material_indices=None):
    _check(api.create_connected_mesh(
        name, verts, faces, collection="StorybookCottage", profile=profile,
        materials=materials, material_indices=material_indices, parent=root,
    ), name)
    return name


def _finish(name):
    optimized = api.optimize_lowpoly_mesh(name)
    if not optimized["ok"]:
        raise KitError("VALIDATION_FAILED", f"{name} optimize：{optimized['errors'][0]['message']}")
    repaired = api.repair_mesh_topology(name)
    if not repaired["ok"]:
        raise KitError("VALIDATION_FAILED", f"{name} repair：{repaired['errors'][0]['message']}")
    return name


def _opening(root, name, corners, facing, materials, inner_index=None, inset=0.06, recess=-0.03):
    _create(name, _box_verts(corners), _BOX_FACES, root, "opening", materials)
    _check(api.extrude_mesh_region(
        name, {"normal": facing}, mode="inset_extrude", thickness=inset, depth=recess,
        material_index=inner_index,
    ), f"{name} 內凹")
    return name


def build_foundation(root):
    verts, faces = mesh_builder.box((-1.58, -2.75, 0.0), (1.88, 1.38, 0.22))
    name = _create("Cottage_Foundation", verts, faces, root, "building_shell", [_material("stone")])
    _check(api.extrude_mesh_region(
        name, {"normal": [0, 0, 1]}, mode="inset_extrude", thickness=0.14, depth=0.14,
    ), "Cottage_Foundation 台階")
    return name


def build_body(root):
    corners = [
        (-1.22, -1.12, 0.36), (1.16, -1.12, 0.36), (1.16, 1.10, 0.36), (-1.22, 1.10, 0.36),
        (-1.08, -1.02, 4.18), (1.08, -1.02, 4.18), (1.08, 1.02, 4.34), (-1.08, 1.02, 4.34),
    ]
    return _create("Cottage_Body", corners, _BOX_FACES, root, "building_shell", [_material("plaster")])


def _plane_z(p0, p1, p2, x, y):
    ax, ay, az = p0
    bx, by, bz = p1
    cx, cy, cz = p2
    nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay)
    ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az)
    nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
    return az - (nx * (x - ax) + ny * (y - ay)) / nz


def build_roof(root):
    verts, faces = _hip_roof()
    roof = _create("Cottage_Roof", verts, faces, root, "building_shell", [_material("roof")])

    # 磚煙囪底面沿著左坡埋進瓦片厚度的中間，Union 後才貼齊屋面。
    top, bottom = verts[:7], verts[7:]

    def buried(x, y):
        zt = _plane_z(top[4], top[0], top[5], x, y)
        zb = _plane_z(bottom[4], bottom[0], bottom[5], x, y)
        return (zt + zb) / 2

    footprint = [(-1.28, -0.42), (-0.82, -0.42), (-0.82, 0.02), (-1.28, 0.02)]
    chimney_corners = [(x, y, buried(x, y)) for x, y in footprint]
    chimney_corners += [(x, y, 5.72) for x, y in footprint]
    chimney = _create("Cottage_Chimney", chimney_corners, _BOX_FACES, root, "building_shell", [_material("brick")])
    flue = _create(
        "Cottage_Flue", *_frustum((-1.05, -0.20), 5.48, 6.70, 0.055, 0.05, sides=6),
        root, "building_shell", [_material("metal")],
    )
    cap = _create(
        "Cottage_Cap", *_frustum((-1.05, -0.20), 6.55, 6.70, 0.16, 0.15, sides=8),
        root, "building_shell", [_material("metal")],
    )
    knob = _create(
        "Cottage_Knob", *_frustum((-1.05, -0.20), 6.62, 6.86, 0.04, 0.028, sides=6),
        root, "building_shell", [_material("metal")],
    )
    bpy.context.view_layer.update()
    for part in (flue, cap, knob):
        _check(api.boolean_union_objects(chimney, [part]), f"{chimney} ∪ {part}")
    _check(api.boolean_union_objects(roof, [chimney]), f"{roof} ∪ {chimney}")
    return roof


def build_porch(root):
    corners = [
        (0.06, -2.58, 0.26), (1.62, -2.58, 0.26), (1.62, -1.00, 0.26), (0.06, -1.00, 0.26),
        (0.08, -2.58, 2.28), (1.64, -2.58, 1.82), (1.64, -1.00, 1.96), (0.08, -1.00, 2.40),
    ]
    return _create("Cottage_Porch", corners, _BOX_FACES, root, "building_shell", [_material("plaster")])


def build_porch_roof(root):
    verts, faces = _gable(
        -0.16, 1.78, -2.90, -2.02, -1.06,
        (2.12, 3.32, 2.52),
        (1.90, 2.18, 1.96),
        0.13,
    )
    name = _create("Cottage_PorchRoof", verts, faces, root, "building_shell", [_material("roof")])
    # 左側翹起的破瓦，起點埋在屋瓦厚度裡，尖端翻起來。
    flap_verts, flap_faces = _beam((0.02, -2.08, 3.24), (-0.36, -2.55, 3.62), half=0.11)
    flap = _create("Cottage_PorchFlap", flap_verts, flap_faces, root, "building_shell", [_material("roof")])
    bpy.context.view_layer.update()
    _check(api.boolean_union_objects(name, [flap]), "門廊破瓦")
    return name


def build_steps(root):
    outline = [
        (-2.36, 0.42), (-2.76, 0.42), (-2.76, 0.32), (-3.08, 0.32),
        (-3.08, 0.21), (-3.40, 0.21), (-3.40, 0.10), (-3.74, 0.10),
        (-3.74, 0.00), (-2.36, 0.00),
    ]
    caps = [[9, index, index + 1] for index in range(8)]
    verts, faces = _prism_x(outline, 0.16, 1.52, caps)
    return _create("Cottage_Steps", verts, faces, root, "building_shell", [_material("stone")])


def build_rocks(root):
    # 底層埋進地面、咬進左牆與前牆。彼此重疊才融得成一坨。
    specs = [
        ((-1.70, -0.15, 0.32), (0.55, 0.48, 0.40)),
        ((-1.25, -0.55, 0.30), (0.42, 0.40, 0.36)),
        ((-1.90, 0.25, 0.28), (0.42, 0.38, 0.36)),
        ((-1.22, -1.12, 0.28), (0.42, 0.38, 0.34)),
        ((-1.00, -1.22, 0.24), (0.36, 0.32, 0.30)),
        ((-2.05, -0.55, 0.26), (0.38, 0.34, 0.32)),
        ((-1.50, -0.35, 0.78), (0.36, 0.34, 0.32)),
        ((-1.32, -0.80, 0.70), (0.36, 0.32, 0.30)),
        ((-1.75, 0.00, 0.72), (0.32, 0.28, 0.30)),
        ((-1.40, -0.50, 1.20), (0.30, 0.28, 0.28)),
        ((-1.32, -0.85, 1.15), (0.28, 0.26, 0.26)),
        ((-1.35, -0.40, 1.58), (0.26, 0.24, 0.26)),
        ((-1.28, -0.50, 1.90), (0.24, 0.22, 0.24)),
    ]
    names = []
    for index, (center, radii) in enumerate(specs):
        verts, faces = _uv_sphere(center, radii)
        names.append(_create(f"Cottage_Rock{index}", verts, faces, root, "organic", [_material("rock")]))
    bpy.data.objects[names[0]].name = "Cottage_Rocks"
    bpy.context.view_layer.update()
    _check(api.boolean_union_objects("Cottage_Rocks", names[1:], max_face_ratio=18), "圓石堆融合")
    last = None
    for voxel in (0.07, 0.09, 0.12):
        remeshed = api.remesh_organic_mesh("Cottage_Rocks", voxel_size=voxel, validate=False)
        if not remeshed["ok"]:
            last = remeshed
            continue
        last = api.repair_mesh_topology("Cottage_Rocks")
        if last["ok"]:
            break
    bpy.data.objects["Cottage_Rocks"].data.name = "Cottage_Rocks"
    if last is None or not last["ok"]:
        message = last["errors"][0]["message"] if last and last["errors"] else "remesh 沒有結果"
        raise KitError("VALIDATION_FAILED", f"Cottage_Rocks remesh：{message}")
    return "Cottage_Rocks"


def build_door(root):
    corners = [
        (0.48, -2.74, 0.36), (1.16, -2.74, 0.36), (1.16, -2.48, 0.36), (0.48, -2.48, 0.36),
        (0.48, -2.74, 1.82), (1.16, -2.74, 1.82), (1.16, -2.48, 1.82), (0.48, -2.48, 1.82),
    ]
    _opening(root, "Cottage_Door", corners, (0, -1, 0), [_material("wood")], inset=0.07, recess=-0.035)
    glass_verts, glass_faces = mesh_builder.box((0.68, -2.78, 1.42), (0.96, -2.74, 1.64))
    _create("Cottage_DoorGlass", glass_verts, glass_faces, root, "glass", [_material("glass")])
    return "Cottage_Door"


def build_window(root):
    corners = [
        (-0.86, -1.22, 3.06), (-0.08, -1.22, 3.06), (-0.08, -1.02, 3.06), (-0.86, -1.02, 3.06),
        (-0.86, -1.22, 3.70), (-0.08, -1.22, 3.70), (-0.08, -1.02, 3.70), (-0.86, -1.02, 3.70),
    ]
    _opening(root, "Cottage_WindowFrame", corners, (0, -1, 0), [_material("wood_dark")], inset=0.055, recess=-0.03)
    glass_verts, glass_faces = mesh_builder.box((-0.80, -1.25, 3.13), (-0.14, -1.20, 3.63))
    _create("Cottage_WindowGlass", glass_verts, glass_faces, root, "glass", [_material("glass")])

    cx, cz, t = -0.47, 3.38, 0.028
    hw, hh = 0.30, 0.23
    outline = [
        (cx + t, cz + hh), (cx - t, cz + hh), (cx - t, cz + t), (cx - hw, cz + t),
        (cx - hw, cz - t), (cx - t, cz - t), (cx - t, cz - hh), (cx + t, cz - hh),
        (cx + t, cz - t), (cx + hw, cz - t), (cx + hw, cz + t), (cx + t, cz + t),
    ]
    caps = [[0, 1, 2, 11], [2, 3, 4, 5], [5, 6, 7, 8], [8, 9, 10, 11], [11, 2, 5, 8]]
    verts, faces = mesh_builder.prism_from_outline(outline, -1.27, -1.18, cap_faces=caps)
    _create("Cottage_WindowMullion", verts, faces, root, "opening", [_material("wood_dark")])
    return "Cottage_WindowFrame"


def build_flower_box(root):
    # 後側伸進牆面，頂面接到窗台。花嵌進箱頂，不懸空。
    verts, faces = mesh_builder.box((-0.96, -1.40, 2.82), (-0.02, -0.98, 3.10))
    red_verts, red_faces = _uv_sphere((-0.74, -1.22, 3.08), (0.075, 0.07, 0.06), segments=5, rings=3)
    yellow_verts, yellow_faces = _uv_sphere((-0.48, -1.26, 3.09), (0.065, 0.06, 0.055), segments=5, rings=3)
    leaf_verts, leaf_faces = _uv_sphere((-0.28, -1.20, 3.06), (0.06, 0.05, 0.05), segments=5, rings=3)
    indices = [0] * len(faces)
    _append(verts, faces, red_verts, red_faces)
    indices.extend([1] * len(red_faces))
    _append(verts, faces, yellow_verts, yellow_faces)
    indices.extend([2] * len(yellow_faces))
    _append(verts, faces, leaf_verts, leaf_faces)
    indices.extend([3] * len(leaf_faces))
    _create(
        "Cottage_FlowerBox", verts, faces, root, "decoration",
        [_material("wood"), _material("flower_red"), _material("flower_yellow"), _material("leaf")],
        indices,
    )
    return "Cottage_FlowerBox"


def build_lantern(root):
    verts, faces = [], []
    # 支架從牆內伸出來，燈身掛在支架下方並與支架重疊。
    parts = [
        mesh_builder.box((-1.02, -0.78, 3.40), (-1.50, -0.62, 3.50)),
        mesh_builder.box((-1.44, -0.76, 3.08), (-1.30, -0.64, 3.46)),
        mesh_builder.box((-1.52, -0.84, 2.92), (-1.22, -0.56, 3.18)),
        mesh_builder.box((-1.56, -0.88, 3.14), (-1.18, -0.52, 3.24)),
    ]
    for part_verts, part_faces in parts:
        _append(verts, faces, part_verts, part_faces)
    _create("Cottage_Lantern", verts, faces, root, "decoration", [_material("wood_dark")])
    return "Cottage_Lantern"


def build_sconce(root):
    verts, faces = [], []
    # 背板伸進正面牆，燈頭與背板重疊。
    parts = [
        mesh_builder.box((-0.58, -1.02, 1.42), (-0.34, -1.16, 1.66)),
        mesh_builder.box((-0.54, -1.12, 1.22), (-0.38, -1.34, 1.50)),
    ]
    for part_verts, part_faces in parts:
        _append(verts, faces, part_verts, part_faces)
    _create("Cottage_Sconce", verts, faces, root, "decoration", [_material("wood_dark")])
    return "Cottage_Sconce"


def build_bucket(root):
    # 桶身在門廊右側，提把穿過橫樑（樑約在 x=1.95, z=2.08）。
    verts, faces = _frustum((1.95, -1.95), 1.28, 1.68, 0.11, 0.14, sides=6)
    handle, handle_faces = _beam((1.82, -1.95, 1.64), (2.08, -1.95, 2.16), half=0.018)
    _append(verts, faces, handle, handle_faces)
    _create("Cottage_Bucket", verts, faces, root, "decoration", [_material("wood")])
    return "Cottage_Bucket"


def build_brace(root):
    # 一端埋進門廊屋頂，另一端伸到吊桶提把裡。
    verts, faces = _beam((1.35, -2.15, 2.28), (2.12, -1.88, 1.92), half=0.04)
    _create("Cottage_PorchBrace", verts, faces, root, "decoration", [_material("wood_dark")])
    return "Cottage_PorchBrace"


def build_crate(root):
    # 貼著最下面那階的左側，底面在地面上。
    verts, faces = mesh_builder.box((-0.08, -3.58, 0.0), (0.30, -3.18, 0.34))
    _create("Cottage_Crate", verts, faces, root, "decoration", [_material("wood")])
    return "Cottage_Crate"


def build_rock_box(root):
    # 半截嵌在左側石堆裡，像原圖卡在石縫的木箱。
    verts, faces = mesh_builder.box((-2.32, -0.48, 0.36), (-1.92, -0.18, 0.66))
    _create("Cottage_RockBox", verts, faces, root, "decoration", [_material("wood")])
    return "Cottage_RockBox"


def build_downpipe(root):
    # 貼左牆，下端進石堆高度、上端伸進屋簷。
    verts, faces = mesh_builder.box((-1.26, -0.98, 1.70), (-1.10, -0.86, 3.85))
    _create("Cottage_Downpipe", verts, faces, root, "decoration", [_material("metal")])
    return "Cottage_Downpipe"


def build_foliage(root):
    verts, faces = [], []
    # 球心低於半徑，底部埋進地面，並靠上石堆與門廊牆角。
    clumps = [
        ((-1.95, -1.20, 0.14), (0.34, 0.28, 0.22)),
        ((-1.62, -1.42, 0.12), (0.26, 0.22, 0.20)),
        ((-2.15, -0.72, 0.10), (0.24, 0.20, 0.18)),
        ((1.72, -2.48, 0.16), (0.32, 0.26, 0.24)),
        ((1.98, -2.18, 0.18), (0.24, 0.22, 0.24)),
        ((1.50, -2.72, 0.10), (0.22, 0.18, 0.16)),
    ]
    for center, radii in clumps:
        _append(verts, faces, *_uv_sphere(center, radii, segments=6, rings=3))
    _create("Cottage_Foliage", verts, faces, root, "decoration", [_material("leaf")])
    return "Cottage_Foliage"


def _report(name):
    result = api.validate_mesh_topology(name)
    report = result["report"]
    checks = report["checks"]
    return {
        "ok": result["ok"],
        "profile": report["profile"],
        "status": report["status"],
        "components": checks["components"],
        "non_manifold": checks["non_manifold_edges"],
        "boundary": checks["boundary_edges"],
        "faces": checks["faces"],
        "ngons": checks["ngons"],
        "issues": report["issues"],
    }


def build(location=(-8.0, 0.0, 0.0)):
    """建立故事屋。失敗時丟 KitError，呼叫端不要在壞掉的模型上繼續。"""
    _purge_previous()
    root = mesh_builder.create_empty("StorybookCottage_Root", collection="StorybookCottage", location=location)
    names = [
        build_foundation(root),
        build_body(root),
        build_roof(root),
        build_porch(root),
        build_porch_roof(root),
        build_steps(root),
        build_rocks(root),
        build_door(root),
        "Cottage_DoorGlass",
        build_window(root),
        "Cottage_WindowGlass",
        "Cottage_WindowMullion",
        build_flower_box(root),
        build_lantern(root),
        build_sconce(root),
        build_bucket(root),
        build_brace(root),
        build_crate(root),
        build_rock_box(root),
        build_downpipe(root),
        build_foliage(root),
    ]
    # build_door / build_window 已經把玻璃和窗櫺建好，名字在上面補進清單。
    # 去掉重複，保留建立順序。
    ordered = []
    for name in names:
        if name not in ordered:
            ordered.append(name)
    for name in ordered:
        _finish(name)
    reports = {}
    for name in ordered:
        reports[name] = _report(name)
        if not reports[name]["ok"]:
            raise KitError("VALIDATION_FAILED", f"{name} 最終驗證沒過：{reports[name]['issues']}")
    return {"root": root.name, "location": list(location), "objects": ordered, "reports": reports}
