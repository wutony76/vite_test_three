# Engineering Evidence

## 變更摘要

- 對應變更：`add-shiitake`，綠球上的香菇，面板可以調菇傘大小與菇柄高低
- 變更檔案：
  - 參考圖：`tools/img/shiitake_side.jpg`、`tools/img/shiitake_top.jpg`
  - 建模：
    - `tools/blender/plans/shiitake.plan.json`
    - `tools/blender/lowpoly_kit/components/fungi.py`
    - `components/__init__.py`、`pipeline/vocab.py`
  - 測試：`tools/blender/tests/test_shapes.py`
  - 模型：`public/models/shiitake/shiitake.glb`、`shiitake.manifest.json`
  - 網頁端：`src/world/objects/shiitake.ts`（新）、`obj.ts`、`main.ts`

## 驗證佐證

- `openspec/changes/add-shiitake/validation.md`（通過）
- 截圖：

| 檔案 | 內容 |
|---|---|
| `assets/shiitake-views.png` | Blender 四視角（修細花刀前） |
| `assets/shiitake-panel.png` | 面板：預設、柄 2 倍、傘 0.8 倍＋柄 0.3 倍 |
| `assets/shiitake-in-scene.png` | 預設鏡頭 |
| `assets/shiitake-flat.png` | 改扁後的菇傘（3/4 視角與側面） |
| `assets/shiitake-copies.png` | 複製出三顆香菇，選中那顆會亮起來 |
| `assets/shiitake-color.png` | 菇傘換色、放大、拉高（只影響選中那顆） |

## 風險與後續追蹤

- 多顆香菇的擺設要貼回 `SHIITAKE_PLACEMENTS` 才會保留，重新整理後才是新的預設。
- 菌褶是純色，沒有放射狀紋路；香菇在畫面上很小，看不出差別。

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] `openspec archive`（待使用者確認）
