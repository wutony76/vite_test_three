# Engineering Evidence

## 變更摘要

- 對應變更：`add-pig-v2`，重新製作小豬，改成粉紅色存錢筒造型（短腿），四腳、耳朵、尾巴會動
- 變更檔案：
  - 建模 plan 與零件：
    - `tools/blender/plans/pig_v2.plan.json`
    - `tools/blender/lowpoly_kit/components/animals.py`
    - `tools/blender/lowpoly_kit/components/__init__.py`
    - `tools/blender/lowpoly_kit/pipeline/vocab.py`
  - decal：
    - `tools/blender/lowpoly_kit/surface/decals.py`
    - `tools/blender/lowpoly_kit/pipeline/schema.py`（新增 `pixels_per_meter`）
    - `tools/blender/scripts/make_pig_v2_decals.py`
    - `tools/blender/textures/manual/pig_v2/decals/*.png`
  - 測試：`tools/blender/tests/test_shapes.py`
  - 模型：`public/models/pig_v2/pig_v2.glb`、`pig_v2.manifest.json`
  - 網頁端：`src/world/objects/pig.ts`、`pigRig.ts`（新，動作）、`pigTint.ts`（新，面板換色）、`pigCoinShine.ts`（新，金幣發光）、`obj.ts`、`main.ts`

## 驗證佐證

- `openspec/changes/add-pig-v2/validation.md`（通過，附一項說明）
- 截圖：

| 檔案 | 內容 |
|---|---|
| `assets/pig-v2-views.png` | Blender 3/4 視角（平面著色；網頁端另做平滑著色） |
| `assets/pig-v2-closeup.png` | 場景中特寫（關掉手電筒） |
| `assets/pig-v2-in-scene.png` | 預設鏡頭 |
| `assets/pig-v2-tint.png` | 面板換色前後（預設、藍色） |
| `assets/pig-v2-coin-shine.png` | 背上金幣發光與閃光 |

## 風險與後續追蹤

- 櫻花 decal 是平面四邊形，貼在曲面上時邊緣會離表面約 1 mm。小豬在畫面上很小，看不出來；若之後要做大特寫，可改成投影到曲面上的 decal。
- 耳朵是三角厚片，正側面看時比較薄。
- `test_unimplemented_kind_warns` 是既有的失敗，需要改用真正還沒實作的 kind。

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] `openspec archive`（待使用者確認）
