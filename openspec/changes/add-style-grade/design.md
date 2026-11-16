# Design

## 1. Scene Structure（場景結構）

- 不新增場景物件；只在既有材質的 fragment shader 尾端加一段調色。
- 掃描根節點：`scene`（含 `all`、ground、ketchup 等）。
- 排除：祖先名稱為 `floating_island`、`egg_sun_anchor` 的物件；`material.toneMapped === false`；`ShaderMaterial` / `RawShaderMaterial`；Sprite / Points / Line。

## 2. Module Breakdown（模組拆分）

- 新增模組：
  - `src/world/styleGrade.ts`
    - `STYLE_GRADE_DEFAULT`：預設參數
    - `createStyleGrade({ root })`：回傳 `{ settings, apply, scan, dispose }`
    - `formatStyleGradeSettingsForPaste()`：面板調完貼回用
- 既有模組調整：
  - `src/world/main.ts`：建立 style grade、每 0.5 秒 `scan()`、新增「畫面風格統一」面板
- 職責與邊界：
  - styleGrade 只負責「找到材質 → 注入 shader → 更新共用 uniform」，不碰光源、不改 material.color

## 3. State 設計

- `settings`（單一狀態物件）：
  - `enabled`
  - 全場色調：`tintAmount`（0～1）、`tintColor`、`shadowLift`、`shadowColor`
  - 寫實貼圖：`textureSaturation`（1 = 原樣）、`textureContrast`（1 = 原樣）
- 共用 uniforms（所有材質同一份物件）：`uGradeEnabled`、`uTintAmount`、`uTintColor`、`uShadowLift`、`uShadowColor`、`uTexSaturation`、`uTexContrast`、`uTexPivot`
- `apply()`：把 settings 寫進 uniforms（不重新編譯）

## 4. Interaction Flow

- GUI 拖動 → `settings` 改變 → `apply()` 更新 uniforms → 下一幀生效
- `scan()`：traverse root → 未處理過且符合條件的材質 → 包裝 `onBeforeCompile` → `needsUpdate = true`

## 5. Shader 注入

- `#include <map_fragment>` 之後（只有「LINEAR 取樣的 map」才注入 = A 類寫實貼圖）：
  ```glsl
  float texLum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 texSoft = mix(vec3(texLum), diffuseColor.rgb, uTexSaturation);
  // 對比：只壓縮「亮度」往中間值 uTexPivot 收，再把顏色等比例縮放，色相不變
  float newLum = mix(uTexPivot, texLum, uTexContrast);
  texSoft *= newLum / max(texLum, 1e-3);
  diffuseColor.rgb = mix(diffuseColor.rgb, texSoft, uGradeEnabled);
  ```
- `#include <tonemapping_fragment>` 之前（所有符合條件材質）：
  ```glsl
  vec3 graded = gl_FragColor.rgb;
  float gLum = dot(graded, vec3(0.2126, 0.7152, 0.0722));
  graded += uShadowColor * uShadowLift * (1.0 - smoothstep(0.0, 0.12, gLum)); // 暗部抬成淡紫
  graded = mix(graded, uTintColor, uTintAmount);                              // 整體往粉色靠
  gl_FragColor.rgb = mix(gl_FragColor.rgb, graded, uGradeEnabled);
  ```
- `customProgramCacheKey`：`原本 key + '|styleGrade:v1:' + (有無貼圖降對比)`，避免與未注入的程式共用。

## 6. Render Loop 與效能

- 每幀無額外工作；`scan()` 每 0.5 秒一次（只 traverse，不建立物件）。
- 每種材質組合多一次編譯；開關／調整不重新編譯。

## 7. 錯誤處理與可觀測性

- `scan()` 包 try/catch，失敗時 console.warn 並跳過該材質，不影響其他物件。
- 面板「目前已調色材質數」顯示處理數量，方便確認有套到。

## 8. 測試與驗證策略

- 型別檢查 / build：`npx tsc --noEmit`、`npx vite build`
- 截圖：開／關各一張（同鏡頭、等到入場動畫結束）＋ A 類房子特寫
- 回歸：番茄醬繞圈、閃電、火焰、浮空島
