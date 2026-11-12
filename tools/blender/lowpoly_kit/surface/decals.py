"""Decal Engine（Blender 端）：招牌字、海報、符號等「貼在表面上的獨立小片」。

為什麼不畫進主 Mesh 的貼圖：
- 主貼圖是平鋪的（一張木紋貼滿整面牆），招牌字只會出現一次 → 放不進平鋪貼圖
- 獨立管理：換招牌文字只要重建 decal，不必重畫牆；Three.js 端也能個別開關或做動畫

做法：
1. 每個 decal 的內容畫成一張小圖（文字用 Blender 渲染、符號用 numpy 畫、圖片直接讀）
2. 全部排進同一張 decal atlas（一個資產 1 張圖、1 個材質 → 所有 decal 共用 1 次 draw call 的材質）
3. 每個 decal 是一個四邊形 Object，貼在目標面前方 offset 公尺（避免 z-fighting 閃爍），parent 到目標元件
4. 材質 alphaMode = MASK：透明的地方直接不畫，不需要排序（BLEND 的半透明物件要排序，容易出錯）
"""

import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector

from .pngio import read_png
from .spec import hex_to_rgb
from . import images as image_tools
from .material_builder import build_textured
from .packing import shelf_pack
from .uv import UV0

PIXELS_PER_METER = 512
MAX_SIDE = 512

# face → (法線方向, 水平軸, 垂直軸)，用資產座標（正面朝 -Y）
FACES = {
    "front": (Vector((0, -1, 0)), 0, 2),
    "back": (Vector((0, 1, 0)), 0, 2),
    "left": (Vector((-1, 0, 0)), 1, 2),
    "right": (Vector((1, 0, 0)), 1, 2),
    "top": (Vector((0, 0, 1)), 0, 1),
}


# ---------------------------------------------------------------------------
# 內容 → RGBA 圖
# ---------------------------------------------------------------------------

def _symbol_sdf(name, x, y):
    """符號的 signed distance（< 0 在內部），座標 -1～1。"""
    if name == "circle":
        return np.hypot(x, y) - 0.8
    if name == "star":
        angle = np.arctan2(y, x) + math.pi / 2
        radius = np.hypot(x, y)
        spike = 0.45 + 0.4 * (np.abs(((angle / (2 * math.pi / 5)) % 1.0) - 0.5) * 2)
        return radius - spike
    if name == "heart":
        yy = -y + 0.25
        return (x * x + (yy - np.sqrt(np.abs(x)) * 0.8) ** 2) - 0.55
    if name == "arrow":
        shaft = np.maximum(np.abs(y) - 0.2, np.abs(x + 0.2) - 0.6)
        head = np.maximum(x - 0.8, np.abs(y) - (0.8 - x) * 0.9)
        head = np.maximum(head, 0.2 - x)
        return np.minimum(shaft, head)
    if name == "cup":
        body = np.maximum(np.abs(x + 0.1) - 0.55 + (y + 0.6) * 0.12, np.abs(y + 0.05) - 0.65)
        handle = np.abs(np.hypot(x - 0.5, y - 0.05) - 0.28) - 0.09
        return np.minimum(body, handle)
    if name == "bolt":
        upper = np.maximum(np.abs(x - 0.15 + y * 0.6) - 0.22, np.abs(y - 0.4) - 0.45)
        lower = np.maximum(np.abs(x + 0.15 + y * 0.6) - 0.22, np.abs(y + 0.4) - 0.45)
        return np.minimum(upper, lower)
    if name == "drop":
        return np.maximum(np.hypot(x, y + 0.25) - 0.55, (np.abs(x) * 1.2 + y * 0.75) - 0.55)
    return np.hypot(x, y) - 0.8


def symbol_image(name, width, height, color, background=None):
    """numpy 畫符號：SDF 加 1 px 的柔邊（抗鋸齒）。"""
    side = min(width, height)
    xs = (np.arange(width) + 0.5 - width / 2) / (side / 2)
    ys = (height / 2 - np.arange(height) - 0.5) / (side / 2)
    x, y = np.meshgrid(xs, ys)
    inside = np.clip(0.5 - _symbol_sdf(name, x, y) * side / 4, 0, 1)
    return _compose(inside, color, background)


def _compose(mask, color, background):
    """前景遮罩 + 顏色（+ 圓角底板）→ RGBA。"""
    height, width = mask.shape
    fg = np.array(hex_to_rgb(color), dtype=np.float32)
    out = np.zeros((height, width, 4), dtype=np.float32)
    if background:
        bg = np.array(hex_to_rgb(background), dtype=np.float32)
        out[:, :, :3] = bg
        out[:, :, 3] = _rounded_rect(width, height)
    out[:, :, :3] = out[:, :, :3] * (1 - mask[..., None]) + fg * mask[..., None]
    out[:, :, 3] = np.maximum(out[:, :, 3], mask)
    return out


def _rounded_rect(width, height, radius_ratio=0.12):
    radius = min(width, height) * radius_ratio
    x = np.abs(np.arange(width) + 0.5 - width / 2) - (width / 2 - radius)
    y = np.abs(np.arange(height) + 0.5 - height / 2) - (height / 2 - radius)
    xx, yy = np.meshgrid(np.maximum(x, 0), np.maximum(y, 0))
    return np.clip(radius - np.hypot(xx, yy) + 0.5, 0, 1).astype(np.float32)


def text_mask(text, width, height):
    """用 Blender 把文字渲染成遮罩：暫時建一個場景（文字物件 + 正交相機 + Workbench），渲完就刪。

    為什麼不把文字轉成 mesh：字形轉 mesh 會產生大量三角面（一個字幾百面），
    而渲成貼圖只是一張小圖。限制：內建字型只支援拉丁字母，中文需要另外指定字型檔。
    """
    scene = bpy.data.scenes.new("LPK_decal_text")
    curve = bpy.data.curves.new("LPK_decal_text", "FONT")
    curve.body = text
    curve.align_x, curve.align_y = "CENTER", "CENTER"
    obj = bpy.data.objects.new("LPK_decal_text", curve)
    scene.collection.objects.link(obj)
    camera_data = bpy.data.cameras.new("LPK_decal_cam")
    camera_data.type = "ORTHO"
    camera = bpy.data.objects.new("LPK_decal_cam", camera_data)
    scene.collection.objects.link(camera)
    path = os.path.join(tempfile.mkdtemp(prefix="lpk_decal_"), "text.png")
    try:
        bpy.context.view_layer.update()
        depsgraph = bpy.context.evaluated_depsgraph_get()
        corners = [obj.matrix_world @ Vector(c) for c in obj.evaluated_get(depsgraph).bound_box]
        # 文字的外框不知道時（空字串），用預設大小
        min_x = min(c.x for c in corners) if corners else -1
        max_x = max(c.x for c in corners) if corners else 1
        min_y = min(c.y for c in corners) if corners else -0.5
        max_y = max(c.y for c in corners) if corners else 0.5
        text_w, text_h = max(max_x - min_x, 1e-3), max(max_y - min_y, 1e-3)
        aspect = width / height
        # 留 12% 邊界；依寬或高較緊的那邊決定相機範圍
        span = max(text_w * 1.24, text_h * 1.24 * aspect)
        camera_data.ortho_scale = span
        camera.location = ((min_x + max_x) / 2, (min_y + max_y) / 2, 5)
        scene.camera = camera
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "FLAT"
        scene.display.shading.color_type = "SINGLE"
        scene.display.shading.single_color = (1, 1, 1)
        scene.render.film_transparent = True
        scene.render.resolution_x, scene.render.resolution_y = width, height
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGBA"
        scene.render.filepath = path
        scene.view_settings.view_transform = "Standard"
        bpy.ops.render.render(write_still=True, scene=scene.name)
        return image_tools.load_png_with_blender(path)[:, :, 3].astype(np.float32)
    finally:
        bpy.data.objects.remove(obj)
        bpy.data.curves.remove(curve)
        bpy.data.objects.remove(camera)
        bpy.data.cameras.remove(camera_data)
        bpy.data.scenes.remove(scene)
        if os.path.exists(path):
            os.remove(path)


def render_content(decal, width, height, base_dir):
    content = decal["content"]
    color = content.get("color", "#2B2B2B")
    background = content.get("background")
    kind = content["type"]
    if kind == "symbol":
        return symbol_image(content["symbol"], width, height, color, background), []
    if kind == "image":
        image = read_png(os.path.join(base_dir, content["path"]))
        from .sources.postprocess import resize
        from .pngio import to_rgba
        return _fit(to_rgba(image), width, height, resize), []
    warnings = []
    if any(ord(ch) > 127 for ch in content["text"]):
        warnings.append(f"DECAL_FONT：{decal['id']} 有非拉丁字元，內建字型可能顯示成方框")
    return _compose(text_mask(content["text"], width, height), color, background), warnings


def _fit(image, width, height, resize):
    side = max(width, height)
    square = resize(image, side, wrap=False)
    top, left = (side - height) // 2, (side - width) // 2
    return square[top:top + height, left:left + width]


# ---------------------------------------------------------------------------
# 幾何
# ---------------------------------------------------------------------------

def _surface_depth(target, normal, points, fallback):
    """在 decal 範圍內的多個點，從表面外側往內打射線，取「最外側」的表面深度。

    只打中心一點不夠：招牌的中央常常比外框凹，decal 若貼在中央的深度，四個角就會被外框蓋住。
    取所有命中點中最外側的那個，整片 decal 才一定在表面前方。
    """
    inverse = target.matrix_world.inverted()
    direction = (inverse.to_3x3() @ (-normal)).normalized()
    depths = []
    for point in points:
        origin = inverse @ (point + normal * 5.0)
        hit, location, _n, _i = target.ray_cast(origin, direction, distance=20.0)
        if hit:
            depths.append((target.matrix_world @ location).dot(normal))
    return max(depths) if depths else fallback


def build_decals(plan_id, decals, objects, root, collection, base_dir):
    """decals：plan 的 decals 陣列；objects：{元件 id: Object}。回傳 (新 Object 清單, 報告)。"""
    if not decals:
        return [], {"count": 0}
    warnings = []
    contents = []
    for decal in decals:
        (h0, v0), (h1, v1) = decal["rect"]
        width = max(16, min(MAX_SIDE, round((h1 - h0) * PIXELS_PER_METER)))
        height = max(16, min(MAX_SIDE, round((v1 - v0) * PIXELS_PER_METER)))
        pixels, extra = render_content(decal, width, height, base_dir)
        warnings += extra
        contents.append(pixels)

    # atlas：依最長邊排列，留 4 px 間隔；尺寸取 2 的次方
    longest = [max(c.shape[:2]) for c in contents]
    total = math.sqrt(sum(c.shape[0] * c.shape[1] for c in contents))
    size = 2 ** math.ceil(math.log2(max(64, total * 1.3, max(longest))))
    size = min(size, 2048)
    scale, spots = shelf_pack([s / size for s in longest], 4 / size)
    atlas = np.zeros((size, size, 4), dtype=np.float32)
    cells = []
    for pixels, (x, y, side) in zip(contents, spots):
        if scale < 1:  # 排不下：縮小內容
            from .sources.postprocess import resize
            target_side = max(8, int(max(pixels.shape[:2]) * scale))
            pixels = _fit(pixels, target_side, target_side, resize) if pixels.shape[0] == pixels.shape[1] else \
                resize(pixels, target_side, wrap=False)
        h, w = pixels.shape[:2]
        px, py = int(round(x * size)), int(round(y * size))
        atlas[py:py + h, px:px + w] = pixels
        # atlas 陣列第 0 列在上面；UV 的 v 從下面算 → v = 1 - 列 / size
        cells.append((px / size, 1 - (py + h) / size, (px + w) / size, 1 - py / size))

    image = image_tools.image_from_array(f"LPK_{plan_id}_decal_atlas", atlas, "decal")
    material = build_textured(f"LPK_{plan_id}_decals", {"base": image}, repeat=False, alpha_mode="MASK")
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Roughness"].default_value = 0.75
    material["lpk_asset"] = plan_id

    created = []
    bpy.context.view_layer.update()
    for decal, (u0, v0, u1, v1) in zip(decals, cells):
        target = objects.get(decal["target"])
        if target is None:
            warnings.append(f"DECAL_TARGET_MISSING：{decal['id']} 的目標 {decal['target']} 沒有建立")
            continue
        normal, h_axis, v_axis = FACES[decal["face"]]
        (h0, vv0), (h1, vv1) = decal["rect"]
        offset = decal.get("offset", 0.004)
        corners_world = [Vector(c) for c in (target.matrix_world @ Vector(b) for b in target.bound_box)]
        extent = max(c.dot(normal) for c in corners_world)
        samples = []
        for i in range(5):
            for j in range(5):
                point = Vector((0, 0, 0))
                # 包含四個角與邊：角落最容易壓到凸起的外框
                point[h_axis] = h0 + (h1 - h0) * i / 4
                point[v_axis] = vv0 + (vv1 - vv0) * j / 4
                point = root.matrix_world @ point
                samples.append(point - normal * point.dot(normal) + normal * extent)
        depth = _surface_depth(target, normal, samples, extent)
        verts = []
        for hh, vv in ((h0, vv0), (h1, vv0), (h1, vv1), (h0, vv1)):
            point = Vector((0, 0, 0))
            point[h_axis], point[v_axis] = hh, vv
            point = root.matrix_world @ point
            point = point - normal * point.dot(normal) + normal * (depth + offset)
            verts.append(point)
        uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        if decal["face"] in ("back", "left"):
            # 從背面、左側看，水平軸方向相反：u 左右對調，文字才不會變成鏡像
            uvs = [uvs[1], uvs[0], uvs[3], uvs[2]]
        mesh = bpy.data.meshes.new(f"{plan_id}_{decal['id']}")
        mesh.from_pydata([tuple(v) for v in verts], [], [[0, 1, 2, 3]])
        mesh.update()
        if mesh.polygons[0].normal.dot(normal) < 0:  # 法線要朝外（朝向觀看者），背面剔除時才看得到
            mesh.flip_normals()
        uv_layer = mesh.uv_layers.new(name=UV0)
        for loop in mesh.polygons[0].loop_indices:
            uv_layer.data[loop].uv = uvs[mesh.loops[loop].vertex_index]
        mesh.materials.append(material)
        obj = bpy.data.objects.new(f"{plan_id}_{decal['id']}", mesh)
        collection.objects.link(obj)
        obj.parent = target
        obj.matrix_parent_inverse = target.matrix_world.inverted()
        obj["lowpoly_profile"] = "decoration"
        obj["lpk_asset"] = plan_id
        obj["lpk_component"] = decal["id"]
        obj["lpk_kind"] = "decal"
        obj["lpk_tier"] = "tertiary"
        obj["lpk_decal"] = True
        created.append(obj)
    return created, {"count": len(created), "atlas": image.name, "atlas_size": size, "warnings": warnings}
