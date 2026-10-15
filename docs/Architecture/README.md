# Architecture

本文件是 `vite_test_three` 專案架構的單一事實來源。變更影響目錄結構、技術棧或開發規範時，需同步更新本文件。

## 1. 技術棧

| 類別 | 套件 | 版本 |
| --- | --- | --- |
| Build tool | `vite` | ^8.3.0 |
| 語言 | `typescript` | ~6.0.2（僅型別檢查，`noEmit`） |
| 3D | `three` / `@types/three` | ^0.186.1 / ^0.186.0 |
| 樣式 | `sass-embedded` | SCSS |
| Runtime | Node.js | 22.22.2 |

## 2. 目錄結構

```
vite_test_three/
├─ index.html                 方塊練習頁，載入 /src/main.ts
├─ cinema.html                電影院選位範例頁，載入 /src/cinema/main.ts
├─ vite.config.ts             多頁面 build 設定（新增頁面要加進 input）
├─ public/                    靜態資源（以 /xxx 絕對路徑引用）
│  └─ favicon.svg
├─ src/
│  ├─ main.ts                 方塊練習：方陣、Raycaster 點擊變色、波浪動畫、效能面板
│  ├─ style.scss              方塊練習頁樣式
│  └─ cinema/
│     ├─ main.ts              電影院選位：狀態共用材質、選位流程、模擬訂位 API
│     └─ style.scss           選位面板樣式
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

## 4. 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 啟動 Vite dev server（http://localhost:5173/ 、/cinema.html） |
| `npm run build` | `tsc` 型別檢查 + `vite build` 輸出至 `dist/` |
| `npm run preview` | 預覽 build 結果 |

## 5. 開發規範重點

- 完整規範見 `openspec/project.md`
- 單一 `state` 物件；`click` / `_actions` / `_handlers` 分層；非同步三段狀態
- SCSS 巢狀、`@use` / `@forward`，禁止 `@import`
- Three.js：loop 用 `THREE.Timer`（`THREE.Clock` 已棄用）、移除物件要 `dispose()`
- 材質：有幾種外觀就建幾個材質，改外觀用「換材質參考」而非 `material.color.set()`

## 6. 已知事項

- build 產出的 JS 約 555 KB（gzip 約 138 KB），超過 Vite 500 KB 提醒門檻，主因為 Three.js 本體；需要時再以動態 `import()` 拆分
