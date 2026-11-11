# test01_shop

Test A：依 `tools/img/test01.jpg`（水彩窄店面）建立的 Low Poly 店面。

- 來源 plan：`tools/blender/plans/test01_shop.plan.json`
- 參考圖分析：`tools/blender/plans/test01.reference.json`
- 重新產生：

  ```bash
  Blender --background --factory-startup --python-exit-code 1 \
    --python tools/blender/scripts/build_from_plan.py -- tools/blender/plans/test01_shop.plan.json --export
  ```

- 根節點 `test01_shop_Root`；26 個 Object、25 個 mesh（pot_right 共用 pot_left 的 mesh；門口盆栽形狀差太多，獨立建模）
- 每個節點的 `userData`：`lpk_component`、`lpk_kind`、`lowpoly_profile`、`clickable`、`anim_group`、`instance_group`
- 可點擊：`door`、`awning`、`shop_window`；動畫群組 `lamp_glow`：壁燈、圓燈、路燈
- 檢查：`node tools/blender/tests/threejs_plan_check.mjs tools/blender/plans/test01_shop.plan.json`

## Phase 5 之後

- 材質：palette atlas（3 個材質：atlas、atlas_emissive、glass），貼圖使用 NEAREST 取樣；每個 primitive 都帶 `COLOR_0`（vertex color）
- 約 4,600 個三角面、29 個 glTF primitive（Three.js 約 30 次 draw call）
- Visual QA：輪廓 IoU 0.987、元件位置 IoU 平均 0.861

## Phase 7 之後

- meshopt 壓縮（`EXT_meshopt_compression`）：236 KB（原 453 KB）。載入時要 `loader.setMeshoptDecoder(MeshoptDecoder)`
- `test01_shop.manifest.json`：可點擊節點、動畫群組、QA 結果
