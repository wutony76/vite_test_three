# Proposal

## 變更名稱

add-cinema-seat-demo — 3D 電影院選位範例

## 背景

學習「材質共用 vs 各自一份」時，方塊範例每個方塊各建一份材質（100 個方塊 = 100 個材質），無法示範實務上最常見的做法：依「狀態」共用材質。需要一個貼近真實需求的完整範例。

## 目標

建立獨立頁面 `cinema.html`，以電影院線上選位示範：

- 4 種外觀（可選 / 指向 / 已選 / 已售）只建 4 個材質，96 個座位共用
- 點擊時「換材質參考」而不是「改材質顏色」
- 完整的選位流程：選取、取消、上限、送出（loading / success / error）

## 範圍

- 包含：
  - 新增 `cinema.html`、`src/cinema/main.ts`、`src/cinema/style.scss`
  - 新增 `vite.config.ts` 設定多頁面 build
- 不包含：
  - 不修改既有方塊練習頁（`index.html`、`src/main.ts`）
  - 不串接真實後端（以 `fakeBookingApi` 模擬）

## 影響面

- 場景 / 物件：新增影廳（地板、階梯、銀幕、座位）
- 核心模組：無共用模組變動
- 互動 / 輸入：Raycaster 選位、hover
- 設定：新增 `vite.config.ts`（多頁面 input）

## 風險與對策

- 技術風險：
  - 風險：共用材質時誤用 `material.color.set()` 導致全部座位變色
  - 對策：所有外觀變更集中在 `_handlers.refreshSeat()`，只做材質參考替換
- 效能風險：
  - 風險：96 個 Mesh = 96 次 draw call
  - 對策：數量小可接受；大量座位時改用 InstancedMesh（後續課程）

## 驗證方式

- 功能驗證：Playwright 操作選取、取消、已售、上限、送出失敗 / 成功、清除
- 視覺驗證：截圖確認座位配置、顏色、hover 高亮、面板內容
- 回歸驗證：`npm run build` 同時產出 `index.html` 與 `cinema.html`；方塊頁不受影響

## 成功標準

- [x] 功能符合需求且行為正確
- [x] 畫面呈現符合預期
- [x] 無新增 console / WebGL error
- [x] `npm run build` 通過（含 tsc 型別檢查）
