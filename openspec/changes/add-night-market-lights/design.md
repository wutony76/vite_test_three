# Design

## 1. Scene Structure

- 街道沿 z 軸往遠處延伸（z 9 → −18），中央步行區 x −2 ~ 2
- 攤位：左右各 4（x = ±4.3，z = 5、1、−3、−7），面向街道中央
- 串燈：兩側雨棚之間 Z 字形來回，每段下垂
- 牌樓：z = −13，兩根柱子 + 跑馬燈招牌 + 燈泡外框
- 背景：兩側大樓剪影（窗光貼圖）、深色漸層天空、霧
- 相機：(0, 3.4, 11) 看向 (0, 2, −6)，OrbitControls 限制角度

## 2. Module Breakdown

- `src/market/main.ts`：狀態、控制台、點擊攤位、情境
- `src/market/Stage.ts`：renderer、EffectComposer（Render → Bloom → Output）、controls、loop
- `src/market/stalls.ts`：攤位資料（名稱、配色、霓虹圖示）
- `src/market/Stall.ts`：攤位 class（建模、霓虹、燈箱、燈條、工作燈、點亮動畫）
- `src/market/neonIcons.ts`：霓虹圖示筆畫路徑
- `src/market/LedStrip.ts`：燈條（Shader + RectAreaLight）
- `src/market/StringLights.ts`：街道串燈（InstancedMesh + 模式）
- `src/market/Gate.ts`：牌樓、跑馬燈、追逐燈泡
- `src/market/Crowd.ts`：人潮
- `src/market/Street.ts`：地面反射、背景大樓、熱氣
- `src/market/textures.ts`、`shaders.ts`、`ambience.ts`、`style.scss`

## 3. State 設計

- `power`、`dimmer`、`bloom`、`haze`、`crowd`、`sound`
- `stalls: Record<id, boolean>`、`strip: { mode, color, speed }`、`bulbs: 'steady' | 'twinkle' | 'chase'`
- `preset`：目前情境（手動調整後清除標示）

## 4. Interaction Flow

- 點攤位（射線檢測攤位點擊範圍）→ 開關該攤
- 控制台 → state → `_actions.apply()` 同步到 3D
- 總電源關：攤位依序熄滅、串燈與牌樓關閉；開：依序閃爍點亮

## 5. Render Loop 與效能

- 每幀：燈條 uniform、RectAreaLight 代表色、串燈 instanceColor、跑馬燈 offset、人潮位置、熱氣、點亮動畫
- 不開陰影；Reflector 半解析度；手機不使用 Reflector

## 6. Assets

- 無外部資源

## 7. 錯誤處理

- WebGL 不支援：顯示提示；AudioContext 失敗：toast

## 8. 測試與驗證策略

- Playwright（GPU）、截圖、FPS
