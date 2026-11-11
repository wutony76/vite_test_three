# Proposal

## 變更名稱

`add-scene-assembly` — Scene Assembly Engine 與 Scene QA（Stylized Asset Pipeline Phase 6）

## 背景

- Phase 2 定義了 ScenePlan（地形、道路、資產、擺放、預算），但沒有程式能依它組裝場景。
- 已有三個資產：test01_shop（店面）、test02_cottage（石屋）、tree_round（樹）。
- `sample_town.scene.json` 的草稿有兩個問題：
  - 店面放在道路北側卻轉了 180°，正面背對道路
  - 4 棟店面約 120 次 draw call，加上樹、地形後會逼近預算

## 目標

1. `api.build_scene_from_plan(scene)`：依 ScenePlan 確定性組裝小鎮。
   - 每個資產只建一次，放在隱藏的資產庫 collection；每次擺放都是共用 mesh 的複本。glTF 中同一份 mesh 只存一次。
   - 地形：起伏的格狀地面，建築與道路周圍自動整平（平滑過渡）。
   - 道路：沿 polyline 掃出的帶狀面，貼在整平的地面上。
   - 階層：`<scene>_Root` → Terrain／Roads／Buildings／Vegetation／Props 群組 → 每棟建築一個根節點（可以單獨點擊、做動畫）。
   - 樹：`instance: true` 的擺放直接掛在群組底下，匯出時用 `EXT_mesh_gpu_instancing`，Three.js 會變成 `InstancedMesh`。
2. **Scene QA**（程式判定）：
   - 建築外框互相重疊
   - 建築或樹壓在道路上
   - 超出地形
   - 建築底下不平
   - 階層不完整
   - 三角面與 draw call 超出預算
3. 匯出整個場景的 GLB，並在 Three.js 驗證。

## 範圍

- 包含：
  - `scene/terrain.py`（純 Python：高度場、整平遮罩、地形與道路 mesh、旋轉矩形的重疊與距離計算）
  - `scene/assembly.py`（Blender）、`qa/scene.py`、`api.build_scene_from_plan`（Scene QA 整合在組裝流程中，每次都會執行，不另外提供 `validate_scene`）
  - schema：ScenePlan 新增 `materials`、`terrain.material`、`roads[].material`、`export.path`，以及地形參數的範圍檢查
  - `scripts/build_scene.py`（組裝、匯出、俯視與 3/4 預覽）
  - `tests/threejs_scene_check.mjs`
  - 重新配置 `sample_town.scene.json`：2 棟店面、2 棟石屋、8 棵樹，建築面向道路
- 不包含：
  - 場景燈光（由 Three.js 端建立）
  - meshopt 壓縮、headless MCP server（Phase 7）
  - 物件之間的細部接觸判定（例如門窗放進凹槽）：Scene QA 只判斷擺放層級的外框

## 風險與對策

- 風險：exporter 的 gpu instancing 會把同一個父節點下、共用 mesh 的兄弟物件合併。店面裡兩個共用 mesh 的盆栽也會被合併，失去各自的名稱
  - 對策：接受（盆栽本來就不可點擊）；Three.js 檢查會確認建築的可點擊元件仍是獨立節點
- 風險：重建單一資產時，`purge` 會刪掉場景中的複本
  - 對策：複本不帶 `lpk_asset`，改帶 `lpk_asset_ref` 與 `lpk_scene`，兩者互不清除
- 風險：資產庫在使用者的 Blender 中佔位置
  - 對策：資產庫 collection 設為隱藏；匯出時只選場景根節點底下的物件

## 驗證方式

- 純 Python：高度場的確定性、整平區高度為 0、道路帶狀面是 1 個島、旋轉矩形重疊判定、點到 polyline 的距離
- Blender：
  - sample_town 組裝成功、Scene QA 通過
  - 刻意把建築放到道路上或互相重疊時，QA 會回報
  - 重建結果相同
- Three.js：根節點、群組、4 棟建築的門可點擊、樹是 `InstancedMesh`、draw call ≤ 150
- 預覽：俯視與 3/4 視角，人工或 AI 檢視
- 回歸：既有測試、`npm run build`

## 成功標準

- [ ] sample_town：4 棟建築（2 種造型）、8 棵 instanced 樹、地形、2 條道路；Scene QA 沒有 fail
- [ ] 三角面 ≤ 150000、draw call ≤ 150
- [ ] GLB 在 Three.js：每棟建築的門可以單獨點擊與移動；樹是 InstancedMesh
- [ ] 違規擺放（重疊、壓道路、超出地形）會被 Scene QA 抓到
- [ ] 既有測試全部通過
