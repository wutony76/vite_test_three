# Validation

## 驗證範圍

- 對應變更：`add-cottage-components`（第二種建築 test02 與 9 個新零件）
- 驗證環境：Blender 5.2.3 LTS headless、Python 3.10 + numpy、Node + three 0.186

## 功能驗證

- [x] 9 個新 builder 都輸出封閉流形，島數在 profile 上限內
  - `test_every_component_is_closed_and_inside_bounds`（含 test02）
  - `test_cottage_roofs_are_single_shells`
  - `test_rock_pile_and_bush_islands`
- [x] test02_cottage：3644 個三角面 ≤ 6000、20 個 primitive ≤ 32
- [x] Geometry QA 沒有 fail；Visual QA 輪廓 IoU 0.9365、元件位置 IoU 平均 0.8886、ΔE 都 ≤ 13.2
- [x] Three.js：`threejs_plan_check.mjs` ALL PASS
  - draw call 20
  - 只有 2 個玻璃半透明
  - 18/18 NEAREST atlas
  - 20/20 vertex color
  - 正面射線打到門
- [x] 既有測試全部通過：headless `131 passed, 0 failed`；純 Python 都 OK；`npm run build` exit 0

## 建模迭代

| 輪次 | 結果 | 發現 | 修正 |
|---|---|---|---|
| 1 | 2 fail | porch_roof 自我交叉；gable_trim 重複頂點；煙管不見；木桶懸空；排水管太細；窗台色差 | — |
| 2 | 1 fail | porch_roof 仍有 2 對自我交叉；煙管帽簷超出 bounds | 厚度改為垂直坡面；填充板後退；子元件改掛融合目標；吊繩；plan 深度；窗台高度參數 |
| 3 | 全部通過 | 左側石堆疊成一根柱子 | wobble 安全模式；帽簷改用 min(寬, 深) |
| 4 | 全部通過 | — | 石堆下大上小、左右交錯 |

## 問題與修正紀錄

- **orchestrator 的 bug（影響所有 plan）**：
  - 問題：掛在被融合元件底下的子元件，會跟著被移到備份 collection，離開資產
  - test01 沒有這種結構，所以之前沒有發現
  - 修正：融合後把子元件改掛到目標，保留世界位置
  - 測試：`test_cottage_builds_with_chimney_merged_and_flue_kept`
- 問題：wobble 讓凹多邊形端面的細長三角形翻面
  - 修正：`wobble_mesh_safe`，自我交叉變多就還原（比照 bevel 安全模式）
- 問題：人字屋頂只用垂直方向的厚度，陡坡會變得很薄
  - 修正：改成垂直於坡面的偏移線求交點
- test01 的 GLB 重新匯出後，和 9bfcc7a 的版本有 18 個三角形索引不同（6 個三角形選了另一條對角線）
  - 頂點位置、數量、三角面數都相同
  - 目前的程式碼連續匯出兩次的位元組完全相同（確定性已確認）

## AI 評語（不影響判定）

- 塔樓、四坡瓦頂、煙囪加煙管、門廊人字頂加 A 字飾板、木桶、吊燈、石階、秋色灌木都和原圖對應。
- 正面看門廊屋頂是 ∧ 形的外框：中空的厚殼是為了讓山牆飾板看得到，3/4 視角下是正常的。這是用正面近似俯角圖的取捨。
- 四坡屋頂的瓦列有點像寶塔的層簷，原圖則是彎曲蓬鬆的瓦片。之後可以讓每一列的邊緣起伏，或加上瓦片的縱向分隔。

## 結論

- 是否通過：**通過**
- 已知限制：
  - 參考圖帶俯角，以正面正交近似
  - 波浪狀屋脊只靠 wobble 表現
  - 屋瓦沒有縱向分隔
