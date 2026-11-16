# Design

## 1. Scene Structure

- `ground`（球心 pivot）底下：既有 `groundSurface`（綠球 mesh）＋ 新增 `ground_detail` Group：
  - `ground_tufts`（InstancedMesh，草叢）
  - `ground_rocks` / `ground_mushrooms` / `ground_bushes`（InstancedMesh）
- 綠球材質 fragment 注入：斑塊、漸層、小徑、番茄醬陰影帶（都改 `diffuseColor`，在打光之前）
- 座標：ground-local；綠球半徑 1；`up` 用 `getGroundAxes` 的頂端方向

## 2. Module Breakdown

- 新增 `src/world/objects/groundDetail.ts`
  - `GROUND_DETAIL_DEFAULT` / `createGroundDetail()` / `formatGroundDetailSettingsForPaste()`
  - 內部：GLSL value-noise fbm、球面弧距離（GPU 與 CPU 各一份，撒點時避開小徑）
  - 小徑網路：房子＋篝火節點做最小生成樹；每條邊切 4 段、中間點往側邊偏移成彎路
- `obj.ts`：提供 `getPathNodes`、`getObstacleRoots`、`getRibbon`、`getRibbonTopColatitude`、入場進度
- `main.ts`：面板

## 3. State 設計

- `settings`（單一物件）：各項 enabled 與數值
- uniforms（綠球、草叢各一份）：顏色、強度、`uRingMatrix`、`uPathA/B[40]`、`uTime`、`uGrow`
- 撒點結果：建好一次；「重新撒」或數量改變時重建

## 4. Interaction Flow

- 面板拖動 → settings → `apply()` 寫 uniforms（不重新編譯）
- 數量類參數 → `onFinishChange` → `rescatter()`
- 每幀 `update(dt, housesReady)`：uTime、緞帶矩陣、grow；每 0.5 秒更新小徑

## 5. Render Loop 與效能

- 每幀：幾個 uniform 與一次矩陣乘法
- draw calls +4；草叢 2000 × 6 三角形；道具約 110 個 instance
- 撒點：拒絕取樣，最多數萬次向量運算，只在建立／重新撒時

## 6. Assets

- 無外部資源

## 7. 錯誤處理

- 沒有綠球（使用模型模式）時不建立
- 取樣失敗（空間不夠）時少撒，不報錯

## 8. 測試與驗證策略

- tsc / build
- 截圖：開／關全景、近景；拖動房子後小徑
- 回歸：小豬、番茄醬、styleGrade、浮空小星球
