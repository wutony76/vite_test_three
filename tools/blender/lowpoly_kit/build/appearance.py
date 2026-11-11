"""外觀（Blender 端）：palette atlas 材質、UV、vertex color。

依 DetailConfig：
- material_quality = flat，或 texture_quality = none：維持一色一材質（Phase 3 的做法）
- palette：所有不透明的面共用 atlas 材質（發光的面共用 atlas_emissive），玻璃維持獨立
- palette_vc：再加上 vertex color 的明暗起伏與高度漸層
"""

import struct
import zlib

import bpy
import numpy as np

from ..appearance import atlas
from .materials import material_name

VC_NAME = "Col"


def _socket(sockets, identifier):
    """用 identifier 找 socket：Mix 節點有好幾個同名的「A」「B」（Float／Vector／Color 各一組）。"""
    return next(s for s in sockets if s.identifier == identifier)


def _image(name, pixels, colorspace):
    """把左上為原點的像素陣列寫成 Blender 圖片（Blender 的 pixels 從最下面一列開始，要上下翻轉）。"""
    size = pixels.shape[0]
    image = bpy.data.images.get(name)
    if image is not None and tuple(image.size) != (size, size):
        bpy.data.images.remove(image)
        image = None
    if image is None:
        image = bpy.data.images.new(name, size, size, alpha=True)
    image.colorspace_settings.name = colorspace
    image.pixels.foreach_set(np.flipud(pixels).ravel())
    image.pack()  # 打包進 .blend；匯出 GLB 時會內嵌成 PNG
    return image


def _atlas_material(name, color_image, mr_image, emissive, vertex_color):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if material.node_tree is None:
        material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    color = nodes.new("ShaderNodeTexImage")
    color.image = color_image
    # Closest：匯出成 glTF sampler 的 NEAREST。用線性取樣的話，貼圖縮小時相鄰色格會混在一起
    color.interpolation = "Closest"
    mr = nodes.new("ShaderNodeTexImage")
    mr.image = mr_image
    mr.interpolation = "Closest"
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(mr.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
    if vertex_color:
        attribute = nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = VC_NAME
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        _socket(mix.inputs, "Factor_Float").default_value = 1.0
        links.new(color.outputs["Color"], _socket(mix.inputs, "A_Color"))
        links.new(attribute.outputs["Color"], _socket(mix.inputs, "B_Color"))
        links.new(_socket(mix.outputs, "Result_Color"), bsdf.inputs["Base Color"])
    else:
        links.new(color.outputs["Color"], bsdf.inputs["Base Color"])
    if emissive:
        links.new(color.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.5
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    nodes.active = color  # Workbench 的 TEXTURE 顯示模式用「作用中的貼圖節點」
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    return material


def _face_shade(center, height, seed):
    """面的亮度係數：固定的明暗起伏（±6%）× 高度漸層（牆腳 0.86 → 頂端 1.0）。

    水彩的顏色本來就不均勻、而且上亮下暗；純色平塗會讓整面牆像塑膠。
    用面中心的位置做雜湊，同一份 plan 每次結果都一樣。
    """
    key = struct.pack("<3i", *(round(c * 1000) for c in center))
    jitter = (zlib.crc32(key, seed & 0xFFFFFFFF) & 0xFFFF) / 0xFFFF  # 0～1
    ratio = min(max(center[2] / height, 0.0), 1.0) if height > 0 else 1.0
    return (0.94 + 0.06 * jitter) * (0.86 + 0.14 * ratio)


def apply_appearance(plan_id, specs, objects, detail, asset_height, seed, ground_z=0.0):
    """objects：[(component_id, obj)]；ground_z：資產根節點的世界 z。回傳報告（模式、atlas 尺寸、處理的 mesh 數）。

    呼叫前要先 view_layer.update()，matrix_world 才是最新的位置。
    """
    mq, tq = detail["material_quality"], detail["texture_quality"]
    if mq == "flat":
        return {"mode": "flat"}
    if tq == "none":
        return {"mode": "flat", "note": f"material_quality={mq} 需要貼圖，但 texture_quality=none，退回 flat"}

    size = atlas.SIZES[tq]
    cells = atlas.layout(specs)
    color_image = _image(f"LPK_{plan_id}_atlas_color", atlas.color_pixels(specs, size), "sRGB")
    mr_image = _image(f"LPK_{plan_id}_atlas_mr", atlas.mr_pixels(specs, size), "Non-Color")
    vertex_color = mq == "palette_vc"
    opaque = _atlas_material(material_name(plan_id, "atlas"), color_image, mr_image, False, vertex_color)
    glowing = _atlas_material(material_name(plan_id, "atlas_emissive"), color_image, mr_image, True, vertex_color)
    for material in (opaque, glowing):
        material["lpk_asset"] = plan_id
    spec_of = {material_name(plan_id, s["name"]): s for s in specs}

    done = set()
    for _cid, obj in objects:
        mesh = obj.data
        if mesh.name in done:
            continue
        done.add(mesh.name)
        old = [m.name if m else None for m in mesh.materials]
        uv = mesh.uv_layers.get("UVMap") or mesh.uv_layers.new(name="UVMap")
        new_slots = []

        def slot(material):
            if material not in new_slots:
                new_slots.append(material)
            return new_slots.index(material)

        assignments = []
        for poly in mesh.polygons:
            spec = spec_of.get(old[poly.material_index])
            if spec is None or not atlas.is_opaque(spec):
                # 玻璃（或不屬於 plan 的材質）維持原本的材質
                target = mesh.materials[poly.material_index]
                u, v = 0.5, 0.5
            else:
                target = glowing if spec.get("emissive") else opaque
                u, v = atlas.cell_uv(*cells[spec["name"]])
            assignments.append(slot(target))
            for loop_index in poly.loop_indices:
                uv.data[loop_index].uv = (u, v)

        mesh.materials.clear()
        for material in new_slots:
            mesh.materials.append(material)
        for poly, index in zip(mesh.polygons, assignments):
            poly.material_index = index

        if vertex_color:
            attribute = mesh.color_attributes.get(VC_NAME) or mesh.color_attributes.new(VC_NAME, "BYTE_COLOR", "CORNER")
            mesh.color_attributes.active_color = attribute
            for poly in mesh.polygons:
                center = obj.matrix_world @ poly.center
                # 高度用「離資產地面多高」：資產放在 z = 10 的山坡上時，漸層一樣從牆腳開始
                shade = _face_shade((center.x, center.y, center.z - ground_z), asset_height, seed)
                for loop_index in poly.loop_indices:
                    attribute.data[loop_index].color = (shade, shade, shade, 1.0)
        mesh.update()

    return {"mode": mq, "atlas_size": size, "colors": len(cells), "meshes": len(done)}
