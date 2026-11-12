"""Material Builder：依貼圖建立 Shader Nodes，只用 glTF 匯出得了的節點（Blender 端）。

glTF 的材質模型是固定的：baseColor × COLOR_0、metallicRoughness（G = 粗糙度、B = 金屬度）、
normal、occlusion、emissive。Blender 匯出器只認得「接近這個模型」的節點組合，
程序節點（Noise、Voronoi、Bump、ColorRamp…）一律匯不出去，所以程序效果要先畫成圖片或 bake。

節點組合（每個節點都對應 glTF 的一個欄位）：
  Image(base, sRGB) [× Color Attribute] → Base Color
  Image(orm, Non-Color) → Separate Color → G: Roughness、B: Metallic、R: glTF Material Output.Occlusion
  Image(normal, Non-Color) → Normal Map(Tangent) → Normal
  UV Map 節點指定每張圖用哪一組 UV（UVMap = TEXCOORD_0、UVBake = TEXCOORD_1）
"""

import bpy

GLTF_GROUP = "glTF Material Output"  # 名稱寫死在 Blender 的 glTF 匯出器裡（spike 確認：5.2 版）
UV0, UV_BAKE = "UVMap", "UVBake"
VERTEX_COLOR = "Col"


def _socket(sockets, identifier):
    """Mix 節點有好幾個同名的「A」「B」（Float／Vector／Color 各一組），要用 identifier 找。"""
    return next(s for s in sockets if s.identifier == identifier)


def gltf_output_group():
    """glTF 匯出器靠這個 node group 的「Occlusion」輸入匯出 occlusionTexture。整個檔案共用一個。"""
    group = bpy.data.node_groups.get(GLTF_GROUP)
    if group is None:
        group = bpy.data.node_groups.new(GLTF_GROUP, "ShaderNodeTree")
        group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return group


def _fresh_material(name):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    if material.node_tree is None:
        material.use_nodes = True  # Blender 6.0 會移除這個屬性；新版的材質預設就有 node tree
    material.node_tree.nodes.clear()
    return material


def _image_node(nodes, links, image, uv_name, x, y, repeat=True, closest=False):
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    node.location = (x, y)
    # REPEAT → glTF sampler 的 REPEAT（平鋪）；EXTEND → CLAMP_TO_EDGE（unique 貼圖，避免邊緣取到對面）
    node.extension = "REPEAT" if repeat else "EXTEND"
    node.interpolation = "Closest" if closest else "Linear"
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = uv_name
    uv.location = (x - 220, y - 60)
    links.new(uv.outputs["UV"], node.inputs["Vector"])
    return node


def build_textured(name, maps, uv=UV0, repeat=True, vertex_color=False, emissive=False,
                   emission_strength=1.5, normal_strength=1.0, alpha_mode="OPAQUE", closest=False):
    """maps：{"base": Image, "orm": Image?, "normal": Image?, "occlusion": (Image, uv)?}。回傳 material。"""
    material = _fresh_material(name)
    nodes, links = material.node_tree.nodes, material.node_tree.links
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (600, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (300, 0)
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])

    base = _image_node(nodes, links, maps["base"], uv, -300, 300, repeat, closest)
    color_out = base.outputs["Color"]
    if vertex_color:
        attribute = nodes.new("ShaderNodeVertexColor")
        attribute.layer_name = VERTEX_COLOR
        attribute.location = (-300, 500)
        mix = nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.location = (0, 380)
        _socket(mix.inputs, "Factor_Float").default_value = 1.0
        links.new(color_out, _socket(mix.inputs, "A_Color"))
        links.new(attribute.outputs["Color"], _socket(mix.inputs, "B_Color"))
        color_out = _socket(mix.outputs, "Result_Color")
    links.new(color_out, bsdf.inputs["Base Color"])
    if alpha_mode == "MASK":
        # Blender 4.2 之後，glTF 匯出器看到「Alpha 前面接 Math(Round)」才輸出 alphaMode = MASK（門檻 0.5）
        clip = nodes.new("ShaderNodeMath")
        clip.operation = "ROUND"
        clip.location = (0, 150)
        links.new(base.outputs["Alpha"], clip.inputs[0])
        links.new(clip.outputs["Value"], bsdf.inputs["Alpha"])
    elif alpha_mode == "BLEND":
        links.new(base.outputs["Alpha"], bsdf.inputs["Alpha"])
    if emissive:
        links.new(base.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength

    if maps.get("orm") is not None:
        orm = _image_node(nodes, links, maps["orm"], uv, -300, 0, repeat, closest)
        separate = nodes.new("ShaderNodeSeparateColor")
        separate.location = (0, 0)
        links.new(orm.outputs["Color"], separate.inputs["Color"])
        links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
    if maps.get("normal") is not None:
        normal = _image_node(nodes, links, maps["normal"], uv, -300, -300, repeat, closest)
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.space = "TANGENT"
        normal_map.uv_map = uv
        normal_map.inputs["Strength"].default_value = normal_strength
        normal_map.location = (0, -300)
        links.new(normal.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    if maps.get("occlusion") is not None:
        set_occlusion(material, *maps["occlusion"])

    nodes.active = base  # Workbench 的 TEXTURE 顯示模式顯示「作用中的貼圖節點」
    set_alpha_mode(material, alpha_mode)
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    return material


def set_occlusion(material, image, uv_name=UV_BAKE):
    """把 AO 圖接到 glTF Material Output 的 Occlusion（匯出成 occlusionTexture，texCoord 指向 uv_name）。"""
    nodes, links = material.node_tree.nodes, material.node_tree.links
    for node in [n for n in nodes if n.type == "GROUP" and n.node_tree and n.node_tree.name == GLTF_GROUP]:
        nodes.remove(node)
    for node in [n for n in nodes if n.get("lpk_occlusion")]:
        nodes.remove(node)
    tex = _image_node(nodes, links, image, uv_name, -300, -600, repeat=False)
    tex["lpk_occlusion"] = True
    separate = nodes.new("ShaderNodeSeparateColor")
    separate["lpk_occlusion"] = True
    separate.location = (0, -600)
    group = nodes.new("ShaderNodeGroup")
    group.node_tree = gltf_output_group()
    group.location = (300, -600)
    links.new(tex.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Red"], group.inputs["Occlusion"])
    # UV Map 節點也標記，下次重設時一起清掉
    for link in tex.inputs["Vector"].links:
        link.from_node["lpk_occlusion"] = True
    return material


def set_alpha_mode(material, mode):
    """OPAQUE／MASK（decal：alpha < 0.5 直接不畫，不需要排序）／BLEND（玻璃）。"""
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "BLENDED" if mode == "BLEND" else "DITHERED"
    if mode == "MASK" and hasattr(material, "alpha_threshold"):
        material.alpha_threshold = 0.5
    material["lpk_alpha_mode"] = mode
