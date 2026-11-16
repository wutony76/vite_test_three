# Proposal

## 變更名稱

`add-style-grade` — world 場景畫面風格統一（全場色調統一＋寫實貼圖降對比）

## 背景

world 場景混了三種素材風格：
- A. 寫實貼圖（LINEAR 取樣、多張照片風格貼圖）：洗衣店 laundry、台灣廳舍 twhall、南瓜屋、部分食物
- B. 色塊表貼圖（NEAREST 取樣）：Gamehall、布丁、烤雞、烤玉米
- C. 純色／漸層（程式產生或頂點色）：小豬、浮空小星球、雲、篝火

天空、彩虹、浮空小星球定下「粉嫩夢幻」的基調，A 類的髒舊寫實細節最突兀；
各物件的陰影色（灰／黑／棕）也不一致，是整體不協調最主要的來源。

## 目標

1. **全場色調統一**：所有受光物件的最終顏色往同一個粉色輕微靠攏，暗部統一往淡紫色抬亮。
2. **寫實貼圖降對比**：只針對 A 類（LINEAR 取樣的 map），降低貼圖的飽和度與對比，讓照片感變成插畫上色感。
3. 兩者都可從面板即時開關與調整，且能一鍵關閉看原貌。

## 範圍

- 包含：
  - 新增 `src/world/styleGrade.ts`：以 `onBeforeCompile` 在內建材質 shader 尾端注入調色，共用 uniform 即時調整
  - `src/world/main.ts`：建立 style grade、掛到場景、加「畫面風格統一」面板
- 不包含：
  - 不改任何 GLB／貼圖檔、不重做模型（第 3 項 Blender 重做另案）
  - 不處理 ShaderMaterial（番茄醬以外的自訂 shader、彩虹、背景）
  - 浮空小星球（已有自己的遠景霧化）、荷包蛋太陽、`toneMapped: false` 的發光物件（火焰、燈、閃電）不調色

## 影響面

- 場景 / 物件：所有 `MeshStandardMaterial` / `MeshPhysicalMaterial` / `MeshLambertMaterial` / `MeshPhongMaterial` / `MeshBasicMaterial` 的最終輸出顏色
- 核心模組：無（不改 renderer / camera / loop 設定）
- 互動 / 輸入：新增 GUI 資料夾
- 資源：無

## 風險與對策

- 技術風險：
  - 風險：覆寫既有 `onBeforeCompile`（番茄醬已使用）會讓原本效果消失
  - 對策：包裝成「先跑原本的 hook 再注入」，並串接 `customProgramCacheKey`
  - 風險：模型是非同步載入，載入後的新材質沒被套到
  - 對策：每 0.5 秒掃描場景，新材質才處理（WeakSet 記錄已處理）
  - 風險：程式在執行期改 `material.color`（小豬、檸檬等面板）會蓋掉調色
  - 對策：調色做在 shader 最終輸出，不改 material.color，與這些程式互不干擾
- 效能風險：
  - 風險：第一次注入需重新編譯 shader，造成一次性卡頓
  - 對策：只在材質第一次被發現時編譯一次；開關與數值改 uniform，不再重新編譯

## 驗證方式

- 功能驗證：面板開關、各數值拖動即時生效；關閉後與還原點畫面一致
- 視覺驗證：同鏡頭、同時間點截圖前後對照（全景＋A 類房子特寫）
- 效能驗證：`renderer.info.programs` 數量與開啟前比較
- 回歸驗證：番茄醬繞圈動畫、小豬烏雲閃電、篝火火焰、浮空小星球霧化不受影響；console 無 error

## 成功標準

- [ ] 開啟後全場陰影色一致偏淡紫、整體往粉色靠，A 類房子的貼圖對比明顯降低
- [ ] 關閉「啟用」後畫面回到原貌（不需重新整理）
- [ ] 番茄醬、發光物件、浮空小星球、荷包蛋太陽外觀不變
- [ ] 無新增 console / WebGL error 或 warning
- [ ] `npm run build` 通過（含 tsc 型別檢查）
