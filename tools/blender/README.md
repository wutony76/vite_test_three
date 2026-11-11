# lowpoly_kit — Blender Low Poly 建模與拓撲驗證

讓 AI 透過 MCP for Blender 建模時，用 Custom Mesh／BMesh／Extrude／Inset／Boolean Union 做出**連續的拓撲**，而不是把 primitive 堆起來；建完以程式驗證，不靠目測。

- 只用 Blender 內建的 `bpy` / `bmesh` / `mathutils`，沒有外部依賴
- 不修改 `mcp-for-blender` 本身：透過它的 `execute_blender_code` 載入
- 基準版本：Blender 5.2 LTS（Boolean `MANIFOLD` solver 需要 4.5+，沒有時自動改用 `EXACT`）

## 在 MCP 裡使用

```python
import sys
sys.path.insert(0, "/Users/tony.wu/SelfCode/Self/git_proj/vite_test_three/tools/blender")
import lowpoly_kit
lowpoly_kit = lowpoly_kit.reload_all()  # 程式碼改過才需要
api = lowpoly_kit.api

r = api.validate_mesh_topology("Body", profile="building_shell")
print(r["ok"], r["errors"], r["report"]["checks"]["components"])
```

## 讓 AI 編輯器照流程建模

AI 要建模時，常常不讀文件就直接用 primitive 堆疊。所以把流程寫成編輯器的 rule／skill，讓 AI 一開始建模就自動載入。

流程本身只寫在 [`WORKFLOW.md`](WORKFLOW.md)。Cursor rule 和 Claude Code skill 都只放觸發條件與三條禁止事項，並指向它；**改流程只改 WORKFLOW.md**。

### Cursor

需要兩個設定：

| 檔案 | 作用 | 進版控 |
|---|---|---|
| `~/.cursor/mcp.json` | 讓 Cursor 連上 Blender（MCP server） | 否，每台電腦各設一次 |
| `.cursor/rules/blender-modeling.mdc` | 觸發建模流程，內容指向 `tools/blender/WORKFLOW.md` | 是 |

**1. 設定 MCP**（每台電腦一次）

`~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["mcp-for-blender"]
    }
  }
}
```

前置條件：

- 已安裝 [`uv`](https://docs.astral.sh/uv/)，才能使用 `uvx`。
- Blender 已開啟，MCP for Blender addon 也已啟用。
- 到 Cursor Settings → MCP 確認 `blender` 亮綠燈。

同一時間只讓一個 AI 工具操作 Blender，例如不要讓 Cursor 和 Claude Code 同時連。

**2. 叫 Cursor 建模**

rule 是 `alwaysApply: false`，Cursor 會依 rule 的描述判斷要不要載入。在訊息裡寫出 rule 名稱最保險：

```
用 Blender 建一個 Low Poly 的【物件】，照 blender-modeling 規則走
```

也可以輸入 `@blender-modeling` 強制載入。Cursor 會依序這樣做：

1. 有參考圖時先輸出 `plans/<id>.reference.json`（observed／inferred 分開標示）。
2. 輸出 `plans/<id>.plan.json`，用 `api.validate_plan` 驗證，列出元件表**等你確認**後才動手。
3. 用 `create_connected_mesh` / `extrude_mesh_region` / `boolean_union_objects` 建模。
4. 用 `repair_mesh_topology` 修正，再用 `validate_mesh_topology` 驗證。
5. 用 `prepare_for_gltf` 匯出到 plan 的 `export.path`。
6. 輸出品質報告表格。

### Claude Code

MCP 設定：`claude mcp add blender -- uvx mcp-for-blender`。

流程由 project skill `.claude/skills/blender-modeling/SKILL.md` 觸發（有進版控）。Claude Code 會依 skill 的 description 自動載入；也可以輸入 `/blender-modeling` 強制載入。

### 搬到其他專案

1. 複製 `tools/blender/`、`.cursor/rules/blender-modeling.mdc`、`.claude/skills/blender-modeling/`。
2. 把 `WORKFLOW.md` 和本文件裡 `sys.path.insert(0, ".../tools/blender")` 的**絕對路徑**改成新專案的路徑。Blender 執行程式時的工作目錄不是專案根目錄，所以不能用相對路徑。
3. plan 的 `export.path` 依新專案的模型目錄調整。

## Plan（AI 與程式之間的資料契約）

AI 只負責「看」和「規劃」，輸出 JSON；幾何由程式依 plan 確定性產生。格式細節見 `openspec/changes/add-asset-plan-schema/design.md` §3。

| schema | 檔名 | 內容 |
|---|---|---|
| `lowpoly.reference/1` | `plans/<id>.reference.json` | 參考圖分析：視角、比例錨點、輪廓、元件框（正規化 0～1）、色票、推測的隱藏結構、不建模清單 |
| `lowpoly.asset/1` | `plans/<id>.plan.json` | 單一資產：外框、DetailConfig、材質、預算、元件（kind／tier／method／profile／bounds）、匯出設定 |
| `lowpoly.scene/1` | `plans/<id>.scene.json` | 場景：地形、道路、階層群組、資產、擺放（含 instancing）、預算 |

- 每個元件都要標 `source`：`observed`／`inferred`；推測的必須寫 `assumption`。
- 座標：原點在建築 footprint 中心的地面上，+Z 朝上，正面朝 -Y，單位公尺。
- `DetailConfig`：`primary_quality`、`secondary_density`、`tertiary_density`、`geometry_complexity`、`bevel_quality`、`material_quality`、`texture_quality`。先套 preset（`game_default`／`preview`／`hero`），再用 `overrides` 逐項覆寫；亂數種子由 plan id 決定，每次結果相同。
- 驗證器 `lowpoly_kit/pipeline/` 不依賴 bpy，在 Blender 外也能跑：

```python
from lowpoly_kit.pipeline import validate_plan   # 或在 Blender 裡用 api.validate_plan
r = validate_plan("tools/blender/plans/test01_shop.plan.json")
print(r["ok"], r["errors"], r["report"]["warnings"])
```

錯誤一次全部列出，每筆附 `path`（例如 `components[3].profile`）。錯誤碼：`PLAN_FILE_INVALID`、`PLAN_SCHEMA_UNKNOWN`、`PLAN_FIELD_MISSING`、`PLAN_FIELD_TYPE`、`PLAN_ENUM_INVALID`、`PLAN_ID_DUPLICATE`、`PLAN_REF_MISSING`、`PLAN_CYCLE`、`PLAN_METHOD_NOT_ALLOWED`、`PLAN_OUT_OF_BOUNDS`、`PLAN_INFERRED_NO_ASSUMPTION`、`PLAN_RANGE`、`PLAN_BUDGET_INVALID`。警告（不影響 `ok`）：`LOW_CONFIDENCE`、`GENERIC_KIND`、`HIGH_INFERRED_RATIO`、`INSTANCE_KIND_MIXED`、`BUDGET_PRIMITIVES`。

參考圖疊圖校正（輸出到暫存目錄，不進版控）：

```bash
~/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/scripts/overlay_reference.py -- tools/blender/plans/test01.reference.json /tmp/overlay.png
```

## 依 plan 建模（Geometry Engine）

`api.build_asset_from_plan(plan)` 讀 AssetPlan，確定性地建出整個資產。設計細節見 `openspec/changes/add-plan-geometry-engine/design.md`。

| 層 | 檔案 | 依賴 |
|---|---|---|
| 幾何產生器 | `shapes.py`：`grid_slab`（凹槽／貫穿洞）、`prism`（ear clipping）、`loft`、`lathe`（每段材質）、`sweep`、`blob` | 純 Python |
| 零件庫 | `components/`：`structure`、`openings`、`roofs`、`props`、`nature`，共 34 個 kind；`layout.py` 把 plan 整理成建模步驟 | 純 Python |
| 建模流程 | `build/orchestrator.py`、`materials.py`、`wobble.py`、`bevel.py` | Blender |

- 每個 builder 都輸出封閉流形（glass 除外）。窗框加窗櫺、路燈的底座到燈罩，都是 1 個幾何島。
- 牆上的門窗是 `grid_slab` 的凹槽：門窗 Object 放在凹槽裡，側面看得到牆的厚度。
- DetailConfig 實際作用：
  - `bevel_quality` = 倒角段數
  - `geometry_complexity` = 圓形分段數
  - 密度決定窗台、門板、煙道、葉團、海報的多寡
  - `tertiary_density = 0` 時跳過裝飾
- 手繪感：`style.edge_wobble`，依頂點世界座標雜湊做 x／z 偏移，相同位置的頂點偏移相同，接縫不會裂開。
- 屋瓦：`roof_hip`（實心四坡）、`roof_gable`（厚殼人字，`ridge_at` 決定屋脊位置）都用「階梯狀瓦列」（`courses`、`lip`）表現，整個屋頂仍是 1 個封閉島；山牆的三角形由 `gable_trim` 補上。
- wobble 和 bevel 都有安全模式：處理後同一個島內的自我交叉變多，就換回處理前的 mesh；報告的 `wobble`、`bevel_width` 記錄實際結果。
- Boolean 融合後，掛在被融合元件底下的子元件（例如煙囪上的煙管）會改掛到融合目標。
- 新增 kind：在 `components/` 用 `@register("kind")` 寫 builder，並在 `tests/test_shapes.py` 補上測試。

```bash
# 背景模式建模 + 匯出 + 預覽（front.png 和參考圖逐像素對齊，compare.png 並排）
~/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/scripts/build_from_plan.py -- tools/blender/plans/test01_shop.plan.json --export --render /tmp/lpk
node tools/blender/tests/threejs_plan_check.mjs tools/blender/plans/test01_shop.plan.json
```

## 外觀（palette atlas、vertex color）

由 DetailConfig 的 `material_quality`、`texture_quality` 決定：

| material_quality | 結果 |
|---|---|
| `flat` | 一色一材質（preview 用） |
| `palette` | 不透明的面共用 1 個 atlas 材質、發光的面共用 1 個，玻璃維持獨立且半透明；每個面的 UV 指向自己的色格 |
| `palette_vc` | 再加 vertex color：每個面固定的明暗起伏（±6%）× 牆腳到頂端的高度漸層 |

- atlas 有兩張貼圖：color（sRGB）和 metallicRoughness（G = roughness、B = metallic），合併材質後質感不會遺失。
- 取樣用 Closest（glTF 的 NEAREST），色格不會互相混色。
- `texture_quality`：`atlas64`（每格 8 px）或 `atlas256`（每格 32 px）；`none` 會退回 flat。
- 效果：test01_shop 的 primitive 從 40 降到 30，材質從 14 個變成 3 個。

## Visual QA

`api.validate_visual(plan_path, out_dir)`：和正面參考圖比較。判定只看數字；疊圖給 AI 或人工寫評語，評語不影響判定。

| 指標 | 計算 | 判定 |
|---|---|---|
| 輪廓 IoU | 正面正交渲染的主體剪影（primary／secondary）vs 參考輪廓 | ≥ 0.85 pass、≥ 0.75 warn、否則 fail |
| 元件位置 IoU | 每個元件投影到正面的外框 vs 參考框（同 id 對應），取平均 | ≥ 0.7 pass、≥ 0.55 warn；單一元件 < 0.5 warn |
| 色差 ΔE | 色票取樣區的中位數：渲染 vs 參考圖 | ≤ 15 pass，超過只 warn（水彩和平塗本來就有差距） |

- 輸出：`front.png`、`silhouette.png`、`overlay.png`（綠 = 重疊、紅 = 模型缺少、藍 = 模型多出來）、`compare.png`、`visual_report.json`。
- 會暫時改動渲染引擎、相機、隱藏狀態，結束時全部還原，所以也可以在正在使用的 Blender 裡執行。
- 參考圖不是正面正交視角時回報 `skipped`。
- 計算模組 `qa/metrics.py` 是純 Python + numpy：掃描線填色、IoU、Lab ΔE、外框投影。

## 場景組裝（Scene Assembly）

`api.build_scene_from_plan(scene_path, export=)`：依 ScenePlan 組裝小鎮。設計細節見 `openspec/changes/add-scene-assembly/design.md`。

- **資產庫**：每個資產只建一次，放在隱藏的 collection；每次擺放都是共用 mesh 的複本，glTF 中同一份 mesh 只存一次。
- **地形**：起伏的格狀地面。建築外框與道路周圍自動整平，並用 smoothstep 平滑過渡；`terrain.params` 可設定 `amplitude`、`seed`、`resolution`、`flatten_margin`、`frequency`。
- **道路**：沿 polyline 掃出的帶狀面，轉角用斜接，多條道路依序抬高 5 mm，避免重疊處閃爍。
- **擺放**：
  - 建築：`<擺放 id>_Root` 掛在群組底下，可以單獨點擊、做動畫
  - `instance: true`（樹）：直接掛在群組底下，匯出成 `EXT_mesh_gpu_instancing`
- **複本的 custom property**：帶 `lpk_scene`、`lpk_placement`、`lpk_asset_ref`，**不帶 `lpk_asset`**，重建單一資產時才不會刪到場景。
- **Scene QA**：每次組裝都會執行，結果在 `result["report"]`。

| 檢查 | 判定 |
|---|---|
| `SCENE_OVERLAP` | 建築外框互相重疊（旋轉後的長方形，SAT 判定） |
| `SCENE_ON_ROAD` | 建築外框壓到道路（fail）；樹幹壓到道路（warn） |
| `SCENE_TREE_IN_BUILDING` | 樹種在建築外框裡 |
| `SCENE_OUT_OF_TERRAIN` | 外框超出地形 |
| `SCENE_ON_SLOPE` | 建築底下的地面高度 > 0.08 m |
| `SCENE_HIERARCHY` | mesh 不在任何群組底下，或建築沒有自己的根節點 |
| `SCENE_BUDGET` | 三角面或 draw call 超出預算 |

```bash
~/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/scripts/build_scene.py -- tools/blender/plans/sample_town.scene.json --export --render /tmp/town
node tools/blender/tests/threejs_scene_check.mjs
```

## 匯出給 Three.js（壓縮與 manifest）

- **壓縮**：plan 的 `export.compress`（預設 true）→ meshopt 壓縮（`EXT_meshopt_compression`），檔案大約減半。Three.js 端要設定 decoder：

  ```ts
  import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
  import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  ```

- **manifest**：每個 GLB 旁邊有一份 `<name>.manifest.json`，內容包括：
  - `requires`（需要的 glTF 擴充）、`root`
  - `clickable`（可點擊節點）、`anim_groups`（一起亮的燈等）
  - 場景另有 `placements`（每棟建築的根節點與可點擊元件）、`instanced`（instance 擺放與動畫群組）、`lights`
  - `stats`、`qa`
  - 頁面可以先讀 manifest，再決定要綁定哪些互動。
- **場景燈光**：ScenePlan 的 `lights`（`sun`／`hemisphere`／`ambient`／`point`）只寫進 manifest，不放進 GLB，因為 Blender 和 Three.js 的燈光單位不同。方向與位置使用 Three.js 座標（Y 朝上），強度也是 Three.js 的數值。

## lowpoly MCP server（背景 Blender）

把建模流程包成正式的 MCP 工具，每個工具都在背景 Blender 子行程中執行，**不碰你正在使用的 Blender**。

| 工具 | 需要 Blender | 用途 |
|---|---|---|
| `lowpoly_list_plans` | 否 | 列出 `plans/` 裡的 plan |
| `lowpoly_validate_plan(path)` | 否 | 驗證 plan（可以只寫檔名） |
| `lowpoly_build_asset(plan, export, preset, render_dir, out_root)` | 是 | 建模 + QA（有 render_dir 時加上 Visual QA 與預覽）+ 匯出 |
| `lowpoly_build_scene(scene, export, render_dir, out_root)` | 是 | 組裝場景 + Scene QA + 匯出 |
| `lowpoly_run_tests(keyword)` | 是 | headless 測試套件 |

- 設定：`.mcp.json`（Claude Code）、`.cursor/mcp.json`（Cursor）都已進版控。第一次使用時，Claude Code 會詢問是否信任這個專案的 MCP server。
- 執行方式：`uv run --no-project --with "mcp>=2,<3" python tools/blender/mcp_server/server.py`，不需要全域安裝 mcp 套件。
- Blender 路徑：環境變數 `LPK_BLENDER`，預設 `~/Applications/Blender.app/Contents/MacOS/Blender`。
- 輸出只允許寫到專案或系統暫存目錄。
- 煙霧測試：`uv run --no-project --with "mcp>=2,<3" python tools/blender/tests/mcp_smoke.py`
- 和 mcp-for-blender 的分工：
  - 要在你的 Blender 裡即時檢視或手動調整 → mcp-for-blender
  - 批次建模、匯出、測試 → lowpoly

## 端到端驗收（Test A／Test B）

```bash
python3 tools/blender/tests/e2e.py              # 全部（約 1 分鐘）
python3 tools/blender/tests/e2e.py --skip-units # 只跑 Test A／B
```

1. 純 Python 測試
2. headless 測試套件
3. Test A（test01_shop + Visual QA）
4. Test B（sample_town）
5. Three.js 檢查
6. 原始需求的 19 條驗收條件逐條判定

- 輸出（GLB、manifest、預覽、`e2e_report.json`）都在暫存目錄，不會改到 `public/models`。
- 任一條不通過就以 1 結束，並列出是哪一條。
- 對照表見 `openspec/changes/add-e2e-acceptance/proposal.md`。

## 建模流程

完整步驟見 [`WORKFLOW.md`](WORKFLOW.md)。摘要：

1. 拆解物件，決定每個零件的 profile
2. 選方法：建築／平台／地形用 `create_connected_mesh` + `extrude_mesh_region`；交接處用 `boolean_union_objects`；只有岩石、小島可以用 `remesh_organic_mesh`
3. 每一步檢查回傳的 `ok`，失敗時模型已自動還原
4. `repair_mesh_topology` 修安全可修的問題 → `validate_mesh_topology` 再驗證
5. 所有零件放在一個根 Empty 底下 → `prepare_for_gltf` 全部通過才匯出

## 對外函式（`api.py`）

全部回傳 `{"ok", "object", "changes", "report", "errors", "backup"}`，不往外丟例外。

| 函式 | 用途 | 修改模型 |
|---|---|---|
| `create_connected_mesh(name, verts, faces, profile=, materials=, material_indices=, parent=)` | 用頂點與面建立 Mesh；封閉時自動把法線轉成朝外 | 只新建 |
| `extrude_mesh_region(obj, faces, mode=, depth=, thickness=, material_index=)` | `extrude` / `inset` / `inset_extrude` / `bridge` | 是 |
| `boolean_union_objects(target, others, solver="MANIFOLD", max_face_ratio=4.0)` | 融合；others 移到 `LowpolyKit_Backup` collection | 是 |
| `repair_mesh_topology(obj, merge_dist=1e-4, dry_run=False)` | 合併重複頂點、刪退化面／孤立元素、修封閉 Mesh 的法線 | 是 |
| `validate_mesh_topology(obj, profile=)` | 拓撲檢查（含自我交叉、島數／三角面上限、縮放）+ profile 判定 | 否 |
| `validate_asset_geometry(plan, root=)` | Geometry QA：對照 plan 檢查位置、大小、懸空 | 否 |
| `validate_visual(plan_path, out_dir, root=)` | Visual QA：輪廓 IoU、元件位置 IoU、色差，輸出疊圖 | 否（暫改渲染設定後還原） |
| `build_scene_from_plan(scene_path, export=)` | 依 ScenePlan 組裝場景並執行 Scene QA | 只新建／重建該場景與它用到的資產 |
| `optimize_lowpoly_mesh(obj, planar_angle_deg=1.0)` | 溶掉共平面的多餘邊、Flat Shading | 是 |
| `remesh_organic_mesh(obj, voxel_size=)` | Voxel Remesh，只允許 `organic` | 是 |
| `prepare_for_gltf(root, filepath, compress=)` | 驗證 root 底下所有 Mesh，全部通過才匯出 GLB（compress = meshopt） | 否 |
| `clear_backups(obj)` | 確認結果後刪除備份 mesh | — |
| `validate_plan(plan_or_path)` | 驗證 reference／asset／scene plan JSON | 否 |
| `build_asset_from_plan(plan, export=, preset=)` | 依 AssetPlan 建出整個資產（零件庫 → 編輯 → Union → wobble → bevel → 驗證 → 預算），可重複執行 | 只新建／重建該 plan 的 Object |

`faces` 可以是索引清單，或條件：`{"normal": [0, -1, 0], "bounds": [[x0,y0,z0], [x1,y1,z1]]}`。

錯誤碼：`OBJECT_NOT_FOUND`、`NOT_A_MESH`、`EDIT_MODE`、`INVALID_ARGUMENT`、`INVALID_GEOMETRY`、`NO_FACES_SELECTED`、`UNKNOWN_PROFILE`、`BOOLEAN_EMPTY`、`BOOLEAN_FACE_EXPLOSION`、`VALIDATION_FAILED`、`PROFILE_NOT_ALLOWED`、`EXPORT_FAILED`、`UNEXPECTED`。

## Profiles

| profile | 島數 | 開放邊 | 三角面上限 | 自我交叉 | bevel | wobble | 用途 |
|---|---|---|---|---|---|---|---|
| `building_shell` | =1 | ✗ | 3000 | fail | ✓ | ✓ | 建築主體、地基、壓頂（預設） |
| `roof` | =1 | ✗ | 2000 | fail | ✓ | ✓ | 獨立屋頂 |
| `trim` | ≤12 | ✗ | 800 | 只回報 | ✓ | ✓ | 樑、柱、雨遮、窗台 |
| `opening` | ≤6 | ✗ | 1500 | 只回報 | ✓ | ✗ | 門、窗框 |
| `glass` | ≤4 | 允許 | 200 | 只回報 | ✗ | ✗ | 玻璃 |
| `decoration` | ≤8 | 允許 | 1000 | 只回報 | ✗ | ✗ | 燈、招牌、盆栽 |
| `vegetation` | ≤8 | ✗ | 1000 | 只回報 | ✗ | ✗ | 藤蔓、灌木、樹幹 |
| `tile_array` | 不限 | ✗ | 3000 | 只回報 | ✗ | ✗ | 屋瓦 |
| `organic` | =1 | ✗ | 2000 | fail | ✗ | ✗ | 岩石、樹冠（允許 Remesh） |
| `terrain` | =1 | 允許 | 10000 | fail | ✗ | ✗ | 地形 |
| `road` | =1 | 允許 | 4000 | fail | ✗ | ✗ | 道路 |
| `water_surface` | =1 | 允許 | 6000 | fail | ✗ | ✗ | 海面 |

所有 profile 都要求：
- 0 重複頂點、0 退化面、0 孤立點／邊、0 非流形邊
- 不可以負縮放（非等比縮放只提醒）

ngon 只提醒。「只回報」的意思是：多島零件的島之間本來就會刻意穿插（葉團插進花盆、窗台疊在窗框上），所以只回報數值，不判定失敗。報告另外有 `self_intersections_within_islands`，只計算同一個島內部的交叉。

bevel／wobble 欄位由 orchestrator 讀取，決定建模時要不要倒角、做手繪偏移。

profile 存在 Object 的 custom property `lowpoly_profile`，匯出後是 Three.js 的 `object.userData.lowpoly_profile`。

## Geometry QA

`build_asset_from_plan` 建完會自動執行，也可以單獨呼叫 `api.validate_asset_geometry(plan)`。手動移動或修改零件後，用它重新檢查。

| 檢查 | 判定 | 內容 |
|---|---|---|
| `OUT_OF_BOUNDS` | fail | 世界外框超出 plan bounds，容差為 max(6 cm, 尺寸 × 5%)。Union 進來的元件會併入目標的範圍 |
| `UNDERFILLED` | warn | 某一軸的實際尺寸不到 plan 的一半 |
| `FLOATING` | warn | 底部離地超過 2 cm，而且沒有碰到任何物件 |

物件之間的穿插（門窗放進凹槽、柱子貼牆）是刻意的，Phase 6 有 Scene 關係後再判定。

## 還原機制

- 修改前把 mesh data 複製成 `<name>__backup_<n>`（fake user、不在場景裡）
- 操作失敗或驗證沒通過：自動換回，備份一併清掉
- 成功：保留備份，確認沒問題後呼叫 `clear_backups`

## 測試

```bash
# 147 個 headless 測試（不會碰到正在使用的 Blender）
~/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python tools/blender/tests/run.py [-- 關鍵字]

# plan 驗證、幾何產生器與零件庫測試（不需要 Blender）
python3 -m unittest discover -s tools/blender/tests -p "test_plan_schema.py"
python3 -m unittest discover -s tools/blender/tests -p "test_shapes.py"
python3 -m unittest discover -s tools/blender/tests -p "test_visual_metrics.py"
python3 -m unittest discover -s tools/blender/tests -p "test_scene_terrain.py"

# 重新產生小屋 GLB → public/models/lowpoly_house/lowpoly_house.glb
~/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python tools/blender/scripts/build_house.py

# Three.js 載入、Raycaster、獨立操作檢查
node tools/blender/tests/threejs_check.mjs
```

## 目錄

```
tools/blender/
├─ WORKFLOW.md            AI 建模流程（Cursor rule、Claude Code skill 都指向這裡）
├─ plans/                 test01／test02 的 reference 與 plan、tree_round.plan.json、sample_town.scene.json
├─ lowpoly_kit/
│  ├─ api.py              對外函式（備份、還原、驗證都在這層處理）
│  ├─ result.py           回傳格式與錯誤碼
│  ├─ backup.py           mesh 備份／還原、Boolean 用過的物件移到備份 collection
│  ├─ evaluate.py         用 depsgraph 烘焙 modifier（不用 bpy.ops）
│  ├─ mesh_builder.py     from_pydata 建 Mesh、材質、box／prism_from_outline
│  ├─ extrusion.py        extrude／inset／inset_extrude／bridge（bmesh.ops）
│  ├─ boolean_engine.py   Union modifier + solver 退回
│  ├─ repair.py           安全修復
│  ├─ lowpoly.py          dissolve_limit + Flat Shading
│  ├─ remesh_engine.py    Voxel Remesh
│  ├─ validation/         checks（9 項）／profiles／report
│  ├─ export/             gltf_export（meshopt、gpu instancing）／glb_stats／manifest
│  ├─ pipeline/           schema（三種 plan 驗證）／detail_config／vocab，不依賴 bpy
│  ├─ shapes.py           幾何產生器（grid_slab／prism／loft／lathe／sweep／blob），不依賴 bpy
│  ├─ components/         零件庫（25 個 kind）與 layout，不依賴 bpy
│  ├─ appearance/         palette atlas 色格配置（不依賴 bpy）
│  ├─ build/              orchestrator／materials／appearance／wobble／bevel（Blender 端建模流程）
│  ├─ qa/                 geometry、visual、scene（Scene QA）、preview（預覽渲染）、metrics（不依賴 bpy）
│  ├─ scene/              terrain（高度場、道路、外框幾何，不依賴 bpy）、assembly（場景組裝）
│  └─ presets/building.py Low Poly 小屋
├─ mcp_server/           server.py（lowpoly MCP server）
├─ scripts/              build_from_plan.py（資產）、build_scene.py（場景）、mcp_runner.py（MCP／e2e 共用）、overlay_reference.py、build_house.py
└─ tests/                 run.py、fixtures、test_*.py（test_plan_schema、test_shapes 不需要 Blender）、threejs_check.mjs、threejs_plan_check.mjs
```
