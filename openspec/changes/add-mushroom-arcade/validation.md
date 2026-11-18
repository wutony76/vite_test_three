# Validation

## 結果：通過

**建模**（`build_from_plan.py --export --render`）：
- 20 個 Object 拓撲全部 pass，非流形 0。屋身、底座是 1 個島；其他零件的島數照設計。
- 15774 個三角面、43 個 primitive，預算是 16000／48；沒有 Geometry QA fail；貼圖在預算內。
- GLB 約 720 KB，meshopt 壓縮。

**其他檢查**：
- `threejs_plan_check`：ALL PASS（decal 獨立節點、色彩空間、可點擊的門）。
- `test_shapes`：27 passed（含 `test_mushroom_arcade_parts_are_closed`）。
- 瀏覽器：GameHall 位置顯示新的遊樂中心，正面朝向鏡頭（自轉 90°），招牌和窗內畫面發光，console 沒有錯誤。
- `tsc`、`npm run build` 通過。

**截圖**：
- `docs/Engineering Evidence/assets/mushroom-arcade-render.png`（Blender 預覽）
- `docs/Engineering Evidence/assets/mushroom-arcade-decals.png`（decal 一覽，招牌是修改前的版本，現在是「電 • 波 • 町」）
- `docs/Engineering Evidence/assets/mushroom-arcade-in-scene.png`（場景）

## 說明

Visual QA 略過：參考圖是 3/4 視角，不是正面正交視角。
