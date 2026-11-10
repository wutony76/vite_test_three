"""Low Poly 最佳化：溶掉共平面上多餘的邊，並設定 Flat Shading。

只處理「平的地方被切太細」的情況，不做減面（Decimate）：
減面會改變形狀、破壞清楚的稜角，和 Low Poly 的目標相反。
"""

import math

import bmesh


def optimize_bmesh(bm, planar_angle_deg=1.0, shade_flat=True):
    faces_before = len(bm.faces)
    verts_before = len(bm.verts)
    angle = math.radians(planar_angle_deg)
    # delimit：不同材質、UV 縫線、標記為銳利的邊即使共平面也保留，不然材質邊界會消失
    try:
        bmesh.ops.dissolve_limit(
            bm, angle_limit=angle, use_dissolve_boundaries=False,
            verts=list(bm.verts), edges=list(bm.edges),
            delimit={"MATERIAL", "SEAM", "SHARP", "UV"},
        )
    except TypeError:
        bmesh.ops.dissolve_limit(
            bm, angle_limit=angle, use_dissolve_boundaries=False,
            verts=list(bm.verts), edges=list(bm.edges), delimit={"MATERIAL"},
        )
    if shade_flat:
        for face in bm.faces:
            face.smooth = False
    return {
        "faces_removed": faces_before - len(bm.faces),
        "verts_removed": verts_before - len(bm.verts),
    }
