# Engineering Evidence

## 變更摘要

- 對應變更：`add-e2e-acceptance` — Test A／Test B 端到端自動化驗收（Phase 8）
- 變更檔案清單：
  - 新增 `tools/blender/tests/e2e.py`
  - 使用 Phase 7 的 `scripts/mcp_runner.py`（out_root 輸出到暫存目錄）
  - 文件：`tools/blender/README.md`、`WORKFLOW.md`、`docs/Architecture/README.md`
- Commit / PR 參考：見分支 `feat/blender-asset-pipeline`

## 驗證佐證

- 對應 `validation.md` 結論：通過
- `python3 tools/blender/tests/e2e.py` → `E2E PASS：驗收條件 19/19`，exit 0
- `--silhouette 0.99` → `E2E FAIL：18/19；未通過：[A] 外型比例合理`，exit 1

## 風險與後續追蹤

- 美感無法完全自動判定，仍需看預覽圖
- 後續：接進 CI（需要能執行 Blender 的 runner）

## 封存前檢查

- [x] validation.md 結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run build` 正常
- [x] 已產出本文件，並已更新 `docs/Architecture/README.md`
- [ ] 可執行 `openspec archive`（待使用者確認）
