"""依 plan 建模（Blender 端）的整合測試：Test A 店面、樹木、確定性、preview、匯出、錯誤處理。"""

import copy
import hashlib
import json
import os
import tempfile

import bpy

from lowpoly_kit import api, shapes
from lowpoly_kit.export import glb_stats

PLANS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plans")
SHOP = os.path.join(PLANS, "test01_shop.plan.json")
TREE = os.path.join(PLANS, "tree_round.plan.json")
COTTAGE = os.path.join(PLANS, "test02_cottage.plan.json")


def _load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def _mesh_hash(prefix):
    digest = hashlib.sha256()
    for obj in sorted((o for o in bpy.data.objects if o.name.startswith(prefix) and o.type == "MESH"),
                      key=lambda o: o.name):
        digest.update(obj.name.encode())
        for vert in obj.data.vertices:
            digest.update(("%.5f %.5f %.5f" % tuple(vert.co)).encode())
    return digest.hexdigest()


def test_shop_builds_and_every_object_passes():
    result = api.build_asset_from_plan(SHOP)
    assert result["ok"], result["errors"]
    objects = result["report"]["objects"]
    assert all(info["status"] in ("pass", "warn") for info in objects.values()), objects
    facade = objects["test01_shop_facade"]
    assert facade["components"] == 1 and facade["non_manifold"] == 0 and facade["boundary"] == 0
    # 煙囪已融合進牆體，不再是資產的一部分
    assert "test01_shop_chimney" not in result["changes"]["objects"]
    assert result["changes"]["triangles"] <= 5000
    assert result["changes"]["primitives"] <= 48
    root = bpy.data.objects["test01_shop_Root"]
    assert bpy.data.objects["test01_shop_door"].parent == root
    assert bpy.data.objects["test01_shop_door_glass"].parent.name == "test01_shop_door"
    assert bpy.data.objects["test01_shop_door"]["clickable"] is True


def test_roof_and_brick_edits_applied():
    # preview 是 flat 材質，才看得到「屋頂、磚面各自的材質」；預設的 atlas 會把它們合成一個材質
    api.build_asset_from_plan(SHOP, preset="preview")
    facade = bpy.data.objects["test01_shop_facade"]
    names = [m.name for m in facade.data.materials]
    assert "LPK_test01_shop_coping" in names and "LPK_test01_shop_brick" in names
    # 屋頂往下壓 0.4 m：牆體內有低於頂面的向上面（屋頂面）
    top = max(v.co.z for v in facade.data.vertices)
    roofs = [p for p in facade.data.polygons if p.normal.z > 0.99 and p.center.z < top - 0.3]
    assert roofs


def test_rebuild_is_identical():
    api.build_asset_from_plan(SHOP)
    first = _mesh_hash("test01_shop_")
    api.build_asset_from_plan(SHOP)
    assert _mesh_hash("test01_shop_") == first
    # 重建會先清掉上一次的結果，不會出現 .001
    assert not [o.name for o in bpy.data.objects if o.name.startswith("test01_shop_") and "." in o.name]


def test_preview_preset_has_no_tertiary():
    result = api.build_asset_from_plan(SHOP, preset="preview")
    assert result["ok"], result["errors"]
    tiers = {info["tier"] for info in result["report"]["objects"].values()}
    assert "tertiary" not in tiers
    assert result["report"]["detail"]["bevel_quality"] == 0


def test_tree_canopy_remeshed_to_one_island():
    result = api.build_asset_from_plan(TREE)
    assert result["ok"], result["errors"]
    canopy = result["report"]["objects"]["tree_round_canopy"]
    assert canopy["profile"] == "organic" and canopy["components"] == 1


def test_export_glb():
    out = tempfile.mkdtemp(prefix="lpk_plan_")
    result = api.build_asset_from_plan(SHOP, export=True, repo_root=out)
    assert result["ok"], result["errors"]
    stats = glb_stats(result["changes"]["filepath"])
    assert stats["root_nodes"] == ["test01_shop_Root"]
    # 26 個元件 Object：pot_right 共用 pot_left 的 mesh；門口盆栽形狀差太多，獨立建模 → 25 個 mesh
    # 再加 3 個 decal（招牌字、門上 OPEN、牆上咖啡杯）各自一個 mesh → 28
    assert stats["meshes"] == 28


def test_unknown_kind_is_reported():
    plan = copy.deepcopy(_load(TREE))
    plan["components"][0]["kind"] = "fence"
    result = api.build_asset_from_plan(plan)
    assert not result["ok"]
    assert "COMPONENT_NOT_IMPLEMENTED" in [e["code"] for e in result["errors"]]


def test_budget_exceeded_is_reported():
    plan = copy.deepcopy(_load(TREE))
    plan["budget"]["max_tris"] = 100
    result = api.build_asset_from_plan(plan)
    assert "BUDGET_EXCEEDED" in [e["code"] for e in result["errors"]]


def test_extrude_multiple_faces_leaves_no_wire_edges():
    """回歸：一次擠出多個相鄰的面，舊版會留下孤立邊（Phase 3 建屋頂時發現）。"""
    data = shapes.grid_slab([-1, 0, 1], [-1, 1], 0, 1, {}, "xyz", "m")
    result = api.create_connected_mesh("Slab", data.verts, data.faces, profile="building_shell")
    assert result["ok"], result["errors"]
    edited = api.extrude_mesh_region("Slab", {"normal": [0, 0, 1]}, mode="inset_extrude", thickness=0.1, depth=-0.3)
    assert edited["ok"], edited["errors"]
    assert edited["report"]["checks"]["loose_edges"] == 0


def test_cottage_builds_with_chimney_merged_and_flue_kept():
    """test02：煙囪融進四坡屋頂；掛在煙囪底下的煙管改掛到屋頂，仍然屬於資產（Phase 6 前置發現的問題）。"""
    result = api.build_asset_from_plan(COTTAGE)
    assert result["ok"], result["errors"]
    assert "test02_cottage_chimney" not in result["changes"]["objects"]
    flue = bpy.data.objects["test02_cottage_flue_pipe"]
    assert flue.parent.name == "test02_cottage_roof_main"
    assert flue in bpy.data.objects["test02_cottage_Root"].children_recursive
    assert result["changes"]["triangles"] <= 6000 and result["changes"]["primitives"] <= 32
    assert not [i for i in result["report"]["geometry"]["issues"] if i["level"] == "fail"]


def test_quarter_turn_component_fills_world_bounds():
    """繞 Z 轉 ±90° 的元件（例如側牆上的門）：builder 用對調的寬深建模，轉完要剛好落在 plan 的 bounds 內。"""
    plan = copy.deepcopy(_load(SHOP))
    door = next(c for c in plan["components"] if c["kind"] == "door")
    # 門改放到 -X 側牆外：世界座標上是「薄（x）× 寬（y）」
    door["bounds"] = [[-3.2, -0.6, 0.12], [-3.06, 0.6, 2.3]]
    door["transform"] = {"rotation_deg": [0, 0, -90]}
    for comp in plan["components"]:
        openings = comp.get("params", {}).get("openings")
        if openings and door["id"] in openings:
            openings.remove(door["id"])
    # 已知限制：轉向元件底下的子元件（例如門玻璃）位置不會跟著換算，這裡只驗證元件本身
    children = {c["id"] for c in plan["components"] if c.get("parent") == door["id"]}
    plan["components"] = [c for c in plan["components"] if c["id"] not in children]
    for decal in list(plan.get("decals", [])):
        if decal["target"] in children:
            plan["decals"].remove(decal)
    for group in plan.get("export", {}).get("instance_groups", {}).values():
        group[:] = [m for m in group if m not in children]
    plan["export"]["clickable"] = [m for m in plan["export"].get("clickable", []) if m not in children]
    plan["dimensions"]["w"] = max(plan["dimensions"]["w"], 6.6)
    result = api.build_asset_from_plan(plan)
    geometry = result["report"]["geometry"]
    door_issues = [i for i in geometry["issues"] if door["id"] in i["object"] and i["code"] == "OUT_OF_BOUNDS"]
    assert not door_issues, door_issues
    obj = next(o for o in bpy.data.objects if o.get("lpk_component") == door["id"])
    corners = [obj.matrix_world @ v.co for v in obj.data.vertices]
    span_x = max(c.x for c in corners) - min(c.x for c in corners)
    span_y = max(c.y for c in corners) - min(c.y for c in corners)
    # 轉完應該是「y 方向寬、x 方向薄」
    assert span_y > span_x * 3, (span_x, span_y)
