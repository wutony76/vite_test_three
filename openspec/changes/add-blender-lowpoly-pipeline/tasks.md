# Tasks

## 1. 規格與設計確認

- [x] 完成 proposal 定稿（範圍／風險／驗證方式）
- [x] 完成 design 定稿（模組／介面／profile／測試）

## 2. 基礎建設

- [x] 建立 `tools/blender/lowpoly_kit/` 骨架與 `tests/run.py`（headless 執行，失敗時 exit code 非 0）
- [x] `result.py`：統一回傳格式與錯誤碼
- [x] `backup.py`：備份、還原、`clear_backups`

## 3. Validation（MVP 第 1、2 項）

- [x] `checks.py`：Connected Components（合併前／後島數、每個島的 bbox）
- [x] `checks.py`：其餘 8 項檢查
- [x] `profiles.py`：6 個 profile
- [x] `report.py` + `api.validate_mesh_topology`
- [x] 測試：Join 的 cube、重疊頂點、翻轉的面、開放平面、退化面
- [x] 測試：匯入 `project_room.glb`，`Roof` 回報 18 個島

## 4. 建模（MVP 第 3、4 項）

- [x] `mesh_builder.py` + `api.create_connected_mesh`
- [x] `extrusion.py` + `api.extrude_mesh_region`（extrude／inset／bridge）
- [x] 測試：L 形 prism、inset + extrude 開窗洞

## 5. Boolean 與修復（MVP 第 5、6 項）

- [x] `repair.py` + `api.repair_mesh_topology`（含 dry_run）
- [x] `boolean_engine.py` + `api.boolean_union_objects`（MANIFOLD → EXACT 退回、面數上限）
- [x] 測試：重疊 Union、不重疊 Union、失敗時還原
- [x] `lowpoly.py` + `api.optimize_lowpoly_mesh`
- [x] `remesh_engine.py`（只允許 organic）

## 6. 匯出與小屋（Phase 4）

- [x] `export/gltf_export.py` + `api.prepare_for_gltf`
- [x] `presets/building.py`：地基、主體、屋頂、煙囪、門、窗
- [x] 在使用者的 Blender 建出小屋（新場景 `LowpolyKit_House`），`look` 截圖確認外觀
- [x] 匯出 GLB，用驗證器與 GLB 分析腳本再驗一次
- [x] Three.js 載入，確認 Raycaster 點得到子物件

## 7. 交付檢查

- [x] 全部 headless 測試通過
- [x] `npm run build` 通過
- [x] 更新 `docs/Architecture/README.md`（新增 `tools/blender/`）
- [x] 更新記憶中的 Blender 建模流程，改為呼叫 `lowpoly_kit`
- [x] 補上 validation.md 與 `docs/Engineering Evidence/blender-lowpoly-pipeline.md`
