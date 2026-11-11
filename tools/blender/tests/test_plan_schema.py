"""plan 驗證（pipeline）的測試。不需要 Blender，兩種方式都能跑：

    # 一般 Python
    python3 -m unittest discover -s tools/blender/tests -p "test_plan_schema.py"
    # headless Blender（和其他測試一起）
    Blender --background --factory-startup --python-exit-code 1 --python tools/blender/tests/run.py -- plan

寫成一般的 test_* 函式（run.py 用這種格式收集），再用 load_tests 包給 unittest。
"""

import ast
import copy
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
PLANS = os.path.join(BLENDER_DIR, "plans")
sys.path.insert(0, BLENDER_DIR)

from lowpoly_kit.pipeline import PRESETS, resolve_detail, seed_for, validate_plan  # noqa: E402


def _load(name):
    with open(os.path.join(PLANS, name), encoding="utf-8") as handle:
        return json.load(handle)


def _codes(result):
    return [error["code"] for error in result["errors"]]


def _component(plan, comp_id):
    return next(c for c in plan["components"] if c["id"] == comp_id)


def _asset():
    """最小的合法 AssetPlan：每個反例只改一個地方，確認錯誤碼是那個改動造成的。"""
    return {
        "schema": "lowpoly.asset/1",
        "id": "mini",
        "dimensions": {"w": 4, "d": 4, "h": 4},
        "detail": {"preset": "game_default", "overrides": {}},
        "materials": [{"name": "wall", "hex": "#FFFFFF"}],
        "budget": {"max_tris": 1000, "max_primitives": 4},
        "components": [
            {"id": "body", "kind": "wall_block", "tier": "primary", "method": "custom_mesh",
             "profile": "building_shell", "material": "wall",
             "bounds": [[-2, -2, 0], [2, 2, 3]], "source": "observed", "confidence": 0.9},
            {"id": "door", "kind": "door", "tier": "secondary", "method": "component",
             "profile": "opening", "material": "wall", "parent": "body",
             "bounds": [[-0.5, -2.1, 0], [0.5, -1.9, 2]], "source": "observed", "confidence": 0.9},
        ],
        "export": {"path": "public/models/mini/mini.glb"},
    }


# ---------------------------------------------------------------------------
# 正例：專案內的範例 plan
# ---------------------------------------------------------------------------

def test_example_plans_pass():
    for name in ("test01.reference.json", "test01_shop.plan.json", "tree_round.plan.json", "sample_town.scene.json"):
        result = validate_plan(os.path.join(PLANS, name))
        assert result["ok"], (name, result["errors"])


def test_reference_is_front_ortho_with_door_anchor():
    result = validate_plan(os.path.join(PLANS, "test01.reference.json"))
    reference = _load("test01.reference.json")
    assert reference["view"]["type"] == "front_ortho"
    assert reference["scale_anchor"]["component"] == "door"
    assert result["report"]["counts"]["components"] == 22


def test_shop_plan_report():
    report = validate_plan(os.path.join(PLANS, "test01_shop.plan.json"))["report"]
    assert report["counts"]["primary"] >= 1 and report["counts"]["tertiary"] >= 1
    assert 0 < report["inferred_ratio"] < 0.4
    assert report["detail"]["bevel_quality"] == PRESETS["game_default"]["bevel_quality"]
    assert report["estimated_objects"] <= 40


def test_test_a_required_parts_are_planned():
    """Test A 要求的部件都有對應元件（屋瓦依 2026-11-11 決定改成瓦楞雨棚）。"""
    plan = _load("test01_shop.plan.json")
    kinds = {c["kind"] for c in plan["components"]}
    required = {"wall_block", "roof_flat", "foundation", "chimney", "door", "window",
                "pillar", "beam", "awning", "wall_lamp", "pot_plant"}
    assert required <= kinds, required - kinds
    assert _component(plan, "awning")["params"]["corrugated"] is True


# ---------------------------------------------------------------------------
# 反例：每個錯誤碼
# ---------------------------------------------------------------------------

def test_unknown_schema():
    assert _codes(validate_plan({"schema": "lowpoly.asset/9"})) == ["PLAN_SCHEMA_UNKNOWN"]


def test_file_errors():
    assert _codes(validate_plan(os.path.join(PLANS, "nope.plan.json"))) == ["PLAN_FILE_INVALID"]


def test_missing_and_wrong_type():
    plan = _asset()
    del plan["budget"]
    plan["dimensions"]["w"] = "wide"
    codes = _codes(validate_plan(plan))
    assert "PLAN_FIELD_MISSING" in codes and "PLAN_FIELD_TYPE" in codes


def test_bool_is_not_a_number():
    plan = _asset()
    plan["components"][0]["confidence"] = True
    assert "PLAN_FIELD_TYPE" in _codes(validate_plan(plan))


def test_enum_invalid():
    plan = _asset()
    plan["components"][0]["kind"] = "roof_thing"
    plan["components"][1]["profile"] = "gutter"  # 不存在的 profile 必須被擋下
    result = validate_plan(plan)
    paths = {e["path"] for e in result["errors"] if e["code"] == "PLAN_ENUM_INVALID"}
    assert paths == {"components[0].kind", "components[1].profile"}, result["errors"]


def test_duplicate_id_and_missing_parent_reported_together():
    plan = _asset()
    plan["components"][1]["id"] = "body"
    plan["components"][1]["parent"] = "ghost"
    codes = _codes(validate_plan(plan))
    assert "PLAN_ID_DUPLICATE" in codes and "PLAN_REF_MISSING" in codes


def test_parent_cycle():
    plan = _asset()
    plan["components"][0]["parent"] = "door"
    assert "PLAN_CYCLE" in _codes(validate_plan(plan))


def test_remesh_on_building_is_not_allowed():
    plan = _asset()
    plan["components"][0]["method"] = "remesh"
    assert "PLAN_METHOD_NOT_ALLOWED" in _codes(validate_plan(plan))


def test_boolean_union_needs_target():
    plan = _asset()
    plan["components"][1]["method"] = "boolean_union"
    assert "PLAN_METHOD_NOT_ALLOWED" in _codes(validate_plan(plan))
    plan["components"][1]["union_into"] = "door"
    assert "PLAN_METHOD_NOT_ALLOWED" in _codes(validate_plan(plan))  # 融合進自己
    plan["components"][1]["union_into"] = "body"
    assert validate_plan(plan)["ok"]


def test_extrude_needs_parent():
    plan = _asset()
    plan["components"][0]["method"] = "extrude"
    assert "PLAN_METHOD_NOT_ALLOWED" in _codes(validate_plan(plan))


def test_out_of_bounds_only_for_primary_and_secondary():
    plan = _asset()
    plan["components"][1]["bounds"] = [[-0.5, -2.5, 0], [0.5, -1.9, 2]]  # y 超出 -2.1（含 5% 容差）
    assert "PLAN_OUT_OF_BOUNDS" in _codes(validate_plan(plan))
    plan["components"][1]["tier"] = "tertiary"  # 裝飾可以擺在外框外（例如門口盆栽）
    assert validate_plan(plan)["ok"]


def test_bounds_required_for_secondary():
    plan = _asset()
    del plan["components"][1]["bounds"]
    assert "PLAN_FIELD_MISSING" in _codes(validate_plan(plan))


def test_inferred_needs_assumption():
    plan = _asset()
    plan["components"][1]["source"] = "inferred"
    result = validate_plan(plan)
    assert _codes(result) == ["PLAN_INFERRED_NO_ASSUMPTION"]
    assert result["errors"][0]["path"] == "components[1]"


def test_high_inferred_ratio_warns():
    plan = _asset()
    for component in plan["components"]:
        component.update(source="inferred", assumption="測試")
    result = validate_plan(plan)
    assert result["ok"]
    assert "HIGH_INFERRED_RATIO" in [w["code"] for w in result["report"]["warnings"]]


def test_range_errors():
    plan = _asset()
    plan["components"][0]["confidence"] = 1.5
    plan["detail"]["overrides"] = {"bevel_quality": 3}
    plan["style"] = {"edge_wobble": 0.2}
    paths = {e["path"] for e in validate_plan(plan)["errors"] if e["code"] == "PLAN_RANGE"}
    assert paths == {"components[0].confidence", "detail.overrides.bevel_quality", "style.edge_wobble"}, paths


def test_budget_over_desktop_limit():
    plan = _asset()
    plan["budget"]["max_tris"] = 200000
    assert "PLAN_BUDGET_INVALID" in _codes(validate_plan(plan))


def test_too_many_objects_warns():
    plan = _asset()
    plan["budget"]["max_primitives"] = 1
    result = validate_plan(plan)
    assert result["ok"]
    assert "BUDGET_PRIMITIVES" in [w["code"] for w in result["report"]["warnings"]]


def test_export_references():
    plan = _asset()
    plan["export"]["clickable"] = ["door", "window"]
    plan["export"]["instance_groups"] = {"x": ["body", "door"]}
    result = validate_plan(plan)
    assert [e["path"] for e in result["errors"]] == ["export.clickable[1]"]
    assert "INSTANCE_KIND_MIXED" in [w["code"] for w in result["report"]["warnings"]]


def test_param_materials_must_exist():
    plan = _asset()
    plan["components"][1]["params"] = {"glow_material": "neon", "accent_materials": ["wall", "gold"]}
    paths = {e["path"] for e in validate_plan(plan)["errors"]}
    assert paths == {"components[1].params.glow_material", "components[1].params.accent_materials[1]"}, paths


def test_unimplemented_kind_warns():
    plan = _asset()
    plan["components"][1]["kind"] = "fence"
    result = validate_plan(plan)
    assert result["ok"]
    assert "KIND_NOT_IMPLEMENTED" in [w["code"] for w in result["report"]["warnings"]]


def test_reference_errors():
    reference = _load("test01.reference.json")
    broken = copy.deepcopy(reference)
    broken["scale_anchor"]["component"] = "gate"
    broken["components"][0]["bbox"] = [0.5, 0.1, 0.2, 0.9]   # x0 > x1
    broken["components"][1]["bbox"] = [0.1, 0.1, 1.2, 0.2]   # 超出 0～1
    broken["hidden"][0]["source"] = "observed"
    broken["palette"][0]["hex"] = "green"
    codes = _codes(validate_plan(broken))
    for code in ("PLAN_REF_MISSING", "PLAN_RANGE", "PLAN_ENUM_INVALID", "PLAN_FIELD_TYPE"):
        assert code in codes, (code, codes)


def test_scene_errors():
    scene = _load("sample_town.scene.json")
    scene["placements"][0]["asset_id"] = "castle"
    scene["placements"][1]["group"] = "Clouds"
    scene["budget"]["max_draw_calls"] = 1000
    result = validate_plan(scene, base_dir=PLANS)
    paths = {e["path"] for e in result["errors"]}
    assert {"placements[0].asset_id", "placements[1].group", "budget.max_draw_calls"} <= paths, result["errors"]


def test_scene_plan_file_must_exist():
    scene = _load("sample_town.scene.json")
    scene["assets"][0]["plan"] = "missing.plan.json"
    assert "PLAN_REF_MISSING" in _codes(validate_plan(scene, base_dir=PLANS))
    # 沒有 base_dir（直接傳 dict）時不檢查檔案
    assert validate_plan(scene)["ok"]


# ---------------------------------------------------------------------------
# DetailConfig
# ---------------------------------------------------------------------------

def test_override_changes_only_one_field():
    config, errors = resolve_detail({"preset": "game_default", "overrides": {"tertiary_density": 0.9}}, "x")
    assert not errors
    values = config.to_dict()
    changed = {k for k, v in PRESETS["game_default"].items() if values[k] != v}
    assert changed == {"tertiary_density"}


def test_detail_rejects_unknown_param_and_preset():
    _config, errors = resolve_detail({"preset": "ultra", "overrides": {"shininess": 1}}, "x")
    assert {code for code, _p, _m in errors} == {"PLAN_ENUM_INVALID"}
    assert len(errors) == 2


def test_seed_is_deterministic():
    assert seed_for("test01_shop") == seed_for("test01_shop")
    assert seed_for("test01_shop") != seed_for("tree_round")


# ---------------------------------------------------------------------------
# 不依賴 Blender
# ---------------------------------------------------------------------------

def test_pipeline_does_not_import_blender_modules():
    """用 AST 檢查 import 敘述：在 Blender 裡 bpy 一定已經載入，不能用 sys.modules 判斷。"""
    pipeline_dir = os.path.join(BLENDER_DIR, "lowpoly_kit", "pipeline")
    forbidden = {"bpy", "bmesh", "mathutils"}
    for filename in os.listdir(pipeline_dir):
        if not filename.endswith(".py"):
            continue
        with open(os.path.join(pipeline_dir, filename), encoding="utf-8") as handle:
            tree = ast.parse(handle.read())
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
                names = [node.module]
            assert not {n.split(".")[0] for n in names} & forbidden, (filename, names)


def load_tests(loader, tests, pattern):  # noqa: ARG001 — unittest 規定的簽名
    suite = unittest.TestSuite()
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            suite.addTest(unittest.FunctionTestCase(fn, description=name))
    return suite
