"""萊姆綠窄街店面（水彩插畫約 60% 還原）。

正面朝 -Y，+Z 朝上，1 單位 = 1 公尺。
主體用 box／prism 連續網格，不用 primitive 堆疊 Join。

招牌掛點：LimeShop_SignAnchor（Empty）。場景裡若有 DenpaSign 會複製霓虹字掛上。
"""

import math

import bpy

from .. import api, mesh_builder
from ..result import KitError

ROOT_NAME = "LimeShop"
COLLECTION = "LimeShop"
ROOT_LOCATION = (0.0, 0.0, 0.0)

# 尺寸（公尺）
WIDTH = 3.4
DEPTH = 2.6
HW = WIDTH / 2
HD = DEPTH / 2
GROUND = 0.12
TOP = 7.2
WALL_FRONT = -HD

MATERIALS = {
    "lime": ("LPK_Shop_Lime", (0.68, 0.84, 0.22), 0.82),
    "brick": ("LPK_Shop_Brick", (0.56, 0.30, 0.20), 0.9),
    "roof": ("LPK_Shop_Roof", (0.32, 0.16, 0.11), 0.85),
    "concrete": ("LPK_Shop_Concrete", (0.62, 0.60, 0.58), 0.88),
    "yellow": ("LPK_Shop_Yellow", (0.96, 0.84, 0.18), 0.7),
    "wood": ("LPK_Shop_Wood", (0.48, 0.28, 0.13), 0.78),
    "door": ("LPK_Shop_Door", (0.72, 0.86, 0.20), 0.75),
    "frame": ("LPK_Shop_Frame", (0.94, 0.94, 0.92), 0.65),
    "glass": ("LPK_Shop_Glass", (0.45, 0.62, 0.72), 0.12),
    "metal": ("LPK_Shop_Metal", (0.12, 0.12, 0.14), 0.35),
    "leaf": ("LPK_Shop_Leaf", (0.26, 0.48, 0.18), 0.9),
    "pot": ("LPK_Shop_Pot", (0.55, 0.38, 0.28), 0.85),
    "cat": ("LPK_Shop_Cat", (0.05, 0.05, 0.06), 0.9),
    "board": ("LPK_Shop_Board", (0.22, 0.20, 0.18), 0.8),
}


def _check(result, step):
    if not result["ok"]:
        raise KitError(result["errors"][0]["code"], f"{step}：{result['errors'][0]['message']}")
    return result


def _mat(key):
    name, color, rough = MATERIALS[key]
    m = mesh_builder.get_or_create_material(name, color, roughness=rough)
    if key == "glass":
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Roughness"].default_value = 0.08
        if "Transmission Weight" in bsdf.inputs:
            bsdf.inputs["Transmission Weight"].default_value = 0.85
        elif "Transmission" in bsdf.inputs:
            bsdf.inputs["Transmission"].default_value = 0.85
    if key == "metal":
        bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
        bsdf.inputs["Metallic"].default_value = 0.85
    return m


def _append(verts, faces, more_v, more_f):
    base = len(verts)
    verts.extend(more_v)
    faces.extend(tuple(i + base for i in f) for f in more_f)


def _place(name, verts, faces, profile, material, parent, materials=None, material_indices=None, **props):
    result = _check(api.create_connected_mesh(
        name, verts, faces,
        collection=COLLECTION,
        profile=profile,
        materials=materials or [material],
        material_indices=material_indices,
        parent=parent,
        validate=True,
    ), name)
    obj = bpy.data.objects[name]
    for key, value in props.items():
        obj[key] = value
    _check(api.repair_mesh_topology(obj, profile=profile), f"{name} repair")
    report = _check(api.validate_mesh_topology(obj, profile=profile), f"{name} validate")
    checks = report["report"]["checks"]
    return {
        "name": name,
        "profile": profile,
        "status": report["report"]["status"],
        "components": checks["components"],
        "non_manifold": checks["non_manifold_edges"],
        "faces": checks["faces"],
        "ngons": checks["ngons"],
    }


def _opening(name, mn, mx, parent, wood=False, glass=False):
    mats = [_mat("frame"), _mat("wood" if wood else "glass")]
    verts, faces = mesh_builder.box(mn, mx)
    inner = 1 if wood else 1
    _place(name, verts, faces, "opening", mats[0], parent, materials=mats)
    facing = [0, -1, 0]
    _check(api.extrude_mesh_region(
        name, {"normal": facing}, mode="inset_extrude", thickness=0.06, depth=-0.04, material_index=inner,
    ), f"{name} recess")
    return name


def _remove_previous():
    for obj in list(bpy.data.objects):
        if not (obj.name == ROOT_NAME or obj.name.startswith("LimeShop_")):
            continue
        mesh = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh is not None and mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    col = bpy.data.collections.get(COLLECTION)
    if col is not None:
        bpy.data.collections.remove(col)


def _attach_denpa_sign(anchor):
    """若場景已有 DenpaSign，只複製霓虹字與框，掛在雨篷正面。"""
    denpa = bpy.data.objects.get("DenpaSign")
    if denpa is None:
        return []
    keep = ("Denpa_Neon_", "Denpa_Metal_")
    attached = []
    scale = 0.065
    for child in denpa.children:
        if child.type != "MESH":
            continue
        if not any(child.name.startswith(prefix) for prefix in keep):
            continue
        dup = child.copy()
        dup.data = child.data.copy()
        dup.name = f"LimeShop_{child.name}"
        bpy.data.collections[COLLECTION].objects.link(dup)
        dup.parent = anchor
        dup.matrix_parent_inverse = anchor.matrix_world.inverted()
        dup.location = (0.0, 0.0, 0.08)
        dup.rotation_euler = (math.radians(82), 0.0, math.radians(180))
        dup.scale = (scale, scale, scale)
        dup["lime_shop_part"] = "denpa_neon"
        if child.get("neon_channel"):
            dup["neon_channel"] = child["neon_channel"]
        attached.append(dup.name)
    return attached


def build():
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    _remove_previous()
    reports = []

    root = mesh_builder.create_empty(ROOT_NAME, collection=COLLECTION, location=ROOT_LOCATION)
    root["building"] = "lime_shop"

    # 人行道
    v, f = mesh_builder.box((-HW - 0.35, WALL_FRONT - 0.55, 0.0), (HW + 0.75, HD + 0.15, GROUND))
    reports.append(_place("LimeShop_Sidewalk", v, f, "building_shell", _mat("concrete"), root))

    # 主體牆（封閉長方體）
    v, f = mesh_builder.box((-HW, -HD, GROUND), (HW, HD, TOP))
    reports.append(_place("LimeShop_Shell", v, f, "building_shell", _mat("lime"), root))

    # 左側外露磚（兩塊裝飾，貼在正面）
    for tag, z0, z1 in (("Upper", 5.35, 6.55), ("Lower", 1.05, 2.55)):
        v, f = mesh_builder.box((-HW - 0.02, WALL_FRONT - 0.12, z0), (-0.35, WALL_FRONT + 0.02, z1))
        reports.append(_place(f"LimeShop_Brick_{tag}", v, f, "decoration", _mat("brick"), root))

    # 深色平屋頂簷口
    v, f = mesh_builder.box((-HW - 0.08, -HD - 0.12, TOP - 0.06), (HW + 0.08, HD + 0.12, TOP + 0.04))
    reports.append(_place("LimeShop_RoofCap", v, f, "building_shell", _mat("roof"), root))

    # 腰線（貓坐的橫樑）
    v, f = mesh_builder.box((-HW - 0.04, WALL_FRONT - 0.14, 3.62), (HW + 0.04, WALL_FRONT + 0.04, 3.78))
    reports.append(_place("LimeShop_Ledge", v, f, "building_shell", _mat("wood"), root))

    # 黃色雨篷
    awning_z = (2.15, 2.42)
    v, f = mesh_builder.box((-HW + 0.08, WALL_FRONT - 0.55, awning_z[0]), (HW - 0.05, WALL_FRONT - 0.02, awning_z[1]))
    reports.append(_place("LimeShop_Awning", v, f, "building_shell", _mat("yellow"), root))

    anchor = mesh_builder.create_empty(
        "LimeShop_SignAnchor", collection=COLLECTION, location=(0.0, WALL_FRONT - 0.52, 2.38),
    )
    anchor.parent = root
    anchor.empty_display_size = 0.25
    anchor["attach_model"] = "denpa_sign/denpa_sign.glb"
    anchor["sign_name"] = "電 • 波 • 町"
    _attach_denpa_sign(anchor)

    # 二樓窗＋窗台花箱
    _opening(
        "LimeShop_Window",
        (-0.55, WALL_FRONT - 0.08, 4.55), (0.35, WALL_FRONT + 0.02, 5.65),
        root, glass=True,
    )
    v, f = mesh_builder.box((-0.58, WALL_FRONT - 0.14, 4.38), (0.38, WALL_FRONT - 0.02, 4.52))
    reports.append(_place("LimeShop_WindowBox", v, f, "decoration", _mat("wood"), root))
    v, f = mesh_builder.box((-0.5, WALL_FRONT - 0.16, 4.40), (0.3, WALL_FRONT - 0.12, 4.48))
    reports.append(_place("LimeShop_WindowPlants", v, f, "decoration", _mat("leaf"), root))

    # 一樓門（偏右）與左櫥窗
    _opening(
        "LimeShop_Door",
        (0.25, WALL_FRONT - 0.1, GROUND), (1.25, WALL_FRONT + 0.02, 2.05),
        root, wood=True,
    )
    v, f = mesh_builder.box((0.42, WALL_FRONT - 0.11, 1.25), (1.08, WALL_FRONT - 0.04, 1.92))
    reports.append(_place("LimeShop_DoorGlass", v, f, "glass", _mat("glass"), root))

    _opening(
        "LimeShop_Display",
        (-1.28, WALL_FRONT - 0.08, GROUND + 0.02), (-0.18, WALL_FRONT + 0.02, 1.85),
        root, glass=True,
    )
    # 櫥窗內簡化商品色塊
    for i, color in enumerate(((0.9, 0.2, 0.15), (0.2, 0.55, 0.8), (0.95, 0.75, 0.2))):
        mat = mesh_builder.get_or_create_material(f"LPK_Shop_Item{i}", color, 0.6)
        v, f = mesh_builder.box(
            (-1.15 + i * 0.38, WALL_FRONT - 0.2, 0.35 + i * 0.15),
            (-0.88 + i * 0.38, WALL_FRONT - 0.14, 0.85 + i * 0.15),
        )
        reports.append(_place(f"LimeShop_DisplayItem{i}", v, f, "decoration", mat, root))

    # 三階台階
    step_w = 1.05
    for i in range(3):
        z0 = GROUND + i * 0.07
        z1 = z0 + 0.07
        y0 = WALL_FRONT - 0.18 - i * 0.12
        v, f = mesh_builder.box((0.35, y0, z0), (0.35 + step_w, WALL_FRONT - 0.08, z1))
        reports.append(_place(f"LimeShop_Step{i + 1}", v, f, "building_shell", _mat("concrete"), root))

    # 黑貓剪影（雨篷上方腰線）
    cat_v, cat_f = [], []
    for mn, mx in (
        ((0.15, WALL_FRONT - 0.18, 3.82), (0.42, WALL_FRONT - 0.08, 4.02)),
        ((0.08, WALL_FRONT - 0.2, 4.0), (0.18, WALL_FRONT - 0.1, 4.22)),
        ((0.32, WALL_FRONT - 0.2, 4.0), (0.42, WALL_FRONT - 0.1, 4.22)),
        ((0.22, WALL_FRONT - 0.18, 4.0), (0.34, WALL_FRONT - 0.1, 4.08)),
    ):
        bv, bf = mesh_builder.box(mn, mx)
        _append(cat_v, cat_f, bv, bf)
    reports.append(_place("LimeShop_Cat", cat_v, cat_f, "decoration", _mat("cat"), root))

    # 壁燈（二樓窗右）
    v, f = mesh_builder.box((0.72, WALL_FRONT - 0.22, 4.92), (0.92, WALL_FRONT - 0.02, 5.38))
    reports.append(_place("LimeShop_WallLantern", v, f, "decoration", _mat("metal"), root))

    # 路燈（右側人行道）
    pole_x = HW + 0.42
    v, f = mesh_builder.box((pole_x - 0.05, WALL_FRONT - 0.25, GROUND), (pole_x + 0.05, WALL_FRONT + 0.25, 3.35))
    reports.append(_place("LimeShop_LampPost", v, f, "decoration", _mat("metal"), root))
    v, f = mesh_builder.box((pole_x - 0.18, WALL_FRONT - 0.2, 3.2), (pole_x + 0.18, WALL_FRONT + 0.2, 3.55))
    reports.append(_place("LimeShop_LampHead", v, f, "decoration", _mat("yellow"), root))

    # A 字黑板
    v, f = mesh_builder.box((-HW - 0.08, WALL_FRONT - 0.42, 0.55), (-HW + 0.18, WALL_FRONT - 0.12, 1.35))
    reports.append(_place("LimeShop_Board", v, f, "decoration", _mat("board"), root))

    # 盆栽（門口、路燈旁）
    for i, (x, z) in enumerate(((-0.95, GROUND), (pole_x - 0.12, GROUND), (1.05, GROUND))):
        pv, pf = mesh_builder.box((x - 0.12, WALL_FRONT - 0.35, z), (x + 0.12, WALL_FRONT - 0.12, z + 0.22))
        reports.append(_place(f"LimeShop_Pot{i}", pv, pf, "decoration", _mat("pot"), root))
        gv, gf = mesh_builder.box((x - 0.18, WALL_FRONT - 0.38, z + 0.18), (x + 0.18, WALL_FRONT - 0.2, z + 0.55))
        reports.append(_place(f"LimeShop_Plant{i}", gv, gf, "decoration", _mat("leaf"), root))

    # 簡化電線（左上）
    wire_v, wire_f = [], []
    for mn, mx in (
        ((-HW + 0.05, WALL_FRONT - 0.15, 6.2), (-0.2, WALL_FRONT + 0.05, 6.25)),
        ((-0.2, WALL_FRONT - 0.05, 6.1), (0.4, WALL_FRONT + 0.08, 6.15)),
        ((0.4, WALL_FRONT + 0.05, 5.8), (HW - 0.1, WALL_FRONT + 0.1, 5.85)),
    ):
        bv, bf = mesh_builder.box(mn, mx)
        _append(wire_v, wire_f, bv, bf)
    reports.append(_place("LimeShop_Wires", wire_v, wire_f, "decoration", _mat("metal"), root))

    for child in root.children_recursive:
        if child.type == "MESH":
            api.clear_backups(child)

    failed = [r for r in reports if r["status"] != "pass"]
    return {
        "root": root.name,
        "location": ROOT_LOCATION,
        "reports": reports,
        "failed": failed,
        "object_count": len(reports),
    }
