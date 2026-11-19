# Proposal

## 變更名稱

`add-pineapple-bun`：菠蘿麵包（菠蘿油）＋頂上卡通木牌「Welcome / HFYY world.」，固定浮在畫面左側的番茄醬海上

## 背景

使用者提供兩張參考圖：圖一是菠蘿油（龜裂酥皮上半顆、中間厚奶油、下半顆麵包），圖二是卡通木牌（兩片歪斜木板、木樁、青苔、小紅菇）。
要求菠蘿麵包上方插著木牌、字改成「Welcome」「HFYY world.」，並且「一直浮在番茄醬的左邊，綠球就算轉動也一直在畫面左邊，載浮載沉」。plan 經使用者確認（含青苔與小紅菇）後才建模。

## 目標

- **模型**：`public/models/pineapple_bun/pineapple_bun.glb`，照建模流程（plan → validate → 使用者確認 → 建模 → 測試）。
- **網頁**：菠蘿麵包跟著鏡頭定位，固定在畫面左下的番茄醬海上，上下起伏、輕輕搖晃；面板「菠蘿麵包（番茄醬海左側）」可調。

## 範圍

- 新零件：`tools/blender/lowpoly_kit/components/pineapple_bun.py`（`pb_*`），vocab 加入 6 個 kind。
- `tools/blender/plans/pineapple_bun.plan.json`、`tools/blender/scripts/make_pineapple_bun_decals.py`（木牌字 decal）。
- `src/world/objects/pineappleBun.ts`；`main.ts` 接線（建立、每幀更新、面板）。
- 測試：`test_pineapple_bun_parts_are_closed_and_face_out`。

## 不在範圍

- 不沿用參考圖二的字型、圖案；不做參考圖一的浮水印。
- 不參與點選、選中效果、小豬障礙（不在綠球上）。
