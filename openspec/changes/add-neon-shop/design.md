# Design

- 資產設計（元件、尺寸、材質、decal）以 `tools/blender/plans/neon_shop.plan.json` 為準（lowpoly.asset/1）。
- 座標：正面 -Y = 參考圖右面（店面大窗、雨遮、二樓窗、冷氣、黃色燈箱、三個圓招牌、長凳、紙箱）；
  -X 側 = 參考圖左面（頂樓「電 • 波 • 町」招牌、二樓燈箱、入口門、直立小招牌、洋紅立牌）。
- 入口門 `transform.rotation_deg = [0, 0, -90]`：`layout._builder_comp` 對 quarter-turn 元件把 bounds 的寬深對調後交給 builder，轉完剛好填滿資產座標的 bounds。
  已知限制：quarter-turn 元件底下的子元件位置不會跟著換算（本資產的門沒有子元件）。
- 發光：霓虹、招牌、窗內暖光用 emissive 材質；招牌字 decal（`*_glow`）在 `obj.ts` 的 `lightUpGlowDecals` 設 `emissiveMap = map`、`toneMapped = false`（styleGrade 也會跳過）。
- Gamehall：`GAME_HALL_MODEL_URL` 改為 neon_shop；`spinDegrees` 99 → 189，讓招牌面朝向預設鏡頭。
