# Validation

## 結果：通過

- **型別／建置**：`tsc --noEmit`、`npm run build` 通過。
- **幾何**（headless，seed 1、2、7、42、99）：樹皮法線全部朝外、切面法線全部朝上、0 個 NaN。
  每個樹墩約 6.9k 三角面（樹皮 4608、切面 1632、木刺 210、樹枝 456）。
- **瀏覽器**（1400×900）：
  - 場景：樹墩在綠球右側（離頂端 40°、方位 35°），開場隨房子之後長出來；console 無錯誤／警告。
  - 紋路不糊：寬 ×3、縮放 ×3 後近拍切面與樹皮，年輪線、裂縫、樹皮紋都銳利，樹皮紋沒有被橫向拉扁（`tree-stump-wide-zoom.png`）。
  - 造型：seed 7、高度 ×0.6 外形與裂縫位置不同（`tree-stump-seed.png`）。
  - 面板：點樹墩 → 資料夾標題變「樹墩 · tree_stump_1」、選中發亮（emissiveIntensity 0.28）；
    「複製樹墩」→ 數量 1 → 2，新的方位 +18°、自動選取新的；「移除選中樹墩」→ 2 → 1；「印出全部佈局」輸出可直接貼回的 TS。

## 問題與修正

- 樹皮偏紫 → 樹皮三色改暖、環境反射 0.25 → 0.15。
- 切面裂縫太長太粗、貫穿整個切面 → 改 2 條、長度 0.3～0.5、寬 0.01。
- 裂縫變成兩條虛線 → 角度差先取 abs 再加彎曲量造成雙線；改成帶正負號的角度差，尾端改淡出。
- 一開始太大（0.12）、壓到香腸攤 → 0.085，移到綠球右側空地。

## 截圖

- `docs/Engineering Evidence/assets/tree-stump-render.png`
- `docs/Engineering Evidence/assets/tree-stump-wide-zoom.png`
- `docs/Engineering Evidence/assets/tree-stump-seed.png`
- `docs/Engineering Evidence/assets/tree-stump-in-scene.png`

## 第二輪（使用者回報）

- 「切面顏色都需要跟中心的顏色一樣」→ 切面底色整片改用心材色（`uWoodHeart`），拿掉由內往外變深與外圈邊材變暗；年輪線、斑點、裂縫保留。
- 預設大小、寬 ×3＋縮放 ×3 近拍：整個切面都是同一個米色，年輪線依然銳利；console 無錯誤（截圖已更新）。

## 第三輪（使用者回報）

- 「切面上有木刺，幫我移除」→ 整個拿掉斷裂木刺：`buildShards`、木纖維 shader 分支、`showShards` 設定與面板開關都刪除。
- 正面、背面近拍：切面完整、沒有木刺；三角面約 6.7k；`tsc` 通過、console 無錯誤（截圖已更新）。
