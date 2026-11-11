"""Geometry QA：對照 plan 檢查建出來的 Object「位置和大小對不對」。

拓撲檢查只看 mesh 本身（封不封閉、有沒有破面），看不出零件跑錯位置：
- 零件超出 plan 指定的範圍（builder 參數算錯、單位弄錯）
- 零件比 plan 小很多（例如 instance 縮放錯誤）
- 零件浮在半空中、沒有碰到任何東西（Phase 2 的盆栽就浮了 7 cm，當時是靠人工看圖才發現）
"""

import bpy
from mathutils import Vector

GROUND_EPS = 0.02
TOUCH_EPS = 0.02


def world_bbox(obj):
    """Object 套用所有變換後的外框（世界座標）。用頂點算，不用 obj.bound_box：後者不含 parent 以外的修改。"""
    matrix = obj.matrix_world
    points = [matrix @ v.co for v in obj.data.vertices]
    if not points:
        return None
    return (Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))),
            Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points))))


def _boxes_touch(a, b, eps):
    return all(a[0][k] - eps <= b[1][k] and b[0][k] - eps <= a[1][k] for k in range(3))


def check_asset_geometry(plan, root):
    """plan：AssetPlan dict；root：建好的根 Empty。回傳 {"objects", "issues", "status"}。"""
    comps = {c["id"]: c for c in plan["components"]}
    # Boolean Union 會把元件融合進目標（煙囪 → 牆體），目標的預期範圍要包含被融合的元件
    merged_bounds = {cid: [list(c["bounds"][0]), list(c["bounds"][1])] for cid, c in comps.items() if "bounds" in c}
    for comp in comps.values():
        target = comp.get("union_into")
        if comp.get("method") == "boolean_union" and target in merged_bounds and "bounds" in comp:
            for k in range(3):
                merged_bounds[target][0][k] = min(merged_bounds[target][0][k], comp["bounds"][0][k])
                merged_bounds[target][1][k] = max(merged_bounds[target][1][k], comp["bounds"][1][k])
    origin = root.matrix_world.translation
    ground = origin.z
    objects = [o for o in root.children_recursive if o.type == "MESH" and o.get("lpk_component") in comps]
    boxes = {o.name: world_bbox(o) for o in objects}
    issues = []
    report = {}

    def issue(code, level, obj, message):
        issues.append({"code": code, "level": level, "object": obj.name, "message": f"{obj.name}：{message}"})

    for obj in objects:
        comp = comps[obj["lpk_component"]]
        box = boxes[obj.name]
        if box is None or "bounds" not in comp:
            continue
        (x0, y0, z0), (x1, y1, z1) = merged_bounds[comp["id"]]
        expected =(Vector((x0, y0, z0)) + origin, Vector((x1, y1, z1)) + origin)
        size = expected[1] - expected[0]
        actual = box[1] - box[0]
        entry = {"expected": [list(map(lambda v: round(v, 3), expected[0])), list(map(lambda v: round(v, 3), expected[1]))],
                 "actual": [list(map(lambda v: round(v, 3), box[0])), list(map(lambda v: round(v, 3), box[1]))]}
        report[obj.name] = entry

        # 超出：容差 = max(6 cm, 尺寸 × 5%)，涵蓋窗台外凸、bevel、wobble、煙囪往下埋
        over = []
        for k, axis in enumerate("xyz"):
            tol = max(0.06, size[k] * 0.05)
            if box[0][k] < expected[0][k] - tol or box[1][k] > expected[1][k] + tol:
                over.append(f"{axis} {box[0][k]:.2f}～{box[1][k]:.2f}（plan {expected[0][k]:.2f}～{expected[1][k]:.2f}）")
        if over:
            issue("OUT_OF_BOUNDS", "fail", obj, "超出 plan bounds：" + "；".join(over))

        # 尺寸明顯不足：只看 plan 尺寸 > 10 cm 的軸（玻璃、招牌的厚度本來就很薄）
        short = [axis for k, axis in enumerate("xyz") if size[k] > 0.1 and actual[k] < size[k] * 0.5]
        if short:
            issue("UNDERFILLED", "warn", obj, f"{'、'.join(short)} 軸的實際尺寸不到 plan 的一半")

        # 懸空：底部離地，而且外框沒有碰到任何其他 Object
        if box[0].z > ground + GROUND_EPS:
            touching = any(_boxes_touch(box, other, TOUCH_EPS)
                           for name, other in boxes.items() if name != obj.name and other is not None)
            entry["supported"] = touching
            if not touching:
                issue("FLOATING", "warn", obj, f"底部在地面上方 {box[0].z - ground:.2f} m，而且沒有碰到任何物件")

    levels = {i["level"] for i in issues}
    status = "fail" if "fail" in levels else "warn" if "warn" in levels else "pass"
    return {"status": status, "issues": issues, "objects": report}


def find_root(plan_id):
    return bpy.data.objects.get(f"{plan_id}_Root")
