# Design

## 1. 分層：純 Python 與 Blender

```
pipeline/   （純 Python）plan 驗證、DetailConfig            ← Phase 2
shapes.py   （純 Python）幾何產生器，輸出 MeshData
components/ （純 Python）kind → builder(ctx) → MeshData
build/      （Blender）  orchestrator：MeshData → bmesh → Object；編輯、Union、wobble、bevel、驗證
api.py      （Blender）  build_asset_from_plan
```

幾何產生器和零件庫都不依賴 bpy，所以可以在 Blender 外用一般 Python 測試拓撲：每條邊剛好接 2 個面、沒有退化面、頂點在 bounds 內。Blender 只負責最後寫成 Object 與套用 bmesh 操作。

## 2. 座標約定

- 資產座標：沿用 Phase 2，原點在 footprint 中心的地面上，+Z 朝上，正面朝 -Y，單位公尺。
- 元件局部座標：原點在 bounds 的「底面中心」。x 介於 ±w/2、y 介於 ±d/2、z 介於 0～h。
- Object 的 origin 也放在底面中心，所以 Three.js 端旋轉或縮放盆栽、燈具時，會以它站立的位置為支點。

## 3. 幾何產生器（`shapes.py`）

| 函式 | 用途 | 拓撲 |
|---|---|---|
| `MeshData` | verts、faces、每個面的材質名稱；`add`、`extend`、`translate` | — |
| `box` | 長方體 | 封閉、6 個 quad |
| `grid_slab(us, vs, w0, w1, cells, axes)` | 格狀板：每個格子可以是 solid、niche（凹槽）或 hole（貫穿洞） | 封閉、只有 quad；hole 會讓 genus 增加，但仍是 1 個島 |
| `prism(outline, a0, a1, axes)` | 2D 輪廓沿一軸擠出；凹多邊形端面用 ear clipping 三角化 | 封閉、沒有 ngon |
| `loft(rings)` | 多個同點數的環依序連接；端面 4 點用 quad，多於 4 點用中心扇形 | 封閉 |
| `lathe(profile, segments, axis, band_mats)` | 旋轉體；半徑 0 的端點收成極點；每一段可以指定材質 | 封閉 |
| `sweep(path, radius, sides)` | 沿路徑掃出管狀 | 封閉 |
| `blob(center, radii, segments, rings)` | 低面數橢球（樹葉、樹冠） | 封閉 |

### grid_slab：為什麼牆、窗框、門都靠它

- 牆上要開門窗，傳統做法是建好方塊再 Boolean 挖洞，容易產生 ngon 和細碎面。
- `grid_slab` 先把所有開口邊界收集成格線，整塊板由 quad 組成（正面、背面、四個側面都切同樣的格線，所以沒有 T 字接點）。
- 開口格子依類型處理：
  - niche：在同一個區域內建一層往內退的格子，只在區域外圍補側壁
  - hole：直接連到背面的格點，正面和背面都不建面
- 結果是 1 個封閉幾何島。
- 用途：
  - 牆的門窗凹槽（niche）
  - 窗框和窗櫺（hole，整個窗框是 1 個島）
  - 門片上的玻璃凹槽
  - 女兒牆壓頂（水平放置，中間一個 hole）

## 4. 零件庫（`components/`）

- `@register(kind, edit=False)` 註冊 builder，簽名是 `builder(ctx) -> MeshData`。
- `ctx` 提供：
  - `w`、`d`、`h`
  - `param(key, default)`
  - `mat(name)`：確認材質存在
  - `segments(scale)`：依 `geometry_complexity` 決定分段數
  - `density(tier)`
  - `rng`：由 plan seed 和元件 id 決定
  - `children`：子元件在本元件局部座標中的矩形，例如門會拿到玻璃的位置，用來挖凹槽
  - `regions`：牆會拿到開口和要修改的區域，用來切格線

| 檔案 | kind | 建法 |
|---|---|---|
| `structure.py` | wall_block | grid_slab：開口做 niche；修改區域只切格線 |
| | coping | 水平 grid_slab，中間 hole |
| | foundation | loft（primary_quality ≥ 2 時做成兩階） |
| | chimney | loft：煙囪身、外擴的頂蓋、往下凹的煙道（secondary_density ≥ 0.4）；底部埋入屋頂 10 cm |
| | pillar | loft，底部略寬 |
| | beam | box |
| | canopy | prism 梯形斜板 |
| | awning | loft 沿 x 排列斷面；頂面依 `ribs` 做成瓦楞（Test A 用來取代屋瓦） |
| | steps | prism 階梯輪廓 |
| `openings.py` | window／shop_window | 外框和窗櫺是 1 個 grid_slab（窗格 = hole）；窗台另外一個島（secondary_density ≥ 0.3） |
| | door | 門框（grid_slab hole）、門片（玻璃位置做 niche；secondary_density ≥ 0.5 時加下方門板凹槽）、門把（tertiary_density > 0） |
| | glass_pane | 單一平面（glass profile 允許開放邊界） |
| `props.py` | sign_disc | lathe（y 軸），tertiary_density ≥ 0.5 時加外圈 |
| | poster | 依密度產生 3～6 張薄卡片，輪流使用 `accent_materials` |
| | wall_lamp | 牆板、sweep 支架、lathe 燈籠（燈罩那段用 glow 材質） |
| | wall_light | lathe 半球（y 軸） |
| | street_lamp | **一個 lathe**：底座、燈柱、燈籠、頂蓋都是同一個島 |
| | chalkboard_sign | 兩片斜板加頂部橫桿 |
| | cat_silhouette | prism 貓的剪影輪廓 |
| | planter_box | loft 花槽（含往下凹的土面）加植物 blob |
| | pot_plant | lathe 盆子（含盆緣和土面）加植物 blob |
| | vine | sweep 藤蔓莖加葉子 blob |
| `nature.py` | tree_trunk | lathe |
| | tree_canopy | 3 顆重疊的 blob，交給 orchestrator 做 Voxel Remesh |
| 編輯類 | roof_flat、brick_patch | 不建立 Object；orchestrator 用 `extrude_mesh_region` 修改 parent |

Phase 4 會把 `decoration` 的島數上限設為 8，所以零件庫的裝飾類 builder 都控制在 8 個島以內。

## 5. Orchestrator 流程（`build/orchestrator.py`）

1. `validate_plan`，失敗就直接回傳。
2. 清除同一個 plan 上一次的建模結果：所有 `lpk_asset == plan id` 的 Object 和它們的 mesh。這樣才能重複執行。
3. 建立材質：hex 是 sRGB，要轉成 linear 再寫入 Principled BSDF。同時設定 emissive、alpha 和 viewport 色。
4. 依 parent 順序建立「新物件」類元件：`custom_mesh`、`component`、`remesh`、`boolean_union`。
   - instance 群組中第一個元件建立 mesh，其他成員共用同一份 mesh，用等比縮放對齊高度。
   - `tertiary_density == 0` 時跳過所有 tertiary 元件。
5. 套用編輯類元件：
   - `params.face` 是 `top` 或 `front`，搭配 bounds 選出 parent 上的面。
   - `inset > 0` 用 `inset_extrude`，否則用 `extrude`。
6. `boolean_union`：用 `boolean_union_objects` 把元件融合進 `union_into` 指定的元件。
7. Wobble：只套用在 primary／secondary 的 `building_shell`。
8. Bevel：套用在 primary／secondary 的 `building_shell`、`opening`。
   - 寬度 = clamp(0.06 × 最小尺寸, 0.004, 0.025)
   - 只處理兩側面夾角 > 30° 的邊
   - 段數 = `bevel_quality`
9. 每個 Object：`repair` → `validate_mesh_topology(profile)`。
10. 統計三角面數、primitive 數，和 budget 比較。
11. 選擇性匯出：`prepare_for_gltf(root, export.path)`。

Object 的 custom property 會匯出成 Three.js 的 userData：

- `lowpoly_profile`
- `lpk_asset`、`lpk_component`、`lpk_kind`、`lpk_tier`、`lpk_source`
- `clickable`、`anim_group`、`instance_group`

命名：

- 根節點：`<plan_id>_Root`
- 元件：`<plan_id>_<component_id>`
- 不用 `.`：Three.js 的 `PropertyBinding.sanitizeNodeName` 會把 `.` 刪掉。

## 6. Wobble（手繪感）

- 偏移量 = f(頂點座標四捨五入到 0.1 mm, seed)，用 CRC32 雜湊。
  - 用位置而不是頂點索引：女兒牆壓頂和牆頂在同一個位置的頂點偏移相同，不會裂開。
- 只偏移 x、z，不偏移 y：貼在牆面上的橫樑、柱子不會和牆面分離。
- 振幅 = `style.edge_wobble`（Test A 是 2 cm）。

## 7. Detail 參數實際作用

| 參數 | 作用 |
|---|---|
| `primary_quality` | foundation 的階數 |
| `secondary_density` | 窗台（≥ 0.3）、煙囪頂蓋與煙道（≥ 0.4）、門板凹槽（≥ 0.5） |
| `tertiary_density` | 0 時跳過 tertiary 元件；> 0 時決定植物 blob、海報、藤葉的數量；門把（> 0）、招牌外圈（≥ 0.5） |
| `geometry_complexity` | lathe／blob 的分段數 |
| `bevel_quality` | bevel 段數（0 = 不倒角） |
| `material_quality`、`texture_quality` | Phase 5 才生效 |

plan 裡明確列出的 observed 元件**一定會建**。密度只控制元件「內部」的細節多寡，不會隨機刪掉看得到的元件。

## 8. 錯誤碼（新增）

| 錯誤碼 | 條件 |
|---|---|
| `COMPONENT_NOT_IMPLEMENTED` | kind 沒有 builder |
| `COMPONENT_BUILD_FAILED` | builder 或 bmesh 操作拋出例外（附元件 id） |
| `BUDGET_EXCEEDED` | 三角面數或 primitive 數超過 budget |
| `VALIDATION_FAILED` | 某個 Object 沒通過 profile（沿用） |

## 9. 測試策略

- `tests/test_shapes.py`（純 Python）：每個產生器、每個 builder 的流形、退化面、bounds 檢查；`grid_slab` 的 niche 與 hole。
- `tests/test_build_plan.py`（Blender）：
  - test01_shop 全部 Object 都通過驗證
  - facade 是 1 個島且封閉
  - 煙囪已融合
  - 建兩次的頂點雜湊相同
  - 預算內
  - 匯出 GLB 的統計
- `tests/threejs_plan_check.mjs <glb> <plan>`：
  - 只有一個根節點
  - clickable 元件是獨立節點
  - userData 帶有 profile
  - 正面射線打到門
  - mesh 數不超過 budget
- 預覽：`scripts/build_from_plan.py --render`，用 Workbench 渲染正面正交視角和 3/4 視角。
