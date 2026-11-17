# Validation

## 結果：通過，附一項說明

| 項目 | 結果 |
|---|---|
| `npx tsc --noEmit` | 通過 |
| `npm run build` | 通過 |
| 預設鏡頭前後對比 | 醬從飽和粉紅紅變成深番茄紅，有濕亮高光與邊緣亮光；畫面底部的前景變柔和（`assets/ketchup-before-after.png`、`assets/ketchup-foreground.png`） |
| 流動高光 | 第一版太密，像同心圓；調整頻率和寬度後改善 |
| 漣漪 | 直接把漣漪寫進 shader uniform，特寫看得到一圈圈往外擴散、逐漸變淡（`assets/ketchup-ripple.png`） |
| console | 沒有 error |

## 說明：小豬觸發漣漪的頻率

- 小豬被限制不能走進醬汁區（醬上緣再往內 2°）。實測 20 秒內，小豬離醬面最近約 0.17，所以平常不太會觸發。
- 小豬只有走到醬最高的那一段附近，距離才會小於 `rippleDistance`。
- 預設把 `rippleDistance` 從 0.05 放寬到 0.08。想讓漣漪更常出現，可以調面板的「多近起漣漪」，或小豬的「醬邊距離」。
