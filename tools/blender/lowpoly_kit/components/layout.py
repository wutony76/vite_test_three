"""把 AssetPlan 整理成建模步驟（純 Python）：建立順序、局部座標、門窗開口、instance 群組。

orchestrator（Blender）和測試（一般 Python）都用這份結果，兩邊對「每個零件長什麼樣子」的理解一定一致。
"""

from ..pipeline.vocab import METHODS_EDIT_PARENT
from . import EDIT_KINDS, BuildContext

NEW_OBJECT_METHODS = ("custom_mesh", "component", "remesh", "boolean_union")


def origin_of(comp):
    """元件的 origin：bounds 底面中心（資產座標）。"""
    (x0, y0, z0), (x1, y1, _z1) = comp["bounds"]
    return ((x0 + x1) / 2, (y0 + y1) / 2, z0)


def to_local(bounds, origin):
    (x0, y0, z0), (x1, y1, z1) = bounds
    ox, oy, oz = origin
    return [[x0 - ox, y0 - oy, z0 - oz], [x1 - ox, y1 - oy, z1 - oz]]


def layout_plan(doc, detail, seed):
    comps = {c["id"]: c for c in doc["components"]}
    order = [c["id"] for c in doc["components"]]

    # tertiary_density = 0（preview）時跳過裝飾；被跳過元件的子元件也一起跳過
    skipped = set()
    if detail["tertiary_density"] == 0:
        skipped = {cid for cid in order if comps[cid]["tier"] == "tertiary"}
    changed = True
    while changed:
        changed = False
        for cid in order:
            parent = comps[cid].get("parent")
            if cid not in skipped and parent in skipped:
                skipped.add(cid)
                changed = True

    active = [cid for cid in order if cid not in skipped]
    missing_bounds = [cid for cid in active if "bounds" not in comps[cid]]
    if missing_bounds:
        from . import BuildError
        raise BuildError("COMPONENT_BUILD_FAILED", f"建模需要 bounds：{missing_bounds}")

    new_objects = [cid for cid in active if comps[cid]["method"] in NEW_OBJECT_METHODS]
    edits = [cid for cid in active if comps[cid]["method"] in METHODS_EDIT_PARENT]
    unions = [cid for cid in active if comps[cid]["method"] == "boolean_union"]

    # parent 先建：依 parent 深度排序（同深度維持 plan 順序）
    def depth(cid):
        level, node = 0, comps[cid].get("parent")
        while node:
            level += 1
            node = comps[node].get("parent")
        return level
    new_objects.sort(key=lambda cid: (depth(cid), order.index(cid)))

    def object_parent(cid):
        """Blender 的 parent：往上找第一個會建立 Object 的祖先（編輯類元件沒有 Object）。"""
        node = comps[cid].get("parent")
        while node and comps[node]["method"] not in NEW_OBJECT_METHODS:
            node = comps[node].get("parent")
        return node

    origins = {cid: origin_of(comps[cid]) for cid in active}

    # instance：群組中第一個建出來的成員提供 mesh，其他成員共用並等比縮放（取三軸比例的最小值，才不會超出 bounds）
    instances = {}
    rejected = []  # 形狀不相近、改成各自建模的 instance 成員
    for group, members in doc.get("export", {}).get("instance_groups", {}).items():
        members = [m for m in members if m in active]
        if not members:
            continue
        source = members[0]
        sw, sd, sh = _size(comps[source])
        for member in members[1:]:
            mw, md, mh = _size(comps[member])
            # 形狀差太多（寬高比或深高比差超過 30%）就不共用 mesh：等比縮放塞不進框，位置會跑掉
            # （Phase 5 Visual QA 發現：又高又窄的門口盆栽套用矮寬盆栽的 mesh，位置 IoU 只有 0.31）
            if not (_similar(mw / mh, sw / sh) and _similar(md / mh, sd / sh)):
                rejected.append(member)
                continue
            instances[member] = {"source": source, "group": group, "scale": min(mw / sw, md / sd, mh / sh)}
        instances.setdefault(source, {"source": None, "group": group, "scale": 1.0})

    contexts = {}
    for cid in new_objects:
        comp = comps[cid]
        children = [
            {"id": c, "kind": comps[c]["kind"], "rect": to_local(comps[c]["bounds"], origins[cid])}
            for c in active if comps[c].get("parent") == cid
        ]
        regions = []
        if comp["kind"] == "wall_block":
            for opening in comp.get("params", {}).get("openings", []):
                if opening in active:
                    regions.append(_front_rect(opening, "opening", comps[opening], origins[cid]))
            for child in edits:
                if comps[child].get("parent") == cid and comps[child].get("params", {}).get("face") == "front":
                    regions.append(_front_rect(child, "edit", comps[child], origins[cid]))
        contexts[cid] = BuildContext(comp, detail, [m["name"] for m in doc["materials"]], seed, children, regions)

    unknown_edits = [cid for cid in edits if comps[cid]["kind"] not in EDIT_KINDS]
    return {
        "components": comps,
        "skipped": sorted(skipped),
        "new_objects": new_objects,
        "edits": edits,
        "unions": unions,
        "object_parent": {cid: object_parent(cid) for cid in new_objects},
        "origins": origins,
        "instances": instances,
        "contexts": contexts,
        "unknown_edits": unknown_edits,
        "instance_rejected": rejected,
    }


def _similar(a, b, tolerance=0.3):
    return abs(a - b) <= tolerance * max(a, b)


def _size(comp):
    (x0, y0, z0), (x1, y1, z1) = comp["bounds"]
    return x1 - x0, y1 - y0, z1 - z0


def _front_rect(cid, role, comp, origin):
    (x0, _y0, z0), (x1, _y1, z1) = to_local(comp["bounds"], origin)
    return {"id": cid, "role": role, "x0": x0, "x1": x1, "z0": z0, "z1": z1}
