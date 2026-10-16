# Engineering Evidence

## 變更摘要

- 對應變更：add-product-viewer — 商品 3D 展示器
- 變更檔案清單：
  - `product.html`（新增）
  - `src/product/main.ts`（新增：頁面流程、狀態、UI）
  - `src/product/ProductViewer.ts`（新增：可重用檢視器 class）
  - `src/product/loadProduct.ts`（新增：GLTF + meshopt 載入、KHR_materials_variants）
  - `src/product/products.ts`（新增：商品資料）
  - `src/product/style.scss`（新增）
  - `public/models/shoe/shoe.glb`、`public/models/shoe/README.md`（新增：壓縮後模型與授權說明）
  - `vite.config.ts`（新增 product 頁）
  - `openspec/changes/add-product-viewer/*`、`docs/Architecture/README.md`、`openspec/project.md`
- Commit / PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：通過
- 佐證：Playwright 腳本（dev 與 preview 兩種環境）輸出載入失敗重試、配色切換與取樣顏色、按需渲染幀數、自動旋轉暫停恢復、重設視角距離、購物車流程皆符合預期；console 無 error / warning；三頁 build 成功

## 風險與後續追蹤

- 已知風險：
  - 模型授權 CC BY 4.0，移除頁面上的出處標示即違反授權
  - 模型配色名稱大小寫與文件不一致，換模型時需確認實際名稱（已加 warn）
  - 貼圖 VRAM 首次約 67 MB、切過全部配色後最多約 112 MB，低階手機可能吃緊
- 後續追蹤事項：KTX2 貼圖、多商品清單頁、部署（GitHub Pages 需設定 `base`）

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` / `npm run preview` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/product-viewer.md`，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認後封存）
