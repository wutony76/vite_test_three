# Engineering Evidence

## 變更摘要

- 對應變更：`add-cottage-components` — 第二種建築 test02_cottage 與 9 個新零件
- 變更檔案清單：
  - 新增 `tools/blender/lowpoly_kit/components/roofs.py`；擴充 `props.py`（pipe、lantern、bucket、crate；壁燈不變）、`nature.py`（rock_pile、bush）、`openings.py`（窗台高度）、`components/__init__.py`
  - `pipeline/vocab.py`（新 kind）
  - `build/orchestrator.py`（融合後子元件改掛、wobble 報告）、`build/wobble.py`（安全模式）
  - plans：`test02.reference.json`、`test02_cottage.plan.json`；參考圖 `tools/img/test02.jpg`
  - 測試：`test_shapes.py`、`test_build_plan.py`
  - 模型：新增 `public/models/test02_cottage/`；重新匯出 `public/models/test01_shop/`（6 個三角形的對角線不同，見 validation）
  - 文件：`tools/blender/README.md`、`docs/Architecture/README.md`
- Commit / PR 參考：見分支 `feat/blender-asset-pipeline`

## 驗證佐證

- 對應 `validation.md` 結論：通過
- headless `131 passed, 0 failed`；純 Python 測試 OK
- test02 的 Three.js 檢查 ALL PASS；test01 與舊小屋的 Three.js 檢查 ALL PASS
- test02：3644 個三角面、20 個 primitive、358 KB；Visual QA 0.9365／0.8886
- `npm run build` exit 0；`openspec validate --strict` valid

## 風險與後續追蹤

- 俯角參考圖以正面近似；屋瓦沒有縱向分隔
- 後續：Phase 6 用 test01_shop 與 test02_cottage 組裝 sample_town

## 封存前檢查

- [x] validation.md 結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 正常
- [x] 已產出本文件，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認）
