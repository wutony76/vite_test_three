"""host 端：建模前先把 provider:* 的貼圖生成好、寫進快取（純 Python，不需要 Blender）。

為什麼要分兩步：Blender 建模必須可重現、不連網；外部生成（ComfyUI）慢、結果每次不同、可能失敗。
所以生成在這裡做一次、存進 tools/blender/textures/cache/（要 commit），建模時只讀快取。
"""

import os

from ..pipeline import load_plan, resolve_detail
from .sources import comfyui
from .sources.base import parse_source, request_for
from .sources import cache
from .spec import resolve_surface

PROVIDERS = {"comfyui": comfyui.fetch}


def provider_materials(doc):
    """plan 裡 source 是 provider:* 的材質。"""
    found = []
    for material in doc.get("materials", []):
        source = (material.get("surface") or {}).get("source")
        kind, target = parse_source(source)
        if kind == "provider":
            found.append((material, target))
    return found


def prepare_plan(plan_path, force=False, client=None, cache_root=None):
    """回傳 {"ok", "items": [{material, provider, key, status, ...}], "errors"}。"""
    doc, error = load_plan(plan_path)
    if error:
        return {"ok": False, "items": [], "errors": [error]}
    detail, _ = resolve_detail(doc.get("detail"), doc.get("id", ""))
    quality = detail.surface_quality if detail else "standard"
    strength = detail.surface_detail if detail else 0.6
    if quality == "off":
        quality = "standard"
    items, errors = [], []
    for material, provider in provider_materials(doc):
        spec = resolve_surface(material, quality=quality, detail_strength=strength)
        key = request_for(spec).key(provider)
        item = {"material": material["name"], "provider": provider, "key": key}
        fetch = PROVIDERS.get(provider)
        if fetch is None:
            item["status"] = "unknown_provider"
            errors.append(f"{material['name']}：沒有 provider {provider!r}，可用：{list(PROVIDERS)}")
        elif not force and cache.lookup(key, cache_root) is not None:
            item["status"] = "cached"
        else:
            try:
                kwargs = {"client": client} if client is not None else {}
                result = fetch(spec, cache_root=cache_root, force=force, **kwargs)
                item["status"] = "generated"
                item["seconds"] = result.provenance.get("seconds")
            except comfyui.ComfyUIError as exc:
                item["status"] = "failed"
                errors.append(f"{material['name']}：{exc}")
        item["cache_dir"] = os.path.relpath(cache.entry_dir(key, cache_root), os.getcwd())
        items.append(item)
    return {"ok": not errors, "items": items, "errors": errors}
