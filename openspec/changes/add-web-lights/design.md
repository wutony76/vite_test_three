# Design

## 1. Scene Structure

- 地面（霧面深灰）+ 背景弧形牆（cyclorama，承接光的漸層）
- 中央展台：白色霧面球、鉻金屬環面結（緩慢旋轉）、堆疊方塊
- 光源：游標點光源、RGB 點光源 ×3、聚光燈（+ 光束錐體、陰影）、RectAreaLight（+ 可見發光面板）、霓虹光環（MeshBasic HDR + PointLight 溢光）、地面追逐燈泡（InstancedMesh）
- 相機 (0, 2.2, 7.5) 看向 (0, 1.2, 0)；展台群組依段落左右偏移

## 2. Module Breakdown

- `src/lights/main.ts`：段落設定、捲動 → 權重、指標事件、導覽
- `src/lights/LightStage.ts`：renderer、Bloom、場景、所有光源、`update(weights, pointer, …)`
- `src/lights/style.scss`

## 3. State 設計

- `scrollSection`（小數）、`section`
- 每個光源目前權重（平滑追蹤目標）、每段主燈顏色索引
- 指標 NDC、最近是否移動

## 4. Interaction Flow

- 捲動 → 依段落設定混合各光源目標權重、偏移、Bloom
- `pointermove` → 射線打到垂直平面（游標光、面光源）或地面（聚光燈目標）
- `click`（非連結 / 按鈕）→ 目前段落主燈換下一個顏色

## 5. Render Loop 與效能

- 每幀：權重平滑、光源強度 = 基準 × 權重、RGB 繞行、追逐燈 instanceColor
- 權重 0 的光源強度為 0（仍在場景中，避免切換時重新編譯 Shader）

## 6. Assets

- 無外部資源

## 7. 錯誤處理

- WebGL 不支援：保留內容並提示

## 8. 測試與驗證策略

- Playwright（GPU）、截圖、FPS
