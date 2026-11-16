# Validation

## 驗證範圍

- 對應變更：`add-style-grade` — world 畫面風格統一
- 驗證環境：本機 Vite dev server（http://localhost:5173/world.html）；headless Chromium（chrome-headless-shell 1254，SwiftShader 軟體渲染），1400×900 與 1920×960

## 功能驗證

- [x] 開啟後陰影統一偏淡紫、整體微微偏粉，A 類（寫實貼圖）房子對比降低 — 實際結果：洗衣店、台灣廳舍深色牆面轉為柔和偏紫，貼圖髒舊對比明顯變淡（見截圖）
- [x] 取消「啟用」後畫面回原貌，不需重新整理 — 實際結果：開關只改 uniform，同一頁面切換立即生效，關閉畫面與原貌一致
- [x] 番茄醬、荷包蛋太陽外觀不變 — 實際結果：番茄醬繞圈與光澤正常（既有 onBeforeCompile 有正確串接）、太陽未調色
- [x] 調色材質統計 — 實際結果：約 480 個材質注入，其中 47 個為寫實貼圖（LINEAR 取樣）套用降對比；NEAREST 色塊表（Gamehall、布丁、烤雞、test01_shop）未降對比

## 視覺驗證

- 截圖：`docs/Engineering Evidence/assets/style-grade-compare.png`（左：關閉、右：開啟）、`style-grade-houses.png`（寫實房子特寫）
- 結果：整體色調更接近粉嫩天空，A 類房子不再像照片貼在場景裡；草地、番茄醬飽和度保持

## 效能驗證

- shader program 數：開啟後約 90 個（每種材質組合多一份注入版本，只在首次出現時編譯一次）
- 每幀額外成本：無（scan 為每 0.5 秒一次 traverse；調整只改 uniform）

## 回歸驗證

- 番茄醬繞圈動畫（自有 onBeforeCompile）：正常
- 發光物件（`toneMapped: false`：篝火火焰、燈、閃電）：依排除規則不調色（程式規則確認；本次截圖鏡頭未拍到篝火）
- 浮空小星球（`floating_island` 排除）：維持自己的遠景霧化（本次 1400×900 鏡頭內不可見，依排除規則確認）
- console：無新增 error；僅既有的 `KHR_parallel_shader_compile extension not supported`（SwiftShader 環境、既有 compileAsync 造成，與本變更無關）

## 問題與修正紀錄

- 問題：初版整個畫面像蒙一層牛奶
  - 發現方式：開／關截圖對照
  - 修正方式：shader 內是「線性空間」亮度，暗部門檻 0.5 幾乎涵蓋全部顏色 → 改 0.12；降對比中間亮度 0.25 → 0.12；色調強度 0.08 → 0.04
  - 是否已重新驗證：是
- 問題：寫實貼圖降對比統計為 0、沒套上
  - 發現方式：面板「已調色材質」顯示寫實貼圖 0；以洋紅色染色確認畫面上的房子就是洗衣店材質
  - 修正方式：是否為寫實貼圖改在「編譯當下」判斷（map 可能晚於材質建立才設上，設上時 three.js 會重新編譯）；SwiftShader 首次編譯很慢，截圖需等到約第 60 幀之後
  - 是否已重新驗證：是（47 個材質套用、soft program 4 種）
- 問題：包裝 onBeforeCompile 後，three.js 預設 cache key（onBeforeCompile 原始碼）所有材質都一樣
  - 修正方式：包裝前先記下原本的 key（預設時取原 hook 的原始碼），再接上 `|styleGrade:v1[:soft]`
  - 是否已重新驗證：是（番茄醬正常）

## 結論

- 是否通過：是
- 已知限制或風險：降對比只認「LINEAR 取樣的 map」；日後若寫實模型改用 NEAREST 或沒有 map，就不會被降對比
- 後續追蹤事項：數值可由面板再微調後用「印出設定」貼回；第 3 項（用 Blender 流程重做 A 類房子）另案

## 使用者定稿數值（2026-11-16）

- 使用者在面板調整後定稿：`tintAmount 0.01`、`tintColor #f6cfe3`、`shadowLift 0.12`、`shadowColor #9b86d6`、`textureSaturation 1`、`textureContrast 1`、`texturePivot 0.12`
- 寫實貼圖飽和度／對比皆為 1 → 第 2 項「寫實貼圖降對比」實際上不改變畫面（注入仍在，可隨時從面板調低啟用）；目前效果以「陰影統一抬成淡紫」為主
