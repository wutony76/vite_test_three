# Engineering Evidence

## 變更摘要

- 對應變更：`add-mushroom-house`，依參考圖建造奇幻香菇屋，放在綠球上
- 變更檔案：
  - 參考圖：`tools/img/mushroom_house.jpg`
  - 建模：
    - `tools/blender/plans/mushroom_house.{reference,plan}.json`
    - `tools/blender/lowpoly_kit/components/mushroom_house.py`
    - `components/__init__.py`、`pipeline/vocab.py`
  - 測試：`tools/blender/tests/test_shapes.py`
  - 模型：`public/models/mushroom_house/mushroom_house.glb`、`mushroom_house.manifest.json`
  - 網頁端：`obj.ts`（mainHall 套用模型、大門大小）、`main.ts`（面板）。中途做過獨立的 `mushroomHouse.ts`，改成取代 mainHall 後已刪除

## 驗證佐證

- `openspec/changes/add-mushroom-house/validation.md`（通過）
- 截圖：`docs/Engineering Evidence/assets/mushroom-house-*.png`

## 風險與後續追蹤

- 參考圖是別人的手繪作品；這裡是自己用 low poly 零件重新詮釋造型，沒有使用原圖的貼圖或筆觸。
- 小窗的木簷是平板，放在凸牆上時兩端會稍微離開牆面。
- mainHall 原本的點擊、選取、拖曳行為都保留（套模型不影響長方體的互動）。

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] `openspec archive`（待使用者確認）
