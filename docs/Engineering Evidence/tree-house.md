# Engineering Evidence：豬豬樹屋（add-tree-house）

## 變更摘要

- 綠球上新增「豬豬樹屋」：豬造型小屋（豬鼻、耳朵、捲尾、拱形門廊、圓窗遮板、吊鈴、小白花）蓋在卡通木筏上，
  底下是樹幹＋彎樹枝斜撐；木筏四周原木欄杆、正面留門口，門口有梯子、背後垂一條麻繩。
- 卡通木頭 shader：色塊＋描線、端面粗年輪＋描邊，即時計算、放大不糊。
- 芭蕉葉（第十二輪起拆成綠球上的獨立物件「芭蕉葉叢」，見 bananaLeaves.ts）：預設 6 片大葉子排成 A 字葉棚，可整組旋轉、放大、上升下降；每片都是獨立物件：以葉片中心為操作點，直接拖＝整叢在綠球上移動、Alt 拖＝單片、Shift 上下拖＝上浮，可複製、移除，面板「芭蕉葉（豬豬樹屋）」（跟檸檬片一樣）。
- 面板「豬豬樹屋」（位置、縮放、平台寬度、豬屋大小、支架高度、木筏大小、樹幹粗細、樹幹造型、顏色、耳朵前後／厚度／大小、豬屋左右／前後／旋轉、亮度）＋子資料夾「芭蕉葉」；可複製、移除、印出佈局；`TREE_HOUSE_SCENE_EDIT` 可關閉編輯。

## 驗證佐證

- `tsc`、`npm run build` 通過；近拍、放大設定、場景、面板操作皆正常，console 無錯誤。
- 截圖：`assets/tree-house-front.png`、`assets/tree-house-left.png`、`assets/tree-house-raft.png`、`assets/tree-house-resized.png`、`assets/tree-house-back.png`、`assets/tree-house-tall.png`、`assets/tree-house-in-scene.png`、`assets/tree-house-leaf-panel.png`、`assets/tree-house-window.png`、`assets/tree-house-moved.png`、`assets/tree-house-leaf-roof.png`、`assets/tree-house-leaf-roof-side.png`、`assets/tree-house-leaf-group.png`、`assets/tree-house-leaf-group-scale.png`、`assets/banana-leaves-in-scene.png`、`assets/banana-leaves-panel.png`

## 風險與後續追蹤

- 每棟約 7 個 mesh；拖動「木筏大小」等造型滑桿時會整組重建（數毫秒），可能略頓。
- 造型參考自外部遊戲美術，已改用本專案風格重做、不含原作標誌文字；若要對外發布，建議再自行調整辨識度高的細節。

## 封存前檢查

- [x] proposal / design / tasks / validation 完成
- [x] Architecture README 已更新
