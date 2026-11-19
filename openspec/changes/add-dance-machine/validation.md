# Validation

## 結果：通過

- **建模**：9 個 Object 拓撲全部 pass；1216 個三角面、12 個 primitive（預算 6000／28）。
- **threejs_plan_check**：ALL PASS。
- **test_shapes**：28 passed（含 `test_dance_machine_parts_are_closed_and_face_out`）。
- **瀏覽器**：
  - 預設位置在 GameHall 右下方、復古街機左邊，螢幕和舞台朝鏡頭；console 沒有錯誤。
  - 「複製跳舞機」兩次 → 3 台（dance_machine_1～3），「移除選中跳舞機」→ 剩 2 台並自動選最後一台。
  - 箭頭閃爍：同一位置連拍，拍點時亮、拍與拍之間明顯變暗（`dance-machine-arrow-beat.png` 左亮右暗）。
- `tsc` 通過。

**截圖**：
- `docs/Engineering Evidence/assets/dance-machine-render.png`
- `docs/Engineering Evidence/assets/dance-machine-in-scene.png`
- `docs/Engineering Evidence/assets/dance-machine-arrow-beat.png`
