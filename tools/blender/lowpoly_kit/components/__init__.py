"""零件庫：每個 kind 對應一個參數化 builder（純 Python，不依賴 bpy）。

    @register("door")
    def build_door(ctx):
        ...
        return MeshData

builder 只負責「這個零件長什麼樣子」，座標是零件自己的局部座標：
原點在 bounds 的底面中心，x 介於 ±w/2、y 介於 ±d/2（-y 是正面）、z 介於 0～h。
放到哪裡、掛在誰底下、要不要 bevel，都是 orchestrator 的事。
"""

import random
import zlib

REGISTRY = {}

# 不建立新 Object、而是修改 parent mesh 的 kind（由 orchestrator 用 extrude_mesh_region 處理）
EDIT_KINDS = ("roof_flat", "brick_patch")


class BuildError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def register(kind):
    def decorator(fn):
        REGISTRY[kind] = fn
        return fn
    return decorator


def implemented_kinds():
    _load_builders()
    return set(REGISTRY) | set(EDIT_KINDS)


def get_builder(kind):
    _load_builders()
    return REGISTRY.get(kind)


def _load_builders():
    # 延遲 import：builder 模組會 import 本模組的 register，放在最上面會循環 import
    from . import nature, openings, props, roofs, structure  # noqa: F401


class BuildContext:
    """builder 拿到的所有資訊。"""

    def __init__(self, comp, detail, materials, seed, children=(), regions=()):
        self.comp = comp
        self.id = comp["id"]
        self.kind = comp["kind"]
        (x0, y0, z0), (x1, y1, z1) = comp["bounds"]
        self.w, self.d, self.h = x1 - x0, y1 - y0, z1 - z0
        self.hw, self.hd = self.w / 2, self.d / 2
        self.detail = detail
        self.materials = set(materials)
        self.material = comp["material"]
        # 每個元件各自的亂數：同一份 plan 每次建出來都一樣，改了 A 元件也不會讓 B 元件的亂數跟著變
        self.rng = random.Random(seed ^ zlib.crc32(self.id.encode("utf-8")))
        self.children = list(children)   # [{"id", "kind", "rect": [[x0,y0,z0],[x1,y1,z1]]}]，本元件局部座標
        self.regions = list(regions)     # [{"id", "role": "opening"|"edit", "x0","x1","z0","z1"}]，正面局部座標

    def param(self, key, default=None):
        return self.comp.get("params", {}).get(key, default)

    def mat(self, name):
        if name not in self.materials:
            raise BuildError("COMPONENT_BUILD_FAILED", f"{self.id}：材質 {name!r} 不在 plan 的 materials 中")
        return name

    def param_mat(self, key, default=None):
        return self.mat(self.param(key) or default or self.material)

    def segments(self, scale=1.0, minimum=4):
        """圓形物件的分段數，由 geometry_complexity 決定。"""
        return max(minimum, int(round(self.detail["geometry_complexity"] * scale)))

    def density(self, tier):
        return self.detail[f"{tier}_density"]

    def count(self, low, high, tier="tertiary"):
        """依密度在 low～high 之間決定數量（植物葉團、海報張數）。"""
        return low + int(round((high - low) * self.density(tier)))

    def child_rects(self, kind):
        return [c["rect"] for c in self.children if c["kind"] == kind]
