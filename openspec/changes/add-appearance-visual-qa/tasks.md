# Tasks

- [x] `appearance/atlas.py`（色格、像素、UV）
- [x] `build/appearance.py`（貼圖、atlas 材質、UV、vertex color）+ orchestrator 整合
- [x] glTF 匯出 vertex color（`export_vertex_color="ACTIVE"`）；GLB 帶有 baseColorTexture／metallicRoughnessTexture／emissiveTexture／COLOR_0
- [x] `qa/metrics.py`、`qa/visual.py`、`api.validate_visual`；`build_from_plan.py --render` 改為執行 Visual QA
- [x] Three.js 檢查：貼圖、vertex color、NEAREST、draw call；Node 端用 plugin 取代圖片解碼
- [x] 測試：`test_visual_metrics.py`、`test_appearance.py`；更新 3 個因規格變更而過時的測試；完整回歸、`npm run build`
- [x] 依 Visual QA 修正：壓頂取樣框與顏色、門玻璃凹槽底面、instance 形狀檢查、壁燈支架、葉團分布
- [x] plan 預算收緊到 32；重新匯出 GLB；AI 檢視疊圖並記錄評語；更新使用者 Blender 中的店面
- [x] 文件：README、WORKFLOW、Architecture、validation、Engineering Evidence
