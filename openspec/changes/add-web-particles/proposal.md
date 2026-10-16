# Proposal

## 變更名稱

add-web-particles — 捲動驅動的互動粒子網頁範例（web sample）

## 背景

使用者希望有一個全新的「可互動 Three.js 網頁範例」。前面的範例偏向單一 3D 場景（商品、店面），這次做成一般網站常見的形式：HTML 內容捲動、背景 3D 隨之變化並可與滑鼠互動。

## 目標

建立 `web.html`：全螢幕粒子背景 + 5 段可捲動內容，粒子隨捲動在 4 種形狀間變形，可被滑鼠推開、點擊產生漣漪；最後一段連結到其他範例，作為作品集入口。

## 範圍

- 包含：
  - 粒子：桌機 24,000 顆、手機 12,000 顆，單一 `Points` + 自訂 `ShaderMaterial`（1 次 draw call）
  - 形狀：球體（Fibonacci 分布）、環面結（MeshSurfaceSampler 表面取樣）、波浪（Shader 即時計算）、文字（Canvas 文字像素取樣）
  - 互動：捲動變形、滑鼠推開、點擊漣漪、右側導覽點、頂部進度條、滑鼠視差
  - 每段配色漸變、版面左右交錯（粒子移到另一側）
  - RWD、prefers-reduced-motion、WebGL 不支援提示
- 不包含：後製、外部資源、部署

## 影響面

- 新增 `web.html`、`src/web/**`；`vite.config.ts` 新增頁面

## 風險與對策

- 粒子數多 → 所有動畫在 vertex shader 計算，CPU 每幀只更新幾個 uniform
- 文字在直式手機太寬 → 依畫面比例縮放粒子群組
- 滑鼠事件被 HTML 內容擋住 → 監聽 window 層級事件，點擊連結 / 按鈕時不觸發漣漪

## 驗證方式

- Playwright：捲動後 morph 值、導覽點跳段、滑鼠推開強度、點擊漣漪、連結、手機版、reduced motion
- 截圖：各段形狀、手機
- FPS 與 draw call 數

## 成功標準

- [x] 功能符合需求且行為正確
- [x] 各段畫面符合預期（桌機 / 手機）
- [x] 無 console / WebGL error
- [x] `npm run build` 通過
