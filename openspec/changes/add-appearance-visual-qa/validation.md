# Validation

## 驗證範圍

- 對應變更：`add-appearance-visual-qa`（Phase 5）
- 驗證環境：Blender 5.2.3 LTS（headless 與使用者開啟中的 Blender）、Python 3.10 + numpy 1.26、Node 22 + three 0.186

## 功能驗證

- [x] primitive ≤ 32；glTF 有 baseColorTexture、metallicRoughnessTexture、COLOR_0
  - 實際結果：Blender 30 個、glTF 29 個（原本 40／36）
  - 材質從 14 個變成 3 個（atlas、atlas_emissive、glass）
  - emissive 材質帶 emissiveTexture；28～29 個 primitive 全部有 COLOR_0；sampler magFilter = 9728（NEAREST）
- [x] `preset="preview"` 仍然是 flat：`test_preview_preset_stays_flat`
- [x] Visual QA：輪廓 IoU ≥ 0.85、元件位置 IoU 平均 ≥ 0.7，並輸出疊圖
  - 實際結果：輪廓 IoU 0.9866、元件位置 IoU 平均 0.8608、status pass
  - 11 種色票的 ΔE 都 ≤ 11.3
- [x] Visual QA 不改變場景設定
  - 實際結果：`test_visual_qa_passes_and_restores_scene` 驗證解析度、引擎、hide_render、暫時物件都已還原
  - 在使用者的 Blender 中執行後，作用物件與模式不變
- [x] 既有測試全部通過
  - headless `128 passed, 0 failed`
  - 純 Python：schema、shapes、visual_metrics 都 OK
  - Three.js：plan 檢查 11 項、舊小屋檢查都 ALL PASS
  - `npm run build` exit 0

## Visual QA 的迭代

| 輪次 | 輪廓 IoU | 位置 IoU 平均 | 發現 | 修正 |
|---|---|---|---|---|
| 1 | 0.987 | 0.821 | 門口盆栽 0.31、右盆栽 0.47、壁燈 0.36；壓頂 ΔE 45、門玻璃 ΔE 78 | — |
| 2 | 0.987 | 0.854 | 右盆栽 0.47 | 壓頂取樣框修正；門玻璃凹槽改深色；instance 加形狀檢查；壁燈支架加長 |
| 3 | 0.987 | 0.861 | 沒有警告（pass） | 盆栽葉團往外分散，填滿 bounds |

## AI 評語（不影響判定）

- 輪廓疊圖幾乎全綠。上方的藍塊是推測的煙囪（Test A 要求），邊緣的細藍線是壓頂外凸與 wobble。
- 門玻璃、二樓窗玻璃變成深色，和原圖一致；壓頂、雨遮、橫樑是紅褐色。
- 剩下的差距都是細節層級：
  - 磚面沒有磚紋：可考慮 tile_array 或貼圖
  - 海報是色塊
  - 黑板正面是灰板
  - 植物偏塊狀
  - 要調整時改 plan 的 params 或 builder，不是改模型
- Workbench 的 TEXTURE 預覽不顯示 vertex color，明暗起伏要在 Three.js 或 EEVEE 才看得到；GLB 的 COLOR_0 已用測試確認。

## 問題與修正紀錄

- 問題：Phase 2 的壓頂取樣框落在紙上（原圖的壓頂是傾斜的細線）
  - 發現方式：Visual QA ΔE 45
  - 修正：取樣框改為 y 0.051～0.058，壓頂顏色改為 `#935843`
- 問題：門玻璃後面的凹槽底面用了門的顏色
  - 發現方式：ΔE 78
  - 修正：新增 `glass_niche_material`，改用 niche_dark
- 問題：形狀差很多的盆栽共用 mesh，等比縮放後位置跑掉
  - 修正：instance 加入寬高比、深高比的相似度檢查（差 30% 以內）
- 問題：Node 的 GLTFLoader 解碼貼圖時需要瀏覽器 API，直接崩潰
  - 修正：檢查腳本註冊 plugin 接手 loadTexture，照樣套用 sampler 設定
- 3 個舊測試因規格變更而過時：
  - 材質合併成 atlas
  - 門口盆栽改成獨立 mesh
  - 只檢查根節點底下的物件（排除已融合的煙囪原件）

## 結論

- 是否通過：**通過**
- 已知限制：
  - minFilter 是 NEAREST_MIPMAP_NEAREST，縮小到 1/16 以下時相鄰色格會混色，對遠景影響很小
  - Visual QA 只支援正面正交的參考圖
  - GLB 從 255 KB 增加到 453 KB，因為多了 UV 與 vertex color；Phase 7 的 meshopt 可以壓縮
