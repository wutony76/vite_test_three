# Proposal

## 變更名稱

`add-shiitake` — 綠球上的香菇，面板可以調菇傘大小與菇柄高低

## 背景

使用者提供兩張香菇參考圖：

- 側面圖：咖啡色圓弧菇傘、深色菌褶、米白短柄。存成 `tools/img/shiitake_side.jpg`。
- 頂部圖：十字花刀。存成 `tools/img/shiitake_top.jpg`。

需求是做成香菇模型：菇傘要大一點、菇柄要短一點，兩者都要能在面板調整。

## 目標

- 依 lowpoly 流程產生 `public/models/shiitake/shiitake.glb`，流程為 plan → 使用者確認 → build → QA → 匯出。菇傘和菇柄是獨立節點。
- 網頁端把香菇放在綠球表面，面板「香菇」資料夾可以調：
  - 菇傘大小（預設 1.25 倍）
  - 菇柄高度（預設 0.7 倍）
  - 位置、方位、旋轉、傾斜、整體大小、下沉
- 可以在場景裡直接拖曳移動；小豬會繞開香菇，草叢和道具也不會撒在它身上。

## 範圍

- 包含：
  - `tools/blender/plans/shiitake.plan.json`
  - `tools/blender/lowpoly_kit/components/fungi.py`，新增 kind `mushroom_cap`、`mushroom_stem`、`mushroom_cross`
  - `src/world/objects/shiitake.ts`（新）
  - `obj.ts`、`main.ts` 的接線
  - `test_shapes.py` 新增測試
- 後續加入：多顆香菇的複製與移除（見 design §4）。

## 成功標準

- [x] 拓撲、幾何、GLB 貼圖 QA 都通過；Three.js plan check 全部通過。
- [x] 調菇傘大小、菇柄高度時，菇傘一直落在菇柄頂端；菇柄太短時傘緣停在地面。
- [x] 預設鏡頭看得到香菇，console 沒有 error，`npm run build` 通過。
