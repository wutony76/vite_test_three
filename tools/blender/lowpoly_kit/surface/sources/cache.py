"""貼圖快取：以 request hash 為鍵，存 PNG 與 provenance（這張圖從哪裡來）。

為什麼一定要快取，而且要 commit：
AI 生成每次結果都不同，也可能要付費或需要本機服務在跑。把結果存下來並進版控，
重建資產時直接讀檔，同一份 plan 永遠得到同一個模型，也不必每次都開 ComfyUI。
"""

import json
import os
import time

from ..pngio import read_png, write_png

KIT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEXTURES_DIR = os.path.join(os.path.dirname(KIT_DIR), "textures")
CACHE_DIR = os.path.join(TEXTURES_DIR, "cache")
ROLES = ("base", "orm", "normal")


def entry_dir(key, root=None):
    return os.path.join(root or CACHE_DIR, key)


def lookup(key, root=None):
    """命中時回傳 {"files": {角色: 路徑}, "provenance": {...}}；沒有或不完整時回傳 None。"""
    folder = entry_dir(key, root)
    files = {role: os.path.join(folder, f"{role}.png") for role in ROLES}
    meta = os.path.join(folder, "provenance.json")
    if not all(os.path.exists(path) for path in [*files.values(), meta]):
        return None
    with open(meta, encoding="utf-8") as handle:
        return {"files": files, "provenance": json.load(handle)}


def store(key, maps, provenance, root=None):
    folder = entry_dir(key, root)
    os.makedirs(folder, exist_ok=True)
    files = {}
    for role in ROLES:
        files[role] = write_png(os.path.join(folder, f"{role}.png"), maps[role])
    record = {**provenance, "key": key, "stored_at": time.strftime("%Y-%m-%dT%H:%M:%S")}
    with open(os.path.join(folder, "provenance.json"), "w", encoding="utf-8") as handle:
        json.dump(record, handle, ensure_ascii=False, indent=2)
    return {"files": files, "provenance": record}


def load_maps(files, loader=read_png):
    return {role: loader(path) for role, path in files.items()}
