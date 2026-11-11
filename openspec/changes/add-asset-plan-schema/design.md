# Design

## 0. 整體 Roadmap（本 change 是 Phase 2）

```
Input（參考圖 / 文字 / 既有資產）
   ▼
AI（Claude，在 MCP client 端）── 只輸出 JSON ──▶ ReferenceSpec / AssetPlan / ScenePlan   ← 本 change
   ▼
lowpoly_kit（Blender 內，確定性執行）
   Geometry → Detail（P/S/T）→ Topology repair → Appearance → Scene Assembly
   ▼
QA：Geometry / Topology / Scene（程式判定）＋ Visual（IoU 程式判定 + AI 評語）
   ▼  失敗 → auto repair（最多 2 次）→ 再驗證
Output：.blend / GLB（meshopt）/ Three.js manifest
```

| Phase | 內容 | 相依 |
|---|---|---|
| 1 | 現況調查（已完成） | — |
| **2** | **Reference + Planning 資料契約（本 change）** | 1 |
| 3 | Geometry + Detail：bevel、loft/lathe/sweep、`components/` 零件庫、orchestrator | 2 |
| 4 | Topology + Geometry QA：新增 profile、self-intersection、尺寸比例、`decoration` 加上限 | 1（可以和 2 並行） |
| 5 | Material + Visual QA：palette atlas、vertex color、lighting rig、silhouette IoU | palette 不依賴其他 Phase；IoU 依賴 3 |
| 6 | Scene Assembly：hierarchy、placement、instancing、terrain | 3、4 |
| 7 | Export + Three.js：meshopt、gpu_instances、manifest、`gltf-transform` 檢查、headless MCP server | 6 |
| 8 | Test A / Test B 端到端自動化 | 全部 |

**核心原則：** AI 只負責「看」和「規劃」，幾何一律由程式依 plan 確定性產生。同一份 plan 跑兩次，結果必須完全相同。

## 1. 座標與單位約定

沿用 lowpoly_kit 現有的約定：

- 單位是公尺；Blender 為 +Z 朝上；正面朝 -Y；匯出 glTF 時轉成 Y 朝上。
- 參考圖座標一律**正規化**：`[x, y]` 介於 0～1，原點在左上角，y 向下。存成正規化座標，換解析度也不會失效。
- plan 裡的位置以資產自己的根 Empty 為原點，**原點放在建築 footprint 中心的地面上**：x、y 對稱，z 從 0 往上。`dimensions` 是這個原點周圍的外框。
  - 實作時從「正面底邊中央」改過來：雨棚、台階、盆栽會凸出到正面之前，原點放在正面時外框不對稱，不好檢查；放在中心也方便 Scene 擺放時繞原點旋轉。

## 2. 模組拆分

```
tools/blender/
├─ WORKFLOW.md                 ★ 建模流程的單一來源（兩個編輯器共用）
├─ plans/                      ★ plan JSON
│  ├─ test01.reference.json
│  ├─ test01_shop.plan.json
│  └─ sample_town.scene.json
└─ lowpoly_kit/
   ├─ api.py                   ✎ 新增 validate_plan
   └─ pipeline/                ★
      ├─ __init__.py
      ├─ schema.py             三種 schema 的欄位定義、驗證、錯誤路徑
      ├─ detail_config.py      DetailConfig、預設等級、合併覆寫
      └─ vocab.py              允許的 kind／method／profile／tier 清單
.cursor/rules/blender-modeling.mdc   ✎ 只留觸發條件，內容指向 WORKFLOW.md
.claude/skills/blender-modeling/SKILL.md   ★ 同上（Claude Code 依 description 自動載入）
```

職責與邊界：

- `pipeline/*` **不 import `bpy`**，可以在 Blender 外用一般 Python 3.10+ 測試。
- `api.validate_plan` 是唯一的對外入口，負責把錯誤包成現有的 result 格式。
- `vocab.py` 只列出名稱。像 `profile` 這類清單直接從 `validation/profiles.py` 讀取，不重複定義；Phase 3 的零件庫完成後，`kind` 清單改從零件庫註冊表產生。

## 3. Schema

### 3.1 共用欄位

每個描述「事實」的節點都要有：

| 欄位 | 型別 | 規則 |
|---|---|---|
| `source` | `"observed"` \| `"inferred"` | 必填 |
| `confidence` | 0～1 | 必填 |
| `assumption` | string | `source="inferred"` 時必填 |

### 3.2 ReferenceSpec（`*.reference.json`）

```jsonc
{
  "schema": "lowpoly.reference/1",
  "id": "test01",
  "image": {"path": "tools/img/test01.jpg", "width": 736, "height": 1308},
  "medium": "watercolor illustration",           // 原圖媒材，用來決定風格轉換方式
  "view": {"type": "front_ortho", "source": "observed", "confidence": 0.9},
  "scale_anchor": {"component": "door", "axis": "height", "meters": 2.1},
  "silhouette": {"outline": [[0.19,0.05],[0.82,0.05], ...], "source": "observed", "confidence": 0.8},
  "components": [
    {
      "id": "door", "kind": "door", "tier": "secondary",
      "bbox": [0.53, 0.57, 0.75, 0.85],          // 正規化 [x0, y0, x1, y1]
      "material_hint": "lime_paint", "parent": "facade",
      "source": "observed", "confidence": 0.9
    }
  ],
  "hidden": [
    {"id": "depth", "assumption": "建築深度 = 寬度 × 1.6（窄店面常見比例）", "source": "inferred", "confidence": 0.4}
  ],
  "palette": [{"name": "lime_paint", "hex": "#C9D72B", "usage": "外牆、門"}],
  "excluded": [{"what": "電線", "reason": "不建模，避免細長幾何和 draw call"}]
}
```

`view.type` 可以是：`front_ortho`、`three_quarter`、`side`、`top`、`unknown`。這個值會決定 Phase 5 渲染 silhouette 時用哪種相機。

### 3.3 AssetPlan（`*.plan.json`）

```jsonc
{
  "schema": "lowpoly.asset/1",
  "id": "test01_shop",
  "reference": "test01",                          // 可省略（只有文字 prompt 時）
  "notes": "自由文字，驗證器不檢查",
  "dimensions": {"w": 3.9, "d": 6.0, "h": 7.1},   // 以原點為中心的外框；primary／secondary 不可以超出
  "detail": {"preset": "game_default", "overrides": {}},
  "style": {"edge_wobble": 0.02, "palette": "test01"},
  "materials": [{"name": "lime_paint", "hex": "#D6DE24", "roughness": 0.85},
                {"name": "glass", "hex": "#302611", "roughness": 0.1, "alpha": 0.45},
                {"name": "lamp_glow", "hex": "#F0DC24", "emissive": true}],
  "budget": {"max_tris": 5000, "max_primitives": 40},
  "components": [
    {
      "id": "facade", "kind": "wall_block", "tier": "primary",
      "method": "component", "profile": "building_shell", "material": "lime_paint",
      "params": {"openings": ["upper_window", "door", "shop_window"]},   // kind 專屬參數
      "bounds": [[-1.33, -2.125, 0.0], [1.33, 2.125, 6.45]],           // 公尺，資產區域座標
      "source": "observed", "confidence": 0.9
    },
    {
      "id": "chimney", "kind": "chimney", "tier": "secondary",
      "method": "boolean_union", "union_into": "facade", "profile": "building_shell", "material": "brick",
      "bounds": [[0.4, 1.2, 6.05], [0.85, 1.65, 7.0]],
      "source": "inferred", "confidence": 0.3, "assumption": "圖上看不到；依 Test A 需求放在屋頂後側"
    }
  ],
  "export": {
    "path": "public/models/test01_shop/test01_shop.glb",
    "clickable": ["door", "awning"],
    "anim_groups": {"lamp_glow": ["wall_lamp", "street_lamp"]},
    "instance_groups": {"pot_small": ["pot_1", "pot_2"]}
  }
}
```

`method` 可以是：`custom_mesh`、`extrude`、`inset_extrude`、`bridge`、`boolean_union`、`remesh`、`component`。
`tier` 可以是：`primary`、`secondary`、`tertiary`。
`profile` 只接受 `validation/profiles.py` 中現有的 6 種；Phase 4 新增的 `roof`、`trim` 等加進去後自動生效。

位置用 `bounds` 表示，`transform` 為選填。primary／secondary 必須有 `bounds`，因為它們決定整體比例；tertiary 可以省略，也可以放在外框外，例如門口盆栽、路燈。

**預算修正：** Phase 1 規劃時寫的「單棟 ≤ 4 個 primitive」不切實際。門、窗、燈等需要點擊或做動畫的部件都必須是獨立 Object，而每個 Object 匯出後至少是 1 個 primitive。test01_shop 估計有 26 個 Object，所以 `max_primitives` 設 40（桌機）。palette atlas（Phase 5）減少的是「每個 Object 內的材質數」，不是 Object 數。

### 3.4 ScenePlan（`*.scene.json`）

```jsonc
{
  "schema": "lowpoly.scene/1",
  "id": "sample_town",
  "terrain": {"kind": "grid_hills", "size": [60, 60], "params": {"amplitude": 1.5, "seed": 7}},
  "roads": [{"id": "main", "polyline": [[-25,0],[0,4],[25,0]], "width": 3.0}],
  "assets": [{"asset_id": "test01_shop", "plan": "test01_shop.plan.json"}],
  "placements": [
    {"id": "shop_a", "asset_id": "test01_shop", "location": [4, 6, 0], "rotation_z_deg": 180, "scale": 1, "instance": false}
  ],
  "budget": {"max_tris": 150000, "max_draw_calls": 150},
  "hierarchy": ["Terrain", "Roads", "Buildings", "Vegetation", "Props"]
}
```

燈光不寫在 ScenePlan 裡：兩邊的強度單位不同，場景燈光由 Three.js 端重建。

## 4. 驗證規則與錯誤碼

驗證不會在第一個錯誤就停下，而是一次收集**全部**錯誤，每筆都附上 JSON path，例如 `components[3].profile`。

| 錯誤碼 | 條件 |
|---|---|
| `PLAN_FILE_INVALID` | 傳入的檔案路徑不存在，或內容不是合法的 JSON |
| `PLAN_SCHEMA_UNKNOWN` | `schema` 欄位不是三種已知值之一 |
| `PLAN_FIELD_MISSING` / `PLAN_FIELD_TYPE` | 必填欄位缺漏或型別錯誤 |
| `PLAN_ENUM_INVALID` | `kind`／`method`／`tier`／`profile`／`view.type` 不在允許清單中 |
| `PLAN_ID_DUPLICATE` | 元件 id 重複 |
| `PLAN_REF_MISSING` | `parent`、`union_into`、`openings`、`clickable`、`anim_groups`、`asset_id` 指向不存在的 id |
| `PLAN_CYCLE` | parent 鏈形成循環 |
| `PLAN_METHOD_NOT_ALLOWED` | `remesh` 用在非 `organic` profile；`boolean_union` 沒有 `union_into` |
| `PLAN_OUT_OF_BOUNDS` | 元件外框超出 `dimensions` 加 5% 容差（僅限 primary／secondary） |
| `PLAN_INFERRED_NO_ASSUMPTION` | `source="inferred"` 卻沒有 `assumption` |
| `PLAN_RANGE` | `confidence`、`bbox`、`DetailConfig` 數值超出範圍 |
| `PLAN_BUDGET_INVALID` | 預算 ≤ 0，或超過桌機上限（單一資產 20k tris；場景 300k tris、300 draw calls） |

報告（`result.report`）的內容：

```jsonc
{
  "schema": "lowpoly.asset/1",
  "counts": {"components": 24, "primary": 3, "secondary": 9, "tertiary": 12},
  "inferred_ratio": 0.17,
  "warnings": [{"path": "components[7]", "code": "LOW_CONFIDENCE", "message": "confidence 0.2 < 0.3"}]
}
```

`inferred_ratio > 0.4` 時給 warning，提醒使用者這份 plan 有一大半是推測的。

警告（不影響 `ok`）：

| 警告碼 | 條件 |
|---|---|
| `LOW_CONFIDENCE` | confidence < 0.3 |
| `GENERIC_KIND` | kind 是 `generic` |
| `HIGH_INFERRED_RATIO` | 推測元件比例 > 0.4 |
| `INSTANCE_KIND_MIXED` | 同一個 instance 群組裡有不同 kind |
| `BUDGET_PRIMITIVES` | 會產生獨立 Object 的元件數超過 `max_primitives` |

## 5. DetailConfig

| 參數 | 範圍 | game_default | preview | hero |
|---|---|---|---|---|
| `primary_quality` | 1～3 | 2 | 1 | 3 |
| `secondary_density` | 0～1 | 0.8 | 0.4 | 1.0 |
| `tertiary_density` | 0～1 | 0.6 | 0.0 | 1.0 |
| `geometry_complexity`（圓形分段數） | 4～16 | 8 | 6 | 12 |
| `bevel_quality` | 0 / 1 / 2 | 1 | 0 | 2 |
| `material_quality` | `flat` / `palette` / `palette_vc` | `palette_vc` | `flat` | `palette_vc` |
| `texture_quality` | `none` / `atlas64` / `atlas256` | `atlas64` | `none` | `atlas256` |

- 解析順序：preset → `overrides`；每個參數各自合併，彼此不影響。
- 本 change 只定義、驗證參數，**數值怎麼影響幾何由 Phase 3 實作**。
- `tertiary_density` 的抽樣使用固定 seed（由 plan id 雜湊得出），確保每次結果相同。

## 6. Test A 參考圖分析：`tools/img/test01.jpg`

以下是 Claude 視覺的初步分析。實作時寫進 `test01.reference.json`，並用疊圖人工校正。

### 6.1 觀察得到的資訊（observed）

- **視角：** 正面、近乎正交（`front_ortho`）。這對 Phase 5 的 silhouette IoU 有利，因為不需要估算透視相機。
- **媒材：** 水彩加鋼筆線稿。牆面輕微歪斜、線條抖動。
- **整體：** 兩層樓的窄店面，平屋頂加女兒牆壓頂。外牆寬高比約 0.41。以門高 2.1 m 換算，外牆約寬 2.7 m、高 6.6 m。

| 元件 | tier | bbox 初估（x0,y0,x1,y1） | 備註 |
|---|---|---|---|
| 外牆主體 | primary | 0.19, 0.05, 0.82, 0.92 | 萊姆綠灰泥 |
| 女兒牆壓頂 | primary | 0.17, 0.04, 0.82, 0.06 | 紅褐色，往外突出 |
| 左側磚柱 + 剝落磚面 | secondary | 0.19, 0.06, 0.48, 0.80 | 斜向露出的磚，用 vertex color 或材質區塊處理，不是另外的幾何 |
| 二樓窗（框、窗格、窗台） | secondary | 0.30, 0.18, 0.53, 0.33 | 用 inset_extrude 做出凹窗 |
| 二樓小雨遮 | secondary | 0.25, 0.145, 0.59, 0.16 | |
| 窗台花箱 + 植物 | tertiary | 0.29, 0.29, 0.53, 0.33 | |
| 雨棚（含側面折回） | secondary | 0.20, 0.46, 0.82, 0.57 | 黃色，有厚度 |
| 雨棚上方橫樑 | secondary | 0.19, 0.455, 0.82, 0.47 | |
| 圓形招牌 | tertiary | 0.51, 0.485, 0.63, 0.555 | 深咖啡色圓盤，文字不建模 |
| 店門（上半玻璃、格柵、門把） | secondary | 0.53, 0.57, 0.75, 0.85 | **比例錨點** |
| 左側展示櫥窗 | secondary | 0.27, 0.57, 0.50, 0.80 | 玻璃加內部海報（貼圖色塊） |
| 門前台階（2～3 階） | secondary | 0.50, 0.85, 0.79, 0.92 | |
| 壁燈（含支架） | tertiary | 0.67, 0.18, 0.77, 0.34 | emissive |
| 頂部圓燈 | tertiary | 0.68, 0.085, 0.72, 0.115 | |
| 黑貓剪影 | tertiary | 0.59, 0.405, 0.66, 0.455 | 坐在雨棚上 |
| A 字黑板 | tertiary | 0.26, 0.80, 0.40, 0.93 | 獨立 prop |
| 路燈（燈柱 + 燈頭） | tertiary | 0.83, 0.26, 0.92, 0.92 | 獨立 prop，**不屬於建築** |
| 盆栽 ×3、藤蔓 | tertiary | 左 0.07–0.26、右 0.80–0.95，y 0.78–0.92 | instancing 候選 |

色票：萊姆綠 `#C9D72B`、雨棚黃 `#F2C632`、磚紅 `#B5533A`、壓頂紅褐 `#8E3B2C`、招牌咖啡 `#5A3A2A`、燈光暖黃 `#F4C04A`、台階灰 `#C9C9C2`、鐵件深灰 `#3A3A3A`、植物綠 `#6FA640`。以上都需要從原圖取樣後校正。

### 6.2 不建模的部分（excluded）

- 背景的青色水彩色塊：不是幾何。
- 電線：細長幾何會增加 draw call 和閃爍。
- 文字和海報細節：改用 palette 色塊表示。

### 6.3 推測的部分（inferred）

| 項目 | 假設 | confidence |
|---|---|---|
| 建築深度 | 寬度 × 1.6 ≈ 4.3 m | 0.4 |
| 側面與背面 | 和正面同材質，沒有開口 | 0.5 |
| 屋頂 | 平屋頂、女兒牆高 0.4 m | 0.6 |
| 煙囪、屋瓦 | **圖上看不到**，見 6.4 | — |

### 6.4 和原 Test A 清單的差異（待使用者確認）

原本 Test A 要求「屋頂、煙囪、屋瓦、樑柱」，但這張圖是平屋頂的店面：

- **屋頂：** 改成平屋頂、女兒牆和壓頂（observed）。
- **樑柱：** 對應左側磚柱和雨棚橫樑（observed）。
- **煙囪：** 以 `inferred` 放在屋頂後側，正面看不到，不影響 IoU。
- **屋瓦：** 圖上沒有。可以選擇：
  - (a) 雨棚做成瓦楞狀的條紋，取代屋瓦（建議）
  - (b) 後側加一小段斜屋頂來放屋瓦
  - (c) 從 Test A 清單中移除屋瓦

### 6.5 風格轉換（水彩 → Stylized Low Poly）

- 線條抖動 → `style.edge_wobble`：主體輪廓頂點加上固定 seed 的小幅偏移（≤ 2 cm）。直線太完美就會失去手繪感。
- 水彩的漸層 → vertex color 明度變化（Phase 5）。
- 鋼筆線稿 → **不做描邊**。描邊需要另外的 shader 或額外的幾何（inverted hull），會讓 draw call 加倍；列為 Phase 5 之後的選配。

## 7. 兩個編輯器共用的流程

- `tools/blender/WORKFLOW.md` 是單一來源，內容包括：
  1. 開工檢查
  2. Reference 分析（輸出 JSON）
  3. Plan（**交給使用者確認**）
  4. `validate_plan`
  5. 建模（Phase 3 之後是 `build_asset_from_plan`；在那之前沿用現有 api）
  6. 驗證
  7. 匯出
  8. 回報
- Cursor：`.cursor/rules/blender-modeling.mdc` 的 frontmatter 不變，內文縮短成「讀 `tools/blender/WORKFLOW.md`」，再加上 3 條禁止事項。
- Claude Code：`.claude/skills/blender-modeling/SKILL.md`。description 寫明觸發條件（Blender、建模、GLB、Low Poly），內文同樣指向 WORKFLOW.md。
- sys.path 用的絕對路徑只寫在 WORKFLOW.md 一處。

## 8. 測試與驗證策略

- `tools/blender/tests/test_plan_schema.py`：純 Python，可以單獨用 `python3 -m unittest` 執行，也會被 `tests/run.py` 收進來。
- 正例：3 份範例 plan。
- 反例：第 4 節每個錯誤碼至少一個 fixture，寫成 inline dict，不另外存檔。
- 疊圖：`tools/blender/scripts/overlay_reference.py`。在 headless Blender 裡用 numpy 讀原圖、畫出 bbox、存成 PNG 到暫存目錄，**不進版控**。
- 回歸：既有 45 個測試；`npm run build`。

## 9. 已確認事項（2026-11-11）

1. 屋瓦：採方案 (a)，雨棚做成瓦楞條紋（`awning.params.corrugated = true`）。
2. 比例錨點：門高 2.1 m。換算後 1 px ≈ 5.73 mm，外牆寬 2.66 m、高 6.45 m（不含壓頂）。
3. `edge_wobble` 預設 2 cm。

## 10. 實作時的校正

- 疊圖校正：`vine_right` 原本框到路燈支架，改到下方實際的藤蔓位置；`street_lamp` 左緣內縮。
- 色票：§6.1 的初估值和原圖取樣差距很大（例如磚紅初估 `#B5533A`，實際中位數是 `#94471C`），改用原圖取樣的中位數。卡通風格需要的飽和度調整由 Phase 5 的材質引擎負責，reference 只記錄觀察值。
- 盆栽：原圖盆底畫在地面線下方，換算後會浮在 7 cm 高，改成貼齊地面（z = 0）。
