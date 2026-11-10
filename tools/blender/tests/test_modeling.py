"""Custom Mesh Builder 與 Extrude / Inset / Bridge。"""

import bpy
import fixtures

from lowpoly_kit import api, mesh_builder


def test_l_shaped_prism_is_one_closed_component():
    outline = [(0, 0), (3, 0), (3, 1), (1, 1), (1, 3), (0, 3)]
    verts, faces = mesh_builder.prism_from_outline(outline, 0, 2, cap_faces=[[0, 1, 2, 3], [0, 3, 4, 5]])
    result = api.create_connected_mesh("LShape", verts, faces, profile="building_shell")
    assert result["ok"], result["errors"]
    checks = result["report"]["checks"]
    assert checks["components"] == 1 and checks["is_closed"] and checks["ngons"] == 0
    assert bpy.data.objects["LShape"]["lowpoly_profile"] == "building_shell"


def test_reversed_winding_is_fixed_on_create():
    verts, faces = fixtures.cube_geometry()
    result = api.create_connected_mesh("Rev", verts, [tuple(reversed(f)) for f in faces], profile="building_shell")
    assert result["ok"], result["errors"]
    assert result["report"]["checks"]["flipped_faces"] == 0


def test_create_rejects_bad_indices():
    result = api.create_connected_mesh("Bad", [(0, 0, 0), (1, 0, 0), (0, 1, 0)], [(0, 1, 7)])
    assert result["errors"][0]["code"] == "INVALID_GEOMETRY"


def test_create_keeps_material_indices():
    verts, faces = fixtures.cube_geometry()
    result = api.create_connected_mesh(
        "TwoMat", verts, faces, profile="building_shell",
        materials=[{"name": "A", "color": (1, 0, 0)}, {"name": "B", "color": (0, 0, 1)}],
        material_indices=[0, 1, 0, 0, 0, 0],
    )
    assert result["ok"], result["errors"]
    mesh = bpy.data.objects["TwoMat"].data
    assert [m.name for m in mesh.materials] == ["A", "B"]
    assert sorted(p.material_index for p in mesh.polygons) == [0, 0, 0, 0, 0, 1]


def test_extrude_top_face_stays_connected():
    fixtures.cube("Tower", profile="building_shell")
    result = api.extrude_mesh_region("Tower", {"normal": [0, 0, 1]}, mode="extrude", depth=2.0)
    assert result["ok"], result["errors"]
    checks = result["report"]["checks"]
    assert checks["components"] == 1 and checks["is_closed"]
    assert result["changes"]["faces"] == [6, 10]
    top = max(v.co.z for v in bpy.data.objects["Tower"].data.vertices)
    assert abs(top - 2.5) < 1e-5


def test_individual_extrude():
    fixtures.cube("Spiky", profile="building_shell")
    result = api.extrude_mesh_region("Spiky", [0, 1], mode="extrude", depth=0.5, individual=True)
    assert result["ok"], result["errors"]
    assert result["report"]["checks"]["components"] == 1


def test_inset_extrude_window_recess():
    fixtures.cube("Wall", profile="building_shell")
    result = api.extrude_mesh_region(
        "Wall", {"normal": [0, -1, 0]}, mode="inset_extrude", thickness=0.15, depth=-0.1,
    )
    assert result["ok"], result["errors"]
    checks = result["report"]["checks"]
    assert checks["components"] == 1 and checks["non_manifold_edges"] == 0 and checks["is_closed"]
    # 正面的框 4 個 + 凹槽側壁 4 個 + 底 1 個，取代原本 1 個面
    assert result["changes"]["faces"] == [6, 14]
    assert abs(min(v.co.y for v in bpy.data.objects["Wall"].data.vertices) + 0.5) < 1e-5


def test_inset_only():
    fixtures.cube("Panel", profile="building_shell")
    result = api.extrude_mesh_region("Panel", {"normal": [0, 0, 1]}, mode="inset", thickness=0.1)
    assert result["ok"], result["errors"]
    assert result["changes"]["faces"] == [6, 10]


def test_bridge_connects_two_islands():
    """兩個分開的方塊：刪掉相對的面，用側面接起來，變成一個連續的封閉幾何。"""
    fixtures.joined_cubes("Pair", [(0, 0, 0), (3, 0, 0)])
    before = api.validate_mesh_topology("Pair", profile="decoration")
    assert before["report"]["checks"]["components"] == 2
    pair = bpy.data.objects["Pair"]
    # 選兩個相對的面（左方塊的 +X 面、右方塊的 -X 面）再 bridge
    faces = [p.index for p in pair.data.polygons
             if (abs(p.center.x - 0.5) < 1e-4 and p.normal.x > 0.9) or (abs(p.center.x - 2.5) < 1e-4 and p.normal.x < -0.9)]
    assert len(faces) == 2, faces
    bridged = api.extrude_mesh_region("Pair", faces, mode="bridge", profile="building_shell")
    assert bridged["ok"], bridged["errors"]
    assert bridged["report"]["checks"]["components"] == 1


def test_no_faces_selected_keeps_mesh():
    fixtures.cube("Same", profile="building_shell")
    result = api.extrude_mesh_region("Same", {"normal": [0, 0, 1], "bounds": [[5, 5, 5], [6, 6, 6]]}, depth=1)
    assert result["errors"][0]["code"] == "NO_FACES_SELECTED"
    assert len(bpy.data.objects["Same"].data.polygons) == 6


def test_invalid_mode():
    fixtures.cube("Mode", profile="building_shell")
    result = api.extrude_mesh_region("Mode", [0], mode="twist")
    assert result["errors"][0]["code"] == "INVALID_ARGUMENT"
    assert len(bpy.data.objects["Mode"].data.polygons) == 6
