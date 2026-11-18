# Proposal

## 變更名稱

`add-mushroom-arcade`：「電 • 波 • 町」香菇電子遊樂中心，取代 GameHall 的外觀

## 背景

使用者提供兩張參考：
1. 香菇風的電子遊樂中心（`tools/img/mushroom_arcade.png`）。
2. 香菇屋，也就是 mainHall 的原型，用來決定簡化方向。

要求「參考第一張建造、適當簡化、保留設計感」。確認 plan 時又提出：
- 招牌中文改成「電 • 波 • 町」；
- 先選擇在綠球上新增一棟，之後改成**取代 GameHall 的位置**。

## 目標

- **模型**：`public/models/mushroom_arcade/mushroom_arcade.glb`，流程是 reference → plan → 使用者確認 → build → QA → 匯出。
- **網頁**：GameHall 改用這個模型。原本的位置、點擊、進入、名稱標籤都沿用；招牌與窗內畫面（decal）會發光。

## 範圍

- 新零件：`tools/blender/lowpoly_kit/components/mushroom_arcade.py`（`ma_*`），並登記在 vocab 與 `__init__`。
- `tools/blender/plans/mushroom_arcade.{reference,plan}.json`。
- decal 腳本：`tools/blender/scripts/make_mushroom_arcade_decals.py`，產出到 `textures/manual/mushroom_arcade/decals/`。
- `obj.ts`：`GAME_HALL_MODEL_URL` 換成新模型，GameHall 的長寬高比例、自轉跟著改；原本的值寫在註解裡。
- 測試：`tests/test_shapes.py` 的 `test_mushroom_arcade_parts_are_closed`。
