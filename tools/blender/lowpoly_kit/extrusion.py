"""Extrude / Inset / Bridge：在既有的 Mesh 上長出新的幾何，而不是另外加一個方塊。

全部使用 bmesh.ops，不使用 bpy.ops.mesh.*：
bpy.ops 需要進入編輯模式、依賴選取狀態與 viewport context，在 MCP／背景模式下不穩定。
"""

import bmesh
from mathutils import Vector

from .result import KitError


def select_faces(bm, faces):
    """依索引清單或條件挑出面。

    faces 可以是：
    - [0, 3, 5]：面的索引
    - {"normal": [0, -1, 0], "min_dot": 0.999, "bounds": [[x0,y0,z0],[x1,y1,z1]]}：
      法線朝向接近 normal、且面中心落在 bounds（區域座標）內的面
    """
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    if isinstance(faces, dict):
        target = Vector(faces["normal"]).normalized()
        min_dot = faces.get("min_dot", 0.999)
        bounds = faces.get("bounds")
        picked = []
        for face in bm.faces:
            if face.normal.dot(target) < min_dot:
                continue
            if bounds is not None:
                center = face.calc_center_median()
                if any(center[k] < bounds[0][k] - 1e-6 or center[k] > bounds[1][k] + 1e-6 for k in range(3)):
                    continue
            picked.append(face)
    else:
        try:
            picked = [bm.faces[i] for i in faces]
        except (IndexError, TypeError) as exc:
            raise KitError("INVALID_ARGUMENT", f"面的索引不合法：{faces!r}") from exc
    if not picked:
        raise KitError("NO_FACES_SELECTED", f"條件 {faces!r} 沒有選到任何面")
    return picked


def _average_normal(faces):
    total = Vector((0.0, 0.0, 0.0))
    for face in faces:
        total += face.normal * face.calc_area()
    if total.length < 1e-9:
        raise KitError("INVALID_GEOMETRY", "選取的面法線互相抵消，無法決定擠出方向")
    return total.normalized()


def extrude(bm, faces, depth, individual=False):
    """把面沿法線擠出 depth（負值往內推）。回傳擠出後的頂面。"""
    if individual:
        # 每個面各自擠出，方向用自己的法線
        result = bmesh.ops.extrude_discrete_faces(bm, faces=faces)
        new_faces = result["faces"]
        for face in new_faces:
            bmesh.ops.translate(bm, vec=face.normal * depth, verts=list(face.verts))
    else:
        # 整片區域一起擠出，相鄰的面之間不會裂開
        direction = _average_normal(faces)
        result = bmesh.ops.extrude_face_region(bm, geom=faces)
        new_verts = [g for g in result["geom"] if isinstance(g, bmesh.types.BMVert)]
        new_faces = [g for g in result["geom"] if isinstance(g, bmesh.types.BMFace)]
        bmesh.ops.translate(bm, vec=direction * depth, verts=new_verts)
    # 原本的面留著會變成蓋在內部的多餘面（non-manifold），要刪掉
    leftovers = [face for face in faces if face.is_valid]
    if leftovers:
        inner_edges = {edge for face in leftovers for edge in face.edges}
        bmesh.ops.delete(bm, geom=leftovers, context="FACES_ONLY")
        # 一次擠出多個相鄰的面時，它們之間的內部邊在刪面後不再屬於任何面，會變成孤立邊；
        # 只擠出單一面時不會發生（它的邊都還接著側壁），所以要另外清掉
        wire = [edge for edge in inner_edges if edge.is_valid and not edge.link_faces]
        if wire:
            loose = {v for edge in wire for v in edge.verts}
            bmesh.ops.delete(bm, geom=wire, context="EDGES")
            stray = [v for v in loose if v.is_valid and not v.link_edges]
            if stray:
                bmesh.ops.delete(bm, geom=stray, context="VERTS")
    return new_faces


def inset(bm, faces, thickness, depth=0.0, individual=False):
    """往內縮出一圈邊框。回傳內側的面（就是原本選取的那些面）。"""
    if individual:
        bmesh.ops.inset_individual(bm, faces=faces, thickness=thickness, depth=depth, use_even_offset=True)
    else:
        bmesh.ops.inset_region(bm, faces=faces, thickness=thickness, depth=depth, use_even_offset=True)
    return faces


def bridge(bm, faces):
    """刪掉兩組面，再用側面把它們的邊界連起來（例如把兩個分開的方塊接成一條通道）。"""
    selected = set(faces)
    # 區域的邊界邊：只被一個「選取的面」使用的邊
    edges = [
        edge for edge in {e for f in faces for e in f.edges}
        if sum(1 for f in edge.link_faces if f in selected) == 1
    ]
    bmesh.ops.delete(bm, geom=list(faces), context="FACES_ONLY")
    try:
        result = bmesh.ops.bridge_loops(bm, edges=edges)
    except (ValueError, RuntimeError) as exc:
        raise KitError("INVALID_GEOMETRY", f"bridge 失敗，選取的面需要形成兩個邊數相同的邊界：{exc}") from exc
    return result["faces"]


def run(bm, faces, mode, depth=0.0, thickness=0.0, individual=False, material_index=None):
    """依 mode 執行，回傳統計資訊。"""
    picked = select_faces(bm, faces)
    before = len(bm.faces)
    if mode == "extrude":
        result_faces = extrude(bm, picked, depth, individual)
    elif mode == "inset":
        result_faces = inset(bm, picked, thickness, 0.0, individual)
    elif mode == "inset_extrude":
        # 先縮出邊框，再把內側的面推進去／拉出來：窗框、門板、煙囪口都用這招
        inner = inset(bm, picked, thickness, 0.0, individual)
        result_faces = extrude(bm, inner, depth, individual)
    elif mode == "bridge":
        result_faces = bridge(bm, picked)
    else:
        raise KitError("INVALID_ARGUMENT", f"不支援的 mode：{mode!r}（extrude / inset / inset_extrude / bridge）")

    if material_index is not None:
        for face in result_faces:
            if face.is_valid:
                face.material_index = material_index
    for face in bm.faces:
        face.smooth = False
    return {"mode": mode, "selected_faces": len(picked), "faces_added": len(bm.faces) - before}
