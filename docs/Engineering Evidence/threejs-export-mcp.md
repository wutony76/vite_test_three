# Engineering Evidence

## 變更摘要

- 對應變更：`add-threejs-export-mcp` — GLB 壓縮、manifest、場景燈光、Props、lowpoly MCP server（Phase 7）
- 變更檔案清單：
  - `lowpoly_kit/export/gltf_export.py`（compress）、新增 `export/manifest.py`、`export/__init__.py`
  - `lowpoly_kit/build/orchestrator.py`、`scene/assembly.py`（匯出時寫 manifest）、`api.py`（prepare_for_gltf compress）
  - `pipeline/schema.py`（export.compress、ScenePlan lights）
  - 新增 `lowpoly_kit/qa/preview.py`；`scripts/build_from_plan.py`、`build_scene.py` 改用它
  - 新增 `tools/blender/mcp_server/server.py`、`scripts/mcp_runner.py`、`tests/mcp_smoke.py`、`.mcp.json`、`.cursor/mcp.json`
  - plans：新增 `lamp_post`、`crate_pile`；`sample_town`（Props、lights、compress）；各資產 plan 加上 compress
  - Three.js 檢查：`threejs_plan_check.mjs`、`threejs_scene_check.mjs`
  - 模型：重新匯出 test01_shop、test02_cottage、tree_round、sample_town；新增 lamp_post、crate_pile；各模型的 manifest
- Commit / PR 參考：見分支 `feat/blender-asset-pipeline`

## 驗證佐證

- 對應 `validation.md` 結論：通過
- headless 147 passed；`mcp_smoke.py` ALL PASS；Three.js 4 份檢查 ALL PASS；`npm run build` exit 0

## 風險與後續追蹤

- 頁面要設定 MeshoptDecoder；`.mcp.json` 需要使用者核准
- 後續：把 sample_town 接進 Three.js 頁面（依 manifest 建立燈光與點擊互動）

## 封存前檢查

- [x] validation.md 結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 正常
- [x] 已產出本文件，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認）
