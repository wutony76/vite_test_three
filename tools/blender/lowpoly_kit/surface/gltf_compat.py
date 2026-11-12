"""glTF 相容性檢查（Blender 端）：材質節點白名單、圖片 color space。

匯出器遇到不認得的節點不會報錯，只會默默略過 → GLB 少了貼圖，到 Three.js 才發現。
所以在匯出前，由 Texture QA 用這裡的規則逐一檢查。
"""

import bpy

from .material_builder import GLTF_GROUP

# node.type（不受介面語言影響）→ 允許
ALLOWED = {
    "OUTPUT_MATERIAL", "BSDF_PRINCIPLED", "TEX_IMAGE", "UVMAP", "SEPARATE_COLOR", "NORMAL_MAP",
    "VERTEX_COLOR", "MIX", "GROUP", "MATH",
}
COLOR_SOCKETS = {"Base Color", "Emission Color"}


def _downstream_sockets(node, seen=None):
    """從某個節點往下游走，找出最後接到哪些 BSDF／group 輸入（名稱）。"""
    seen = seen or set()
    names = set()
    for output in node.outputs:
        for link in output.links:
            target = link.to_node
            if target.type in ("BSDF_PRINCIPLED", "GROUP"):
                names.add(link.to_socket.name)
            elif target.name not in seen:
                seen.add(target.name)
                names |= _downstream_sockets(target, seen)
    return names


def image_roles(material):
    """[(image, 接到的 socket 名稱集合)]：用來判斷圖片該是 sRGB 還是 Non-Color。"""
    if material.node_tree is None:
        return []
    return [(n.image, _downstream_sockets(n)) for n in material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]


def check_material(material):
    """回傳問題清單 [(code, message)]。"""
    issues = []
    if material.node_tree is None:
        return issues
    for node in material.node_tree.nodes:
        if node.type not in ALLOWED:
            issues.append(("NODE_COMPAT", f"{material.name}：節點 {node.bl_idname} 不能匯出成 glTF（要先 bake 成圖片）"))
        elif node.type == "GROUP" and (node.node_tree is None or node.node_tree.name != GLTF_GROUP):
            issues.append(("NODE_COMPAT", f"{material.name}：node group {getattr(node.node_tree, 'name', None)!r} 不是 {GLTF_GROUP}"))
        elif node.type == "MATH" and node.operation != "ROUND":
            issues.append(("NODE_COMPAT", f"{material.name}：Math 節點只允許 ROUND（alpha clip）"))
        elif node.type == "TEX_IMAGE" and node.image is None:
            issues.append(("TEXTURE_MISSING", f"{material.name}：Image Texture 節點沒有圖片"))
    for image, sockets in image_roles(material):
        if not sockets:
            continue
        wants_color = bool(sockets & COLOR_SOCKETS)
        expected = "sRGB" if wants_color else "Non-Color"
        actual = image.colorspace_settings.name
        if actual != expected:
            issues.append(("COLOR_SPACE", f"{material.name}：{image.name} 接到 {sorted(sockets)}，"
                                          f"color space 應為 {expected}，目前是 {actual}"))
    return issues


def image_file_ok(image):
    """打包進 .blend，或是外部檔案存在，匯出時才拿得到像素。"""
    if image.packed_file is not None or image.source == "GENERATED":
        return True
    path = bpy.path.abspath(image.filepath)
    import os
    return bool(path) and os.path.exists(path)
