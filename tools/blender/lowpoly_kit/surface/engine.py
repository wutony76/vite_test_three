"""Surface Engine 入口（Blender 端）：把 plan 的外觀設定套到建好的幾何上。

順序（每一步都依賴上一步）：
1. 分類材質：有 surface → 貼圖材質；沒有 → palette atlas（Phase 5 的純色路線，保留給小裝飾）
2. palette atlas 與 vertex color（明暗起伏、高度漸層）——貼圖材質也會乘上 vertex color，風格才一致
3. 取得貼圖（procedural／library／manual／provider 快取）→ Blender 圖片（以內容 hash 命名，可跨資產共用）
4. Material Builder 把原本的材質 datablock 換成貼圖節點（面的材質指派不變）
5. UV0：依 surface.uv 或 profile 的預設策略，只投影用到該材質的面
6. Bake（ao／full）
7. Decal
"""

import bpy

from ..build import appearance
from ..build.materials import material_name
from . import bake as bake_engine
from . import decals as decal_engine
from . import images as image_tools
from .material_builder import build_textured
from .sources.base import resolve as resolve_source
from .spec import GRAIN_PATTERNS, PROFILE_UV, TIERS, gpu_bytes, resolve_surface, texel_density
from .uv import apply_uv0


def textured_specs(materials, detail):
    """回傳 {材質名稱: resolve 後的 spec}。surface_quality = off 或半透明材質不做貼圖。"""
    if detail.get("surface_quality", "off") == "off":
        return {}
    result = {}
    for material in materials:
        if "surface" not in material or material.get("alpha", 1.0) < 1.0:
            continue
        spec = resolve_surface(material, quality=detail["surface_quality"], detail_strength=detail["surface_detail"])
        spec["uv_explicit"] = "uv" in material["surface"]
        result[material["name"]] = spec
    return result


def texture_images(spec):
    """取得三張貼圖的 Blender 圖片。procedural 的圖已經存在（同 hash）就直接沿用，不必重算。"""
    prefix = f"LPK_tex_{spec['hash']}"
    roles = ("base", "orm", "normal") if spec["relief"] else ("base", "orm")
    names = {role: f"{prefix}_{role}" for role in roles}
    existing = {role: bpy.data.images.get(name) for role, name in names.items()}
    if spec["source"] == "procedural" and all(existing.values()) and \
            all(image.get("lpk_complete") for image in existing.values()):
        return existing, {"source": "procedural", "pattern": spec["pattern"], "seed": spec["seed"],
                          "hash": spec["hash"], "reused": True}, []
    result = resolve_source(spec, loader=image_tools.load_png_with_blender)
    created = {}
    for role in roles:
        image = image_tools.image_from_array(names[role], result.maps[role], role)
        image["lpk_complete"] = not result.warnings  # 退回 procedural 的圖不重複使用，下次再試 provider
        image["lpk_hash"] = spec["hash"]
        created[role] = image
    return created, result.provenance, result.warnings


def build_surface_material(plan_id, spec, vertex_color):
    images, provenance, warnings = texture_images(spec)
    material = build_textured(material_name(plan_id, spec["name"]), images, repeat=True, vertex_color=vertex_color,
                              emissive=spec["emissive"], normal_strength=spec["normal_strength"])
    material["lpk_asset"] = plan_id
    material["lpk_textured"] = True
    material["lpk_surface_hash"] = spec["hash"]
    material["lpk_tile_m"] = spec["tile_m"] or 0.0
    material["lpk_tier"] = spec["tier"]
    return material, images, provenance, warnings


def _uv_rule(spec, profile):
    """plan 有寫 uv 就照寫的；沒寫時用 profile 的預設，但有重力方向的圖樣（磚、瓦）不用 along。"""
    if spec["uv_explicit"] or not spec["tileable"]:
        strategy = spec["uv"]
    else:
        strategy = PROFILE_UV.get(profile, "planar")
        if strategy == "along" and spec["pattern"] not in GRAIN_PATTERNS:
            strategy = "planar"
    return {"uv": strategy, "tile_m": spec["tile_m"]}


def _project(plan_id, objects, specs):
    """每個不重複的 mesh，對用到貼圖材質的面做 UV0 投影。"""
    by_material = {material_name(plan_id, name): spec for name, spec in specs.items()}
    done, report = set(), {}
    for obj in objects:
        mesh = obj.data
        if mesh.name in done:
            continue
        done.add(mesh.name)
        assignments = {}
        for index, material in enumerate(mesh.materials):
            spec = by_material.get(material.name) if material else None
            if spec is not None:
                assignments[index] = _uv_rule(spec, obj.get("lowpoly_profile"))
        if assignments:
            report[mesh.name] = {str(k): v for k, v in apply_uv0(mesh, assignments).items()}
    return report


def _bake_targets(objects):
    """要烘焙的物件：至少有一個不透明材質。只有玻璃的物件（窗玻璃）不烘。"""
    targets = []
    for obj in objects:
        if obj.get("lpk_decal"):
            continue
        if any(m is not None and not bake_engine.is_transparent(m) for m in obj.data.materials):
            targets.append(obj)
    return targets


def _ao_size(unique_size, objects):
    """AO 是低頻的明暗，預設用 unique 解析度的一半；但要避開所有金屬粗糙度圖的尺寸。

    Blender 的 glTF 匯出器看到 occlusion 和 metallicRoughness 的圖片「尺寸相同」時，會把兩者合成一張 ORM。
    在這裡合併是錯的：AO 用 UVBake（TEXCOORD_1、CLAMP），ORM 用 UVMap（TEXCOORD_0、REPEAT），
    合成後只剩一個 sampler，而且每個材質都會各存一份 AO。尺寸不同時匯出器就會分開輸出。
    """
    taken = set()
    for obj in objects:
        for material in obj.data.materials:
            if material is None or material.node_tree is None:
                continue
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE" and node.image and node.image.get("lpk_role") in ("orm", None) \
                        and node.image.colorspace_settings.name == "Non-Color":
                    taken.add(node.image.size[0])
    for candidate in (unique_size // 2, unique_size // 4, unique_size, unique_size * 2):
        if candidate >= 64 and candidate not in taken:
            return candidate
    return unique_size // 2


def _consolidate(objects, baked_material):
    """full bake 之後：不透明、不發光的材質槽全部換成 baked 材質，合併成同一個槽。"""
    for mesh in {obj.data for obj in objects}:
        keep = []
        remap = {}
        for index, material in enumerate(mesh.materials):
            emissive = bool(material and material.get("lpk_emissive"))
            if material is None or bake_engine.is_transparent(material) or emissive:
                if material not in keep:
                    keep.append(material)
                remap[index] = ("keep", keep.index(material))
            else:
                remap[index] = ("baked", 0)
        slots = [baked_material, *keep]
        old = [p.material_index for p in mesh.polygons]
        mesh.materials.clear()
        for material in slots:
            mesh.materials.append(material)
        for poly, index in zip(mesh.polygons, old):
            kind, value = remap[index]
            poly.material_index = 0 if kind == "baked" else value + 1
        mesh.update()


def apply_surface(plan_id, doc, objects, detail, seed, ground_z, root, collection, base_dir):
    """objects：{元件 id: Object}。回傳 (報告, decal Object 清單)。"""
    specs = textured_specs(doc["materials"], detail)
    flat_specs = [m for m in doc["materials"] if m["name"] not in specs]
    atlas_info = appearance.apply_appearance(plan_id, flat_specs, list(objects.items()), detail,
                                             doc["dimensions"]["h"], seed, ground_z=ground_z)
    for material in doc["materials"]:
        found = bpy.data.materials.get(material_name(plan_id, material["name"]))
        if found is not None and material.get("emissive"):
            found["lpk_emissive"] = True
    # mode 維持 Phase 5 的意義（flat／palette／palette_vc），既有的報告讀取端不必改
    report = {"mode": atlas_info["mode"], "atlas": atlas_info, "surface_quality": detail.get("surface_quality"),
              "materials": {},
              "bake": None, "decals": {"count": 0}, "warnings": []}
    vertex_color = detail["material_quality"] == "palette_vc"
    mesh_objects = list(objects.values())

    for name, spec in specs.items():
        material, images, provenance, warnings = build_surface_material(plan_id, spec, vertex_color)
        if spec["emissive"]:
            material["lpk_emissive"] = True
        report["warnings"] += warnings
        size = spec["size"]
        report["materials"][name] = {
            "class": spec["class"], "pattern": spec["pattern"], "tier": spec["tier"], "size": size,
            "tile_m": spec["tile_m"], "texel_density": texel_density(size, spec["tile_m"]),
            "target_density": TIERS[spec["tier"]]["density"], "tileable": spec["tileable"],
            "images": {role: image.name for role, image in images.items()},
            "gpu_bytes": len(images) * gpu_bytes(size, size), "provenance": provenance, "hash": spec["hash"],
        }
    report["uv"] = _project(plan_id, mesh_objects, specs)

    if specs and detail.get("bake", "none") != "none":
        targets = _bake_targets(mesh_objects)
        tier = max((spec["tier"] for spec in specs.values()), key=["prop", "standard", "hero"].index)
        size = TIERS[tier]["unique"]
        dims = doc["dimensions"]
        distance = min(max(0.15 * max(dims["w"], dims["d"], dims["h"]), 0.02), 2.0)
        padding = TIERS[tier]["padding"]
        if detail["bake"] == "ao":
            ao_size = _ao_size(size, targets)
            report["bake"] = bake_engine.bake_ao(plan_id, targets, ao_size, max(padding // 2, 2), distance)
        else:
            info, baked = bake_engine.bake_full(plan_id, targets, size, padding, distance)
            _consolidate(targets, baked)
            report["bake"] = info

    # decal 是 tertiary 裝飾：preview（tertiary_density = 0）只看比例，不建 decal
    decals = doc.get("decals", []) if detail.get("tertiary_density", 1.0) > 0 else []
    decal_objects, decal_report = decal_engine.build_decals(plan_id, decals, objects, root, collection, base_dir)
    report["decals"] = decal_report
    report["warnings"] += decal_report.get("warnings", [])
    return report, decal_objects


def apply_scene_surfaces(scene_id, materials, objects):
    """場景的地形、道路：同一套 Surface Engine，只做貼圖與 UV（不 bake、不 decal）。"""
    detail = {"surface_quality": "standard", "surface_detail": 0.6, "material_quality": "flat"}
    specs = textured_specs(materials, detail)
    report = {"materials": {}, "warnings": []}
    for name, spec in specs.items():
        _material, images, provenance, warnings = build_surface_material(scene_id, spec, vertex_color=False)
        report["warnings"] += warnings
        report["materials"][name] = {"pattern": spec["pattern"], "size": spec["size"], "tile_m": spec["tile_m"],
                                     "images": {r: i.name for r, i in images.items()}, "provenance": provenance}
    report["uv"] = _project(scene_id, objects, specs)
    return report
