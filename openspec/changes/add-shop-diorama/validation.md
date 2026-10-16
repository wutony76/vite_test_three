# Validation

## 驗證範圍

- 對應變更：add-shop-diorama
- 驗證環境：本機 Vite dev（5173）與 `vite preview`（4173）；Playwright 1.62.1 Chromium（`--use-angle=metal`，Apple M2）；桌機 1280×800、手機 390×844（touch, DPR 2）

## 功能驗證

- [x] 開場搭建動畫完成後工具列啟用、操作提示顯示；第一次操作後提示淡出
- [x] hover 機車 → 標籤「老闆的復古機車」、外框 1 個物件、游標 pointer
- [x] 點擊 → 介紹卡「06 / 12 老闆的復古機車」、網址 `#scooter`、相機飛離預設視角
- [x] 下一個 / 上一個 → 07 生豆麻袋 / 06 機車
- [x] Esc → 關閉介紹卡、清除網址 hash
- [x] 導覽清單 12 項；點「店貓」→ 介紹卡、清單關閉、兩隻貓都有外框
- [x] 清單與卡片同時開啟時，Esc 只關清單
- [x] 回到預設視角 → 相機與預設位置距離 0、卡片關閉
- [x] 點天空不開卡片；從店面拖曳旋轉不開卡片
- [x] 日夜切換 → `is-day`、按鈕標籤「切換夜晚」、nightness 0
- [x] 下雨 → aria-pressed true、雨量 1；環境音開關正常
- [x] 深層連結 `#cats` / 正式版 `#tank` → 搭好後自動開啟對應卡片
- [x] 手機點擊霓虹杯 → 介紹卡；無水平捲動
- [x] prefers-reduced-motion → 230ms 內就緒（略過動畫）
- [x] 正式 build：除錯 hook 不存在、console 無訊息

## 視覺驗證

- 夜晚：霓虹 / 串燈 / 櫥窗 Bloom、路燈光圈、紫藍夜空與遠山霧化
- 白天：藍天、陽光陰影、霓虹與招牌變暗
- 雨夜：雨絲、天空變灰、霧變濃
- 手機：工具列移至底部、介紹卡在工具列上方、物件出現在畫面上半部

## 效能驗證

- Apple M2：60 FPS（瀏覽器上限）；陰影按需更新前為 43 FPS
- 159 geometries、25 textures、22 shader programs；無外部資源，頁面 JS 70 KB（gzip 22 KB）+ 共用 three.js

## 回歸驗證

- `npm run build`：tsc 通過，產出 index / cinema / product / diorama 四頁
- 其他頁面未修改（僅 `vite.config.ts` 新增 input）

## 問題與修正紀錄

- `group()` 無子物件時 `add()` 不帶參數 → Three.js 報 13 次 "object not an instance of THREE.Object3D"；改為有子物件才 add
- 周圍過暗看不到天空與遠山 → 霧距改為 26~150、地面調亮、相機拉近
- 開場動畫在低 FPS（SwiftShader 7 FPS）下拖很久 → 改用 performance.now 計時
- 陰影每幀重畫 → `shadowMap.autoUpdate = false` + 需要時更新（43 → 60 FPS）
- 煙囪與霓虹杯在預設視角重疊 → 煙囪移至屋頂左前角
- 白天標題白字不易讀 → `.is-day` 改深色字
- 選取物體被 Bloom 暈成一團白 → Outline 移到 Bloom 之後、降低 edgeStrength
- 手機飛行取景太近 → 依水平 / 垂直較窄視角計算距離，直式螢幕視線下移避開卡片

## 結論

- 是否通過：是
- 已知限制或風險：SwiftShader 等無 GPU 環境僅約 7 FPS；全螢幕在 iPhone Safari 不支援（toast 提示）
- 後續追蹤事項：低階裝置可偵測 FPS 自動關閉 Bloom / 陰影；可加入夜間車流等動態元素
