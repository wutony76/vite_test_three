"""Texture QA（Blender 端）：貼圖、UV、材質節點、匯出結果、預算、純色比例。

和拓撲 QA 一樣「程式判定」：每條規則有明確的數字門檻，fail 會擋下匯出，warn 只提醒。
規則清單見 openspec/changes/add-texture-surface-engine/design.md §7。
"""

import numpy as np

from ..surface import gltf_compat
from ..surface.material_builder import UV0, UV_BAKE
from ..surface.painter.library import seam_error
from ..surface.spec import TIERS, gpu_bytes
from ..surface.uv import rasterize_coverage, triangle_metrics

FLAT_RATIO_WARN = 0.30
STRETCH_WARN, STRETCH_FAIL, STRETCH_AREA = 1.5, 2.0, 0.10
DENSITY_TOLERANCE = 0.5
OVERLAP_FAIL = 0.005
SEAM_WARN = 2.0
DEFAULT_GPU_MB, DEFAULT_TEXTURE_KB = 16.0, 2048.0
KTX2_HINT_MB = 150.0


class _Report:
    def __init__(self):
        self.issues = []
        self.metrics = {}

    def add(self, level, code, message):
        self.issues.append({"level": level, "code": code, "message": message})

    def result(self):
        levels = {i["level"] for i in self.issues}
        status = "fail" if "fail" in levels else "warn" if "warn" in levels else "pass"
        return {"status": status, "issues": self.issues, "metrics": self.metrics}


def _meshes(root):
    return [o for o in root.children_recursive if o.type == "MESH"]


def _used_materials(objects):
    used = []
    for obj in objects:
        for material in obj.data.materials:
            if material is not None and material not in used:
                used.append(material)
    return used


def _uv_maps_used(material):
    if material.node_tree is None:
        return set()
    names = {n.uv_map for n in material.node_tree.nodes if n.type == "UVMAP" and n.uv_map}
    return names


def _base_image(material):
    """接到 Base Color 的圖片（Image datablock）；沒有時回傳 None。"""
    for image, sockets in gltf_compat.image_roles(material):
        if "Base Color" in sockets:
            return image
    return None


def _check_nodes(report, materials):
    images = {}
    for material in materials:
        for code, message in gltf_compat.check_material(material):
            report.add("fail", code, message)
        for image, _sockets in gltf_compat.image_roles(material):
            images[image.name] = image
        if material.get("lpk_textured") and _base_image(material) is None:
            report.add("fail", "TEXTURE_MISSING", f"{material.name}：貼圖材質沒有 Base Color 圖片")
    for image in images.values():
        if not image.has_data and image.packed_file is None:
            report.add("fail", "TEXTURE_MISSING", f"{image.name}：圖片沒有像素資料")
        if not gltf_compat.image_file_ok(image):
            report.add("fail", "EXTERNAL_FILE_MISSING", f"{image.name}：沒有打包，外部檔案 {image.filepath!r} 也不存在")
    return images


def _check_uv_layers(report, objects):
    for obj in objects:
        mesh = obj.data
        needed = set()
        for material in mesh.materials:
            if material is not None:
                needed |= _uv_maps_used(material)
        for name in sorted(needed):
            if mesh.uv_layers.get(name) is None:
                report.add("fail", "UV_MISSING", f"{obj.name}：材質需要 UV「{name}」，mesh 沒有")
        if mesh.uv_layers and mesh.uv_layers[0].name != UV0:
            report.add("fail", "UV_MISSING", f"{obj.name}：第一組 UV 必須是 {UV0}（匯出成 TEXCOORD_0）")


def _check_uv0(report, objects):
    """貼圖材質的面：拉伸（各向異性）與 texel density。"""
    densities = {}
    done = set()
    for obj in objects:
        mesh = obj.data
        if mesh.name in done or obj.get("lpk_decal"):
            continue
        done.add(mesh.name)
        textured = {i: m for i, m in enumerate(mesh.materials) if m is not None and m.get("lpk_textured")}
        if not textured:
            continue
        scale = float(max(obj.matrix_world.to_scale()))
        metrics = triangle_metrics(mesh, UV0, scale)
        if metrics is None:
            continue
        for index, material in textured.items():
            pick = (metrics["material"] == index) & metrics["valid"]
            if not pick.any():
                continue
            area = metrics["area3d"][pick]
            total = float(area.sum()) or 1.0
            anisotropy = metrics["s1"][pick] / np.maximum(metrics["s2"][pick], 1e-12)
            for limit, level in ((STRETCH_FAIL, "fail"), (STRETCH_WARN, "warn")):
                share = float(area[anisotropy > limit].sum()) / total
                if share > STRETCH_AREA:
                    report.add(level, "UV_STRETCH",
                               f"{obj.name}／{material.name}：{share:.0%} 的面積拉伸超過 {limit}×")
                    break
            base = _base_image(material)
            if base is None or not material.get("lpk_tile_m"):
                continue  # unique（fit）貼圖不以公尺計算 density
            size = base.size[0]
            sigma = (metrics["s1"][pick] + metrics["s2"][pick]) / 2
            density = float(np.average(sigma, weights=area)) * size
            densities.setdefault(material.name, []).append(density)
    for name, values in densities.items():
        value = float(np.mean(values))
        report.metrics.setdefault("texel_density", {})[name] = round(value, 1)
    return densities


def _check_density_targets(report, materials):
    for material in materials:
        value = report.metrics.get("texel_density", {}).get(material.name)
        tier = material.get("lpk_tier")
        if value is None or tier not in TIERS:
            continue
        target = TIERS[tier]["density"]
        if abs(value - target) / target > DENSITY_TOLERANCE and value < target:
            # 密度高於目標只代表比較清楚（浪費一點記憶體），低於目標才會糊
            report.add("warn", "TEXEL_DENSITY", f"{material.name}：{value:.0f} px/m，低於 {tier} 目標 {target} px/m 的一半以上")


def _check_bake_uv(report, objects, surface_report):
    bake = (surface_report or {}).get("bake")
    if not bake:
        return
    triangles = []
    done = set()
    for obj in objects:
        mesh = obj.data
        if mesh.name in done or mesh.uv_layers.get(UV_BAKE) is None:
            continue
        done.add(mesh.name)
        metrics = triangle_metrics(mesh, UV_BAKE)
        if metrics is not None:
            triangles.extend(metrics["uv"].tolist())
    if not triangles:
        report.add("fail", "UV_MISSING", "有 bake 結果，但沒有任何 mesh 有 UVBake")
        return
    coverage = rasterize_coverage(triangles, 512)
    covered = int((coverage >= 1).sum())
    overlap = int((coverage > 1).sum()) / max(covered, 1)
    report.metrics["bake_uv_overlap"] = round(overlap, 4)
    report.metrics["bake_uv_coverage"] = round(covered / coverage.size, 3)
    if overlap > OVERLAP_FAIL:
        report.add("fail", "UV_OVERLAP", f"UVBake 重疊 {overlap:.2%}（上限 {OVERLAP_FAIL:.1%}）：烘焙時不同的面會互相覆蓋")
    layout = bake.get("layout", {})
    gap = layout.get("gap_px")
    tier_padding = min(t["padding"] for t in TIERS.values())
    if gap is not None and gap < tier_padding:
        report.add("warn", "UV_PADDING", f"UVBake island 間距 {gap} px，小於 {tier_padding} px，mipmap 時可能溢色")


def _check_seams(report, materials):
    from ..surface.images import image_to_array
    seen = set()
    for material in materials:
        if not material.get("lpk_textured") or not material.get("lpk_tile_m"):
            continue
        image = _base_image(material)
        if image is None or image.name in seen or not image.has_data or 0 in tuple(image.size):
            continue  # 沒有像素的圖片已經由 TEXTURE_MISSING／EXTERNAL_FILE_MISSING 回報
        seen.add(image.name)
        score = seam_error(image_to_array(image))
        report.metrics.setdefault("seam_score", {})[material.name] = round(score, 2)
        if score > SEAM_WARN:
            report.add("warn", "TEXTURE_SEAM", f"{material.name}：平鋪接縫指標 {score:.1f}（> {SEAM_WARN}），重複貼時會看到接縫")


def _flat_ratio(report, objects, detail):
    textured_area = flat_area = 0.0
    for obj in objects:
        if obj.get("lpk_tier") not in ("primary", "secondary") or obj.get("lpk_decal"):
            continue
        mesh = obj.data
        scale = float(max(obj.matrix_world.to_scale())) ** 2
        for poly in mesh.polygons:
            material = mesh.materials[poly.material_index] if mesh.materials else None
            if material is None or _is_glass(material):
                continue
            if material.get("lpk_textured") or material.name.endswith("_baked"):
                textured_area += poly.area * scale
            else:
                flat_area += poly.area * scale
    total = textured_area + flat_area
    ratio = flat_area / total if total else 0.0
    report.metrics["flat_ratio"] = round(ratio, 3)
    if detail.get("surface_quality", "off") != "off" and ratio > FLAT_RATIO_WARN:
        report.add("warn", "FLAT_RATIO", f"主要／次要元件有 {ratio:.0%} 的面積是純色（建議 ≤ {FLAT_RATIO_WARN:.0%}）："
                                         "替主要材質加上 surface")


def _is_glass(material):
    from ..surface.bake import is_transparent
    return is_transparent(material)


def _budget(report, images, plan):
    budget = plan.get("budget", {})
    limit_mb = float(budget.get("max_gpu_texture_mb", DEFAULT_GPU_MB))
    total = sum(gpu_bytes(*image.size) for image in images.values() if image.size[0] > 0)
    mb = total / (1024 * 1024)
    report.metrics["gpu_texture_mb"] = round(mb, 2)
    report.metrics["texture_count"] = len(images)
    if mb > limit_mb:
        report.add("fail", "TEXTURE_BUDGET", f"貼圖 GPU 記憶體 {mb:.1f} MB 超過預算 {limit_mb} MB")
    if mb > KTX2_HINT_MB:
        report.add("warn", "GPU_TEXTURE_HIGH", f"貼圖 GPU 記憶體 {mb:.0f} MB，超過 {KTX2_HINT_MB:.0f} MB：建議升級 KTX2")


def check_asset_textures(plan, root, detail, surface_report):
    """建模完成後（匯出前）的 Texture QA。"""
    report = _Report()
    objects = _meshes(root)
    materials = _used_materials(objects)
    images = _check_nodes(report, materials)
    _check_uv_layers(report, objects)
    _check_uv0(report, objects)
    _check_density_targets(report, materials)
    _check_bake_uv(report, objects, surface_report)
    _check_seams(report, materials)
    _flat_ratio(report, objects, detail)
    _budget(report, images, plan)
    return report.result()


# ---------------------------------------------------------------------------
# 匯出後：讀 GLB JSON，確認貼圖真的在檔案裡
# ---------------------------------------------------------------------------

def check_glb_textures(gltf, root, plan, file_bytes=None, image_bytes=None):
    """回傳 {"status", "issues", "metrics"}。root 用來知道哪些材質應該有哪些貼圖。"""
    report = _Report()
    objects = _meshes(root)
    by_name = {m.get("name"): m for m in gltf.get("materials", [])}
    textures = gltf.get("textures", [])
    gltf_images = gltf.get("images", [])
    for material in _used_materials(objects):
        entry = by_name.get(material.name)
        if entry is None:
            continue
        pbr = entry.get("pbrMetallicRoughness", {})
        expected = []
        if material.get("lpk_textured") or material.name.endswith("_baked"):
            expected = [("baseColorTexture", pbr), ("metallicRoughnessTexture", pbr)]
            if any(n.type == "NORMAL_MAP" for n in material.node_tree.nodes):
                expected.append(("normalTexture", entry))
        if any(n.get("lpk_occlusion") for n in material.node_tree.nodes):
            expected.append(("occlusionTexture", entry))
        for slot, owner in expected:
            info = owner.get(slot)
            if info is None or info.get("index") is None or info["index"] >= len(textures):
                report.add("fail", "GLB_TEXTURE_EXPORT", f"{material.name}：GLB 少了 {slot}")
        occlusion = entry.get("occlusionTexture")
        if occlusion is not None and occlusion.get("texCoord", 0) != 1:
            report.add("fail", "GLB_TEXTURE_EXPORT", f"{material.name}：occlusionTexture 應使用 TEXCOORD_1")
        mr = pbr.get("metallicRoughnessTexture")
        if occlusion is not None and mr is not None and occlusion.get("index") == mr.get("index") \
                and occlusion.get("texCoord", 0) != mr.get("texCoord", 0):
            # 匯出器把 AO（UVBake）和 ORM（UVMap）合成一張圖：兩種 UV 空間共用一個 sampler，結果不正確
            report.add("fail", "GLB_TEXTURE_EXPORT", f"{material.name}：occlusion 被合併進 metallicRoughness，"
                                                     "但兩者使用不同的 TEXCOORD")
        if material.get("lpk_alpha_mode") == "MASK" and entry.get("alphaMode") != "MASK":
            report.add("fail", "GLB_TEXTURE_EXPORT", f"{material.name}：decal 應為 alphaMode MASK，GLB 是 {entry.get('alphaMode')}")
    for index, image in enumerate(gltf_images):
        if image.get("mimeType") not in ("image/png", "image/webp", "image/jpeg", "image/ktx2"):
            report.add("fail", "GLB_TEXTURE_EXPORT", f"images[{index}] 的 mimeType {image.get('mimeType')!r} 不支援")
    budget = plan.get("budget", {})
    if image_bytes is not None:
        kb = image_bytes / 1024
        report.metrics["texture_kb"] = round(kb, 1)
        limit = float(budget.get("max_texture_kb", DEFAULT_TEXTURE_KB))
        if kb > limit:
            report.add("fail", "TEXTURE_BUDGET", f"GLB 內的貼圖 {kb:.0f} KB 超過預算 {limit:.0f} KB")
    report.metrics["images"] = len(gltf_images)
    report.metrics["mime_types"] = sorted({i.get("mimeType") for i in gltf_images})
    if file_bytes is not None:
        report.metrics["file_kb"] = round(file_bytes / 1024, 1)
    return report.result()


def glb_image_bytes(gltf):
    """GLB 裡所有圖片的位元組數（bufferView 長度加總）。"""
    views = gltf.get("bufferViews", [])
    return sum(views[i["bufferView"]]["byteLength"] for i in gltf.get("images", []) if "bufferView" in i)
