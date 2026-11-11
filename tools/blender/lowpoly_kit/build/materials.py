"""依 plan 的 materials 建立 Blender 材質。

和 mesh_builder.get_or_create_material 的差別：材質已存在時也會更新數值。
少了這點，plan 改了顏色重建後，畫面還是舊的顏色（舊版 preset 就遇過這個問題）。
"""

import bpy


def srgb_to_linear(c):
    """hex 色碼是 sRGB（人眼看到的值）；Principled BSDF 的顏色要填 linear。

    少了轉換，所有顏色都會偏亮、偏灰（例如 #808080 會變成接近 #BCBCBC 的亮度）。
    """
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_value):
    value = hex_value.lstrip("#")
    return tuple(srgb_to_linear(int(value[i:i + 2], 16) / 255) for i in (0, 2, 4))


def material_name(plan_id, name):
    return f"LPK_{plan_id}_{name}"


def ensure_material(plan_id, spec):
    mat_name = material_name(plan_id, spec["name"])
    material = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
    if material.node_tree is None:
        material.use_nodes = True
    color = (*hex_to_linear(spec["hex"]), 1.0)
    alpha = spec.get("alpha", 1.0)
    # 用節點類型找，不用名稱找：節點名稱會隨 Blender 介面語言改變
    bsdf = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    values = {
        "Base Color": color,
        "Roughness": spec.get("roughness", 0.8),
        "Metallic": spec.get("metallic", 0.0),
        "Alpha": alpha,
    }
    if spec.get("emissive"):
        values["Emission Color"] = color
        values["Emission Strength"] = spec.get("emission_strength", 1.5)
    else:
        values["Emission Strength"] = 0.0
    for key, value in values.items():
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = value
    # 半透明：glTF 匯出時依這個設定輸出 alphaMode = BLEND；Three.js 才會畫成半透明
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "BLENDED" if alpha < 1.0 else "DITHERED"
    elif hasattr(material, "blend_method"):
        material.blend_method = "BLEND" if alpha < 1.0 else "OPAQUE"
    # viewport（Solid／Workbench）顯示用的顏色，不影響匯出
    material.diffuse_color = (*color[:3], alpha)
    material["lpk_asset"] = plan_id
    return material


def ensure_all(plan_id, specs):
    return {spec["name"]: ensure_material(plan_id, spec) for spec in specs}
