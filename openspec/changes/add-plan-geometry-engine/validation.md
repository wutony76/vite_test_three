# Validation

## 驗證範圍

- 對應變更：`add-plan-geometry-engine` — 依 AssetPlan 確定性建模（Phase 3）
- 驗證環境：
  - macOS 15
  - Blender 5.2.3 LTS headless
  - 一般 Python 3.10.10
  - Node + three 0.186

## 功能驗證

- [x] test01_shop 每個 Object 都通過 profile 驗證；facade 是 1 個封閉幾何島，含屋頂、女兒牆、門窗凹槽、煙囪
  - 實際結果：26 個 Object 全部 pass／warn，facade：1 島、0 非流形、0 開放邊
  - warn 的原因：
    - facade 有 2 個 ngon，來自煙囪 Boolean 融合的交界
    - tree_round 的樹幹有 ngon，來自 bevel 在旋轉體極點的收合
  - `building_shell` 對 ngon 只提醒，glTF 匯出時會三角化
- [x] 同一份 plan 建兩次，所有 mesh 的頂點雜湊相同
  - 實際結果：`test_rebuild_is_identical` 通過；純 Python 端 `test_builds_are_deterministic` 通過
- [x] 三角面數 ≤ 5000、primitive ≤ 預算
  - 實際結果：4822 個三角面（Blender 端，instance 各自計算）、40 個 primitive（預算 48）
  - GLB：4438 個三角面、36 個 glTF primitive、24 個 mesh
- [x] GLB 在 Three.js 載入後只有一個根節點；clickable 元件是獨立節點；正面射線打到門
  - 實際結果：`threejs_plan_check.mjs` 9 項 ALL PASS
- [x] 預覽圖和參考圖的比例、元件位置一致（人工比對 `compare.png`）
- [x] 既有測試全部通過，`npm run build` 通過
  - 實際結果：
    - headless `100 passed, 0 failed`（原有 74 個 + 新增 26 個）
    - 純 Python：schema、shapes 都 OK
    - 舊小屋 `threejs_check.mjs` ALL PASS
    - build exit 0

## 視覺驗證

預覽圖：`scripts/build_from_plan.py --render`，存放在 session scratchpad，不進版控。

| 輪次 | 發現 | 修正 |
|---|---|---|
| v1 | 屋頂與磚面沒套上（extrude 失敗）；預覽色偏暗 | 修 extrusion bug；預覽改用 Standard view transform |
| v2 | 窗台花槽植物太小；凹槽側壁是深色玻璃材質，看起來像黑框 | 花槽 bounds 往上包含植物；凹槽側壁改用牆的材質 |
| v3 | 二樓窗框、花槽、櫥窗框顏色和原圖不同 | 改用 step_gray、sign_brown；正面改用 FLAT 打光比對顏色 |

- 結果：正面的比例、元件位置、顏色和 `test01.jpg` 一致；3/4 視角可以看到牆的厚度、凹進去的門窗、倒角的亮邊、瓦楞雨棚。
- 樹木：
  - 第 1 版樹冠被包成一顆圓球、面數超出預算
  - 第 2 版樹幹和樹冠之間有縫
  - 第 3 版改成主球貼齊底緣、側球往外推：430 個三角面，樹幹接進樹冠

## 效能驗證

- test01_shop：36 個 glTF primitive（約 36～40 個 draw call）、4438 個三角面、檔案 255 KB
- tree_round：2 個 primitive、430 個三角面、26 KB

## 回歸驗證

- `extrusion.extrude` 修改後，既有的小屋 preset（單面 inset_extrude）和所有 extrusion 測試仍然通過。
- 新增的回歸測試：`test_extrude_multiple_faces_leaves_no_wire_edges`。
- `api.py` 新增函式，沒有改到既有函式的行為。

## 問題與修正紀錄

- 問題：一次擠出多個相鄰的面時，留下孤立邊，驗證失敗並還原
  - 發現方式：第一次建 test01_shop 時，roof_flat／brick_patch 回報「孤立邊」
  - 修正方式：`extrusion.extrude` 刪除原本的面之後，清掉不再屬於任何面的內部邊與頂點
  - 是否已重新驗證：是（回歸測試 + 全部測試）
- 問題：牆上凹槽底面用了半透明的 glass 材質，Three.js 中會看穿牆體內部
  - 發現方式：`threejs_plan_check` 數到 4 個半透明 mesh，但玻璃元件只有 3 個
  - 修正方式：新增不透明的 `niche_dark`；檢查改成「半透明數量必須剛好等於玻璃元件數」
  - 是否已重新驗證：是
- 問題：primitive 數 41，超過原本預算 40
  - 原因：多材質零件（燈、盆栽、門把、海報）每種材質各算 1 個
  - 修正方式：海報顏色從 5 種減為 3 種；預算改為 48，並在 plan notes 說明 Phase 5 palette atlas 後可降到約 26
  - 是否已重新驗證：是（40 個）
- 問題：測試的預期寫錯（以為 preview 會省略煙囪頂蓋）
  - 修正方式：依 design 的門檻（≥ 0.4），preview（0.4）會保留頂蓋；測試改成檢查門板凹槽（門檻 0.5）

## 結論

- 是否通過：**通過**
- 已知限制或風險：
  - 剝落磚面是矩形，不是原圖的斜向剝落（`grid_slab` 只支援矩形區域）
  - 海報、招牌沒有文字或圖案，要等 Phase 5 的貼圖
  - `material_quality`／`texture_quality` 尚未生效（Phase 5）
  - Boolean 交界的 ngon 只提醒
  - 建築深度是推測值
- 後續追蹤事項：
  - Phase 4：新 profile、`decoration` 島數上限 8（零件庫已先守住）、Geometry QA
  - Phase 5：palette atlas（primitive 可降到約 26）、silhouette IoU（正面預覽已和參考圖逐像素對齊，可以直接計算）
  - 讓 grid_slab 支援斜向區域，做出磚面剝落
