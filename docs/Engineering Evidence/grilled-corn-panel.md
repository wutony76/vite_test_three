# Engineering Evidence：烤玉米選取與編輯（edit-grilled-corn-panel）

## 變更摘要

- 開放烤玉米編輯：面板「烤玉米」可以複製、移除、印出全部佈局；場景上可以點選和拖曳。
- 選取與編輯方式改成跟檸檬片一樣：整根發光、標題顯示名稱、滑桿單層、移除後自動選下一根。
- 複製時方位錯開 12°，不會和原本那根疊在一起。

## 驗證佐證

- 實際用滑鼠點選三根看得到的玉米，每次只有點到的那根發光，面板跟著切換。
- 複製、移除都正確。
- 沒有錯誤；`tsc` 和 build 通過。
- 截圖：`assets/grilled-corn-select.png`

## 風險與後續追蹤

- 新擺的玉米要按「印出全部佈局 (console)」，把結果貼回 `grilledCornLayout.ts` 的 `GRILLED_CORN_PLACEMENTS`，重新整理後才會保留。
