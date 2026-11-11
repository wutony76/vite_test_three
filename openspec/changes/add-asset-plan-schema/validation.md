# Validation

## 驗證範圍

- 對應變更：`add-asset-plan-schema` — Reference Analysis 與 Asset／Scene Planning 的資料契約（Phase 2）
- 驗證環境：
  - macOS 15（Darwin 24.6）
  - 一般 Python 3.10.10
  - Blender 5.2.3 LTS（Python 3.13.13，headless 與使用者開啟中的 Blender 都測過）
  - mcp-for-blender 2.2.7

## 功能驗證

- [x] 三種 schema 都有正例與反例測試，全部通過
  - 實際結果：`test_plan_schema.py` 共 29 個測試，一般 Python 下 `Ran 29 tests ... OK`
  - 正例：`test01.reference.json`、`test01_shop.plan.json`、`tree_round.plan.json`、`sample_town.scene.json`
  - 反例：13 個錯誤碼全部覆蓋；另有「重複 id 與 parent 不存在同時回報」的測試
- [x] 驗證器不 import `bpy`，Blender 內外都能執行
  - 實際結果：用 AST 檢查 `pipeline/*.py` 沒有 import bpy／bmesh／mathutils
  - 一般 Python 能 `import lowpoly_kit.pipeline`
  - 透過 MCP `execute_blender_code` 在使用者的 Blender 中呼叫 `api.validate_plan`，4 份 plan 都回傳 `ok=True`
- [x] `test01.reference.json` 的元件框疊圖經人工確認
  - 實際結果：`overlay_reference.py` 輸出第 1 版後修正 3 處（見下方問題紀錄），第 2 版 22 個框都和原圖元件對齊
- [x] `DetailConfig` 的 7 個參數都能各自覆寫，且有範圍檢查
  - 實際結果：`test_override_changes_only_one_field`、`test_range_errors`、`test_detail_rejects_unknown_param_and_preset` 通過
- [ ] Claude Code 與 Cursor 都能觸發同一份 `WORKFLOW.md`
  - 實際結果：skill 和 rule 檔案已建立，且都指向 WORKFLOW.md
  - Claude Code：已確認（Phase 3 開始建模時，skill 出現在清單中，載入後指向 WORKFLOW.md）
  - Cursor：**尚待使用者在 Cursor 觸發一次**
- [x] 既有測試全部通過，`npm run build` 通過
  - 實際結果：headless `74 passed, 0 failed`（exit 0）；`npm run build` exit 0

## 視覺驗證

- 項目：參考圖疊圖（輸出到 session scratchpad，不進版控）
- 結果：第 2 版的 22 個元件框、白色輪廓線都和原圖對齊

## 效能驗證

- 本 change 不產生模型，不適用。
- plan 層的預算：
  - test01_shop 預估 26 個獨立 Object，`max_primitives` 40、`max_tris` 5000
  - sample_town：`max_tris` 150000、`max_draw_calls` 150

## 回歸驗證

- 流程：`lowpoly_kit/__init__.py`、`validation/__init__.py` 改成在沒有 Blender 時略過依賴 bpy／bmesh 的模組
- 結果：
  - 在 Blender 中行為不變，既有 45 個 headless 測試全部通過
  - MCP 中 `reload_all()` 後 `api` 可正常使用
- 流程：`.cursor/rules/blender-modeling.mdc` 改成指向 WORKFLOW.md
- 結果：frontmatter（description、globs、alwaysApply）不變，觸發條件和原本相同

## 問題與修正紀錄

- 問題：純 Python 無法 import `lowpoly_kit.pipeline`
  - 發現方式：設計階段檢查 `__init__.py`，發現套件 import 時會連帶載入 `api`（bpy），`validation/__init__` 會連帶載入 `checks`（bmesh）
  - 修正方式：兩個 `__init__` 都先判斷能不能 import bpy／bmesh，不能時略過相依的模組
  - 是否已重新驗證：是（兩種環境都測過）
- 問題：疊圖第 1 版有 3 處偏差
  - 發現方式：看 `overlay_v1.png`
  - 修正方式：
    - `vine_right` 原本框到路燈支架，改到下方實際的藤蔓位置
    - `street_lamp` 左緣內縮
    - `leaf_green` 取樣區混到背景，改到右側盆栽
  - 是否已重新驗證：是（第 2 版）
- 問題：design §6.1 的色票初估值和原圖差距很大
  - 發現方式：`overlay_reference.py` 印出的取樣中位數
  - 修正方式：全部改用原圖取樣值；飽和度調整交給 Phase 5
  - 是否已重新驗證：是（第 2 版宣告值等於取樣值）
- 問題：原規劃的「單棟 ≤ 4 個 primitive」不切實際
  - 發現方式：列 test01_shop 元件時，可點擊、可做動畫的部件都必須是獨立 Object
  - 修正方式：`max_primitives` 改為 40，design §3.3 補上說明
  - 是否已重新驗證：是（`BUDGET_PRIMITIVES` 警告有測試）
- 問題：原點設在「正面底邊中央」時外框不對稱
  - 發現方式：雨棚、台階、盆栽都凸出到正面之前
  - 修正方式：原點改到 footprint 中心（design §1）
  - 是否已重新驗證：是

## 結論

- 是否通過：**有條件通過**。功能、測試、build 全部通過；只剩「兩個編輯器各實際觸發一次」需要使用者確認。
- 已知限制或風險：
  - `vocab.KINDS` 目前是手寫清單；Phase 3 零件庫完成後要改成從註冊表產生
  - plan 中的 `params` 是 kind 專屬參數，本 change 只驗證 `openings` 參照，其他欄位由 Phase 3 零件庫自行驗證
  - test01_shop 的建築深度（4.25 m）是推測值（confidence 0.4）
- 後續追蹤事項：
  - Phase 3：依 plan 建模（`build_asset_from_plan`、bevel、零件庫）
  - Phase 8 前補第二種建築 plan
