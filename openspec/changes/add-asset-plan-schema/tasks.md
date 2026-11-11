# Tasks

## 1. 規格與設計確認

- [x] 完成 proposal 定稿（範圍／風險／驗證方式）
- [x] 完成 design 定稿（schema／錯誤碼／DetailConfig／test01 分析）
- [x] 使用者確認 design 第 9 節的待確認事項（屋瓦方案 a、門高 2.1 m、edge_wobble 2 cm）

## 2. Schema 與驗證器（`lowpoly_kit/pipeline/`，不 import bpy）

- [x] `vocab.py`：kind／method／tier／view.type 清單；profile 從 `validation/profiles.py` 讀取
- [x] `schema.py`：共用欄位（source／confidence／assumption）驗證
- [x] `schema.py`：ReferenceSpec 驗證（bbox 範圍、正規化座標、scale_anchor 指向存在的元件）
- [x] `schema.py`：AssetPlan 驗證（id 唯一、參照存在、parent 無循環、method 與 profile 的限制、外框容差）
- [x] `schema.py`：ScenePlan 驗證（asset_id、placements、預算上限）
- [x] 一次收集全部錯誤並附 JSON path；報告包含 counts、inferred_ratio、warnings
- [x] `detail_config.py`：7 個參數、3 個 preset、逐項覆寫、範圍檢查、由 plan id 產生 seed
- [x] `api.validate_plan(plan_or_path)`：接受 dict 或檔案路徑，回傳既有 result 格式
- [x] `lowpoly_kit/__init__.py`、`validation/__init__.py`：不在 Blender 時略過依賴 bpy／bmesh 的模組，pipeline 才能在一般 Python 中 import

## 3. 範例 plan（`tools/blender/plans/`）

- [x] `test01.reference.json`：依 design 6.1～6.3 建立，從原圖取樣校正色票
- [x] `scripts/overlay_reference.py`：bbox 疊圖輸出到暫存目錄，人工確認後修正 bbox（修正內容見 design §10）
- [x] `test01_shop.plan.json`：雨棚採瓦楞方案，29 個元件，bounds 由 bbox 以門高 2.1 m 換算
- [x] `tree_round.plan.json`：小鎮用樹（remesh + organic 的正例）
- [x] `sample_town.scene.json`：地形、2 條道路、4 棟建築、8 棵 instanced 樹

## 4. 編輯器流程

- [x] `tools/blender/WORKFLOW.md`：建模流程的單一來源
- [x] 縮短 `.cursor/rules/blender-modeling.mdc`，內容指向 WORKFLOW.md
- [x] 新增 `.claude/skills/blender-modeling/SKILL.md`
- [x] Claude Code：2026-11-11 Phase 3 建模時，`blender-modeling` skill 出現在清單中，觸發後指向 WORKFLOW.md
- [ ] Cursor：待使用者在 Cursor 觸發一次確認

## 5. 測試

- [x] `tests/test_plan_schema.py`：4 份範例 plan 的正例，加上每個錯誤碼的反例（共 29 個）
- [x] 純 Python `python3 -m unittest` 通過
- [x] headless `tests/run.py` 全部通過（74 個，含既有 45 個）
- [x] `npm run build` 通過

## 6. 交付

- [x] 更新 `tools/blender/README.md`（pipeline、plans、validate_plan）
- [x] 更新 `docs/Architecture/README.md` 第 4.1 節
- [x] `validation.md`
- [x] `docs/Engineering Evidence/asset-plan-schema.md`
