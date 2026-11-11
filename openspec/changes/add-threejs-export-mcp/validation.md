# Validation

## 驗證範圍

- 對應變更：`add-threejs-export-mcp`（Phase 7）
- 驗證環境：Blender 5.2.3 LTS headless、mcp 2.3.0（`uv run --with "mcp>=2,<3"`）、Node + three 0.186

## 功能驗證

- [x] GLB 都壓縮，檔案大小下降：

  | 模型 | 壓縮前 | 壓縮後 |
  |---|---|---|
  | test01_shop | 453 KB | 236 KB |
  | test02_cottage | 358 KB | 184 KB |
  | tree_round | 26 KB | 20 KB |
  | sample_town | 1.1 MB | 573 KB（加了 Props 之後） |

- [x] 每個 GLB 都有 manifest，Three.js 檢查會比對 manifest
  - test01：7 個節點名稱都存在
  - sample_town：28 個節點名稱都存在
  - requires 包含 `EXT_meshopt_compression`
- [x] sample_town 有 Props 與燈光：
  - 4 盞街燈、8 棵樹分別變成 InstancedMesh（4、8）
  - 2 組木箱堆
  - manifest 燈光：sun、hemisphere
  - Scene QA pass；draw call 113 ≤ 150
- [x] MCP server：`mcp_smoke.py` ALL PASS
  - 5 個工具
  - 列出 8 份 plan
  - validate ok
  - 專案外的檔案被拒絕
  - build_asset(tree_round) 在背景 Blender 建模成功
- [x] 既有測試全部通過：headless 147 passed；Three.js 4 份檢查 ALL PASS；`npm run build` exit 0

## 問題與修正紀錄

- manifest 列出 instance 路燈的節點名稱，但 instance 物件匯出後被合併成 InstancedMesh，名稱不存在
  - 修正：instance 物件的動畫群組改記在 `instanced` 區段
- Three.js 場景檢查原本把所有非 instance 擺放都當成建築（木箱堆沒有門），把樹和路燈合併計數
  - 修正：只檢查有牆體與門的資產；InstancedMesh 依資產分別比對
- mcp 2.x 已把 FastMCP 改名為 MCPServer，client 回傳欄位改為 snake_case（`structured_content`、`is_error`）
  - 依實際 API 實作，並固定版本 `mcp>=2,<3`
- `lowpoly_kit.export` 在 Blender 外 import 失敗（gltf_export 需要 bpy）
  - 修正：比照 validation，Blender 外只載入 glb_stats

## 結論

- 是否通過：**通過**
- 已知限制：
  - 頁面載入這些 GLB 時必須設定 MeshoptDecoder（README 有範例）
  - Claude Code 第一次使用 `.mcp.json` 時需要使用者核准
