# Proposal

## 變更名稱

`add-neon-shop` — 電波町霓虹小店取代 Gamehall 模型

## 背景

使用者提供賽博霓虹風的兩層街角小店參考圖（`tools/img/neon_shop.jpg`），要做成模型放在 Gamehall 的位置取代原本的遊戲廳，並把頂樓招牌改成「電 • 波 • 町」。

## 目標

- 依 lowpoly 流程（reference → plan → 使用者確認 → build → QA → 匯出）產生 `public/models/neon_shop/neon_shop.glb`
- 頂樓霓虹招牌為「電 • 波 • 町」，霓虹燈條、燈箱、窗內暖光會發光
- world 場景的 Gamehall 改用新模型（之後依使用者要求換回原模型，新模型保留備用）

## 範圍

- 包含：
  - `tools/blender/plans/neon_shop.reference.json`、`neon_shop.plan.json`
  - `tools/blender/scripts/make_neon_shop_decals.py`（招牌字 decal 圖片）
  - `tools/blender/lowpoly_kit/components/layout.py`：繞 Z 轉 ±90° 的元件以對調寬深建模（側面的門需要）＋測試
  - `src/world/objects/obj.ts`：Gamehall 模型網址、`_glow` decal 自發光、朝向
- 不包含：
  - 不移除舊的 `models/game_hall/gameHall.glb`
  - 不改舊 Gamehall 的霓虹閃爍系統（gameHallLights，新模型沒有對應名稱的 mesh，不作用）

## 風險與對策

- 風險：decal 不支援自發光 → 對策：decal id 以 `_glow` 結尾，Three.js 載入時把貼圖同時當 emissiveMap
- 風險：側面元件需要旋轉 → 對策：正面（-Y）放元件最多的那一面，只有門需要旋轉；layout 支援 quarter-turn 寬深對調
- 風險：貼圖預算 → 對策：縮小 decal 圖、共用相近材質，不調高預算

## 成功標準

- [x] 拓撲、幾何、貼圖、GLB 貼圖 QA 皆 pass
- [x] 三角面、primitive、GPU 貼圖都在 plan budget 內
- [x] 「電 • 波 • 町」完整顯示、沒有鏡像
- [x] Gamehall 位置顯示新模型，招牌面朝向鏡頭
- [x] `npm run build` 通過，console 無 error
