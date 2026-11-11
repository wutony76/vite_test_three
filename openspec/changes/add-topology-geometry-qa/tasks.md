# Tasks

- [x] `profiles.py`：12 種 profile 與新欄位
- [x] `checks.py`：自我交叉（含只算同島的版本）、poles、縮放；`report.py`：島數上限、三角面上限、自我交叉、縮放判定
- [x] `qa/geometry.py` + `api.validate_asset_geometry`（Union 元件併入目標的預期範圍）
- [x] orchestrator：依 profile 欄位決定 wobble／bevel；建完執行 Geometry QA
- [x] 新檢查抓到的問題：wobble 改用 (x, z) 雜湊並限制在間距的 30%；bevel 改成安全模式（交叉變多就減半重試）；磚面 bounds 修正
- [x] plan：trim／vegetation 調整；重新匯出 GLB
- [x] `tests/test_qa.py`；更新 2 個因規格變更而過時的測試；完整回歸、Three.js 檢查、`npm run build`
- [x] 文件：README、WORKFLOW、Architecture、validation、Engineering Evidence
