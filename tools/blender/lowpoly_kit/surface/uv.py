"""UV Engine（Blender 端）。

兩組 UV：
- UVMap（TEXCOORD_0）：材質貼圖用。以「公尺」為單位投影：uv = 位置 / tile_m，
  所以同一種木板貼在大箱子、小箱子上，木板寬度都一樣（texel density 一致）
- UVBake（TEXCOORD_1）：烘焙 AO／完整表面用。每個面在整張圖上都有自己的位置、不可重疊

UV0 策略（plan 的 surface.uv，或依 profile 決定）：
- planar：每個面依自己的平面投影，u 水平、v 沿表面往上。斜屋頂不會被拉長，瓦片列順著坡面排
- along：u 沿物件最長軸。樑、木箱的木紋順著長邊走；和長軸垂直的面（端面）退回 planar
- cylinder：圓柱展開（u = 弧長、v = 高度），一圈剛好是整數張貼圖，接縫看不出來
- fit：圓柱展開並正規化到 0～1（一圈 = 1、底到頂 = 1），給不平鋪的 unique 貼圖（例如玉米）。
  很扁的物件（魚排切面）把上下切面對到貼圖上半；側面單獨展開到貼圖底部的魚皮帶。

為什麼不用一律 Cube Projection：盒狀投影在 45° 斜面上會拉長 1.41 倍，圓柱面上則會出現明顯的接縫與扭曲。
"""

import math

import bpy
import numpy as np

from .packing import shelf_pack

UV0, UV_BAKE = "UVMap", "UVBake"
UP = np.array([0.0, 0.0, 1.0])


# ---------------------------------------------------------------------------
# mesh → numpy
# ---------------------------------------------------------------------------

def mesh_arrays(mesh):
    """把 mesh 讀成 numpy 陣列。foreach_get 一次讀完，比逐一存取快上百倍。"""
    def get(collection, attr, count, width, dtype=np.float64):
        buffer = np.empty(count * width, dtype=dtype)
        collection.foreach_get(attr, buffer)
        return buffer.reshape(count, width) if width > 1 else buffer

    nv, npoly, nloop = len(mesh.vertices), len(mesh.polygons), len(mesh.loops)
    return {
        "co": get(mesh.vertices, "co", nv, 3),
        "normal": get(mesh.polygons, "normal", npoly, 3),
        "center": get(mesh.polygons, "center", npoly, 3),
        "loop_start": get(mesh.polygons, "loop_start", npoly, 1, np.int64),
        "loop_total": get(mesh.polygons, "loop_total", npoly, 1, np.int64),
        "material": get(mesh.polygons, "material_index", npoly, 1, np.int64),
        "loop_vert": get(mesh.loops, "vertex_index", nloop, 1, np.int64),
    }


def loop_poly_index(arrays):
    """每個 loop 屬於哪個面。"""
    index = np.zeros(len(arrays["loop_vert"]), dtype=np.int64)
    for poly, (start, total) in enumerate(zip(arrays["loop_start"], arrays["loop_total"])):
        index[start:start + total] = poly
    return index


def _normalize(v):
    length = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(length, 1e-12)


def planar_frames(normals):
    """每個面的 (u 方向, v 方向)：u 水平，v = n × u（沿表面往上）。接近水平的面用世界 x、y。"""
    flat = np.abs(normals[:, 2]) > 0.95
    u_dir = _normalize(np.cross(UP[None, :], normals))
    u_dir[flat] = (1.0, 0.0, 0.0)
    v_dir = _normalize(np.cross(normals, u_dir))
    return u_dir, v_dir


def along_frames(normals, axis):
    """u 沿著 axis 在面上的投影；面和 axis 幾乎垂直時（端面）退回 planar。"""
    u_dir, v_dir = planar_frames(normals)
    dots = normals @ axis
    projected = axis[None, :] - dots[:, None] * normals
    ok = np.abs(dots) < 0.9
    u_dir[ok] = _normalize(projected[ok])
    v_dir[ok] = _normalize(np.cross(normals[ok], u_dir[ok]))
    return u_dir, v_dir


# ---------------------------------------------------------------------------
# UV0
# ---------------------------------------------------------------------------

def _cylinder_angles(points, centers, poly_of_loop, cx, cy):
    """每個 loop 的角度；同一個面跨過 ±π 時把負的角度加 2π，避免一個面被展開成繞一整圈。"""
    angles = np.arctan2(points[:, 1] - cy, points[:, 0] - cx)
    radius = np.hypot(points[:, 0] - cx, points[:, 1] - cy)
    center_angle = np.arctan2(centers[poly_of_loop, 1] - cy, centers[poly_of_loop, 0] - cx)
    angles = np.where(radius < 1e-6, center_angle, angles)  # 極點（半徑 0）沒有角度，用面中心的角度
    # 以面中心的角度為基準，把每個 loop 的角度拉到 [中心 - π, 中心 + π)
    return center_angle + ((angles - center_angle + math.pi) % (2 * math.pi) - math.pi)


def apply_uv0(mesh, assignments):
    """assignments：{material_index: {"uv": 策略, "tile_m": 公尺或 None}}。只改這些材質的面。

    回傳 {material_index: {"faces", "strategy", "tile_m", "repeats_around"}}。
    """
    if not assignments:
        return {}
    arrays = mesh_arrays(mesh)
    uv_layer = mesh.uv_layers.get(UV0) or mesh.uv_layers.new(name=UV0)
    uv = np.empty(len(mesh.loops) * 2, dtype=np.float64)
    uv_layer.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    poly_of_loop = loop_poly_index(arrays)
    loop_material = arrays["material"][poly_of_loop]
    points = arrays["co"][arrays["loop_vert"]]
    report = {}

    for index, rule in assignments.items():
        polys = arrays["material"] == index
        loops = loop_material == index
        if not polys.any():
            continue
        strategy, tile = rule["uv"], rule.get("tile_m") or 1.0
        normals = arrays["normal"]
        selected_points = arrays["co"][np.unique(arrays["loop_vert"][loops])]
        low, high = selected_points.min(axis=0), selected_points.max(axis=0)
        info = {"faces": int(polys.sum()), "strategy": strategy, "tile_m": rule.get("tile_m")}

        if strategy in ("planar", "along"):
            if strategy == "along":
                axis = np.zeros(3)
                axis[int(np.argmax(high - low))] = 1.0
                u_dir, v_dir = along_frames(normals, axis)
            else:
                u_dir, v_dir = planar_frames(normals)
            p = points[loops]
            pl = poly_of_loop[loops]
            uv[loops, 0] = np.einsum("ij,ij->i", p, u_dir[pl]) / tile
            uv[loops, 1] = np.einsum("ij,ij->i", p, v_dir[pl]) / tile
        else:  # cylinder／fit：繞 z 軸
            cx, cy = (low[0] + high[0]) / 2, (low[1] + high[1]) / 2
            span_x = max(float(high[0] - low[0]), 1e-6)
            span_y = max(float(high[1] - low[1]), 1e-6)
            height = max(float(high[2] - low[2]), 1e-6)
            # 平放的切面：上下切面用貼圖 v≥0.10 的卡通肉紋。
            # 側面展開到 v<0.10 的暗色魚皮帶（patterns.salmon_marbling 的 down≥0.90）。
            # 側面若跟切面共用 XY，厚度面的 UV 會塌成線。
            if strategy == "fit" and height < 0.45 * max(span_x, span_y):
                inset = 0.001
                skin_v = 0.10
                side_poly = np.abs(normals[:, 2]) < 0.72
                side = loops & side_poly[poly_of_loop]
                cap = loops & ~side_poly[poly_of_loop]
                raw_u = (points[cap, 0] - low[0]) / span_x
                raw_v = (points[cap, 1] - low[1]) / span_y
                uv[cap, 0] = raw_u * (1 - 2 * inset) + inset
                uv[cap, 1] = skin_v + inset + raw_v * (1 - skin_v - 2 * inset)
                angles = _cylinder_angles(points[side], arrays["center"], poly_of_loop[side], cx, cy)
                uv[side, 0] = (angles / (2 * math.pi) + 0.5) * (1 - 2 * inset) + inset
                side_t = (points[side, 2] - low[2]) / height
                uv[side, 1] = 0.018 + side_t * 0.055
                info["repeats_around"] = 1
                report[int(index)] = info
                continue
            side_poly = np.abs(normals[:, 2]) < 0.8
            side = loops & side_poly[poly_of_loop]
            cap = loops & ~side_poly[poly_of_loop]
            radius = float(np.mean(np.hypot(selected_points[:, 0] - cx, selected_points[:, 1] - cy))) or 1e-3
            angles = _cylinder_angles(points[side], arrays["center"], poly_of_loop[side], cx, cy)
            if strategy == "fit":
                repeats = 1
                uv[side, 0] = angles / (2 * math.pi) + 0.5
                uv[side, 1] = (points[side, 2] - low[2]) / height
                cap_scale = 1.0 / (2 * radius * 2)
            else:
                # 一圈放整數張貼圖：周長 / tile 四捨五入。少了這步，圓周的接回處會有一條接縫
                repeats = max(1, round(2 * math.pi * radius / tile))
                uv[side, 0] = angles / (2 * math.pi) * repeats
                uv[side, 1] = points[side, 2] / (2 * math.pi * radius / repeats)
                cap_scale = 1.0 / tile
            uv[cap, 0] = (points[cap, 0] - cx) * cap_scale + 0.5
            uv[cap, 1] = (points[cap, 1] - cy) * cap_scale + 0.5
            info["repeats_around"] = repeats
        report[int(index)] = info

    uv_layer.data.foreach_set("uv", uv.ravel())
    mesh.update()
    return report


# ---------------------------------------------------------------------------
# UVBake：smart project + 依面積排進同一張圖
# ---------------------------------------------------------------------------

def _select_only(obj):
    view_layer = bpy.context.view_layer
    for other in view_layer.objects:
        other.select_set(False)
    obj.select_set(True)
    view_layer.objects.active = obj


def _smart_project(obj, margin):
    """注意：切換 Edit／Object 模式後，之前拿到的 uv_layers 參照會失效（spike 時直接 crash），
    所以模式切換後一律重新從 obj.data 取。"""
    _select_only(obj)
    obj.data.uv_layers.active = obj.data.uv_layers[UV_BAKE]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh = obj.data
    mesh.uv_layers.active = mesh.uv_layers[UV0]


def surface_area(mesh):
    return float(sum(p.area for p in mesh.polygons))


def ensure_bake_uv(objects, padding_px, image_size):
    """每個不重複的 mesh 建 UVBake → smart project → 依面積分配一塊區域。回傳 layout 報告。

    objects：要烘焙的 Object（共用 mesh 的只處理第一個）。回傳 {"meshes": {mesh 名稱: [x, y, 邊長]}, "gap_px"}。
    """
    view_layer = bpy.context.view_layer
    previous_active = view_layer.objects.active
    previous_selection = [o for o in view_layer.objects if o.select_get()]
    previous_mode = bpy.context.object.mode if bpy.context.object else "OBJECT"
    if previous_mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    gap = padding_px * 2 / image_size
    unique = []
    seen = set()
    for obj in objects:
        if obj.data.name not in seen and obj.name in view_layer.objects:
            seen.add(obj.data.name)
            unique.append(obj)
    try:
        for obj in unique:
            mesh = obj.data
            if mesh.uv_layers.get(UV0) is None:
                mesh.uv_layers.new(name=UV0)
            if mesh.uv_layers.get(UV_BAKE) is None:
                mesh.uv_layers.new(name=UV_BAKE)
            _smart_project(obj, margin=gap)
        areas = [math.sqrt(max(surface_area(o.data), 1e-8)) for o in unique]
        _scale, spots = shelf_pack(areas, gap)
        layout = {}
        for obj, (x, y, side) in zip(unique, spots):
            mesh = obj.data
            layer = mesh.uv_layers[UV_BAKE]
            coords = np.empty(len(mesh.loops) * 2, dtype=np.float64)
            layer.data.foreach_get("uv", coords)
            coords = coords.reshape(-1, 2)
            # smart project 的結果在 0～1 內；縮進分配到的 cell（留 gap/2 的內縮，避免 bake 時溢色到隔壁）
            inner = min(gap / 2, side * 0.1)
            coords = coords * (side - 2 * inner) + np.array([x + inner, y + inner])
            layer.data.foreach_set("uv", coords.ravel())
            mesh.update()
            layout[mesh.name] = [round(x, 5), round(y, 5), round(side, 5)]
        return {"meshes": layout, "gap_px": round(gap * image_size, 1)}
    finally:
        for other in view_layer.objects:
            other.select_set(other in previous_selection)
        view_layer.objects.active = previous_active


# ---------------------------------------------------------------------------
# 量測（Texture QA 用）
# ---------------------------------------------------------------------------

def triangle_metrics(mesh, layer_name, scale=1.0):
    """每個三角形的 3D 面積、UV 面積、UV 線性縮放（σ1、σ2）。

    把三角形放進自己的 2D 座標系，求「3D → UV」的 2×2 Jacobian，奇異值 σ1 ≥ σ2：
    - σ 的平均 × 貼圖尺寸 = texel density（px/m）
    - σ1 / σ2 = 各向異性拉伸（1 = 沒有拉伸；2 = 某個方向被拉長 2 倍）
    """
    layer = mesh.uv_layers.get(layer_name)
    if layer is None:
        return None
    mesh.calc_loop_triangles()
    tris = mesh.loop_triangles
    count = len(tris)
    if count == 0:
        return None
    loops = np.empty(count * 3, dtype=np.int64)
    tris.foreach_get("loops", loops)
    loops = loops.reshape(-1, 3)
    material = np.empty(count, dtype=np.int64)
    tris.foreach_get("material_index", material)
    arrays = mesh_arrays(mesh)
    uv = np.empty(len(mesh.loops) * 2, dtype=np.float64)
    layer.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    p = arrays["co"][arrays["loop_vert"][loops]] * scale
    t = uv[loops]
    e1, e2 = p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]
    d1, d2 = t[:, 1] - t[:, 0], t[:, 2] - t[:, 0]
    len1 = np.linalg.norm(e1, axis=1)
    x_axis = e1 / np.maximum(len1[:, None], 1e-12)
    e2x = np.einsum("ij,ij->i", e2, x_axis)
    e2y_vec = e2 - e2x[:, None] * x_axis
    e2y = np.linalg.norm(e2y_vec, axis=1)
    area3d = 0.5 * len1 * e2y
    area_uv = 0.5 * np.abs(d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0])
    valid = (len1 > 1e-9) & (e2y > 1e-9)
    # Jacobian J = [d1 d2] · inv([[len1, e2x], [0, e2y]])
    inv11 = 1 / np.where(valid, len1, 1)
    inv12 = -e2x / np.where(valid, len1 * e2y, 1)
    inv22 = 1 / np.where(valid, e2y, 1)
    a = d1[:, 0] * inv11
    b = d1[:, 0] * inv12 + d2[:, 0] * inv22
    c = d1[:, 1] * inv11
    d = d1[:, 1] * inv12 + d2[:, 1] * inv22
    # 2×2 矩陣奇異值的封閉解
    s1 = np.sqrt(np.maximum((a * a + b * b + c * c + d * d) / 2 + np.sqrt(
        np.maximum(((a * a + b * b - c * c - d * d) / 2) ** 2 + (a * c + b * d) ** 2, 0)), 0))
    s2 = np.abs(a * d - b * c) / np.maximum(s1, 1e-12)
    return {"area3d": area3d, "area_uv": area_uv, "s1": s1, "s2": s2, "material": material, "valid": valid,
            "uv": t}


def rasterize_coverage(triangles_uv, resolution=256):
    """把 UV 三角形畫到 resolution² 的格子上，回傳每格被覆蓋幾次（> 1 = 重疊）。"""
    grid = np.zeros((resolution, resolution), dtype=np.int32)
    centers = (np.arange(resolution) + 0.5) / resolution
    for tri in triangles_uv:
        (x0, y0), (x1, y1), (x2, y2) = tri
        lo_x, hi_x = max(int(min(x0, x1, x2) * resolution), 0), min(int(max(x0, x1, x2) * resolution) + 1, resolution)
        lo_y, hi_y = max(int(min(y0, y1, y2) * resolution), 0), min(int(max(y0, y1, y2) * resolution) + 1, resolution)
        if lo_x >= hi_x or lo_y >= hi_y:
            continue
        px, py = np.meshgrid(centers[lo_x:hi_x], centers[lo_y:hi_y])
        denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(denom) < 1e-14:
            continue
        w0 = ((y1 - y2) * (px - x2) + (x2 - x1) * (py - y2)) / denom
        w1 = ((y2 - y0) * (px - x2) + (x0 - x2) * (py - y2)) / denom
        inside = (w0 >= 0) & (w1 >= 0) & (w0 + w1 <= 1)
        grid[lo_y:hi_y, lo_x:hi_x] += inside
    return grid
