# Validation

## 驗證範圍

- 對應變更：add-blender-lowpoly-pipeline
- 驗證環境：macOS（Apple Silicon）；Blender 5.2.3 LTS（Python 3.13.13）背景模式 `--factory-startup`；使用者的 Blender（MCP for Blender 2.2.7 / addon 1.8）；Node 22.22.2 + three 0.186.1

## 功能驗證

依 proposal 的成功標準：

- [x] 幾何島檢查對 `project_room.glb` 的 `Roof` 回報 18 個島 — 實際：`Roof` 18、`Chimney` 8、`Walls_Main` 3（合併重複頂點後），與 Phase 1 的獨立腳本結果一致
- [x] 7 個函式都有 headless 測試，且全部通過 — 實際：`45 passed, 0 failed, 45 total`，exit code 0；找不到測試時 exit code 1
  - test_validation（13）：Join 的方塊 2 個島、貼齊但未合併（合併前 2／後 1、重複頂點 4）、單一方塊 pass、單面翻轉（flipped 1、不一致邊 4）、整個翻轉（flipped 6）、開放平面 `water_surface` pass／`building_shell` fail、退化面、孤立點、ngon 只警告、custom property profile、錯誤碼、project_room
  - test_modeling（11）：L 形 prism、建立時修正反向繞序、不合法索引、材質索引、extrude、individual extrude、inset_extrude 窗洞（6→14 面、封閉）、inset、bridge 把 2 個島接成 1 個、沒選到面時不修改、不合法 mode
  - test_boolean_repair（17）：重疊 Union（1 個島、封閉、B 移到備份 collection）、EXACT solver、不重疊 Union 還原、面數暴增還原、材質帶入、拒絕 self、repair 合併／修法線／刪退化與孤立／開放 Mesh 不動法線／dry_run、驗證失敗還原、clear_backups、optimize（細分方塊 → 8 頂點 6 面）、Remesh 拒絕建築／允許 organic
  - test_house_export（5）：小屋拓撲、GLB 匯出、不合格時不匯出、不改變使用者選取、glb_stats
- [x] 破壞性操作失敗時能還原，頂點數與原本一致 — 實際：`test_failed_validation_restores_original`（16 頂點、mesh 名稱不變、無殘留備份）、`test_union_non_overlapping_is_restored`、`test_union_face_explosion_is_restored`、`test_no_faces_selected_keeps_mesh`
- [x] 小屋：主體、屋頂、地基各 1 個島且封閉；門窗為獨立 Object；0 non-manifold；0 個法線反向的面 — 實際：Foundation／Body／Roof 各 1 個島、封閉；Door 與 4 扇窗皆為 `House_Root` 的子物件；全部 0 non-manifold、0 flipped
- [x] 小屋 GLB 有單一根節點，Three.js 可載入並以 Raycaster 點到子物件 — 實際：`threejs_check.mjs` 14 項全部通過（根節點 `House_Root`、8 個零件獨立、`userData.lowpoly_profile`、正面射線打到 `Door`、右側射線打到 `Window_SideR`、移動 Door 不影響 Body）
- [x] `npm run build` 通過 — 實際：exit code 0

## 視覺驗證

- 使用者的 Blender 新場景 `LowpolyKit_House`，`look` 四個角度（材質模式）：
  - 地基台階、煙囪口、門板內凹、窗框與玻璃內凹皆正確；Flat Shading 稜角清楚；屋頂與山牆密合
  - 原本的漢堡場景（`Scene`）沒有被修改

## 效能驗證

| 指標 | project_room.glb（舊） | lowpoly_house.glb（新） |
|---|---|---|
| Mesh | 21 | 8 |
| primitive（≈ draw call） | 71 | 13 |
| 三角面 | 約 6,400 | 236 |
| 每個 Mesh 的幾何島 | 3～41 | 全部 1 |
| 根節點 | 21 個（平鋪） | 1 個（`House_Root`） |
| 檔案大小 | 418 KB | 20 KB |

註：兩者造型複雜度不同（舊模型有陽台、燈籠、岩石底座等），數字用來說明拓撲與結構差異，不是同一個模型的前後比較。

## 回歸驗證

- `src/` 沒有任何修改；`npm run build` 通過
- `mcp-for-blender` 沒有修改；`get_addon_status` 正常
- `public/models/project_room/` 沒有修改（測試只讀取）

## 問題與修正紀錄

- 問題：GLB 匯出回報「沒有 GLB 格式」
  - 發現方式：`test_house_glb_export`
  - 修正方式：`export_format` 是動態 enum，背景模式讀到空清單；改為讀得到才檢查，讀不到直接使用 `"GLB"`
  - 是否已重新驗證：是
- 問題：材質帶入測試與 bridge 測試失敗
  - 發現方式：首次執行
  - 修正方式：測試本身錯誤（測試方塊沒有重疊；多做了一次深度 0 的 extrude 產生重複頂點），修正測試
  - 是否已重新驗證：是

## 結論

- 是否通過：是
- 已知限制或風險：
  - Boolean 交界處可能產生 ngon（小屋的 Roof 有 1 個），目前 `building_shell` 只提醒不擋；glTF 匯出時會自動三角化
  - `lowpoly_kit` 不是 MCP 正式工具，需要 AI 依流程主動載入（已寫入記憶）
  - 僅在 Blender 5.2 驗證；`MANIFOLD` solver 不存在的舊版本會改用 `EXACT`，未實測
- 後續追蹤事項：
  - 是否用 `lowpoly_kit` 重建 world 場景的 `project_room`（另開 change）
  - terrain／vegetation／props preset；Phase 5 全自動拆解流程
  - 介面穩定後評估包成獨立 MCP server
