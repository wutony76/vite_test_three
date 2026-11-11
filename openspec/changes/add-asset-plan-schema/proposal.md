# Proposal

## 變更名稱

`add-asset-plan-schema` — Reference Analysis 與 Asset／Scene Planning 的資料契約（Stylized Asset Pipeline Phase 2）

## 背景

Phase 1（現況調查，2026-11-11）的結論：

- 環境：Blender 5.2.3 LTS（Python 3.13、numpy 2.3.4）、`mcp-for-blender` 2.2.7（addon 1.8、protocol 15）、Three.js 0.186。
- `tools/blender/lowpoly_kit` 已有建模、拓撲驗證與 GLB 匯出功能，但**沒有「規劃」這一層**：每個 preset 是 160～600 行寫死的程式，尺寸是常數，AI 直接寫 bmesh 程式碼。
- 造成的品質問題：
  - 比例沒有依據：沒有 reference analysis，也沒有可以比對的比例數值。
  - 細節無法重用、也無法分層控制。
  - preset 用頂點拼出 box／sphere 再 `_append` 到同一個 mesh，掛在不限島數的 `decoration` profile 下，本質上等於 Join。
  - 同一個需求每次產生的結果都不同，無法測試或 diff。

使用者已確認的決策：

| 項目 | 決定 |
|---|---|
| 未 commit 的 preset（`storybook_cottage`、`lime_shop`、`denpa_sign`、`hi_orbit`） | 之後改寫成 plan；本 change 不動 |
| MCP 路線 | 短期沿用 `execute_blender_code` 載入 lowpoly_kit；Phase 7 再自建 headless MCP server |
| Test A 參考圖 | `tools/img/test01.jpg` |
| 效能目標 | 桌機 |
| 外部 Node 工具（如 `gltf-transform`） | 可以安裝 |
| AI 編輯器 | Claude Code 與 Cursor 都會使用 |

## 目標

建立 AI 與 Blender 程式之間**唯一的資料契約**：

1. AI 看參考圖或文字後，輸出 `ReferenceSpec`、`AssetPlan`、`ScenePlan` 三種 JSON。
2. 每個欄位都標示 `observed`（圖上看得到）或 `inferred`（推測），推測的部分要附上假設。
3. 有一個純 Python 的驗證器（不依賴 `bpy`），在 Blender 內外都能檢查 plan 是否合法。
4. `DetailConfig` 讓 Primary／Secondary／Tertiary 細節、bevel、材質、貼圖品質可以各自調整。
5. Claude Code 和 Cursor 都照同一份建模流程走。

後續的 Geometry Engine（Phase 3）會直接讀這份 plan 執行，所以本 change 是後面所有 Phase 的前提。

## 範圍

- 包含：
  - `tools/blender/lowpoly_kit/pipeline/`：`schema.py`（三種 schema 與驗證）、`detail_config.py`（參數與預設等級）
  - `api.validate_plan(plan_or_path)`：沿用現有的 `{ok, object, changes, report, errors, backup}` 回傳格式
  - `tools/blender/plans/`：存放 plan JSON
    - `test01.reference.json`：根據 `tools/img/test01.jpg` 手動校正過的 ReferenceSpec
    - `test01_shop.plan.json`：Test A 的 AssetPlan 草稿
    - `sample_town.scene.json`：Test B 的 ScenePlan 草稿
  - `tools/blender/WORKFLOW.md`：建模流程的單一來源，Cursor rule 和 Claude Code skill 都引用它
  - 修改 `.cursor/rules/blender-modeling.mdc`，新增 `.claude/skills/blender-modeling/SKILL.md`
  - headless 與純 Python 的 schema 測試
- 不包含：
  - 依 plan 產生幾何（Phase 3 `build_asset_from_plan`）
  - 新增 profile、Geometry／Scene QA（Phase 4）
  - palette atlas、Visual QA、silhouette IoU（Phase 5）
  - 改寫現有 preset、修改 `mcp-for-blender`
  - 自動影像分割：reference 由 Claude 視覺分析後再由人工校正，不引入影像模型

## 影響面

- 場景 / 物件（`src/`）：無
- 資源（`public/`）：無
- 新增 `tools/blender/plans/`、`tools/blender/lowpoly_kit/pipeline/`、`tools/blender/WORKFLOW.md`、`.claude/skills/blender-modeling/`
- 修改 `tools/blender/lowpoly_kit/api.py`（新增 `validate_plan`）、`.cursor/rules/blender-modeling.mdc`
- 文件：`docs/Architecture/README.md` 第 4.1 節、`tools/blender/README.md`

## 風險與對策

- 技術風險：
  - 風險：AI 每次輸出的 JSON 結構不穩定
  - 對策：驗證器回傳「欄位路徑 + 錯誤碼」，讓 AI 依錯誤重寫；不接受部分合法的 plan
  - 風險：Blender 內建 Python 沒有 `jsonschema`
  - 對策：自己寫驗證，只用標準函式庫；schema 也輸出成 JSON Schema 文件，給編輯器做提示
  - 風險：單張正面插畫看不到深度和屋頂
  - 對策：`observed` 和 `inferred` 強制分開；推測欄位必須寫 `assumption`，報告中列出推測比例
  - 風險：兩個編輯器的規則內容不一致
  - 對策：流程只寫在 `WORKFLOW.md`，rule 和 skill 只放觸發條件和連結
- 效能風險：無（本 change 不產生模型）

## 驗證方式

- 功能驗證：
  - 純 Python：`python3 -m unittest`（不需要 Blender）
  - headless Blender：`tests/run.py -- plan`
  - 正例：3 份範例 plan 都通過
  - 反例：缺少欄位、id 重複、parent 不存在、profile 不存在、非 organic 卻用 remesh、元件超出外框、`inferred` 沒有寫 `assumption`，都要回傳正確的錯誤碼
- 視覺驗證：把 `test01.reference.json` 的 bbox 疊在原圖上輸出成 PNG，人工確認元件框的位置
- 回歸驗證：既有 45 個 headless 測試全部通過；`npm run build` 通過

## 成功標準

- [ ] 三種 schema 都有正例與反例測試，全部通過
- [ ] 驗證器不 import `bpy`，Blender 內外都能執行
- [ ] `test01.reference.json` 的元件框疊圖經人工確認
- [ ] `DetailConfig` 的 7 個參數都能各自覆寫，且有範圍檢查
- [ ] Claude Code 與 Cursor 都能觸發同一份 `WORKFLOW.md`
- [ ] 既有測試全部通過，`npm run build` 通過
