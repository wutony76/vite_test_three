# Proposal

## 變更名稱

`add-treasure-chest` — 綠球上的寶箱，裝滿漢堡、滿到掉出來，加金色閃光

## 背景

使用者要求「做一個寶箱，裡面都是漢堡，滿出來」。確認 plan 時，使用者選擇「加上閃光效果」。

## 目標

- 依 lowpoly 流程產生 `public/models/treasure_chest/treasure_chest.glb`，流程為 plan → 使用者確認 → build → QA → 匯出。寶箱包含：
  - 中空木箱，內底墊高；
  - 金色包邊和鎖頭；
  - 往後打開的拱形箱蓋。
- 網頁端沿用既有的 `burger.glb`，複製 13 個：
  - 箱底一層；
  - 上面堆成小山；
  - 一個卡在箱口前緣，兩個滾到地上。
- 箱口上方有金色光暈和輪流閃爍的四角星，沿用小豬金幣的閃光貼圖。
- 面板「寶箱」可以調：顯示、漢堡數量、漢堡大小、金色閃光、整體大小、位置、方位、旋轉、下沉。寶箱可以拖曳，小豬和草叢會避開。

## 範圍

- 建模：
  - `tools/blender/plans/treasure_chest.plan.json`
  - `tools/blender/lowpoly_kit/components/chest.py`
  - `vocab.py`、`components/__init__.py`
  - `tests/test_shapes.py`
- 網頁端：
  - `src/world/objects/treasureChest.ts`（新）
  - `pigCoinShine.ts`：匯出閃光貼圖函式
  - `obj.ts`、`main.ts`

## 成功標準

- [x] 拓撲、幾何、GLB 貼圖 QA 都通過；Three.js plan check 全部通過。
- [x] 箱子裡堆滿漢堡並滿出來，有漢堡掉在地上，看得到閃光。
- [x] console 沒有 error，`npm run build` 通過。
