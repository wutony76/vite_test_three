# Validation

## 結果：通過（效果預覽版，待使用者確認是否保留）

| 項目 | 結果 |
|---|---|
| `npx tsc --noEmit`、`npm run build` | 通過 |
| 開關前後 | 關掉時回到原本的藍、黃、紅牆、鐵鏽紅屋頂和紅色方盒；開啟時是新配色和新元素（`assets/project-room-style-before-after.png`） |
| 四個角度 | 正面：圓塔、窗戶在弧面上。右側：圓塔、右後角塔樓。背面：四扇圓窗、木樑、爬藤。低角度：寬石台、小菇、灌木（`assets/project-room-style-views.png`） |
| console | 沒有 error |

## 已知小問題

- 原本 Win_RedR 下方的花台跟著窗戶搬到圓塔上，從某些角度看會略微凸出圓塔表面。
