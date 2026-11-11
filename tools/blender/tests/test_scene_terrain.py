"""場景幾何（地形、道路、外框）與 ScenePlan schema 擴充的測試。不需要 Blender：

    python3 -m unittest discover -s tools/blender/tests -p "test_scene_terrain.py"
"""

import copy
import json
import math
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

from lowpoly_kit import shapes  # noqa: E402
from lowpoly_kit.pipeline import validate_plan  # noqa: E402
from lowpoly_kit.scene.terrain import (  # noqa: E402
    Footprint, TerrainField, distance_to_polyline, footprint_of, footprints_overlap, road_mesh, terrain_mesh,
)

PLANS = os.path.join(os.path.dirname(HERE), "plans")
TERRAIN = {"kind": "grid_hills", "size": [40, 40], "params": {"amplitude": 2.0, "seed": 3, "resolution": 16,
                                                              "flatten_margin": 3.0}}


def test_height_field_is_deterministic_and_has_hills():
    a, b = TerrainField(TERRAIN), TerrainField(TERRAIN)
    points = [(x, y) for x in range(-15, 16, 5) for y in range(-15, 16, 5)]
    heights = [a.height(x, y) for x, y in points]
    assert heights == [b.height(x, y) for x, y in points]
    assert max(heights) > 0.5 and min(heights) >= 0.0


def test_flat_under_buildings_and_roads():
    zone = Footprint(5, 5, 2, 3, math.radians(30))
    road = ([(-20, -5), (20, -5)], 1.5)
    field = TerrainField(TERRAIN, [zone], [road])
    assert max(field.height(x, y) for x, y in zone.samples()) == 0.0
    assert all(field.height(x, -5) == 0.0 for x in range(-18, 19, 3))
    # 遠離建築與道路的地方仍有起伏
    assert max(field.height(x, 15) for x in range(-18, 19, 2)) > 0.3


def test_flat_terrain_kind():
    field = TerrainField({"kind": "flat", "size": [10, 10]})
    assert field.height(3, 3) == 0.0


def test_terrain_and_road_meshes_are_single_islands():
    field = TerrainField(TERRAIN)
    grid = shapes.topology_stats(terrain_mesh(field, "g"))
    assert grid["islands"] == 1 and grid["non_manifold_edges"] == 0 and grid["faces"] == 16 * 16
    road = shapes.topology_stats(road_mesh([(0, 0), (10, 0), (10, 10)], 2.0, "r"))
    assert road["islands"] == 1 and road["non_manifold_edges"] == 0 and road["degenerate_faces"] == 0


def test_road_normals_point_up():
    data = road_mesh([(0, 0), (5, 0)], 2.0, "r")
    v = data.verts
    for a, b, c, _d in data.faces:
        ux, uy = v[b][0] - v[a][0], v[b][1] - v[a][1]
        wx, wy = v[c][0] - v[a][0], v[c][1] - v[a][1]
        assert ux * wy - uy * wx > 0  # 法線 z 分量為正：從上面看得到路面


def test_footprint_overlap_sat():
    a = Footprint(0, 0, 2, 1, 0.0)
    assert footprints_overlap(a, Footprint(3, 0, 2, 1, 0.0))          # 重疊 1 m
    assert not footprints_overlap(a, Footprint(4.5, 0, 2, 1, 0.0))    # 分開
    # 旋轉 45° 的方塊：外接框重疊但實際不重疊（只比外接框的作法會誤判）
    assert not footprints_overlap(Footprint(0, 0, 1, 1, 0.0), Footprint(2.6, 2.6, 1, 1, math.radians(45)))


def test_distance_to_polyline_and_footprint():
    assert distance_to_polyline(5, 3, [(0, 0), (10, 0)]) == 3.0
    assert distance_to_polyline(-2, 0, [(0, 0), (10, 0)]) == 2.0
    fp = footprint_of({"w": 4, "d": 2}, (10, 0, 0), 90, 1.0)   # 轉 90° 後寬深對調
    assert fp.contains(10, 1.9) and not fp.contains(11.5, 0)


def test_sample_town_plan_valid():
    result = validate_plan(os.path.join(PLANS, "sample_town.scene.json"))
    assert result["ok"], result["errors"]


def test_scene_schema_extensions():
    with open(os.path.join(PLANS, "sample_town.scene.json"), encoding="utf-8") as handle:
        scene = json.load(handle)
    broken = copy.deepcopy(scene)
    broken["terrain"]["material"] = "lava"
    broken["roads"][0]["material"] = "gold"
    broken["terrain"]["params"]["resolution"] = 500
    broken["export"]["path"] = "town.gltf"
    paths = {e["path"] for e in validate_plan(broken, base_dir=PLANS)["errors"]}
    assert {"terrain.material", "roads[0].material", "terrain.params.resolution", "export.path"} <= paths, paths


def load_tests(loader, tests, pattern):  # noqa: ARG001
    suite = unittest.TestSuite()
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            suite.addTest(unittest.FunctionTestCase(fn, description=name))
    return suite
