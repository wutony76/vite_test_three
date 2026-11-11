# Tasks

## 1. 規劃

- [x] `test02.reference.json`：19 個元件、4 項推測、4 項不建模；疊圖校正 2 輪，色票從原圖取樣
- [x] `test02_cottage.plan.json`：21 個元件，以門高 1.8 m 換算
- [x] `vocab.py` 新增 `gable_trim`、`pipe`、`bucket`、`rock_pile`
- [x] 使用者確認 plan（2026-11-11）

## 2. 實作

- [x] `components/roofs.py`：roof_hip、roof_gable（垂直坡面的厚度、跨距短的坡減少瓦列）、gable_trim
- [x] `components/props.py`：pipe、lantern、bucket（吊繩）、crate；窗台高度改為參數
- [x] `components/nature.py`：rock_pile（下大上小、左右交錯）、bush
- [x] orchestrator：Boolean 融合後子元件改掛到目標；wobble 安全模式
- [x] 純 Python 拓撲測試

## 3. 建模與驗收

- [x] 建 test02_cottage：拓撲、Geometry QA、Visual QA、預算全部通過
- [x] 匯出 GLB、Three.js 檢查
- [x] Blender 端測試、完整回歸（131 passed）、`npm run build`
- [x] 文件：README、Architecture、模型 README、validation、Engineering Evidence
