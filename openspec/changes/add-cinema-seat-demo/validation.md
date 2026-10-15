# Validation

## 驗證範圍

- 對應變更：add-cinema-seat-demo
- 驗證環境：本機 Vite dev server（http://localhost:5173/cinema.html）、Playwright 1.62.1 Chromium、viewport 1100×700

## 功能驗證

- [x] hover 可選座位 H5 → 游標 `pointer`、座位變亮藍（截圖確認）
- [x] hover 已售 H3 → 游標 `not-allowed`
- [x] 選 H5、H6 → 面板「H5、H6」、NT$ 600
- [x] 點已售 H3 → 「H3 已售出」，選取不變
- [x] 再點 H6 → 取消，剩 H5、NT$ 300
- [x] 選滿 6 個後點第 7 個 → 「單次最多選 6 個座位」，仍為 6 個
- [x] 送出中 → 按鈕「訂位中…」且 disabled；此時點座位無反應
- [x] API 失敗（stub `Math.random = 0.1`）→ 「網路忙碌，請再試一次」，選取保留
- [x] API 成功（stub 0.9）→ 6 個座位變紅、「訂位成功：H1、H2、H4、H5、H6、H7」
- [x] 點剛訂到的 H5 → 「H5 已售出」
- [x] 選 H9 後按清除 → 尚未選位、NT$ 0

## 視覺驗證

- 截圖確認：銀幕、階梯、走道分隔、8 排 × 12 座位、已售紅色分布、已選綠色、面板圖例顏色與座位一致
- 初版攝影機過低只看到椅背，已調高為俯視角度

## 效能驗證

- 靜態場景，每幀僅 controls.update + render；draw calls 約 105，無明顯負擔

## 回歸驗證

- `npm run build`：tsc 通過，產出 `dist/index.html` 與 `dist/cinema.html`
- 方塊練習頁（`index.html`、`src/main.ts`）未修改

## 問題與修正紀錄

- 問題：初始視角過低，後排被前排椅背遮住
  - 發現方式：截圖檢查
  - 修正方式：攝影機改為 `(0, 15, ROWS×ROW_GAP + 9)`，target 移至影廳中央
  - 是否已重新驗證：是

## 結論

- 是否通過：是
- 已知限制或風險：已售座位為固定公式產生；訂位結果未持久化，重新整理即重置
- 後續追蹤事項：大量座位時以 InstancedMesh 降低 draw calls
