# Design

## 1. Scene Structure

- PerspectiveCamera(45) 位於 (0, 0, 7)；粒子群組在原點，依段落左右偏移與縮放
- 背景純色由 CSS 提供（renderer alpha），粒子 AdditiveBlending 疊加發光

## 2. Module Breakdown

- `src/web/main.ts`：頁面狀態、捲動、導覽點、指標事件
- `src/web/ParticleField.ts`：BufferGeometry（4 組形狀 attribute + 亂數）、ShaderMaterial、每幀 uniform 更新
- `src/web/shapes.ts`：球體 / 環面結 / 波浪平面 / 文字 的點位產生
- `src/web/shaders.ts`：vertex / fragment GLSL
- `src/web/style.scss`

## 3. State 設計

- `state.section`（目前段落）、`state.morph`（目標）與 `field.morph`（平滑後）
- `state.pointer`（NDC）、`state.pointerActive`（最近有移動）、漣漪起點與時間

## 4. Interaction Flow

- `scroll` → `_handlers.syncScroll`：progress、section、morph 目標
- `pointermove` → 射線打到 z = 0 平面 → `uMouse`
- `click`（非連結 / 按鈕）→ `uRippleOrigin` + `uRippleTime`
- 導覽點 `click.onNav(i)` → `scrollIntoView`

## 5. Render Loop 與效能

- Vertex shader：分段 smoothstep 混合 4 形狀（每顆粒子以亂數錯開時間）、波浪、待機抖動、滑鼠推開、漣漪、點大小
- CPU 每幀：平滑 morph / 配色 / 偏移、更新約 10 個 uniform

## 6. Assets

- 無外部資源

## 7. 錯誤處理

- WebGL 不支援：保留 HTML 內容，顯示提示，不建立場景

## 8. 測試與驗證策略

- Playwright（GPU）、截圖、FPS
