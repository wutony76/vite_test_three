# Engineering Evidence：糖果罐（柑仔店屋頂那罐的獨立版）

## 變更摘要

- 把柑仔店屋頂的超大玻璃糖果罐另做一份獨立物件放在綠球上（柑仔店那罐不動）：圓肚玻璃罐、彩色糖球（InstancedMesh 各自上色）、紅蓋＋圓鈕、白緞帶。
- 造型與尺寸照 `candyShop.ts` 的 `buildCandyJar`；新模組 `candyJar.ts`／`candyJarLayout.ts`。
- 面板「糖果罐（柑仔店屋頂那罐的獨立版）」：位置、縮放、大小、糖球數量、罐蓋顏色、亮度；拖曳選取、複製、移除、印出佈局（跟檸檬片一樣）；`CANDY_JAR_SCENE_EDIT` 開關。

## 驗證佐證

- `tsc`、`npm run build` 通過；console 無錯誤。
- 點選 → 「糖果罐 · candy_jar_1」發亮；複製 1 → 2（方位 +18°）、移除 2 → 1。
- 第一次位置（離頂端 46°、方位 -38°）壓到布丁 → 改成 38°、-14°（香腸攤右邊的空草地）。
- 截圖：`assets/candy-jar-render.png`、`assets/candy-jar-in-scene.png`

## 風險與後續追蹤

- 玻璃是透明材質（depthWrite: false），多個罐子重疊時透明排序可能偶爾閃一下。

## 第二輪（使用者回報）

- 「不用棒棒糖」→ 棒棒糖整個移除（幾何、貼圖、每幀轉動、`showLollipop` 設定與面板開關）。
