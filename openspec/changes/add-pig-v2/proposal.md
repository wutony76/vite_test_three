# Proposal

## 變更名稱

`add-pig-v2` — 重新製作小豬：粉紅色存錢筒造型，四腳、耳朵、尾巴會動

## 背景

第一版小豬（`public/models/pig/pig.glb`）只有 160 個三角面，是幾顆橢球 Voxel Remesh 融成的一團：

- 融合時顏色也融掉，網頁端還會把所有顏色強制改成粉紅。
- 四隻腳和身體黏在一起，走路時只能整隻搖晃。

使用者要求重新製作，過程中改了兩次需求：

1. 不要眼睛和鼻孔，尾巴尾端加一朵黃色小花。
2. 造型改成使用者提供的紅色存錢筒參考圖，尾巴加小花維持不變。肚子做成真的半透明並放金幣，「希希」字樣和櫻花圖案都要。
3. 顏色改粉一點，腳露出身體的長度減為一半（約 2.8 cm → 1.4 cm）。
4. 面板可以調小豬顏色。
5. 肚子有凹陷感，要改成滑順；拿掉身上的金幣和字（太小看不到）。

## 目標

- 依 lowpoly 流程產生 `public/models/pig_v2/pig_v2.glb`，流程為 plan → 使用者確認 → build → QA → 匯出。
- 造型：
  - 粉紅色亮面存錢筒身體（#F2869F），背上的投幣孔插著一枚金幣。
  - 兩側有半透明肚子窗，裡面看得到金幣。
  - 尖耳朵，很短的圓錐腳。
  - 兩側有白色櫻花和「希希」字樣。
  - 尾巴是螺旋狀，尾端有一朵黃色五瓣小花。
- 四腳、雙耳、尾巴是獨立節點，網頁端做走路擺腿、耳朵晃動、尾巴搖。
- 網頁端不再把顏色蓋成粉紅。

## 範圍

- 包含：
  - `tools/blender/plans/pig_v2.plan.json`
  - `tools/blender/lowpoly_kit/components/animals.py`，裡面新增 kind：
    - `pig_body`、`pig_leg`、`pig_ear`、`pig_tail`、`pig_face_dots`
    - `piggy_body`、`piggy_window`、`piggy_coins`、`piggy_slot`、`piggy_top_coin`
  - `tools/blender/scripts/make_pig_v2_decals.py` 及其產出的 decal 圖片
  - decal 新增選填欄位 `pixels_per_meter`，涉及 `surface/decals.py` 和 `pipeline/schema.py`
  - `src/world/objects/pig.ts`（換模型、材質處理）、`src/world/objects/pigRig.ts`（新）
  - `tools/blender/tests/test_shapes.py` 新增測試
- 不包含：
  - 不刪除第一版 `pig.glb` 和 `pig.plan.json`；`pig.ts` 改一行就能換回第一版。
  - 不改小豬的遊走、避障、拜訪篝火邏輯。

## 風險與對策

| 風險 | 對策 |
|---|---|
| 半透明窗要剛好蓋在凹槽上、金幣要在槽裡 | 身體、窗、金幣共用同一個曲面函式 `_piggy_point()`；窗和金幣用 `params.body_bounds` 取得身體的 bounds |
| 半透明窗擋住後面的金幣 | 網頁端把半透明材質設成 `depthWrite = false` |
| 小東西上的字解析度太低（預設 512 px/m，「希希」只有約 20 px） | 新增 decal 欄位 `pixels_per_meter`，只對這兩種 decal 調高 |
| 節點原點在 bounds 底面中心，直接旋轉會繞錯軸 | pigRig 在腿頂、耳根、尾根各包一層 pivot Group，動畫只轉 pivot |

## 成功標準

- [x] 拓撲、幾何、GLB 貼圖 QA 都通過；貼圖 QA 只有 FLAT_RATIO 提醒，屬於刻意的純色亮面陶瓷風格。
- [x] 三角面、primitive、GPU 貼圖都在 plan 的 budget 內。
- [x] Three.js plan check 全部通過。
- [x] 場景中是粉紅色存錢筒，看得到金幣、櫻花、希希、黃色小花；四腳交錯擺動，尾巴會搖。
- [x] `npm run build` 通過，console 沒有 error。
