# Proposal

## 變更名稱

`add-mushroom-house` — 依參考圖建造奇幻香菇屋（後續改為取代 mainHall 的外觀）

## 背景

使用者提供一張奇幻香菇屋的參考圖，存成 `tools/img/mushroom_house.jpg`，要求「幫我建造這個建築」。確認 plan 時選擇「照這個做」，放置方式選「綠球上新增一棟」。

## 目標

- 依 lowpoly 流程產生 `public/models/mushroom_house/mushroom_house.glb`，流程為 reference → plan → 使用者確認 → build → QA → 匯出。這是參考圖的 low poly 詮釋，包含：
  - 葫蘆形屋身，脖子圍一圈青苔；
  - 斜戴的大菇傘：紫藍頂、紅木板邊、黃橘底面；
  - 綠框拱門、三扇綠框窗（一扇八角窗、兩扇圓窗）；
  - 藍色小菇、菇傘邊垂下的吊飾；
  - 粉紫水窪底座、珊瑚小菇和木樁。
- 網頁端放在綠球上，面板「香菇屋」可以調整，可以拖曳；小豬和草叢會避開；吊飾會隨風輕晃。

## 範圍

- 建模：
  - `tools/img/mushroom_house.jpg`
  - `plans/mushroom_house.{reference,plan}.json`
  - `lowpoly_kit/components/mushroom_house.py`
  - `vocab.py`、`components/__init__.py`
  - `tests/test_shapes.py`
- 網頁端：`src/world/objects/mushroomHouse.ts`（新）、`obj.ts`、`main.ts`
- 不包含：
  - 門的點擊互動（進入房間），manifest 已標 clickable，之後可以接；
  - 菇傘的筆觸紋理和底面的放射紋。

## 成功標準

- [x] 拓撲、幾何、GLB 貼圖 QA 都通過；Three.js plan check 全部通過。
- [x] 外觀和參考圖的主要特徵一致（`assets/mushroom-house-compare.png`）。
- [x] 預設鏡頭看得到，門朝向鏡頭；console 沒有 error，`npm run build` 通過。
