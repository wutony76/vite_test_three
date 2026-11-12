# Validation

## 驗證範圍

- 對應變更：`add-texture-surface-engine` — Texture & Surface Detail Engine
- 驗證環境：macOS、Blender 5.2.3 LTS（背景模式、`--factory-startup`）、Python 3.10、Node 22.22.2、three 0.186.1、Google Chrome（headless，SwiftShader WebGL）
- 驗證日期：2026-11-12

## 功能驗證

依 proposal 的成功標準：

- [x] 升級後的資產 FLAT_RATIO ≤ 30% — test02_cottage 0.009、test01_shop 0.047（升級前接近 1.0）；crate_pile、grilled_corn 的元件都是貼圖材質
- [x] Texture QA 全部規則有測試；升級資產沒有 fail — 14 條規則各有反例（`tests/test_texture_qa.py`，13 個測試）；e2e 的 crate_pile／grilled_corn／test02_cottage／test01_shop 都是 pass
- [x] grilled_corn 沒有 orchestrator 特例、normal map 編碼正確、GLB 縮小 ≥ 50% — `corn_surface.py` 與特例已刪除，改為 `surface.pattern = corn_kernels` + fit UV；材質沒有 Bump 節點、改用 Normal Map；GLB 612 KB → 170 KB（−72%）
- [x] base color／emissive 是 sRGB、資料貼圖是 Non-Color；Three.js 端通過 — Blender 端 `COLOR_SPACE` 檢查；Node 端 `threejs_plan_check.mjs`；Chrome 實測 `map.colorSpace = srgb`、法線與粗糙度不是 sRGB
- [x] Test A／B 輪廓 IoU 不下降；既有測試全部通過 — test01_shop 輪廓 IoU 0.9866、元件 0.8608（升級前 0.987／0.861）；test02_cottage 0.9365／0.8886；headless 202/202
- [ ] `npm run build` 通過 — **Vite 打包通過；`tsc` 失敗於既有的 `src/world/objects/obj.ts:9` 未使用的 `GameHallLights` import**（本變更沒有修改 `src/`，問題存在於已 commit 的 977895a）

## 視覺驗證

- Visual QA 對照圖（Workbench 正面正交，和參考圖逐像素對齊）：
  - test01_shop：灰泥有水彩色斑、磚柱橫向磚紋、雨棚手繪色塊、招牌「LIME」、門上「OPEN」、牆上咖啡杯 decal
  - test02_cottage：橘色長方形屋瓦、淡灰斑灰泥、圓石 `rock` 圖樣、直向木門、石板台階、灌木葉片
- Visual QA v2 材質區域（test02，只 warn）：
  - roof_tiles：顏色相似度 0.52、細節密度比 1.06；週期比 0.64 是正面投影壓縮 50° 斜坡（0.14 m × cos 50° ≈ 0.09 m），不是貼圖錯
  - tower_plaster：相似度 0.24、細節 0.46；stone_pile：0.11／0.42；stone_steps：0.29／0.73 → 參考圖水彩筆觸比貼圖豐富，列為後續調整
- Three.js 實際渲染（Chrome headless、WebGL）：test02_cottage 在半球光＋日光下屋瓦、圓石、木門的法線與 AO 有效；中央像素非背景
- 3/4 預覽：crate_pile（木箱木板、木桶直向桶板、盆栽葉片）、grilled_corn（20 × 16 顆玉米粒、焦斑、竹籤木紋）

## 效能驗證

| 資產 | primitive | GPU 貼圖（未壓縮＋mipmap） | GLB 貼圖 PNG → WebP | GLB 檔案 |
|---|---|---|---|---|
| crate_pile | 5 | 4.0 MB | 410 KB → 105 KB | 28 KB → 145 KB（原本無貼圖） |
| grilled_corn | 3 | 5.4 MB | 688 KB → 142 KB | 612 KB → 170 KB |
| test01_shop | 43（預算 32 → 44） | 19.0 MB | 1,694 KB → 402 KB | 753 KB |
| test02_cottage | 26 | — | — → 552 KB | 854 KB |
| sample_town | draw call ≤ 200（預算 150 → 200） | 46.9 MB | — | 573 KB → 2.0 MB |

- 建模時間：crate 1.6 s、corn 1.5 s、cottage 7.1 s、shop 13.3 s（含 AO bake 1024 px、8 samples）
- 小鎮 GPU 貼圖 46.9 MB，遠低於 150 MB 的 KTX2 門檻；共用貼圖 59 張（同一設定在資產間共用）

## 回歸驗證

- headless 測試套件：202 passed, 0 failed（新增 44 個；6 個舊測試因規格變更而更新）
- e2e（`tests/e2e.py`）：驗收條件 34/34（Test A 7 條、Test B 13 條、新增 Test C 14 條）
- 純 Python：`test_surface_pure.py` 26 個（含本機 ComfyUI mock server、prepare_textures）
- Three.js（Node）：test01_shop、sample_town、crate_pile、grilled_corn、biolum_tree、test02_cottage 全部 ALL PASS
- 重新匯出 `public/models` 的 crate_pile、grilled_corn、biolum_tree、sample_town：Three.js 檢查全部通過；這些 GLB 目前沒有被任何頁面載入

## 問題與修正紀錄

- Blender 匯出器把 AO 與 ORM 合成一張圖（UV 空間不同、每個材質各存一份 AO）
  - 發現方式：GLB 只有 11 張圖（預期 12），讀 GLB JSON 發現 occlusion 與 metallicRoughness 同一個 index
  - 修正：AO 尺寸避開 ORM 尺寸；新增 `GLB_TEXTURE_EXPORT` 合併檢查
  - 已重新驗證：是
- mode_set 後持有舊的 `uv_layers` 參照 → Blender crash（spike 發現），改為每次重新取得
- AO 圖存檔後 filepath 被改回空字串，`pack()` 無來源 → `EXTERNAL_FILE_MISSING`；改為保留存檔路徑
- `derive_palette` 用 HLS → 白色灰泥的陰影變成飽和橘色；改用 HSV
- 磚柱（trim → along）的磚是直的；有重力方向的圖樣一律 planar
- 接縫指標用 95 百分位 → 邊界旁的木板縫被誤判；改用圖內最大相鄰差
- 招牌 decal 四角被凸起外框蓋住；改為 rect 內 5×5 點（含四角）取最外側深度
- 玉米用 hero tier 時 GPU 70 MB → `TEXTURE_BUDGET` 擋下；改 prop tier（5.4 MB）
- Node 端 GLTFLoader 的 `EXT_texture_webp` 外掛會 `new Image()` 崩潰；同名 stub 覆蓋
- headless Chrome 的 `--dump-dom` 用虛擬時間，大型 GLB 解析會被節流；改由頁面主動回傳結果

## 結論

- 是否通過：**有條件通過** — 所有成功標準達成；`npm run build` 的 `tsc` 錯誤是既有問題，不在本變更範圍
- 已知限制或風險：
  - 平鋪貼圖材質各佔 1 個 primitive：店面 32 → 43、小鎮 draw call 上升；遠景資產可用 `bake: full` 合併成 1 個材質
  - Decal 文字用 Blender 內建字型，只支援拉丁字母
  - ComfyUI provider 只用 mock server 驗證；尚未安裝真實的 ComfyUI 與模型
  - Visual QA v2 的材質區域指標顯示灰泥、石頭細節密度約為參考圖的一半
- 後續追蹤事項：
  - 依 `SURFACE_*` warn 調整灰泥／石頭的 palette 與 wear、dirt
  - 安裝本機 ComfyUI 後，以 `provider:comfyui` 實測一個材質
  - 場景 GPU 貼圖超過約 150 MB 時升級 KTX2
  - 修正 `src/world/objects/obj.ts` 未使用的 import（與本變更無關）
