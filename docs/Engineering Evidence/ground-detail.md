# Engineering Evidence

## 變更摘要

- 對應變更：`add-ground-detail` — 綠球表面細節（色彩斑塊、番茄醬陰影帶、草叢、泥土小徑、小道具）
- 變更檔案清單：
  - `src/world/objects/groundDetail.ts`（新增）
  - `src/world/objects/obj.ts`（建立 groundDetail、提供小徑節點／障礙物／緞帶矩陣、入場時機）
  - `src/world/main.ts`（「綠球細節」面板、小徑編輯面板）
  - `src/world/objects/groundPathsLayout.ts`（新增：自訂小徑佈局）
  - `src/world/debug/groundPathEditor.ts`（新增：在綠球上編輯小徑）
  - `docs/Architecture/README.md`
  - `openspec/changes/add-ground-detail/*`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：有條件通過
- 佐證附件：
  - `docs/Engineering Evidence/assets/ground-detail-compare.png`
  - `docs/Engineering Evidence/assets/ground-detail-close.png`
  - `docs/Engineering Evidence/assets/ground-detail-ao-max.png`
  - tsc / `vite build` 通過

## 風險與後續追蹤

- 已知風險：草叢與道具不會隨房子拖動自動更新；小豬會穿過草叢與道具
- 後續追蹤事項：入場長出時機與拖動後小徑更新待使用者實機確認；可讓小豬偏好走小徑

## 封存前檢查

- [x] validation.md 已完成（有條件通過）
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/ground-detail.md`，並更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後）
