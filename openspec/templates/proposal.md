# Proposal

## 變更名稱

（請填入 change id / 簡短標題）

## 背景

（描述目前問題、觸發情境、為什麼現在要做）

## 目標

（此變更要解決的核心問題與預期成果）

## 範圍

- 包含：
  - （例：新增 `src/scene/...` 場景物件）
  - （例：新增 `src/core/...` 控制模組）
- 不包含：
  - （例：不處理 asset 壓縮流程）

## 影響面

- 場景 / 物件（`src/scene/`）：
- 核心模組（renderer / camera / loop，`src/core/`）：
- 互動 / 輸入（`src/interaction/`）：
- 資源（`public/` 模型、貼圖、HDR）：
- 樣式（`src/styles/`）：

## 風險與對策

- 技術風險：
  - 風險：
  - 對策：
- 效能風險（FPS、draw call、記憶體）：
  - 風險：
  - 對策：

## 驗證方式

- 功能驗證：
  - （列出手動測試步驟）
- 視覺驗證：
  - （截圖比對重點）
- 效能驗證：
  - （FPS / draw calls / geometries / textures 數量）
- 回歸驗證：
  - （列出既有場景與互動檢查項目）

## 成功標準

- [ ] 功能符合需求且行為正確
- [ ] 畫面呈現符合預期
- [ ] 無新增 console / WebGL error 或 warning
- [ ] `npm run build` 通過（含 tsc 型別檢查）
