"""Surface Engine：貼圖、UV、材質、Bake、Decal。

分兩層：
- 純 Python（spec、pngio、painter、sources、postprocess）：不 import bpy，Blender 外也能測試
- Blender 端（images、uv、material_builder、gltf_compat、bake、decals、engine）

為什麼要獨立成一個套件：
Phase 5 的 palette atlas 只能做純色；貼圖牽涉到 UV、圖片、節點、bake、匯出相容性，
分散在 orchestrator 裡會變成一堆特例（例如之前寫死的 grilled_corn_body）。
"""
