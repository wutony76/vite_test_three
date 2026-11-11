# Engineering Evidence

## 變更摘要

- 對應變更：`add-plan-geometry-engine` — 依 AssetPlan 確定性建模（Stylized Asset Pipeline Phase 3）
- 變更檔案清單：
  - 新增 `tools/blender/lowpoly_kit/shapes.py`
  - 新增 `tools/blender/lowpoly_kit/components/`：`__init__`、`layout`、`structure`、`openings`、`props`、`nature`
  - 新增 `tools/blender/lowpoly_kit/build/`：`orchestrator`、`materials`、`wobble`、`bevel`
  - 修改 `lowpoly_kit/api.py`（`build_asset_from_plan`）、`extrusion.py`（孤立邊修正）、`pipeline/schema.py`（params 材質參照、KIND_NOT_IMPLEMENTED）
  - 新增 `tools/blender/scripts/build_from_plan.py`
  - 新增 `tests/test_shapes.py`、`tests/test_build_plan.py`、`tests/threejs_plan_check.mjs`；修改 `tests/test_plan_schema.py`
  - 修改 `tools/blender/plans/test01_shop.plan.json`、`tree_round.plan.json`、`test01.reference.json`（窗台花槽 bbox）
  - 新增 `public/models/test01_shop/`、`public/models/tree_round/`（GLB + README）
  - 文件：`tools/blender/README.md`、`tools/blender/WORKFLOW.md`、`docs/Architecture/README.md`
  - `openspec/changes/add-plan-geometry-engine/*`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：
  - headless Blender `tests/run.py` → `100 passed, 0 failed, 100 total`
  - `python3 -m unittest`：`test_plan_schema.py`、`test_shapes.py` 都 OK
  - `node tools/blender/tests/threejs_plan_check.mjs tools/blender/plans/test01_shop.plan.json` → ALL PASS（9 項）
  - `node tools/blender/tests/threejs_check.mjs` → ALL PASS（既有小屋回歸）
  - test01_shop：26 個 Object、4822 個三角面、40 個 primitive；GLB 1 個根節點、24 個 mesh、36 個 primitive、255 KB
  - tree_round：430 個三角面、2 個 primitive
  - `npm run build` exit 0；`openspec validate add-plan-geometry-engine --strict` valid
  - 預覽圖 v1～v3 與參考圖並排比較（session scratchpad）

## 風險與後續追蹤

- 已知風險：
  - 剝落磚面是矩形
  - 海報、招牌沒有圖案
  - material／texture quality 尚未生效
  - Boolean 交界的 ngon
  - primitive 預算暫時是 48
- 後續追蹤事項：
  - Phase 4 Geometry QA
  - Phase 5 palette atlas 與 silhouette IoU
  - grid_slab 支援斜向區域

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 已確認正常（GLB 尚未接進任何頁面）
- [x] 已產出 `docs/Engineering Evidence/plan-geometry-engine.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
