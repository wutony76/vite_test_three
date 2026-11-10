"""測試用的幾何。刻意繞過 create_connected_mesh 的法線修正，才能做出「壞掉的」模型。"""

import os

import bpy

from lowpoly_kit import mesh_builder

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PROJECT_ROOM_GLB = os.path.join(REPO_ROOT, "public", "models", "project_room", "project_room.glb")


def raw_object(name, verts, faces):
    """直接 from_pydata，不做任何清理或法線修正。"""
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def cube_geometry(center=(0, 0, 0), size=1.0):
    h = size / 2
    cx, cy, cz = center
    return mesh_builder.box((cx - h, cy - h, cz - h), (cx + h, cy + h, cz + h))


def cube(name, center=(0, 0, 0), size=1.0, profile=None):
    verts, faces = cube_geometry(center, size)
    obj, _ = mesh_builder.create_mesh_object(name, verts, faces)
    if profile:
        obj["lowpoly_profile"] = profile
    return obj


def joined_cubes(name, centers, size=1.0):
    """把多個方塊的頂點和面放進同一個 Mesh：等同 primitive 堆疊後按 Ctrl+J。"""
    verts, faces = [], []
    for center in centers:
        v, f = cube_geometry(center, size)
        offset = len(verts)
        verts += v
        faces += [tuple(i + offset for i in face) for face in f]
    return raw_object(name, verts, faces)


def plane(name, size=2.0):
    h = size / 2
    return raw_object(name, [(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0)], [(0, 1, 2, 3)])


def subdivided_cube(name, cuts=2):
    import bmesh

    obj = cube(name)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=cuts, use_grid_fill=True)
    bm.to_mesh(obj.data)
    bm.free()
    return obj
