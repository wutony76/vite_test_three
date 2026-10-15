# Tasks

## 1. 規格與設計確認

- [ ] 完成 proposal 定稿（範圍/風險/驗證方式）
- [ ] 完成 design 定稿（scene/state/flow/效能）

## 2. 場景與物件

- [ ] 建立或調整場景物件（`src/scene/...`）
- [ ] 建立或調整核心模組（`src/core/...`）
- [ ] 資源載入（含 loading / success / error）

## 3. 狀態與流程

- [ ] 建立 `state` 狀態物件
- [ ] 實作 `click` 入口
- [ ] 實作 `_actions`（含 loading guard + early return）
- [ ] 補齊 `_handlers` 私有邏輯

## 4. 效能與資源

- [ ] animation loop 使用 `delta` 計算
- [ ] 不再使用的 geometry / material / texture 已 `dispose()`
- [ ] 高頻事件（resize / pointermove）補上 throttle（如適用）

## 5. 視覺與互動驗證

- [ ] 截圖確認畫面
- [ ] 視窗縮放與 devicePixelRatio 檢查
- [ ] 主要互動流程手動驗證

## 6. 交付檢查

- [ ] `npm run dev` 可正常啟動
- [ ] `npm run build` 通過
- [ ] 無 console / WebGL error
- [ ] 補上 validation.md 與 `docs/Engineering Evidence/<主題>.md`
