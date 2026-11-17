# Design

## 食物

- **種類**：`FoodKind = 'nugget' | 'fry' | 'mushroom' | 'lemon'`。
  - 前 11 塊（`FOOD_COUNT`）的亂數順序不變；第 12 塊起依 `EXTRA_FOOD_KINDS` 輪流放。
  - 預設數量 `FOOD_COUNT_DEFAULT = 20`。
- **原型**：香菇、檸檬片載入 `shiitake.glb`、`lemon_slice.glb`，用 `foodPrototypeFromRoot` 縮到面板設定的大小。各自載完就換上，不必等烤雞。
- **碰撞範圍與高度**：每種食物的碰撞半徑由 `foodReach(kind)` 決定，離醬面的高度由 `foodLift(kind)` 決定。
  - 香菇：菇柄和菇傘下緣泡在醬裡。
  - 檸檬片：平浮在醬面上。
- **邊緣亮光**：`addFoodRim(material)` 用 onBeforeCompile 在 `emissivemap_fragment` 加上菲涅耳亮光 `(1 − N·V)^2.5`。
  - 強度由共用的 `foodRimUniform` 控制，面板改值不用重編 shader。
  - `material.clone()` 不會帶 onBeforeCompile，所以每次 `upgradeRiderMesh`、`createRider` 都要重新加。
- **沾醬圈**：
  - 每塊食物一個 Torus，管徑比 0.24、Y 方向壓扁成 0.45，躺平後沉下 10%，只露出上半圈的弧。
  - 每幀跟著醬面的鼓包和食物的浮沉移動，顏色是醬色 ×1.12。
  - 半徑是碰撞半徑 × 0.62；檸檬片要圍在外緣，所以是 × 0.92。
  - 第一版管徑 0.32、沒有壓扁，看起來像游泳圈，已調整。

## 鯊魚

- **鰭的形狀**：`THREE.Shape` 用兩段 `quadraticCurveTo`，前緣外凸、後緣內凹往後勾；擠出時加倒角（bevel，3 段）。
- **尺寸**：寬 0.073、高 0.08（原本的 1.3 倍），碰撞半徑 0.034 → 0.044。
- **跳躍**：
  - `jumpEvery`（預設 9 秒，實際間隔 ×0.6～1.4 隨機）、`jumpHeight`（0.07）。
  - 空中進度 `jumpT` 是 0～1，高度加上 `sin(π t) × jumpHeight`，鰭繞自己的側向軸轉 `(0.5 − t) × 1.2` 弧度。
  - 空中時不冒水波；落下時在落點加兩圈漣漪，第二圈晚 0.35 秒，沿用 `add-ketchup-polish` 的漣漪系統。原本的 `touch` 改成共用的 `addRipple`。

## 使用者回饋：移除沾醬圈與檸檬片

- 沾醬圈整個移除，相關程式（Torus 幾何、材質、`ensureCollar`、`Rider.collar`、面板「沾醬圈大小」）都刪掉。
- 醬上的漂浮食物不再出現檸檬片：
  - `FoodKind` 改成 `'nugget' | 'fry' | 'mushroom'`。
  - `EXTRA_FOOD_KINDS` 改成香菇、雞腿、薯條輪流。
  - 移除檸檬片的模型載入、原型和面板「檸檬片大小」。
- 預設 20 塊食物：11 根薯條、5 隻雞腿、4 朵香菇。

## 使用者回饋：醬上的香菇要躺著

- **問題**：直立的香菇菇柄插在醬裡，看起來像從土裡長出來，不合邏輯。
- **做法**：`lyingPrototype()` 包兩層 Group。
  - 外層 holder 交給漂浮系統：每幀都會重設它的朝向，讓 +Y 對準醬面。
  - 內層 tilt 繞 X 轉 `MUSHROOM_LIE_DEGREES`（70°）。
  - 只包一層的話，躺下的角度每幀都會被覆蓋，又變回直立。實測第一版就是這樣。
- **高度**：`foodLift('mushroom')` 從 −0.18 × size 改成 +0.3 × size，菇傘邊緣和菇柄側面貼著醬面，只沉一小截。沉太深會只露出半個菇傘，像硬幣插在醬裡。
- **使用者回饋「再沉下去一半」**：高度改成面板可調的 `extraFoodSettings.mushroomFloat`（× 香菇大小，面板名稱「香菇浮起高度（小=沉）」，範圍 −0.3～0.5）。預設從 0.3 改成 0，約一半泡在醬裡。

## 使用者回饋：鯊魚不要跳出醬面

- 預設 `jumpEvery` 從 9 改成 0（不跳）。跳躍功能保留，可以在面板「平均幾秒跳一次」重新打開。
