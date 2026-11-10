# Proposal

## 變更名稱

`add-blender-lowpoly-pipeline` — Blender Low Poly 建模函式庫與拓撲驗證（Phase 3 MVP）

## 背景

目前用 MCP for Blender 讓 AI 建模，幾乎都是 `primitive_*_add` 堆疊後 Join。Phase 1 實測 `public/models/project_room/project_room.glb`：

- `Roof` 18 個幾何島、`Chimney` 8 個、`Rock_Base` 40 個、`Walls_Main` 3 個，每扇窗 5 個以上。
- 21 個 Mesh 全部放在最上層，沒有共同根節點；共 71 個 primitive（約 71 個 draw call）。

技術原因（以 `mcp-for-blender` 2.2.7 原始碼確認）：

1. 能建模的工具只有 `execute_blender_code`，而 addon 每次都是 `exec(code, {"bpy": bpy})`，沒有可重複使用的建模函式庫，AI 自然選最短的 primitive 寫法。
2. `get_scene_info` 的 topology 只算 quads／tris／ngons／non-manifold／boundary／loose／poles，**不算 connected components**。多個封閉方塊 Join 起來，報告依然是「0 non-manifold」。
3. 沒有依物件類型區分的驗收規則，成功與否靠 `look` 目測。

MCP 是 uvx 安裝的第三方套件，直接修改會在更新時被覆蓋，所以不改 MCP 本身。

## 目標

在本 repo 建立純 Blender Python 的建模函式庫 `lowpoly_kit`，透過既有的 `execute_blender_code` 載入呼叫，讓 AI：

1. 用 Custom Mesh／BMesh／Extrude／Inset／Bridge／Boolean Union 建出連續拓撲。
2. 建完以程式驗證拓撲（9 項檢查，含 connected components），規則依物件類型區分。
3. 能安全自動修復，且每個破壞性操作都能還原。
4. 匯出保留 Object Hierarchy 的 GLB 給 Three.js。

## 範圍

- 包含：
  - 新增 `tools/blender/lowpoly_kit/`（Python 套件）與 `tools/blender/tests/`（headless 測試）
  - 7 個對外函式：`create_connected_mesh`、`extrude_mesh_region`、`boolean_union_objects`、`repair_mesh_topology`、`validate_mesh_topology`、`optimize_lowpoly_mesh`、`prepare_for_gltf`
  - Validation profiles：`building_shell`、`opening`、`glass`、`water_surface`、`decoration`、`organic`
  - 房屋 preset（Phase 4 測試案例：主體、屋頂、煙囪、門、窗、地基）
  - 用驗證器分析現有 `project_room.glb` 作為反例
- 不包含：
  - 不修改、不 fork `mcp-for-blender`，也不新增 MCP server（介面穩定後另開 change 評估）
  - 不替換 world 場景中的 `project_room.glb`（Phase 4 驗收後另開 change）
  - terrain／vegetation／props preset、Phase 5 全自動拆解流程
  - 不引入 Blender 以外的 Python 依賴

## 影響面

- 場景 / 物件（`src/scene/`）：無
- 核心模組（`src/core/`）：無
- 互動 / 輸入（`src/interaction/`）：無
- 資源（`public/`）：Phase 4 可能新增一個測試用 GLB 到 `public/models/`，不覆蓋既有檔案
- 樣式：無
- 新增目錄：`tools/blender/`（需同步更新 `docs/Architecture/README.md`）

## 風險與對策

- 技術風險：
  - 風險：Boolean 產生退化面、非流形或面數暴增
  - 對策：預設用 Blender 5.x 的 `MANIFOLD` solver，失敗再退回 `EXACT`；套用後一律 repair 並驗證，面數超過門檻就還原並回報錯誤
  - 風險：破壞性操作讓使用者的模型損毀
  - 對策：操作前備份 Mesh data（fake user、不連結到場景），失敗時自動換回；`repair` 支援 `dry_run`
  - 風險：Blender API 版本差異
  - 對策：以 5.2 LTS 為基準，enum 一律從 `bl_rna` 讀取，不寫死；solver 不存在時退回可用的選項
  - 風險：測試動到使用者正在用的 Blender
  - 對策：測試一律用 `Blender --background --factory-startup` 獨立執行
- 效能風險（draw call）：
  - 風險：拆太多獨立 Object 導致 draw call 增加
  - 對策：只有需要點擊或動畫的部分保留獨立 Object，其餘依材質合併；匯出報告列出 primitive 數

## 驗證方式

- 功能驗證：headless 單元測試（每個函式至少一個正例、一個反例）
- 視覺驗證：在 Blender 用 `look` 截圖確認小屋外觀；Three.js 載入截圖
- 效能驗證：小屋 GLB 的三角面數與 primitive 數，和現有 `project_room.glb` 比較
- 回歸驗證：不動既有頁面；`npm run build` 仍通過

## 成功標準

- [ ] 幾何島檢查對 `project_room.glb` 的 `Roof` 回報 18 個島
- [ ] 7 個函式都有 headless 測試，且全部通過
- [ ] 破壞性操作失敗時能還原，頂點數與原本一致
- [ ] 小屋：主體、屋頂、地基各 1 個島且封閉；門窗為獨立 Object；0 non-manifold；0 個法線反向的面
- [ ] 小屋 GLB 有單一根節點，Three.js 可載入並以 Raycaster 點到子物件
- [ ] `npm run build` 通過
