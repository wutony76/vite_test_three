# Proposal

## 變更名稱

`add-dance-machine`：原創設計的雙人跳舞機「電波 STEP!」，放在 GameHall（電 • 波 • 町）附近

## 背景

使用者要求「幫我做一台跳舞機」，沒有參考圖。依專案規範（不仿現有機台）自己設計一台原創的雙人跳舞機，配色跟 GameHall 的霓虹一致。plan 經使用者確認後才建模。

## 目標

- **模型**：`public/models/dance_machine/dance_machine.glb`，照建模流程（plan → validate → 使用者確認 → 建模 → 測試）。
- **網頁**：綠球上一台跳舞機，預設在 GameHall 右下方、復古街機左邊；面板「跳舞機」可調、可拖曳、可複製多台；箭頭跟著節拍閃。

## 範圍

- 新零件：`tools/blender/lowpoly_kit/components/dance_machine.py`（`dm_*`），vocab 加入 9 個 kind。
- `tools/blender/plans/dance_machine.plan.json`、`tools/blender/scripts/make_dance_machine_decals.py`（招牌、螢幕 decal）。
- `src/world/objects/danceMachine.ts`；`obj.ts`、`main.ts` 接線。
- 測試：`test_dance_machine_parts_are_closed_and_face_out`。

## 不在範圍

- 不做真的遊戲玩法；箭頭只是跟著固定 BPM 閃。
