# Proposal

## 變更名稱

`add-plan-geometry-engine` — 依 AssetPlan 確定性建模：Geometry Engine、Detail Engine、零件庫（Stylized Asset Pipeline Phase 3）

## 背景

Phase 2（`add-asset-plan-schema`）已經定義 plan JSON 的格式並完成驗證，但還沒有程式能「照 plan 建模」：

- 現有 preset 都是寫死的程式（160～600 行），沒辦法重用。
- `lowpoly_kit` 只有 box、prism 兩種形狀產生器，沒有 loft／lathe／sweep，圓形或彎曲的零件只能用 primitive 湊。
- 沒有 bevel。卡通風格最重要的「稜角高光」做不出來。
- `storybook_cottage` 用頂點拼出 box／sphere 再塞進同一個 mesh，本質上等於 Join。

## 目標

1. `api.build_asset_from_plan(plan)`：讀 AssetPlan，建出完整資產。同一份 plan 跑兩次，結果完全相同。
2. 零件庫：每個 `kind` 對應一個參數化 builder，用連續拓撲建模，不用 primitive 堆疊。
3. Detail Engine：`DetailConfig` 的參數實際影響幾何，包括 bevel 段數、圓形分段數、次要與裝飾細節的多寡。
4. 用 Test A（`test01_shop.plan.json`）實際建模、驗證、匯出 GLB，並在 Three.js 載入。

## 範圍

- 包含：
  - `lowpoly_kit/shapes.py`（純 Python）：`MeshData`、`box`、`grid_slab`（可做凹槽與貫穿洞的格狀板）、`prism`（凹多邊形用 ear clipping 三角化端面）、`loft`、`lathe`、`sweep`、`blob`
  - `lowpoly_kit/components/`（純 Python）：零件註冊表，以及 test01_shop 與 tree_round 用到的 25 個 kind
  - `lowpoly_kit/build/`（Blender）：`orchestrator.py`、`materials.py`、`bevel.py`、`wobble.py`
  - `api.build_asset_from_plan`
  - `scripts/build_from_plan.py`：headless 建模、匯出、輸出報告與預覽圖
  - schema 擴充：`params` 中以 `_material`／`_materials` 結尾的欄位必須參照存在的材質；kind 沒有實作時給警告
  - 測試：shapes／components 純 Python 拓撲測試；Blender 端建模、確定性、匯出測試；Three.js 載入檢查
- 不包含：
  - 沒用到的 kind（`roof_gable`、`roof_hip`、`roof_tiles`、`lantern`、`crate`、`fence`、`bush`、`rock`）：建模時回報 `COMPONENT_NOT_IMPLEMENTED`
  - 新 profile、Geometry QA（Phase 4）
  - palette atlas、vertex color、silhouette IoU（Phase 5）；本 change 用一般材質，`material_quality`／`texture_quality` 暫不生效
  - Scene 組裝（Phase 6）、meshopt 壓縮（Phase 7）
  - 改寫既有 preset

## 影響面

- 場景 / 物件（`src/`）：無。GLB 放在 `public/models/test01_shop/`，本 change 不接進任何頁面。
- 資源（`public/`）：新增 `public/models/test01_shop/test01_shop.glb`
- 新增：`tools/blender/lowpoly_kit/{shapes.py, components/, build/}`、`scripts/build_from_plan.py`、`tests/test_shapes.py`、`tests/test_build_plan.py`、`tests/threejs_plan_check.mjs`
- 修改：`api.py`、`pipeline/schema.py`、`plans/test01_shop.plan.json`（補齊 builder 需要的 params）
- 文件：`tools/blender/README.md`、`WORKFLOW.md` §3、`docs/Architecture/README.md`

## 風險與對策

- 風險：Bevel 在窄面或凹角產生重疊、破面
  - 對策：`clamp_overlap`；寬度依物件最小尺寸縮放；bevel 後必須通過 profile 驗證，沒通過就整個資產回報失敗
- 風險：Boolean（煙囪接屋頂）共平面時失敗
  - 對策：煙囪底部往下埋 10 cm，進入屋頂實體；沿用 `boolean_union_objects` 的 solver 退回與面數上限
- 風險：手繪感的頂點偏移讓貼合的零件出現縫
  - 對策：偏移量由「頂點位置」的雜湊決定，相同位置的頂點不論屬於哪個物件，偏移都一樣；只偏移 x、z，不偏移 y，避免貼牆零件離開牆面
- 風險：三角面數超過預算
  - 對策：建完計算三角面數與 primitive 數，超過 `budget` 就回報 `BUDGET_EXCEEDED`
- 效能風險（draw call）：test01_shop 約 26 個 Object
  - 對策：在預算 40 以內；重複的盆栽共用同一份 mesh

## 驗證方式

- 功能驗證：
  - 純 Python：每個 builder 的輸出都是封閉流形（glass 除外）、沒有退化面、頂點在 bounds 內
  - Blender headless：建 test01_shop 和 tree_round，每個 Object 都通過 profile 驗證；建兩次的頂點雜湊相同
- 視覺驗證：headless 渲染正面正交視角和 3/4 視角，和 `tools/img/test01.jpg` 並排比較
- 效能驗證：GLB 的三角面數、primitive 數和 plan 的 budget 比較
- 回歸驗證：既有 74 個測試；`npm run build`

## 成功標準

- [ ] test01_shop 每個 Object 都通過 profile 驗證；facade 是 1 個封閉幾何島，而且包含屋頂、女兒牆、門窗凹槽與煙囪
- [ ] 同一份 plan 建兩次，所有 mesh 的頂點雜湊相同
- [ ] 三角面數 ≤ 5000、獨立 Object ≤ 40
- [ ] GLB 在 Three.js 載入後只有一個根節點；clickable 元件是獨立節點；正面射線打得到門
- [ ] 預覽圖和參考圖的比例、元件位置一致（人工比對）
- [ ] 既有測試全部通過，`npm run build` 通過
