# Proposal

## 變更名稱

`add-topology-geometry-qa` — Topology QA 擴充與 Geometry QA（Stylized Asset Pipeline Phase 4）

## 背景

Phase 3 已經可以依 plan 建模，但驗證仍只有 Phase 1 的 9 項拓撲檢查，有這些漏洞：

- `decoration` 不限島數：把一堆方塊塞進同一個 mesh 也會通過。
- 沒有自我交叉檢查：Boolean 或 bevel 弄壞的牆，只要沒有開放邊就會通過。
- 沒有面數上限：單一零件爆面不會被發現。
- 只有 6 種 profile：樑柱、植物都只能借用 `building_shell` 或 `decoration`，規則不是太嚴就是太鬆。
- 沒有「幾何」層的檢查：零件超出 plan 指定的位置、浮在半空中（Phase 2 盆栽浮起 7 cm 就是靠人工發現的）、負縮放，都沒有程式能抓。

## 目標

1. Profile 擴充成 12 種，每種都有島數上限、三角面上限、自我交叉規則，並決定建模時要不要 wobble、bevel。
2. 拓撲檢查新增：
   - 自我交叉（BVHTree）
   - 島數上限
   - 三角面上限
   - 負縮放、非等比縮放
   - poles（只回報數值）
3. Geometry QA：對照 plan 檢查每個 Object 的世界外框（超出 bounds、尺寸明顯不足），以及懸空。
4. `build_asset_from_plan` 建完自動執行 Geometry QA；另外提供 `api.validate_asset_geometry`。

## 範圍

- 包含：
  - `validation/profiles.py`：新增 `roof`、`trim`、`tile_array`、`vegetation`、`terrain`、`road`；所有 profile 補上新欄位
  - `validation/checks.py`、`report.py`：新的檢查項目與判定
  - `qa/geometry.py`：bounds、尺寸不足、懸空
  - orchestrator 改成依 profile 欄位決定是否 wobble、bevel，並執行 Geometry QA
  - plan 調整：樑、雨遮、磚柱改用 `trim`；藤蔓、樹幹改用 `vegetation`
  - 測試：每個新檢查的正例與反例
- 不包含：
  - 物件之間的穿插判定：門窗放進凹槽、柱子貼牆都是刻意的重疊，要等 Scene 階段有「允許接觸」的關係描述再做
  - Scene QA（Phase 6）
  - Visual QA（Phase 5）

## 影響面

- `tools/blender/lowpoly_kit/validation/*`、新增 `lowpoly_kit/qa/`、`build/orchestrator.py`、`api.py`
- `tools/blender/plans/test01_shop.plan.json`、`tree_round.plan.json`（profile 調整）
- 重新匯出 `public/models/test01_shop/`、`tree_round/`（userData 的 profile 會改變）
- 文件：README、WORKFLOW、Architecture

## 風險與對策

- 風險：自我交叉檢查誤報（共用邊或共用頂點的相鄰面本來就「接觸」）
  - 對策：排除共用頂點的面對；只有 1 個島的 profile 判定為 fail，多島 profile 只回報數值
- 風險：新規則讓既有 preset（小屋、storybook）不通過
  - 對策：跑完整回歸；新增欄位都給預設值，舊 profile 的判定保持不變，只多出新的檢查項目
- 風險：懸空判定靠外框接觸，太寬鬆
  - 對策：先列為 warn；Phase 6 再用 Scene 關係精確判定

## 驗證方式

- headless：
  - 每個新檢查至少一個正例、一個反例（交叉的兩個方塊、超出上限的島數、負縮放、懸空的物件）
  - test01_shop 與 tree_round 全部通過
- 回歸：既有 100 個測試、Three.js 檢查、`npm run build`

## 成功標準

- [ ] 12 種 profile，皆有 `max_components`／`max_tris`／`self_intersection`／`bevel`／`wobble`
- [ ] Join 起來的互相穿插方塊，在 `building_shell` 回報自我交叉並判定 fail
- [ ] test01_shop、tree_round 所有 Object 通過新的拓撲規則與 Geometry QA（沒有 fail）
- [ ] 刻意把盆栽抬高 0.5 m，Geometry QA 會回報懸空；把零件移出 bounds，會回報超出
- [ ] 既有測試全部通過
