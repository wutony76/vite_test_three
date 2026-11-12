# Tasks

- [x] Spike：背景模式 smart_project、Cycles AO bake、`glTF Material Output` 匯出 occlusion（TEXCOORD_1）、Normal Map 匯出；結論寫進 design §2
- [x] T1 Material Builder（`surface/material_builder.py`）、glTF 白名單與 color space（`gltf_compat.py`）、圖片工具（`images.py`，含存檔＋重新載入驗證）
- [x] T2 UV Engine（`surface/uv.py`）：planar／along／cylinder／fit、UVBake（smart project + shelf packing）、Jacobian 拉伸與 texel density 量測
- [x] T3 程序手繪貼圖庫（`painter/`：週期性 noise、15 種圖樣、色票鎖定 stylize）、PNG io；schema `surface`／`decals`／貼圖預算／reference `surfaces[]`；DetailConfig 三個新參數；engine 接進 orchestrator；遷移 grilled_corn、刪除 `corn_surface.py` 與 orchestrator 特例
- [x] T4 Bake Engine（`bake.py`）：AO（ao）、貼圖 × AO × 邊緣高光（full，合併成 1 個材質）
- [x] T5 reference `surfaces[]`（test02）與 Visual QA v2（`qa/surface_metrics.py`）
- [x] T6 WebP（`scripts/optimize_textures.mjs`、`export/texture_optimize.py`）、manifest 貼圖統計、Three.js 檢查（WebP stub、sRGB／ORM／法線／AO uv1／decal alphaTest）
- [x] T7 Decal Engine（`decals.py`）：text／symbol／image、decal atlas、多點射線定深度
- [x] T8 Provider 介面（procedural／library／manual／ComfyUI）、快取與 provenance、`scripts/prepare_textures.py`、MCP 工具 `lowpoly_prepare_textures`
- [x] T9 Scene 整合（terrain／road 貼圖、hash 共用、場景貼圖 GPU 統計）；升級 crate_pile／grilled_corn／test02_cottage／test01_shop（decal）／biolum_tree／sample_town；e2e Test C
- [x] Texture QA（`qa/texture.py`）14 條規則，每條都有反例測試（`tests/test_texture_qa.py`）
- [x] 測試：`test_surface_pure.py`（26）、`test_surface.py`（16）、`test_texture_qa.py`（13）；更新因規格變更而過時的 6 個舊測試
- [x] 完整回歸（headless 202/202、e2e 34/34）、Chrome WebGL 實測 WebP + AO；`npm run build`：Vite 通過，`tsc` 被既有的 `obj.ts` 未使用 import 擋下（不在本變更範圍）
- [x] 重新匯出 `public/models` 的 crate_pile、grilled_corn、biolum_tree、sample_town
- [x] 文件：README、WORKFLOW、Architecture、validation、Engineering Evidence
