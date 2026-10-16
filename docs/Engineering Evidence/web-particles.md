# Engineering Evidence

## 變更摘要

- 對應變更：add-web-particles — 捲動驅動的互動粒子網頁範例
- 變更檔案清單：
  - `web.html`（新增）
  - `src/web/main.ts`、`ParticleField.ts`、`shapes.ts`、`shaders.ts`、`style.scss`（新增）
  - `vite.config.ts`（新增 web 頁）
  - `openspec/changes/add-web-particles/*`、`docs/Architecture/README.md`、`openspec/project.md`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：Playwright 輸出 morph、推力、漣漪、導覽、reduced motion 數值皆符合預期；M2 60 FPS、1 draw call；桌機 / 手機截圖；console 無訊息

## 風險與後續追蹤

- 已知風險：低階裝置 24,000 粒子可能吃力（已依螢幕寬度 / 核心數減半）
- 後續追蹤事項：FPS 自適應粒子數

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/web-particles.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
