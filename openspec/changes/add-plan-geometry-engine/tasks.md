# Tasks

## 1. 規格與設計確認

- [x] proposal／design 定稿（使用者 2026-11-11 指示開始 Phase 3）

## 2. 幾何產生器（純 Python）

- [x] `shapes.py`：MeshData、box、grid_slab（solid／niche／hole）、prism（ear clipping）、loft、lathe（含每段材質）、sweep、blob、topology_stats
- [x] `tests/test_shapes.py`：流形、退化面、grid_slab 的 niche／hole、開口碰到外緣要被拒絕

## 3. 零件庫（純 Python）

- [x] `components/__init__.py`：註冊表、BuildContext；`layout.py`：建模順序、局部座標、門窗開口、instance
- [x] `structure.py`、`openings.py`、`props.py`、`nature.py`：25 個 kind
- [x] 每個 builder 的流形、bounds、島數上限測試

## 4. Blender 端

- [x] `build/materials.py`：sRGB → linear、emissive、alpha、viewport 色；材質已存在時也會更新
- [x] `build/wobble.py`、`build/bevel.py`（material=-1、clamp_overlap）
- [x] `build/orchestrator.py`
- [x] `api.build_asset_from_plan`
- [x] 修正 `extrusion.extrude`：一次擠出多個面時，刪面後留下的孤立邊（加回歸測試）

## 5. Schema 與 plan

- [x] `params` 中的 `_material`／`_materials` 參照檢查；未實作的 kind 給 `KIND_NOT_IMPLEMENTED` 警告
- [x] 補齊 `test01_shop.plan.json` 的 params；依預覽比對修正窗框、櫥窗框、花槽的材質；新增不透明的 `niche_dark`

## 6. 建模、匯出與檢查

- [x] `scripts/build_from_plan.py`（建模、匯出、報告、`--render` 預覽，正面和參考圖逐像素對齊）
- [x] 建 test01_shop：全部通過驗證、預算內，匯出 `public/models/test01_shop/test01_shop.glb`
- [x] 建 tree_round（remesh 路徑），匯出 `public/models/tree_round/tree_round.glb`
- [x] 預覽圖和參考圖並排比較，修正造型問題（3 輪，見 validation.md）
- [x] `tests/test_build_plan.py`（Blender）、`tests/threejs_plan_check.mjs`

## 7. 交付

- [x] 全部測試、`npm run build`
- [x] 文件：README、WORKFLOW §3～5、Architecture、模型 README
- [x] `validation.md`、`docs/Engineering Evidence/plan-geometry-engine.md`
