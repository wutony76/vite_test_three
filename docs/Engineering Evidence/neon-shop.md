# Engineering Evidence

## 變更摘要

- 對應變更：`add-neon-shop` — 電波町霓虹小店取代 Gamehall
- 變更檔案：
  - `tools/img/neon_shop.jpg`、`tools/blender/plans/neon_shop.{reference,plan}.json`
  - `tools/blender/scripts/make_neon_shop_decals.py`、`tools/blender/textures/manual/neon_shop/decals/*.png`
  - `tools/blender/lowpoly_kit/components/layout.py`、`tools/blender/tests/test_build_plan.py`
  - `public/models/neon_shop/neon_shop.glb`、`neon_shop.manifest.json`
  - `src/world/objects/obj.ts`

## 驗證佐證

- `openspec/changes/add-neon-shop/validation.md`（有條件通過）
- 截圖：`docs/Engineering Evidence/assets/neon-shop-*.png`

## 風險與後續追蹤

- quarter-turn 元件的子元件位置未換算（目前無使用情境）
- `test_unknown_kind_is_reported` 為既有失敗，需改用真正不存在的 kind
- 可考慮把 gameHallLights 的閃爍綁到新模型的霓虹元件

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] `openspec archive`（待使用者確認）
