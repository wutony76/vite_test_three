# Engineering Evidence

## 變更摘要

- 對應變更：`add-ketchup-polish`，番茄醬質感、顏色、前景模糊與流動細節
- 還原點：tag `before-ketchup-polish`（973fcee）
- 變更檔案：
  - `src/world/objects/ketchup.ts`
  - `src/world/foregroundBlur.ts`（新）
  - `src/world/objects/obj.ts`
  - `src/world/main.ts`

## 驗證佐證

- `openspec/changes/add-ketchup-polish/validation.md`（通過，附一項說明）
- 截圖：

| 檔案 | 內容 |
|---|---|
| `assets/ketchup-before-after.png` | 預設鏡頭：左為修改前，右為修改後 |
| `assets/ketchup-foreground.png` | 畫面底部特寫：前景模糊、高光、亮邊 |
| `assets/ketchup-ripple.png` | 醬面特寫：無漣漪 → 漣漪擴散 |

## 風險與後續追蹤

- 前景模糊是依畫面高度。轉動鏡頭讓綠球跑到畫面底部時，球的前景也會被糊；可以在面板關掉，或調小「模糊範圍」。
- 每幀多做一次畫面複製和 4 趟半解析度模糊，效能成本小，但低階裝置上可能要再觀察。
- 小豬平常離醬比較遠，漣漪不常出現。

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] `openspec archive`（待使用者確認）
