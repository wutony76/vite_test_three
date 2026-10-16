# Engineering Evidence

## 變更摘要

- 對應變更：add-drive-world — 駕駛探索作品集（參考 bruno-simon.com 的玩法，原創實作）
- 變更檔案清單：
  - `drive.html`（新增）
  - `src/drive/main.ts`、`Car.ts`、`Grass.ts`、`world.ts`、`zones.ts`、`Input.ts`、`CameraRig.ts`、`Dust.ts`、`audio.ts`、`style.scss`（新增）
  - `package.json` / `package-lock.json`（新增依賴 `cannon-es@^0.20.0`）
  - `vite.config.ts`（新增 drive 頁）、`web.html`（範例清單新增卡片）
  - `openspec/changes/add-drive-world/*`、`docs/Architecture/README.md`、`openspec/project.md`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：Playwright 位置 / 速度 / 高度數值、區域導向、觸控；M2 60 FPS；截圖；console 無訊息

## 風險與後續追蹤

- 已知風險（cannon-es 使用注意）：
  - 直接設定剛體 position 後須 `aabbNeedsUpdate = true`，否則靜態 / 睡眠物體無法碰撞
  - `RaycastVehicle.updateWheelTransform()` 會重設 `isInContact`，需在呼叫前讀取
- 後續追蹤事項：小地圖、計時賽道、手把

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/drive-world.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
