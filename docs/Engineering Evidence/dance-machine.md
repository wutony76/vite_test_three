# Engineering Evidence：跳舞機「電波 STEP!」（add-dance-machine）

## 變更摘要

- 原創設計的雙人跳舞機：後面高機台（大螢幕、頂上招牌、喇叭塔），前面舞台兩組踏板、8 個發光箭頭、U 形扶手。9 個元件、1216 個三角面。
- 網頁：預設在 GameHall 右下方；面板「跳舞機」可調、可拖曳、可複製；箭頭跟著 BPM 閃。

## 驗證佐證

- 拓撲、Geometry QA、Texture 預算全部通過；`threejs_plan_check` ALL PASS；`test_shapes` 28 passed（新增面朝外檢查）。
- 瀏覽器沒有錯誤；複製／移除、箭頭閃爍實測通過。
- 截圖：`assets/dance-machine-render.png`、`assets/dance-machine-in-scene.png`、`assets/dance-machine-arrow-beat.png`

## 風險與後續追蹤

- 材質合併成 atlas，8 個箭頭只能一起閃；要「上下左右輪流亮」需要把箭頭拆成四個元件（每色一個網格）。
- 既有的 `ma_sign`（GameHall 招牌）同樣用 `"xzy"` 擠出、面朝內，這次沒有動（不改 GameHall 模型）。
