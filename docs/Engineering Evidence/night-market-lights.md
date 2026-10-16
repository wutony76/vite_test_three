# Engineering Evidence

## 變更摘要

- 對應變更：add-night-market-lights — 熱鬧夜市燈光範例
- 變更檔案清單：
  - `market.html`（新增）
  - `src/market/main.ts`、`Stage.ts`、`Stall.ts`、`stalls.ts`、`neon.ts`、`neonIcons.ts`、`LedStrip.ts`、`StringLights.ts`、`Gate.ts`、`Crowd.ts`、`Street.ts`、`textures.ts`、`ambience.ts`、`style.scss`（新增）
  - `vite.config.ts`（新增 market 頁）、`web.html`（範例清單新增一張卡片）
  - `openspec/changes/add-night-market-lights/*`、`docs/Architecture/README.md`、`openspec/project.md`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：Playwright 輸出開場點亮時序、點擊攤位、情境、總電源、燈條 / 串燈模式皆符合預期；M2 60 FPS；各情境與手機截圖；console 無訊息

## 風險與後續追蹤

- 已知風險：光源數量多，低階裝置效能；RectAreaLight 查表資料使頁面 JS 增加約 250 KB
- 後續追蹤事項：FPS 自適應畫質、叫賣音效
- 依使用者回饋：新增基本光與「環境光」滑桿、地面改霧面水泥（移除反射）

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/night-market-lights.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
