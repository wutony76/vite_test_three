"""Surface 規格（純 Python）：plan 的 materials[].surface 欄位怎麼解讀。

一個 surface 描述「這個材質的表面長什麼樣子」：
- class：材質類別（木、石、磚…），決定預設圖樣、粗糙度、金屬度
- pattern：圖樣（木板、亂石、屋瓦…）
- palette：陰影／基底／高光三個顏色。手繪風的關鍵是「顏色只在這三色之間變化」，
  不同材質的風格才會一致；省略時由 hex 自動推出
- scale_m：一個圖樣單元有多大（磚高、板寬），用來換算一張貼圖覆蓋幾公尺
- uv：UV 投影策略；tier：解析度等級；source：貼圖從哪裡來

這個檔案只做「解讀與計算」，schema 驗證和 Blender 端建材質都用它，規則只寫一份。
"""

import colorsys
import hashlib
import json

# ---------------------------------------------------------------------------
# 詞彙
# ---------------------------------------------------------------------------

# 材質類別 → 預設圖樣、粗糙度、金屬度
SURFACE_CLASSES = {
    "wood": {"pattern": "planks", "roughness": 0.8, "metallic": 0.0},
    "stone": {"pattern": "cobble", "roughness": 0.9, "metallic": 0.0},
    "brick": {"pattern": "brick", "roughness": 0.88, "metallic": 0.0},
    "roof_tile": {"pattern": "roof_tiles", "roughness": 0.8, "metallic": 0.0},
    "plaster": {"pattern": "plaster", "roughness": 0.92, "metallic": 0.0},
    "metal": {"pattern": "brushed", "roughness": 0.45, "metallic": 0.8},
    "fabric": {"pattern": "weave", "roughness": 0.95, "metallic": 0.0},
    "vegetation": {"pattern": "foliage", "roughness": 0.85, "metallic": 0.0},
    "ground": {"pattern": "ground", "roughness": 0.95, "metallic": 0.0},
    "food": {"pattern": "crust", "roughness": 0.6, "metallic": 0.0},
    "painted": {"pattern": "painted", "roughness": 0.7, "metallic": 0.0},
}

# 圖樣 → 一張平鋪貼圖裡放幾個單元（units）、是否可平鋪（tileable）
# tile_m（一張貼圖覆蓋幾公尺）= units × scale_m
PATTERNS = {
    "planks": {"units": 4, "scale_m": 0.15, "tileable": True, "relief": True},
    "wood_grain": {"units": 2, "scale_m": 0.25, "tileable": True, "relief": False},
    "brick": {"units": 8, "scale_m": 0.075, "tileable": True, "relief": True},
    "cobble": {"units": 4, "scale_m": 0.25, "tileable": True, "relief": True},
    "rock": {"units": 2, "scale_m": 0.4, "tileable": True, "relief": True},
    "roof_tiles": {"units": 6, "scale_m": 0.18, "tileable": True, "relief": True},
    "plaster": {"units": 1, "scale_m": 1.5, "tileable": True, "relief": False},
    "brushed": {"units": 1, "scale_m": 0.6, "tileable": True, "relief": False},
    "weave": {"units": 16, "scale_m": 0.02, "tileable": True, "relief": True},
    "foliage": {"units": 5, "scale_m": 0.15, "tileable": True, "relief": True},
    "ground": {"units": 1, "scale_m": 3.0, "tileable": True, "relief": False},
    "crust": {"units": 1, "scale_m": 0.2, "tileable": True, "relief": True},
    "painted": {"units": 1, "scale_m": 1.0, "tileable": True, "relief": False},
    "stripes": {"units": 6, "scale_m": 0.2, "tileable": True, "relief": False},
    # 不平鋪：整個物件展開成一張圖（fit UV），units 是「一圈幾顆」的參考
    "corn_kernels": {"units": 20, "scale_m": 0.01, "tileable": False, "relief": True},
    "fried_egg_white": {"units": 1, "scale_m": 0.14, "tileable": False, "relief": True},
    "fried_egg_yolk": {"units": 1, "scale_m": 0.055, "tileable": False, "relief": True},
    "salmon_marbling": {"units": 3, "scale_m": 0.15, "tileable": False, "relief": True},
}
# relief = False：表面幾乎平的圖樣不產生法線貼圖（省下 1/3 的 GPU 記憶體，看起來也沒差）

UV_STRATEGIES = ("planar", "along", "cylinder", "fit")

# 只有「紋理有方向」的圖樣可以跟著物件長軸轉（along）：木紋、拉絲金屬、布紋。
# 磚、瓦、石、灰泥有「重力方向」：不管物件怎麼擺，磚都是橫的、瓦片都是往下疊，所以一律 planar
GRAIN_PATTERNS = ("planks", "wood_grain", "brushed", "weave", "stripes", "painted", "crust", "foliage", "rock")

# profile → 預設 UV 策略。trim（樑柱）用 along：木紋沿長邊走，才不會出現「直紋的橫樑」
PROFILE_UV = {
    "building_shell": "planar", "roof": "planar", "trim": "along", "opening": "planar",
    "glass": "planar", "decoration": "along", "vegetation": "planar", "tile_array": "planar",
    "organic": "planar", "terrain": "planar", "road": "planar", "water_surface": "planar",
}

# 解析度等級：平鋪貼圖邊長、unique／bake 貼圖邊長、目標 texel density（px/m）、UV padding（px）
TIERS = {
    "prop": {"tile": 256, "unique": 512, "density": 128, "padding": 4},
    "standard": {"tile": 512, "unique": 1024, "density": 256, "padding": 8},
    "hero": {"tile": 1024, "unique": 2048, "density": 512, "padding": 16},
}
TIER_ORDER = ("prop", "standard", "hero")

SOURCES = ("procedural", "library", "manual", "provider")
SURFACE_KEYS = {"class", "pattern", "palette", "accents", "scale_m", "units", "kernel_rows", "wear", "dirt", "uv",
                "tier", "source", "normal_strength", "roughness_variation", "posterize_steps", "posterize_mix",
                "gap_shade"}


# ---------------------------------------------------------------------------
# 顏色
# ---------------------------------------------------------------------------

def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def rgb_to_hex(rgb):
    return "#" + "".join(f"{max(0, min(255, round(c * 255))):02X}" for c in rgb)


def derive_palette(hex_value):
    """從一個基底色推出陰影／基底／高光。

    手繪遊戲貼圖的慣例：陰影不是單純變暗，而是「更暗、稍微更飽和、色相往冷色偏」；
    高光是「更亮、較不飽和、往暖色偏」。只改明度的話，畫面會灰濁像髒掉。

    用 HSV 而不是 HLS：接近白色的顏色在 HLS 的飽和度會被放大（#F9F4E8 的 HLS 飽和度是 0.57），
    推出來的陰影會變成很飽和的橘色；HSV 的飽和度是 0.07，陰影才會是淡淡的灰米色。
    """
    r, g, b = hex_to_rgb(hex_value)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)

    def toward(hue, target, amount):
        delta = ((target - hue + 0.5) % 1.0) - 0.5
        return (hue + delta * amount) % 1.0

    shadow = colorsys.hsv_to_rgb(toward(h, 0.66, 0.06), min(s * 1.15 + 0.04, 1.0), max(v * 0.62, 0.05))
    light = colorsys.hsv_to_rgb(toward(h, 0.14, 0.06), s * 0.8, min(v + (1 - v) * 0.5, 0.98))
    return [rgb_to_hex(shadow), hex_value.upper(), rgb_to_hex(light)]


# ---------------------------------------------------------------------------
# 解析
# ---------------------------------------------------------------------------

def tier_for(requested, quality):
    """surface_quality = standard 時 hero 降一級；hero 時照 plan；off 不會呼叫到這裡。"""
    tier = requested if requested in TIERS else "standard"
    if quality == "standard" and tier == "hero":
        return "standard"
    return tier


def canonical_hash(data, length=12):
    """把 dict 轉成固定格式的 JSON 再雜湊。鍵的順序不影響結果，相同設定一定得到相同 hash。"""
    text = json.dumps(data, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:length]


def resolve_surface(material, profile=None, quality="standard", detail_strength=0.6):
    """把 plan 的材質（含 surface）展開成建材質需要的所有數值。

    回傳的 dict 只含 JSON 型別，可以直接寫進報告；`seed` 與 `hash` 由「影響像素的欄位」決定，
    所以兩個資產用了相同的木板設定，會得到同一張貼圖（場景 GLB 只存一份）。
    """
    surface = material["surface"]
    klass = surface.get("class", "painted")
    base = SURFACE_CLASSES.get(klass, SURFACE_CLASSES["painted"])
    pattern = surface.get("pattern", base["pattern"])
    pattern_info = PATTERNS.get(pattern, PATTERNS["painted"])
    tier = tier_for(surface.get("tier", "standard"), quality)
    tier_info = TIERS[tier]
    scale_m = float(surface.get("scale_m", pattern_info["scale_m"]))
    tileable = pattern_info["tileable"]
    units = int(surface.get("units", pattern_info["units"]))
    kernel_rows = surface.get("kernel_rows")
    uv = surface.get("uv") or ("fit" if not tileable else PROFILE_UV.get(profile, "planar"))
    size = tier_info["tile"] if tileable else tier_info["unique"]
    palette = surface.get("palette") or derive_palette(material["hex"])
    source = surface.get("source", "procedural")

    pixels_key = {
        "pattern": pattern, "palette": [p.upper() for p in palette],
        "accents": {k: v.upper() for k, v in sorted(surface.get("accents", {}).items())},
        "units": units, "kernel_rows": int(kernel_rows) if kernel_rows is not None else None, "size": size,
        "wear": round(float(surface.get("wear", 0.3)) * detail_strength, 3),
        "dirt": round(float(surface.get("dirt", 0.2)) * detail_strength, 3),
        "roughness": round(float(material.get("roughness", base["roughness"])), 3),
        "metallic": round(float(material.get("metallic", base["metallic"])), 3),
        "roughness_variation": round(float(surface.get("roughness_variation", 0.12)), 3),
        "normal_strength": round(float(surface.get("normal_strength", 1.0)), 3),
        "posterize_steps": int(surface.get("posterize_steps", 4)),
        "posterize_mix": round(float(surface.get("posterize_mix", 0.3)), 3),
        "gap_shade": round(float(surface.get("gap_shade", 0.42)), 3),
        "source": source,
        "relief": bool(pattern_info["relief"]),
    }
    digest = canonical_hash(pixels_key)
    return {
        **pixels_key,
        "name": material["name"], "class": klass, "tier": tier, "uv": uv, "tileable": tileable,
        "scale_m": scale_m, "tile_m": units * scale_m if tileable else None,
        "emissive": bool(material.get("emissive")),
        "hash": digest, "seed": int(digest[:8], 16),
    }


def texel_density(size, tile_m):
    """一公尺有幾個像素。tile_m 是一張貼圖在表面上覆蓋的公尺數。"""
    return size / tile_m if tile_m else None


def gpu_bytes(width, height, mipmaps=True):
    """未壓縮 RGBA8 的 GPU 記憶體。mipmap 金字塔 1 + 1/4 + 1/16 + … ≈ 4/3 倍。"""
    raw = width * height * 4
    return int(raw * 4 / 3) if mipmaps else raw


# ---------------------------------------------------------------------------
# schema 驗證（給 pipeline/schema.py 呼叫，用它的 checker 收集錯誤）
# ---------------------------------------------------------------------------

def validate_surface(c, surface, path, hex_pattern):
    if not isinstance(surface, dict):
        c.error("PLAN_FIELD_TYPE", path, "需要物件（dict）")
        return
    for key in surface:
        if key not in SURFACE_KEYS:
            c.error("PLAN_ENUM_INVALID", f"{path}.{key}", f"surface 沒有 {key!r} 這個欄位，可用：{sorted(SURFACE_KEYS)}")
    klass = surface.get("class")
    if klass is None:
        c.error("PLAN_FIELD_MISSING", f"{path}.class", f"缺少材質類別，可用：{list(SURFACE_CLASSES)}")
    elif klass not in SURFACE_CLASSES:
        c.error("PLAN_ENUM_INVALID", f"{path}.class", f"{klass!r} 不在 {list(SURFACE_CLASSES)} 之中")
    pattern = surface.get("pattern")
    if pattern is not None and pattern not in PATTERNS:
        c.error("PLAN_ENUM_INVALID", f"{path}.pattern", f"{pattern!r} 不在 {list(PATTERNS)} 之中")
    palette = surface.get("palette")
    if palette is not None:
        if not (isinstance(palette, list) and len(palette) == 3):
            c.error("PLAN_FIELD_TYPE", f"{path}.palette", "需要 3 個顏色：[陰影, 基底, 高光]")
        else:
            for index, value in enumerate(palette):
                if not (isinstance(value, str) and hex_pattern.match(value)):
                    c.error("PLAN_FIELD_TYPE", f"{path}.palette[{index}]", f"需要 #RRGGBB，拿到 {value!r}")
    for name, value in (surface.get("accents") or {}).items():
        if not (isinstance(value, str) and hex_pattern.match(value)):
            c.error("PLAN_FIELD_TYPE", f"{path}.accents.{name}", f"需要 #RRGGBB，拿到 {value!r}")
    for key, low, high in (
        ("wear", 0, 1), ("dirt", 0, 1), ("roughness_variation", 0, 0.5), ("normal_strength", 0, 4), ("gap_shade", 0, 1),
    ):
        if key in surface:
            c.in_range(c.get(surface, key, path, "number"), low, high, f"{path}.{key}")
    if "scale_m" in surface:
        c.in_range(c.get(surface, "scale_m", path, "number"), 0.001, 20, f"{path}.scale_m")
    if "units" in surface:
        c.in_range(c.get(surface, "units", path, "number"), 3, 48, f"{path}.units")
    if "kernel_rows" in surface:
        c.in_range(c.get(surface, "kernel_rows", path, "number"), 3, 24, f"{path}.kernel_rows")
    if "uv" in surface:
        c.enum(c.get(surface, "uv", path, "str"), UV_STRATEGIES, f"{path}.uv")
    if "tier" in surface:
        c.enum(c.get(surface, "tier", path, "str"), TIER_ORDER, f"{path}.tier")
    source = surface.get("source")
    if source is not None:
        kind = source.split(":", 1)[0] if isinstance(source, str) else None
        if kind not in SOURCES:
            c.error("PLAN_ENUM_INVALID", f"{path}.source",
                    f"{source!r} 需要是 procedural、library:<id>、manual:<路徑>、provider:<名稱>")
        elif kind != "procedural" and ":" not in source:
            c.error("PLAN_FIELD_TYPE", f"{path}.source", f"{kind} 需要指定目標，例如 {kind}:<名稱>")
