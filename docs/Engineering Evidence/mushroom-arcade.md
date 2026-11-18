# Engineering Evidence：電波町香菇遊樂中心（add-mushroom-arcade）與復古街機（add-retro-arcade）

## 變更摘要

- GameHall 換成「電 • 波 • 町」香菇電子遊樂中心：依參考圖用 mainHall 香菇屋的風格簡化，20 個元件、15774 個三角面。
- 遊樂中心左邊新增一台向量貼紙風的復古街機：13 個元件、1752 個三角面，面板可調、可拖曳。

## 驗證佐證

- 兩個模型的拓撲、Geometry QA、Texture 預算全部通過。
- `threejs_plan_check` ALL PASS，`test_shapes` 27 passed。
- 瀏覽器沒有錯誤。
- 截圖：
  - `assets/mushroom-arcade-render.png`、`assets/mushroom-arcade-decals.png`、`assets/mushroom-arcade-in-scene.png`
  - `assets/retro-arcade-left.png`、`assets/retro-arcade-right.png`

## 風險與後續追蹤

- GameHall 的「招牌與燈」面板是給舊模型用的，新模型沒有對應零件，調了沒有作用。
- GameHall 佔地改變後，草叢撒點會依新的障礙範圍重新排列（GameHall 是撒點障礙，不是遮罩）。
- 舊的 `game_machine` 模型與 plan 保留未刪。
