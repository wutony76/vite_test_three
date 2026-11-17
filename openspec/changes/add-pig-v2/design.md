# Design

## 1. 模型結構（plan：`tools/blender/plans/pig_v2.plan.json`）

座標：正面朝 -Y，原點在 footprint 中心的地面，單位是公尺。整隻約 0.15 × 0.23 × 0.17。

| 元件 | kind | profile | 說明 |
|---|---|---|---|
| body | piggy_body | organic | 一條沿 Y 軸的 loft，是 1 個封閉島，包含：<br>• 屁股、圓肚子、臉<br>• 扁圓柱豬鼻（最後一段換材質）<br>• 兩側肚子凹槽：窗範圍內的頂點往中心縮到 72% |
| belly_window | piggy_window | glass | 沿身體「原本沒凹」的曲面鋪成的網格，左右各一片，單面；法線由程式判斷朝外 |
| belly_coins | piggy_coins | decoration | 每側 3 枚金幣，放在 84% 半徑處，介於槽底（72%）和窗（100%）之間 |
| coin_slot / top_coin | piggy_slot / piggy_top_coin | decoration | 跑道形的深色投幣孔；立著的金幣，下半截藏在身體裡 |
| leg ×4 | pig_leg | decoration | lathe 旋轉體，上粗下細（`taper`），底部是深色蹄。高 0.026 m：露出身體約 1.4 cm，上端約 1.2 cm 插進肚子 |
| ear ×2 | pig_ear | decoration | 三角厚片，有 `tilt_forward`、`splay`、`thickness` 參數 |
| tail | pig_tail | decoration | sweep 螺旋，尾端是星形厚片花瓣（半徑隨角度起伏的 loft，5 片花瓣連成 1 個島）加一顆花心 |

decals 是兩側的 `sakura_*` 和 `xixi_*`。圖片由 `make_pig_v2_decals.py` 用 PIL 畫出，「希希」用 Hiragino W6，`pixels_per_meter` 設 3000／4000。

### 為什麼凹槽不用 Boolean

Boolean 挖洞會產生 ngon 和碎三角形，而 organic profile 要求 1 個島、0 非流形。這裡只是把 loft 上某些頂點往內縮，拓撲完全不變。

## 2. 網頁端

### `pig.ts`

- `PIG_URL` 改成 `models/pig_v2/pig_v2.glb`。
- `enhanceMaterials` 的處理：
  - 不再改 color，emissive 設為 0，因為白色自發光會把紅色洗成粉白。
  - envMap 強度：一般材質 0.55，半透明材質 0.9。
  - 半透明材質設 `depthWrite = false`，而且不投影。

### `pigRig.ts`

1. 依名稱後綴找到腳、耳朵、尾巴節點，各包一層 pivot：
   - 腳：bounding box 的頂面中心。
   - 耳朵：底面中心。
   - 尾巴：max.z 那端，也就是接在屁股上的地方。
2. `update(dt, walkPhase, walkAmount)` 的動作：
   - 腳：fl／br 一組、fr／bl 一組，兩組相差半拍，繞 X 軸擺動，幅度 ±0.55 rad。
   - 耳朵：站著時輕晃，走路時跟著步伐拍動。
   - 尾巴：一直左右搖，走路時搖得更快。
3. 相位沿用 pig.ts 原本整隻搖晃的 `waddlePhase`，腳步和身體擺動才對得上；停下來時 `waddleAmount → 0`，腳慢慢回正。
4. 找不到這些節點時（例如換回第一版）回傳 null，pig.ts 自動略過。

## 3. 換回第一版

把 `pig.ts` 的 `PIG_URL` 改成 `models/pig/pig.glb`。顏色會變成第一版 GLB 自己的顏色，不再是強制粉紅。

## 4. 顏色與腿長調整（第二次回饋）

- 材質改成粉色系：
  - 身體 #F2869F、鼻子 #E77290
  - 耳內 #D65A7E、蹄 #D9678A、尾巴 #E7759A
- 腳的高度 0.04 → 0.026 m，其他元件（含 `body_bounds` 和 decal 的 rect）的 z 一起下移 0.014 m。這樣只有露出來的那段腿減半，插進身體的深度不變，接縫不會露出來。

## 5. 面板換色（`src/world/objects/pigTint.ts`）

- 面板「小豬」資料夾有一個「小豬顏色」選色器，對應 `PigSettings.bodyColor`，預設 `#efbdc9`（使用者在面板調好的淡粉色；模型本身的身體色仍是 #F2869F，換色以它為基準）。調完會在 console 印出佈局，可以貼回 `PIG_LAYOUT_DEFAULT`。
- 為什麼不改 `material.color`：顏色在 64×64 的 palette atlas 貼圖裡。`material.color` 會乘在整張貼圖上，金幣和黃花也會被染色。
- 做法：
  1. 把原始 atlas 畫到 canvas，保留原始像素。
  2. 只替換色相 315°～358°、飽和度 ≥ 0.25、亮度 ≥ 0.55 的格子，也就是身體、鼻子、耳內、蹄、尾巴。
  3. 新顏色 = 選的顏色 × 這格原本相對身體的亮度，所以各部位原本的深淺差異會保留。
- 換色只重畫貼圖、設 `needsUpdate`，不會像 `apply()` 那樣讓小豬重生。

## 6. 肚子滑順化、移除小細節（第三次回饋）

使用者回饋：肚子有凹陷感；肚子裡的金幣和「希希」字樣在畫面上太小看不到。

- 移除的元件：`belly_window`、`belly_coins`、`window` 材質、`xixi_*` decal，以及 builder `piggy_window`、`piggy_coins` 和凹槽相關程式。
- 保留：背上投幣孔的金幣、兩側櫻花。
- `piggy_body` 不再凹。環從 10 個加到 15 個，每環從 20 點加到 28 點，輪廓更圓。
- 網頁端 `pig.ts` 新增 `smoothShade()`，套用在身體、腳、尾巴：
  1. 拿掉每面各自的 normal 和 vertex color，`mergeVertices` 後重算法線。
  2. uv 保留，所以身體和豬鼻、腿和蹄的交界仍然是清楚的折邊。
  3. 複製材質並關掉 `vertexColors`，否則沒有 color 屬性時 WebGL 會讀到黑色。
