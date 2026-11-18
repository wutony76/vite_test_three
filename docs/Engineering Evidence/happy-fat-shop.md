# Engineering Evidence

## 變更摘要

- 對應變更：`add-happy-fat-shop`，依參考圖建造街角小店「Happy Fat」（香菇屋風格、半弧面屋頂、有弧度的牆、獨立配色）
- 變更檔案：
  - 參考圖：`tools/img/earth_mamas.jpg`
  - 建模：
    - `tools/blender/plans/earth_mamas.{reference,plan}.json`
    - `tools/blender/lowpoly_kit/components/earth_mamas.py`
    - `components/__init__.py`、`pipeline/vocab.py`
  - 招牌：`tools/blender/scripts/make_earth_mamas_decals.py`、`tools/blender/textures/manual/earth_mamas/decals/sign.png`
  - 測試：`tools/blender/tests/test_shapes.py`
  - 模型：`public/models/earth_mamas/earth_mamas.glb`、`earth_mamas.manifest.json`
  - 網頁端：`src/world/objects/happyFatShop.ts`（新）、`obj.ts`、`main.ts`

## 驗證佐證

- `openspec/changes/add-happy-fat-shop/validation.md`
- 截圖：`docs/Engineering Evidence/assets/happy-fat-*.png`

## 風險與後續追蹤

- 一樓是平的店面（門窗是牆上的開口），只有轉角做成圓柱。若要整個一樓也彎，需要另外做彎曲牆面的開口零件。
- fence 零件的 UNDERFILLED 提醒是既有特性，不影響外觀。
- GLB 約 430 KB，主要是磚、木板、條紋三種貼圖。

## 封存前檢查

- [x] validation.md 完成
- [x] build 正常
- [ ] `openspec archive`（待使用者確認）

## 追加：只留主體

依使用者回饋，移除門窗、招牌、遮雨棚、香菇串與小擺設，只留牆、轉角柱、腰線、半弧屋頂和煙囪。模型降到 6 個物件、2092 三角面，QA、threejs 檢查與 test_shapes（25 passed）都通過。截圖已更新：`assets/happy-fat-views.png`、`assets/happy-fat-in-scene.png`。

## 追加：厚度、顏色、下沉

面板新增建築厚度（前後深度倍率）和五個部位的換色，下沉範圍放寬到 −0.05～0.12。比較圖：`assets/happy-fat-depth-color.png`（左為預設，右為厚度 2 加換色）。

## 追加：煙囪冒煙

煙囪口持續冒出半透明煙團，面板可以開關、調濃度和飄升高度。瀏覽器實測 8 團煙都可見、濃淡錯開，console 沒有錯誤。截圖：`assets/happy-fat-smoke.png`。
