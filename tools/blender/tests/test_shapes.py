"""幾何產生器與零件庫的拓撲測試。不需要 Blender：

    python3 -m unittest discover -s tools/blender/tests -p "test_shapes.py"

Blender 端的 run.py 也會收集這些 test_* 函式。
"""

import ast
import json
import math
import os
import random
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BLENDER_DIR = os.path.dirname(HERE)
sys.path.insert(0, BLENDER_DIR)

from lowpoly_kit import shapes  # noqa: E402
from lowpoly_kit.components import get_builder, implemented_kinds  # noqa: E402
from lowpoly_kit.components.layout import layout_plan  # noqa: E402
from lowpoly_kit.pipeline import resolve_detail  # noqa: E402
from lowpoly_kit.validation.profiles import PROFILES  # noqa: E402

PLANS = os.path.join(BLENDER_DIR, "plans")
PLAN_FILES = ("test01_shop.plan.json", "tree_round.plan.json", "test02_cottage.plan.json")


def _closed_single(data, islands=1):
    stats = shapes.topology_stats(data)
    assert stats["boundary_edges"] == 0, stats
    assert stats["non_manifold_edges"] == 0, stats
    assert stats["degenerate_faces"] == 0, stats
    assert stats["loose_verts"] == 0, stats
    assert stats["islands"] == islands, stats
    return stats


# ---------------------------------------------------------------------------
# 產生器
# ---------------------------------------------------------------------------

def test_grid_slab_solid_niche_hole():
    us, vs = [0, 1, 2, 3, 4], [0, 1, 2, 3]
    _closed_single(shapes.grid_slab(us, vs, 0, 0.5, {}, "xzy", "m"))
    # 同一個 region 跨兩格：凹槽底面共用，中間不會多出一片側壁
    niche = shapes.grid_slab(us, vs, 0, 0.5, {(1, 1): ("niche", 0, 0.2, "g"), (2, 1): ("niche", 0, 0.2, "g")},
                             "xzy", "m")
    _closed_single(niche)
    assert niche.mats.count("g") == 2  # 只有兩格槽底用 niche 材質，側壁用牆的材質
    holes = shapes.grid_slab([0, .1, .5, .6, 1, 1.1], [0, .1, .5, .6, 1, 1.1], 0, 0.2,
                             {(1, 1): ("hole", 0), (3, 1): ("hole", 1), (1, 3): ("hole", 2), (3, 3): ("hole", 3)},
                             "xzy", "m")
    _closed_single(holes)  # 四個洞的窗框仍然是 1 個島


def test_grid_slab_rejects_opening_on_border():
    try:
        shapes.grid_slab([0, 1, 2], [0, 1, 2], 0, 1, {(0, 0): ("hole", 0)}, "xzy", "m")
    except ValueError:
        return
    raise AssertionError("開口碰到外緣應該被拒絕")


def test_prism_concave_is_triangulated():
    outline = [(0, 0), (2, 0), (2, 1), (1, 1), (1, 2), (0, 2)]
    data = shapes.prism(outline, 0, 1, "xzy", "m")
    _closed_single(data)
    assert max(len(f) for f in data.faces) == 4  # 端面切成三角形，沒有 ngon


def test_loft_lathe_sweep_blob_are_closed():
    ring = lambda z: [(math.cos(a), math.sin(a), z) for a in (k * math.tau / 8 for k in range(8))]  # noqa: E731
    _closed_single(shapes.loft([ring(0), ring(1), ring(2)], "m"))
    _closed_single(shapes.lathe([(0, 0), (1, 0), (1, 1), (0.5, 1.5), (0, 2)], 8, ["a", "b", "c", "d"]))
    _closed_single(shapes.lathe([(1, 0), (1, 1)], 6, "m", axis="y"))
    _closed_single(shapes.sweep([(0, 0, 0), (1, 0, 0), (1, 0, 1), (1, 0.5, 1.5)], 0.05, 6, "m"))
    _closed_single(shapes.blob((0, 0, 0), (1, 0.5, 0.7), "m", 6, 4, 0.1, random.Random(1)))


def test_lathe_band_materials():
    data = shapes.lathe([(0, 0), (1, 0), (1, 1), (0, 1.2)], 6, ["base", "glow", "cap"])
    assert data.material_names() == ["base", "glow", "cap"]


# ---------------------------------------------------------------------------
# 零件庫
# ---------------------------------------------------------------------------

def _layout(name, preset=None):
    with open(os.path.join(PLANS, name), encoding="utf-8") as handle:
        doc = json.load(handle)
    spec = {"preset": preset, "overrides": {}} if preset else doc["detail"]
    config, errors = resolve_detail(spec, doc["id"])
    assert not errors
    return doc, layout_plan(doc, config.to_dict(), config.seed)


def _build_all(name, preset=None):
    doc, lay = _layout(name, preset)
    built = {}
    for cid in lay["new_objects"]:
        if lay["instances"].get(cid, {}).get("source"):
            continue
        ctx = lay["contexts"][cid]
        built[cid] = (ctx, get_builder(ctx.kind)(ctx))
    return doc, lay, built


def test_every_component_is_closed_and_inside_bounds():
    for plan in PLAN_FILES:
        _doc, _lay, built = _build_all(plan)
        for cid, (ctx, data) in built.items():
            stats = shapes.topology_stats(data)
            if ctx.kind != "glass_pane":
                assert stats["boundary_edges"] == 0, (cid, stats)
            assert stats["non_manifold_edges"] == 0 and stats["degenerate_faces"] == 0, (cid, stats)
            (x0, y0, z0), (x1, y1, z1) = stats["bounds"]
            tol = 0.06
            bury = 0.11 if ctx.kind == "chimney" else 0.0  # 煙囪刻意往下埋進屋頂
            assert x0 >= -ctx.hw - tol and x1 <= ctx.hw + tol, (cid, stats["bounds"])
            assert y0 >= -ctx.hd - tol and y1 <= ctx.hd + tol, (cid, stats["bounds"])
            assert z0 >= -tol - bury and z1 <= ctx.h + tol, (cid, stats["bounds"])


def test_structural_parts_are_single_islands():
    """building_shell 的零件必須是 1 個島：不是方塊堆疊。"""
    doc, _lay, built = _build_all("test01_shop.plan.json")
    # 依 profile 規則判斷：要求剛好 1 個島的（building_shell 等）都必須是 1 個封閉島
    shells = [cid for cid, (ctx, _d) in built.items() if PROFILES[ctx.comp["profile"]]["components"] == 1]
    assert len(shells) >= 5, shells
    for cid in shells:
        _closed_single(built[cid][1])
    for cid, (ctx, data) in built.items():
        limit = PROFILES[ctx.comp["profile"]]["max_components"]
        if limit is not None:
            assert shapes.topology_stats(data)["islands"] <= limit, cid
    _closed_single(built["shop_window"][1])        # 窗框 + 窗櫺 = 1 個島
    _closed_single(built["street_lamp"][1])        # 底座 + 燈柱 + 燈籠 = 1 個島


def test_decorations_stay_under_island_cap():
    """Phase 4 會把 decoration 的島數上限設為 8，零件庫先守住。"""
    _doc, _lay, built = _build_all("test01_shop.plan.json")
    for cid, (ctx, data) in built.items():
        if ctx.comp["profile"] == "decoration":
            assert shapes.topology_stats(data)["islands"] <= 8, cid


def test_wall_has_niches_for_openings():
    _doc, lay, built = _build_all("test01_shop.plan.json")
    regions = lay["contexts"]["facade"].regions
    assert {r["id"] for r in regions if r["role"] == "opening"} == {"upper_window", "door", "shop_window"}
    assert {r["id"] for r in regions if r["role"] == "edit"} == {"brick_patch"}
    assert built["facade"][1].mats.count("niche_dark") >= 3  # 每個開口至少一格槽底用 niche 材質


def test_door_gets_glass_niche_from_child():
    _doc, lay, built = _build_all("test01_shop.plan.json")
    assert [c["id"] for c in lay["contexts"]["door"].children] == ["door_glass"]
    assert shapes.topology_stats(built["door"][1])["islands"] == 3  # 門框、門片、門把


def test_builds_are_deterministic():
    _d, _l, first = _build_all("test01_shop.plan.json")
    _d, _l, second = _build_all("test01_shop.plan.json")
    for cid in first:
        assert first[cid][1].verts == second[cid][1].verts, cid


def test_preview_preset_skips_tertiary_and_detail():
    _doc, lay, built = _build_all("test01_shop.plan.json", preset="preview")
    assert "cat" in lay["skipped"] and "vine_right" in lay["skipped"]
    assert all(lay["components"][cid]["tier"] != "tertiary" for cid in built)
    _d, _l, full = _build_all("test01_shop.plan.json")
    # preview 的 secondary_density 是 0.4，低於門板凹槽的門檻 0.5；門把屬於 tertiary 也一起省略
    assert len(built["door"][1].faces) < len(full["door"][1].faces)


def test_instances_scale_to_fit():
    _doc, lay, _built = _build_all("test01_shop.plan.json")
    # 形狀相近的盆栽共用 mesh；又高又窄的門口盆栽形狀差太多，改成各自建模
    assert lay["instances"]["pot_right"]["source"] == "pot_left"
    assert 0 < lay["instances"]["pot_right"]["scale"] < 1
    assert "pot_door" not in lay["instances"] and lay["instance_rejected"] == ["pot_door"]


def test_cottage_roofs_are_single_shells():
    """四坡、人字屋頂都是 1 個封閉島；四坡屋頂的側面有 courses 個往外凸的瓦列。"""
    _doc, _lay, built = _build_all("test02_cottage.plan.json")
    for cid in ("roof_main", "porch_roof"):
        _closed_single(built[cid][1])
    ctx, roof = built["roof_main"]
    # 每一列瓦（最上面一列除外）都有一個往外凸的環 → 不同高度的 z 值 = 1 + 2 × (courses - 1) + 1
    heights = {round(v[2], 4) for v in roof.verts}
    assert len(heights) == 2 * ctx.param("courses") , sorted(heights)


def test_rock_pile_and_bush_islands():
    _doc, _lay, built = _build_all("test02_cottage.plan.json")
    for cid in ("stones_left", "stones_front"):
        stats = shapes.topology_stats(built[cid][1])
        assert stats["islands"] == 7 and stats["boundary_edges"] == 0, (cid, stats)
    assert shapes.topology_stats(built["bush_right"][1])["islands"] <= 6


def test_registry_covers_plans():
    kinds = implemented_kinds()
    for plan in PLAN_FILES:
        doc, _lay = _layout(plan)
        assert {c["kind"] for c in doc["components"]} <= kinds


def test_pure_python_modules_do_not_import_blender():
    forbidden = {"bpy", "bmesh", "mathutils"}
    kit = os.path.join(BLENDER_DIR, "lowpoly_kit")
    files = [os.path.join(kit, "shapes.py")] + [
        os.path.join(kit, "components", f) for f in os.listdir(os.path.join(kit, "components")) if f.endswith(".py")
    ]
    for path in files:
        with open(path, encoding="utf-8") as handle:
            tree = ast.parse(handle.read())
        for node in ast.walk(tree):
            names = [a.name for a in node.names] if isinstance(node, ast.Import) else (
                [node.module] if isinstance(node, ast.ImportFrom) and node.module and node.level == 0 else [])
            assert not {n.split(".")[0] for n in names} & forbidden, (path, names)


def load_tests(loader, tests, pattern):  # noqa: ARG001
    suite = unittest.TestSuite()
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            suite.addTest(unittest.FunctionTestCase(fn, description=name))
    return suite
