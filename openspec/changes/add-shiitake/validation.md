# Validation

## 結果：通過

| 項目 | 結果 |
|---|---|
| validate_plan | `ok: True` |
| 拓撲 | cap、stem 是 organic 1 島，cross_cut 是 4 島，全部 0 非流形 |
| Geometry QA | pass |
| Texture QA | warn：FLAT_RATIO，刻意使用純色的 low poly 風格 |
| 預算 | 三角面 1298 / 1800；primitive 3 / 6；GLB 約 50 KB |
| Three.js plan check | ALL PASS |
| test_shapes | 22 / 22，含新增的 `test_shiitake_parts_are_closed_and_cross_sits_on_dome` |
| `npm run build` | 通過 |

瀏覽器實測：

| 設定 | 菇傘高度 | 結果 |
|---|---|---|
| 傘 1.25、柄 0.7（預設） | 0.012 | 正常 |
| 傘 2、柄 1.6 | 0.048 | 正常 |
| 傘 0.8、柄 0.3 | 0 | 傘緣剛好停在地面 |
| 傘 1.25、柄 2 | — | 側面看得到菇柄被拉長、菇傘被撐高 |

- 修正前，第二次套用設定時香菇會飛走；修正後模型的縮放、位置都維持不變。
- 預設位置（離頂端 36°、方位 -35°）在預設鏡頭左側看得到。
- console 沒有 error。

截圖：`docs/Engineering Evidence/assets/shiitake-*.png`

## 菇傘改扁後重驗

| 項目 | 結果 |
|---|---|
| 拓撲、幾何 QA | pass |
| Three.js plan check | ALL PASS |
| test_shapes | 22 / 22 |
| 瀏覽器 | 「菇傘厚度」設 0.5 時菇傘 y 縮放正確（1.25 → 0.625），菇柄頂端沒有穿出；console 沒有 error |

截圖：`assets/shiitake-flat.png`（Blender 3/4 視角與側面）

## 複製擺設驗證

- 無頭瀏覽器按兩次「複製香菇」：面板標題依序變成 shiitake_2、shiitake_3，場景出現三顆香菇，方位各差 12°，選中的那顆會亮起來（`assets/shiitake-copies.png`）。
- 按「移除選中香菇」後剩兩顆，面板切到 shiitake_2；console 印出兩筆擺設，沒有 error。
- 菇柄預設高度依使用者要求改成 1.2。

## 晃動驗證

- 面板出現「晃動幅度 (°)」「晃動速度」。
- 每隔 0.7 秒連拍香菇區域三張，畫面有變化（約 300～460 px）。其中一部分來自草的風動，香菇本身的傾斜可以目視看出細微差異。
- console 沒有 error，`npx tsc --noEmit` 通過。

## 菇傘顏色驗證

- 只把選中的那顆設成 #3d6bd6，同時把菇傘大小設 4、菇柄高度設 6：只有那顆變色、變大、變高，其他兩顆維持咖啡色，十字花刀和菇柄都正常（`assets/shiitake-color.png`）。
- 讀共用 atlas 的像素：維持原色（白底、#8A4C21、#EAD7B4…），沒有被改到。
- console 沒有 error。
