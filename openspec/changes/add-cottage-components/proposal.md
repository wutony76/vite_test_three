# Proposal

## 變更名稱

`add-cottage-components` — 第二種建築（test02 童話石屋）與 9 個新零件 builder（Phase 6 前置）

## 背景

- Test B（小鎮）要求至少 2 種建築造型，目前只有 test01 店面。
- 使用者 2026-11-11 提供第二張參考圖 `tools/img/test02.jpg`：白灰泥塔樓、四坡瓦頂、石堆基座、人字頂門廊。
- 零件庫目前沒有這張圖需要的 9 個 kind：`roof_hip`、`roof_gable`、`gable_trim`、`pipe`、`lantern`、`bucket`、`crate`、`rock_pile`、`bush`。

## 目標

1. 依 WORKFLOW 完成 test02 的 ReferenceSpec 與 AssetPlan（已完成，等使用者確認）。
2. 新增 9 個 builder，全部用連續拓撲建模：
   - **屋瓦**用屋頂表面的「階梯狀瓦列」（courses）表現：每一列的下緣往外凸出一點，屋頂仍然是 1 個封閉幾何島，不逐片建模。
   - **四坡屋頂、人字屋頂**是實心或厚殼的封閉體，煙囪可以 Union 進去。
   - **石堆、灌木**是多個低面數石塊或葉團，島數 ≤ 8，在 decoration／vegetation profile 的上限內。
3. 建出 test02_cottage，通過拓撲、Geometry QA、Visual QA，匯出 GLB。

## 範圍

- 包含：
  - `components/roofs.py`（roof_hip、roof_gable、gable_trim）
  - `components/props.py` 擴充（pipe、lantern、bucket、crate）
  - `components/nature.py` 擴充（rock_pile、bush）
  - `pipeline/vocab.py`：新增 kind 名稱（已完成）
  - plans：`test02.reference.json`、`test02_cottage.plan.json`（已完成）
  - 測試：每個新 builder 的流形、島數、bounds；Blender 端建模與 QA
- 不包含：
  - 波浪狀屋脊（交給 wobble 的手繪偏移）
  - 屋瓦逐片建模（tile_array）
  - 非正面視角的相機估計：test02 帶俯角，以正面正交近似

## 風險與對策

- 風險：圖片帶俯角，Visual QA 的輪廓 IoU 會比 test01 低
  - 對策：view 的 confidence 標為 0.5；先以 pass 門檻（0.85）建模，不到門檻時在報告中說明差異來源，不調整門檻來迎合結果
- 風險：煙囪 Union 進斜屋頂時，底部沒有完整埋入
  - 對策：plan 依屋頂斜率算出可埋入的高度（8.1 m），Geometry QA 會再檢查
- 風險：門廊牆角穿出人字屋頂
  - 對策：牆高 4.0 m，介於門頂和屋頂外緣之間（已在 plan 的 assumption 中說明）

## 驗證方式

- 純 Python：9 個 builder 的流形、島數上限、bounds
- Blender：test02_cottage 所有 Object 通過 profile；Geometry QA 沒有 fail；預算內
- Visual QA：輪廓 IoU、元件位置 IoU、色差，並附 AI 評語
- Three.js：`threejs_plan_check.mjs`
- 回歸：既有測試、`npm run build`

## 成功標準

- [ ] 9 個新 builder 都輸出封閉流形，島數在 profile 上限內
- [ ] test02_cottage 建模成功，三角面 ≤ 6000、primitive ≤ 32
- [ ] Geometry QA 沒有 fail；Visual QA 有數字與疊圖
- [ ] GLB 通過 Three.js 檢查
- [ ] 既有測試全部通過
