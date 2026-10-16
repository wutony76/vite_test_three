# Proposal

## 變更名稱

add-night-market-lights — 熱鬧夜市燈光範例

## 背景

使用者希望有一個著重「燈光效果」（霓虹燈、燈條）的新範例，並要有「熱鬧夜市感」。既有範例尚未示範面光源（RectAreaLight）、自訂發光 Shader 燈條、跑馬燈字幕、反射地板、大量動態彩色燈泡等。

## 目標

建立 `market.html`：一條台灣夜市街，集合多種燈光效果並可即時控制。

## 範圍

- 包含：
  - 8 個攤位（大雞排、珍珠奶茶、章魚燒、臭豆腐、射氣球、烤玉米、夾娃娃機、芒果剉冰），每攤：
    - 霓虹燈管圖示（TubeGeometry 核心 + 外暈、Bloom、開機閃爍點亮、偶爾閃爍）
    - 中文招牌燈箱（Canvas 文字 + HDR 自發光）
    - 雨棚 LED 燈條（自訂 Shader：單色 / 跑馬燈 / 彩虹 / 呼吸 / 閃爍）+ RectAreaLight 實際照亮攤位
    - 工作燈 PointLight、食物攤冒熱氣
  - 街道上空彩色串燈（InstancedMesh、每顆燈泡 HDR 顏色，常亮 / 閃爍 / 追逐）
  - 街尾牌樓：跑馬燈字幕（貼圖 offset 捲動）+ 追逐燈泡外框
  - 人潮（InstancedMesh 行人走動）、背景大樓窗光、霧面水泥地（依使用者回饋，不反光）、霧氣
  - 控制台：情境預設、總電源、攤位開關（也可點攤位）、燈條模式 / 顏色 / 速度、串燈模式、人潮、環境音、亮度、光暈、霧氣
- 不包含：外部資源、部署

## 影響面

- 新增 `market.html`、`src/market/**`；`vite.config.ts` 新增頁面

## 風險與對策

- 光源多（RectAreaLight ×8、PointLight ×8）+ Reflector（多畫一次）+ Bloom → 反射貼圖半解析度、不開陰影、pixelRatio 上限 1.5；手機關閉反射
- RectAreaLight 只作用於 MeshStandard / Physical，需 `RectAreaLightUniformsLib.init()`
- 燈條顏色在 Shader 內計算，RectAreaLight 顏色由 CPU 以同一公式算代表色

## 驗證方式

- Playwright：開機點亮、點攤位開關、情境、燈條模式 / 顏色、串燈模式、總電源、滑桿、人潮、手機
- 截圖、FPS

## 成功標準

- [x] 功能符合需求且行為正確
- [x] 畫面呈現符合預期（熱鬧夜市感）
- [x] 無 console / WebGL error
- [x] `npm run build` 通過
