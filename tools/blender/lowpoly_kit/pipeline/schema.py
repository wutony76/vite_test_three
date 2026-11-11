"""ReferenceSpec／AssetPlan／ScenePlan 三種 JSON 的驗證。

這是 AI 和 Blender 程式之間唯一的契約：AI 只負責寫出 plan，
程式依 plan 確定性地建模。plan 有錯就在這裡擋下，不要等到建模做到一半才發現。

設計重點：
- 不 import bpy／bmesh／mathutils：Blender 外的一般 Python 也能跑，測試和編輯器檢查都方便。
- 一次收集全部錯誤，每筆附上 JSON path（例如 components[3].profile）。
  只回報第一個錯誤的話，AI 修一個、再跑一次、再修一個，來回好幾輪。
- 不用 jsonschema 套件：Blender 內建的 Python 沒有，而且我們需要跨欄位的檢查
  （參照存在、parent 沒有循環、method 和 profile 的限制），jsonschema 寫不出來。
"""

import os
import re

from ..validation.profiles import PROFILES
from . import vocab
from .detail_config import resolve_detail

HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _implemented_kinds():
    # 延遲 import：零件庫也是純 Python，但它會 import pipeline.vocab，放在檔案開頭會循環 import
    from ..components import implemented_kinds
    return implemented_kinds()


# ---------------------------------------------------------------------------
# 收集錯誤的小工具
# ---------------------------------------------------------------------------

def _type_ok(value, kind):
    if kind == "str":
        return isinstance(value, str) and value.strip() != ""
    if kind == "number":
        # bool 是 int 的子類別：沒排除的話 True 會被當成數字 1
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if kind == "int":
        return isinstance(value, int) and not isinstance(value, bool)
    if kind == "list":
        return isinstance(value, list)
    if kind == "dict":
        return isinstance(value, dict)
    if kind == "bool":
        return isinstance(value, bool)
    if kind.startswith("vec"):
        size = int(kind[3:])
        return isinstance(value, list) and len(value) == size and all(_type_ok(v, "number") for v in value)
    raise ValueError(f"未知的型別 {kind!r}")


TYPE_NAMES = {
    "str": "非空字串", "number": "數字", "int": "整數", "list": "陣列", "dict": "物件",
    "bool": "true／false", "vec2": "[x, y]", "vec3": "[x, y, z]",
}


class _Checker:
    """累積錯誤與警告。每個 validate_* 函式共用一個。"""

    def __init__(self, base_dir=None):
        self.errors = []
        self.warnings = []
        # 從檔案讀入時才知道所在資料夾，才能檢查 reference／plan 檔案是否存在
        self.base_dir = base_dir

    def error(self, code, path, message):
        self.errors.append({"code": code, "path": path, "message": f"{path}：{message}"})

    def warn(self, code, path, message):
        self.warnings.append({"code": code, "path": path, "message": f"{path}：{message}"})

    def get(self, obj, key, path, kind, required=True, default=None):
        """讀欄位並檢查型別。缺漏或型別錯誤時記錄錯誤並回傳 default。"""
        if not isinstance(obj, dict):
            return default  # 上一層已經回報型別錯誤，這裡不重複報
        field = f"{path}.{key}" if path else key
        if key not in obj or obj[key] is None:
            if required:
                self.error("PLAN_FIELD_MISSING", field, f"缺少必填欄位（需要{TYPE_NAMES[kind]}）")
            return default
        value = obj[key]
        if not _type_ok(value, kind):
            self.error("PLAN_FIELD_TYPE", field, f"需要{TYPE_NAMES[kind]}，拿到 {value!r}")
            return default
        return value

    def items(self, obj, key, path, required=True):
        """讀一個「物件陣列」欄位，回傳 [(path, item)]，只保留型別是物件的項目。"""
        values = self.get(obj, key, path, "list", required=required, default=[])
        field = f"{path}.{key}" if path else key
        result = []
        for index, item in enumerate(values):
            item_path = f"{field}[{index}]"
            if isinstance(item, dict):
                result.append((item_path, item))
            else:
                self.error("PLAN_FIELD_TYPE", item_path, "需要物件")
        return result

    def enum(self, value, allowed, path):
        if value is not None and value not in allowed:
            self.error("PLAN_ENUM_INVALID", path, f"{value!r} 不在允許清單中：{list(allowed)}")
            return False
        return True

    def in_range(self, value, low, high, path, low_open=False):
        if value is None:
            return
        too_low = value <= low if low_open else value < low
        if too_low or (high is not None and value > high):
            bracket = "(" if low_open else "["
            self.error("PLAN_RANGE", path, f"{value!r} 超出範圍 {bracket}{low}, {high if high is not None else '∞'}]")

    def fact(self, node, path):
        """共用欄位：source／confidence／assumption。回傳 source。"""
        source = self.get(node, "source", path, "str")
        self.enum(source, vocab.SOURCES, f"{path}.source")
        confidence = self.get(node, "confidence", path, "number")
        self.in_range(confidence, 0.0, 1.0, f"{path}.confidence")
        if confidence is not None and confidence < vocab.LOW_CONFIDENCE:
            self.warn("LOW_CONFIDENCE", path, f"confidence {confidence} 低於 {vocab.LOW_CONFIDENCE}，建議人工確認")
        if source == "inferred":
            assumption = node.get("assumption")
            if not _type_ok(assumption, "str"):
                # 推測卻不寫理由：之後沒人知道這個尺寸、這個元件是看圖得來的還是猜的
                self.error("PLAN_INFERRED_NO_ASSUMPTION", path, "source 是 inferred，必須寫 assumption 說明推測依據")
        return source

    def unique_ids(self, entries, key="id"):
        """entries 是 [(path, item)]。回傳 {id: path}，並回報重複的 id。"""
        seen = {}
        for path, item in entries:
            value = self.get(item, key, path, "str")
            if value is None:
                continue
            if value in seen:
                self.error("PLAN_ID_DUPLICATE", f"{path}.{key}", f"{value!r} 和 {seen[value]} 重複")
            else:
                seen[value] = path
        return seen

    def ref(self, value, known, path, what):
        if value is not None and value not in known:
            self.error("PLAN_REF_MISSING", path, f"找不到{what} {value!r}")

    def bbox_norm(self, value, path):
        """正規化影像框 [x0, y0, x1, y1]，0～1、原點左上。"""
        if not (isinstance(value, list) and len(value) == 4 and all(_type_ok(v, "number") for v in value)):
            self.error("PLAN_FIELD_TYPE", path, f"需要 [x0, y0, x1, y1]，拿到 {value!r}")
            return
        if any(v < 0 or v > 1 for v in value):
            self.error("PLAN_RANGE", path, f"座標必須在 0～1 之間（正規化影像座標），拿到 {value}")
        elif value[0] >= value[2] or value[1] >= value[3]:
            self.error("PLAN_RANGE", path, f"需要 x0 < x1 且 y0 < y1，拿到 {value}")

    def file_exists(self, relative, path, what):
        """只有從檔案讀入（知道 base_dir）時才檢查。"""
        if self.base_dir is None or relative is None:
            return
        if not os.path.isfile(os.path.join(self.base_dir, relative)):
            self.error("PLAN_REF_MISSING", path, f"找不到{what}檔案 {relative!r}（相對於 {self.base_dir}）")


def _check_cycles(checker, parents, paths):
    """parents：{id: parent_id}。parent 鏈繞回自己時，建模和匯出階層都會無限迴圈。"""
    reported = set()
    for start in parents:
        chain = []
        node = start
        while node is not None and node in parents:
            if node in chain:
                cycle = chain[chain.index(node):]
                key = frozenset(cycle)
                if key not in reported:
                    reported.add(key)
                    checker.error("PLAN_CYCLE", f"{paths[node]}.parent", "parent 形成循環：" + " → ".join(cycle + [node]))
                break
            chain.append(node)
            node = parents[node]


def _inferred_ratio(sources):
    sources = [s for s in sources if s in vocab.SOURCES]
    if not sources:
        return 0.0
    return round(sum(1 for s in sources if s == "inferred") / len(sources), 3)


def _tier_counts(components):
    counts = {tier: 0 for tier in vocab.TIERS}
    for _path, item in components:
        if item.get("tier") in counts:
            counts[item["tier"]] += 1
    return counts


# ---------------------------------------------------------------------------
# ReferenceSpec
# ---------------------------------------------------------------------------

def _validate_reference(doc, c):
    c.get(doc, "id", "", "str")
    c.get(doc, "medium", "", "str", required=False)

    image = c.get(doc, "image", "", "dict")
    c.get(image, "path", "image", "str")
    for key in ("width", "height"):
        c.in_range(c.get(image, key, "image", "int"), 0, None, f"image.{key}", low_open=True)

    view = c.get(doc, "view", "", "dict")
    c.enum(c.get(view, "type", "view", "str"), vocab.VIEW_TYPES, "view.type")
    if view is not None:
        c.fact(view, "view")

    palette = c.items(doc, "palette", "")
    palette_names = c.unique_ids(palette, key="name")
    for path, color in palette:
        hex_value = c.get(color, "hex", path, "str")
        if hex_value is not None and not HEX_COLOR.match(hex_value):
            c.error("PLAN_FIELD_TYPE", f"{path}.hex", f"需要 #RRGGBB 格式，拿到 {hex_value!r}")
        c.get(color, "usage", path, "str", required=False)
        if "sample" in color:
            # sample：從原圖哪個區域取樣這個顏色，讓色票可以追溯、可以重新取樣
            c.bbox_norm(color["sample"], f"{path}.sample")

    components = c.items(doc, "components", "")
    hidden = c.items(doc, "hidden", "", required=False)
    ids = c.unique_ids(components + hidden)
    component_ids = {item.get("id") for _p, item in components}

    parents = {}
    paths = {}
    sources = []
    for path, item in components:
        kind = c.get(item, "kind", path, "str")
        c.enum(kind, vocab.KINDS, f"{path}.kind")
        if kind == "generic":
            c.warn("GENERIC_KIND", path, "kind 是 generic，Phase 3 會找不到對應零件")
        c.enum(c.get(item, "tier", path, "str"), vocab.TIERS, f"{path}.tier")
        if "bbox" not in item:
            c.error("PLAN_FIELD_MISSING", f"{path}.bbox", "缺少必填欄位（需要 [x0, y0, x1, y1]）")
        else:
            c.bbox_norm(item["bbox"], f"{path}.bbox")
        c.ref(c.get(item, "material_hint", path, "str", required=False), palette_names, f"{path}.material_hint", "色票")
        parent = c.get(item, "parent", path, "str", required=False)
        c.ref(parent, component_ids, f"{path}.parent", "元件")
        sources.append(c.fact(item, path))
        if item.get("id") is not None:
            parents[item["id"]] = parent
            paths[item["id"]] = path

    for path, item in hidden:
        source = c.fact(item, path)
        sources.append(source)
        if source == "observed":
            c.error("PLAN_ENUM_INVALID", f"{path}.source", "hidden 是圖上看不到的部分，source 只能是 inferred")

    anchor = c.get(doc, "scale_anchor", "", "dict")
    # 比例錨點：單張圖沒有真實尺寸，靠「門高 2.1 m」這種常識把整張圖換算成公尺
    c.ref(c.get(anchor, "component", "scale_anchor", "str"), component_ids, "scale_anchor.component", "元件")
    c.enum(c.get(anchor, "axis", "scale_anchor", "str"), ("height", "width"), "scale_anchor.axis")
    c.in_range(c.get(anchor, "meters", "scale_anchor", "number"), 0, None, "scale_anchor.meters", low_open=True)

    silhouette = c.get(doc, "silhouette", "", "dict")
    outline = c.get(silhouette, "outline", "silhouette", "list", default=[])
    if silhouette is not None and len(outline) < 3:
        c.error("PLAN_FIELD_TYPE", "silhouette.outline", "輪廓至少需要 3 個點")
    for index, point in enumerate(outline):
        point_path = f"silhouette.outline[{index}]"
        if not _type_ok(point, "vec2"):
            c.error("PLAN_FIELD_TYPE", point_path, f"需要 [x, y]，拿到 {point!r}")
        elif any(v < 0 or v > 1 for v in point):
            c.error("PLAN_RANGE", point_path, f"座標必須在 0～1 之間，拿到 {point}")
    if silhouette is not None:
        c.fact(silhouette, "silhouette")

    # excluded 必填（可以是空陣列）：強迫分析時想清楚「哪些東西故意不做」
    for path, item in c.items(doc, "excluded", ""):
        c.get(item, "what", path, "str")
        c.get(item, "reason", path, "str")

    _check_cycles(c, parents, paths)
    return {
        "counts": {"components": len(components), "hidden": len(hidden), **_tier_counts(components)},
        "inferred_ratio": _inferred_ratio(sources),
        "ids": sorted(i for i in ids if i),
    }


# ---------------------------------------------------------------------------
# AssetPlan
# ---------------------------------------------------------------------------

def _bounds(c, value, path):
    """元件在資產區域座標中的外框 [[x0,y0,z0],[x1,y1,z1]]（公尺）。"""
    if not (isinstance(value, list) and len(value) == 2 and all(_type_ok(v, "vec3") for v in value)):
        c.error("PLAN_FIELD_TYPE", path, f"需要 [[x0, y0, z0], [x1, y1, z1]]，拿到 {value!r}")
        return None
    low, high = value
    if any(low[k] >= high[k] for k in range(3)):
        c.error("PLAN_RANGE", path, f"最小角必須小於最大角，拿到 {value}")
        return None
    return value


def _validate_asset(doc, c):
    plan_id = c.get(doc, "id", "", "str")
    reference = c.get(doc, "reference", "", "str", required=False)
    if reference is not None:
        c.file_exists(f"{reference}.reference.json", "reference", "reference ")

    dims = c.get(doc, "dimensions", "", "dict")
    size = {}
    for key in ("w", "d", "h"):
        size[key] = c.get(dims, key, "dimensions", "number")
        c.in_range(size[key], 0, None, f"dimensions.{key}", low_open=True)

    config, detail_errors = resolve_detail(doc.get("detail"), plan_id or "")
    for code, path, message in detail_errors:
        c.error(code, path, message)

    style = c.get(doc, "style", "", "dict", required=False)
    # 手繪感的頂點偏移：上限 5 cm，超過就不是「手繪感」而是歪掉了
    c.in_range(c.get(style, "edge_wobble", "style", "number", required=False), 0.0, 0.05, "style.edge_wobble")

    materials = c.items(doc, "materials", "")
    material_names = c.unique_ids(materials, key="name")
    for path, material in materials:
        hex_value = c.get(material, "hex", path, "str")
        if hex_value is not None and not HEX_COLOR.match(hex_value):
            c.error("PLAN_FIELD_TYPE", f"{path}.hex", f"需要 #RRGGBB 格式，拿到 {hex_value!r}")
        for key in ("roughness", "metallic", "alpha"):
            c.in_range(c.get(material, key, path, "number", required=False), 0.0, 1.0, f"{path}.{key}")
        c.get(material, "emissive", path, "bool", required=False)

    budget = c.get(doc, "budget", "", "dict")
    max_tris = c.get(budget, "max_tris", "budget", "int")
    if max_tris is not None and not 0 < max_tris <= vocab.DESKTOP_ASSET_MAX_TRIS:
        c.error("PLAN_BUDGET_INVALID", "budget.max_tris", f"{max_tris} 不在 1～{vocab.DESKTOP_ASSET_MAX_TRIS}（桌機單一資產上限）")
    max_primitives = c.get(budget, "max_primitives", "budget", "int")
    if max_primitives is not None and max_primitives <= 0:
        c.error("PLAN_BUDGET_INVALID", "budget.max_primitives", "必須大於 0")

    components = c.items(doc, "components", "")
    if doc.get("components") == []:
        c.error("PLAN_FIELD_MISSING", "components", "至少需要一個元件")
    ids = c.unique_ids(components)

    parents = {}
    paths = {}
    sources = []
    new_objects = 0
    for path, item in components:
        comp_id = item.get("id")
        kind = c.get(item, "kind", path, "str")
        c.enum(kind, vocab.KINDS, f"{path}.kind")
        if kind == "generic":
            c.warn("GENERIC_KIND", path, "kind 是 generic，Phase 3 會找不到對應零件")
        tier = c.get(item, "tier", path, "str")
        c.enum(tier, vocab.TIERS, f"{path}.tier")
        method = c.get(item, "method", path, "str")
        method_ok = c.enum(method, vocab.METHODS, f"{path}.method")
        profile = c.get(item, "profile", path, "str")
        profile_ok = c.enum(profile, vocab.PROFILE_NAMES, f"{path}.profile")
        c.ref(c.get(item, "material", path, "str"), material_names, f"{path}.material", "材質")

        parent = c.get(item, "parent", path, "str", required=False)
        c.ref(parent, ids, f"{path}.parent", "元件")
        union_into = c.get(item, "union_into", path, "str", required=False)
        c.ref(union_into, ids, f"{path}.union_into", "元件")

        # method 與 profile 的限制
        if method_ok and profile_ok and method == "remesh" and not PROFILES[profile]["remesh"]:
            c.error("PLAN_METHOD_NOT_ALLOWED", f"{path}.method",
                    f"profile {profile!r} 不允許 Voxel Remesh（建築會失去銳利邊角），只有 organic 可以")
        if method == "boolean_union":
            if union_into is None:
                c.error("PLAN_METHOD_NOT_ALLOWED", f"{path}.union_into", "boolean_union 必須指定 union_into（要融合進哪個元件）")
            elif union_into == comp_id:
                c.error("PLAN_METHOD_NOT_ALLOWED", f"{path}.union_into", "不能融合進自己")
        elif union_into is not None and method_ok:
            c.error("PLAN_METHOD_NOT_ALLOWED", f"{path}.union_into", f"只有 boolean_union 可以用 union_into，目前是 {method!r}")
        if method in vocab.METHODS_EDIT_PARENT and parent is None:
            c.error("PLAN_METHOD_NOT_ALLOWED", f"{path}.parent", f"{method} 是修改既有的 Mesh，必須用 parent 指定要修改哪個元件")
        if method in vocab.METHODS_NEW_OBJECT:
            new_objects += 1

        transform = c.get(item, "transform", path, "dict", required=False)
        c.get(transform, "location", f"{path}.transform", "vec3", required=False)
        c.get(transform, "rotation_deg", f"{path}.transform", "vec3", required=False)

        params = c.get(item, "params", path, "dict", required=False, default={})
        for index, opening in enumerate(c.get(params, "openings", f"{path}.params", "list", required=False, default=[])):
            c.ref(opening, ids, f"{path}.params.openings[{index}]", "元件")
        # params 裡指定的其他材質（燈罩發光、植物、門把…）也要存在，否則要到建模時才會發現
        for key, value in (params or {}).items():
            if key.endswith("_material"):
                c.ref(value if isinstance(value, str) else None, material_names, f"{path}.params.{key}", "材質")
            elif key.endswith("_materials") and isinstance(value, list):
                for index, name in enumerate(value):
                    c.ref(name, material_names, f"{path}.params.{key}[{index}]", "材質")
        if kind in vocab.KINDS and kind not in _implemented_kinds():
            c.warn("KIND_NOT_IMPLEMENTED", f"{path}.kind", f"{kind!r} 還沒有零件 builder，建模時會失敗")

        # primary／secondary 決定整體比例，一定要有 bounds，並且不能超出外框
        needs_bounds = tier in ("primary", "secondary")
        if "bounds" in item:
            box = _bounds(c, item["bounds"], f"{path}.bounds")
            if box is not None and needs_bounds and all(v is not None for v in size.values()):
                _check_inside(c, box, size, f"{path}.bounds")
        elif needs_bounds:
            c.error("PLAN_FIELD_MISSING", f"{path}.bounds", "primary／secondary 元件必須提供 bounds")

        sources.append(c.fact(item, path))
        if comp_id is not None:
            parents[comp_id] = parent
            paths[comp_id] = path

    _check_cycles(c, parents, paths)

    export = c.get(doc, "export", "", "dict")
    export_path = c.get(export, "path", "export", "str")
    c.get(export, "compress", "export", "bool", required=False)
    if export_path is not None and not export_path.endswith(".glb"):
        c.error("PLAN_FIELD_TYPE", "export.path", f"需要 .glb 檔名，拿到 {export_path!r}")
    for index, name in enumerate(c.get(export, "clickable", "export", "list", required=False, default=[])):
        c.ref(name, ids, f"export.clickable[{index}]", "元件")
    for group_key in ("anim_groups", "instance_groups"):
        groups = c.get(export, group_key, "export", "dict", required=False, default={})
        for group, members in groups.items():
            group_path = f"export.{group_key}.{group}"
            if not isinstance(members, list):
                c.error("PLAN_FIELD_TYPE", group_path, "需要元件 id 陣列")
                continue
            for index, name in enumerate(members):
                c.ref(name, ids, f"{group_path}[{index}]", "元件")
            if group_key == "instance_groups":
                kinds = {item.get("kind") for _p, item in components if item.get("id") in members}
                if len(kinds) > 1:
                    # instancing 共用同一份 mesh，種類不同就不可能長得一樣
                    c.warn("INSTANCE_KIND_MIXED", group_path, f"同一個 instance 群組裡有不同 kind：{sorted(k for k in kinds if k)}")

    if max_primitives and new_objects > max_primitives:
        # 每個獨立 Object 匯出後至少是 1 個 primitive（約 1 個 draw call）
        c.warn("BUDGET_PRIMITIVES", "budget.max_primitives",
               f"預估 {new_objects} 個獨立 Object，已超過 max_primitives {max_primitives}")

    ratio = _inferred_ratio(sources)
    if ratio > vocab.HIGH_INFERRED_RATIO:
        c.warn("HIGH_INFERRED_RATIO", "components", f"{ratio:.0%} 的元件是推測的，建議和使用者確認")
    return {
        "counts": {"components": len(components), **_tier_counts(components)},
        "inferred_ratio": ratio,
        "estimated_objects": new_objects,
        "detail": config.to_dict() if config else None,
    }


def _check_inside(c, box, size, path):
    """資產外框：原點在 footprint 中心的地面上，x、y 對稱，z 從 0 往上。"""
    tol = vocab.BOUNDS_TOLERANCE
    half = {"x": size["w"] / 2, "y": size["d"] / 2}
    limits = [
        (-half["x"] * (1 + tol), half["x"] * (1 + tol)),
        (-half["y"] * (1 + tol), half["y"] * (1 + tol)),
        (-size["h"] * tol, size["h"] * (1 + tol)),
    ]
    low, high = box
    for axis, (lo, hi) in zip("xyz", limits):
        k = "xyz".index(axis)
        if low[k] < lo - 1e-9 or high[k] > hi + 1e-9:
            c.error("PLAN_OUT_OF_BOUNDS", path,
                    f"{axis} 軸 {low[k]}～{high[k]} 超出 dimensions 外框 {lo:.3f}～{hi:.3f}（含 {tol:.0%} 容差）")


# ---------------------------------------------------------------------------
# ScenePlan
# ---------------------------------------------------------------------------

def _validate_materials(doc, c):
    """materials 陣列（AssetPlan 與 ScenePlan 共用），回傳材質名稱集合。"""
    materials = c.items(doc, "materials", "", required=False)
    names = c.unique_ids(materials, key="name")
    for path, material in materials:
        hex_value = c.get(material, "hex", path, "str")
        if hex_value is not None and not HEX_COLOR.match(hex_value):
            c.error("PLAN_FIELD_TYPE", f"{path}.hex", f"需要 #RRGGBB 格式，拿到 {hex_value!r}")
        for key in ("roughness", "metallic", "alpha"):
            c.in_range(c.get(material, key, path, "number", required=False), 0.0, 1.0, f"{path}.{key}")
    return names


def _validate_scene(doc, c):
    c.get(doc, "id", "", "str")
    material_names = _validate_materials(doc, c)

    terrain = c.get(doc, "terrain", "", "dict")
    c.enum(c.get(terrain, "kind", "terrain", "str"), vocab.TERRAIN_KINDS, "terrain.kind")
    terrain_size = c.get(terrain, "size", "terrain", "vec2")
    if terrain_size is not None and any(v <= 0 for v in terrain_size):
        c.error("PLAN_RANGE", "terrain.size", f"必須大於 0，拿到 {terrain_size}")
    c.ref(c.get(terrain, "material", "terrain", "str", required=False), material_names, "terrain.material", "材質")
    params = c.get(terrain, "params", "terrain", "dict", required=False, default={})
    # 地形參數：resolution 太大會爆面（128 × 128 已經是 32768 個三角面），太小則起伏不見
    c.in_range(c.get(params, "resolution", "terrain.params", "int", required=False), 4, 128, "terrain.params.resolution")
    for key in ("amplitude", "flatten_margin", "frequency"):
        c.in_range(c.get(params, key, "terrain.params", "number", required=False), 0.0, None, f"terrain.params.{key}")

    roads = c.items(doc, "roads", "", required=False)
    c.unique_ids(roads)
    for path, road in roads:
        polyline = c.get(road, "polyline", path, "list", default=[])
        if len(polyline) < 2 or not all(_type_ok(p, "vec2") for p in polyline):
            c.error("PLAN_FIELD_TYPE", f"{path}.polyline", "需要至少 2 個 [x, y] 點")
        c.in_range(c.get(road, "width", path, "number"), 0, None, f"{path}.width", low_open=True)
        c.ref(c.get(road, "material", path, "str", required=False), material_names, f"{path}.material", "材質")

    export = c.get(doc, "export", "", "dict", required=False)
    export_path = c.get(export, "path", "export", "str", required=False)
    c.get(export, "compress", "export", "bool", required=False)

    # 燈光只寫進 manifest，由 Three.js 建立（Blender 的 W 和 Three.js 的強度單位不同，直接匯出會過亮或過暗）
    lights = c.items(doc, "lights", "", required=False)
    c.unique_ids(lights)
    for path, light in lights:
        kind = c.get(light, "type", path, "str")
        c.enum(kind, ("sun", "hemisphere", "ambient", "point"), f"{path}.type")
        for key in ("color", "ground_color"):
            value = c.get(light, key, path, "str", required=(key == "color"))
            if value is not None and not HEX_COLOR.match(value):
                c.error("PLAN_FIELD_TYPE", f"{path}.{key}", f"需要 #RRGGBB 格式，拿到 {value!r}")
        c.in_range(c.get(light, "intensity", path, "number"), 0, None, f"{path}.intensity", low_open=True)
        if kind == "sun":
            c.get(light, "direction", path, "vec3")
        if kind == "point":
            c.get(light, "position", path, "vec3")
        if kind == "hemisphere":
            c.get(light, "ground_color", path, "str")
    if export_path is not None and not export_path.endswith(".glb"):
        c.error("PLAN_FIELD_TYPE", "export.path", f"需要 .glb 檔名，拿到 {export_path!r}")

    hierarchy = c.get(doc, "hierarchy", "", "list", default=[])
    groups = set()
    for index, name in enumerate(hierarchy):
        if not _type_ok(name, "str"):
            c.error("PLAN_FIELD_TYPE", f"hierarchy[{index}]", "需要非空字串")
        elif name in groups:
            c.error("PLAN_ID_DUPLICATE", f"hierarchy[{index}]", f"{name!r} 重複")
        else:
            groups.add(name)

    assets = c.items(doc, "assets", "")
    asset_ids = c.unique_ids(assets, key="asset_id")
    for path, asset in assets:
        c.file_exists(c.get(asset, "plan", path, "str"), f"{path}.plan", " plan ")

    placements = c.items(doc, "placements", "")
    c.unique_ids(placements)
    instanced = 0
    for path, placement in placements:
        c.ref(c.get(placement, "asset_id", path, "str"), asset_ids, f"{path}.asset_id", "資產")
        c.ref(c.get(placement, "group", path, "str"), groups, f"{path}.group", "hierarchy 群組")
        c.get(placement, "location", path, "vec3")
        c.get(placement, "rotation_z_deg", path, "number", required=False)
        c.in_range(c.get(placement, "scale", path, "number", required=False), 0, None, f"{path}.scale", low_open=True)
        if c.get(placement, "instance", path, "bool", required=False):
            instanced += 1

    budget = c.get(doc, "budget", "", "dict")
    for key, limit in (("max_tris", vocab.DESKTOP_SCENE_MAX_TRIS), ("max_draw_calls", vocab.DESKTOP_SCENE_MAX_DRAW_CALLS)):
        value = c.get(budget, key, "budget", "int")
        if value is not None and not 0 < value <= limit:
            c.error("PLAN_BUDGET_INVALID", f"budget.{key}", f"{value} 不在 1～{limit}（桌機場景上限）")

    return {
        "counts": {"assets": len(assets), "placements": len(placements), "instanced": instanced, "roads": len(roads)},
        "inferred_ratio": 0.0,
    }


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------

VALIDATORS = {
    vocab.SCHEMA_REFERENCE: _validate_reference,
    vocab.SCHEMA_ASSET: _validate_asset,
    vocab.SCHEMA_SCENE: _validate_scene,
}


def validate_document(doc, base_dir=None):
    """驗證一份 plan（dict）。回傳 {"schema", "errors", "warnings", "report"}。

    base_dir：plan 檔案所在的資料夾。有提供時才會檢查 reference／plan 檔案是否存在。
    """
    checker = _Checker(base_dir)
    if not isinstance(doc, dict):
        checker.error("PLAN_FIELD_TYPE", "$", "plan 最外層必須是 JSON 物件")
        return {"schema": None, "errors": checker.errors, "warnings": [], "report": None}
    schema = doc.get("schema")
    if schema not in VALIDATORS:
        checker.error("PLAN_SCHEMA_UNKNOWN", "schema", f"{schema!r} 不是已知的 schema：{list(VALIDATORS)}")
        return {"schema": schema, "errors": checker.errors, "warnings": [], "report": None}
    report = VALIDATORS[schema](doc, checker)
    return {"schema": schema, "errors": checker.errors, "warnings": checker.warnings, "report": report}
