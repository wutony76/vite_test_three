# Design

## 1. 模型（`tools/blender/plans/shiitake.plan.json`）

| 元件 | kind | profile | 說明 |
|---|---|---|---|
| stem | mushroom_stem | organic | lathe 旋轉體，短粗、底部略寬；上端約 8 mm 插進菇傘底面 |
| cap | mushroom_cap | organic | lathe 旋轉體，剖面依序是：底面菌褶（中間高、往外斜下）→ 往內捲的邊緣 → 圓頂。三段用不同材質 |
| cross_cut | mushroom_cross | decoration | 掛在 cap 底下（`parent: cap`）。4 片斜 45° 的葉形薄片，沿圓頂曲面彎：上緣比圓頂高一點，下緣埋進圓頂 |

- 十字花刀要知道圓頂的高度，所以用 `params.cap_bounds` 帶入菇傘的 bounds，和菇傘共用同一條剖面（`_CAP_PROFILE`）。
- 葉片兩端各留一點長度：寬度為 0 的地方會產生退化面。

## 2. 網頁端（`src/world/objects/shiitake.ts`）

### 載入時量好的數字（菇傘、菇柄節點自己的單位）

- `stemTop`：菇柄頂端的高度。
- `capUnderside`：菇傘底面正中央（菇柄正上方）的高度。
- `bury`：原始模型裡菇柄插進菇傘的深度。

### 套用倍率

1. `stem.scale.y = 原本 × 菇柄高度`。
2. `cap.scale = 原本 × 菇傘大小`。meshopt 量化會讓節點縮放不等於 1，所以一律用「原本 × 倍率」。
3. 菇傘高度 `cap.y = stemTop × 菇柄高度 − bury − capUnderside × 菇傘大小`，最低到 0，避免傘緣鑽進土裡。

### 其他

- 量整體大小時，先把菇柄、菇傘恢復原始比例，並且暫時從場景拿下來。`Box3.setFromObject` 量的是世界座標，掛在綠球上時會把綠球的位置、旋轉一起算進去，算出來的置中位移會錯，香菇就飛走了。這是實測時發現的 bug。
- 接線：
  - 加進 `getPigObstacleRoots()`，小豬避障和草叢撒點都會繞開香菇。
  - 開場動畫在篝火之後長出來。
  - 加進拖曳目標，可以在場景裡直接拖。
  - `WORLD_GLTF_URLS` 預載 `shiitake.glb`，並順手把舊的 `pig.glb` 換成 `pig_v2.glb`。

## 3. 菇傘改扁（使用者回饋：不要像蘑菇那麼厚）

- 菇傘 bounds 高度從 0.06 改成 0.034 m，厚度約為直徑的 0.28。剖面也調整成肩膀較寬、頂端較平。十字花刀的 `cap_bounds` 跟著更新。
- 面板新增「菇傘厚度」（`capThickness`，預設 1，範圍 0.3～2），只縮放菇傘的高度方向，直徑不變。
- 菇傘變薄時，菇柄插入的深度也等比例變淺，不然菇柄頂端會從薄薄的菇傘頂穿出來。

## 4. 可以複製擺設（多顆香菇）

- `shiitake.ts` 新增 `SHIITAKE_PLACEMENTS`，每顆是 `{ id, ...ShiitakeSettings }`，預設只有一顆 `shiitake_1`。另外新增 `formatShiitakePlacementsForPaste()`，印出全部擺設。
- `obj.ts` 改成清單：`shiitakes`、`addShiitake(seed)`、`removeShiitake(entry)`。
  - 複製時沿用選中那顆的全部設定，方位 +12°，避免疊在同一個位置。
  - 避障、開場動畫（一顆接一顆長出來）、拖曳都改成對整個清單處理。
- `main.ts` 的「香菇」面板改成「選一顆、調一顆」，做法和檸檬片一樣：
  - 點選或拖曳哪一顆，面板就換成那一顆的滑桿；選中的那顆會微微發亮（`setHighlight`）。
  - 按鈕：「複製香菇」「移除選中香菇」「印出全部擺設 (console)」。

## 5. 微微晃動

- 結構改成 anchor（位置、朝向）→ `sway` Group → model。模型原點在菇柄底部，所以轉 `sway` 就是以菇柄底部為支點擺動，不會離開地面。
- `update(dt)` 每幀執行：
  - `sway.rotation.x` 用 sin(t×1.3)、`.z` 用 sin(t×0.9＋1.1)。兩個方向頻率不同，軌跡是不規則的小圓，不是一直線來回。
  - 菇傘相位慢半拍、幅度約一半，像有重量在甩。
- 每顆的相位、速度隨機錯開。
- 新增設定 `swayDegrees`（預設 3°）、`swaySpeed`（預設 1），面板上是「晃動幅度」「晃動速度」，也會寫進印出的擺設。

## 6. 菇傘顏色、更大的範圍、使用者的三顆擺設

- `SHIITAKE_PLACEMENTS` 換成使用者在面板調好的三顆。
- 面板範圍：「菇傘大小」上限 2.5 → 6；「菇柄高度」上限 2.5 → 8。
- 新增「菇傘顏色」（`capColor`，預設 #8a4b22），每顆各自設定：
  - 每顆的菇傘各自複製一份 atlas 貼圖畫到 canvas，每個像素換成「目標色 × 原本相對傘面的亮度」，所以捲邊、菌褶的深淺層次會保留。
  - 不用 `material.color` 相乘：原本的咖啡色幾乎沒有藍色成分，乘不出藍色，實測會變成灰綠色。
  - **坑 1**：`texture.clone()` 會共用同一個 `Source`。直接設 `texture.image` 會改到共用的那張，所有香菇（連十字花刀、菇柄）都會被染色。要設 `texture.source = new THREE.Source(canvas)`。
  - **坑 2**：`Color.r/g/b` 是線性空間的值，要用 `getHex()` 取得 sRGB，顏色才會和選色器一致。`pigTint.ts` 有同樣的問題一併修正，小豬預設色改成 `#dc8295`，修正後畫面看起來和原本的 `#efbdc9` 一樣。
