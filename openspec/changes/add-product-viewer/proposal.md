# Proposal

## 變更名稱

add-product-viewer — 商品 3D 展示器（可上線品質案例）

## 背景

前面的範例（方塊、電影院）著重單一觀念教學。需要一個接近真實電商商品頁、具上線品質的完整案例，涵蓋載入真實 3D 模型、PBR 呈現、效能與 RWD 等實務議題。

## 目標

建立 `product.html`：一雙鞋的 3D 商品頁，可旋轉檢視、切換配色、選尺寸、加入購物車（模擬）。

## 範圍

- 包含：
  - 模型：Khronos glTF Sample Assets 的 MaterialsVariantsShoe（© 2021 Shopify，CC BY 4.0），以 gltf-transform 壓縮（meshopt + WebP，7.83 MB → 1.82 MB），放 `public/models/shoe/`
  - 配色切換：讀取模型內建 `KHR_materials_variants`（模型內名稱為小寫 midnight / beach / street），網址 `?variant=` 可分享
  - 呈現：RoomEnvironment 環境反射、PBR Neutral tone mapping（商品色彩準確）、地面柔和陰影
  - 效能：按需渲染（畫面沒變就不重畫）、pixelRatio 上限、meshopt 解碼
  - UX：載入進度、載入失敗可重試、WebGL 不支援提示、自動旋轉（互動時暫停、閒置後恢復）、重設視角（平滑動畫）、全螢幕、RWD（桌機左右、手機上下）
  - 商品面板：配色、尺寸、價格、加入購物車（模擬，含未選尺寸提示）
  - 授權標示：頁面顯示模型出處與授權
- 不包含：
  - 不部署、不串接真實購物車 / 後端
  - 不修改方塊、電影院頁面

## 影響面

- 新增 `product.html`、`src/product/*`、`public/models/shoe/*`
- `vite.config.ts` 新增 product 頁面 input

## 風險與對策

- 模型授權：CC BY 4.0 需標示出處 → 頁面與 `public/models/shoe/README.md` 皆標示
- 模型檔大小：1.82 MB 首次載入需時間 → 顯示進度條；meshopt + WebP 壓縮
- GLTFLoader 不內建 variants 支援 → 自行解析 `KHR_materials_variants`（`parser.associations` + `parser.getDependency('material')`），並快取材質
- 行動裝置效能 → pixelRatio 上限 2、按需渲染、陰影貼圖 1024

## 驗證方式

- 功能：Playwright 操作配色切換、網址參數、尺寸、加入購物車、重設視角、自動旋轉、載入失敗重試
- 視覺：桌機與手機尺寸截圖、三種配色截圖
- 效能：靜止時不重畫（render 次數不增加）
- 回歸：`npm run build` 產出三個頁面

## 成功標準

- [x] 功能符合需求且行為正確
- [x] 畫面呈現符合預期（桌機 / 手機）
- [x] 無新增 console / WebGL error
- [x] `npm run build` 通過（含 tsc 型別檢查）
