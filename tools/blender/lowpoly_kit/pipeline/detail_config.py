"""DetailConfig：細節程度的 7 個參數，每個都能單獨調整。

為什麼不是一個「品質 1～10」的數字就好？
一個數字只能整體變多或變少。實際上常需要「輪廓精細，但裝飾少」（遠景建築），
或「結構簡單，但裝飾多」（Q 版小物）。拆開才控制得了。

使用順序：先套 preset，再用 overrides 逐項覆寫。沒寫到的參數維持 preset 的值。
"""

import hashlib
from dataclasses import asdict, dataclass

# 參數規格：(型別, 允許值)。int／float 是 (最小值, 最大值)，enum 是可選清單
PARAMS = {
    "primary_quality": ("int", (1, 3)),          # 主輪廓分段：屋頂折線、牆面傾斜
    "secondary_density": ("float", (0.0, 1.0)),  # 結構細節做到多少：屋簷、樑柱、窗框
    "tertiary_density": ("float", (0.0, 1.0)),   # 裝飾數量：盆栽、燈、招牌
    "geometry_complexity": ("int", (4, 16)),     # 圓形物件的分段數
    "bevel_quality": ("int", (0, 2)),            # 0 不倒角、1 一段 chamfer、2 兩段
    "material_quality": ("enum", ("flat", "palette", "palette_vc")),
    "texture_quality": ("enum", ("none", "atlas64", "atlas256")),
}

PRESETS = {
    # 預設：精緻的卡通遊戲資產
    "game_default": {
        "primary_quality": 2, "secondary_density": 0.8, "tertiary_density": 0.6,
        "geometry_complexity": 8, "bevel_quality": 1,
        "material_quality": "palette_vc", "texture_quality": "atlas64",
    },
    # 快速預覽：只看比例和輪廓，不做裝飾、不倒角
    "preview": {
        "primary_quality": 1, "secondary_density": 0.4, "tertiary_density": 0.0,
        "geometry_complexity": 6, "bevel_quality": 0,
        "material_quality": "flat", "texture_quality": "none",
    },
    # 主角級資產：鏡頭會拉近看的建築
    "hero": {
        "primary_quality": 3, "secondary_density": 1.0, "tertiary_density": 1.0,
        "geometry_complexity": 12, "bevel_quality": 2,
        "material_quality": "palette_vc", "texture_quality": "atlas256",
    },
}

DEFAULT_PRESET = "game_default"


@dataclass(frozen=True)
class DetailConfig:
    primary_quality: int
    secondary_density: float
    tertiary_density: float
    geometry_complexity: int
    bevel_quality: int
    material_quality: str
    texture_quality: str
    seed: int

    def to_dict(self):
        return asdict(self)


def seed_for(plan_id):
    """用 plan id 算出固定的亂數種子。

    tertiary 裝飾要依 density 抽樣，抽樣需要亂數。
    如果用目前時間當種子，同一份 plan 每次建出來的裝飾都不同，就無法比對或測試。
    """
    digest = hashlib.sha256(str(plan_id).encode("utf-8")).hexdigest()
    return int(digest[:8], 16)


def _check_value(name, value, path):
    """回傳錯誤清單；值合法時回傳空清單。"""
    kind, allowed = PARAMS[name]
    if kind == "enum":
        if value not in allowed:
            return [("PLAN_ENUM_INVALID", path, f"{value!r} 不在 {list(allowed)} 之中")]
        return []
    # bool 在 Python 是 int 的子類別，True 會被當成 1，要先排除
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return [("PLAN_FIELD_TYPE", path, f"需要數字，拿到 {type(value).__name__}")]
    if kind == "int" and not float(value).is_integer():
        return [("PLAN_FIELD_TYPE", path, f"需要整數，拿到 {value!r}")]
    low, high = allowed
    if not low <= value <= high:
        return [("PLAN_RANGE", path, f"{value!r} 超出範圍 {low}～{high}")]
    return []


def resolve_detail(detail, plan_id, path="detail"):
    """把 plan 的 detail 欄位解析成 DetailConfig。

    回傳 (config, errors)。errors 是 (code, path, message) 的清單；
    有任何錯誤時 config 為 None，避免拿到「一半合法」的設定。
    """
    errors = []
    detail = detail if detail is not None else {}
    if not isinstance(detail, dict):
        return None, [("PLAN_FIELD_TYPE", path, "需要物件（dict）")]

    preset = detail.get("preset", DEFAULT_PRESET)
    if preset not in PRESETS:
        errors.append(("PLAN_ENUM_INVALID", f"{path}.preset", f"{preset!r} 不在 {list(PRESETS)} 之中"))
        preset = DEFAULT_PRESET

    overrides = detail.get("overrides", {})
    if not isinstance(overrides, dict):
        errors.append(("PLAN_FIELD_TYPE", f"{path}.overrides", "需要物件（dict）"))
        overrides = {}

    values = dict(PRESETS[preset])
    for name, value in overrides.items():
        field_path = f"{path}.overrides.{name}"
        if name not in PARAMS:
            errors.append(("PLAN_ENUM_INVALID", field_path, f"沒有 {name!r} 這個參數，可用：{list(PARAMS)}"))
            continue
        problems = _check_value(name, value, field_path)
        errors.extend(problems)
        if not problems:
            values[name] = int(value) if PARAMS[name][0] == "int" else value

    if errors:
        return None, errors
    return DetailConfig(**values, seed=seed_for(plan_id)), []
