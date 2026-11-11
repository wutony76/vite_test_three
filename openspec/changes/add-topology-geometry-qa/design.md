# Design

## 1. Profile 欄位

| 欄位 | 意義 |
|---|---|
| `components` | 必須剛好幾個島（None = 不限） |
| `max_components` | 島數上限（None = 不限） |
| `allow_boundary`／`normals`／`ngon`／`remesh` | 沿用 |
| `max_tris` | 單一 Object 的三角面上限 |
| `self_intersection` | `fail`：不可以自我交叉；`ignore`：多島零件的島之間本來就會互相穿插（例如葉團插進花盆），只回報數值 |
| `bevel`／`wobble` | 建模時要不要倒角、手繪偏移（orchestrator 讀取，不再寫死在程式裡） |

| profile | 島數 | 開放邊 | max_tris | 自我交叉 | bevel | wobble | 用途 |
|---|---|---|---|---|---|---|---|
| building_shell | =1 | ✗ | 3000 | fail | ✓ | ✓ | 牆體、地基、壓頂 |
| roof | =1 | ✗ | 2000 | fail | ✓ | ✓ | 獨立屋頂 |
| trim | ≤12 | ✗ | 800 | ignore | ✓ | ✓ | 樑、柱、雨遮、窗台 |
| opening | ≤6 | ✗ | 1500 | ignore | ✓ | ✗ | 門、窗框 |
| glass | ≤4 | ✓ | 200 | ignore | ✗ | ✗ | 玻璃 |
| decoration | ≤8 | ✓ | 1000 | ignore | ✗ | ✗ | 燈、招牌、盆栽 |
| vegetation | ≤8 | ✗ | 1000 | ignore | ✗ | ✗ | 藤蔓、灌木、樹幹 |
| tile_array | 不限 | ✗ | 3000 | ignore | ✗ | ✗ | 屋瓦 |
| organic | =1 | ✗ | 2000 | fail | ✗ | ✗ | 岩石、樹冠（允許 Remesh） |
| terrain | =1 | ✓ | 10000 | fail | ✗ | ✗ | 地形 |
| road | =1 | ✓ | 4000 | fail | ✗ | ✗ | 道路 |
| water_surface | =1 | ✓ | 6000 | fail | ✗ | ✗ | 水面 |

ngon 一律只提醒（Boolean 交界會產生 ngon，glTF 匯出時會三角化）。

## 2. 新的拓撲檢查（`validation/checks.py`）

- **自我交叉**：
  1. 在「合併重複頂點後」的 bmesh 上建立 `BVHTree.FromBMesh`。
  2. `tree.overlap(tree)` 取得互相重疊的面對，排除同一個面，以及共用任一頂點的面對（相鄰的面本來就接觸）。
  3. 回報 `self_intersections`（面對數）。
- **島數上限**：`components > max_components` → fail。
- **三角面上限**：`triangles > max_tris` → fail。
- **縮放**：負縮放 → fail（法線會反、Three.js 光照錯誤）；非等比縮放 → warn（instance 一律用等比）。
- **poles**（接了 6 條以上邊的頂點）：只回報數值，不判定。

## 3. Geometry QA（`qa/geometry.py`）

對照 plan 檢查 root 底下每個 mesh Object（用 `lpk_component` 對應 plan 元件）：

| 檢查 | 判定 | 說明 |
|---|---|---|
| `OUT_OF_BOUNDS` | fail | 世界外框超出 plan bounds（加上 root 位置），容差為 max(6 cm, 尺寸 × 5%)。容差包含窗台外凸、bevel、wobble |
| `UNDERFILLED` | warn | 任一軸（plan 尺寸 > 10 cm 的軸）實際尺寸 < plan 的 50%。用來抓 builder 參數錯誤 |
| `FLOATING` | warn | 外框底部高於地面 2 cm，而且外框（外擴 2 cm）沒有碰到任何其他 Object |

- 回傳 `{"objects": {name: {...}}, "issues": [...]}`，issue 帶 `code`、`level`、`object`、`message`。
- orchestrator 在拓撲驗證之後執行：fail 加入 errors（code `GEOMETRY_OUT_OF_BOUNDS`），warn 放在 `report["geometry"]`。

## 4. 不做的：物件之間穿插

門窗放進牆的凹槽、柱子貼牆、葉團插進花盆，都是刻意的接觸或重疊。沒有「哪些物件允許接觸」的資料就判定，只會產生大量誤報。這部分留給 Phase 6 的 Scene Graph。

## 5. 測試

- `tests/test_qa.py`（Blender）：
  - 自我交叉：Join 起來的十字交叉方塊在 building_shell → fail；在 decoration → 只回報數值
  - 島數上限：9 個方塊的 decoration → fail
  - 三角面上限
  - 負縮放、非等比縮放
  - Geometry QA：建 test01_shop 後沒有 fail；把盆栽抬高 → FLOATING；把門往外移 → OUT_OF_BOUNDS
  - profile 欄位完整
