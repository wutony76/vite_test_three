# Tasks

## 1. 規格與設計確認

- [x] 完成 proposal 定稿
- [x] 完成 design 定稿
- [x] 建立還原點（git tag `before-style-grade` → 2eff280）

## 2. 實作

- [x] 新增 `src/world/styleGrade.ts`（settings、共用 uniforms、scan、shader 注入、排除規則）
- [x] 串接既有 `onBeforeCompile` / `customProgramCacheKey`（番茄醬）
- [x] `main.ts` 建立 style grade、定期 scan、面板

## 3. 驗證

- [x] tsc / build 通過
- [x] 開／關截圖對照（全景＋寫實房子特寫）
- [x] 回歸：番茄醬、閃電、火焰、浮空小星球、荷包蛋太陽
- [x] console / WebGL 無 error

## 4. 交付

- [x] `validation.md`
- [x] `docs/Engineering Evidence/style-grade.md`
