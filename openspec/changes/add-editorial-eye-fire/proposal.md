# Proposal

## 變更名稱

add-editorial-eye-fire：Editorial Portrait 停留噴火、燒穿照片（含眼睛對位修正）

## 背景

- 使用者回報「眼睛移動的位置沒有對準」：manifest 的眼心座標落在眼睛下方，且整塊眼睛（含眼白、遮罩）一起移動，像貼紙在滑。
- 接著要求：滑鼠停留超過 3 秒，從眼睛射出火焰，滑鼠位置開始有火焰燒掉的效果。

## 目標

- 虹膜準確對位，且只在固定的眼眶內移動。
- 停留 3 秒觸發噴火，落點在照片上燒出逐漸擴大的洞。

## 範圍

- 包含：
  - `tools/bakePortraitLayers.ts` 重寫分層（虹膜層、固定眼眶遮罩、底圖眼白填色）
  - `src/editorial/` 新增 `burn.ts`（燒痕）、`eyeFire.ts`（噴火粒子），改 shader、`EditorialPortrait`、`main.ts`
- 不包含：
  - 燒痕不做持久化（重新整理即還原）
  - 不處理手機觸控長按（觸控沒有「停留」概念）

## 影響面

- 場景 / 物件：底圖與眼睛層改自訂 ShaderMaterial；新增一組 Points
- 互動 / 輸入：pointermove 停留計時、dblclick 還原
- 資源：`public/images/portrait/` 全部重新烘焙，manifest 升為 version 2（像素座標）

## 風險與對策

- 技術風險：燒穿後眼睛層浮在洞上 → 底圖與眼睛層共用同一份燒痕 uniforms，一起 discard。
- 效能風險：粒子 CPU 更新 → 上限 3000 顆、單一 draw call，環狀覆寫不配置記憶體。

## 驗證方式

- 功能：headless Chromium 停留 1.5s / 2.7s / 3.6s / 6s / 12s、移開、雙擊截圖；中途 2px 抖動不重設計時。
- 視覺：眼睛對位疊圖、各狀態截圖。
- 回歸：滑鼠跟隨眼神、console 無錯誤、`npm run build`。

## 成功標準

- [x] 功能符合需求且行為正確
- [x] 畫面呈現符合預期
- [x] 無新增 console / WebGL error 或 warning
- [x] `npm run build` 通過（含 tsc 型別檢查）
