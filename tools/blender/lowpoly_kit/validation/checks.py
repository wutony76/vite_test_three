"""9 項拓撲檢查。只讀，不會修改任何 Mesh。

所有計算都在 bmesh 副本上進行。需要「合併重複頂點後」的數值時，
也是在另一份副本上 remove_doubles，原本的資料完全不動。
"""

import bmesh
import bpy
from mathutils.bvhtree import BVHTree


def load_bmesh(obj, evaluated=True):
    """讀出 obj 的幾何。evaluated=True 時包含 modifier 的結果（匯出時看到的就是這份）。"""
    if obj.mode == "EDIT":
        obj.update_from_editmode()
    bm = bmesh.new()
    if evaluated and len(obj.modifiers) > 0:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        bm.from_object(obj, depsgraph)
    else:
        bm.from_mesh(obj.data)
    bm.normal_update()
    return bm


def find_islands(bm):
    """Connected Components：沿著邊做 DFS，回傳每個幾何島的頂點清單。

    兩個頂點只要能沿著邊走到彼此，就屬於同一個島。
    多個 primitive 只用 Join 合成一個 Object 時，彼此之間沒有共用的邊，
    所以會被算成多個島 —— 這正是「看起來相連、其實沒連」的情況。
    """
    bm.verts.index_update()
    seen = [False] * len(bm.verts)
    islands = []
    for start in bm.verts:
        if seen[start.index]:
            continue
        seen[start.index] = True
        stack = [start]
        members = []
        while stack:
            vert = stack.pop()
            members.append(vert)
            for edge in vert.link_edges:
                other = edge.other_vert(vert)
                if not seen[other.index]:
                    seen[other.index] = True
                    stack.append(other)
        islands.append(members)
    return islands


def describe_islands(islands, matrix, limit=20):
    """每個島的頂點數、面數與世界座標 bounding box，用來定位是哪一塊沒接上。"""
    described = []
    for members in sorted(islands, key=len, reverse=True)[:limit]:
        points = [matrix @ vert.co for vert in members]
        faces = {face for vert in members for face in vert.link_faces}
        described.append({
            "verts": len(members),
            "faces": len(faces),
            "bbox_min": [round(min(p[axis] for p in points), 4) for axis in range(3)],
            "bbox_max": [round(max(p[axis] for p in points), 4) for axis in range(3)],
        })
    return described


def is_closed(bm):
    """每條邊剛好接兩個面 = 封閉（watertight）。"""
    return len(bm.edges) > 0 and all(len(edge.link_faces) == 2 for edge in bm.edges)


def count_inconsistent_winding(bm):
    """相鄰兩個面的頂點繞行方向不一致的邊數。

    一致的情況下，兩個面走過共用邊的方向相反（A→B 與 B→A）。
    如果兩個 loop 都從同一個頂點出發，代表其中一個面的法線是反的。
    """
    bad = 0
    for edge in bm.edges:
        loops = edge.link_loops
        if len(loops) == 2 and loops[0].vert == loops[1].vert:
            bad += 1
    return bad


def count_flipped_faces(bm):
    """封閉 Mesh 中法線朝內的面數：重算一次外向法線，和原本比較。"""
    tmp = bm.copy()
    tmp.normal_update()
    before = [face.normal.copy() for face in tmp.faces]
    bmesh.ops.recalc_face_normals(tmp, faces=list(tmp.faces))
    tmp.normal_update()
    flipped = sum(1 for face, normal in zip(tmp.faces, before) if face.normal.dot(normal) < 0)
    tmp.free()
    return flipped


def count_self_intersections(bm, same_island_only=False):
    """互相穿過的面對數（不含共用頂點的相鄰面）。

    沒有開放邊、沒有非流形邊的 mesh 仍然可能「自己穿過自己」：
    例如兩個交叉的方塊 Join 在一起，或 bevel 寬度太大讓斜面互相穿過。
    這種 mesh 在 Boolean、匯出後的陰影都會出問題，只看邊的檢查抓不到。
    """
    if not bm.faces:
        return 0
    bm.faces.ensure_lookup_table()
    island_of = {}
    if same_island_only:
        # 只算同一個島內部的交叉：多島零件（窗框 + 窗台、花盆 + 葉團）的島之間本來就刻意重疊
        for index, members in enumerate(find_islands(bm)):
            for vert in members:
                island_of[vert.index] = index
    tree = BVHTree.FromBMesh(bm, epsilon=0.0)
    count = 0
    for a, b in tree.overlap(tree):
        if a >= b:
            continue
        if same_island_only and island_of[bm.faces[a].verts[0].index] != island_of[bm.faces[b].verts[0].index]:
            continue
        # 相鄰的面共用頂點，本來就互相接觸，不算交叉
        if {v.index for v in bm.faces[a].verts} & {v.index for v in bm.faces[b].verts}:
            continue
        count += 1
    return count


def run_all_checks(obj, merge_dist=1e-4, evaluated=True, island_limit=20):
    bm = load_bmesh(obj, evaluated)
    merged = None
    try:
        sides = [len(face.verts) for face in bm.faces]
        edge_face_counts = [len(edge.link_faces) for edge in bm.edges]
        area_eps = merge_dist * merge_dist

        degenerate = 0
        for face in bm.faces:
            if face.calc_area() < area_eps or any(e.calc_length() < merge_dist for e in face.edges):
                degenerate += 1

        islands = find_islands(bm)

        # 合併重複頂點後再算一次：用來區分「真的沒接上」和「只是頂點重複」
        merged = bm.copy()
        bmesh.ops.remove_doubles(merged, verts=list(merged.verts), dist=merge_dist)
        merged.normal_update()
        closed_after_merge = is_closed(merged)

        return {
            "verts": len(bm.verts),
            "edges": len(bm.edges),
            "faces": len(bm.faces),
            "triangles": sum(n - 2 for n in sides),
            "tris": sides.count(3),
            "quads": sides.count(4),
            "ngons": sum(1 for n in sides if n > 4),
            # 一條邊接了 3 個以上的面：不可能是實體表面，匯出、Boolean 都會出問題
            "non_manifold_edges": sum(1 for n in edge_face_counts if n > 2),
            # 只接 1 個面的邊：Mesh 有開口（海面、單面玻璃是合法的）
            "boundary_edges": sum(1 for n in edge_face_counts if n == 1),
            "loose_edges": sum(1 for n in edge_face_counts if n == 0),
            "loose_verts": sum(1 for vert in bm.verts if not vert.link_edges),
            "duplicate_verts": len(bm.verts) - len(merged.verts),
            "degenerate_faces": degenerate,
            "components": len(islands),
            "components_after_merge": len(find_islands(merged)),
            "islands": describe_islands(islands, obj.matrix_world, island_limit),
            "is_closed": is_closed(bm),
            "is_closed_after_merge": closed_after_merge,
            "inconsistent_normal_edges": count_inconsistent_winding(merged),
            # 開放的 Mesh 沒有「內外」可言，不判定朝向，回傳 None
            "flipped_faces": count_flipped_faces(merged) if closed_after_merge else None,
            "has_modifiers": len(obj.modifiers) > 0 and evaluated,
            "self_intersections": count_self_intersections(merged),
            "self_intersections_within_islands": count_self_intersections(merged, same_island_only=True),
            # pole：接了 6 條以上邊的頂點，只回報數值（low poly 的尖頂、扇形端面本來就會有）
            "poles": sum(1 for vert in merged.verts if len(vert.link_edges) >= 6),
            "scale": [round(s, 4) for s in obj.scale],
            "negative_scale": any(s < 0 for s in obj.scale),
            "nonuniform_scale": max(abs(s) for s in obj.scale) - min(abs(s) for s in obj.scale) > 1e-4,
        }
    finally:
        bm.free()
        if merged is not None:
            merged.free()
