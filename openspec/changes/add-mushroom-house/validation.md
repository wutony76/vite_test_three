# Validation

## 結果：通過

| 項目 | 結果 |
|---|---|
| validate_plan（reference、plan） | 都是 `ok: True` |
| 拓撲 | body、cap 是 organic 1 島；其餘 decoration 島數 3～8；全部 0 非流形、0 退化面 |
| Geometry QA | pass |
| Texture QA | warn：FLAT_RATIO，純色 low poly，筆觸紋理刻意不做 |
| 預算 | 三角面 3690 / 9000；primitive 10 / 30；GLB 約 155 KB |
| Three.js plan check | ALL PASS |
| test_shapes | 24 / 24，含新增的 `test_mushroom_house_parts_are_closed` |
| 瀏覽器 | 預設鏡頭看得到香菇屋，門朝向鏡頭；console 沒有 error |
| `npm run build` | 通過 |

截圖：
- `assets/mushroom-house-compare.png`：參考圖和模型並排
- `assets/mushroom-house-views.png`：四個視角
- `assets/mushroom-house-door.png`：門口特寫
- `assets/mushroom-house-in-scene.png`：場景中

## 第二版（三層、陽台、粉紅屋頂、兔耳）重驗

| 項目 | 結果 |
|---|---|
| 拓撲 | 13 個 Object 全部 pass（陽台 8 島、兔耳 4 島） |
| 預算 | 三角面 5346 / 12000；primitive 13 / 34 |
| test_shapes、Three.js plan check | 通過、ALL PASS |
| 瀏覽器 | 三層白色屋身、粉紅菇傘、兔耳、門口陽台都清楚可見；console 沒有 error（`assets/mushroom-house-v2-front.png`、`assets/mushroom-house-in-scene.png`） |

## 第三版（兔耳同屋頂色、第一層寬胖）重驗

- 13 個 Object 拓撲全部 pass，共 5026 個三角面；test_shapes 24/24；Three.js plan check ALL PASS。
- 瀏覽器場景截圖正常，console 沒有 error。

## 第四版（取代 mainHall、門可調、門面精緻）重驗

| 項目 | 結果 |
|---|---|
| 拓撲 | 13 個 Object 全部 pass；共 5308 個三角面、14 個 primitive |
| 貼圖 | GPU 4.37 MB / 8 MB；貼圖 30.9 KB / 800 KB；GLB 貼圖 QA pass |
| test_shapes | 24 / 24（門的島數預期改成 7，並加上陽台和兔耳的檢查） |
| Three.js plan check | ALL PASS |
| 瀏覽器 | mainHall 位置顯示香菇屋，門朝向鏡頭；門整體大小 1.5、門寬 1.2 時，節點縮放變成 (1.8, 1.5, 1.5)，門底仍在陽台上；console 沒有 error（`assets/mushroom-house-in-scene.png`、`assets/mushroom-house-door.png`） |

## 第五版（香菇串）重驗

- 16 個 Object 全部 pass，共 6916 個三角面、17 個 primitive；test_shapes 24/24；Three.js plan check ALL PASS。
- 瀏覽器場景正常，console 沒有 error（`assets/mushroom-house-hangers.png`、`assets/mushroom-house-in-scene.png`）。

## 第六版（mainHall 擺放、標籤移到左側）

- 瀏覽器：mainHall 在綠球頂端，「mainHall」標籤顯示在香菇屋左側，小尾巴指向房子；console 沒有 error（`assets/mushroom-house-in-scene.png`）。
- 測試時發現 localhost:5173 的 IPv6 那個開發伺服器（PID 89498）沒有回應，改連 127.0.0.1:5173（PID 17625）測試。

## 第七版（縮放 0.195、門 0.8、取消 AO 烘焙）

- Three.js plan check：ALL PASS（新增的檢查項「plan 關閉 AO 烘焙，GLB 也沒有 AO 貼圖（0）」）。laundry、treasure_chest 照舊通過；neon_shop 的 2 項是原本就有的刻意設計。
- 瀏覽器：門 0.8 和 1.4 時，門周圍牆面都沒有殘留的固定暗影；console 沒有 error（`assets/mushroom-house-door.png`）。

## 第八版（標籤文字）

- 瀏覽器：mainHall 標籤顯示「龍兔的家」，下一行是較小的「（點擊進入會看到詳細資訊）」，仍在房子左側；console 沒有 error。

## 第九版（背面時標籤換到右邊）

- 瀏覽器：正面時標籤 class 是 is-side（左側）；鏡頭繞球轉 120° 和 180° 看到背面時是 is-side-right（右側）；console 沒有 error。
