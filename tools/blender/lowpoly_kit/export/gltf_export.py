"""只匯出指定根節點底下的階層成 GLB。

- use_selection：只匯出選取的物件，燈光、攝影機、其他建築都不會混進去
- export_apply：modifier 只套用在匯出的資料上，場景裡的物件不會被改
- export_yup：Blender 是 Z 朝上，glTF / Three.js 是 Y 朝上，匯出時轉換
- export_extras：Object 的 custom property（例如 lowpoly_profile）
  會變成 Three.js 的 object.userData
"""

import os

import bpy

from ..result import KitError


def _gltf_props():
    return bpy.ops.export_scene.gltf.get_rna_type().properties


def export_glb(root, filepath, apply_modifiers=True):
    props = _gltf_props()
    # export_format 是動態 enum（選項由 callback 產生），沒有 context 時讀出來可能是空的。
    # 讀得到就確認 GLB 存在；讀不到就直接用 "GLB"，傳錯時匯出器會丟 TypeError 並列出合法值。
    formats = [item.identifier for item in props["export_format"].enum_items]
    if formats and "GLB" not in formats:
        raise KitError("EXPORT_FAILED", f"glTF 匯出器沒有 GLB 格式：{formats}")
    fmt = "GLB"

    targets = [root, *root.children_recursive]
    view_layer = bpy.context.view_layer
    previous_selection = [o for o in view_layer.objects if o.select_get()]
    previous_active = view_layer.objects.active

    kwargs = {
        "filepath": filepath,
        "use_selection": True,
        "export_format": fmt,
        "export_apply": apply_modifiers,
        "export_yup": True,
    }
    if "export_extras" in props:
        kwargs["export_extras"] = True
    if "export_vertex_color" in props:
        # ACTIVE：匯出作用中的 color attribute 成 COLOR_0（palette_vc 的明暗起伏）。
        # 預設的 MATERIAL 只在 exporter 認得材質節點組合時才匯出，貼圖 × vertex color 的組合不一定認得
        kwargs["export_vertex_color"] = "ACTIVE"

    os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
    try:
        for obj in view_layer.objects:
            obj.select_set(False)
        for obj in targets:
            if obj.name not in view_layer.objects:
                raise KitError("EXPORT_FAILED", f"{obj.name} 不在目前的 view layer，無法選取匯出")
            obj.select_set(True)
        view_layer.objects.active = root
        result = bpy.ops.export_scene.gltf(**kwargs)
        if "FINISHED" not in result:
            raise KitError("EXPORT_FAILED", f"glTF 匯出回傳 {result}")
    finally:
        # 還原使用者原本的選取狀態，不留下副作用
        for obj in view_layer.objects:
            obj.select_set(obj in previous_selection)
        view_layer.objects.active = previous_active
    return [o.name for o in targets]
