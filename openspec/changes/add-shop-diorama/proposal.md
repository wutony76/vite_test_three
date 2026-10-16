# Proposal

## 變更名稱

add-shop-diorama — 3D 店面導覽（街角小店 Diorama）

## 背景

使用者希望參考 https://djdb.kr/#shop 的呈現方式：一間小店的 3D 微縮場景，可環顧、點物品看故事、切換日夜與天氣。該站標示 `tdm-reservation` / `noimageai`，因此只參考互動模式，不使用其任何模型、圖片、文字或程式碼。

## 目標

建立 `diorama.html`：原創的台灣巷口咖啡烘焙小店「巷口烘焙 ALLEY ROAST」3D 導覽頁，全部物件以程式產生（無外部資源）。

## 範圍

- 包含：
  - 場景：兩層樓店面（磚牆、店招、遮雨棚、櫥窗、二樓窗）、頂樓霓虹咖啡杯、水塔、煙囪、串燈；人行道、停車格、馬路、路燈、機車、生豆麻袋、桂花樹、黑板立牌、板凳、店貓、冷氣室外機；星空、月亮、遠山、天空漸層
  - 效果：Bloom 霓虹光暈、煙囪煙霧、雨滴粒子、霓虹偶爾閃爍、貓尾巴擺動、樹葉搖曳
  - 互動：滑鼠指向顯示標籤與外框（OutlinePass）、點擊顯示介紹卡並飛到物品、回到預設視角、導覽清單（鍵盤可用）、全螢幕
  - 切換：日 / 夜（平滑過渡）、下雨、環境音（Web Audio 程式產生，不需音檔）
  - 開場「搭建店面中… N%」逐件長出的動畫（尊重 prefers-reduced-motion）
- 不包含：
  - 不使用參考網站任何資產；不部署

## 影響面

- 新增 `diorama.html`、`src/diorama/**`；`vite.config.ts` 新增頁面

## 風險與對策

- 後製（Bloom + Outline）較耗效能 → pixelRatio 上限 1.5（後製時）、陰影只用一盞主光、重複物件用 InstancedMesh
- 物件數多 → 共用材質與 geometry；粒子用單一 Points / LineSegments
- 手機沒有 hover → 點擊直接顯示介紹卡；介紹卡改為底部滿版
- 瀏覽器自動播放限制 → 環境音只在使用者按下按鈕後才建立 AudioContext

## 驗證方式

- Playwright：開場動畫完成、hover 標籤、點擊介紹卡與飛行、清單選取、Esc 關閉、日夜 / 下雨 / 環境音切換、回首頁、手機版
- 截圖：夜晚、白天、下雨、手機
- `npm run build` 產出四個頁面

## 成功標準

- [x] 功能符合需求且行為正確
- [x] 畫面呈現符合預期（日 / 夜 / 雨 / 手機）
- [x] 無新增 console / WebGL error
- [x] `npm run build` 通過
