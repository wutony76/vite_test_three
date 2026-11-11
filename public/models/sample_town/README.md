# sample_town

Test B：依 `tools/blender/plans/sample_town.scene.json` 組裝的 Low Poly 小鎮。

- 內容：2 棟店面（test01_shop）、2 棟童話石屋（test02_cottage）、8 棵樹（tree_round，GPU instancing）、4 盞街燈（lamp_post，GPU instancing）、2 組木箱堆（crate_pile）、起伏地形、2 條道路
- 重新產生：

  ```bash
  Blender --background --factory-startup --python-exit-code 1 \
    --python tools/blender/scripts/build_scene.py -- tools/blender/plans/sample_town.scene.json --export
  ```

- 階層：`sample_town_Root` → `sample_town_Terrain`／`Roads`／`Buildings`／`Vegetation`／`Props`
  - 每棟建築一個根節點：`shop_a_Root`、`cottage_a_Root`、`cottage_b_Root`、`shop_b_Root`
  - 子物件命名為 `<擺放 id>_<元件 id>`，例如 `shop_a_door`
- `userData`：`lpk_placement`、`lpk_asset_ref`、`lpk_component`、`clickable`、`lowpoly_profile`
- 樹使用 `EXT_mesh_gpu_instancing`，Three.js 載入後是 `InstancedMesh`（樹幹、樹冠各 1 個，各 8 個 instance）
- 約 14,100 個三角面（GLB，共用 mesh 只存一次）、Three.js 約 113 次 draw call、573 KB（meshopt 壓縮；載入時要 `setMeshoptDecoder`）
- 燈光不在 GLB 裡：`sample_town.manifest.json` 的 `lights` 描述日光與半球光（Three.js 座標、Three.js 強度），由頁面建立
- manifest 另有每棟建築的根節點與可點擊元件（`placements`）、instance 擺放（`instanced`，街燈屬於 `lamp_glow` 動畫群組）
- 檢查：`node tools/blender/tests/threejs_scene_check.mjs`
