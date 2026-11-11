# Engineering Evidence

## 變更摘要

- 對應變更：`add-topology-geometry-qa` — Topology QA 擴充與 Geometry QA（Phase 4）
- 變更檔案清單：
  - `tools/blender/lowpoly_kit/validation/profiles.py`（12 種 profile）、`checks.py`（自我交叉、poles、縮放）、`report.py`（新判定）
  - 新增 `tools/blender/lowpoly_kit/qa/__init__.py`、`qa/geometry.py`；`api.py`（`validate_asset_geometry`）
  - `build/orchestrator.py`（依 profile 決定 wobble／bevel、Geometry QA、bevel 寬度報告）、`build/wobble.py`（(x, z) 雜湊、間距限制）、`build/bevel.py`（安全模式）
  - `components/props.py`（藤蔓葉子四方向）
  - plans：`test01_shop.plan.json`（trim／vegetation、磚面 bounds）、`tree_round.plan.json`（vegetation）
  - 新增 `tests/test_qa.py`；修改 `tests/test_plan_schema.py`、`tests/test_shapes.py`
  - 重新匯出 `public/models/test01_shop/`、`public/models/tree_round/`
  - 文件：`tools/blender/README.md`、`WORKFLOW.md`、`docs/Architecture/README.md`
- Commit / PR 參考：`9bfcc7a`（分支 `feat/blender-asset-pipeline`）

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：
  - headless `112 passed, 0 failed, 112 total`
  - `threejs_plan_check.mjs`、`threejs_check.mjs` 都 ALL PASS
  - test01_shop GLB：4464 個三角面、36 個 primitive、255 KB
  - `npm run build` exit 0；`openspec validate --strict` valid

## 風險與後續追蹤

- 已知風險：
  - 物件之間的穿插沒有判定
  - `FLOATING` 只是近似判斷
- 後續追蹤：
  - Phase 5 palette atlas 與 Visual QA
  - Phase 6 Scene 關係與物件之間的接觸判定

## 封存前檢查

- [x] validation.md 結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 正常
- [x] 已產出本文件，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認）
