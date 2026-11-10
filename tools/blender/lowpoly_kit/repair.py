"""安全的自動修復：只修「修了一定不會更糟」的問題。

修的項目：合併重複頂點、刪退化面、刪孤立點／孤立邊、把封閉 Mesh 的法線轉成朝外。
不修的項目：多出來的幾何島、非流形邊 —— 這些需要判斷「本來想做什麼」，
自動處理很可能把模型改壞，所以只回報，交給建模流程重做。
"""

import bmesh


def repair_bmesh(bm, merge_dist=1e-4, fix_normals=True):
    stats = {}

    count = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=merge_dist)
    stats["merged_verts"] = count - len(bm.verts)

    count = len(bm.faces)
    # dissolve_degenerate 處理邊長接近 0 的情況；三點共線這種「邊不短但面積為 0」的面另外刪
    bmesh.ops.dissolve_degenerate(bm, dist=merge_dist, edges=list(bm.edges))
    flat = [face for face in bm.faces if face.calc_area() < merge_dist * merge_dist]
    if flat:
        bmesh.ops.delete(bm, geom=flat, context="FACES")
    stats["removed_degenerate_faces"] = count - len(bm.faces)

    wire = [edge for edge in bm.edges if not edge.link_faces]
    if wire:
        bmesh.ops.delete(bm, geom=wire, context="EDGES")
    loose = [vert for vert in bm.verts if not vert.link_edges]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    stats["removed_wire_edges"] = len(wire)
    stats["removed_loose_verts"] = len(loose)

    bm.normal_update()
    closed = len(bm.edges) > 0 and all(len(edge.link_faces) == 2 for edge in bm.edges)
    if fix_normals and closed:
        before = [face.normal.copy() for face in bm.faces]
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.normal_update()
        stats["flipped_faces_fixed"] = sum(1 for f, n in zip(bm.faces, before) if f.normal.dot(n) < 0)
    else:
        # 開放的 Mesh 沒有內外之分，重算可能把海面整片翻到朝下，所以不動
        stats["flipped_faces_fixed"] = 0
        stats["normals_skipped"] = "open_mesh" if fix_normals else "disabled"
    return stats
