# Validation

## 驗證範圍

- 對應變更：`add-e2e-acceptance`（Phase 8）
- 驗證環境：Blender 5.2.3 LTS headless、Python 3.10、Node + three 0.186

## 功能驗證

- [x] `python3 tools/blender/tests/e2e.py` 全部通過、exit 0（約 1 分鐘）
  - 純 Python 4 個測試檔 OK；headless 147 passed
  - Test A 建模與 QA 匯出 2.5 s；Test B 組裝與匯出 1.9 s
  - threejs_plan_check、threejs_scene_check 通過
  - **驗收條件 19/19**
- [x] 報告列出每條條件的實際數字，例如：
  - A：輪廓 IoU 0.9866、元件位置 IoU 0.8608、tertiary 12、三角面 4848、最大 ΔE 11.3
  - B：4 棟／2 種造型、8 棵樹、Props 6 個、燈光 sun＋hemisphere、Scene QA pass、55 個 mesh 中最大的佔 33%
- [x] 自我檢查：`--skip-units --silhouette 0.99`
  - 結果：`[A] 外型比例合理` FAIL（0.9866 < 0.99），18/19，exit 1
- [x] e2e 不修改 repo：`public/models` 的檔案時間早於 e2e 執行時間，輸出都在暫存目錄

## 驗收條件對照（原始需求 → 判定方式 → 實測）

| 測試 | 條件 | 判定 | 實測 |
|---|---|---|---|
| A | 必要部件 | 對應 kind 都已建出 | 缺少：無 |
| A | 外型比例合理 | 輪廓 IoU ≥ 0.85、位置 IoU ≥ 0.7 | 0.9866、0.8608 |
| A | 結構完整 | 沒有 fail、Geometry QA 不是 fail | 26 個 Object、pass |
| A | 足夠的細節 | tertiary ≥ 8、三角面 ≥ 2000 | 12、4848 |
| A | 拓撲符合物件規格 | 全部 pass／warn | 25 pass、1 warn |
| A | 卡通遊戲風格材質 | palette_vc、ΔE ≤ 30 | palette_vc、11.3 |
| A | GLB 可以匯入 Three.js | Three.js 檢查 | 通過 |
| B | 地形、道路 | 節點存在 | terrain、2 條 |
| B | 多棟建築 | ≥ 4 棟、≥ 2 種 | 4 棟、2 種 |
| B | 植物、裝飾物 | ≥ 5 棵 instanced 樹、Props 非空 | 8、6 |
| B | 場景燈光 | sun + 環境光 | sun、hemisphere |
| B | 配置合理 | Scene QA pass | pass |
| B | 資產獨立管理 | 每棟有根節點與可點擊的門 | 4／4 |
| B | 視覺一致性 | 建築都用 atlas 材質 | 是 |
| B | 不會融合成單一 mesh | 最大 mesh < 40% | 33%（地形） |
| B | 匯出完整、Three.js 可載入 | GLB + manifest、場景檢查 | 通過 |

## 結論

- 是否通過：**通過**
- 已知限制：
  - 「卡通風格」「視覺一致性」只能用可量測的代理指標（atlas、vertex color、色差）判定；美感仍需人工或 AI 看預覽圖
  - e2e 依賴本機的 Blender 與 Node
