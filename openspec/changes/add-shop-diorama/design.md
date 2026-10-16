# Design

## 1. Scene Structure（場景結構）

- 座標：1 單位 ≈ 1 公尺；地塊 14 × 11（x −7~7、z −5.5~5.5，頂面 y = 0），店面朝 +z，馬路在 z 6.5~14 沿 x 延伸
- 天空：反面球體 + 漸層 ShaderMaterial；遠山：兩圈鋸齒狀環形帶（受霧影響淡出）；星星：Points；月亮：Sprite
- 光：HemisphereLight + 一盞投影 DirectionalLight（夜為月光、日為陽光）+ 店內 PointLight + 路燈 SpotLight
- 相機：PerspectiveCamera(32)，預設 (24, 17, 26) 看向 (0, 2.5, 0)；OrbitControls 限制仰角與距離、不可平移

## 2. Module Breakdown（模組拆分）

- `src/diorama/main.ts`：頁面狀態、UI、事件
- `src/diorama/Stage.ts`：renderer、EffectComposer（Render → Bloom → Outline → Output；外框須在光暈之後，否則白色外框會被暈開）、相機、controls、飛行動畫（依較窄視角取景）、resize、全螢幕
- `src/diorama/World.ts`：組裝場景、日夜 / 雨的過渡、每幀更新、熱點物件索引、開場動畫
- `src/diorama/world/textures.ts`：Canvas 程式產生貼圖（磚牆、招牌、黑板、雨棚條紋、柔光點）
- `src/diorama/world/materials.ts`：共用材質與「會發光材質」清單
- `src/diorama/world/helpers.ts`：box / cylinder / group / hotspot 建構小工具
- `src/diorama/world/buildShop.ts`、`buildStreet.ts`、`buildProps.ts`、`buildSky.ts`
- `src/diorama/world/effects.ts`：煙霧、雨
- `src/diorama/hotspots.ts`：12 個可點物品的文字內容
- `src/diorama/ambience.ts`：Web Audio 環境音（城市低頻 + 雨聲）

## 3. State 設計

- `state.status`：`'building' | 'ready'`、`state.buildProgress`
- `state.isNight`、`state.isRaining`、`state.soundOn`、`state.listOpen`、`state.hintVisible`
- `state.hovered`、`state.selected`：熱點 id 或 null
- World 內部：`dayness`（0 夜 ~ 1 日）、`rain`（0~1）朝目標值平滑插值

## 4. Interaction Flow

- `pointermove` → 射線檢測熱點根物件（`userData.hotspot`）→ OutlinePass 外框 + 標籤
- `pointerup`（非拖曳）→ `_actions.select(id)`：介紹卡 + `stage.flyTo`
- 工具列：home / rain / sound / day-night / list；Esc 關閉卡片與清單

## 5. Render Loop 與效能

- 場景持續有動畫（煙、雨、閃爍）→ 每幀渲染；分頁隱藏時 rAF 自動暫停
- 陰影貼圖關閉自動更新（`shadowMap.autoUpdate = false`），只在開場動畫與日夜 / 雨過渡期間重畫
- 開場動畫以實際時間（performance.now）計算，低 FPS 裝置也能準時完成
- 道路虛線、屋頂燈泡用 InstancedMesh；雨 2,000 條線段單一 draw call；煙 28 個 Sprite

## 6. Assets

- 無外部資源：貼圖由 Canvas 2D 繪製，聲音由 Web Audio 合成

## 7. 錯誤處理

- WebGL 不支援：顯示提示，不建立場景
- AudioContext 建立失敗：toast 提示，按鈕維持關閉

## 8. 測試與驗證策略

- Playwright 腳本（桌機 / 手機）、日夜雨截圖、console 檢查、build
