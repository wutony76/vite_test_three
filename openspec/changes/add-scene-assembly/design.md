# Design

## 1. 組裝流程（`scene/assembly.py`）

1. 驗證 ScenePlan；清除上一次的場景（`lpk_scene == id` 的物件）。
2. **資產庫**：每個 asset 用 `build_asset_from_plan` 建一次，collection 設為隱藏。資產本身的 QA 錯誤會帶進場景報告。
3. 建立 `<id>_Root` 與 hierarchy 的群組 Empty。
4. **高度場**（`TerrainField`）：
   - 起伏：3 組不同頻率的 sin × sin 疊加，相位由 seed 決定，值域 0～amplitude
   - 整平遮罩：到建築外框、道路中心線（扣掉半寬）的距離，在 `flatten_margin` 內用 smoothstep 從 0 過渡到 1
   - 高度 = 起伏 × 遮罩：建築、道路底下的高度剛好是 0
5. **地形**：resolution × resolution 的格狀 mesh（`terrain` profile：1 個島，允許開放邊）。
6. **道路**：沿 polyline 每約 1 m 取一點，用相鄰線段的平均法線做斜接，左右偏移半寬；z = 0.03（多條道路依序 +5 mm，避免重疊處閃爍）。
7. **擺放**：
   - 一般擺放（建築）：`<placement>_Root` 掛在群組下，matrix = 平移 × 繞 z 旋轉 × 等比縮放；資產的每個 Object 建一個共用 mesh 的複本，保留原本的父子關係與局部變換
   - instance 擺放（樹）：複本直接掛在群組底下（不包一層 Empty），z 取該點的地形高度再往下埋 5 cm。這樣共用 mesh 的兄弟節點才會被 exporter 合併成 `EXT_mesh_gpu_instancing`
   - 複本的 custom property：`lpk_scene`、`lpk_placement`、`lpk_asset_ref`，以及原本的 `lpk_component`、`lowpoly_profile`、`clickable` 等。**不帶 `lpk_asset`**，重建單一資產時才不會刪到場景
8. Scene QA → 匯出（gpu instancing 開啟）。

## 2. Scene QA（`qa/scene.py`）

| 檢查 | 判定 | 方法 |
|---|---|---|
| `SCENE_OVERLAP` | fail | 建築外框（asset dimensions × scale，旋轉後）兩兩用 SAT 判斷是否重疊 |
| `SCENE_ON_ROAD` | 建築 fail、樹 warn | 外框內取樣 7×7 個點，任一點到道路中心線的距離 < 半寬 |
| `SCENE_TREE_IN_BUILDING` | fail | 樹的位置落在建築外框內 |
| `SCENE_OUT_OF_TERRAIN` | fail | 外框的角超出地形範圍 |
| `SCENE_ON_SLOPE` | fail | 建築外框內取樣點的地形高度最大值 > 0.08 m（地面沒有整平，建築會陷進坡裡或懸空） |
| `SCENE_HIERARCHY` | fail | 根節點底下所有 mesh 都屬於某個 hierarchy 群組；每個建築擺放都有自己的根節點 |
| `SCENE_BUDGET` | fail | 三角面（每個複本都計算）> max_tris；draw call 估計（每個 Object 的材質數，instance 群組只算一次）> max_draw_calls |

報告也會列出 mesh 共用率：場景物件數 vs 實際 mesh 數。

## 3. ScenePlan schema 擴充

```jsonc
"materials": [{"name": "grass", "hex": "#8DB04A"}, {"name": "road", "hex": "#C9B38A"}],
"terrain": {"kind": "grid_hills", "size": [60, 60], "material": "grass",
            "params": {"amplitude": 1.5, "seed": 7, "resolution": 48, "flatten_margin": 4.0, "frequency": 0.12}},
"roads": [{"id": "main_street", "polyline": [...], "width": 3.0, "material": "road"}],
"export": {"path": "public/models/sample_town/sample_town.glb"}
```

- `resolution` 介於 4～128；`amplitude`、`flatten_margin` ≥ 0。
- material 參照必須存在。

## 4. sample_town 配置

道路 main_street 由西到東略呈 S 形；side_lane 往北分岔。

| 擺放 | 資產 | 位置 | 旋轉 | 說明 |
|---|---|---|---|---|
| shop_a | test01_shop | (-15, 7.5) | 0° | 北側，面向道路（-Y） |
| cottage_a | test02_cottage | (-5.5, 9.5) | 0° | 北側，在 side_lane 西邊 |
| cottage_b | test02_cottage | (8, -8.5) | 180° | 南側，面向道路（+Y） |
| shop_b | test01_shop | (19, -7) | 180° | 南側 |
| tree_01～08 | tree_round | 道路與建築之外 | 隨機 | instance |

位置以 Scene QA 的結果為準，有違規就調整 plan。

## 5. 測試

- `tests/test_scene_terrain.py`（純 Python）：
  - 高度場確定性、整平區為 0、遠處有起伏
  - 道路帶狀面封閉於 1 個島（開放邊只在外緣）
  - SAT 重疊、點到 polyline 的距離
- `tests/test_scene.py`（Blender）：
  - 組裝成功、QA 通過
  - mesh 共用
  - 違規擺放被抓到
  - 重建後物件名稱不重複
  - 資產重建不會刪到場景複本
- `tests/threejs_scene_check.mjs`
