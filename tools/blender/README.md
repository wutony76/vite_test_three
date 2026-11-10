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

## 建模流程

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
| `validate_mesh_topology(obj, profile=)` | 9 項檢查 + profile 判定 | 否 |
| `optimize_lowpoly_mesh(obj, planar_angle_deg=1.0)` | 溶掉共平面的多餘邊、Flat Shading | 是 |
| `remesh_organic_mesh(obj, voxel_size=)` | Voxel Remesh，只允許 `organic` | 是 |
| `prepare_for_gltf(root, filepath)` | 驗證 root 底下所有 Mesh，全部通過才匯出 GLB | 否 |
| `clear_backups(obj)` | 確認結果後刪除備份 mesh | — |

`faces` 可以是索引清單，或條件：`{"normal": [0, -1, 0], "bounds": [[x0,y0,z0], [x1,y1,z1]]}`。

錯誤碼：`OBJECT_NOT_FOUND`、`NOT_A_MESH`、`EDIT_MODE`、`INVALID_ARGUMENT`、`INVALID_GEOMETRY`、`NO_FACES_SELECTED`、`UNKNOWN_PROFILE`、`BOOLEAN_EMPTY`、`BOOLEAN_FACE_EXPLOSION`、`VALIDATION_FAILED`、`PROFILE_NOT_ALLOWED`、`EXPORT_FAILED`、`UNEXPECTED`。

## Profiles

| profile | 幾何島 | 開放邊界 | 法線 | 用途 |
|---|---|---|---|---|
| `building_shell` | 1 | 不允許 | 一致且朝外 | 建築主體、屋頂、地基（預設） |
| `opening` | 不限 | 不允許 | 一致且朝外 | 門、窗框 |
| `glass` | 不限 | 允許 | 不判定 | 玻璃 |
| `water_surface` | 1 | 允許 | 不判定 | 海面 |
| `decoration` | 不限 | 允許 | 不判定 | 裝飾品 |
| `organic` | 1 | 不允許 | 一致且朝外 | 岩石、小島（允許 Remesh） |

所有 profile 都要求：0 重複頂點、0 退化面、0 孤立點／邊、0 非流形邊。ngon 在建築類只會提醒。

profile 存在 Object 的 custom property `lowpoly_profile`，匯出後是 Three.js 的 `object.userData.lowpoly_profile`。

## 還原機制

- 修改前把 mesh data 複製成 `<name>__backup_<n>`（fake user、不在場景裡）
- 操作失敗或驗證沒通過：自動換回，備份一併清掉
- 成功：保留備份，確認沒問題後呼叫 `clear_backups`

## 測試

```bash
# 45 個 headless 測試（不會碰到正在使用的 Blender）
~/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python tools/blender/tests/run.py [-- 關鍵字]

# 重新產生小屋 GLB → public/models/lowpoly_house/lowpoly_house.glb
~/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
  --python-exit-code 1 --python tools/blender/scripts/build_house.py

# Three.js 載入、Raycaster、獨立操作檢查
node tools/blender/tests/threejs_check.mjs
```

## 目錄

```
tools/blender/
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
│  ├─ export/             gltf_export／glb_stats
│  └─ presets/building.py Low Poly 小屋
├─ scripts/build_house.py
└─ tests/                 run.py、fixtures、test_*.py、threejs_check.mjs
```
