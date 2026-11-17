# Engineering Evidence

## 變更摘要

- 對應變更：`add-project-room-style`，projectRoom 參考 mainHall 的風格改版，配色自成一組
- 變更檔案：
  - `src/world/objects/projectRoomStyle.ts`（新）
  - `src/world/objects/obj.ts`
  - `src/world/main.ts`

## 驗證佐證

- `openspec/changes/add-project-room-style/validation.md`
- 截圖：

| 檔案 | 內容 |
|---|---|
| `assets/project-room-style-before-after.png` | 預設鏡頭下的前後對照 |
| `assets/project-room-style-views.png` | 正面、右側、背面、低角度 |

## 風險與後續追蹤

- 這是三.js 端的換色與加裝飾，沒有改 Blender 模型。若確定採用，可以考慮把圓塔、石台等做進模型裡，減少 draw call。
- 第三層換色靠 onBeforeCompile 依高度判斷。如果之後換掉 project_room.glb，切分高度 5.45 要重新確認。

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] 使用者確認是否保留這個風格
- [ ] `openspec archive`
