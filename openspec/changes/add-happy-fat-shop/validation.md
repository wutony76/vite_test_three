# Validation

## 結果：通過，附一項說明

| 項目 | 結果 |
|---|---|
| validate_plan（reference、plan） | 都是 `ok: True` |
| 拓撲 | 26 個 Object 全部 pass |
| Geometry QA | warn：UNDERFILLED fence。既有 fence 零件的立柱只佔 bounds 深度的 35%，任何深度都會出現這則提醒 |
| Texture QA | warn（FLAT_RATIO：小零件是純色） |
| GLB 貼圖 QA | pass（GPU 約 14.7 MB / 24 MB） |
| 預算 | 三角面 6082 / 16000；primitive 28 / 48 |
| Three.js plan check | ALL PASS |
| test_shapes | 25 / 25，含新增的 `test_earth_mamas_curved_shell_and_arc_roof` |
| 瀏覽器 | 店面朝向鏡頭，半弧面屋頂、招牌、香菇串可見；console 沒有 error |
| `npm run build` | 通過 |

截圖：`assets/happy-fat-compare.png`（參考圖和模型並排）、`assets/happy-fat-views.png`、`assets/happy-fat-in-scene.png`

## 只留主體後重驗

- 重建並匯出：6 個物件、2092 三角面，拓撲與幾何 QA 通過，GLB 約 220 KB
- `threejs_plan_check`：ALL PASS
- `test_shapes`：25 passed（`test_earth_mamas_curved_shell_and_arc_roof` 改為檢查六個主體零件）
- 瀏覽器：綠球上顯示正常，console 沒有錯誤（`assets/happy-fat-in-scene.png`）

## 厚度／顏色重驗

- 瀏覽器：depth=2 時 content 縮放 z 是 x 的 2 倍，煙囪 scale.z=0.5；屋頂換藍、二樓換粉、一樓換紫，紋理保留，console 無錯誤
- `tsc`、`npm run build` 通過
