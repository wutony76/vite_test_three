# Engineering Evidence：菠蘿麵包＋木牌（add-pineapple-bun）

## 變更摘要

- 菠蘿油（龜裂酥皮上半顆、厚奶油、下半顆）＋頂上卡通木牌「Welcome / HFYY world.」、青苔與小紅菇。6 個元件、2782 個三角面。
- 網頁：沿著番茄醬圈圈找出畫面左側的點，固定浮在醬上（視窗寬窄、鏡頭轉動都一樣），上下起伏、輕輕搖晃；面板「菠蘿麵包（番茄醬海左側）」可調位置、距離、大小、朝向、起伏。

- 跟番茄醬的互動：麵包底下醬面壓凹洞（醬不會從麵包穿出來）；醬裡的食物、鯊魚經過時沿截面從旁邊繞過。

## 驗證佐證

- plan validate ok；拓撲、Geometry QA、貼圖預算通過；`threejs_plan_check` ALL PASS；`test_shapes` 29 passed。
- 繞道：90 秒 300 次取樣，沒有食物／鯊魚進到麵包 0.7 倍半徑內。
- 瀏覽器：1000×700 與 1800×700、預設視角與鏡頭轉動後，麵包都在畫面 x = -0.70、在番茄醬上；沒有 console 錯誤。
- 截圖：`assets/pineapple-bun-render.png`、`assets/pineapple-bun-in-scene.png`、`assets/pineapple-bun-rotated.png`、`assets/pineapple-bun-wide.png`

## 風險與後續追蹤

- 直式手機（很窄的視窗）時，醬的左段可能會碰到「初視／進入」按鈕，需要時調 screenX、lift。
- Texture QA 的 UV 拉伸、純色比例 warn 是刻意的取捨（見 validation）。
- 麵包不在綠球上，所以不參與點選、選中效果、小豬障礙。
