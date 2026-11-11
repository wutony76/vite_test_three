"""manifest：GLB 旁邊的說明檔，告訴 Three.js 端「哪些節點能點、哪些燈要一起亮、場景燈光怎麼擺」。

為什麼不全部放在 GLB 的 userData：
- userData 要載入整個 GLB、走訪所有節點才知道；manifest 是小小一份 JSON，頁面可以先讀
- 場景燈光不放進 GLB（Blender 和 Three.js 的強度單位不同），需要另一個地方描述
節點名稱就是 Blender 的 Object 名稱，和 GLB 節點名稱一致（命名已避開 Three.js 會刪掉的「.」）。
"""

import json
import os


def _requires(gltf_json):
    return sorted(set(gltf_json.get("extensionsRequired", [])) | set(gltf_json.get("extensionsUsed", [])))


def write_manifest(glb_path, manifest):
    path = os.path.splitext(glb_path)[0] + ".manifest.json"
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    return path


def asset_manifest(plan, root, glb_path, stats, gltf_json, qa):
    """root：資產的根 Empty。clickable／anim_groups 用 Object 的 custom property 收集，和 GLB 一致。"""
    objects = [o for o in root.children_recursive if o.type == "MESH"]
    anim = {}
    for obj in objects:
        if obj.get("anim_group"):
            anim.setdefault(obj["anim_group"], []).append(obj.name)
    return {
        "schema": "lowpoly.manifest/1", "kind": "asset", "id": plan["id"], "glb": os.path.basename(glb_path),
        "requires": _requires(gltf_json), "root": root.name,
        "clickable": sorted(o.name for o in objects if o.get("clickable")),
        "anim_groups": {k: sorted(v) for k, v in anim.items()},
        "stats": {k: stats[k] for k in ("triangles", "primitives", "meshes", "materials", "file_bytes")},
        "qa": qa,
    }


def scene_manifest(scene, root, glb_path, stats, gltf_json, qa):
    placements = []
    for obj in root.children_recursive:
        if obj.get("lpk_placement_root"):
            placements.append({
                "id": obj["lpk_placement"], "asset": obj.get("lpk_asset_ref"), "root": obj.name,
                "clickable": sorted(c.name for c in obj.children_recursive if c.get("clickable")),
            })
    # instance 物件匯出後會被合併成 InstancedMesh，個別節點名稱不存在於 GLB，
    # 所以它們的動畫群組記在 instanced 區段（用資產與群組名稱），不放進 anim_groups 的節點清單
    instanced = {}
    for obj in root.children_recursive:
        if obj.get("instance"):
            entry = instanced.setdefault(obj["lpk_placement"], {"id": obj["lpk_placement"], "asset": obj.get("lpk_asset_ref")})
            if obj.get("anim_group"):
                entry["anim_group"] = obj["anim_group"]
    anim = {}
    for obj in root.children_recursive:
        if obj.type == "MESH" and obj.get("anim_group") and not obj.get("instance"):
            anim.setdefault(obj["anim_group"], []).append(obj.name)
    return {
        "schema": "lowpoly.manifest/1", "kind": "scene", "id": scene["id"], "glb": os.path.basename(glb_path),
        "requires": _requires(gltf_json), "root": root.name,
        "groups": [f"{scene['id']}_{name}" for name in scene["hierarchy"]],
        "placements": sorted(placements, key=lambda p: p["id"]),
        "instanced": [instanced[pid] for pid in sorted(instanced)],
        "anim_groups": {k: sorted(v) for k, v in anim.items()},
        "lights": scene.get("lights", []),
        "stats": {k: stats[k] for k in ("triangles", "primitives", "meshes", "materials", "file_bytes")},
        "qa": qa,
    }
