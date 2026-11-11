# Design

- `e2e.py` 是一般 Python 腳本，用 subprocess 呼叫 Blender（`scripts/mcp_runner.py`，和 MCP server 共用同一個 runner）與 node。
- runner 回傳 JSON：建模報告、Visual QA、Scene QA、匯出路徑與 manifest。e2e 在 Python 端逐條判定。
- 輸出到系統暫存目錄（`tempfile.mkdtemp`），報告路徑印在最後。
- `--strict-visual 0.99` 這類參數用來做自我檢查：確認判定真的會失敗。
