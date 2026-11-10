"""對外介面。透過 MCP 的 execute_blender_code 呼叫時，只需要用到這個模組。

所有函式：
- 接受 Object 或 Object 名稱
- 回傳 {"ok", "object", "changes", "report", "errors", "backup"}，不往外丟例外
- 會修改模型的函式，修改前一定先備份；操作失敗或結果沒通過驗證時自動還原

驗證用的 profile：參數 profile 優先，其次是 Object 的 custom property `lowpoly_profile`。
"""

import bmesh
import bpy

from . import backup as _backup
from . import boolean_engine, extrusion, lowpoly, mesh_builder, remesh_engine, repair
from .evaluate import ensure_object_mode, resolve_mesh, resolve_object
from .export import export_glb, glb_stats
from .result import KitError, add_error, make_result, safe_call
from .validation import DEFAULT_PROFILE, evaluate, get_profile, list_profiles, run_all_checks, summarize

PROFILE_KEY = "lowpoly_profile"

__all__ = [
    "create_connected_mesh",
    "extrude_mesh_region",
    "boolean_union_objects",
    "repair_mesh_topology",
    "validate_mesh_topology",
    "optimize_lowpoly_mesh",
    "remesh_organic_mesh",
    "prepare_for_gltf",
    "list_profiles",
    "clear_backups",
]


# ---------------------------------------------------------------------------
# 內部共用
# ---------------------------------------------------------------------------

def _counts(obj):
    return {"verts": len(obj.data.vertices), "faces": len(obj.data.polygons)}


def _profile_of(obj, profile):
    return profile or obj.get(PROFILE_KEY)


def _validate(obj, profile, merge_dist=1e-4):
    checks = run_all_checks(obj, merge_dist=merge_dist)
    return evaluate(checks, profile)


def _finish_mutation(result, obj, backup, before, validate, profile, merge_dist):
    """修改完成後：記錄變化、驗證，沒通過就還原。"""
    after = _counts(obj)
    result["changes"].update({
        "verts": [before["verts"], after["verts"]],
        "faces": [before["faces"], after["faces"]],
    })
    profile = _profile_of(obj, profile)
    if validate and profile:
        report = _validate(obj, profile, merge_dist)
        result["report"] = report
        if report["status"] == "fail":
            _backup.restore_mesh(obj, backup)
            result["backup"] = None
            result["changes"]["restored"] = True
            add_error(result, "VALIDATION_FAILED", summarize(report) + "（已還原為修改前的模型）")
    return result


def _edit_with_bmesh(obj, edit, validate, profile, merge_dist=1e-4):
    """備份 → 用 bmesh 修改 → 寫回 → 驗證。edit(bm) 回傳要放進 changes 的資訊。"""
    ensure_object_mode(obj)
    if profile:
        get_profile(profile)  # 先檢查 profile 名稱，避免改完才發現打錯字
    result = make_result(obj.name)
    before = _counts(obj)
    backup = _backup.backup_mesh(obj)
    result["backup"] = backup.name
    bm = bmesh.new()
    try:
        bm.from_mesh(obj.data)
        info = edit(bm)
        bm.to_mesh(obj.data)
        obj.data.update()
    except Exception:
        # 修改中途失敗：obj.data 可能只寫了一半，直接換回備份
        _backup.restore_mesh(obj, backup)
        raise
    finally:
        bm.free()
    result["changes"].update(info or {})
    return _finish_mutation(result, obj, backup, before, validate, profile, merge_dist)


# ---------------------------------------------------------------------------
# 對外函式
# ---------------------------------------------------------------------------

@safe_call
def validate_mesh_topology(obj, profile=None, merge_dist=1e-4, evaluated=True):
    """只讀檢查。沒通過時 ok=False，並在 errors 裡列出原因。"""
    obj = resolve_mesh(obj)
    profile = _profile_of(obj, profile) or DEFAULT_PROFILE
    result = make_result(obj.name)
    report = evaluate(run_all_checks(obj, merge_dist=merge_dist, evaluated=evaluated), profile)
    result["report"] = report
    if report["status"] == "fail":
        add_error(result, "VALIDATION_FAILED", summarize(report))
    return result


@safe_call
def create_connected_mesh(
    name, verts, faces, collection=None, profile=None, materials=None,
    material_indices=None, parent=None, location=(0.0, 0.0, 0.0), validate=True,
):
    """用頂點與面建立一個連續的 Mesh Object。

    有給 profile 時會存到 Object 的 `lowpoly_profile`，之後的操作與匯出都沿用。
    驗證沒通過時 Object 仍會保留（新建的東西沒有「原本的樣子」可以還原），方便檢查。
    """
    if profile:
        get_profile(profile)
    obj, info = mesh_builder.create_mesh_object(
        name, verts, faces, collection=collection, materials=materials,
        material_indices=material_indices, parent=parent, location=location,
    )
    result = make_result(obj.name)
    result["changes"].update({"created": True, **info, **_counts(obj)})
    if profile:
        obj[PROFILE_KEY] = profile
        if validate:
            report = _validate(obj, profile)
            result["report"] = report
            if report["status"] == "fail":
                add_error(result, "VALIDATION_FAILED", summarize(report))
    return result


@safe_call
def extrude_mesh_region(
    obj, faces, mode="extrude", depth=0.0, thickness=0.0, individual=False,
    material_index=None, validate=True, profile=None,
):
    """在既有 Mesh 上 extrude / inset / inset_extrude / bridge。

    faces 可以是索引清單，或 {"normal": [x,y,z], "bounds": [[min],[max]]} 條件。
    """
    obj = resolve_mesh(obj)

    def edit(bm):
        return extrusion.run(bm, faces, mode, depth=depth, thickness=thickness,
                             individual=individual, material_index=material_index)

    return _edit_with_bmesh(obj, edit, validate, profile)


@safe_call
def repair_mesh_topology(obj, merge_dist=1e-4, fix_normals=True, dry_run=False, validate=True, profile=None):
    """合併重複頂點、刪退化面與孤立元素、修正封閉 Mesh 的法線。dry_run 只回報不修改。"""
    obj = resolve_mesh(obj)
    if dry_run:
        ensure_object_mode(obj)
        bm = bmesh.new()
        try:
            bm.from_mesh(obj.data)
            stats = repair.repair_bmesh(bm, merge_dist, fix_normals)
        finally:
            bm.free()
        result = make_result(obj.name)
        result["changes"].update({"dry_run": True, **stats})
        return result

    return _edit_with_bmesh(
        obj, lambda bm: repair.repair_bmesh(bm, merge_dist, fix_normals), validate, profile, merge_dist
    )


@safe_call
def optimize_lowpoly_mesh(obj, planar_angle_deg=1.0, shade_flat=True, validate=True, profile=None):
    """溶掉共平面上的多餘邊、設定 Flat Shading。"""
    obj = resolve_mesh(obj)
    return _edit_with_bmesh(
        obj, lambda bm: lowpoly.optimize_bmesh(bm, planar_angle_deg, shade_flat), validate, profile
    )


@safe_call
def boolean_union_objects(
    target, others, solver="MANIFOLD", keep_others=False, max_face_ratio=4.0,
    merge_dist=1e-4, validate=True, profile=None,
):
    """把 others 融合進 target。

    - 結果是空的：換下一個 solver 再試，全部失敗回報 BOOLEAN_EMPTY
    - 面數超過（輸入總面數 × max_face_ratio）：還原並回報 BOOLEAN_FACE_EXPLOSION
    - 驗證沒通過：還原並回報 VALIDATION_FAILED
    - 成功且 keep_others=False：others 移到 LowpolyKit_Backup collection（不刪除）
    """
    target = resolve_mesh(target)
    ensure_object_mode(target)
    others = [resolve_mesh(o) for o in (others if isinstance(others, (list, tuple)) else [others])]
    if not others:
        raise KitError("INVALID_ARGUMENT", "others 不能是空的")
    if any(o == target for o in others):
        raise KitError("INVALID_ARGUMENT", "others 不能包含 target 自己")
    if profile:
        get_profile(profile)

    result = make_result(target.name)
    before = _counts(target)
    faces_in = before["faces"] + sum(len(o.data.polygons) for o in others)

    new_mesh = None
    used = None
    for candidate in boolean_engine.solver_order(solver):
        new_mesh = boolean_engine.union_mesh(target, others, candidate)
        if len(new_mesh.polygons) > 0:
            used = candidate
            break
        bpy.data.meshes.remove(new_mesh)
        new_mesh = None
    if new_mesh is None:
        # target.data 從頭到尾沒被動過，不需要還原
        return add_error(result, "BOOLEAN_EMPTY", "所有 solver 的結果都是空的，請確認物件確實有重疊且是封閉的")

    backup = _backup.backup_mesh(target)
    result["backup"] = backup.name
    _backup.swap_mesh(target, new_mesh)

    # Boolean 交界處常有重複頂點與極小的面，先清理再驗證
    bm = bmesh.new()
    try:
        bm.from_mesh(target.data)
        stats = repair.repair_bmesh(bm, merge_dist, fix_normals=True)
        for face in bm.faces:
            face.smooth = False
        bm.to_mesh(target.data)
        target.data.update()
    finally:
        bm.free()
    result["changes"].update({"solver": used, "repair": stats})

    faces_out = len(target.data.polygons)
    if faces_out > faces_in * max_face_ratio:
        _backup.restore_mesh(target, backup)
        result["backup"] = None
        result["changes"]["restored"] = True
        return add_error(
            result, "BOOLEAN_FACE_EXPLOSION",
            f"結果有 {faces_out} 個面，超過輸入 {faces_in} 個面的 {max_face_ratio} 倍（已還原）",
        )

    _finish_mutation(result, target, backup, before, validate, profile, merge_dist)
    if result["ok"] and not keep_others:
        result["changes"]["stashed"] = [o.name for o in others]
        for other in others:
            _backup.stash_object(other)
    return result


@safe_call
def remesh_organic_mesh(obj, voxel_size=0.1, validate=True):
    """Voxel Remesh，只允許 profile 為 organic 的物件使用。"""
    obj = resolve_mesh(obj)
    ensure_object_mode(obj)
    profile = obj.get(PROFILE_KEY)
    if not profile or not get_profile(profile)["remesh"]:
        raise KitError(
            "PROFILE_NOT_ALLOWED",
            f"{obj.name} 的 profile 是 {profile!r}，只有 organic 允許 Voxel Remesh（會讓建築失去銳利邊角）",
        )
    result = make_result(obj.name)
    before = _counts(obj)
    new_mesh = remesh_engine.voxel_remesh_mesh(obj, voxel_size)
    if len(new_mesh.polygons) == 0:
        bpy.data.meshes.remove(new_mesh)
        return add_error(result, "INVALID_GEOMETRY", "Remesh 結果是空的，voxel_size 可能大於物件尺寸")
    backup = _backup.backup_mesh(obj)
    result["backup"] = backup.name
    _backup.swap_mesh(obj, new_mesh)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    result["changes"]["voxel_size"] = voxel_size
    return _finish_mutation(result, obj, backup, before, validate, None, 1e-4)


@safe_call
def prepare_for_gltf(root, filepath, apply_modifiers=True, validate=True):
    """驗證 root 底下所有 Mesh，全部通過才匯出 GLB，並回報 draw call 等統計。

    不修改場景：modifier 只套用在匯出的資料上。
    沒有 lowpoly_profile 的 Mesh 用預設的 building_shell 檢查。
    """
    root = resolve_object(root)
    result = make_result(root.name)
    meshes = [o for o in [root, *root.children_recursive] if o.type == "MESH"]
    if not meshes:
        raise KitError("INVALID_ARGUMENT", f"{root.name} 底下沒有任何 Mesh")

    if validate:
        reports = {}
        for obj in meshes:
            report = _validate(obj, _profile_of(obj, None) or DEFAULT_PROFILE)
            reports[obj.name] = {"profile": report["profile"], "status": report["status"], "issues": report["issues"]}
            if report["status"] == "fail":
                add_error(result, "VALIDATION_FAILED", f"{obj.name}：{summarize(report)}")
        result["report"] = {"meshes": reports}
        if not result["ok"]:
            return result

    exported = export_glb(root, filepath, apply_modifiers)
    result["changes"].update({"filepath": filepath, "objects": exported, "export": glb_stats(filepath)})
    return result


def clear_backups(obj):
    """刪除 obj 的備份 mesh（確認結果沒問題後再呼叫）。"""
    return _backup.clear_backups(resolve_mesh(obj))
