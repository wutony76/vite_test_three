"""依 AssetPlan 建模（Blender 端）。

流程（順序有意義，不能任意調換）：
1. 驗證 plan → 2. 清除上一次的結果 → 3. 建材質
4. 建立所有「新 Object」類元件（parent 先建；instance 共用 mesh）
5. 編輯類元件修改 parent（屋頂往下壓出女兒牆、磚面往內退）——必須在 Union 之前，
   否則煙囪的頂面也會被選進「屋頂」一起往下壓
6. Boolean Union（煙囪融進牆體）
7. Wobble（手繪感）→ 8. Bevel —— 先偏移再倒角，斜面才會跟著新的稜線走
9. 每個 Object 修復 + 依 profile 驗證 → 10. 統計三角面、primitive，和預算比較 → 11. 匯出（選擇性）
"""

import json
import math
import os

import bmesh
import bpy

from .. import backup as _backup
from .. import mesh_builder
from ..components import EDIT_KINDS, BuildError, get_builder
from ..components.layout import layout_plan, to_local
from ..pipeline import load_plan, resolve_detail, validate_plan
from ..qa.geometry import check_asset_geometry
from ..result import KitError, add_error, make_result
from ..validation.profiles import PROFILES
from . import appearance, bevel, materials, wobble

KIT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.abspath(os.path.join(KIT_DIR, "..", "..", ".."))


def object_name(plan_id, cid):
    # 不用「.」：Three.js 的 GLTFLoader 會把節點名稱中的「.」刪掉，名稱就對不上了
    return f"{plan_id}_{cid}"


def root_name(plan_id):
    return f"{plan_id}_Root"


# ---------------------------------------------------------------------------
# 清除與建立
# ---------------------------------------------------------------------------

def purge(plan_id):
    """刪掉上一次用同一份 plan 建出來的所有東西，讓建模可以重複執行、結果一致。"""
    removed = 0
    for obj in list(bpy.data.objects):
        if obj.get("lpk_asset") == plan_id:
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    prefix = f"{plan_id}_"
    for mesh in list(bpy.data.meshes):
        real_users = mesh.users - (1 if mesh.use_fake_user else 0)
        if mesh.name.startswith(prefix) and real_users <= 0:
            bpy.data.meshes.remove(mesh)
    return removed


def _collection(plan_id):
    name = f"LPK_{plan_id}"
    collection = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if collection.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(collection)
    return collection


def mesh_from_data(name, data, material_lookup):
    """MeshData → Blender mesh。直接用 bmesh 建立，面的順序和 MeshData 完全一致。"""
    mesh = bpy.data.meshes.new(name)
    names = data.material_names()
    bm = bmesh.new()
    try:
        verts = [bm.verts.new(v) for v in data.verts]
        for face, mat in zip(data.faces, data.mats):
            new_face = bm.faces.new([verts[i] for i in face])
            new_face.material_index = names.index(mat)
            new_face.smooth = False  # Low Poly：Flat Shading，每個面一個法線
        bm.normal_update()
        if bm.edges and all(len(e.link_faces) == 2 for e in bm.edges):
            # 封閉的 mesh 統一把法線轉成朝外；開放的（玻璃平面）保留 builder 給的方向
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
    finally:
        bm.free()
    for mat in names:
        mesh.materials.append(material_lookup[mat])
    mesh["lpk_built"] = True
    return mesh


def _vec_sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _vec_add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------

def build_asset(plan_or_path, location=(0.0, 0.0, 0.0), export=False, preset=None, repo_root=None):
    from .. import api  # 延遲 import：api 也 import 本模組

    checked = validate_plan(plan_or_path)
    if not checked["ok"]:
        return checked
    if isinstance(plan_or_path, (str, os.PathLike)):
        doc, _ = load_plan(os.fspath(plan_or_path))
    else:
        doc = plan_or_path
    plan_id = doc["id"]

    detail_spec = {"preset": preset, "overrides": {}} if preset else doc.get("detail")
    config, detail_errors = resolve_detail(detail_spec, plan_id)
    if detail_errors:
        raise KitError(detail_errors[0][0], detail_errors[0][2])
    detail = config.to_dict()
    lay = layout_plan(doc, detail, config.seed)
    comps = lay["components"]

    result = make_result(root_name(plan_id))
    purge(plan_id)
    collection = _collection(plan_id)
    mats = materials.ensure_all(plan_id, doc["materials"])

    root = mesh_builder.create_empty(root_name(plan_id), collection=collection, location=location)
    root["lpk_asset"] = plan_id
    root["lpk_root"] = True

    export_spec = doc.get("export", {})
    clickable = set(export_spec.get("clickable", []))
    anim_of = {m: g for g, members in export_spec.get("anim_groups", {}).items() for m in members}

    objects = {}

    def fail(code, cid, message):
        add_error(result, code, f"{cid}：{message}")
        result["errors"][-1]["component"] = cid

    # 4. 新 Object
    for cid in lay["new_objects"]:
        comp = comps[cid]
        name = object_name(plan_id, cid)
        instance = lay["instances"].get(cid)
        scale = 1.0
        if instance and instance["source"]:
            source = objects.get(instance["source"])
            if source is None:
                fail("COMPONENT_BUILD_FAILED", cid, f"instance 來源 {instance['source']} 沒有建立成功")
                continue
            mesh = source.data  # 共用同一份 mesh：匯出後是同一個 glTF mesh，被多個節點引用
            scale = instance["scale"]
        else:
            builder = get_builder(comp["kind"])
            if builder is None:
                fail("COMPONENT_NOT_IMPLEMENTED", cid, f"kind {comp['kind']!r} 沒有零件 builder")
                continue
            try:
                data = builder(lay["contexts"][cid])
                mesh = mesh_from_data(name, data, mats)
            except (BuildError, ValueError, KeyError, IndexError) as exc:
                fail("COMPONENT_BUILD_FAILED", cid, f"{type(exc).__name__}: {exc}")
                continue

        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        parent_cid = lay["object_parent"][cid]
        parent_obj = objects.get(parent_cid) if parent_cid else None
        world = lay["origins"][cid]
        parent_world = lay["origins"][parent_cid] if parent_obj is not None else (0.0, 0.0, 0.0)
        # 先設 parent 再設 location：location 是相對 parent 的位置（沒有旋轉，所以直接相減即可）
        obj.parent = parent_obj or root
        obj.location = _vec_sub(world, parent_world)
        obj.scale = (scale, scale, scale)
        rotation = comp.get("transform", {}).get("rotation_deg")
        if rotation:
            obj.rotation_euler = tuple(math.radians(a) for a in rotation)

        obj["lowpoly_profile"] = comp["profile"]
        obj["lpk_asset"] = plan_id
        obj["lpk_component"] = cid
        obj["lpk_kind"] = comp["kind"]
        obj["lpk_tier"] = comp["tier"]
        obj["lpk_source"] = comp["source"]
        obj["clickable"] = cid in clickable
        if cid in anim_of:
            obj["anim_group"] = anim_of[cid]
        if instance:
            obj["instance_group"] = instance["group"]
        objects[cid] = obj

        if comp["method"] == "remesh":
            remeshed = api.remesh_organic_mesh(obj, voxel_size=comp.get("params", {}).get("voxel_size", 0.1))
            if not remeshed["ok"]:
                fail("COMPONENT_BUILD_FAILED", cid, "Remesh：" + remeshed["errors"][0]["message"])

    # 5. 編輯類元件
    for cid in lay["edits"]:
        comp = comps[cid]
        parent_obj = objects.get(comp.get("parent"))
        if comp["kind"] not in EDIT_KINDS:
            fail("COMPONENT_NOT_IMPLEMENTED", cid, f"編輯類 kind {comp['kind']!r} 沒有實作")
            continue
        if parent_obj is None:
            fail("COMPONENT_BUILD_FAILED", cid, f"parent {comp.get('parent')!r} 沒有對應的 Object")
            continue
        params = comp.get("params", {})
        inset = float(params.get("inset", 0.0))
        (x0, y0, z0), (x1, y1, z1) = to_local(comp["bounds"], lay["origins"][comp["parent"]])
        e = 1e-3
        if params.get("face") == "top":
            selection = {"normal": [0, 0, 1], "bounds": [[x0 - inset - e, y0 - inset - e, z1 - e],
                                                         [x1 + inset + e, y1 + inset + e, z1 + e]]}
        elif params.get("face") == "front":
            selection = {"normal": [0, -1, 0], "bounds": [[x0 - e, y0 - e, z0 - e], [x1 + e, y1 + e, z1 + e]]}
        else:
            fail("COMPONENT_BUILD_FAILED", cid, "params.face 必須是 top 或 front")
            continue
        material = mats[comp["material"]]
        if material.name not in [m.name for m in parent_obj.data.materials if m]:
            parent_obj.data.materials.append(material)
        index = [m.name if m else None for m in parent_obj.data.materials].index(material.name)
        edited = api.extrude_mesh_region(
            parent_obj, selection, mode="inset_extrude" if inset > 0 else "extrude",
            depth=float(params.get("depth", 0.0)), thickness=inset, material_index=index,
        )
        if not edited["ok"]:
            fail("COMPONENT_BUILD_FAILED", cid, edited["errors"][0]["message"])

    # 6. Boolean Union
    for cid in lay["unions"]:
        comp = comps[cid]
        target, other = objects.get(comp["union_into"]), objects.get(cid)
        if target is None or other is None:
            fail("COMPONENT_BUILD_FAILED", cid, "Union 的目標或元件本身沒有建立成功")
            continue
        children = list(other.children)
        merged = api.boolean_union_objects(target, [other])
        if merged["ok"]:
            objects.pop(cid)  # 已被移到備份 collection，不再是資產的一部分
            # 掛在被融合元件底下的子元件（例如煙囪上的煙管）改掛到融合目標，保留世界位置。
            # 少了這步，它們會跟著煙囪離開資產：不在根節點底下、不會匯出、QA 也看不到
            for child in children:
                world = child.matrix_world.copy()
                child.parent = target
                child.matrix_world = world
        else:
            fail("COMPONENT_BUILD_FAILED", cid, "Union：" + merged["errors"][0]["message"])

    # 7. Wobble、8. Bevel（共用 mesh 只處理一次）
    amplitude = doc.get("style", {}).get("edge_wobble", 0.0)
    done_wobble, done_bevel = set(), set()
    bevel_used = {}
    wobble_kept = {}
    # 要不要 wobble／bevel 由 profile 決定（validation/profiles.py），不寫死在這裡：
    # 新增 profile 時只要改規則表，建模行為就會跟著改
    for cid, obj in objects.items():
        comp = comps[cid]
        rule = PROFILES[comp["profile"]]
        structural = comp["tier"] in ("primary", "secondary")
        if structural and rule["wobble"] and obj.data.name not in done_wobble:
            wobble_kept[obj.name] = wobble.wobble_mesh_safe(obj.data, lay["origins"][cid], config.seed, amplitude)
            done_wobble.add(obj.data.name)
    for cid, obj in objects.items():
        comp = comps[cid]
        rule = PROFILES[comp["profile"]]
        if comp["tier"] in ("primary", "secondary") and rule["bevel"] and obj.data.name not in done_bevel:
            (bx0, by0, bz0), (bx1, by1, bz1) = comp["bounds"]
            width = bevel.bevel_width((bx1 - bx0, by1 - by0, bz1 - bz0))
            bevel_used[obj.name] = bevel.bevel_mesh_safe(obj.data, width, detail["bevel_quality"])
            done_bevel.add(obj.data.name)

    # 8b. 外觀：palette atlas／vertex color（bevel 之後做，新產生的斜面才會拿到 UV 和顏色）
    bpy.context.view_layer.update()
    appearance_info = appearance.apply_appearance(
        plan_id, doc["materials"], list(objects.items()), detail, doc["dimensions"]["h"], config.seed,
        ground_z=root.matrix_world.translation.z,
    )

    # 9. 修復與驗證
    report_objects = {}
    triangles = primitives = 0
    for cid, obj in objects.items():
        api.repair_mesh_topology(obj)
        checked_obj = api.validate_mesh_topology(obj)
        _backup.clear_backups(obj)
        obj.data.calc_loop_triangles()
        tris = len(obj.data.loop_triangles)
        prims = len({p.material_index for p in obj.data.polygons})
        triangles += tris
        primitives += prims
        checks = checked_obj["report"]["checks"] if checked_obj.get("report") else {}
        report_objects[obj.name] = {
            "component": cid, "kind": comps[cid]["kind"], "tier": comps[cid]["tier"],
            "profile": obj.get("lowpoly_profile"),
            "status": checked_obj["report"]["status"] if checked_obj.get("report") else "fail",
            "components": checks.get("components"), "non_manifold": checks.get("non_manifold_edges"),
            "boundary": checks.get("boundary_edges"), "ngons": checks.get("ngons"),
            "triangles": tris, "primitives": prims,
            "self_intersections": checks.get("self_intersections"),
            "bevel_width": round(bevel_used.get(obj.name, 0.0), 4),
            "wobble": wobble_kept.get(obj.name),
        }
        if not checked_obj["ok"]:
            fail("VALIDATION_FAILED", cid, checked_obj["errors"][0]["message"])

    # 9b. Geometry QA：位置、大小、懸空（拓撲檢查看不出零件跑錯位置）
    bpy.context.view_layer.update()  # matrix_world 要更新後才是最新的位置
    geometry = check_asset_geometry(doc, root)
    for item in geometry["issues"]:
        if item["level"] == "fail":
            add_error(result, f"GEOMETRY_{item['code']}", item["message"])

    # 10. 預算
    budget = doc["budget"]
    if triangles > budget["max_tris"]:
        add_error(result, "BUDGET_EXCEEDED", f"三角面 {triangles} 超過預算 {budget['max_tris']}")
    # primitive = 一個 Object 裡的一種材質；glTF 匯出後每個 primitive 約等於 Three.js 的 1 個 draw call
    if primitives > budget["max_primitives"]:
        add_error(result, "BUDGET_EXCEEDED", f"{primitives} 個 primitive 超過預算 {budget['max_primitives']}")

    result["changes"].update({
        "root": root.name, "collection": collection.name, "objects": [o.name for o in objects.values()],
        "skipped": lay["skipped"], "triangles": triangles, "primitives": primitives,
    })
    result["report"] = {"objects": report_objects, "detail": detail, "budget": budget, "geometry": geometry,
                        "appearance": appearance_info}

    # 11. 匯出
    if export and result["ok"]:
        target = export_spec["path"]
        target = target if os.path.isabs(target) else os.path.join(repo_root or REPO_ROOT, target)
        exported = api.prepare_for_gltf(root, target)
        result["changes"]["export"] = exported["changes"].get("export")
        result["changes"]["filepath"] = target
        if not exported["ok"]:
            for error in exported["errors"]:
                add_error(result, error["code"], error["message"])
    return result


def summary_table(result):
    """把報告整理成文字表格（給 script 和 AI 回報用）。"""
    rows = [f"{'Object':<32}{'kind':<16}{'profile':<15}{'狀態':<6}{'島':>3}{'非流形':>6}{'三角面':>7}"]
    for name, info in (result.get("report") or {}).get("objects", {}).items():
        rows.append(f"{name:<32}{info['kind']:<16}{str(info['profile']):<15}{info['status']:<6}"
                    f"{str(info['components']):>3}{str(info['non_manifold']):>6}{info['triangles']:>7}")
    changes = result.get("changes", {})
    rows.append(f"合計：{len(changes.get('objects', []))} 個 Object、{changes.get('triangles')} 個三角面、"
                f"{changes.get('primitives')} 個 primitive")
    return "\n".join(rows)


def dump(result):
    return json.dumps(result, ensure_ascii=False, indent=2, default=str)
