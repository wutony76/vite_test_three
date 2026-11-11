# Engineering Evidence

## 變更摘要

- 對應變更：`add-scene-assembly` — Scene Assembly Engine 與 Scene QA（Phase 6）
- 變更檔案清單：
  - 新增 `tools/blender/lowpoly_kit/scene/`（`terrain.py`、`assembly.py`）、`qa/scene.py`
  - 修改 `api.py`（`build_scene_from_plan`）、`export/gltf_export.py`（gpu instancing）、`build/orchestrator.py`（建模前恢復 collection 可見）、`pipeline/schema.py`（ScenePlan 擴充）
  - 新增 `scripts/build_scene.py`、`tests/test_scene_terrain.py`、`tests/test_scene.py`、`tests/threejs_scene_check.mjs`
  - plans：`sample_town.scene.json` 重新配置
  - 新增 `public/models/sample_town/`（GLB + README）
  - 文件：`tools/blender/README.md`、`WORKFLOW.md`、`docs/Architecture/README.md`
- Commit / PR 參考：見分支 `feat/blender-asset-pipeline`

## 驗證佐證

- 對應 `validation.md` 結論：通過
- headless `147 passed, 0 failed`；純 Python 4 個測試檔 OK
- `threejs_scene_check.mjs` 17 項 ALL PASS；資產與舊小屋的 Three.js 檢查都 ALL PASS
- sample_town GLB：1 個根節點、103 個節點、50 個 mesh、13,444 個三角面、1.1 MB，使用 EXT_mesh_gpu_instancing
- `npm run build` exit 0；`openspec validate --strict` valid

## 風險與後續追蹤

- 沒有 Props、沒有建築最小間距規則
- 後續：Phase 7（meshopt、headless MCP server）、Phase 8（Test A／B 端到端自動化）、把 sample_town 接進 Three.js 頁面

## 封存前檢查

- [x] validation.md 結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 正常
- [x] 已產出本文件，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認）
