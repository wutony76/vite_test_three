# Tasks

## 1. 規格與設計確認

- [x] 完成 proposal 定稿
- [x] 完成 design 定稿

## 2. 場景與物件

- [x] 地板、階梯、銀幕
- [x] 座位 geometry（mergeGeometries）與 4 個狀態材質
- [x] `vite.config.ts` 多頁面 build

## 3. 狀態與流程

- [x] `SeatInfo` 資料結構與 `Map` 反查
- [x] `click` 入口（選取 / 取消 / 已售 / 上限 / hover / 清除 / 送出）
- [x] `_actions.submitBooking`（loading guard + early return + success / error）
- [x] `_handlers` 私有邏輯

## 4. 效能與資源

- [x] 共用 geometry、依狀態共用 material
- [x] pointermove 只在 hovered 變化時更新材質

## 5. 視覺與互動驗證

- [x] 截圖確認畫面
- [x] 主要互動流程 Playwright 驗證

## 6. 交付檢查

- [x] `npm run dev` 可正常開啟 `/cinema.html`
- [x] `npm run build` 通過
- [x] 無 console / WebGL error
- [x] validation.md 與 `docs/Engineering Evidence/cinema-seat-demo.md`
