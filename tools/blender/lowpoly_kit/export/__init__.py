# glb_stats（讀 GLB）是純 Python：e2e、MCP server 在 Blender 外也要用
from .glb_stats import glb_stats, read_glb_json

try:
    # gltf_export 需要 bpy，只有在 Blender 裡才能載入；少了這層判斷，在 Blender 外 import glb_stats 也會失敗
    from .gltf_export import export_glb
except ImportError:
    export_glb = None

__all__ = ["glb_stats", "read_glb_json", "export_glb"]
