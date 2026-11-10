# Engineering Evidence

## 變更摘要

- 對應變更：add-blender-lowpoly-pipeline — Blender Low Poly 建模函式庫與拓撲驗證
- 變更檔案清單：
  - `tools/blender/lowpoly_kit/`（新增）：`api.py`、`result.py`、`backup.py`、`evaluate.py`、`mesh_builder.py`、`extrusion.py`、`boolean_engine.py`、`repair.py`、`lowpoly.py`、`remesh_engine.py`、`validation/`、`export/`、`presets/building.py`
  - `tools/blender/tests/`（新增）：`run.py`、`fixtures.py`、`test_validation.py`、`test_modeling.py`、`test_boolean_repair.py`、`test_house_export.py`、`threejs_check.mjs`
  - `tools/blender/scripts/build_house.py`、`tools/blender/README.md`（新增）
  - `public/models/lowpoly_house/lowpoly_house.glb`、`README.md`（新增）
  - `.gitignore`（忽略 `__pycache__/`、`*.pyc`）
  - `openspec/changes/add-blender-lowpoly-pipeline/*`、`docs/Architecture/README.md`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：
  - headless Blender 測試 `45 passed, 0 failed`（exit code 0）
  - `project_room.glb` 反例：`Roof` 18、`Chimney` 8、`Walls_Main` 3 個幾何島
  - `lowpoly_house.glb`：1 個根節點、8 個 Mesh、13 個 primitive、236 個三角面，每個 Mesh 1 個幾何島
  - `node tools/blender/tests/threejs_check.mjs`：14 項全部通過（Raycaster 打到 Door／Window_SideR、零件可獨立移動）
  - 使用者 Blender 中 `LowpolyKit_House` 場景的 `look` 截圖

## 風險與後續追蹤

- 已知風險：
  - Boolean 交界可能產生 ngon（目前只提醒）
  - 依賴 AI 主動載入函式庫，不是 MCP 正式工具
  - 只在 Blender 5.2 LTS 驗證
- 後續追蹤事項：用 lowpoly_kit 重建 `project_room`；更多 preset；評估包成 MCP server

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 已確認正常（本變更不影響頁面，未另開 dev server）
- [x] 已產出 `docs/Engineering Evidence/blender-lowpoly-pipeline.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
