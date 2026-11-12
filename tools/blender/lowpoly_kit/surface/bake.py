"""Texture Baking Engine（Blender 端，Cycles）。

兩種模式：
- ao：只烘 AO（環境遮蔽：角落、縫隙比較暗）→ 接到 glTF occlusionTexture（TEXCOORD_1）。
  原本的材質不變，Three.js 的 aoMap 會在環境光上壓暗角落
- full：把「貼圖 × vertex color × AO × 邊緣高光」全部烘進一張 unique 貼圖，
  再加上 ORM（AO、粗糙度、金屬度）與法線各一張。整個資產的不透明面合併成 1 個材質
  → primitive 變少；代價是需要比較大的 unique 貼圖

為什麼要 bake：glTF 不能匯出程序節點（AO 節點、Color Attribute 運算…），只能匯出圖片。

所有 render 設定在 finally 還原；暫時的材質複本、節點、world 都會刪掉。
"""

import math
import os
import time

import bmesh
import bpy
import numpy as np

from . import images as image_tools
from .material_builder import UV_BAKE, VERTEX_COLOR, _socket, build_textured, set_occlusion
from .uv import ensure_bake_uv

EDGE_ATTRIBUTE = "LPK_edge"
BAKED_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "textures", "baked")


class _BakeState:
    """記下會被改動的設定，結束時還原。"""

    def __init__(self, scene):
        self.scene = scene
        self.engine = scene.render.engine
        self.cycles = {}
        if hasattr(scene, "cycles"):
            self.cycles = {k: getattr(scene.cycles, k) for k in ("samples", "device", "use_denoising") if hasattr(scene.cycles, k)}
        self.world = scene.world
        self.temp_world = None
        self.distance = scene.world.light_settings.distance if scene.world else None
        view_layer = bpy.context.view_layer
        self.active = view_layer.objects.active
        self.selection = [o for o in view_layer.objects if o.select_get()]

    def setup(self, samples, distance):
        scene = self.scene
        try:
            scene.render.engine = "CYCLES"
        except TypeError as exc:  # enum 清單會少報，實際設定時才知道有沒有 Cycles
            raise RuntimeError(f"沒有 Cycles，無法 bake：{exc}") from exc
        scene.cycles.samples = samples
        scene.cycles.device = "CPU"  # CPU 結果可重現；GPU 依硬體不同會有微小差異
        if hasattr(scene.cycles, "use_denoising"):
            scene.cycles.use_denoising = False
        if scene.world is None:
            self.temp_world = bpy.data.worlds.new("LPK_bake_world")
            scene.world = self.temp_world
        scene.world.light_settings.distance = distance  # AO 的取樣距離：小物件要小，否則整個都是暗的

    def restore(self):
        scene = self.scene
        scene.render.engine = self.engine
        for key, value in self.cycles.items():
            setattr(scene.cycles, key, value)
        if self.temp_world is not None:
            scene.world = self.world
            bpy.data.worlds.remove(self.temp_world)
        elif self.world is not None and self.distance is not None:
            self.world.light_settings.distance = self.distance
        view_layer = bpy.context.view_layer
        for obj in view_layer.objects:
            obj.select_set(obj in self.selection)
        view_layer.objects.active = self.active


def _select(objects):
    view_layer = bpy.context.view_layer
    for obj in view_layer.objects:
        obj.select_set(False)
    for obj in objects:
        obj.select_set(True)
    view_layer.objects.active = objects[0]


def _unique_mesh_objects(objects):
    seen, result = set(), []
    for obj in objects:
        if obj.data.name not in seen:
            seen.add(obj.data.name)
            result.append(obj)
    return result


def _stats(image):
    pixels = image_tools.image_to_array(image)[:, :, :3]
    return {"min": round(float(pixels.min()), 3), "max": round(float(pixels.max()), 3),
            "mean": round(float(pixels.mean()), 3), "std": round(float(pixels.std()), 3)}


def _target_nodes(materials, image):
    """bake 寫入「材質中作用中的 Image Texture 節點」。每個材質暫時加一個指向目標圖片的節點。"""
    added = []
    for material in materials:
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        node.name = "LPK_bake_target"
        material.node_tree.nodes.active = node
        added.append((material, node))
    return added


def _remove_nodes(added):
    for material, node in added:
        material.node_tree.nodes.remove(node)


def _materials_of(objects):
    result = []
    for obj in objects:
        for material in obj.data.materials:
            if material is not None and material not in result:
                result.append(material)
    return result


def is_transparent(material):
    if material.get("lpk_alpha_mode") == "BLEND" or getattr(material, "surface_render_method", "") == "BLENDED":
        return True
    bsdf = next((n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if material.node_tree else None
    return bool(bsdf and not bsdf.inputs["Alpha"].links and bsdf.inputs["Alpha"].default_value < 1.0)


def _run_bake(kind, objects, padding):
    _select(objects)
    bpy.ops.object.bake(type=kind, margin=padding, uv_layer=UV_BAKE, use_clear=True)


# ---------------------------------------------------------------------------
# 邊緣遮罩（給 full bake 的邊緣高光）
# ---------------------------------------------------------------------------

def write_edge_mask(mesh):
    """每個頂點的凸度（0～1）寫進 color attribute：凸起的稜角 = 1，平面與凹角 = 0。

    手繪資產會在稜角畫一條亮邊（光打到邊緣）。Low Poly 的面很大，用頂點值在面上內插，
    亮度會從稜角往面中央漸淡，剛好是畫筆刷過邊緣的效果。
    """
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        values = np.zeros(len(bm.verts), dtype=np.float32)
        for edge in bm.edges:
            if len(edge.link_faces) != 2:
                continue
            angle = edge.calc_face_angle_signed(0.0)  # 凸邊為正、凹邊為負
            convex = min(max(angle / (math.pi / 2), 0.0), 1.0)
            for vert in edge.verts:
                values[vert.index] = max(values[vert.index], convex)
    finally:
        bm.free()
    attribute = mesh.color_attributes.get(EDGE_ATTRIBUTE) or mesh.color_attributes.new(EDGE_ATTRIBUTE, "FLOAT_COLOR", "POINT")
    rgba = np.repeat(values[:, None], 4, axis=1)
    rgba[:, 3] = 1.0
    attribute.data.foreach_set("color", rgba.ravel())
    return float(values.mean())


# ---------------------------------------------------------------------------
# AO
# ---------------------------------------------------------------------------

def bake_ao(plan_id, objects, size, padding, distance, samples=8, save_dir=None):
    """把 AO 烘到 UVBake，存檔驗證後接到每個材質的 occlusion。回傳報告。"""
    started = time.time()
    objects = _unique_mesh_objects(objects)
    layout = ensure_bake_uv(objects, padding, size)
    image = image_tools.image_from_array(f"LPK_{plan_id}_ao", np.ones((size, size, 4), np.float32), "ao", pack=False)
    materials = _materials_of(objects)
    state = _BakeState(bpy.context.scene)
    added = []
    try:
        state.setup(samples, distance)
        added = _target_nodes(materials, image)
        _run_bake("AO", objects, padding)
    finally:
        _remove_nodes(added)
        state.restore()
    saved = image_tools.save_and_verify(image, os.path.join(save_dir or BAKED_DIR, plan_id, "ao.png"))
    image.pack()
    for material in materials:
        # 半透明（玻璃）不接 AO：glTF 的 occlusion 只影響間接光，玻璃本來就幾乎看不到
        if is_transparent(material):
            continue
        set_occlusion(material, image, UV_BAKE)
    return {"mode": "ao", "image": image.name, "size": size, "stats": _stats(image), "saved": saved,
            "layout": layout, "seconds": round(time.time() - started, 2), "distance": round(distance, 4)}


# ---------------------------------------------------------------------------
# Full：把整個外觀烘成一張 unique 貼圖
# ---------------------------------------------------------------------------

def _authoring_copy(material, pass_name, edge_strength, distance):
    """依原材質做一個暫時的複本，Surface 改成 Emission：EMIT bake 會直接寫出 Emission 的顏色。

    pass_name = "color"：顏色 = 原本的 Base Color 來源 × AO × (1 + 邊緣高光)
    pass_name = "orm"：顏色 = (AO, 粗糙度, 金屬度)
    """
    copy = material.copy()
    copy.name = f"{material.name}__bake_{pass_name}"
    nodes, links = copy.node_tree.nodes, copy.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    output = next(n for n in nodes if n.type == "OUTPUT_MATERIAL")

    def source(socket_name):
        socket = bsdf.inputs[socket_name]
        if socket.links:
            return socket.links[0].from_socket
        value = nodes.new("ShaderNodeValue") if socket.type == "VALUE" else nodes.new("ShaderNodeRGB")
        value.outputs[0].default_value = socket.default_value
        return value.outputs[0]

    ao = nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = distance
    ao.samples = 16
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = 1.0
    if pass_name == "color":
        multiply = nodes.new("ShaderNodeMix")
        multiply.data_type = "RGBA"
        multiply.blend_type = "MULTIPLY"
        _socket(multiply.inputs, "Factor_Float").default_value = 1.0
        links.new(source("Base Color"), _socket(multiply.inputs, "A_Color"))
        links.new(ao.outputs["AO"], _socket(multiply.inputs, "B_Color"))
        edge = nodes.new("ShaderNodeVertexColor")
        edge.layer_name = EDGE_ATTRIBUTE
        brighten = nodes.new("ShaderNodeMix")
        brighten.data_type = "RGBA"
        brighten.blend_type = "SCREEN"
        links.new(_socket(multiply.outputs, "Result_Color"), _socket(brighten.inputs, "A_Color"))
        _socket(brighten.inputs, "B_Color").default_value = (1.0, 0.96, 0.88, 1.0)  # 邊緣高光偏暖白
        factor = nodes.new("ShaderNodeMath")
        factor.operation = "MULTIPLY"
        factor.inputs[1].default_value = edge_strength
        links.new(edge.outputs["Color"], factor.inputs[0])
        links.new(factor.outputs[0], _socket(brighten.inputs, "Factor_Float"))
        links.new(_socket(brighten.outputs, "Result_Color"), emission.inputs["Color"])
    else:
        combine = nodes.new("ShaderNodeCombineColor")
        links.new(ao.outputs["AO"], combine.inputs["Red"])
        links.new(source("Roughness"), combine.inputs["Green"])
        links.new(source("Metallic"), combine.inputs["Blue"])
        links.new(combine.outputs["Color"], emission.inputs["Color"])
    for link in list(output.inputs["Surface"].links):
        links.remove(link)
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return copy


def _swap_slots(objects, mapping):
    for obj in objects:
        for slot in obj.material_slots:
            if slot.material in mapping:
                slot.material = mapping[slot.material]


def bake_full(plan_id, objects, size, padding, distance, edge_strength=0.35, samples=16, save_dir=None):
    """回傳 (報告, baked_material)。呼叫端負責把不透明的材質槽換成 baked_material。"""
    started = time.time()
    objects = _unique_mesh_objects(objects)
    layout = ensure_bake_uv(objects, padding, size)
    for obj in objects:
        write_edge_mask(obj.data)
    blank = np.ones((size, size, 4), np.float32)
    targets = {
        "color": image_tools.image_from_array(f"LPK_{plan_id}_baked_base", blank, "baked_base", pack=False),
        "orm": image_tools.image_from_array(f"LPK_{plan_id}_baked_orm", blank, "orm", pack=False),
        "normal": image_tools.image_from_array(f"LPK_{plan_id}_baked_normal", blank, "normal", pack=False),
    }
    originals = _materials_of(objects)
    state = _BakeState(bpy.context.scene)
    report = {"mode": "full", "size": size, "layout": layout, "passes": {}}
    try:
        state.setup(samples, distance)
        for pass_name in ("color", "orm"):
            copies = {m: _authoring_copy(m, pass_name, edge_strength, distance) for m in originals}
            _swap_slots(objects, copies)
            added = _target_nodes(list(copies.values()), targets[pass_name])
            try:
                _run_bake("EMIT", objects, padding)
            finally:
                _remove_nodes(added)
                _swap_slots(objects, {copy: original for original, copy in copies.items()})
                for copy in copies.values():
                    bpy.data.materials.remove(copy)
        # 法線：用原本的材質（含平鋪的法線貼圖）烘成 UVBake 空間的 tangent 法線
        added = _target_nodes(originals, targets["normal"])
        try:
            bpy.context.scene.render.bake.normal_space = "TANGENT"
            _run_bake("NORMAL", objects, padding)
        finally:
            _remove_nodes(added)
    finally:
        state.restore()
    folder = os.path.join(save_dir or BAKED_DIR, plan_id)
    for name, image in targets.items():
        report["passes"][name] = {"image": image.name, "stats": _stats(image),
                                  "saved": image_tools.save_and_verify(image, os.path.join(folder, f"{name}.png"))}
        image.pack()
    material = build_textured(f"LPK_{plan_id}_baked", {"base": targets["color"], "orm": targets["orm"],
                                                      "normal": targets["normal"]}, uv=UV_BAKE, repeat=False)
    material["lpk_asset"] = plan_id
    for obj in objects:
        for name in (VERTEX_COLOR, EDGE_ATTRIBUTE):
            attribute = obj.data.color_attributes.get(name)
            if attribute is not None:  # 顏色已經烘進貼圖；留著的話 Three.js 會再乘一次 vertex color
                obj.data.color_attributes.remove(attribute)
    report["seconds"] = round(time.time() - started, 2)
    report["distance"] = round(distance, 4)
    return report, material
