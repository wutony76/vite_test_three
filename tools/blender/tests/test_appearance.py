"""Phase 5：palette atlas、vertex color、Visual QA（Blender 端）。"""

import os
import tempfile

import bpy
import numpy as np

from lowpoly_kit import api
from lowpoly_kit.appearance import atlas
from lowpoly_kit.export.glb_stats import read_glb_json

PLANS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plans")
SHOP = os.path.join(PLANS, "test01_shop.plan.json")
TREE = os.path.join(PLANS, "tree_round.plan.json")


def _atlas_shop():
    """Phase 5 的測試對象是 palette atlas 本身：關掉 Surface Engine、拿掉 decal，只剩純色 atlas。"""
    import json
    with open(SHOP, encoding="utf-8") as handle:
        plan = json.load(handle)
    plan["detail"] = {"preset": "game_default", "overrides": {"surface_quality": "off"}}
    plan.pop("decals", None)
    return plan


def _shop_meshes():
    # 只看根節點底下的物件：已融合的煙囪原件被移到備份 collection，不屬於資產
    return [o for o in bpy.data.objects["test01_shop_Root"].children_recursive if o.type == "MESH"]


def test_atlas_reduces_primitives_and_materials():
    result = api.build_asset_from_plan(_atlas_shop())
    assert result["ok"], result["errors"]
    assert result["changes"]["primitives"] <= 32
    assert result["report"]["appearance"]["mode"] == "palette_vc"
    allowed = {"LPK_test01_shop_atlas", "LPK_test01_shop_atlas_emissive", "LPK_test01_shop_glass"}
    for obj in _shop_meshes():
        assert {m.name for m in obj.data.materials} <= allowed, obj.name


def test_uvs_point_at_plan_colors():
    """每個 atlas 面的 UV 取到的貼圖顏色，必須剛好是 plan 裡的某個顏色。"""
    api.build_asset_from_plan(_atlas_shop())
    image = bpy.data.images["LPK_test01_shop_atlas_color"]
    size = image.size[0]
    pixels = np.empty(size * size * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    pixels = pixels.reshape(size, size, 4)  # Blender 順序：第 0 列在最下面，和 UV 一致
    plan_colors = {tuple(round(c, 3) for c in atlas.hex_to_rgb(m["hex"]))
                   for m in __import__("json").load(open(SHOP, encoding="utf-8"))["materials"]}
    facade = bpy.data.objects["test01_shop_facade"].data
    seen = set()
    for poly in facade.polygons:
        if facade.materials[poly.material_index].name != "LPK_test01_shop_atlas":
            continue
        u, v = facade.uv_layers["UVMap"].data[poly.loop_indices[0]].uv
        color = tuple(round(float(c), 3) for c in pixels[int(v * size), int(u * size), :3])
        assert color in plan_colors, color
        seen.add(color)
    assert len(seen) >= 4  # 牆、凹槽底、磚、屋頂／煙囪


def test_vertex_color_range():
    api.build_asset_from_plan(SHOP)
    mesh = bpy.data.objects["test01_shop_facade"].data
    attribute = mesh.color_attributes["Col"]
    values = [d.color[0] for d in attribute.data]
    assert 0.8 <= min(values) and max(values) <= 1.0
    assert max(values) - min(values) > 0.05  # 有明暗起伏，不是整片同一個值


def test_preview_preset_stays_flat():
    result = api.build_asset_from_plan(SHOP, preset="preview")
    assert result["report"]["appearance"]["mode"] == "flat"
    names = {m.name for o in _shop_meshes() for m in o.data.materials}
    assert "LPK_test01_shop_atlas" not in names and "LPK_test01_shop_lime_paint" in names


def test_glb_has_textures_and_vertex_colors():
    out = tempfile.mkdtemp(prefix="lpk_p5_")
    result = api.build_asset_from_plan(SHOP, export=True, repo_root=out)
    gltf = read_glb_json(result["changes"]["filepath"])
    pbr = [m.get("pbrMetallicRoughness", {}) for m in gltf["materials"]]
    assert any("baseColorTexture" in p and "metallicRoughnessTexture" in p for p in pbr)
    assert any(m.get("emissiveTexture") for m in gltf["materials"])
    # decal 是貼在表面上的小片，沒有 vertex color；其他 mesh 都要有
    decals = {f"test01_shop_{d}" for d in ("sign_text", "door_open", "wall_cup")}
    assert all("COLOR_0" in p["attributes"] for m in gltf["meshes"] if m["name"] not in decals for p in m["primitives"])
    # palette atlas 用 NEAREST（放大時不混色）；Surface Engine 的手繪貼圖用 LINEAR + mipmap
    assert any(s.get("magFilter") == 9728 for s in gltf["samplers"])
    assert any(s.get("magFilter") == 9729 for s in gltf["samplers"])


def test_visual_qa_passes_and_restores_scene():
    api.build_asset_from_plan(SHOP)
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = 123, 77
    marker = bpy.data.objects.new("Marker", None)
    scene.collection.objects.link(marker)
    marker.hide_render = True
    engine_before = scene.render.engine
    objects_before = {o.name for o in bpy.data.objects}

    out = tempfile.mkdtemp(prefix="lpk_vqa_")
    result = api.validate_visual(SHOP, out)
    report = result["report"]
    assert result["ok"], result["errors"]
    assert report["silhouette_iou"] >= 0.85 and report["component_mean"] >= 0.7, report
    assert os.path.exists(os.path.join(out, "overlay.png")) and os.path.exists(os.path.join(out, "visual_report.json"))

    # 場景設定還原：解析度、引擎、隱藏狀態都和執行前一樣；暫時的相機已刪除
    assert (scene.render.resolution_x, scene.render.resolution_y) == (123, 77)
    assert scene.render.engine == engine_before
    assert bpy.data.objects["Marker"].hide_render is True
    assert {o.name for o in bpy.data.objects} == objects_before


def test_visual_qa_skips_without_front_reference():
    api.build_asset_from_plan(TREE)
    result = api.validate_visual(TREE, tempfile.mkdtemp(prefix="lpk_vqa_"))
    assert result["ok"] and result["report"]["status"] == "skipped"
