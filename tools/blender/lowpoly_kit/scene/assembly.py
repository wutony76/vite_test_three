"""依 ScenePlan 組裝場景（Blender 端）。

流程：資產庫（每個資產只建一次、隱藏）→ 根節點與群組 → 高度場 → 地形 → 道路 → 擺放（共用 mesh 的複本）
→ Scene QA → 匯出（gpu instancing）。

為什麼用「共用 mesh 的複本」而不是每次都重建：
同一棟店面放兩次，幾何完全一樣。共用 mesh 時 glTF 只存一份頂點資料，檔案小一半；
而且只要資產通過 QA，每一個複本自然也通過，不必重做拓撲檢查。
"""

import math
import os

import bpy
from mathutils import Matrix

from .. import mesh_builder
from ..build import materials
from ..build.orchestrator import REPO_ROOT, build_asset, mesh_from_data
from ..export import export_glb, glb_stats
from ..export.glb_stats import read_glb_json
from ..export.manifest import scene_manifest, write_manifest
from ..pipeline import load_plan, validate_plan
from ..export.texture_optimize import optimize_glb
from ..qa.scene import check_scene
from ..qa.texture import glb_image_bytes
from ..result import add_error, make_result
from ..surface.engine import apply_scene_surfaces
from ..surface.spec import gpu_bytes
from .terrain import TerrainField, footprint_of, road_mesh, terrain_mesh

# 複本要另外帶的 custom property；不複製 lpk_asset：
# build_asset_from_plan 重建某個資產時，會用 lpk_asset 清除舊物件，場景裡的複本不應該被一起刪掉
SKIP_PROPS = {"lpk_asset"}


def purge_scene(scene_id):
    for obj in list(bpy.data.objects):
        if obj.get("lpk_scene") == scene_id:
            data = obj.data
            bpy.data.objects.remove(obj, do_unlink=True)
            if data is not None and getattr(data, "users", 1) == 0 and isinstance(data, bpy.types.Mesh):
                bpy.data.meshes.remove(data)


def _collection(name, parent=None):
    collection = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    owner = parent or bpy.context.scene.collection
    if collection.name not in owner.children:
        owner.children.link(collection)
    return collection


def _tag(obj, scene_id, **props):
    obj["lpk_scene"] = scene_id
    for key, value in props.items():
        obj[key] = value


def _copy_props(src, dst):
    for key in src.keys():
        if key not in SKIP_PROPS and not key.startswith("_"):
            dst[key] = src[key]
    if "lpk_asset" in src:
        dst["lpk_asset_ref"] = src["lpk_asset"]


def build_scene(scene_path, export=False, repo_root=None, overrides=None):
    """overrides：{placement_id: {"location": [...]}}，測試用來刻意製造違規擺放。"""
    checked = validate_plan(scene_path)
    if not checked["ok"]:
        return checked
    doc, _ = load_plan(scene_path)
    for pid, patch in (overrides or {}).items():
        for placement in doc["placements"]:
            if placement["id"] == pid:
                placement.update(patch)
    scene_id = doc["id"]
    base_dir = os.path.dirname(os.path.abspath(scene_path))
    result = make_result(f"{scene_id}_Root")
    purge_scene(scene_id)
    collection = _collection(f"LPK_scene_{scene_id}")

    # 1. 資產庫：每個資產只建一次，collection 隱藏（不會出現在畫面、渲染、匯出）
    library = {}
    for asset in doc["assets"]:
        path = os.path.join(base_dir, asset["plan"])
        built = build_asset(path, repo_root=repo_root)
        plan, _ = load_plan(path)
        if not built["ok"]:
            for error in built["errors"]:
                add_error(result, error["code"], f"資產 {asset['asset_id']}：{error['message']}")
        lib_collection = bpy.data.collections.get(f"LPK_{plan['id']}")
        if lib_collection is not None:
            lib_collection.hide_viewport = lib_collection.hide_render = True
        root = bpy.data.objects.get(f"{plan['id']}_Root")
        library[asset["asset_id"]] = {"plan": plan, "root": root, "report": built.get("report")}
    if not result["ok"]:
        return result

    # 2. 根節點與群組
    root = mesh_builder.create_empty(f"{scene_id}_Root", collection=collection)
    _tag(root, scene_id, lpk_root=True)
    groups = {}
    for name in doc["hierarchy"]:
        group = mesh_builder.create_empty(f"{scene_id}_{name}", collection=collection)
        group.parent = root
        _tag(group, scene_id, lpk_group=name)
        groups[name] = group

    # 3. 高度場：建築（非 instance）的外框和道路底下整平
    footprints = {}
    for placement in doc["placements"]:
        dims = library[placement["asset_id"]]["plan"]["dimensions"]
        footprints[placement["id"]] = footprint_of(dims, placement["location"], placement.get("rotation_z_deg", 0.0),
                                                   placement.get("scale", 1.0))
    flat = [footprints[p["id"]] for p in doc["placements"] if not p.get("instance")]
    roads = [(r["polyline"], r["width"] / 2) for r in doc.get("roads", [])]
    field = TerrainField(doc["terrain"], flat, roads)

    mats = materials.ensure_all(scene_id, doc.get("materials", []))
    default_mat = mats.get(doc["terrain"].get("material")) or materials.ensure_material(scene_id, {"name": "ground", "hex": "#8DB04A"})

    def add_mesh(name, data, group_name, profile, material_lookup):
        mesh = mesh_from_data(name, data, material_lookup)
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        obj.parent = groups.get(group_name) or root
        _tag(obj, scene_id, lowpoly_profile=profile, lpk_component=name.removeprefix(f"{scene_id}_"))
        return obj

    # 4. 地形、道路
    terrain_mat = doc["terrain"].get("material", "ground")
    ground_objects = [add_mesh(f"{scene_id}_terrain", terrain_mesh(field, terrain_mat), "Terrain", "terrain",
                               {terrain_mat: default_mat, **mats})]
    for index, road in enumerate(doc.get("roads", [])):
        road_mat = road.get("material", terrain_mat)
        # 每條道路高 5 mm：交會處兩條道路重疊時才不會互相閃爍（z-fighting）
        ground_objects.append(add_mesh(f"{scene_id}_{road['id']}",
                                       road_mesh(road["polyline"], road["width"], road_mat, z=0.03 + 0.005 * index),
                                       "Roads", "road", {road_mat: mats.get(road_mat, default_mat), **mats}))
    # 4b. 地形、道路的貼圖：和資產同一套 Surface Engine（UV 用 planar 世界座標，草地、石板路才會連續）
    surface_report = apply_scene_surfaces(scene_id, doc.get("materials", []), ground_objects)

    # 5. 擺放
    placed = {}
    for placement in doc["placements"]:
        entry = library[placement["asset_id"]]
        asset_root = entry["root"]
        x, y, z = placement["location"]
        if placement.get("instance"):
            z += field.height(x, y) - 0.05  # 樹種在坡上：取該點地形高度，往下埋 5 cm，根部不會懸空
        matrix = (Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(placement.get("rotation_z_deg", 0.0)), 4, "Z")
                  @ Matrix.Scale(placement.get("scale", 1.0), 4))
        group = groups[placement["group"]]
        sources = [o for o in asset_root.children_recursive if o.type == "MESH"]
        props = {"lpk_placement": placement["id"], "lpk_asset_ref": entry["plan"]["id"]}
        copies = []
        if placement.get("instance"):
            # instance：直接掛在群組底下（不包 Empty），共用 mesh 的兄弟節點才會被 exporter 合併成 gpu instancing
            to_asset = asset_root.matrix_world.inverted()
            for src in sources:
                obj = bpy.data.objects.new(f"{placement['id']}_{src.get('lpk_component', src.name)}", src.data)
                collection.objects.link(obj)
                obj.parent = group
                obj.matrix_world = matrix @ to_asset @ src.matrix_world
                _copy_props(src, obj)
                _tag(obj, scene_id, instance=True, **props)
                copies.append(obj)
        else:
            proot = mesh_builder.create_empty(f"{placement['id']}_Root", collection=collection)
            proot.parent = group
            proot.matrix_world = matrix
            _tag(proot, scene_id, lpk_placement_root=True, **props)
            mapping = {asset_root: proot}
            # 依深度排序：parent 一定先建，子物件才掛得上去
            for src in sorted(sources, key=lambda o: _depth(o, asset_root)):
                obj = bpy.data.objects.new(f"{placement['id']}_{src.get('lpk_component', src.name)}", src.data)
                collection.objects.link(obj)
                obj.parent = mapping.get(src.parent, proot)
                obj.matrix_parent_inverse = src.matrix_parent_inverse.copy()
                obj.location, obj.rotation_euler, obj.scale = src.location.copy(), src.rotation_euler.copy(), src.scale.copy()
                _copy_props(src, obj)
                _tag(obj, scene_id, **props)
                mapping[src] = obj
                copies.append(obj)
            copies.insert(0, proot)
        placed[placement["id"]] = copies

    bpy.context.view_layer.update()

    # 6. Scene QA
    report = check_scene(doc, root, groups, footprints, field, library)
    for issue in report["issues"]:
        if issue["level"] == "fail":
            add_error(result, issue["code"], issue["message"])
    report["textures"] = _scene_textures(root, surface_report)
    for warning in report["textures"]["warnings"]:
        report["issues"].append({"level": "warn", "code": warning.split("：", 1)[0], "message": warning})
    result["report"] = report
    result["changes"].update({
        "root": root.name, "collection": collection.name,
        "placements": {pid: len(objs) for pid, objs in placed.items()},
        "triangles": report["budget"]["triangles"], "draw_calls": report["budget"]["draw_calls"],
    })

    # 7. 匯出
    target = doc.get("export", {}).get("path")
    if export and result["ok"] and target:
        target = target if os.path.isabs(target) else os.path.join(repo_root or REPO_ROOT, target)
        export_glb(root, target, apply_modifiers=True, gpu_instances=True,
                   compress=doc.get("export", {}).get("compress", True))
        if doc.get("export", {}).get("texture_format", "webp") == "webp" and read_glb_json(target).get("images"):
            optimized = optimize_glb(target)
            if optimized["ok"]:
                result["changes"]["texture_optimize"] = {
                    k: optimized["report"][k] for k in ("image_bytes_before", "image_bytes_after", "file_bytes")}
            else:
                result.setdefault("warnings", []).append(optimized["warning"])
        result["changes"]["filepath"] = target
        result["changes"]["export"] = glb_stats(target)
        result["changes"]["export"]["texture_bytes"] = glb_image_bytes(read_glb_json(target))
        qa = {"scene": report["status"], "assets": report["assets"]}
        manifest = scene_manifest(doc, root, target, result["changes"]["export"], read_glb_json(target), qa)
        result["changes"]["manifest"] = write_manifest(target, manifest)
    return result


def _depth(obj, stop):
    depth, node = 0, obj.parent
    while node is not None and node != stop:
        depth += 1
        node = node.parent
    return depth


def _scene_textures(root, surface_report, hint_mb=150.0):
    """整個場景用到的貼圖：張數、GPU 記憶體（同一張圖只算一次——相同 hash 的貼圖在資產間共用）。"""
    images = {}
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        for material in obj.data.materials:
            if material is None or material.node_tree is None:
                continue
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image is not None:
                    images[node.image.name] = node.image
    mb = sum(gpu_bytes(*image.size) for image in images.values()) / (1024 * 1024)
    warnings = list(surface_report.get("warnings", []))
    if mb > hint_mb:
        warnings.append(f"GPU_TEXTURE_HIGH：場景貼圖 GPU 記憶體 {mb:.0f} MB，超過 {hint_mb:.0f} MB，建議升級 KTX2")
    shared = sum(1 for name in images if name.startswith("LPK_tex_"))
    return {"images": len(images), "shared_library_images": shared, "gpu_texture_mb": round(mb, 2),
            "ground": surface_report.get("materials", {}), "warnings": warnings}
