# Engineering Evidence

## 變更摘要

- 對應變更：`add-asset-plan-schema` — Reference Analysis 與 Asset／Scene Planning 的資料契約（Stylized Asset Pipeline Phase 2）
- 變更檔案清單：
  - 新增 `tools/blender/lowpoly_kit/pipeline/`：`__init__.py`、`schema.py`、`detail_config.py`、`vocab.py`
  - 修改 `tools/blender/lowpoly_kit/api.py`（新增 `validate_plan`）、`lowpoly_kit/__init__.py`、`lowpoly_kit/validation/__init__.py`（沒有 Blender 時也能 import）
  - 新增 `tools/blender/plans/`：`test01.reference.json`、`test01_shop.plan.json`、`tree_round.plan.json`、`sample_town.scene.json`
  - 新增 `tools/blender/scripts/overlay_reference.py`、`tools/blender/tests/test_plan_schema.py`
  - 新增 `tools/blender/WORKFLOW.md`、`.claude/skills/blender-modeling/SKILL.md`；修改 `.cursor/rules/blender-modeling.mdc`
  - 文件：`tools/blender/README.md`、`docs/Architecture/README.md`
  - `openspec/changes/add-asset-plan-schema/*`
  - 參考圖 `tools/img/test01.jpg` 由使用者提供
- Commit / PR 參考：`9bfcc7a`（分支 `feat/blender-asset-pipeline`）

## 驗證佐證

- 對應 `validation.md` 結論：通過（Claude Code、Cursor 都已實際觸發確認）
- 佐證：
  - `python3 -m unittest discover -s tools/blender/tests -p "test_plan_schema.py"` → `Ran 29 tests ... OK`
  - headless Blender `tests/run.py` → `74 passed, 0 failed, 74 total`（exit 0）
  - MCP 中 `api.validate_plan` 對 4 份 plan 都回傳 `ok=True`
    - test01_shop：29 個元件（primary 4／secondary 13／tertiary 12）、inferred 10.3%、預估 26 個 Object
  - 疊圖第 2 版：22 個元件框對齊原圖；11 個色票都等於原圖取樣的中位數
  - `npm run build` exit 0
  - `openspec validate add-asset-plan-schema --strict` → valid

## 風險與後續追蹤

- 已知風險：
  - `KINDS` 是手寫清單，可能和 Phase 3 零件庫不一致
  - `params` 只驗證 `openings` 參照，其他參數要等零件庫驗證
  - 建築深度是推測值
  - 依賴 AI 讀 WORKFLOW.md；Phase 7 的 MCP server 才會把流程變成正式工具
- 後續追蹤事項：
  - Phase 3 `build_asset_from_plan`
  - Phase 8 前補第二種建築 plan

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 已確認正常（本變更不影響頁面）
- [x] 已產出 `docs/Engineering Evidence/asset-plan-schema.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
