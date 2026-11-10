"""Boolean Union：把互相穿插的幾何融合成一個連續的 Mesh。

流程：在 target 上加 Boolean modifier → 用 depsgraph 烘焙成新 mesh → 移除 modifier。
原本的 mesh 在烘焙時完全不動，烘焙結果不合格就直接丟掉。

Solver：
- MANIFOLD（Blender 4.5+）：速度快、結果穩定，但輸入必須是封閉的流形
- EXACT：較慢，但能處理不完美的輸入
預設先用 MANIFOLD，結果是空的就自動退回 EXACT。
"""

import bpy

from .evaluate import bake_modifiers, enum_identifiers
from .result import KitError

MODIFIER_PREFIX = "LPK_Union_"


def available_solvers():
    return enum_identifiers(bpy.types.BooleanModifier, "solver")


def solver_order(preferred):
    solvers = available_solvers()
    order = [preferred] + [s for s in ("EXACT", "MANIFOLD") if s != preferred]
    order = [s for s in order if s in solvers and s != "FLOAT"]
    if preferred not in solvers:
        raise KitError("INVALID_ARGUMENT", f"不支援的 solver {preferred!r}，可用：{solvers}")
    return order


def union_mesh(target, others, solver):
    """回傳 target ∪ others 的新 mesh（不修改 target）。"""
    material_modes = enum_identifiers(bpy.types.BooleanModifier, "material_mode")
    names = []
    try:
        for index, other in enumerate(others):
            mod = target.modifiers.new(f"{MODIFIER_PREFIX}{index}", "BOOLEAN")
            mod.operation = "UNION"
            mod.solver = solver
            mod.object = other
            # TRANSFER：把煙囪等物件的材質一起帶過來；少了它，融合後全部變成 target 的材質
            if "TRANSFER" in material_modes:
                mod.material_mode = "TRANSFER"
            names.append(mod.name)
        return bake_modifiers(target, set(names))
    finally:
        for name in names:
            mod = target.modifiers.get(name)
            if mod is not None:
                target.modifiers.remove(mod)
