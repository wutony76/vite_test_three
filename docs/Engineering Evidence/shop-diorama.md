# Engineering Evidence

## 變更摘要

- 對應變更：add-shop-diorama — 3D 店面導覽（巷口烘焙 ALLEY ROAST）
- 參考：https://djdb.kr/#shop 的互動模式（環顧、點物品看故事、日夜 / 雨 / 聲音切換）；未使用該站任何資產（該站標示 tdm-reservation、noimageai）
- 變更檔案清單：
  - `diorama.html`（新增）
  - `src/diorama/main.ts`、`Stage.ts`、`World.ts`、`hotspots.ts`、`ambience.ts`、`style.scss`（新增）
  - `src/diorama/world/textures.ts`、`materials.ts`、`helpers.ts`、`buildShop.ts`、`buildStreet.ts`、`buildProps.ts`、`buildSky.ts`、`effects.ts`（新增）
  - `vite.config.ts`（新增 diorama 頁）
  - `openspec/changes/add-shop-diorama/*`、`docs/Architecture/README.md`、`openspec/project.md`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：Playwright 腳本輸出 hover / 點擊 / 清單 / Esc / 深層連結 / 日夜 / 雨 / 聲音 / 手機 / reduced motion 全數符合預期；夜、日、雨、手機截圖確認；M2 GPU 60 FPS；console 無 error / warning

## 風險與後續追蹤

- 已知風險：
  - 後製（Bloom + Outline）在低階手機可能掉幀
  - 無 GPU 的環境（軟體渲染）約 7 FPS
- 後續追蹤事項：FPS 自適應畫質、更多動態元素、部署

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` / `npm run preview` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/shop-diorama.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
