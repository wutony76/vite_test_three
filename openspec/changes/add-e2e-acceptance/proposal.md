# Proposal

## 變更名稱

`add-e2e-acceptance` — Test A／Test B 端到端自動化驗收（Stylized Asset Pipeline Phase 8）

## 背景

各 Phase 都有自己的測試，但「原始需求的 Test A／Test B 驗收條件是否全部滿足」沒有一個地方能一次回答，每次都要人工翻報告。

## 目標

`python3 tools/blender/tests/e2e.py`：一條指令完成以下步驟。

1. 純 Python 測試（4 個檔案）。
2. headless Blender 測試套件。
3. Test A：建 test01_shop（含 Visual QA），匯出到暫存目錄。
4. Test B：組裝 sample_town，匯出到暫存目錄。
5. Three.js 檢查（資產、場景）。
6. 逐條判定原始需求的驗收條件，輸出 `e2e_report.json` 與文字摘要；任何一條不通過就以非 0 結束。

不寫進 `public/models`：e2e 不修改專案檔案。

## 驗收條件對照

| 原始需求 | 自動判定方式 |
|---|---|
| A 房屋主體、屋頂、地基、煙囪、門、窗戶、樑柱、屋瓦、燈具、裝飾品 | plan 中有對應 kind 的元件，而且建模後存在（煙囪已融合時，檢查目標的範圍含煙囪）；屋瓦 = 瓦楞雨棚或瓦列屋頂 |
| A 外型比例合理 | Visual QA 輪廓 IoU ≥ 0.85、元件位置 IoU ≥ 0.7 |
| A 結構完整 | 所有 Object 通過 profile、Geometry QA 沒有 fail |
| A 足夠的細節 | tertiary 元件 ≥ 8、三角面 ≥ 2000 |
| A 拓撲符合物件規格 | 每個 Object 的 profile 判定為 pass／warn |
| A 卡通遊戲風格材質 | atlas 材質 + vertex color；色差都 ≤ 30 |
| A GLB 可匯入 Three.js | threejs_plan_check 通過 |
| B 地形、道路、植物、裝飾物 | terrain、≥ 1 條道路、≥ 5 棵 instanced 樹、Props 群組非空 |
| B 多棟建築 | ≥ 4 棟、≥ 2 種資產 |
| B 場景燈光 | manifest 有 sun 與至少一種環境光 |
| B 物件配置合理 | Scene QA pass |
| B 資產可以獨立管理 | 每棟建築有根節點，門可點擊（Three.js 檢查） |
| B 視覺一致性 | 所有建築都使用 atlas 材質與 vertex color |
| B 不會融合成單一 Mesh | 最大單一 mesh 的三角面 < 總數 40% |
| B 能夠匯出完整場景、Three.js 可載入 | GLB + manifest 存在；threejs_scene_check 通過 |

## 成功標準

- [ ] `e2e.py` 全部通過，exit 0
- [ ] 報告列出每一條驗收條件的實際數字
- [ ] 刻意破壞一條條件（例如把輪廓門檻設成 0.99），e2e 會失敗並指出是哪一條
