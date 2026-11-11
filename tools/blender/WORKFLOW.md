# Blender 建模流程（AI 編輯器共用）

用 Blender MCP 建立或修改 3D 模型時，一律照這份流程走。
Cursor（`.cursor/rules/blender-modeling.mdc`）和 Claude Code（`.claude/skills/blender-modeling/SKILL.md`）都只是指向這份文件；**流程要改就改這裡**，兩邊會同步。

核心原則：**AI 只負責「看」和「規劃」（輸出 plan JSON），幾何一律由 `lowpoly_kit` 依 plan 確定性產生。**

## 禁止事項

1. 不可以用 `primitive_cube_add`／cylinder／sphere 堆疊後 Join。外觀相連但拓撲不相連，屋頂會變成十幾個幾何島。
2. 不可以用頂點拼出 box／sphere 再塞進同一個 mesh。效果等於 Join，只是比較難發現。
3. 不可以跳過 plan 確認就直接建模，也不可以拿 `look` 目測的結果當作驗證通過的依據。

## 0. 開工前

1. 呼叫 `get_addon_status`、`get_scene_info`，確認 Blender 版本與目前場景。基準版本是 Blender 5.2 LTS、mcp-for-blender 2.2.7。
2. 只透過 `execute_blender_code` 載入 lowpoly_kit，不要假設 MCP 有其他沒確認過的工具：

```python
import sys
sys.path.insert(0, "/Users/tony.wu/SelfCode/Self/git_proj/vite_test_three/tools/blender")
import lowpoly_kit
lowpoly_kit = lowpoly_kit.reload_all()  # 程式碼改過才需要
api = lowpoly_kit.api
```

這個絕對路徑只寫在這裡。搬到其他專案時改這一行即可。

## 1. Reference 分析（有參考圖時）

輸出 `tools/blender/plans/<id>.reference.json`（`lowpoly.reference/1`），格式見 `openspec/changes/add-asset-plan-schema/design.md` §3.2。

- 座標一律正規化：0～1，原點在左上角。
- 每個元件、輪廓、視角都要標 `source`：`observed`（看得到）或 `inferred`（推測）。推測的必須寫 `assumption`。
- 一定要有 `scale_anchor`，例如門高 2.1 m，用來把整張圖換算成公尺。
- `excluded` 列出故意不做的東西，例如背景、電線、文字。
- 用疊圖校正元件框，並從原圖取樣色票：

```bash
Blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/scripts/overlay_reference.py -- tools/blender/plans/<id>.reference.json <暫存目錄>/overlay.png
```

## 2. Plan（交給使用者確認）

輸出 `tools/blender/plans/<id>.plan.json`（`lowpoly.asset/1`）；整個場景則輸出 `<id>.scene.json`（`lowpoly.scene/1`）。

- 原點在建築 footprint 中心的地面上；+Z 朝上；正面朝 -Y；單位是公尺。
- 每個元件要有 `kind`、`tier`（primary／secondary／tertiary）、`method`、`profile`、`material`。primary 和 secondary 還要有 `bounds`。
- `method` 怎麼選：
  - 建築主體、平台：`component` 或 `custom_mesh`
  - 在既有 mesh 上長出細節：`extrude`／`inset_extrude`（必須有 `parent`）
  - 結構交接處（煙囪接屋頂等）：`boolean_union`（必須有 `union_into`）
  - 只有 `organic` 的岩石、樹冠可以用 `remesh`
- `profile` 怎麼選：
  - 建築主體、屋頂、地基：`building_shell`
  - 門、窗框：`opening`
  - 玻璃：`glass`
  - 水面：`water_surface`
  - 裝飾：`decoration`
  - 岩石、樹冠：`organic`
  - 樑、柱、雨遮、窗台：`trim`
  - 藤蔓、灌木、樹幹：`vegetation`
  - 獨立屋頂：`roof`；屋瓦：`tile_array`
  - 地形、道路：`terrain`、`road`
  - 每種 profile 都有島數與三角面上限（見 `tools/blender/README.md`）
- 細節程度用 `detail.preset`（`game_default`／`preview`／`hero`）加上 `overrides` 逐項調整。
- 驗證 plan，`ok` 必須是 True。`report.warnings` 也要逐條看過：

```python
r = api.validate_plan("/Users/tony.wu/SelfCode/Self/git_proj/vite_test_three/tools/blender/plans/<id>.plan.json")
print(r["ok"], r["errors"], r["report"]["warnings"])
```

在 Blender 外也能驗證：`from lowpoly_kit.pipeline import validate_plan`。

- 把元件清單整理成表格交給使用者，**確認後才可以建模**。表格欄位：id、kind、tier、method、profile、bounds 尺寸、observed／inferred。

## 3. 建模

**一律用 `api.build_asset_from_plan`，不要手寫 bmesh 建模。**

```python
r = api.build_asset_from_plan("/Users/tony.wu/SelfCode/Self/git_proj/vite_test_three/tools/blender/plans/<id>.plan.json")
print(r["ok"], r["errors"], r["changes"]["triangles"], r["changes"]["primitives"])
from lowpoly_kit.build.orchestrator import summary_table; print(summary_table(r))
```

- 同一份 plan 可以重複執行：會先清掉上一次的結果，結果完全相同。
- 想先快速看比例：加上 `preset="preview"`（不做 bevel、不建 tertiary 裝飾）。
- `errors` 會附上 `component`（元件 id）。修正方式是改 **plan**，不是改模型：
  - `COMPONENT_NOT_IMPLEMENTED`：kind 還沒有 builder，到 `lowpoly_kit/components/` 新增
  - `BUDGET_EXCEEDED`：調整 detail 或元件，不要直接把 budget 調大
- 零件庫裡的 builder 一律用 `shapes.py` 的產生器（`grid_slab`、`prism`、`loft`、`lathe`、`sweep`、`blob`）建出連續的拓撲。新增 builder 時，在 `tests/test_shapes.py` 補上流形測試。
- 背景模式建模、匯出、輸出預覽圖（正面圖會和參考圖逐像素對齊，並輸出並排比較圖）：

```bash
Blender --background --factory-startup --python-exit-code 1 --python tools/blender/scripts/build_from_plan.py \
  -- tools/blender/plans/<id>.plan.json --export --render <暫存目錄>
```

- plan 以外的臨時修改，才直接用 `create_connected_mesh`／`extrude_mesh_region`／`boolean_union_objects`，而且每次都要檢查 `ok`。

## 3b. 組裝場景（ScenePlan）

- 場景用到的每個資產都要先有通過 QA 的 AssetPlan。
- 擺放規則：
  - 資產正面朝 -Y。道路北側的建築轉 0°、南側轉 180°，正面才會朝向道路
  - 重複的植物、小物用 `instance: true`
- 用 `api.build_scene_from_plan(scene_path)` 組裝，**不要手動複製物件**。Scene QA 有 fail 時要改 plan 的擺放位置，不是移動 Blender 裡的物件。
- 預覽：`scripts/build_scene.py -- <scene.json> --render <目錄>`，輸出俯視與 3/4 視角。

## 4. 驗證

1. `build_asset_from_plan` 已經對每個 Object 做過 repair 和 profile 驗證，結果在 `r["report"]["objects"]`。`building_shell` 必須是 1 個 component、0 non-manifold。
   - 拓撲檢查包含自我交叉、島數與三角面上限、負縮放
   - Geometry QA 的結果在 `r["report"]["geometry"]`，會檢查超出 bounds、尺寸不足、懸空
   - 手動調整零件後，用 `api.validate_asset_geometry(plan)` 重新檢查
2. 有正面參考圖時，執行 Visual QA：`api.validate_visual(plan_path, out_dir)`，或在背景模式加上 `--render`。
   - 判定看數字：輪廓 IoU ≥ 0.85、元件位置 IoU 平均 ≥ 0.7；色差只提醒
   - 讀 `overlay.png`（綠 = 重疊、紅 = 模型缺少、藍 = 模型多出來）和 `compare.png`，寫出 AI 評語：差異、可能原因、要改 plan 的哪個欄位
   - 評語附在回報中，不影響判定；不可以用評語推翻數字
   - 位置 IoU 偏低時，先檢查 plan 的 bounds 和 builder 是否填滿 bounds，再看 instance 是否形狀不合
3. `look` 只用來確認外觀，不能當作拓撲或視覺通過的依據。

## 5. 匯出給 Three.js

1. 所有部件放在**一個根 Empty** 底下；需要點擊或做動畫的部件保留成獨立 Object。
2. 不可以把整個場景合併成單一 Mesh，也不要拆得太碎。數量對照 plan 的 `budget`。
3. `build_asset_from_plan(plan, export=True)`：全部驗證通過才會匯出到 plan 的 `export.path`。
4. 用 `node tools/blender/tests/threejs_plan_check.mjs <plan.json>` 檢查 Three.js 端：
   - 只有一個根節點
   - clickable 元件是獨立節點
   - 射線打得到門
   - draw call 在預算內
   - 只有玻璃是半透明

## 6. 回報

給使用者一份品質報告表格：
- Visual QA：輪廓 IoU、元件位置 IoU 平均、偏低的元件、色差警告、AI 評語
- 每個 Object 的 profile、components、non-manifold、面數、ngon、是否通過
- GLB 路徑、primitive 數、三角面數，並和 plan 的 `budget` 比較

沒通過的項目要明講，不可以把「有建出來」說成「驗證通過」。
