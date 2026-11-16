# Validation

## 驗證範圍

- 對應變更：`add-neon-shop`
- 環境：Blender 5.2.3 LTS 背景模式；headless Chromium（SwiftShader）1400×900 @2x

## 功能／品質驗證

| 項目 | 結果 |
|---|---|
| 拓撲（30 個 Object，building_shell 皆 1 島、0 非流形） | pass |
| Geometry QA（bounds、懸空） | pass（無 warn） |
| Texture QA／GLB 貼圖 | pass；GPU 貼圖 8.79 MB ≤ 24 MB |
| 三角面 | 2374（GLB）≤ 8000 |
| primitive／draw call | 35～37 ≤ 48 |
| GLB 大小 | 約 305 KB（meshopt + WebP） |
| Visual QA | 略過：參考圖是 3/4 視角，工具只支援正面正交 |
| Three.js 檢查 | 2 項 FAIL，皆為設計差異（見下） |

Three.js 檢查的 2 項 FAIL：
- 「正面射線第一個打到門」：門依設計在 -X 側，正面射線打到排水管
- 「只有玻璃是半透明」：店面與二樓窗刻意做成不透明的暖光自發光面（表現店內亮燈）

## 視覺驗證

- `docs/Engineering Evidence/assets/neon-shop-front.png`（正面 3/4）
- `docs/Engineering Evidence/assets/neon-shop-side.png`（-X 側：燈箱、門、直立招牌）
- `docs/Engineering Evidence/assets/neon-shop-sign.png`（「電 • 波 • 町」特寫，無鏡像）
- `docs/Engineering Evidence/assets/neon-shop-in-scene.png`（world 場景 Gamehall 位置）

## 回歸驗證

- `tests/run.py -- test_build_plan`：新增的 quarter-turn 測試 PASS；`test_unknown_kind_is_reported` FAIL 為既有問題（改動前就失敗：測試用的 `fence` 已是合法 kind）
- world 頁面 console 無 error；`npm run build` 通過

## 問題與修正紀錄

- 貼圖 GPU 25.5 MB 超預算 → 主因是 decal 圖集因像素總量跳到 2048²；decal 圖縮小、樓層帶共用屋頂材質後 8.79 MB
- 招牌與牆面相隔幾公分被判懸空 → bounds 貼齊牆面
- 「電 • 波 • 町」在場景尺寸糊成光點 → 改粗體、光暈縮小、招牌加高
- 招牌字左右被裁 → 字放大後超出畫布，畫布加寬到 2200×700（比例與招牌一致）

## 結論

- 是否通過：有條件通過（Visual QA 無法用 3/4 參考圖自動比對；2 項 Three.js 檢查為設計差異）
- 已知限制：場景裡整棟只有約 70 px 寬，「電 • 波 • 町」需拉近才看得清；舊 Gamehall 的霓虹閃爍系統不作用於新模型

## 後續：使用者要求換回

- 使用者看過後要求 Gamehall 換回原本的遊戲廳模型：`GAME_HALL_MODEL_URL` 改回 `models/game_hall/gameHall.glb`、`spinDegrees` 改回 99
- neon_shop 的 GLB、plan、decal 腳本、layout quarter-turn 支援與 `_glow` 自發光程式保留備用；`obj.ts` 註解寫有換上的方法（網址 + spinDegrees 189）
- 已截圖確認 Gamehall 恢復原貌
