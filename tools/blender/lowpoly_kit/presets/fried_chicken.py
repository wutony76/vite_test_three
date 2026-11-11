"""麥辣雞翅風格炸雞塊（兩塊 + 碎屑），不含紙袋。

+Z 朝上，1 單位 = 1 公尺。
主體：種子盒 → Voxel Remesh（`organic`）；碎屑：`decoration`。
"""

from __future__ import annotations

import math
import os

import bmesh
import bpy
from mathutils import Euler

from .. import api, mesh_builder
from ..result import KitError

ROOT_NAME = "FriedChicken"
COLLECTION = "FriedChicken"
ROOT_LOCATION = (11.8, 0.0, 0.0)

REPO = "/Users/tony.wu/SelfCode/Self/git_proj/vite_test_three"
GLB_PATH = os.path.join(REPO, "public/models/fried_chicken/fried_chicken.glb")

MAT_MEAT = {
    "name": "LPK_Chicken_Crust",
    "color": (0.82, 0.5, 0.2),
    "roughness": 0.62,
}
MAT_MEAT_DARK = {
    "name": "LPK_Chicken_Crust_Dark",
    "color": (0.62, 0.34, 0.14),
    "roughness": 0.68,
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


def _deform_bmesh(obj_name, fn):
    obj = bpy.data.objects[obj_name]
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        fn(bm)
        for face in bm.faces:
            face.smooth = False
        bm.to_mesh(obj.data)
        obj.data.update()
    finally:
        bm.free()


def _taper_drumette_seed(bm):
    z0 = min(v.co.z for v in bm.verts)
    z1 = max(v.co.z for v in bm.verts)
    span = max(z1 - z0, 1e-6)
    for v in bm.verts:
        t = (v.co.z - z0) / span
        s = 0.5 + 0.62 * t
        v.co.x *= s
        v.co.y *= s * 0.92
        v.co.z += 0.012 * math.sin(t * math.pi)


def _flatten_wing_seed(bm):
    for v in bm.verts:
        v.co.x *= 1.18
        v.co.y *= 0.72
        v.co.z *= 0.55
        # 翅尖略薄
        if v.co.x > 0:
            taper = max(0.55, 1.0 - 0.35 * (v.co.x / max(0.06, abs(v.co.x))))
            v.co.y *= taper
            v.co.z *= taper


def _organic_from_box(
    name,
    size,
    location,
    rotation_deg,
    voxel,
    deform,
    parent,
    col,
):
    sx, sy, sz = size
    verts, faces = mesh_builder.box((-sx * 0.5, -sy * 0.5, -sz * 0.5), (sx * 0.5, sy * 0.5, sz * 0.5))
    _check(
        api.create_connected_mesh(
            name,
            verts,
            faces,
            collection=col,
            profile="organic",
            materials=[MAT_MEAT],
            parent=parent,
            location=location,
            validate=False,
        ),
        f"seed {name}",
    )
    obj = bpy.data.objects[name]
    obj.rotation_euler = Euler(
        tuple(math.radians(a) for a in rotation_deg),
        "XYZ",
    )
    _deform_bmesh(name, deform)
    _check(api.remesh_organic_mesh(name, voxel_size=voxel), f"remesh {name}")
    _check(api.repair_mesh_topology(name), f"repair {name}")
    _check(api.optimize_lowpoly_mesh(name, planar_angle_deg=6.0), f"optimize {name}")
    _check(api.validate_mesh_topology(name, profile="organic"), f"validate {name}")
    return obj


CRUMBS = [
    ((0.02, -0.05, 0.01), (0.008, 0.006, 0.004), (12, 8, 20)),
    ((-0.03, -0.02, 0.008), (0.006, 0.005, 0.003), (-15, 25, 6)),
    ((0.06, 0.03, 0.006), (0.007, 0.004, 0.003), (8, -12, 30)),
    ((0.12, -0.04, 0.01), (0.005, 0.005, 0.003), (20, 10, -8)),
    ((-0.08, 0.02, 0.007), (0.006, 0.006, 0.003), (-6, 18, 14)),
    ((0.04, 0.06, 0.005), (0.004, 0.004, 0.003), (5, -20, 10)),
]


def build(*, export: bool = True, validate_export: bool = True):
    _remove_previous()
    col = _ensure_collection()
    root = mesh_builder.create_empty(ROOT_NAME, collection=col, location=ROOT_LOCATION)

    _organic_from_box(
        "Chicken_Drumette",
        (0.065, 0.075, 0.13),
        (-0.04, 0.02, 0.065),
        (8, -18, 12),
        0.019,
        _taper_drumette_seed,
        root,
        col,
    )
    _organic_from_box(
        "Chicken_WingFlat",
        (0.11, 0.085, 0.06),
        (0.1, -0.02, 0.028),
        (-6, 22, -8),
        0.018,
        _flatten_wing_seed,
        root,
        col,
    )

    for i, (loc, half, rot) in enumerate(CRUMBS):
        hx, hy, hz = half
        verts, faces = mesh_builder.box((-hx, -hy, -hz), (hx, hy, hz))
        mat = MAT_MEAT_DARK if i % 2 else MAT_MEAT
        _check(
            api.create_connected_mesh(
                f"Crumb_{i + 1:02d}",
                verts,
                faces,
                collection=col,
                profile="decoration",
                materials=[mat],
                parent=root,
                location=loc,
            ),
            f"Crumb_{i + 1:02d}",
        )
        obj = bpy.data.objects[f"Crumb_{i + 1:02d}"]
        obj.rotation_euler = Euler(tuple(math.radians(a) for a in rot), "XYZ")
        _check(api.optimize_lowpoly_mesh(obj.name), f"optimize {obj.name}")

    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        prof = obj.get(api.PROFILE_KEY, "building_shell")
        _check(api.validate_mesh_topology(obj, profile=prof), f"validate {obj.name}")

    export_result = None
    if export:
        os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
        export_result = api.prepare_for_gltf(root, GLB_PATH, validate=validate_export)
        _check(export_result, "export GLB")
        if export_result.get("ok"):
            for obj in root.children_recursive:
                if obj.type == "MESH":
                    try:
                        api.clear_backups(obj)
                    except Exception:
                        pass

    return {
        "root": root.name,
        "location": ROOT_LOCATION,
        "export": export_result,
        "glb": GLB_PATH if export else None,
    }
