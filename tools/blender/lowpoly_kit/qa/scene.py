"""Scene QA：檢查擺放層級的問題（建築互相重疊、壓到道路、地面沒整平、階層、預算）。

資產本身的拓撲、位置已經由 Asset QA 檢查過；這裡只看「資產被放到場景之後」才會出現的問題。
"""

from ..scene.terrain import distance_to_polyline, footprints_overlap

SLOPE_TOLERANCE = 0.08
TREE_MARGIN = 0.4


def check_scene(doc, root, groups, footprints, field, library):
    issues = []

    def add(level, code, message):
        issues.append({"level": level, "code": code, "message": message})

    placements = doc["placements"]
    buildings = [p for p in placements if not p.get("instance")]
    instances = [p for p in placements if p.get("instance")]
    sx, sy = field.size

    # 建築互相重疊
    for i, a in enumerate(buildings):
        for b in buildings[i + 1:]:
            if footprints_overlap(footprints[a["id"]], footprints[b["id"]]):
                add("fail", "SCENE_OVERLAP", f"{a['id']} 和 {b['id']} 的外框重疊")

    for p in placements:
        fp = footprints[p["id"]]
        is_building = not p.get("instance")
        # 超出地形
        if any(abs(x) > sx / 2 or abs(y) > sy / 2 for x, y in fp.corners()):
            add("fail", "SCENE_OUT_OF_TERRAIN", f"{p['id']} 的外框超出地形範圍 ±{sx / 2}×±{sy / 2}")
        # 壓到道路：建築看整個外框；樹只看樹幹附近（樹冠伸到路上方是正常的）
        points = fp.samples() if is_building else [(fp.cx, fp.cy)]
        for road in doc.get("roads", []):
            limit = road["width"] / 2 + (0.0 if is_building else TREE_MARGIN)
            if any(distance_to_polyline(x, y, road["polyline"]) < limit for x, y in points):
                add("fail" if is_building else "warn", "SCENE_ON_ROAD", f"{p['id']} 壓到道路 {road['id']}")
        # 建築底下要平：地面沒整平時，建築會陷進坡裡或一角懸空
        if is_building:
            highest = max(field.height(x, y) for x, y in fp.samples())
            if highest > SLOPE_TOLERANCE:
                add("fail", "SCENE_ON_SLOPE", f"{p['id']} 底下的地面最高 {highest:.2f} m（應 ≤ {SLOPE_TOLERANCE}）")

    # 樹種在建築裡
    for tree in instances:
        for b in buildings:
            if footprints[b["id"]].contains(tree["location"][0], tree["location"][1], margin=0.3):
                add("fail", "SCENE_TREE_IN_BUILDING", f"{tree['id']} 種在 {b['id']} 的外框裡")

    # 階層：根節點底下所有 mesh 都要屬於某個群組；每棟建築要有自己的根節點
    group_set = set(groups.values())
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        node = obj
        while node is not None and node not in group_set:
            node = node.parent
        if node is None:
            add("fail", "SCENE_HIERARCHY", f"{obj.name} 不在任何 hierarchy 群組底下")
    roots = {o.get("lpk_placement") for o in root.children_recursive if o.get("lpk_placement_root")}
    for p in buildings:
        if p["id"] not in roots:
            add("fail", "SCENE_HIERARCHY", f"建築 {p['id']} 沒有自己的根節點（無法單獨點擊、做動畫）")

    # 預算：三角面每個複本都要畫；draw call 每個 Object 的材質數，instance 同 mesh 只算一次
    triangles = draw_calls = 0
    instanced_seen = set()
    meshes = set()
    objects = 0
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        objects += 1
        meshes.add(obj.data.name)
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        primitives = len({poly.material_index for poly in obj.data.polygons})
        if obj.get("instance"):
            if obj.data.name in instanced_seen:
                continue
            instanced_seen.add(obj.data.name)
        draw_calls += primitives
    budget = doc["budget"]
    if triangles > budget["max_tris"]:
        add("fail", "SCENE_BUDGET", f"三角面 {triangles} 超過預算 {budget['max_tris']}")
    if draw_calls > budget["max_draw_calls"]:
        add("fail", "SCENE_BUDGET", f"draw call 約 {draw_calls} 超過預算 {budget['max_draw_calls']}")

    levels = {i["level"] for i in issues}
    return {
        "status": "fail" if "fail" in levels else "warn" if "warn" in levels else "pass",
        "issues": issues,
        "budget": {"triangles": triangles, "draw_calls": draw_calls, "max_tris": budget["max_tris"],
                   "max_draw_calls": budget["max_draw_calls"]},
        "sharing": {"objects": objects, "meshes": len(meshes)},
        "assets": {aid: (entry["report"] or {}).get("geometry", {}).get("status") for aid, entry in library.items()},
    }
