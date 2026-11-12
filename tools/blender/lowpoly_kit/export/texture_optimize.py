"""呼叫 scripts/optimize_textures.mjs，把 GLB 內的 PNG 轉成 WebP（Blender 內外都能用）。

Node 或套件不存在時不讓匯出失敗：保留 PNG，回傳 warning。GLB 仍然完整可用，只是比較大。
"""

import json
import os
import shutil
import subprocess

KIT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BLENDER_DIR = os.path.dirname(KIT_DIR)
REPO_ROOT = os.path.abspath(os.path.join(BLENDER_DIR, "..", ".."))
SCRIPT = os.path.join(BLENDER_DIR, "scripts", "optimize_textures.mjs")
# Blender 從 GUI 啟動時 PATH 很短，找不到 node：補上常見的安裝位置
NODE_CANDIDATES = ("~/.volta/bin/node", "/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node")


def find_node():
    found = os.environ.get("LPK_NODE") or shutil.which("node")
    if found:
        return found
    for candidate in NODE_CANDIDATES:
        path = os.path.expanduser(candidate)
        if os.path.exists(path):
            return path
    return None


def optimize_glb(path, quality=88, timeout=300):
    """回傳 {"ok", "report" 或 "warning"}。"""
    node = find_node()
    if node is None:
        return {"ok": False, "warning": "TEXTURE_OPTIMIZE_SKIPPED：找不到 node，貼圖維持 PNG"}
    if not os.path.isdir(os.path.join(REPO_ROOT, "node_modules", "@gltf-transform", "core")):
        return {"ok": False, "warning": "TEXTURE_OPTIMIZE_SKIPPED：沒有安裝 @gltf-transform（npm install），貼圖維持 PNG"}
    proc = subprocess.run([node, SCRIPT, path, path, "--quality", str(quality)], cwd=REPO_ROOT,
                          capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        return {"ok": False, "warning": f"TEXTURE_OPTIMIZE_FAILED：{(proc.stderr or proc.stdout)[-600:]}"}
    lines = [line for line in proc.stdout.splitlines() if line.startswith("{")]
    return {"ok": True, "report": json.loads(lines[-1])}
