# Design

## 1. 壓縮

- `export_glb(..., compress=True)` → `export_meshopt_compression_enable=True`、`export_meshopt_extension="EXT_meshopt_compression"`（three 的 MeshoptDecoder 支援這個擴充）。
- plan 的 `export.compress` 預設 true；測試可以關掉，以便直接讀未壓縮的 accessor。
- `glb_stats` 仍然從 accessor 的 count 計算三角面數（壓縮不會改變 count）。

## 2. manifest（`export/manifest.py`）

```jsonc
{
  "schema": "lowpoly.manifest/1", "kind": "asset" | "scene", "id": "...", "glb": "xxx.glb",
  "requires": ["EXT_meshopt_compression", "EXT_mesh_gpu_instancing"],
  "root": "test01_shop_Root",
  "clickable": ["test01_shop_door", ...],
  "anim_groups": {"lamp_glow": ["test01_shop_wall_lamp", ...]},
  "placements": [{"id": "shop_a", "asset": "test01_shop", "root": "shop_a_Root", "clickable": [...]}],  // 只有場景
  "lights": [...],                                                                                    // 只有場景
  "stats": {"triangles": 0, "primitives": 0, "file_bytes": 0},
  "qa": {"status": "pass", "visual": {...}}
}
```

節點名稱取自 Blender 的 Object 名稱，和 GLB 節點名稱一致（命名已避開 `.`）。

## 3. ScenePlan lights

| type | 欄位 |
|---|---|
| `sun` | color、intensity、direction（vec3，光線行進方向） |
| `hemisphere` | color（天空）、ground_color、intensity |
| `ambient` | color、intensity |
| `point` | color、intensity、position、distance（選填） |

強度採用 Three.js 的單位（physically correct 模式下 sun 約 2～4），不轉換 Blender 的 W。

## 4. Props 資產

- `lamp_post`：單一 street_lamp 元件（燈罩發光，anim_group `lamp_glow`），以 instance 擺 4 盞在主街兩側。
- `crate_pile`：crate + bucket（不吊）＋小盆栽，非 instance，放 2 組在店面旁邊。

## 5. MCP server

```
Claude Code／Cursor ──stdio──▶ tools/blender/mcp_server/server.py（MCPServer，mcp 2.x）
                                   │  subprocess：Blender --background --factory-startup
                                   ▼
                               scripts/mcp_runner.py -- <JSON 參數>
                                   │  執行 lowpoly_kit，最後一行印出 @@LPK_RESULT@@{json}
```

| 工具 | 是否需要 Blender | 說明 |
|---|---|---|
| `lowpoly_list_plans` | 否 | 列出 plans/ 下所有 plan 的 schema、id、檔名 |
| `lowpoly_validate_plan(path)` | 否 | 純 Python 驗證 |
| `lowpoly_build_asset(plan, export, preset, render_dir)` | 是 | 建模 + QA（+ Visual QA）+ 選擇性匯出，回傳精簡報告 |
| `lowpoly_build_scene(scene, export, render_dir)` | 是 | 組裝場景 + Scene QA + 選擇性匯出 |
| `lowpoly_run_tests(keyword)` | 是 | headless 測試，回傳通過／失敗數 |

- Blender 路徑：環境變數 `LPK_BLENDER`，預設 `~/Applications/Blender.app/Contents/MacOS/Blender`，再試 `/Applications/...`。
- 輸出路徑只允許在 repo 或系統暫存目錄內。
- 設定檔：`.mcp.json`（Claude Code）與 `.cursor/mcp.json`（Cursor），指令是 `uv run --no-project --with "mcp>=2,<3" python tools/blender/mcp_server/server.py`。
