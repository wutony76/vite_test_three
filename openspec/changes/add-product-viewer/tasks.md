# Tasks

## 1. 規格與設計確認

- [x] 完成 proposal 定稿
- [x] 完成 design 定稿

## 2. 資源

- [x] 下載 MaterialsVariantsShoe 並以 gltf-transform 壓縮
- [x] 放置於 `public/models/shoe/`，附授權說明

## 3. 檢視器與載入

- [x] `ProductViewer`：renderer / 環境 / 陰影 / controls / 按需渲染 / resize / 重設視角 / 全螢幕 / dispose
- [x] `loadProduct`：MeshoptDecoder、進度、variants 解析與套用
- [x] 模型置中與自動取景

## 4. 頁面與 UI

- [x] `product.html` 與 `style.scss`（RWD）
- [x] 載入 / 錯誤 / WebGL 不支援狀態
- [x] 配色、尺寸、價格、加入購物車、toast
- [x] `vite.config.ts` 新增 product 頁

## 5. 驗證與交付

- [x] `npm run build` 通過
- [x] Playwright 功能驗證、桌機與手機截圖
- [x] validation.md、`docs/Engineering Evidence/product-viewer.md`、更新 `docs/Architecture/README.md`
