"""Voxel Remesh：只給岩石、小島這類有機物使用。

Voxel Remesh 會把形狀重新取樣成均勻的網格：外型變平滑、稜角消失、面數大增。
用在建築上會讓牆角變圓、窗框糊掉，所以 api 層只允許 organic profile 呼叫。
"""

import bpy

from .evaluate import bake_modifiers, enum_identifiers
from .result import KitError

MODIFIER_NAME = "LPK_VoxelRemesh"


def voxel_remesh_mesh(obj, voxel_size):
    modes = enum_identifiers(bpy.types.RemeshModifier, "mode")
    if "VOXEL" not in modes:
        raise KitError("INVALID_ARGUMENT", f"這個 Blender 版本的 Remesh 沒有 VOXEL 模式：{modes}")
    mod = obj.modifiers.new(MODIFIER_NAME, "REMESH")
    try:
        mod.mode = "VOXEL"
        mod.voxel_size = voxel_size
        return bake_modifiers(obj, {MODIFIER_NAME})
    finally:
        obj.modifiers.remove(obj.modifiers[MODIFIER_NAME])
