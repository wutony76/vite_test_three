# Engineering Evidence

## 變更摘要

- 對應變更：add-web-lights — 燈光版互動網頁（光的五種樣子）
- 變更檔案清單：
  - `lights.html`（新增）
  - `src/lights/main.ts`、`LightStage.ts`、`style.scss`（新增）
  - `vite.config.ts`（新增 lights 頁）、`web.html`（範例清單新增卡片）
  - `openspec/changes/add-web-lights/*`、`docs/Architecture/README.md`、`openspec/project.md`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：Playwright 輸出光源位置、權重、顏色索引皆符合預期；6 段與手機截圖；M2 60 FPS；console 無訊息

## 風險與後續追蹤

- 已知風險：自訂 Shader 中 `pow(0, y)` 在 Metal 為 NaN，搭配 Bloom 會整個畫面全黑 —— 之後寫 Shader 需避免 0 底數
- 後續追蹤事項：混光互動段

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/web-lights.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
