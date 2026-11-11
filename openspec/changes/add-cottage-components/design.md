# Design

## 1. 新 builder

| kind | 檔案 | 建法 | 島數 |
|---|---|---|---|
| `roof_hip` | roofs.py | 沿 z 疊一串長方形環（loft）：屋簷 → 每一列瓦 → 屋脊（深度很小的長條，避免退化）。每一列在下緣多一個往外凸 `lip` 的環，側面看是鋸齒狀的瓦列。實心封閉 | 1 |
| `roof_gable` | roofs.py | ∧ 形斷面沿 y 擠出（prism）。外緣兩坡各 `courses` 列鋸齒，內緣是平行的屋底面（厚度 `thickness`），所以底下是空的，看得到山牆。`ridge_at` 決定屋脊的位置（0～1，由左往右） | 1 |
| `gable_trim` | roofs.py | 山牆三角形填充板（`infill_material`）+ A 字形木飾板（兩條斜板） | ≤ 3 |
| `pipe` | props.py | lathe 圓管；`hat=true` 時頂端加一頂圓錐帽 | 1 |
| `lantern` | props.py | 從牆伸出的橫桿（box）+ 吊鏈（細管）+ 4 邊形燈籠（lathe，4 段）。`mount` 指定牆在哪一側 | 3 |
| `bucket` | props.py | lathe 木桶（上寬下窄、桶口往下凹）+ 提把（sweep 半圓） | 2 |
| `crate` | props.py | grid_slab 木箱：正面有兩道淺凹的板縫 | 1 |
| `rock_pile` | nature.py | `stones` 顆低面數石塊（blob，jitter 0.18），由下往上堆、大石在下，填滿 bounds | ≤ 8 |
| `bush` | nature.py | 一團主葉團 + 周圍葉團（同盆栽的葉團分布邏輯），貼地 | ≤ 6 |

## 2. roof_hip 的瓦列

```
側面（每一列 = 斜坡往上 + 下緣外凸）：

      ┌─┐      ← 屋脊
     ╱  ╲
   ─╱    ╲─    ← 第 2 列的下緣往外凸 lip
   ╱      ╲
 ─╱        ╲─  ← 第 1 列
 └──────────┘  ← 屋簷底面（實心）
```

- 環的半寬：hx(t) = ridge_half + (W/2 − ridge_half) × (1 − t)，hy 同理，t 為高度比例。
- 每一列兩個環：上緣 (hx(t_k+1), z_k+1 − ε) 與下一列下緣 (hx(t_k+1) + lip, z_k+1)，ε = 列高的 15%。
- 全部是 4 點長方形環，側面全是 quad，沒有 ngon。

## 3. 和 plan 的對應

- plan 的 `params` 決定各 builder 的細節：`courses`、`lip`、`ridge_ratio`、`ridge_at`、`thickness`、`stones`、`hat`、`mount`。
- `tertiary_density` 影響灌木的葉團數；`secondary_density` 影響 gable_trim 是否加中柱。

## 4. 測試

- `tests/test_shapes.py`：
  - 擴充：所有 plan（含 test02_cottage）的每個零件都必須是封閉流形，並在 bounds 與島數上限內
  - roof_hip 是 1 個島，而且側面輪廓有 courses 個凸出
- `tests/test_build_plan.py`：
  - test02_cottage 建模成功
  - 煙囪已融進屋頂
  - 預算內
