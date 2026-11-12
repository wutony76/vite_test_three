"""Texture Provider 介面：所有貼圖來源都經過這裡，回傳同樣格式的結果。

來源（plan 的 surface.source）：
- procedural（預設）：numpy 程序手繪，離線、可重現
- library:<id>：tools/blender/textures/library/<id>/ 底下的圖片（圖庫、自製素材）
- manual:<路徑>：人工繪製的圖（例如在 Krita 依 UV 圖手繪後匯回），相對 repo 根目錄
- provider:<名稱>：外部生成服務（目前是本機 ComfyUI）。Blender 建模時「只讀快取」，
  生成由 host 端的 scripts/prepare_textures.py 或 MCP 工具 lowpoly_prepare_textures 先做好

回傳的 TextureResult：
- maps：{"base", "orm", "normal"} → float32 RGBA 陣列（第 0 列在最上面）
- provenance：來源、provider、seed、prompt、時間…（寫進報告與 manifest，方便追查授權與重現）
- warnings：例如快取沒命中、退回 procedural
"""

import os
from dataclasses import dataclass, field

from ..painter import library as painter
from ..pngio import read_png
from ..spec import canonical_hash
from . import cache
from .postprocess import prepare_external

REPO_ROOT = os.path.abspath(os.path.join(cache.TEXTURES_DIR, "..", "..", ".."))
LIBRARY_DIR = os.path.join(cache.TEXTURES_DIR, "library")


@dataclass
class TextureRequest:
    """送給外部 provider 的需求。只放「會影響生成結果」的欄位，hash 才穩定。"""
    material_class: str
    pattern: str
    palette: list
    size: int
    seamless: bool
    seed: int
    scale_m: float
    prompt: str = ""
    negative: str = ""
    reference_crop: str | None = None

    def key(self, provider):
        data = {k: v for k, v in self.__dict__.items() if k != "reference_crop"}
        return f"{provider}-{canonical_hash(data, 16)}"


@dataclass
class TextureResult:
    maps: dict
    provenance: dict
    warnings: list = field(default_factory=list)


def parse_source(source):
    kind, _, target = (source or "procedural").partition(":")
    return kind, target


def default_prompt(spec):
    """依材質規格組出 prompt。顏色寫成 hex，讓生成結果接近色票（之後還會再 palette_lock）。"""
    colors = ", ".join(spec["palette"])
    subject = f"{spec['pattern'].replace('_', ' ')} {spec['class'].replace('_', ' ')}"
    positive = (f"stylized hand-painted game texture of {subject}, seamless tileable, flat even lighting, "
                f"orthographic top-down view, painterly brush strokes, color palette {colors}")
    negative = "photo, photorealistic, text, watermark, logo, perspective, 3d render, cast shadows, frame, border"
    return positive, negative


def request_for(spec, reference_crop=None):
    positive, negative = default_prompt(spec)
    return TextureRequest(
        material_class=spec["class"], pattern=spec["pattern"], palette=list(spec["palette"]), size=spec["size"],
        seamless=spec["tileable"], seed=spec["seed"], scale_m=spec["scale_m"], prompt=positive, negative=negative,
        reference_crop=reference_crop,
    )


def _procedural(spec, warnings=None):
    return TextureResult(painter.generate(spec), {"source": "procedural", "pattern": spec["pattern"],
                                                   "seed": spec["seed"], "hash": spec["hash"]}, warnings or [])


def _from_files(folder_or_base, spec, kind, loader):
    """library／manual：資料夾裡有 base.png（必要）、orm.png、normal.png（選擇性）。"""
    folder = folder_or_base if os.path.isdir(folder_or_base) else os.path.dirname(folder_or_base)
    base_path = folder_or_base if os.path.isfile(folder_or_base) else os.path.join(folder, "base.png")
    if not os.path.exists(base_path):
        return None
    base = loader(base_path)
    # library 多半是圖庫照片 → 強制色票鎖定；manual 是人工依色票畫的 → 只輕微鎖定
    maps = prepare_external(base, spec, seamless=spec["tileable"], lock=0.7 if kind == "library" else 0.15)
    for role in ("orm", "normal"):
        path = os.path.join(folder, f"{role}.png")
        if os.path.exists(path):
            from .postprocess import resize
            maps[role] = resize(loader(path), spec["size"], wrap=spec["tileable"])
    return TextureResult(maps, {"source": kind, "path": os.path.relpath(base_path, REPO_ROOT)})


def resolve(spec, loader=read_png, cache_root=None):
    """Blender 建模時呼叫：依 surface.source 取得三張圖。外部 provider 只讀快取，不連網。"""
    from .postprocess import resize
    kind, target = parse_source(spec["source"])
    if kind == "procedural":
        return _procedural(spec)
    if kind == "library":
        found = _from_files(os.path.join(LIBRARY_DIR, target), spec, "library", loader)
        if found is None:
            return _procedural(spec, [f"TEXTURE_SOURCE_MISSING：圖庫 {target!r} 沒有 base.png，改用 procedural"])
        return found
    if kind == "manual":
        found = _from_files(os.path.join(REPO_ROOT, target), spec, "manual", loader)
        if found is None:
            return _procedural(spec, [f"TEXTURE_SOURCE_MISSING：{target!r} 不存在，改用 procedural"])
        return found
    # provider:<名稱>
    key = request_for(spec).key(target)
    hit = cache.lookup(key, cache_root)
    if hit is None:
        return _procedural(spec, [f"TEXTURE_NOT_PREPARED：{target} 的快取 {key} 不存在，改用 procedural。"
                                  f"先執行 scripts/prepare_textures.py 或 MCP 工具 lowpoly_prepare_textures"])
    maps = cache.load_maps(hit["files"], loader)
    maps = {role: resize(image, spec["size"], wrap=spec["tileable"]) for role, image in maps.items()}
    return TextureResult(maps, {**hit["provenance"], "source": f"provider:{target}", "cache_key": key})
