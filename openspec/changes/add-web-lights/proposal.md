# Proposal

## 變更名稱

add-web-lights — 燈光版互動網頁（光的五種樣子）

## 背景

使用者希望有一個「燈光版的 web」：沿用 web 粒子範例的捲動式網頁形式，但主題改為燈光。既有 web 頁保留不動。

## 目標

建立 `lights.html`：中央一組白色雕塑，捲動到不同段落時切換不同光源照亮它，每段說明該光源原理並可互動。

## 範圍

- 包含：
  - 段落：首頁（游標光）、點光源（RGB 三盞繞行混光）、聚光燈（光束 + 即時陰影）、面光源（柔光面板）、霓虹與光暈（自發光光環 + 地面追逐燈 + Bloom）、全部一起（範例清單）
  - 捲動時各光源權重依捲動位置平滑交替；Bloom 強度隨段落變化
  - 互動：滑鼠控制該段光源（位置 / 轉速 / 照射點）、點擊換顏色、導覽點、進度條
  - RWD、reduced motion、WebGL 不支援
- 不包含：外部資源、修改既有 web 頁內容（僅於 web 範例清單加入連結）

## 影響面

- 新增 `lights.html`、`src/lights/**`；`vite.config.ts` 新增頁面

## 風險與對策

- 光源數量（PointLight ×5、SpotLight、RectAreaLight）→ 權重為 0 的光源 intensity 0；只有聚光燈開陰影（1024）
- RectAreaLight 需 `RectAreaLightUniformsLib.init()`，查表資料使 JS 增加約 250 KB（與 market 共用 chunk）

## 驗證方式

- Playwright：各段光源權重、滑鼠移動光源、點擊換色、導覽點、手機、reduced motion
- 截圖各段、FPS

## 成功標準

- [x] 功能符合需求且行為正確
- [x] 各段畫面清楚呈現該光源特性
- [x] 無 console / WebGL error
- [x] `npm run build` 通過
