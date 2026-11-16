# Engineering Evidence

## 變更摘要

- 對應變更：`add-style-grade` — world 畫面風格統一（全場色調統一＋寫實貼圖降對比）
- 變更檔案清單：
  - `src/world/styleGrade.ts`（新增）
  - `src/world/main.ts`（建立 style grade、定期 scan、「畫面風格統一」面板）
  - `docs/Architecture/README.md`（補上 `src/world/` 結構）
  - `openspec/changes/add-style-grade/*`
- Commit / PR 參考：尚未 commit；還原點為 git tag `before-style-grade`（2eff280）

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證附件：
  - `docs/Engineering Evidence/assets/style-grade-compare.png`（全景，左關右開）
  - `docs/Engineering Evidence/assets/style-grade-houses.png`（寫實房子特寫，左關右開）
  - tsc / `vite build` 通過

## 風險與後續追蹤

- 已知風險：
  - 注入版 shader 首次編譯會多一次成本（真實 GPU 幾乎無感；SwiftShader 下明顯）
  - 新材質最多 0.5 秒後才被調色（入場動畫期間發生，視覺上不易察覺）
- 後續追蹤事項：
  - 已依使用者面板定稿更新 `STYLE_GRADE_DEFAULT`（寫實貼圖飽和度／對比 = 1，即降對比暫不作用；陰影抬亮 0.12 為主要效果）
  - A 類房子用 lowpoly_kit 流程重做（另案）

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/style-grade.md`，並更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認數值、commit 後）
