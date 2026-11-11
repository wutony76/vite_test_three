# Engineering Evidence

## 變更摘要

- 對應變更：`add-appearance-visual-qa` — Material Engine 與 Visual QA（Phase 5）
- 變更檔案清單：
  - 新增 `tools/blender/lowpoly_kit/appearance/`（`atlas.py`）
  - 新增 `build/appearance.py`、`qa/metrics.py`、`qa/visual.py`
  - 修改 `build/orchestrator.py`（外觀步驟）、`api.py`（`validate_visual`）、`export/gltf_export.py`（vertex color）
  - 修改 `components/layout.py`（instance 形狀檢查）、`components/openings.py`（門玻璃凹槽）、`components/props.py`（壁燈、葉團）
  - 改寫 `scripts/build_from_plan.py`（`--render` = Visual QA + 3/4 預覽）
  - plans：`test01.reference.json`（壓頂取樣）、`test01_shop.plan.json`（壓頂顏色、門玻璃凹槽、預算 32）
  - 新增 `tests/test_visual_metrics.py`、`tests/test_appearance.py`；修改 `tests/threejs_plan_check.mjs`、`test_build_plan.py`、`test_shapes.py`
  - 重新匯出 `public/models/test01_shop/`、`public/models/tree_round/`
  - 文件：`tools/blender/README.md`、`WORKFLOW.md`、`docs/Architecture/README.md`、`public/models/test01_shop/README.md`
- Commit / PR 參考：`9bfcc7a`（分支 `feat/blender-asset-pipeline`）

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：
  - headless `128 passed, 0 failed, 128 total`
  - `threejs_plan_check.mjs` 11 項 ALL PASS：
    - draw call 30 ≤ 32
    - 27/27 不透明 mesh 使用 NEAREST atlas
    - 30/30 帶 vertex color
  - Visual QA：輪廓 IoU 0.9866、元件位置 IoU 平均 0.8608、所有 ΔE ≤ 11.3
  - GLB：29 個 primitive、3 個材質、453 KB
  - `npm run build` exit 0；4 個 OpenSpec change 都 `--strict` valid

## 風險與後續追蹤

- 已知風險：
  - mipmap 遠景混色
  - 只支援正面參考圖
  - GLB 體積增加
- 後續追蹤：
  - Phase 6：Scene Assembly 與物件之間的接觸關係
  - Phase 7：meshopt、gpu instancing、headless MCP server
  - 非正面參考圖的相機估計

## 封存前檢查

- [x] validation.md 結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 正常
- [x] 已產出本文件，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認）
