# Engineering Evidence：畫面上方的森林光束（add-god-rays）

## 變更摘要

- `src/world/godRays.ts`：全螢幕疊加光束，平行、從左上往右下，慢慢飄移、呼吸；面板「畫面上方光束（森林光）」可調。

## 驗證佐證

- `tsc` 通過、console 無錯誤；截圖 `assets/god-rays.png`。

## 風險與後續追蹤

- 疊加在整個畫面上，不會被房子、綠球擋住（不是體積光）；太亮會讓左上角的 UI（控制面板以外）跟著變亮，亮度建議 ≤ 0.6。
