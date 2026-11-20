# Design

## 為什麼用程序化紋路而不是 GLB＋貼圖

點陣貼圖解析度固定：放大 N 倍，每個貼圖像素也放大 N 倍 → 糊；只拉寬一軸，貼圖還會被拉扁。
樹墩改成 Three.js 程式產生幾何，顏色與凹凸由 fragment shader 即時計算（value noise、fbm、年輪公式），沒有解析度上限。

## 幾何（模型座標，底寬約 1、y 朝上）

| 零件 | 做法 | 頂點屬性 aKind |
| --- | --- | --- |
| 樹皮 | 繞一圈的格子網：超橢圓（n = 3，方方的）＋直向樹皮脊＋底部四條樹根外張；往下埋 0.14 避免球面露縫 | 0 樹皮 |
| 切面 | 從樹皮頂端往偏心髓心收的同心網格，外圈一道小倒角，中間微隆 | 1 年輪 |
| 小樹枝 | 斜向外伸的圓木＋末端年輪切面 | 0／1 |

- 三角形方向由 `addTri(…, outward)` 依期望法線自動校正，不靠手算頂點順序。
- `seed` 決定外形亂數；各零件各自一條亂數流（關掉樹枝不會改變切面）。
- 約 6.7k 三角面；所有零件共用一個材質、同一支 shader（`customProgramCacheKey`）。

## Shader（MeshStandardMaterial + onBeforeCompile）

- 頂點：`vStumpPos = position * uStretch`（uStretch = 寬、高、厚倍率）→ 實際尺寸座標。
- 樹皮：用實際尺寸座標算「沿木紋拉長」的雜訊 → 拉寬只會多長紋路，不會拉扁。
- 年輪：用正規化圓盤座標（aCoord）→ 跟著外形變橢圓（像真的木頭）；線條用 `fwidth` 抗鋸齒，年輪小於像素時淡出避免摩爾紋。
- 凹凸：高度場的螢幕空間導數擾動法線（與 three.js bumpMap 同公式），深度用世界單位（`uBumpDepth`）。
- 預烘 AO（aAO）：近地面、凹溝較暗。

## 擺放與面板

- 與檸檬片相同：離頂端角度＋方位角＋自轉＋前傾／側傾＋下沉；`model.scale` 做非等比拉伸，`anchor.scale` 做整體縮放與開場長大。
- 選中效果改用 `setHighlighted`（emissive 暖橘），不碰 `material.color`（color 被拿來做亮度與染色）。
