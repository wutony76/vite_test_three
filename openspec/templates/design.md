# Design

## 1. Scene Structure（場景結構）

- Scene graph（Group / Mesh 階層）：
- Camera（類型、初始位置、controls）：
- Lights：
- 座標與單位約定：

## 2. Module Breakdown（模組拆分）

- 新增模組：
  - `src/...`
- 既有模組調整：
  - `src/...`
- 職責與邊界：
  - （說明各模組只處理什麼）

## 3. State 設計

- `state`（單一狀態物件為主）：
- 由 animation loop 讀寫的欄位：
- 由使用者輸入讀寫的欄位：

## 4. Interaction Flow（click / _actions / _handlers）

- `click.xxx`（UI / 輸入入口）：
  - 觸發條件：
  - 轉交 `_actions.xxx`：
- `_actions.xxx`（流程入口）：
  - loading guard：
  - early return：
  - success flow：
  - error flow：
- `_handlers.xxx`（私有資料轉換、計算）：

## 5. Render Loop 與效能

- 每幀更新內容（使用 `delta` 而非固定步進）：
- 預估 draw calls / 多邊形數：
- InstancedMesh / LOD / 合併幾何（如適用）：
- 資源釋放（`dispose()` geometry / material / texture）：

## 6. Assets（資源）

- 模型 / 貼圖 / HDR 來源與格式：
- 載入方式（Loader、loading / success / error 狀態）：
- 檔案大小與壓縮（Draco / KTX2，如適用）：

## 7. 錯誤處理與可觀測性

- loading / success / error state 定義：
- 使用者提示方式：
- WebGL 不支援或 context lost 的處理：

## 8. 測試與驗證策略

- 型別檢查 / build：
- 手動測試案例：
- 截圖驗證點：
- 回歸風險與檢查點：
