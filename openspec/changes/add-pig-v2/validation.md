# Validation

## 結果：通過，附一項說明

| 項目 | 結果 |
|---|---|
| validate_plan | `ok: True`。提醒：HIGH_INFERRED_RATIO（沒有正面參考圖，比例為推測，已由使用者確認） |
| 拓撲 | 12 個 Object 全部 pass，0 非流形。body 是 organic 1 島；肚子窗是 glass 2 島（單面，允許開放邊） |
| Geometry QA | pass |
| Texture QA | warn：FLAT_RATIO 100%。刻意設計成純色亮面陶瓷存錢筒，沒有加 surface 貼圖 |
| GLB 貼圖 QA | pass。GPU 貼圖 0.37 MB（預算 2 MB），貼圖 10.9 KB（預算 200 KB） |
| 預算 | 三角面 2120 / 2600；primitive 16 / 22；GLB 約 117 KB |
| Three.js plan check | ALL PASS：單一根節點、draw call 在預算內、只有玻璃半透明、decal 獨立、meshopt |
| test_shapes | 21 項全部通過（含新增的 `test_pig_v2_parts_are_closed_and_window_fits_dent`） |
| test_plan_schema | 30 / 31。`test_unimplemented_kind_warns` 失敗是既有問題：`fence` 已經實作，用 git stash 還原本次改動後重跑一樣失敗，與本次無關 |
| `npm run build` | 通過 |
| 瀏覽器實測 | 無頭 Chromium 執行，console 沒有 error，結果如下 |

瀏覽器實測：

- 四腳的 pivot 旋轉值會隨時間變化，fl 和 fr 相位相反，例如 +0.50 對 -0.50。
- 耳朵和尾巴的 pivot 也持續變化。
- 截圖可以看到存錢筒、肚子裡的金幣、投幣孔上的金幣、櫻花、「希希」和尾巴的黃色小花。

截圖：`docs/Engineering Evidence/assets/pig-v2-*.png`

## 第二次回饋（粉色、短腿）後重驗

| 項目 | 結果 |
|---|---|
| 拓撲、幾何、GLB 貼圖 QA | pass |
| test_shapes | 21 / 21 |
| Three.js plan check | ALL PASS |
| 瀏覽器 | console 沒有 error；預設鏡頭下是粉紅色的短腿存錢筒 |

## 面板換色驗證

- 無頭瀏覽器把「小豬顏色」設成 #3f8cff：小豬身體變藍，投幣孔的金幣和尾巴的黃花維持原色，console 沒有 error。
- `npx tsc --noEmit` 通過。

## 第三次回饋（肚子滑順、移除金幣與字）後重驗

| 項目 | 結果 |
|---|---|
| 拓撲、幾何、GLB 貼圖 QA | pass（body 952 三角面，仍是 organic 1 島） |
| 預算 | 三角面 1932 / 2600；primitive 12 / 22；GLB 約 93 KB |
| test_shapes | 21 / 21（pig_v2 測試改成 `test_pig_v2_parts_are_closed`） |
| Three.js plan check | ALL PASS |
| 瀏覽器 | console 沒有 error；特寫看到身體平滑、沒有凹陷，肚子沒有金幣和字 |
