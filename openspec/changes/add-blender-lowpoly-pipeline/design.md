# Design

> 本變更是 Blender 端的 Python 工具，不是 Three.js 頁面；模板中的 Camera／Render Loop 等章節改寫為對應的 Blender 內容。

## 1. 執行環境與整合方式

- 已確認的環境（Phase 1）：
  - Blender 5.2.3 LTS，執行檔 `~/Applications/Blender.app/Contents/MacOS/Blender`
  - 內建 Python 3.13.13，可用 `bmesh`、`mathutils`、`numpy`
  - Boolean solver：`FLOAT`、`EXACT`、`MANIFOLD`
  - `mcp-for-blender` 2.2.7（uvx），addon 1.8，protocol 15
- 整合方式（三案比較後採用 C）：
  - A. Fork MCP 新增工具：要同時維護 server 與 addon，跟上游衝突，不採用
  - B. 另寫 MCP server：要重寫 socket protocol，且搶同一條連線，留待介面穩定後評估
  - **C. 本地函式庫**：放在 repo，透過 `execute_blender_code` 載入，不動 MCP；可用 headless Blender 測試
- 呼叫方式：

  ```python
  import sys, importlib
  sys.path.insert(0, "<repo>/tools/blender")
  import lowpoly_kit
  importlib.reload(lowpoly_kit)  # 開發中改了程式碼要 reload，否則拿到的是舊模組
  print(lowpoly_kit.api.validate_mesh_topology("House_Body", profile="building_shell"))
  ```

## 2. Module Breakdown（模組拆分）

```
tools/blender/
├── lowpoly_kit/
│   ├── __init__.py          ← 只匯出 api，並 reload 子模組
│   ├── api.py               ← 7 個對外函式；統一回傳格式與錯誤處理
│   ├── result.py            ← Result 結構、例外轉換成 errors
│   ├── backup.py            ← Mesh data 備份與還原
│   ├── mesh_builder.py      ← from_pydata／BMesh 建立 Mesh、指定材質
│   ├── extrusion.py         ← extrude／inset／bridge_loops（bmesh.ops）
│   ├── boolean_engine.py    ← Union modifier → apply → repair
│   ├── repair.py            ← remove_doubles、dissolve_degenerate、recalc_face_normals、刪孤立頂點
│   ├── remesh_engine.py     ← 只允許 organic profile 使用的 Voxel Remesh
│   ├── lowpoly.py           ← planar dissolve、shade flat
│   ├── validation/
│   │   ├── checks.py        ← 9 項檢查，只讀
│   │   ├── profiles.py      ← 依物件類型的規則
│   │   └── report.py        ← 套用 profile，產生 pass／warn／fail
│   ├── export/gltf_export.py
│   └── presets/building.py  ← 小屋：地基、主體、屋頂、煙囪、門、窗
└── tests/
    ├── run.py               ← 進入點，執行 tests/test_*.py，失敗時 exit code 非 0
    ├── fixtures.py          ← 建測試用 Mesh
    └── test_*.py
```

- 職責邊界：
  - `validation/` 只讀，不修改任何資料（在副本 BMesh 上計算）
  - 會修改模型的模組一律經過 `api.py`，由 `api.py` 負責備份、還原與再驗證
  - 只使用 `bpy`、`bmesh`、`mathutils`；盡量用 `bmesh.ops` 而非 `bpy.ops`，避免依賴 context／選取狀態
- 刻意不做：`primitive_builder`、`optimize.py`、terrain／vegetation／props preset、`config/` 目錄（profile 已足夠），有實際需求再加

## 3. 對外介面（api.py）

統一回傳格式：

```python
{
  "ok": bool,
  "object": "House_Body",
  "changes": {"verts": [before, after], "faces": [before, after]},
  "report": {...} | None,          # 有驗證時附上
  "errors": [{"code": "...", "message": "..."}],
  "backup": "House_Body__backup_1" | None,
}
```

| 函式 | 參數 | 修改模型 | 說明 |
|---|---|---|---|
| `create_connected_mesh` | `name, verts, faces, collection=None, profile=None, material=None` | 只新建 | 建立後若有 profile 就順便驗證 |
| `extrude_mesh_region` | `obj, faces, mode="extrude"\|"inset", depth=0, thickness=0, individual=False` | 是 | `faces` 可以是 index 清單，或 selector（例如 `{"normal": [0,0,1]}`） |
| `boolean_union_objects` | `target, others, solver="MANIFOLD", keep_others=False, max_face_ratio=4.0` | 是 | 套用 → repair → 驗證；面數超過比例就還原 |
| `repair_mesh_topology` | `obj, merge_dist=1e-4, fix_normals=True, dry_run=False` | 是（dry_run 除外） | 回報每一項修了多少 |
| `validate_mesh_topology` | `obj, profile="building_shell", merge_dist=1e-4` | 否 | 回傳 9 項數值與判定 |
| `optimize_lowpoly_mesh` | `obj, planar_angle_deg=1.0, shade_flat=True` | 是 | 只溶掉共平面的多餘邊，不減到變形 |
| `prepare_for_gltf` | `root, filepath, apply_modifiers=True, validate=True` | 否 | 驗證 root 底下所有 Mesh，有 fail 就不匯出；modifier 只套用在匯出資料上，不需要複製 |

錯誤碼：`OBJECT_NOT_FOUND`、`NOT_A_MESH`、`INVALID_GEOMETRY`、`BOOLEAN_EMPTY`、`BOOLEAN_FACE_EXPLOSION`、`VALIDATION_FAILED`、`PROFILE_NOT_ALLOWED`、`EXPORT_FAILED`。函式不往外丟例外，一律轉成 `errors` 並設 `ok=False`。

## 4. Validation 設計

### 9 項檢查（checks.py）

| 檢查 | 算法 |
|---|---|
| Non-Manifold Edges | `not e.is_manifold and not e.is_boundary` |
| Boundary Edges | `e.is_boundary` |
| Loose Vertices | `not v.link_edges`；另計沒有面的孤立邊 |
| Duplicate Vertices | KD-tree（`mathutils.kdtree`）找距離 < `merge_dist` 的頂點對 |
| Degenerate Faces | 面積 < ε，或邊長 < ε |
| Normal Direction | 在副本上 `recalc_face_normals` 後比對，統計相反的面；只對封閉 Mesh 判定 |
| Connected Components | 沿邊 BFS 計算島數；**先在副本上合併重複頂點再算**，同時回報合併前與合併後的島數，以分辨「沒接上」與「只是重複頂點」 |
| Face Count | 面數與三角化後的三角面數 |
| Ngon Count | 頂點數 > 4 的面 |

Connected Components 另外回報每個島的頂點數與 world bounding box，方便定位是哪一塊沒接上。

### Profiles（profiles.py）

| profile | components | non-manifold | boundary | ngon | normal | remesh |
|---|---|---|---|---|---|---|
| `building_shell` | == 1 | 0 | 0 | warn | 必須一致 | 禁止 |
| `opening` | 不限 | 0 | 0 | warn | 必須一致 | 禁止 |
| `glass` | 不限 | 0 | 允許 | — | 不判定 | 禁止 |
| `water_surface` | == 1 | 0 | 允許 | — | 不判定 | 禁止 |
| `decoration` | 不限 | 0 | 允許 | — | 不判定 | 禁止 |
| `organic` | == 1 | 0 | 0 | — | 必須一致 | 允許 |

所有 profile 都要：0 duplicate、0 degenerate、0 loose。Profile 可以存在 Object 的 custom property `lowpoly_profile`，匯出時沿用。

## 5. Low Poly 與 Hierarchy 規範

- 預設 flat shading；不加 Subdivision；Bevel 的 segments ≤ 1
- 每棟建築一個根 Empty，例如 `House_Root`，底下放：`Foundation`、`Body`（主體 + 煙囪 Union 後）、`Roof`、`Door`、`Window_*`
- 需要點擊或動畫的部分（門、窗）保留獨立 Object；其他靜態部分可依材質合併
- 座標：Blender +Z 朝上，匯出轉成 glTF +Y 朝上；正面朝 -Y（匯出後是 +Z）；1 單位 = 1 公尺

## 6. 備份與還原（backup.py）

- 修改前：`obj.data.copy()`，命名為 `<name>__backup_<n>`，設 `use_fake_user=True`，不連結到場景
- 失敗時：`obj.data = backup`，並刪除失敗的那份資料
- 成功時：保留最近一份備份，由呼叫端決定要不要清掉（提供 `clear_backups(obj)`）

## 7. 匯出（gltf_export.py）

- 只匯出指定 root 的階層（`use_selection` + 選取 root 與所有子物件），不帶燈光、攝影機
- `export_apply=True`、`export_yup=True`、`export_format` 從 `bl_rna` 讀取 GLB 的 identifier
- 匯出後回報：節點數、Mesh 數、primitive 數（≈ draw call）、三角面數、檔案大小

## 8. 測試與驗證策略

- 執行：`Blender --background --factory-startup --python tools/blender/tests/run.py`（不碰使用者正在用的 Blender）
- 測試案例：

| 測試 | 預期 |
|---|---|
| 兩個不相交的 cube Join | components = 2 |
| 兩塊共面、頂點重疊但未合併 | 合併前 2、合併後 1；回報有 duplicate；repair 後 1 個島 |
| 翻轉一個面 | 1 個法線反向的面；repair 後 0 |
| 開放平面套 `water_surface` | pass |
| 開放平面套 `building_shell` | fail（boundary） |
| 退化面（三點共線） | degenerate ≥ 1；repair 後 0 |
| `create_connected_mesh` 建 L 形 prism | 1 個島、封閉 |
| inset + extrude 開窗洞 | 仍是 1 個島、0 non-manifold |
| Boolean Union 兩個重疊的 cube | 1 個島、0 non-manifold |
| Boolean 不重疊的兩個 cube | 2 個島 → `building_shell` fail |
| 故意讓 repair 失敗 | 自動還原，頂點數不變 |
| 匯入 `project_room.glb` 驗證 | `Roof` components = 18 |
| 小屋 preset + `prepare_for_gltf` | 全部 pass，產出 GLB，單一根節點 |

- Three.js 驗證：`tools/blender/tests/threejs_check.mjs` 在 Node 裡用專案的 three 載入 GLB，確認 Raycaster 可點到 `Door` 等子物件（不新增頁面）
- 回歸：不動 `src/`，`npm run build` 仍通過
