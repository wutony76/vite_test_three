"""Texture QA 的每條規則：先建一個通過的資產，再逐一「弄壞」，確認對應的規則抓得到。"""

import os

import bpy
import numpy as np

from lowpoly_kit import api
from lowpoly_kit.pipeline import load_plan, resolve_detail
from lowpoly_kit.qa.texture import check_asset_textures, check_glb_textures
from lowpoly_kit.surface.material_builder import UV0, UV_BAKE

PLAN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plans", "crate_pile.plan.json")


def _build():
    result = api.build_asset_from_plan(PLAN)
    assert result["ok"], result["errors"]
    doc, _ = load_plan(PLAN)
    detail = resolve_detail(doc["detail"], doc["id"])[0].to_dict()
    return doc, bpy.data.objects["crate_pile_Root"], detail, result["report"]["appearance"]


def _codes(report, level="fail"):
    return {i["code"] for i in report["issues"] if i["level"] == level}


def test_clean_build_passes():
    doc, root, detail, surface = _build()
    report = check_asset_textures(doc, root, detail, surface)
    assert report["status"] == "pass", report["issues"]


def test_missing_uv_layer():
    doc, root, detail, surface = _build()
    mesh = bpy.data.objects["crate_pile_crate_big"].data
    mesh.uv_layers.remove(mesh.uv_layers[UV_BAKE])
    assert "UV_MISSING" in _codes(check_asset_textures(doc, root, detail, surface))


def test_wrong_color_space():
    doc, root, detail, surface = _build()
    image = bpy.data.images[surface["materials"]["wood"]["images"]["orm"]]
    image.colorspace_settings.name = "sRGB"
    assert "COLOR_SPACE" in _codes(check_asset_textures(doc, root, detail, surface))


def test_unexportable_node():
    doc, root, detail, surface = _build()
    bpy.data.materials["LPK_crate_pile_wood"].node_tree.nodes.new("ShaderNodeTexVoronoi")
    assert "NODE_COMPAT" in _codes(check_asset_textures(doc, root, detail, surface))


def test_missing_texture_image():
    doc, root, detail, surface = _build()
    material = bpy.data.materials["LPK_crate_pile_wood"]
    node = next(n for n in material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image.get("lpk_role") == "base")
    node.image = None
    assert "TEXTURE_MISSING" in _codes(check_asset_textures(doc, root, detail, surface))


def test_external_file_missing():
    doc, root, detail, surface = _build()
    image = bpy.data.images[surface["materials"]["wood"]["images"]["base"]]
    image.unpack(method="REMOVE")
    image.filepath = "//does/not/exist.png"
    assert "EXTERNAL_FILE_MISSING" in _codes(check_asset_textures(doc, root, detail, surface))


def test_uv_stretch():
    doc, root, detail, surface = _build()
    mesh = bpy.data.objects["crate_pile_crate_big"].data
    layer = mesh.uv_layers[UV0]
    uv = np.empty(len(mesh.loops) * 2)
    layer.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    uv[:, 0] *= 3.0  # u 方向拉長 3 倍：木板會變得又細又長
    layer.data.foreach_set("uv", uv.ravel())
    assert "UV_STRETCH" in _codes(check_asset_textures(doc, root, detail, surface))


def test_bake_uv_overlap():
    doc, root, detail, surface = _build()
    big, small = bpy.data.objects["crate_pile_crate_big"].data, bpy.data.objects["crate_pile_crate_small"].data
    source = np.empty(len(big.loops) * 2)
    big.uv_layers[UV_BAKE].data.foreach_get("uv", source)
    # 兩個木箱的 mesh 拓撲相同：把小木箱的 UVBake 改成和大木箱一模一樣 → 完全重疊
    small.uv_layers[UV_BAKE].data.foreach_set("uv", source[: len(small.loops) * 2])
    report = check_asset_textures(doc, root, detail, surface)
    assert "UV_OVERLAP" in _codes(report), report["metrics"]


def test_texel_density_too_low():
    doc, root, detail, surface = _build()
    mesh = bpy.data.objects["crate_pile_crate_big"].data
    layer = mesh.uv_layers[UV0]
    uv = np.empty(len(mesh.loops) * 2)
    layer.data.foreach_get("uv", uv)
    layer.data.foreach_set("uv", uv * 0.1)  # 整體縮小 10 倍：一張貼圖拉滿 10 倍面積 → 很糊
    assert "TEXEL_DENSITY" in _codes(check_asset_textures(doc, root, detail, surface), "warn")


def test_texture_budget():
    doc, root, detail, surface = _build()
    doc["budget"]["max_gpu_texture_mb"] = 1
    assert "TEXTURE_BUDGET" in _codes(check_asset_textures(doc, root, detail, surface))


def test_seam_warning_on_non_tileable_image():
    doc, root, detail, surface = _build()
    image = bpy.data.images[surface["materials"]["wood"]["images"]["base"]]
    width, height = image.size
    ramp = np.zeros((height, width, 4), np.float32)
    ramp[:, :, :3] = np.linspace(0, 1, width)[None, :, None]
    ramp[:, :, 3] = 1
    image.pixels.foreach_set(np.flipud(ramp).ravel())
    assert "TEXTURE_SEAM" in _codes(check_asset_textures(doc, root, detail, surface), "warn")


def test_glb_checks_catch_missing_slots_and_merged_occlusion():
    _doc, root, _detail, _surface = _build()
    doc, _ = load_plan(PLAN)
    gltf = {
        "materials": [
            {"name": "LPK_crate_pile_wood", "pbrMetallicRoughness": {"metallicRoughnessTexture": {"index": 0}},
             "occlusionTexture": {"index": 0, "texCoord": 1}},
        ],
        "textures": [{"source": 0}], "images": [{"mimeType": "image/png", "bufferView": 0}],
        "bufferViews": [{"byteLength": 10}],
    }
    report = check_glb_textures(gltf, root, doc, image_bytes=10)
    messages = " ".join(i["message"] for i in report["issues"])
    assert "baseColorTexture" in messages and "normalTexture" in messages and "合併" in messages
    gltf["images"][0]["mimeType"] = "image/gif"
    assert any("mimeType" in i["message"] for i in check_glb_textures(gltf, root, doc)["issues"])
