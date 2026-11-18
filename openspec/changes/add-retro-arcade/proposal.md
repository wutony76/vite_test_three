# Proposal

## 變更名稱

`add-retro-arcade`：向量貼紙風復古街機，放在 GameHall（電波町遊樂中心）左邊

## 背景

使用者貼了一張街機插畫，跟專案裡的 `tools/img/game_machine.jpg` 是同一張，要求「建立這個機台，放 gameHall 旁邊」。

專案裡原本的 `game_machine` 模型非常粗略：機身是平板、螢幕浮在前面、操作台是一片薄板，所以重新建模，舊的保留不動。確認 plan 時使用者選擇放在遊樂中心左邊。

## 目標

- **模型**：`public/models/retro_arcade/retro_arcade.glb`，照建模流程。
- **網頁**：綠球上一台街機，預設在遊樂中心左前方；面板「復古街機」可調整、可拖曳，螢幕發光可調。

## 範圍

- 新零件：`components/retro_arcade.py`（`rm_*`）。
- `plans/retro_arcade.{reference,plan}.json`。
- `src/world/objects/retroArcade.ts`。
- `obj.ts`、`main.ts` 的接線。
- 測試：`test_retro_arcade_parts_are_closed`。
