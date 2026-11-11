# Validation

## 驗證範圍

- 對應變更：`add-topology-geometry-qa`（Phase 4）
- 驗證環境：Blender 5.2.3 LTS headless、Python 3.10、Node + three 0.186

## 功能驗證

- [x] 12 種 profile，都有 `max_components`／`max_tris`／`self_intersection`／`bevel`／`wobble`
  - 實際結果：`test_profiles_have_phase4_keys` 通過
- [x] Join 起來互相交叉的方塊在 `building_shell` 判定 fail
  - 實際結果：`self_intersections > 0`，但 `non_manifold_edges == 0`（舊檢查抓不到）；在 `decoration` 只回報數值
- [x] test01_shop、tree_round 全部通過新的拓撲規則與 Geometry QA
  - 實際結果：兩者 `ok=True`、geometry `pass`
  - test01_shop：4848 個三角面、40 個 primitive
  - 結構零件全部保有倒角（facade 2.5 cm）
- [x] 盆栽抬高 0.5 m → `FLOATING`；門往外移 0.6 m → `GEOMETRY_OUT_OF_BOUNDS`
- [x] 既有測試全部通過
  - 實際結果：headless `112 passed, 0 failed`
  - 純 Python schema／shapes：OK
  - Three.js 兩份檢查：ALL PASS
  - `npm run build` exit 0

## 視覺驗證

- 重新渲染 3/4 視角：外觀和 Phase 3 一致，手繪感與倒角亮邊都保留。

## 問題與修正紀錄

新檢查一上線就抓到 Phase 3 留下的問題：

- 問題：剝落磚面凹槽碰到牆的外緣，和側面重疊（自我交叉 2 對，extrude 被還原）
  - 修正：磚面左緣改從磚柱右緣開始（磚柱本來就蓋住牆的最左側）
- 問題：煙囪融進牆體後，牆被判定超出 bounds（z 到 7.01）
  - 修正：Geometry QA 把 Union 元件的 bounds 併入目標的預期範圍
- 問題：wobble 讓 1.5 cm 深的磚面凹槽翻折（凹槽口和槽底的頂點被推往不同方向）
  - 修正：雜湊只用 (x, z)，同一條線上的頂點一起移動
- 問題：磚面範圍和二樓窗洞重疊 22 cm，Union 結果自我交叉
  - 修正：磚面上緣收到窗台下方 6 cm（也更符合原圖）
- 問題：窗洞邊緣和旁邊的格線只差 4.2 cm，wobble 後只剩約 2 mm，任何倒角都會交叉
  - 修正：wobble 偏移限制在「到最近相鄰線距離 × 30%」
  - 回歸測試：`test_wobble_keeps_close_lines_ordered`
- 問題：bevel 的保護一開始比較「總交叉數」，門窗的窗台和窗框本來就重疊，倒角後面數變多就被誤判變差，導致門窗沒有倒角
  - 修正：只比較同一個島內部的交叉
  - 測試：`test_shop_structure_keeps_bevel`
- 2 個舊測試因規格變更而過時：
  - `roof` 已經是正式 profile
  - 樑、柱、雨遮改用 `trim`
  - 已改成依規則判斷

## 結論

- 是否通過：**通過**
- 已知限制：
  - 物件之間的穿插沒有判定，留給 Phase 6 的 Scene 關係
  - `FLOATING` 只用外框接觸判斷，所以只列為 warn
  - bevel 安全模式最壞情況會放棄倒角，寬度會記錄在報告的 `bevel_width`
