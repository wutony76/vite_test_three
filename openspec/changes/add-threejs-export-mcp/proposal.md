# Proposal

## 變更名稱

`add-threejs-export-mcp` — GLB 壓縮、Three.js manifest、場景燈光與 headless MCP server（Stylized Asset Pipeline Phase 7）

## 背景

- GLB 加上 UV 與 vertex color 後變大（test01 453 KB、sample_town 1.1 MB），還沒有壓縮。
- Three.js 端要知道哪些節點可以點擊、哪些燈要一起亮，目前只能自己翻 userData。
- Test B 要求「場景燈光」：Phase 2 決定燈光由 Three.js 建立，但 ScenePlan 沒有描述燈光的地方。
- Test B 要求「裝飾物」：sample_town 的 Props 群組目前是空的。
- 建模流程靠 AI 用 `execute_blender_code` 載入 lowpoly_kit，不是正式的 MCP 工具（Phase 1 規劃的方案 B）。

## 目標

1. **meshopt 壓縮**：plan 的 `export.compress`（預設 true）→ `EXT_meshopt_compression`。Three.js 端用 `MeshoptDecoder` 解壓。
2. **manifest**：每個 GLB 旁邊輸出 `<name>.manifest.json`，內容包括：
   - 根節點、可點擊節點、動畫群組、instance 群組
   - 擺放（場景）、燈光（場景）
   - GLB 統計與 QA 結果
3. **ScenePlan `lights`**：sun／hemisphere／ambient／point，寫進 manifest；不放進 GLB，因為 Blender 和 Three.js 的燈光強度單位不同。
4. **Props**：新增 `lamp_post`（街燈，instance）與 `crate_pile`（木箱與木桶）兩個資產，放進 sample_town 的 Props 群組。
5. **headless MCP server `lowpoly`**：
   - 每個工具都在背景執行的 Blender 子行程中運行，不碰使用者開著的 Blender
   - 工具：`lowpoly_list_plans`、`lowpoly_validate_plan`、`lowpoly_build_asset`、`lowpoly_build_scene`、`lowpoly_run_tests`
   - 登錄在專案的 `.mcp.json`（Claude Code）與 `.cursor/mcp.json`（Cursor）

## 範圍

- 包含：
  - `export/gltf_export.py`（compress）、`export/manifest.py`
  - schema：`export.compress`、ScenePlan `lights`
  - 新增 plans：`lamp_post.plan.json`、`crate_pile.plan.json`；sample_town 加入 Props 與 lights
  - `tools/blender/mcp_server/server.py`、`scripts/mcp_runner.py`、`tests/mcp_smoke.py`
  - Three.js 檢查腳本加入 MeshoptDecoder 與 manifest 檢查
- 不包含：
  - Draco、KTX2：atlas 貼圖只有 64 px，壓縮效益小
  - 修改 `src/` 頁面：GLB 接進 Three.js 頁面另開 change
  - 修改 mcp-for-blender

## 風險與對策

- 風險：專案的 `.mcp.json` 第一次使用時，Claude Code 會要求核准
  - 對策：README 說明；伺服器只讀寫 `tools/blender`、`public/models` 與暫存目錄
- 風險：mcp 套件 2.x 的 API 和 1.x 不同
  - 對策：固定 `mcp>=2,<3`；用 `mcp_smoke.py` 實際啟動伺服器並呼叫工具
- 風險：meshopt 壓縮後，頁面忘記設定 decoder
  - 對策：manifest 標註 `requires: ["EXT_meshopt_compression"]`；README 附 Three.js 範例

## 驗證方式

- Blender：壓縮後的 GLB 帶 `EXT_meshopt_compression` 且檔案變小；manifest 的節點名稱都存在於 GLB
- Three.js：用 MeshoptDecoder 載入後，原有檢查全部通過
- MCP：`mcp_smoke.py` 經 stdio 啟動伺服器，列出 5 個工具，並實際呼叫 validate 與 build
- 回歸：既有測試、`npm run build`

## 成功標準

- [ ] 三個資產與 sample_town 的 GLB 都壓縮，檔案大小下降
- [ ] 每個 GLB 都有 manifest，Three.js 檢查會比對 manifest
- [ ] sample_town 有 Props 與燈光設定，Scene QA pass
- [ ] MCP server 可經 stdio 呼叫
- [ ] 既有測試全部通過
