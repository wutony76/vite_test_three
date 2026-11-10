"""Phase 4 驗收：Low Poly 小屋 + GLB 匯出。"""

import os
import tempfile

import bpy
import fixtures

from lowpoly_kit import api
from lowpoly_kit.export import glb_stats
from lowpoly_kit.presets import building

OUT_DIR = os.environ.get("LOWPOLY_TEST_OUT") or tempfile.mkdtemp(prefix="lowpoly_kit_")

SHELLS = ["Foundation", "Body", "Roof"]
OPENINGS = ["Door", "Window_FrontL", "Window_FrontR", "Window_SideR", "Window_SideL"]


def test_house_topology():
    built = building.build_house()
    assert built["root"] == "House_Root"
    root = bpy.data.objects["House_Root"]
    children = {c.name for c in root.children}
    assert children == set(SHELLS + OPENINGS), children
    assert "Chimney" not in bpy.context.scene.objects  # 已經 Union 進屋頂

    for name in SHELLS:
        result = api.validate_mesh_topology(name)
        checks = result["report"]["checks"]
        assert result["ok"], (name, result["errors"])
        assert checks["components"] == 1 and checks["is_closed"], name
        assert checks["non_manifold_edges"] == 0 and checks["flipped_faces"] == 0, name
    for name in OPENINGS:
        result = api.validate_mesh_topology(name)
        assert result["ok"], (name, result["errors"])
        assert result["report"]["profile"] == "opening"
        assert result["report"]["checks"]["flipped_faces"] == 0

    roof = bpy.data.objects["Roof"]
    assert {m.name for m in roof.data.materials} == {"LPK_Roof", "LPK_Brick"}
    assert all(not p.use_smooth for o in root.children for p in o.data.polygons)
    total = sum(len(o.data.polygons) for o in root.children)
    assert total < 300, total  # Low Poly：整棟小屋不到 300 個面


def test_house_glb_export():
    building.build_house()
    path = os.path.join(OUT_DIR, "lowpoly_house_test.glb")
    result = api.prepare_for_gltf("House_Root", path)
    assert result["ok"], result["errors"]
    stats = result["changes"]["export"]
    assert stats["root_nodes"] == ["House_Root"], stats
    assert stats["meshes"] == len(SHELLS) + len(OPENINGS)
    # Foundation/Body/Door 各 1、Roof 2（屋頂 + 煙囪磚）、窗戶各 2（框 + 玻璃）
    assert stats["primitives"] == 13, stats
    print("   GLB", path, stats)


def test_export_blocked_when_invalid():
    root = bpy.data.objects.new("Bad_Root", None)
    bpy.context.scene.collection.objects.link(root)
    obj = fixtures.joined_cubes("BadBody", [(0, 0, 0), (3, 0, 0)])
    obj.parent = root
    path = os.path.join(OUT_DIR, "should_not_exist.glb")
    result = api.prepare_for_gltf("Bad_Root", path)
    assert result["errors"][0]["code"] == "VALIDATION_FAILED"
    assert not os.path.exists(path)


def test_export_does_not_touch_selection():
    building.build_house()
    keep = bpy.data.objects["Door"]
    for o in bpy.context.view_layer.objects:
        o.select_set(o == keep)
    api.prepare_for_gltf("House_Root", os.path.join(OUT_DIR, "sel.glb"))
    selected = [o.name for o in bpy.context.view_layer.objects if o.select_get()]
    assert selected == ["Door"], selected


def test_glb_stats_on_project_room():
    stats = glb_stats(fixtures.PROJECT_ROOM_GLB)
    assert stats["meshes"] == 21 and stats["primitives"] == 71, stats
