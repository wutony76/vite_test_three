# Engineering Evidence

## 變更摘要

- 對應變更：`add-treasure-chest`，綠球上的寶箱，裝滿漢堡、滿到掉出來，加金色閃光
- 變更檔案：
  - 建模：
    - `tools/blender/plans/treasure_chest.plan.json`
    - `tools/blender/lowpoly_kit/components/chest.py`
    - `components/__init__.py`、`pipeline/vocab.py`
  - 測試：`tools/blender/tests/test_shapes.py`
  - 模型：`public/models/treasure_chest/treasure_chest.glb`、`treasure_chest.manifest.json`
  - 網頁端：
    - `src/world/objects/treasureChest.ts`（新）
    - `pigCoinShine.ts`：匯出閃光貼圖
    - `obj.ts`、`main.ts`

## 驗證佐證

- `openspec/changes/add-treasure-chest/validation.md`（通過）
- 截圖：

| 檔案 | 內容 |
|---|---|
| `assets/treasure-chest-views.png` | 空寶箱 Blender 四視角 |
| `assets/treasure-chest-closeup.png` | 裝滿漢堡的特寫 |
| `assets/treasure-chest-in-scene.png` | 預設鏡頭 |

## 風險與後續追蹤

- 13 個漢堡各有 7 個 mesh，約 90 個 draw call。目前效能沒有問題；之後若要放很多寶箱，可以改用 InstancedMesh。
- 寶箱和漢堡都是純色，沒有木紋、麵包紋理（Texture QA 的 FLAT_RATIO 提醒）。

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] `openspec archive`（待使用者確認）
