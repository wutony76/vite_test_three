"""手繪感：依頂點位置做固定的小幅偏移（參考圖是水彩手繪，直線太完美反而不像）。

偏移量由「世界座標的 x、z」的雜湊決定，不是由頂點索引決定：
牆頂和女兒牆壓頂在同一個位置的頂點，不論屬於哪個 Object，都會移到同一個地方，接縫不會裂開；
沿 y 擠出的結構（門窗凹槽、磚面凹槽）整條一起移動，不會被扭壞。
只動 x、z，不動 y：貼在牆面上的橫樑、柱子不會和牆面分開；地面（z≈0）的頂點也不動 z，才不會陷進地裡。
"""

import struct
import zlib


def offset(x, y, z, seed, amplitude):
    # 雜湊只用 (x, z)，不含 y：同一條 x、z 線上的頂點（正面、凹槽底、背面）一起移動。
    # 少了這點，1.5 cm 深的凹槽口和槽底會被推往不同方向（偏移最多 2 cm），台階面翻折、自我交叉
    # （Phase 4 的自我交叉檢查抓到的）。
    key = struct.pack("<2i", round(x * 1e4), round(z * 1e4))
    h = zlib.crc32(key, seed & 0xFFFFFFFF)
    dx = ((h & 0xFFFF) / 0xFFFF * 2 - 1) * amplitude
    dz = (((h >> 16) & 0xFFFF) / 0xFFFF * 2 - 1) * amplitude
    return dx, dz


def _gap_limits(values, ratio=0.3):
    """每個座標值到最近的相鄰值的距離 × ratio：偏移不超過它，相鄰兩條線就不會互相越過。

    例：窗洞邊緣和旁邊的格線只差 4 cm，兩邊各偏移 2 cm 時可能只剩 2 mm，倒角就放不進去
    （Phase 4 的自我交叉檢查抓到的）。限制在 30% 後，最窄仍保留 40% 的間距。
    """
    unique = sorted(set(values))
    limits = {}
    for i, value in enumerate(unique):
        gaps = [abs(value - unique[j]) for j in (i - 1, i + 1) if 0 <= j < len(unique)]
        limits[value] = min(gaps) * ratio if gaps else float("inf")
    return limits


def wobble_mesh(mesh, origin, seed, amplitude):
    """origin：Object 在資產座標中的位置（mesh 頂點加上它就是資產座標）。"""
    if amplitude <= 0:
        return 0
    ox, oy, oz = origin
    keys = [(round(v.co.x, 4), round(v.co.z, 4)) for v in mesh.vertices]
    x_limit = _gap_limits([k[0] for k in keys])
    z_limit = _gap_limits([k[1] for k in keys])
    for vert, (kx, kz) in zip(mesh.vertices, keys):
        x, y, z = vert.co.x + ox, vert.co.y + oy, vert.co.z + oz
        dx, dz = offset(x, y, z, seed, amplitude)
        vert.co.x += max(-x_limit[kx], min(x_limit[kx], dx))
        if abs(z) > 1e-4:
            vert.co.z += max(-z_limit[kz], min(z_limit[kz], dz))
    mesh.update()
    return len(mesh.vertices)


def wobble_mesh_safe(mesh, origin, seed, amplitude):
    """wobble 後自我交叉變多，就換回原本的 mesh（不做手繪偏移）。回傳是否保留 wobble。

    凹多邊形擠出的零件（人字屋頂、階梯），端面被 ear clipping 切成細長三角形，
    頂點被推動後細長三角形可能翻面、和旁邊的三角形重疊（Phase 6 前置建 test02 門廊屋頂時發現）。
    """
    from .bevel import _restore, _self_intersections
    import bmesh
    import bpy

    def count():
        bm = bmesh.new()
        bm.from_mesh(mesh)
        try:
            return _self_intersections(bm)
        finally:
            bm.free()

    before = count()
    original = mesh.copy()
    try:
        wobble_mesh(mesh, origin, seed, amplitude)
        if count() > before:
            _restore(mesh, original)
            return False
        return True
    finally:
        bpy.data.meshes.remove(original)
