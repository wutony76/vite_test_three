"""Phase 4：拓撲檢查擴充（自我交叉、島數／三角面上限、縮放）與 Geometry QA。"""

import os

import bmesh
import bpy
import fixtures

from lowpoly_kit import api, mesh_builder, shapes
from lowpoly_kit.build import wobble
from lowpoly_kit.validation import PROFILES

PLANS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plans")
SHOP = os.path.join(PLANS, "test01_shop.plan.json")


def _joined(name, boxes, profile):
    data = shapes.MeshData()
    for box in boxes:
        data.extend(shapes.box(*box, "m"))
    obj = fixtures.raw_object(name, data.verts, [list(f) for f in data.faces])
    obj["lowpoly_profile"] = profile
    return obj


def _issues(result):
    return {issue["check"] for issue in result["report"]["issues"] if issue["level"] == "fail"}


# ---------------------------------------------------------------------------
# profile
# ---------------------------------------------------------------------------

def test_profiles_have_phase4_keys():
    assert len(PROFILES) == 12
    for name, rule in PROFILES.items():
        assert {"max_components", "max_tris", "self_intersection", "bevel", "wobble"} <= set(rule), name


# ---------------------------------------------------------------------------
# 自我交叉
# ---------------------------------------------------------------------------

CROSS = [(-1, -0.2, -0.2, 1, 0.2, 0.2), (-0.2, -1, -0.2, 0.2, 1, 0.2)]  # 十字交叉的兩根長方體


def test_crossed_boxes_fail_building_shell():
    _joined("Cross", CROSS, "building_shell")
    result = api.validate_mesh_topology("Cross")
    checks = result["report"]["checks"]
    assert checks["self_intersections"] > 0
    assert checks["non_manifold_edges"] == 0  # 只看邊的檢查抓不到
    assert "self_intersection" in _issues(result)


def test_crossed_boxes_only_reported_for_decoration():
    _joined("CrossDeco", CROSS, "decoration")
    result = api.validate_mesh_topology("CrossDeco")
    assert result["report"]["checks"]["self_intersections"] > 0
    assert result["report"]["checks"]["self_intersections_within_islands"] == 0  # 交叉發生在兩個島之間
    assert "self_intersection" not in _issues(result)


def test_clean_cube_has_no_self_intersection():
    fixtures.cube("Clean", profile="building_shell")
    assert api.validate_mesh_topology("Clean")["report"]["checks"]["self_intersections"] == 0


# ---------------------------------------------------------------------------
# 上限與縮放
# ---------------------------------------------------------------------------

def test_too_many_decoration_islands():
    boxes = [(k * 2, 0, 0, k * 2 + 1, 1, 1) for k in range(9)]
    _joined("Nine", boxes, "decoration")
    assert "components" in _issues(api.validate_mesh_topology("Nine"))
    _joined("Eight", boxes[:8], "decoration")
    assert "components" not in _issues(api.validate_mesh_topology("Eight"))


def test_triangle_limit():
    data = shapes.lathe([(0, 0), (1, 0), (1, 1), (0, 1)], 400, "m")  # 1600 個三角面
    obj = fixtures.raw_object("Dense", data.verts, [list(f) for f in data.faces])
    obj["lowpoly_profile"] = "decoration"
    assert "triangles" in _issues(api.validate_mesh_topology("Dense"))


def test_negative_scale_fails_and_nonuniform_warns():
    fixtures.cube("Mirror", profile="building_shell")
    bpy.data.objects["Mirror"].scale = (-1, 1, 1)
    assert "scale" in _issues(api.validate_mesh_topology("Mirror"))
    fixtures.cube("Stretch", profile="building_shell")
    bpy.data.objects["Stretch"].scale = (1, 2, 1)
    result = api.validate_mesh_topology("Stretch")
    assert result["ok"]
    assert "scale" in {i["check"] for i in result["report"]["issues"] if i["level"] == "warn"}


# ---------------------------------------------------------------------------
# wobble 與 bevel 的保護
# ---------------------------------------------------------------------------

def test_wobble_keeps_close_lines_ordered():
    """兩條只差 4 cm 的格線，wobble（振幅 2 cm）後不可以互相越過。"""
    data = shapes.grid_slab([0, 1, 1.04, 2], [0, 1], 0, 1, {}, "xzy", "m")
    mesh = bpy.data.meshes.new("Lines")
    mesh.from_pydata(data.verts, [], [list(f) for f in data.faces])
    before = sorted({round(v.co.x, 4) for v in mesh.vertices})
    for seed in range(20):
        copy = mesh.copy()
        wobble.wobble_mesh(copy, (0, 0, 0), seed, 0.02)
        near_1 = [v.co.x for v, x in zip(copy.vertices, (v.co.x for v in mesh.vertices)) if abs(x - 1.0) < 1e-6]
        near_2 = [v.co.x for v, x in zip(copy.vertices, (v.co.x for v in mesh.vertices)) if abs(x - 1.04) < 1e-6]
        assert max(near_1) < min(near_2), seed
        bpy.data.meshes.remove(copy)
    assert before == [0.0, 1.0, 1.04, 2.0]


def test_shop_structure_keeps_bevel():
    result = api.build_asset_from_plan(SHOP)
    widths = {info["component"]: info["bevel_width"] for info in result["report"]["objects"].values()}
    for cid in ("facade", "awning", "door", "upper_window", "shop_window", "steps"):
        assert widths[cid] > 0, (cid, widths[cid])


# ---------------------------------------------------------------------------
# Geometry QA
# ---------------------------------------------------------------------------

def test_shop_geometry_passes():
    result = api.build_asset_from_plan(SHOP)
    assert result["ok"], result["errors"]
    assert result["report"]["geometry"]["status"] in ("pass", "warn")
    assert not [i for i in result["report"]["geometry"]["issues"] if i["level"] == "fail"]
    # 煙囪融進牆體後，牆的預期範圍包含煙囪，不會被判超出
    facade = result["report"]["geometry"]["objects"]["test01_shop_facade"]
    assert facade["expected"][1][2] >= 7.0


def test_lifted_pot_is_floating():
    api.build_asset_from_plan(SHOP)
    bpy.data.objects["test01_shop_pot_left"].location.z += 0.5
    result = api.validate_asset_geometry(SHOP)
    codes = {(i["code"], i["object"]) for i in result["report"]["issues"]}
    assert ("FLOATING", "test01_shop_pot_left") in codes


def test_moved_door_is_out_of_bounds():
    api.build_asset_from_plan(SHOP)
    bpy.data.objects["test01_shop_door"].location.x += 0.6
    result = api.validate_asset_geometry(SHOP)
    assert not result["ok"]
    assert "GEOMETRY_OUT_OF_BOUNDS" in [e["code"] for e in result["errors"]]
