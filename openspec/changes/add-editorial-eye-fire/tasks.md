# Tasks

## 1. 眼睛對位

- [x] 量測虹膜中心與眼眶形狀，輸出對位疊圖
- [x] 重寫烘焙：虹膜層、固定眼眶遮罩、底圖眼白填色（逐行內插＋垂直平滑）
- [x] shader 改為位移貼圖 UV；補 tonemapping / colorspace
- [x] 修正 MultiplyBlending 每幀報錯

## 2. 噴火

- [x] `burn.ts`：燒點管理與 `applyBurn` GLSL
- [x] `eyeFire.ts`：光束／火焰／火星粒子
- [x] 眼睛蓄力紅光（以瞳孔為中心的放射光暈）
- [x] `main.ts`：停留計時、抖動容忍、離開停火、雙擊還原、reduced motion

## 3. 交付

- [x] tsc、`npm run build` 通過
- [x] headless 截圖驗證，console 無錯誤
- [x] validation.md 與 Engineering Evidence
