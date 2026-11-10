"""把 modifier 的結果烘焙成新的 Mesh，不使用 bpy.ops。

為什麼不用 bpy.ops.object.modifier_apply：operator 依賴目前的 context
（active object、選取狀態、mode），在 MCP 或背景模式下很容易因為 context 不對而失敗，
而且會直接改掉原本的 mesh。這裡改用 depsgraph 取得「套用 modifier 後」的結果，
產生一份新的 mesh，原本的資料完全不動，失敗時也不需要還原。
"""

import bpy


def resolve_mesh(obj):
    from .result import KitError

    if isinstance(obj, str):
        found = bpy.data.objects.get(obj)
        if found is None:
            raise KitError("OBJECT_NOT_FOUND", f"找不到 Object：{obj!r}")
        obj = found
    if obj is None:
        raise KitError("OBJECT_NOT_FOUND", "Object 是 None")
    if obj.type != "MESH":
        raise KitError("NOT_A_MESH", f"{obj.name} 的類型是 {obj.type}，不是 MESH")
    return obj


def resolve_object(obj):
    from .result import KitError

    if isinstance(obj, str):
        found = bpy.data.objects.get(obj)
        if found is None:
            raise KitError("OBJECT_NOT_FOUND", f"找不到 Object：{obj!r}")
        return found
    return obj


def ensure_object_mode(obj):
    from .result import KitError

    if obj.mode == "EDIT":
        # 編輯模式下 obj.data 不是最新的，用 bmesh.from_mesh 會讀到舊資料
        raise KitError("EDIT_MODE", f"{obj.name} 在編輯模式，請先切回 Object Mode")


def bake_modifiers(obj, only_names):
    """只套用名稱在 only_names 裡的 modifier，回傳一份新的 mesh。"""
    muted = []
    for mod in obj.modifiers:
        if mod.name not in only_names and mod.show_viewport:
            # depsgraph 依 viewport 顯示狀態計算，暫時關掉其他 modifier 才不會一起被套用
            mod.show_viewport = False
            muted.append(mod)
    try:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        depsgraph.update()
        evaluated = obj.evaluated_get(depsgraph)
        return bpy.data.meshes.new_from_object(
            evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
        )
    finally:
        for mod in muted:
            mod.show_viewport = True


def enum_identifiers(rna_type, prop_name):
    """從 bl_rna 讀出 enum 的合法值，不寫死（不同 Blender 版本可能不同）。"""
    return [item.identifier for item in rna_type.bl_rna.properties[prop_name].enum_items]
