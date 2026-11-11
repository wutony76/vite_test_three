# vite_test_three
start test three

## 3D 模型（Blender）

場景用的 Low Poly 模型由 AI 依 plan 建立（參考圖分析 → plan → 你確認 → 建模 → 自動 QA → 匯出），流程寫在 [tools/blender/WORKFLOW.md](tools/blender/WORKFLOW.md)。

- Claude Code：訊息開頭打 `/blender-modeling`，例如「/blender-modeling 幫我建模：tools/img/test03.jpg，是一間麵包店，門高約 2 m」
- Cursor：訊息開頭加 `@blender-modeling`，說法相同
- 更多說法範例、要給哪些資訊、會不會自動讀 WORKFLOW：[tools/blender/README.md](tools/blender/README.md#怎麼叫-ai-建模兩個編輯器通用)
- 驗收：`python3 tools/blender/tests/e2e.py`
