---
name: blender-modeling
description: 用 Blender MCP（mcp__blender__*）建立、修改或匯出 3D 模型時必用：Low Poly／卡通遊戲資產、參考圖轉模型、場景生成、GLB 給 Three.js。涵蓋 reference 分析、plan JSON、lowpoly_kit 建模、拓撲驗證與匯出流程。
---

# Blender 建模流程

**動手前先完整讀 `tools/blender/WORKFLOW.md`，照它的步驟走。** 流程只維護在那份文件，Cursor 也讀同一份。

最重要的三條：

1. 禁止用 primitive 堆疊後 Join，也禁止用頂點拼出 box／sphere 再塞進同一個 mesh。
2. 先輸出 plan JSON，用 `api.validate_plan` 驗證，**等使用者確認**後才可以建模。
3. 拓撲必須以 `validate_mesh_topology` 驗證通過；`look` 目測不算數。
