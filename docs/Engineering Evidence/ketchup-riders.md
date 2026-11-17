# Engineering Evidence

## 變更摘要

- 對應變更：`add-ketchup-riders`，番茄醬上的食物與鯊魚改善
- 變更檔案：
  - `src/world/objects/ketchup.ts`
  - `src/world/objects/obj.ts`
  - `src/world/main.ts`

## 驗證佐證

- `openspec/changes/add-ketchup-riders/validation.md`（通過）
- 截圖：

| 檔案 | 內容 |
|---|---|
| `assets/ketchup-riders-closeups.png` | 特寫，依序是雞腿、薯條、香菇、檸檬片、鯊魚鰭（拍攝於移除沾醬圈和檸檬片之前） |
| `assets/ketchup-riders-scene.png` | 預設鏡頭畫面底部 |

## 風險與後續追蹤

- 食物從 11 塊增加到 20 塊，目前效能沒有問題。
- 香菇共用綠球上的模型檔，改那個模型會一起影響醬上的香菇。
- 無頭瀏覽器的幀數很低，番茄醬相關的動畫在測試裡會比實際慢。

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] `openspec archive`（待使用者確認）
