"""Boolean Union、Auto Repair、還原機制、Low Poly 最佳化、Voxel Remesh。"""

import bpy
import fixtures

from lowpoly_kit import api
from lowpoly_kit.backup import BACKUP_COLLECTION


def test_union_overlapping_cubes():
    fixtures.cube("A", profile="building_shell")
    fixtures.cube("B", center=(0.5, 0.5, 0.5))
    result = api.boolean_union_objects("A", ["B"])
    assert result["ok"], result["errors"]
    checks = result["report"]["checks"]
    assert checks["components"] == 1 and checks["non_manifold_edges"] == 0 and checks["is_closed"]
    assert checks["flipped_faces"] == 0
    # B 沒有被刪除，而是移到備份 collection
    assert "B" in bpy.data.objects
    assert bpy.data.objects["B"].users_collection[0].name == BACKUP_COLLECTION
    assert "B" not in bpy.context.scene.objects
    assert result["backup"] in bpy.data.meshes


def test_union_with_exact_solver():
    fixtures.cube("A", profile="building_shell")
    fixtures.cube("B", center=(0.5, 0, 0))
    result = api.boolean_union_objects("A", ["B"], solver="EXACT")
    assert result["ok"], result["errors"]
    assert result["changes"]["solver"] == "EXACT"


def test_union_non_overlapping_is_restored():
    """不相交的兩個方塊 Union 後仍是 2 個島：building_shell 不通過，要還原。"""
    fixtures.cube("A", profile="building_shell")
    fixtures.cube("B", center=(5, 0, 0))
    result = api.boolean_union_objects("A", ["B"])
    assert not result["ok"]
    assert result["errors"][0]["code"] in {"VALIDATION_FAILED", "BOOLEAN_EMPTY"}
    a = bpy.data.objects["A"]
    assert len(a.data.vertices) == 8 and len(a.data.polygons) == 6
    assert len(a.modifiers) == 0
    assert "B" in bpy.context.scene.objects  # 失敗時不能把 B 移走


def test_union_face_explosion_is_restored():
    fixtures.cube("A", profile="building_shell")
    fixtures.cube("B", center=(0.5, 0.5, 0.5))
    result = api.boolean_union_objects("A", ["B"], max_face_ratio=0.5)
    assert result["errors"][0]["code"] == "BOOLEAN_FACE_EXPLOSION"
    assert len(bpy.data.objects["A"].data.polygons) == 6
    assert bpy.data.objects["A"].data.name == "A"


def test_union_keeps_materials():
    verts, faces = fixtures.cube_geometry()
    api.create_connected_mesh("A", verts, faces, profile="building_shell", materials=[{"name": "Red", "color": (1, 0, 0)}])
    verts, faces = fixtures.cube_geometry(center=(0, 0, 0.6), size=0.5)  # 和 A 重疊 0.15
    api.create_connected_mesh("B", verts, faces, materials=[{"name": "Blue", "color": (0, 0, 1)}])
    result = api.boolean_union_objects("A", ["B"])
    assert result["ok"], result["errors"]
    assert {m.name for m in bpy.data.objects["A"].data.materials} == {"Red", "Blue"}


def test_union_rejects_self():
    fixtures.cube("A")
    assert api.boolean_union_objects("A", ["A"])["errors"][0]["code"] == "INVALID_ARGUMENT"


def test_repair_merges_duplicates():
    fixtures.joined_cubes("Touching", [(0, 0, 0), (1, 0, 0)])
    result = api.repair_mesh_topology("Touching")
    assert result["ok"], result["errors"]
    assert result["changes"]["merged_verts"] == 4
    after = api.validate_mesh_topology("Touching", profile="decoration")["report"]["checks"]
    assert after["components"] == 1 and after["duplicate_verts"] == 0


def test_repair_fixes_flipped_face():
    verts, faces = fixtures.cube_geometry()
    faces = list(faces)
    faces[0] = tuple(reversed(faces[0]))
    fixtures.raw_object("Flip", verts, faces)
    result = api.repair_mesh_topology("Flip", profile="building_shell")
    assert result["ok"], result["errors"]
    assert result["changes"]["flipped_faces_fixed"] == 1
    assert result["report"]["status"] == "pass"


def test_repair_removes_degenerate_and_loose():
    verts, faces = fixtures.cube_geometry()
    verts = list(verts) + [(5, 5, 5), (3, 0, 0), (4, 0, 0), (5, 0, 0)]
    faces = list(faces) + [(9, 10, 11)]
    fixtures.raw_object("Dirty", verts, faces)
    result = api.repair_mesh_topology("Dirty", profile="building_shell")
    assert result["ok"], result["errors"]
    assert result["changes"]["removed_degenerate_faces"] == 1
    assert len(bpy.data.objects["Dirty"].data.vertices) == 8


def test_repair_skips_normals_on_open_mesh():
    fixtures.plane("Sea")
    normal_before = bpy.data.objects["Sea"].data.polygons[0].normal.copy()
    result = api.repair_mesh_topology("Sea", profile="water_surface")
    assert result["ok"], result["errors"]
    assert result["changes"]["normals_skipped"] == "open_mesh"
    assert bpy.data.objects["Sea"].data.polygons[0].normal.dot(normal_before) > 0.99


def test_repair_dry_run_does_not_modify():
    fixtures.joined_cubes("Touching", [(0, 0, 0), (1, 0, 0)])
    result = api.repair_mesh_topology("Touching", dry_run=True)
    assert result["changes"]["dry_run"] and result["changes"]["merged_verts"] == 4
    assert len(bpy.data.objects["Touching"].data.vertices) == 16
    assert result["backup"] is None


def test_failed_validation_restores_original():
    """修完仍然不合格（兩個島）時要還原，頂點數必須和原本一樣。"""
    fixtures.joined_cubes("Two", [(0, 0, 0), (3, 0, 0)])
    result = api.repair_mesh_topology("Two", profile="building_shell")
    assert result["errors"][0]["code"] == "VALIDATION_FAILED"
    assert result["changes"]["restored"]
    obj = bpy.data.objects["Two"]
    assert len(obj.data.vertices) == 16 and obj.data.name == "Two"
    assert not any(m.name.startswith("Two__backup_") for m in bpy.data.meshes)


def test_clear_backups():
    fixtures.cube("C", profile="building_shell")
    api.extrude_mesh_region("C", {"normal": [0, 0, 1]}, depth=1)
    api.extrude_mesh_region("C", {"normal": [0, 0, 1]}, depth=1)
    assert sum(m.name.startswith("C__backup_") for m in bpy.data.meshes) == 2
    assert api.clear_backups("C") == 2


def test_optimize_dissolves_planar_edges():
    fixtures.subdivided_cube("Busy", cuts=2)
    result = api.optimize_lowpoly_mesh("Busy", profile="building_shell")
    assert result["ok"], result["errors"]
    mesh = bpy.data.objects["Busy"].data
    assert len(mesh.polygons) == 6 and len(mesh.vertices) == 8
    assert not any(p.use_smooth for p in mesh.polygons)


def test_remesh_rejected_for_building():
    fixtures.cube("House", profile="building_shell")
    result = api.remesh_organic_mesh("House", voxel_size=0.1)
    assert result["errors"][0]["code"] == "PROFILE_NOT_ALLOWED"
    assert len(bpy.data.objects["House"].data.polygons) == 6


def test_remesh_organic_rock():
    fixtures.cube("Rock", profile="organic")
    result = api.remesh_organic_mesh("Rock", voxel_size=0.25)
    assert result["ok"], result["errors"]
    assert result["report"]["checks"]["components"] == 1
    assert result["changes"]["faces"][1] > 6
