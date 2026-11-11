# Validation

## 驗證範圍

- 對應變更：`add-scene-assembly`（Phase 6）
- 驗證環境：Blender 5.2.3 LTS headless、Python 3.10、Node + three 0.186

## 功能驗證

- [x] sample_town：4 棟建築（2 種造型）、8 棵 instanced 樹、地形、2 條道路；Scene QA pass
- [x] 三角面 24,648（每個複本都計算，GLB 共用 mesh 後 13,444）≤ 150,000；draw call 估計 105，Three.js 實測 103 ≤ 150
- [x] Three.js（`threejs_scene_check.mjs` 17 項 ALL PASS）：
  - 根節點與 5 個群組正確
  - 4 棟建築各有根節點，門可點擊，移動門不影響牆
  - 樹是 InstancedMesh（樹幹、樹冠各 8 個 instance）
  - 射線打得到地形
- [x] 違規擺放會被抓到：`test_building_on_road_is_caught`、`test_overlap_and_out_of_terrain_are_caught`、`test_tree_inside_building_is_caught`
- [x] 既有測試全部通過：headless `147 passed, 0 failed`；純 Python 4 個測試檔 OK；資產 GLB 沒有任何位元組變化；`npm run build` exit 0

## 視覺驗證

俯視與 3/4 預覽（session scratchpad）：
- 建築都面向道路
- 建築與道路周圍的地面整平，平滑過渡到丘陵
- 樹分散在道路與建築之外

## 問題與修正紀錄

- 問題：場景重建第二次時一個物件都沒有
  - 原因：資產庫 collection 被隱藏後，重建資產時物件不會被 depsgraph 計算，煙囪 Boolean 失敗
  - 這也會影響「場景建好後單獨重建資產」
  - 修正：orchestrator 建模前一律恢復 collection 可見
  - 測試：`test_rebuild_has_no_duplicates`
- 預期內的行為：exporter 的 gpu instancing 也把店面裡共用 mesh 的兩個盆栽合併成 InstancedMesh（count 2）。盆栽不可點擊，可點擊元件仍是獨立節點（Three.js 檢查已確認）。
- 規格更正：Scene QA 整合在 `build_scene_from_plan`，不另外提供 `validate_scene`。

## 結論

- 是否通過：**通過**
- 已知限制：
  - Workbench 預覽的地形看起來有格狀色塊（cavity 加棚燈）
  - 小鎮目前沒有 Props（街燈、圍籬）
  - 建築彼此的距離只檢查不重疊，沒有最小間距規則
