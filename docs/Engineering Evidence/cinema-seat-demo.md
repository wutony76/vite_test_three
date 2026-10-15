# Engineering Evidence

## 變更摘要

- 對應變更：add-cinema-seat-demo — 3D 電影院選位範例
- 變更檔案清單：
  - `cinema.html`（新增）
  - `src/cinema/main.ts`（新增）
  - `src/cinema/style.scss`（新增）
  - `vite.config.ts`（新增，多頁面 build）
  - `openspec/changes/add-cinema-seat-demo/*`（新增）
  - `docs/Architecture/README.md`（更新）
  - `openspec/project.md`（更新 Architecture Snapshot）
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：Playwright 腳本逐步輸出面板狀態（選取、取消、已售、上限、loading、error、success、清除）全數符合預期；console 無 error；`npm run build` 產出兩個頁面

## 風險與後續追蹤

- 已知風險：若之後有人改用 `seat.mesh.material.color.set()`，會同時改到所有共用該材質的座位
- 後續追蹤事項：InstancedMesh 版本（降低 draw calls）

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/cinema-seat-demo.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
