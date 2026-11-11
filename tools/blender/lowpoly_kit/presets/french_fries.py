"""Low Poly 薯條盒 + 薯條（參考快餐紙盒造型）。

+Z 朝上，正面朝 -Y，1 單位 = 1 公尺。
紙盒：敞口單一 Mesh（`decoration`）；薯條：各自獨立 `decoration`。
"""

from __future__ import annotations

import math
import os

import bpy
from mathutils import Euler

from .. import api, mesh_builder
from ..result import KitError

ROOT_NAME = "FrenchFries"
COLLECTION = "FrenchFries"
ROOT_LOCATION = (9.5, 0.0, 0.0)

# 長方紙盒內腔（公尺）
BOX_HALF_X = 0.048
BOX_HALF_Y = 0.034
BOX_RIM_Z = 0.102
FRY_FLOOR_Z = 0.01

REPO = "/Users/tony.wu/SelfCode/Self/git_proj/vite_test_three"
GLB_PATH = os.path.join(REPO, "public/models/french_fries/french_fries.glb")

MAT_BOX = {
    "name": "LPK_Fries_Box",
    "color": (0.82, 0.11, 0.14),
    "roughness": 0.22,
}
MAT_FRY = {
    "name": "LPK_Fries_Fry",
    "color": (0.96, 0.74, 0.22),
    "roughness": 0.38,
}


def _check(result, step):
    if not result["ok"]:
        raise KitError(result["errors"][0]["code"], f"{step}：{result['errors'][0]['message']}")
    return result


def _ensure_collection():
    col = bpy.data.collections.get(COLLECTION)
    if col is None:
        col = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(col)
    return col


def _remove_previous():
    names = {ROOT_NAME}
    root = bpy.data.objects.get(ROOT_NAME)
    if root:
        names.update(o.name for o in root.children_recursive)
    col = bpy.data.collections.get(COLLECTION)
    if col:
        names.update(o.name for o in col.objects)
    for name in list(names):
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        mesh = obj.data if obj.type == "MESH" else None
        bpy.data.objects.remove(obj, do_unlink=True)
        if mesh and mesh.users == 0:
            bpy.data.meshes.remove(mesh, do_unlink=True)


def _carton_verts_faces():
    """長方敞口紙盒（底 + 四側）。"""
    hx = BOX_HALF_X + 0.006
    hy = BOX_HALF_Y + 0.006
    z1 = BOX_RIM_Z
    verts = [
        (-hx, -hy, 0.0),
        (hx, -hy, 0.0),
        (hx, hy, 0.0),
        (-hx, hy, 0.0),
        (-hx, -hy, z1),
        (hx, -hy, z1),
        (hx, hy, z1),
        (-hx, hy, z1),
    ]
    faces = [
        (0, 3, 2, 1),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    return verts, faces


def _fry_verts_faces(length=0.2, w=0.019, aspect_y=1.3):
    """細長薯條；底部在物件原點。"""
    hw = w * 0.5
    hy = hw * aspect_y
    return mesh_builder.box((-hw, -hy, 0.0), (hw, hy, length))


def _generate_fry_layout():
    """網格塞滿盒內，錯列排列。"""
    spacing_x = 0.0168
    spacing_y = 0.0185
    margin_x = BOX_HALF_X - 0.009
    margin_y = BOX_HALF_Y - 0.008
    layouts = []
    row = 0
    y = -margin_y
    while y <= margin_y + 1e-6:
        x_start = -margin_x + (spacing_x * 0.48 if row % 2 else 0.0)
        x = x_start
        while x <= margin_x + 1e-6:
            layouts.append((x, y, row))
            x += spacing_x
        y += spacing_y
        row += 1
    return layouts


def build(*, export: bool = True, validate_export: bool = True):
    _remove_previous()
    col = _ensure_collection()
    root = mesh_builder.create_empty(ROOT_NAME, collection=col, location=ROOT_LOCATION)

    bverts, bfaces = _carton_verts_faces()
    _check(
        api.create_connected_mesh(
            "Fries_Carton",
            bverts,
            bfaces,
            collection=col,
            profile="decoration",
            materials=[MAT_BOX],
            parent=root,
        ),
        "Fries_Carton",
    )
    _check(api.repair_mesh_topology("Fries_Carton"), "repair carton")
    _check(api.optimize_lowpoly_mesh("Fries_Carton", shade_flat=True), "optimize carton")

    fry_layout = _generate_fry_layout()
    stick_above = 0.055
    for i, (cx, cy, row) in enumerate(fry_layout):
        length = (BOX_RIM_Z - FRY_FLOOR_Z) + stick_above + ((i * 3) % 5) * 0.008
        w = 0.018 + (i % 2) * 0.0015
        seed = i * 17 + row * 13
        rot = (
            ((seed % 13) - 6) * 0.9,
            ((seed % 11) - 5) * 1.1,
            ((seed % 9) - 4) * 1.3,
        )
        fv, ff = _fry_verts_faces(length=length, w=w)
        _check(
            api.create_connected_mesh(
                f"Fry_{i + 1:02d}",
                fv,
                ff,
                collection=col,
                profile="decoration",
                materials=[MAT_FRY],
                parent=root,
                location=(cx, cy, FRY_FLOOR_Z),
            ),
            f"Fry_{i + 1:02d}",
        )
        obj = bpy.data.objects[f"Fry_{i + 1:02d}"]
        obj.rotation_euler = Euler(
            (math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2])),
            "XYZ",
        )
        _check(api.optimize_lowpoly_mesh(obj.name), f"optimize {obj.name}")

    reports = []
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        prof = obj.get(api.PROFILE_KEY, "building_shell")
        r = api.validate_mesh_topology(obj, profile=prof)
        reports.append((obj.name, prof, r))
        _check(r, f"validate {obj.name}")

    export_result = None
    if export:
        os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
        export_result = api.prepare_for_gltf(root, GLB_PATH, validate=validate_export)
        _check(export_result, "export GLB")
        if export_result.get("ok"):
            api.clear_backups("Fries_Carton")

    return {
        "root": root.name,
        "location": ROOT_LOCATION,
        "reports": reports,
        "export": export_result,
        "glb": GLB_PATH if export else None,
    }
