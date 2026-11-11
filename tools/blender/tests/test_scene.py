"""Phase 6：場景組裝與 Scene QA（Blender 端）。"""

import os
import tempfile

import bpy

from lowpoly_kit import api
from lowpoly_kit.export.glb_stats import read_glb_json
from lowpoly_kit.scene.assembly import build_scene

PLANS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plans")
TOWN = os.path.join(PLANS, "sample_town.scene.json")
SHOP = os.path.join(PLANS, "test01_shop.plan.json")


def _codes(result):
    return {issue["code"] for issue in result["report"]["issues"] if issue["level"] == "fail"}


def test_town_builds_and_passes_scene_qa():
    result = api.build_scene_from_plan(TOWN)
    assert result["ok"], result["errors"]
    root = bpy.data.objects["sample_town_Root"]
    groups = {c.name for c in root.children}
    assert groups == {f"sample_town_{g}" for g in ("Terrain", "Roads", "Buildings", "Vegetation", "Props")}
    buildings = bpy.data.objects["sample_town_Buildings"].children
    assert {b.name for b in buildings} == {"shop_a_Root", "cottage_a_Root", "cottage_b_Root", "shop_b_Root"}
    assert len([o for o in bpy.data.objects["sample_town_Vegetation"].children if o.get("instance")]) == 16
    # 複本共用 mesh：物件數遠多於 mesh 數
    sharing = result["report"]["sharing"]
    assert sharing["objects"] > 2 * sharing["meshes"]
    assert bpy.data.objects["shop_a_door"].data == bpy.data.objects["shop_b_door"].data
    assert result["changes"]["draw_calls"] <= 150


def test_building_on_road_is_caught():
    result = build_scene(TOWN, overrides={"shop_a": {"location": [-15, 1.5, 0]}})
    assert "SCENE_ON_ROAD" in _codes(result)


def test_overlap_and_out_of_terrain_are_caught():
    result = build_scene(TOWN, overrides={"cottage_a": {"location": [-13, 8, 0]}, "shop_b": {"location": [29, -7, 0]}})
    codes = _codes(result)
    assert {"SCENE_OVERLAP", "SCENE_OUT_OF_TERRAIN"} <= codes, codes


def test_tree_inside_building_is_caught():
    result = build_scene(TOWN, overrides={"tree_05": {"location": [8, -8.5, 0]}})
    assert "SCENE_TREE_IN_BUILDING" in _codes(result)


def test_rebuild_has_no_duplicates():
    api.build_scene_from_plan(TOWN)
    first = sorted(o.name for o in bpy.data.objects if o.get("lpk_scene") == "sample_town")
    api.build_scene_from_plan(TOWN)
    second = sorted(o.name for o in bpy.data.objects if o.get("lpk_scene") == "sample_town")
    assert first == second
    assert not [name for name in second if "." in name]


def test_rebuilding_an_asset_keeps_scene_copies():
    """重建單一資產（同一個 plan id）時，場景裡的複本不能被一起刪掉。"""
    api.build_scene_from_plan(TOWN)
    count = len([o for o in bpy.data.objects if o.get("lpk_scene") == "sample_town"])
    api.build_asset_from_plan(SHOP)
    assert len([o for o in bpy.data.objects if o.get("lpk_scene") == "sample_town"]) == count
    assert bpy.data.objects["shop_a_door"].get("lpk_asset_ref") == "test01_shop"
    assert "lpk_asset" not in bpy.data.objects["shop_a_door"]


def test_export_uses_gpu_instancing():
    out = tempfile.mkdtemp(prefix="lpk_town_")
    result = api.build_scene_from_plan(TOWN, export=True, repo_root=out)
    assert result["ok"], result["errors"]
    gltf = read_glb_json(result["changes"]["filepath"])
    assert "EXT_mesh_gpu_instancing" in gltf.get("extensionsUsed", [])
    assert [n["name"] for n in gltf["nodes"] if n["name"] == "sample_town_Root"]
