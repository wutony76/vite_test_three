# Project Context: vite_test_three

## Product Overview

- Project name: `vite_test_three`
- Purpose: Vite + Three.js 的 3D 場景實驗與練習專案
- Primary users: 專案維護者

## Current Tech Stack

- Build tool: Vite 8（`vite@^8.3.0`）
- Language: TypeScript 6（`typescript@~6.0.2`，`tsc` 只做型別檢查，`noEmit`）
- 3D: Three.js（`three@^0.186.1` + `@types/three`）
- Physics: cannon-es（`cannon-es@^0.20.0`，drive 頁）
- Styling: SCSS（`sass-embedded`）
- Runtime/toolchain: Node.js 22.x（`22.22.2`）, npm
- 無前端框架（未使用 Vue / React）

## Repository Conventions

- 進入點：`index.html` → `src/main.ts`
- 全域樣式：`src/style.scss`
- 靜態資源（模型、貼圖、HDR、favicon）放 `public/`，以 `/xxx` 絕對路徑引用
- Three.js addons 從 `three/addons/...` 引入（例：`three/addons/controls/OrbitControls.js`）
- 程式成長後依職責拆分（新增時依此放置）：
  - `src/core/` — renderer、camera、animation loop、resize 等基礎設施
  - `src/scene/` — 場景物件（Mesh、Group、Light）的建立與更新
  - `src/interaction/` — 滑鼠、鍵盤、raycaster 等輸入處理
  - `src/utils/` — 純函式工具
  - `src/styles/` — 共用 SCSS（`@use` / `@forward`）

## Development Workflow

- 非 trivial 需求需走 OpenSpec 流程
- 順序：Proposal -> Design -> Tasks -> Implementation -> Validation -> Engineering Evidence
  - Proposal：確認為什麼要做、範圍與風險
  - Design：確認怎麼做（scene / state / flow / 效能）
  - Tasks：拆解可追蹤的實作項目
  - Implementation：依 tasks 完成程式碼變更
  - Validation：實際執行驗證並記錄結果（功能／視覺／效能／回歸），對應 `openspec/templates/validation.md`
  - Engineering Evidence：整理交付佐證，對應 `openspec/templates/engineering-evidence.md`，產出到 `docs/Engineering Evidence/<主題>.md`，作為封存前最後檢查
- 變更影響目錄結構 / 技術棧 / 開發規範時，同步更新 `docs/Architecture/README.md`
- 使用者說「先幫我規劃」時，只產出 proposal / design / tasks（/ specs），不寫程式碼
- 變更保持小而可審查

## Development Conventions (開發規範)

- **語言規範**：
  - OpenSpec 文件與 `docs/` 使用繁體中文
  - 代碼命名、commit message 使用英文
  - 程式碼註解使用繁體中文（學習用專案，註解以說明概念、參數意義與「少了會怎樣」為主）
- **程式語言標準**：TypeScript，遵守 `tsconfig.json` 的 strict 類規則（`noUnusedLocals`、`erasableSyntaxOnly` 等；不使用 `enum` / `namespace`）
- **狀態管理**：模組內以單一狀態物件 `state` 為主，避免散落多個 `let` 變數
- **邏輯分層**：
  - UI / 輸入入口使用 `click`（或 `handleXxx` / `onXxx`）
  - 業務流程使用 `_actions`（需 loading guard、early return、錯誤處理）
  - 私有資料轉換與工具方法集中在 `_handlers`
- **非同步處理**（例如資源載入）：
  - 必須有 loading / success / error 三段狀態
  - 不可吞錯，至少需回傳錯誤或落入可觀測 state
  - 高頻事件（resize / pointermove）優先使用 debounce / throttle
- **命名規範**：
  - actions: `fetchXxx` / `loadXxx` / `submitXxx`
  - private members: `_xxx`
  - 建立場景物件的工廠函式：`createXxx`
- **若之後導入 Vue**：使用 `<script setup lang="ts">`、單一 `reactive` state、composable `useXxx`、store `storeXxx`

## Three.js Conventions

- animation loop 使用 `renderer.setAnimationLoop` + `THREE.Timer`（`THREE.Clock` 已棄用），不以固定步進假設幀率
- `setPixelRatio` 上限為 2
- 移除物件時要 `dispose()` 對應的 geometry / material / texture
- 大量重複物件優先考慮 `InstancedMesh`

## Style & UI Conventions

- SCSS 一律使用巢狀語法
- SCSS 使用 `@use` / `@forward`（禁止 `@import`）
- 顏色與尺寸盡量集中為變數，避免硬編碼 magic number

## Quality Expectations

- 交付前至少確認 `npm run dev` 可啟動、`npm run build` 通過（含 tsc 型別檢查）
- 畫面類變更需實際開頁面截圖確認，並檢查 console 無 error / WebGL warning
- 優先可讀性與可維護性，避免無必要的大型重構

## Architecture Snapshot (Latest)

- 多頁面（`vite.config.ts`）：
  - `index.html` → `src/main.ts`：方塊方陣練習（Raycaster、波浪動畫、效能面板）
  - `cinema.html` → `src/cinema/main.ts`：電影院選位（狀態共用材質、模擬訂位 API）
  - `product.html` → `src/product/`：商品 3D 展示（GLTF + meshopt、KHR_materials_variants、按需渲染、RWD）
  - `diorama.html` → `src/diorama/`：3D 店面導覽（程式產生場景、後製、日夜 / 雨、熱點故事）
  - `house.html` → `src/house/`：diorama 的獨立改造版（雞排底座、狸貓）
  - `web.html` → `src/web/`：互動粒子網頁（捲動變形、滑鼠推開、點擊漣漪、作品入口）
  - `lights.html` → `src/lights/`：燈光互動網頁（五種光源、捲動切換、滑鼠控制、點擊換色）
  - `drive.html` → `src/drive/`：開車逛小島（cannon-es 車輛物理、可撞物件、作品區域）
  - `market.html` → `src/market/`：夜市燈光（霓虹、LED 燈條 + RectAreaLight、串燈、跑馬燈、控制台）
- 詳見 `docs/Architecture/README.md`

## OpenSpec Progress

- Current status: `add-cinema-seat-demo`、`add-product-viewer`、`add-shop-diorama`、`add-web-particles`、`add-night-market-lights`、`add-web-lights`、`add-drive-world` 已完成驗證，待封存
- Next step: 新功能先建立 proposal / design / tasks，實作完成後補 validation / engineering-evidence

## Open Questions (Fill as needed)

- 是否需要加入 lint（ESLint / Prettier）與測試（Vitest）？
- 是否導入 Vue 或其他 UI 框架？
- 部署目標（GitHub Pages / Vercel / GCP VM）？
