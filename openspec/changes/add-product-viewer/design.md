# Design

## 1. Scene Structure（場景結構）

- 模型置中、底部貼齊 y = 0；地面為 `ShadowMaterial` 平面（只顯示陰影，背景由 CSS 漸層提供）
- Camera：PerspectiveCamera(35)，依模型包圍球半徑自動計算距離
- Lights：`scene.environment` = RoomEnvironment（PMREM）提供反射與主要照明；DirectionalLight 只負責投射陰影
- Renderer：`alpha: true`、`NeutralToneMapping`、`PCFShadowMap` + `shadow.radius`（r186 已移除 PCFSoftShadowMap）

## 2. Module Breakdown（模組拆分）

- `src/product/main.ts`：頁面進入點，串接 viewer、載入流程與 UI
- `src/product/ProductViewer.ts`：可重用的 3D 檢視器 class（renderer / camera / controls / 環境 / 陰影 / 按需渲染 / resize / 重設視角 / dispose），不含商品業務邏輯
- `src/product/loadProduct.ts`：GLTFLoader + MeshoptDecoder、進度回報、`KHR_materials_variants` 解析與套用
- `src/product/products.ts`：商品資料（名稱、價格、尺寸、配色顯示名稱與色票）
- `src/product/style.scss`：版面與元件樣式

## 3. State 設計

- `state.status`：`'loading' | 'ready' | 'error'`、`state.progress`（0~1）、`state.errorMessage`
- `state.variant`：目前配色 key；`state.size`：選擇的尺寸或 null
- `state.isAdding`：加入購物車 loading；`state.toast`
- Viewer 內部：`needsRender`、`autoRotate`、`resumeTimer`、`tween`（重設視角動畫）

## 4. Interaction Flow（click / _actions / _handlers）

- `click.onVariant(key)` → `_actions.applyVariant` → 套材質、更新網址、重畫
- `click.onSize(size)` → 更新 state、render UI
- `click.onAddToCart` → `_actions.addToCart`：loading guard、未選尺寸 early return（顯示提示）、模擬 API、success / error toast
- `click.onRetry` → `_actions.loadModel`
- Viewer 工具列：自動旋轉切換、重設視角、全螢幕

## 5. Render Loop 與效能

- 按需渲染：`controls` 的 `change` 事件、配色切換、resize、tween 期間才設定 `needsRender`
- 自動旋轉中每幀會觸發 `change` → 持續渲染；停止後靜止不重畫
- 使用者 `start` 互動時暫停自動旋轉，`end` 後 3 秒恢復
- 重設視角動畫期間關閉阻尼與自動旋轉，避免殘留慣性讓相機停在偏離預設的位置

## 6. Assets（資源）

- `public/models/shoe/shoe.glb`（1.82 MB；EXT_meshopt_compression、EXT_texture_webp、KHR_mesh_quantization、KHR_materials_variants）
- 三種配色共用幾何、法線、粗糙度貼圖，只換 baseColor 貼圖

## 7. 錯誤處理與可觀測性

- WebGL 不支援：直接顯示錯誤狀態，不建立 renderer
- 模型載入失敗：顯示錯誤訊息與「重新載入」按鈕
- 不認得的 `?variant=`：退回預設配色

## 8. 測試與驗證策略

- Playwright：配色 / 網址 / 尺寸 / 購物車 / 重設 / 自動旋轉 / 失敗重試（攔截模型請求回 404）
- 截圖：桌機 1280×800、手機 390×844
- 按需渲染：透過 `renderer.info.render.frame` 確認靜止時不增加
