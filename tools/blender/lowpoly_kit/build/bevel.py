"""Bevel：把銳利的稜角切出一條小斜面。

卡通風格的「精緻感」很大一部分來自這條斜面：它會接到光，在每個轉角留下一道亮邊。
沒有 bevel 的方塊，兩個面在轉角硬接，看起來像紙板。

只挑「兩側面夾角大於門檻」的邊：同一個平面上被格線切開的邊（夾角 0）不倒角，
否則牆面上會出現一條條不該有的溝。
"""

import math

import bmesh
import bpy

from ..validation.checks import count_self_intersections


def bevel_width(size, minimum=0.004, maximum=0.025, ratio=0.06):
    """寬度依物件最小尺寸縮放：大牆 2.5 cm、細窗框幾 mm，避免小零件被削掉一半。"""
    return max(minimum, min(maximum, ratio * min(size)))


def _self_intersections(bm):
    merged = bm.copy()
    try:
        bmesh.ops.remove_doubles(merged, verts=list(merged.verts), dist=1e-4)
        return count_self_intersections(merged, same_island_only=True)
    finally:
        merged.free()


def bevel_mesh_safe(mesh, width, segments, angle_deg=30.0, attempts=3):
    """倒角後自我交叉變多，就換回原本的 mesh、寬度減半再試；全部失敗就不倒角。

    clamp_overlap 只看相鄰的邊，擋不住「兩條很近、但不相鄰的稜線」各自往內切而互相穿過
    （例如窗洞邊緣和旁邊 4 cm 的格線，wobble 後距離更近）。用結果來判斷最可靠。
    回傳實際使用的寬度（0 表示沒有倒角）。
    """
    if segments <= 0 or width <= 0:
        return 0.0
    probe = bmesh.new()
    probe.from_mesh(mesh)
    baseline = _self_intersections(probe)
    probe.free()
    original = mesh.copy()
    try:
        for _ in range(attempts):
            bevel_mesh(mesh, width, segments, angle_deg)
            check = bmesh.new()
            check.from_mesh(mesh)
            worse = _self_intersections(check) > baseline
            check.free()
            if not worse:
                return width
            _restore(mesh, original)
            width /= 2
        return 0.0
    finally:
        bpy.data.meshes.remove(original)


def _restore(mesh, source):
    bm = bmesh.new()
    try:
        bm.from_mesh(source)
        bm.to_mesh(mesh)
        mesh.update()
    finally:
        bm.free()


def bevel_mesh(mesh, width, segments, angle_deg=30.0):
    if segments <= 0 or width <= 0:
        return 0
    limit = math.radians(angle_deg)
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bm.normal_update()
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > limit]
        if not edges:
            return 0
        verts = list({v for e in edges for v in e.verts})
        bmesh.ops.bevel(
            bm, geom=verts + edges, offset=width, offset_type="OFFSET", profile_type="SUPERELLIPSE",
            segments=segments, profile=0.5, affect="EDGES",
            # clamp_overlap：寬度大於相鄰邊長時自動縮小，避免斜面互相穿過
            clamp_overlap=True,
            # material=-1：斜面沿用相鄰面的材質；bmesh 預設 0 會把所有斜面改成第一個材質
            material=-1,
        )
        for face in bm.faces:
            face.smooth = False
        bm.to_mesh(mesh)
        mesh.update()
        return len(edges)
    finally:
        bm.free()
