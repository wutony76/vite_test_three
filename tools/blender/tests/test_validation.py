"""Connected Components 與 Topology Validator。"""

import os

import bpy
import fixtures

from lowpoly_kit import api
from lowpoly_kit.validation import PROFILES


def _checks(result):
    return result["report"]["checks"]


def test_joined_cubes_are_two_components():
    fixtures.joined_cubes("Joined", [(0, 0, 0), (3, 0, 0)])
    result = api.validate_mesh_topology("Joined", profile="building_shell")
    assert _checks(result)["components"] == 2
    assert _checks(result)["non_manifold_edges"] == 0  # 舊的檢查方式會誤以為沒問題
    assert not result["ok"]
    assert result["errors"][0]["code"] == "VALIDATION_FAILED"
    assert len(_checks(result)["islands"]) == 2


def test_touching_cubes_without_shared_verts_are_still_two():
    """視覺上貼在一起、頂點位置重疊，但沒有共用頂點：合併前 2 個島，合併後 1 個。"""
    fixtures.joined_cubes("Touching", [(0, 0, 0), (1, 0, 0)])
    checks = _checks(api.validate_mesh_topology("Touching", profile="decoration"))
    assert checks["components"] == 2
    assert checks["components_after_merge"] == 1
    assert checks["duplicate_verts"] == 4


def test_single_cube_passes_building_shell():
    fixtures.cube("Cube")
    result = api.validate_mesh_topology("Cube", profile="building_shell")
    assert result["ok"], result["errors"]
    assert result["report"]["status"] == "pass"
    checks = _checks(result)
    assert checks["components"] == 1 and checks["is_closed"]
    assert checks["flipped_faces"] == 0 and checks["inconsistent_normal_edges"] == 0


def test_flipped_face_is_detected():
    verts, faces = fixtures.cube_geometry()
    faces = list(faces)
    faces[2] = tuple(reversed(faces[2]))
    fixtures.raw_object("Flipped", verts, faces)
    result = api.validate_mesh_topology("Flipped", profile="building_shell")
    checks = _checks(result)
    assert checks["flipped_faces"] == 1
    assert checks["inconsistent_normal_edges"] == 4
    assert not result["ok"]


def test_inside_out_cube_is_detected():
    verts, faces = fixtures.cube_geometry()
    fixtures.raw_object("InsideOut", verts, [tuple(reversed(f)) for f in faces])
    checks = _checks(api.validate_mesh_topology("InsideOut"))
    assert checks["flipped_faces"] == 6
    assert checks["inconsistent_normal_edges"] == 0  # 全部一起反，相鄰面之間仍一致


def test_open_plane_profiles():
    fixtures.plane("Sea")
    water = api.validate_mesh_topology("Sea", profile="water_surface")
    assert water["ok"], water["errors"]
    shell = api.validate_mesh_topology("Sea", profile="building_shell")
    assert not shell["ok"]
    assert any(i["check"] == "boundary_edges" for i in shell["report"]["issues"])


def test_degenerate_face_is_detected():
    fixtures.raw_object("Sliver", [(0, 0, 0), (1, 0, 0), (2, 0, 0)], [(0, 1, 2)])
    checks = _checks(api.validate_mesh_topology("Sliver", profile="decoration"))
    assert checks["degenerate_faces"] == 1


def test_loose_vertex_is_detected():
    verts, faces = fixtures.cube_geometry()
    fixtures.raw_object("Loose", list(verts) + [(5, 5, 5)], faces)
    result = api.validate_mesh_topology("Loose", profile="building_shell")
    assert _checks(result)["loose_verts"] == 1
    assert not result["ok"]


def test_ngon_is_warning_only():
    verts = [(0, 0, 0), (1, 0, 0), (1.5, 1, 0), (0.5, 1.6, 0), (-0.5, 1, 0)]
    top = [(x, y, 1) for x, y, _ in verts]
    faces = [(4, 3, 2, 1, 0), (5, 6, 7, 8, 9)] + [(i, (i + 1) % 5, (i + 1) % 5 + 5, i + 5) for i in range(5)]
    fixtures.raw_object("Penta", verts + top, faces)
    result = api.validate_mesh_topology("Penta", profile="building_shell")
    assert result["ok"], result["errors"]
    assert result["report"]["status"] == "warn"
    assert _checks(result)["ngons"] == 2


def test_profile_from_custom_property_and_unknown_profile():
    fixtures.plane("Pond")["lowpoly_profile"] = "water_surface"
    assert api.validate_mesh_topology("Pond")["ok"]
    bad = api.validate_mesh_topology("Pond", profile="nope")
    assert bad["errors"][0]["code"] == "UNKNOWN_PROFILE"


def test_missing_and_non_mesh_objects():
    assert api.validate_mesh_topology("Nothing")["errors"][0]["code"] == "OBJECT_NOT_FOUND"
    empty = bpy.data.objects.new("JustEmpty", None)
    bpy.context.scene.collection.objects.link(empty)
    assert api.validate_mesh_topology("JustEmpty")["errors"][0]["code"] == "NOT_A_MESH"


def test_all_profiles_have_required_keys():
    for name, rule in PROFILES.items():
        assert {"components", "allow_boundary", "normals", "ngon", "remesh"} <= set(rule), name


def test_project_room_glb_islands():
    """現有的 project_room.glb：屋頂應該被抓出 18 個幾何島。"""
    assert os.path.exists(fixtures.PROJECT_ROOM_GLB), fixtures.PROJECT_ROOM_GLB
    bpy.ops.import_scene.gltf(filepath=fixtures.PROJECT_ROOM_GLB)
    expected = {"Roof": 18, "Chimney": 8, "Walls_Main": 3}
    for name, islands in expected.items():
        checks = _checks(api.validate_mesh_topology(name, profile="building_shell"))
        # glTF 匯入時，平面著色的頂點會依面拆開，所以看合併重複頂點後的島數
        assert checks["components_after_merge"] == islands, (name, checks["components_after_merge"])
