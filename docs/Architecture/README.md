# Architecture

本文件是 `vite_test_three` 專案架構的單一事實來源。變更影響目錄結構、技術棧或開發規範時，需同步更新本文件。

## 1. 技術棧

| 類別 | 套件 | 版本 |
| --- | --- | --- |
| Build tool | `vite` | ^8.3.0 |
| 語言 | `typescript` | ~6.0.2（僅型別檢查，`noEmit`） |
| 3D | `three` / `@types/three` | ^0.186.1 / ^0.186.0 |
| 樣式 | `sass-embedded` | SCSS |
| 物理 | `cannon-es` | ^0.20.0（drive 頁） |
| Runtime | Node.js | 22.22.2 |

## 2. 目錄結構

```
vite_test_three/
├─ index.html                 方塊練習頁，載入 /src/main.ts
├─ cinema.html                電影院選位範例頁，載入 /src/cinema/main.ts
├─ product.html               商品 3D 展示頁，載入 /src/product/main.ts
├─ diorama.html               3D 店面導覽頁，載入 /src/diorama/main.ts
├─ house.html                 house 場景頁（由 diorama 複製後改造：雞排底座、狸貓），載入 /src/house/main.ts
├─ web.html                   互動粒子網頁範例（作品入口），載入 /src/web/main.ts
├─ market.html                夜市燈光範例，載入 /src/market/main.ts
├─ lights.html                燈光互動網頁（光的五種樣子），載入 /src/lights/main.ts
├─ drive.html                 開車逛小島（作品集互動入口），載入 /src/drive/main.ts
├─ vite.config.ts             多頁面 build 設定（新增頁面要加進 input）
├─ public/                    靜態資源（以 /xxx 絕對路徑引用）
│  ├─ favicon.svg
│  └─ models/shoe/            商品模型 shoe.glb（meshopt + WebP 壓縮）與授權說明
├─ src/
│  ├─ main.ts                 方塊練習：方陣、Raycaster 點擊變色、波浪動畫、效能面板
│  ├─ style.scss              方塊練習頁樣式
│  ├─ cinema/
│  │  ├─ main.ts              電影院選位：狀態共用材質、選位流程、模擬訂位 API
│  │  └─ style.scss           選位面板樣式
│  ├─ product/
│  │  ├─ main.ts              商品頁進入點：狀態、UI、載入流程、購物車
│  │  ├─ ProductViewer.ts     可重用 3D 檢視器 class（不含商品業務邏輯）
│  │  ├─ loadProduct.ts       GLTFLoader + MeshoptDecoder、KHR_materials_variants
│  │  ├─ products.ts          商品資料（名稱、價格、尺寸、配色、授權）
│  │  └─ style.scss           商品頁樣式（RWD）
│  ├─ diorama/
│  │  ├─ main.ts              導覽頁進入點：狀態、UI、射線檢測、標籤、介紹卡
│  │  ├─ Stage.ts             renderer、後製（Bloom / Outline）、相機、飛行動畫
│  │  ├─ World.ts             組裝場景、日夜 / 雨過渡、動畫、開場搭建
│  │  ├─ hotspots.ts          12 個物品的故事內容
│  │  ├─ ambience.ts          Web Audio 合成環境音
│  │  ├─ style.scss
│  │  └─ world/               textures / materials / helpers / buildShop / buildStreet / buildProps / buildSky / effects
│  ├─ house/                  與 diorama/ 相同結構的獨立副本（兩者互不影響）
│  ├─ web/
│  │  ├─ main.ts              段落設定、捲動 → 變形、指標 → 推開 / 漣漪、導覽點
│  │  ├─ ParticleField.ts     Points + ShaderMaterial；4 組形狀 attribute
│  │  ├─ shapes.ts            球體 / 環面結（MeshSurfaceSampler）/ 波浪 / 文字（Canvas 取樣）
│  │  ├─ shaders.ts           vertex（變形、波浪、推開、漣漪）/ fragment（圓點、配色）
│  │  └─ style.scss
│  ├─ drive/
│  │  ├─ main.ts              狀態、UI、每幀流程（操作 → 物理 → 同步 → 區域 → 鏡頭）
│  │  ├─ Car.ts               RaycastVehicle 車輛 + 玩具車模型、跳躍、重置
│  │  ├─ world.ts             小島、邊界、樹、跳台、可撞物件（大字、球瓶、木箱）
│  │  ├─ zones.ts             作品區域資料與圓台
│  │  ├─ Grass.ts             草（InstancedMesh + onBeforeCompile 風與車子推倒）
│  │  ├─ Input.ts / CameraRig.ts / Dust.ts / audio.ts
│  │  └─ style.scss
│  ├─ lights/
│  │  ├─ main.ts              段落設定（光源權重、主燈、偏移、Bloom）、捲動混合、指標、點擊換色
│  │  ├─ LightStage.ts        雕塑、五種光源與可見燈具（燈泡、光束 Shader、發光面板、霓虹環、追逐燈）
│  │  └─ style.scss           沿用 web 版型，主色改暖色
│  └─ market/
│     ├─ main.ts              狀態、燈光控制台、情境預設、點擊攤位
│     ├─ Stage.ts             renderer、Bloom、controls；RectAreaLightUniformsLib.init()
│     ├─ Stall.ts / stalls.ts 攤位建模與資料（霓虹、燈箱、燈條、工作燈、道具）
│     ├─ neon.ts / neonIcons.ts  霓虹燈管（核心 + 外暈）、點亮閃爍 PowerSwitch、圖示筆畫
│     ├─ LedStrip.ts          燈條 Shader（5 種模式、LED 顆粒）+ RectAreaLight
│     ├─ StringLights.ts      街道串燈（InstancedMesh + instanceColor）
│     ├─ Gate.ts              牌樓跑馬燈（貼圖 offset 捲動）+ 追逐燈泡
│     ├─ Crowd.ts             人潮（InstancedMesh）
│     ├─ Street.ts            水泥地面、大樓、熱氣
│     └─ textures.ts / ambience.ts / style.scss
├─ openspec/
│  ├─ project.md              專案規範（改程式前必讀）
│  ├─ config.yaml             OpenSpec CLI 設定（schema: spec-driven）
│  ├─ templates/              六階段文件範本
│  ├─ changes/                進行中的 change（封存至 changes/archive/）
│  └─ specs/                  已確立的規格
└─ docs/
   ├─ Architecture/README.md  本文件
   └─ Engineering Evidence/   每個變更的交付佐證
```

預計擴充的 `src/` 分層（新增程式時依此放置）：`core/`（renderer、camera、loop）、`scene/`（場景物件）、`interaction/`（輸入處理）、`utils/`、`styles/`。

## 3. 頁面

採 Vite 多頁面：每個頁面一個 HTML 進入點，build 時列在 `vite.config.ts` 的 `build.rolldownOptions.input`。

### 3.1 方塊練習（`/`）

1. 建立 `Scene`、`PerspectiveCamera`、`WebGLRenderer`（pixelRatio 上限 2），canvas append 到 `#app`
2. 迴圈建立 `GRID_SIZE²` 個方塊：共用 geometry、各自一份 material，放入 `Group`
3. Raycaster（`intersectObjects`）點擊變色，以按下 / 放開距離區分點擊與拖曳
4. `setAnimationLoop` 以 `THREE.Timer` 計算時間，做波浪動畫並每 0.5 秒更新效能面板（FPS、draw calls、三角形）

### 3.2 電影院選位（`/cinema.html`）

1. 影廳：地板、階梯、銀幕、8 × 12 座位（`mergeGeometries` 合併椅墊 + 椅背，全部共用）
2. 4 個狀態材質（available / hover / selected / sold）共用；改外觀一律替換 `mesh.material` 參考
3. 座位資料 `SeatInfo` 與 Mesh 分離，以 `Map` 由 Raycaster 結果反查
4. 送出訂位走 `_actions.submitBooking`（loading / success / error），API 以 `fakeBookingApi` 模擬

### 3.3 商品 3D 展示（`/product.html`）

1. `ProductViewer`：透明背景 renderer + CSS 漸層、RoomEnvironment（PMREM）環境照明、`NeutralToneMapping`、平行光只投陰影到 `ShadowMaterial` 地面
2. `loadProduct`：`loadAsync` 回報進度；`parser.associations` + `parser.getDependency('material')` 實作 `KHR_materials_variants` 配色切換（不分大小寫、只採最後一次請求）
3. 模型依包圍盒置中貼地，依包圍球半徑自動取景、設定陰影範圍與縮放限制
4. 按需渲染：只有 controls `change`、配色切換、resize、重設動畫時才重畫
5. UI：載入進度 / 錯誤重試 / WebGL 不支援、`?variant=` 可分享連結、尺寸與加入購物車（模擬 API）、toast
6. `product.html` 以 `<link rel="preload">` 提早下載模型

### 3.4 3D 店面導覽（`/diorama.html`）

1. 全部物件由程式產生：Canvas 2D 貼圖、共用材質、InstancedMesh（串燈、道路虛線）、Points（星星）、LineSegments（雨）、Sprite（煙、月亮）
2. `Stage`：EffectComposer（Render → Bloom → Outline → Output）；HalfFloat + MSAA；陰影貼圖按需更新
3. `World`：nightness / rain 朝目標值平滑插值，統一更新天空 Shader、霧、光源、發光材質、霓虹亮度、Bloom 強度
4. 互動：Raycaster 找 `userData.hotspot` → OutlinePass 外框 + 投影到螢幕的 HTML 標籤；點擊 → 介紹卡、`flyTo`、網址 `#id`
5. 開場搭建動畫以實際時間計算；`prefers-reduced-motion` 直接完成

### 3.5 互動粒子網頁（`/web.html`）

1. 固定背景 canvas（alpha）+ 一般捲動的 HTML 段落；滑鼠事件由 window 統一處理
2. 24,000（手機 12,000）粒子，單一 `Points` = 1 次 draw call；每顆粒子存 4 組形狀座標
3. Vertex shader 以 `uMorph` 分段 smoothstep 混合形狀（亂數錯開）、計算波浪、滑鼠推開、點擊漣漪
4. 捲動位置（可為小數）決定 morph、配色、群組位置與透明度，CPU 端以指數平滑追蹤
5. 範例清單段落連到所有範例頁

### 3.6 夜市燈光（`/market.html`）

1. 8 個攤位：霓虹圖示（TubeGeometry 核心 + 外暈）、招牌燈箱（Canvas 自發光）、LED 燈條（Shader）+ RectAreaLight、工作燈 PointLight
2. `PowerSwitch`：開燈時依「持續時間、亮度」步驟播放閃爍，模擬霓虹 / 日光燈點亮
3. 燈條共用 uniform（時間、速度、模式）；RectAreaLight 顏色由 CPU 以相同公式計算代表色
4. 串燈與牌樓燈泡為 InstancedMesh，每幀改 instanceColor（HDR 值 > 1 產生 Bloom）；跑馬燈以貼圖 offset 捲動
5. 地面：霧面水泥（程式產生貼圖 + bumpMap、roughness 1），不反光
6. 基本光：HemisphereLight + 補光 DirectionalLight，強度由「環境光」滑桿控制
7. 控制台 state → `apply()` 同步 3D；情境預設一次設定多項；手動調整即清除情境標示

### 3.7 燈光互動網頁（`/lights.html`）

1. 中央白色霧面球、鉻金屬環面結、石材方塊：分別用來看光的顏色、反光、陰影
2. 五種光源同時存在，以「權重」控制亮度；權重由捲動位置在相鄰段落之間混合，並平滑追蹤
3. 滑鼠射線打到垂直平面（游標光、面光源）或地面（聚光燈照射點）；RGB 轉速跟著滑鼠 x
4. 光束：加法混合的開口圓柱 + 自訂 Shader（沿長度與面向淡出）；注意 `pow(0, y)` 在 Metal 為 NaN
5. 手機：不開陰影、降低解析度

### 3.8 開車逛小島（`/drive.html`）

1. cannon-es：重力 -15、SAPBroadphase、allowSleep；固定步長 `step(1/60, dt, 3)`
2. 車：方塊底盤 + RaycastVehicle（四條射線懸吊），四輪驅動、速度相關轉向限制、跳躍為向上衝量
3. 可撞物件：剛體 + Mesh 配對，每幀複製位置；大字為多個 Box 組成的複合剛體；一開始睡眠
4. 作品區域：車子水平距離 < 半徑即顯示卡片，Enter 導向
5. 草：數萬根 instance，vertex shader 依「根部位置 + 時間」計算陣風與抖動、依車子距離推倒；沿用 MeshStandardMaterial 保留光照 / 陰影 / 霧
6. 鏡頭固定俯角跟車（看向車前方），滑鼠拖曳改方位角、滾輪縮放；太陽陰影相機跟著鏡頭焦點
7. ⚠️ cannon-es 注意：設定 position 後要 `aabbNeedsUpdate`；`updateWheelTransform` 會重設 `isInContact`

## 4. 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Vite dev server（http://localhost:5173/ 、/cinema.html、/product.html、/diorama.html、/house.html、/web.html、/lights.html、/market.html、/drive.html） |
| `npm run build` | `tsc` 型別檢查 + `vite build` 輸出至 `dist/` |
| `npm run preview` | 預覽 build 結果 |

## 5. 開發規範重點

- 完整規範見 `openspec/project.md`
- 單一 `state` 物件；`click` / `_actions` / `_handlers` 分層；非同步三段狀態
- SCSS 巢狀、`@use` / `@forward`，禁止 `@import`
- Three.js：loop 用 `THREE.Timer`（`THREE.Clock` 已棄用）、移除物件要 `dispose()`
- 材質：有幾種外觀就建幾個材質，改外觀用「換材質參考」而非 `material.color.set()`

## 6. 已知事項

- `market` 使用 RectAreaLight，`RectAreaLightUniformsLib` 的查表資料約 250 KB，使該頁 JS 較大

- 商品模型 MaterialsVariantsShoe 為 © 2021 Shopify、CC BY 4.0，頁面必須保留出處標示

- build 產出的 JS 約 555 KB（gzip 約 138 KB），超過 Vite 500 KB 提醒門檻，主因為 Three.js 本體；需要時再以動態 `import()` 拆分
