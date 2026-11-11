# sample_town

Test B：依 `tools/blender/plans/sample_town.scene.json` 組裝的 Low Poly 小鎮。

- 內容：2 棟店面（test01_shop）、2 棟童話石屋（test02_cottage）、8 棵樹（tree_round，GPU instancing）、起伏地形、2 條道路
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
- 約 13,400 個三角面（GLB，共用 mesh 只存一次）、Three.js 約 103 次 draw call、1.1 MB
- 燈光不在 GLB 裡，請在 Three.js 端建立
- 檢查：`node tools/blender/tests/threejs_scene_check.mjs`
