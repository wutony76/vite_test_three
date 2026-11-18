# Proposal

## 變更名稱

`add-happy-fat-shop` — 依參考圖建造街角小店「Happy Fat」（香菇屋風格、半弧面屋頂）

## 背景

使用者提供兩層街角小店的參考圖（`tools/img/earth_mamas.jpg`），要求：
- 符合 mainHall 的建築風格；
- 斜面屋頂改成半弧面屋頂。

確認 plan 時另外指定：
- 招牌字「Happy Fat」；
- 放在綠球上新增一棟。

建模後又補充：
- 牆體要有弧度；
- 配色要和 mainHall、projectRoom 有差別。

## 目標

- 產生 `public/models/earth_mamas/earth_mamas.glb`，流程為 reference → plan → 使用者確認 → build → QA → 匯出。
- 網頁端放在綠球上，面板「Happy Fat 小店」可以調整，可以拖曳；小豬和草叢會避開；香菇串會輕輕打轉。

## 範圍

- 建模：
  - `tools/img/earth_mamas.jpg`
  - `plans/earth_mamas.{reference,plan}.json`
  - `components/earth_mamas.py`
  - `scripts/make_earth_mamas_decals.py` 與招牌 decal
  - `vocab.py`、`components/__init__.py`
  - `tests/test_shapes.py`
- 網頁端：`src/world/objects/happyFatShop.ts`（新）、`obj.ts`、`main.ts`

## 成功標準

- [x] 拓撲 pass、GLB 貼圖 pass；Three.js plan check 全部通過。
- [x] 半弧面屋頂、有弧度的牆、和另外兩棟不同的配色。
- [x] 場景中看得到店面朝向鏡頭；console 沒有 error；`npm run build` 通過。
