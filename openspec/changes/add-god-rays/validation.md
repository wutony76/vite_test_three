# Validation

## 結果：通過

- `tsc` 通過；瀏覽器 console 沒有錯誤。
- 1400×760 截圖：左上角有平行、往右下斜的柔和光束，穿過彩虹與天空，往右下淡出；沒有放射狀（`docs/Engineering Evidence/assets/god-rays.png`）。
- 問題與修正：第一版雜訊直接取次方，亮度只剩約 0.05，幾乎看不到 → 先 smoothstep 拉開對比；預設亮度 0.45。
