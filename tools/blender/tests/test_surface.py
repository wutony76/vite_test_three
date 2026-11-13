"""Surface Engine（Blender 端）：UV 策略、Material Builder、Bake、Decal、資產與場景整合、GLB 內容。"""

import copy
import json
import math
import os
import tempfile

import bmesh
import bpy
import numpy as np

from lowpoly_kit import api
from lowpoly_kit.export.glb_stats import read_glb_json
from lowpoly_kit.surface import gltf_compat
from lowpoly_kit.surface import images as image_tools
from lowpoly_kit.surface.material_builder import build_textured
from lowpoly_kit.surface.uv import UV0, apply_uv0, triangle_metrics

PLANS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plans")


def _plan(name):
    with open(os.path.join(PLANS, name), encoding="utf-8") as handle:
        return json.load(handle)


def _mesh_object(name, build):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build(bm)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.uv_layers.new(name=UV0)
    return obj


def _material_images(material):
    return {n.image.name: n.image for n in material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image}


# ---------------------------------------------------------------------------
# UV 策略
# ---------------------------------------------------------------------------

def test_planar_uv_has_no_stretch_on_slopes():
    """45° 斜屋頂：planar 依面自己的平面投影，σ1 = σ2 = 1 / tile（沒有拉伸）。盒狀投影會拉長 1.41 倍。"""
    def build(bm):
        verts = [bm.verts.new(v) for v in ((0, 0, 0), (2, 0, 0), (2, 1, 1), (0, 1, 1))]
        bm.faces.new(verts)
    obj = _mesh_object("slope", build)
    apply_uv0(obj.data, {0: {"uv": "planar", "tile_m": 0.5}})
    metrics = triangle_metrics(obj.data, UV0)
    assert np.allclose(metrics["s1"], 2.0, atol=1e-6) and np.allclose(metrics["s2"], 2.0, atol=1e-6)
    # v 方向沿坡面往上：最高的點 v 最大
    uv = obj.data.uv_layers[UV0].data
    by_z = sorted(((obj.data.vertices[obj.data.loops[i].vertex_index].co.z, uv[i].uv[1]) for i in range(4)))
    assert by_z[-1][1] > by_z[0][1]


def test_cylinder_uv_wraps_with_whole_tiles():
    """圓柱：一圈剛好整數張貼圖，而且沒有任何面被展開成繞一整圈（接回處沒有爛面）。"""
    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.5, radius2=0.5, depth=1.0)
    obj = _mesh_object("cyl", build)
    report = apply_uv0(obj.data, {0: {"uv": "cylinder", "tile_m": 1.0}})
    assert report[0]["repeats_around"] == round(2 * math.pi * 0.5 / 1.0)
    uv = obj.data.uv_layers[UV0].data
    for poly in obj.data.polygons:
        if abs(poly.normal.z) > 0.8:
            continue
        us = [uv[i].uv[0] for i in poly.loop_indices]
        assert max(us) - min(us) < 0.5, us
    metrics = triangle_metrics(obj.data, UV0)
    side = np.abs(metrics["s1"] / np.maximum(metrics["s2"], 1e-9))
    assert np.median(side) < 1.1


def test_along_uv_follows_longest_axis():
    """細長的樑（沿 y）：側面的 u 方向沿 y，木紋才會順著長邊走。"""
    def build(bm):
        bmesh.ops.create_cube(bm, size=1.0, matrix=__import__("mathutils").Matrix.Diagonal((0.2, 3.0, 0.2, 1.0)))
    obj = _mesh_object("beam", build)
    apply_uv0(obj.data, {0: {"uv": "along", "tile_m": 1.0}})
    uv = obj.data.uv_layers[UV0].data
    for poly in obj.data.polygons:
        if abs(poly.normal.y) > 0.5:
            continue  # 端面
        loops = list(poly.loop_indices)
        ys = [obj.data.vertices[obj.data.loops[i].vertex_index].co.y for i in loops]
        us = [uv[i].uv[0] for i in loops]
        assert abs(abs(np.corrcoef(ys, us)[0, 1]) - 1) < 1e-6


def test_fit_uv_spans_zero_to_one():
    def build(bm):
        bmesh.ops.create_cone(bm, cap_ends=False, segments=12, radius1=0.3, radius2=0.2, depth=0.8)
    obj = _mesh_object("fit", build)
    apply_uv0(obj.data, {0: {"uv": "fit"}})
    vs = [d.uv[1] for d in obj.data.uv_layers[UV0].data]
    assert abs(min(vs)) < 1e-6 and abs(max(vs) - 1) < 1e-6


def test_fit_uv_flat_top_fills_texture():
    """扁的 fit（魚排）切面貼在魚皮帶之上，側面 UV 落在底部魚皮帶。"""
    def build(bm):
        bmesh.ops.create_cube(bm, size=1.0, matrix=__import__("mathutils").Matrix.Diagonal((0.15, 0.24, 0.02, 1.0)))
    obj = _mesh_object("flat_fit", build)
    apply_uv0(obj.data, {0: {"uv": "fit"}})
    uv = obj.data.uv_layers[UV0].data
    tops = [p for p in obj.data.polygons if p.normal.z > 0.9]
    assert len(tops) == 1
    us = [uv[i].uv[0] for i in tops[0].loop_indices]
    vs = [uv[i].uv[1] for i in tops[0].loop_indices]
    assert min(us) < 0.02 and max(us) > 0.98
    assert min(vs) < 0.13 and max(vs) > 0.98
    sides = [p for p in obj.data.polygons if abs(p.normal.z) < 0.5]
    assert sides
    for poly in sides:
        side_v = [uv[i].uv[1] for i in poly.loop_indices]
        assert max(side_v) < 0.10


# ---------------------------------------------------------------------------
# Material Builder 與 glTF 相容性
# ---------------------------------------------------------------------------

def _maps(size=8):
    blank = np.ones((size, size, 4), np.float32)
    return {role: image_tools.image_from_array(f"T_{role}", blank, role) for role in ("base", "orm", "normal")}


def test_material_builder_color_spaces_and_whitelist():
    maps = _maps()
    material = build_textured("M_test", maps, vertex_color=True)
    assert gltf_compat.check_material(material) == []
    assert maps["base"].colorspace_settings.name == "sRGB"
    assert maps["orm"].colorspace_settings.name == "Non-Color"
    assert maps["normal"].colorspace_settings.name == "Non-Color"
    maps["orm"].colorspace_settings.name = "sRGB"
    assert any(code == "COLOR_SPACE" for code, _ in gltf_compat.check_material(material))
    maps["orm"].colorspace_settings.name = "Non-Color"
    material.node_tree.nodes.new("ShaderNodeTexNoise")
    assert any(code == "NODE_COMPAT" for code, _ in gltf_compat.check_material(material))


def test_mask_material_exports_alpha_mask():
    image = image_tools.image_from_array("T_decal", np.zeros((8, 8, 4), np.float32), "decal")
    material = build_textured("M_decal", {"base": image}, alpha_mode="MASK", repeat=False)
    def build(bm):
        verts = [bm.verts.new(v) for v in ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1))]
        bm.faces.new(verts)
    obj = _mesh_object("decal_quad", build)
    obj.data.materials.append(material)
    root = bpy.data.objects.new("decal_root", None)
    bpy.context.scene.collection.objects.link(root)
    obj.parent = root
    path = os.path.join(tempfile.mkdtemp(), "decal.glb")
    from lowpoly_kit.export.gltf_export import export_glb
    export_glb(root, path)
    entry = next(m for m in read_glb_json(path)["materials"] if m["name"] == "M_decal")
    assert entry.get("alphaMode") == "MASK", entry


# ---------------------------------------------------------------------------
# 資產整合
# ---------------------------------------------------------------------------

def test_crate_uses_textures_uv_and_ao():
    scene = bpy.context.scene
    engine_before = scene.render.engine
    result = api.build_asset_from_plan(os.path.join(PLANS, "crate_pile.plan.json"))
    assert result["ok"], result["errors"]
    assert scene.render.engine == engine_before  # bake 結束後還原
    surface = result["report"]["appearance"]
    assert set(surface["materials"]) == {"wood", "wood_dark", "terracotta", "leaf_green"}
    wood = bpy.data.materials["LPK_crate_pile_wood"]
    roles = {image.get("lpk_role") for image in _material_images(wood).values()}
    assert {"base", "orm", "normal", "ao"} <= roles, roles
    bake = surface["bake"]
    assert bake["mode"] == "ao" and bake["stats"]["std"] > 0.05 and bake["saved"]["max_error"] < 0.01
    assert os.path.exists(bake["saved"]["path"])
    texture = result["report"]["texture"]
    assert texture["status"] == "pass", texture["issues"]
    assert texture["metrics"]["bake_uv_overlap"] < 0.005
    # texel density = 貼圖尺寸 ÷ 一張貼圖覆蓋的公尺數（prop tier 256 px、木板 4 × 0.12 m）
    assert abs(texture["metrics"]["texel_density"]["LPK_crate_pile_wood"] - 256 / 0.48) < 5
    for obj in bpy.data.objects["crate_pile_Root"].children_recursive:
        assert [layer.name for layer in obj.data.uv_layers][:2] == ["UVMap", "UVBake"]


def test_same_surface_spec_shares_images():
    """相同 surface 設定的貼圖以內容 hash 命名：重建第二次直接沿用，不重複產生。"""
    api.build_asset_from_plan(os.path.join(PLANS, "crate_pile.plan.json"))
    before = {i.name for i in bpy.data.images if i.name.startswith("LPK_tex_")}
    api.build_asset_from_plan(os.path.join(PLANS, "crate_pile.plan.json"))
    after = {i.name for i in bpy.data.images if i.name.startswith("LPK_tex_")}
    assert before == after and before


def test_preview_preset_has_no_surface_textures():
    result = api.build_asset_from_plan(os.path.join(PLANS, "crate_pile.plan.json"), preset="preview")
    assert result["ok"], result["errors"]
    assert result["report"]["appearance"]["materials"] == {} and result["report"]["appearance"]["bake"] is None
    assert not [i for i in bpy.data.images if i.name.startswith("LPK_crate_pile_ao")]


def test_full_bake_consolidates_materials():
    plan = _plan("crate_pile.plan.json")
    plan["detail"] = {"preset": "game_default", "overrides": {"bake": "full"}}
    result = api.build_asset_from_plan(plan)
    assert result["ok"], result["errors"]
    passes = result["report"]["appearance"]["bake"]["passes"]
    assert set(passes) == {"color", "orm", "normal"}
    assert passes["color"]["stats"]["std"] > 0.02
    baked = bpy.data.materials["LPK_crate_pile_baked"]
    for obj in bpy.data.objects["crate_pile_Root"].children_recursive:
        assert list(obj.data.materials) == [baked], [m.name for m in obj.data.materials]
        assert obj.data.color_attributes.get("Col") is None  # 顏色已烘進貼圖
    assert result["changes"]["primitives"] == 4  # 每個 Object 只剩 1 個材質


def test_grilled_corn_migrated_without_special_case():
    result = api.build_asset_from_plan(os.path.join(PLANS, "grilled_corn.plan.json"))
    assert result["ok"], result["errors"]
    kernel = result["report"]["appearance"]["materials"]["kernel"]
    assert kernel["pattern"] == "corn_kernels" and not kernel["tileable"]
    assert not [m for m in bpy.data.materials if m.name.endswith("corn_surface")]
    body = bpy.data.objects["grilled_corn_body"]
    assert any(m.name == "LPK_grilled_corn_kernel" for m in body.data.materials)
    material = bpy.data.materials["LPK_grilled_corn_kernel"]
    assert any(n.type == "NORMAL_MAP" for n in material.node_tree.nodes)
    assert not any(n.type == "BUMP" for n in material.node_tree.nodes)  # 舊版 Bump 節點匯出成錯誤的 normalTexture


def test_export_writes_webp_and_texture_slots():
    plan = _plan("crate_pile.plan.json")
    folder = tempfile.mkdtemp()
    plan["export"]["path"] = os.path.join(folder, "crate.glb")
    result = api.build_asset_from_plan(plan, export=True)
    assert result["ok"], result["errors"]
    gltf = read_glb_json(plan["export"]["path"])
    assert {i["mimeType"] for i in gltf["images"]} == {"image/webp"}
    assert "EXT_texture_webp" in gltf.get("extensionsUsed", [])
    wood = next(m for m in gltf["materials"] if m["name"] == "LPK_crate_pile_wood")
    assert "normalTexture" in wood and "metallicRoughnessTexture" in wood["pbrMetallicRoughness"]
    occlusion = wood["occlusionTexture"]
    assert occlusion["texCoord"] == 1 and occlusion["index"] != wood["pbrMetallicRoughness"]["metallicRoughnessTexture"]["index"]
    optimized = result["changes"]["texture_optimize"]
    assert optimized["image_bytes_after"] < optimized["image_bytes_before"] * 0.5
    with open(plan["export"]["path"].replace(".glb", ".manifest.json"), encoding="utf-8") as handle:
        manifest = json.load(handle)
    assert manifest["qa"]["texture"] == "pass" and manifest["textures"]["materials"]["wood"]["pattern"] == "planks"


def test_shop_decals_are_separate_masked_objects():
    result = api.build_asset_from_plan(os.path.join(PLANS, "test01_shop.plan.json"))
    assert result["ok"], result["errors"]
    assert result["report"]["appearance"]["decals"]["count"] == 3
    sign = bpy.data.objects["test01_shop_sign_text"]
    assert sign.parent.name == "test01_shop_sign_disc" and sign.get("lpk_decal")
    assert len(sign.data.polygons) == 1
    # 每個 decal 的四個角都在目標表面的前方（從正面往內打射線，先打到 decal 才打到目標），而且法線朝外（-Y）
    from mathutils import Vector
    for name in ("sign_text", "door_open", "wall_cup"):
        decal = bpy.data.objects[f"test01_shop_{name}"]
        target = decal.parent
        inverse = target.matrix_world.inverted()
        corners = [decal.matrix_world @ v.co for v in decal.data.vertices]
        center = sum(corners, Vector()) / len(corners)
        for corner in corners:
            inside = corner.lerp(center, 0.02)  # 往中心內縮 2%，確保取樣點落在 decal 範圍內
            origin = inverse @ Vector((inside.x, -50.0, inside.z))
            hit, location, _n, _i = target.ray_cast(origin, (inverse.to_3x3() @ Vector((0, 1, 0))).normalized())
            if hit:
                assert corner.y < (target.matrix_world @ location).y, (name, corner.y)
        assert (decal.matrix_world.to_3x3() @ decal.data.polygons[0].normal).y < -0.99
    atlas = bpy.data.images["LPK_test01_shop_decal_atlas"]
    alpha = image_tools.image_to_array(atlas)[:, :, 3]
    assert 0.02 < float((alpha > 0.5).mean()) < 0.9  # 有文字、有透明區
    assert bpy.data.materials["LPK_test01_shop_decals"].get("lpk_alpha_mode") == "MASK"


def test_texture_qa_flags_flat_assets():
    """沒有 surface 的主要元件 → FLAT_RATIO warn（提醒主要資產不要預設純色）。"""
    plan = _plan("crate_pile.plan.json")
    for material in plan["materials"]:
        material.pop("surface")
    for comp in plan["components"]:
        comp["tier"] = "secondary"
    result = api.build_asset_from_plan(plan)
    issues = {i["code"] for i in result["report"]["texture"]["issues"]}
    assert "FLAT_RATIO" in issues and result["report"]["texture"]["metrics"]["flat_ratio"] == 1.0


def test_scene_ground_uses_surface_engine():
    result = api.build_scene_from_plan(os.path.join(PLANS, "sample_town.scene.json"))
    assert result["ok"], result["errors"]
    textures = result["report"]["textures"]
    assert set(textures["ground"]) == {"grass", "road"}
    terrain = bpy.data.objects["sample_town_terrain"]
    material = terrain.data.materials[0]
    assert material.get("lpk_textured") and terrain.data.uv_layers.get(UV0)
    # 資產之間相同設定的貼圖共用：場景裡 LPK_tex_ 圖片的數量少於「材質數 × 張數」
    assert textures["shared_library_images"] > 0 and textures["gpu_texture_mb"] > 0


def test_texture_failures_block_export():
    """Texture QA 的 fail 會擋下匯出：預算設得太小 → TEXTURE_BUDGET。"""
    plan = copy.deepcopy(_plan("crate_pile.plan.json"))
    plan["budget"]["max_gpu_texture_mb"] = 0.5
    plan["export"]["path"] = os.path.join(tempfile.mkdtemp(), "crate.glb")
    result = api.build_asset_from_plan(plan, export=True)
    assert not result["ok"] and any(e["code"] == "TEXTURE_BUDGET" for e in result["errors"])
    assert not os.path.exists(plan["export"]["path"])
