# Engineering Evidence：Texture & Surface Detail Engine

## 變更摘要

- 對應變更：`add-texture-surface-engine`（`openspec/changes/add-texture-surface-engine/`）
- 目的：主要資產不再只用純色材質。plan 材質加上 `surface` 後，自動產生手繪風貼圖、UV、AO bake、decal，並以 Texture QA 程式判定。
- 變更檔案清單：
  - 新增 `tools/blender/lowpoly_kit/surface/`：`spec.py`、`pngio.py`、`packing.py`、`prepare.py`、`painter/`（noise、patterns、stylize、library）、`sources/`（base、postprocess、cache、comfyui）、`images.py`、`uv.py`、`material_builder.py`、`gltf_compat.py`、`bake.py`、`decals.py`、`engine.py`
  - 新增 `tools/blender/lowpoly_kit/qa/texture.py`、`qa/surface_metrics.py`、`export/texture_optimize.py`
  - 新增 `tools/blender/scripts/optimize_textures.mjs`、`scripts/prepare_textures.py`、`textures/comfyui/workflow_sdxl.json`
  - 修改 orchestrator、`build/appearance.py`、scene assembly、schema、detail_config、`qa/visual.py`、MCP server、mcp_runner
  - 刪除 `lowpoly_kit/appearance/corn_surface.py` 與 orchestrator 的 `grilled_corn_body` 特例
  - plan：crate_pile、grilled_corn、test01_shop（+3 decal）、test02_cottage、biolum_tree、sample_town；reference：test02（`surfaces[]`）
  - 測試：`test_surface_pure.py`、`test_surface.py`、`test_texture_qa.py`、e2e Test C、Three.js 檢查（WebP stub、貼圖設定）
  - 文件：tools/blender README、WORKFLOW、`docs/Architecture/README.md`
  - `package.json` devDependencies：`@gltf-transform/core`、`extensions`、`functions`、`sharp`、`meshoptimizer`
  - `.gitignore`：`tools/blender/textures/baked/`
  - 重新匯出：`public/models/{crate_pile,grilled_corn,biolum_tree,sample_town}`
- Commit／PR 參考：尚未 commit

## 驗證佐證

- 對應 `validation.md` 結論：有條件通過（`tsc` 的錯誤是既有問題）
- 測試輸出：
  - headless：`202 passed, 0 failed, 202 total`
  - e2e：`E2E PASS：驗收條件 34/34`
  - 純 Python：`Ran 26 tests … OK`
  - Three.js（Node）：6 個 GLB `ALL PASS`
  - Chrome WebGL 實測：test01_shop 12/12 貼圖解碼、decal alphaTest 0.5、AO channel 1 + uv1 11/11；sample_town 32/32、26/26；GL error 0
- 關鍵數字：

| 項目 | 前 | 後 |
|---|---|---|
| test02_cottage 純色面積比 | ≈ 1.0 | 0.009 |
| test01_shop 輪廓 IoU／元件 IoU | 0.987／0.861 | 0.9866／0.8608 |
| grilled_corn GLB | 612 KB（PNG、Bump 誤當法線） | 170 KB（WebP、正確法線） |
| test01_shop 貼圖 | atlas 2 張 | 26 張，PNG 1.69 MB → WebP 0.40 MB |
| sample_town GPU 貼圖 | — | 46.9 MB（KTX2 門檻 150 MB） |

## 風險與後續追蹤

- 已知風險：
  - 平鋪貼圖材質增加 draw call（店面 32 → 43、小鎮預算 150 → 200）
  - Cycles AO bake 讓建模變慢（店面約 +9 s）；preview 不 bake
  - ComfyUI 尚未實機驗證（只有 mock）；decal 只支援拉丁字母
- 後續追蹤事項：
  - 依 Visual QA v2 的 `SURFACE_*` warn 調整灰泥、石頭的色票與細節
  - 安裝 ComfyUI 後實測 `provider:comfyui`
  - 場景貼圖超過 150 MB 時升級 KTX2
  - 既有的 `src/world/objects/obj.ts` 未使用 import 讓 `tsc` 失敗

## 封存前檢查

- [ ] validation.md 已完成且結論為「通過」（目前有條件通過）
- [x] 變更檔案與風險說明已整理完成
- [ ] `npm run build` 已確認正常（Vite 打包正常；`tsc` 被既有錯誤擋下）
- [x] 已產出本文件，並更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`
