# Engineering Evidence：Editorial Portrait 眼睛對位＋停留噴火

## 變更摘要

- 對應變更：`openspec/changes/add-editorial-eye-fire`
- 眼睛對位（commit `979a39e`）：
  - 原 manifest 眼心落在眼睛下方（左眼還偏右約 50px）→ 改為實測虹膜中心 (158, 406)、(370, 405)。
  - 只切虹膜層，眼眶遮罩固定，shader 位移貼圖 UV；底圖虹膜處以兩側眼白逐行內插填色。
  - `bake:portrait -- --debug` 輸出對位疊圖。
- 停留噴火：
  - `src/editorial/burn.ts`：燒點管理、`applyBurn` GLSL（雜訊邊緣洞、餘燼、焦黑）。
  - `src/editorial/eyeFire.ts`：光束／落點火焰／火星粒子（單一 Points）。
  - `src/editorial/shaders.ts`：底圖改自訂 shader（併入 6% 調色）、眼睛蓄力紅光。
  - `src/editorial/main.ts`：停留 3 秒計時（6px 抖動容忍）、離開停火、雙擊還原。

- 第二版：全頁燃燒（使用者：「想影響整頁」「標題內容都要可以燒掉」）
  - `src/editorial/PageFire.ts`：全螢幕透明 overlay（fixed、pointer-events: none），噴火粒子與燒痕都畫在這層。
  - `burn.ts` 改為頁面 px 座標的全螢幕 shader：焦痕半透明焦褐、燒穿畫成焦黑空洞、餘燼只在洞口。
  - `eyeFire.ts` 改用頁面 px（以照片高度為長度單位）；人像改為提供瞳孔頁面座標。
  - 停留判斷擴大到整頁；捲動停火；雙擊整頁還原。

- 第三版：持續燃燒（使用者：「開始燒了之後等到再次點擊再取消，滑鼠移動會隨著移動燒」）
  - `burn.ts` 改為燒灼遮罩 `BurnMask`（頁面大小 HalfFloat 貼圖、ping-pong、線段蓋章），可燒出任意長的軌跡。
  - `PageFire.ts`：`moveTo()` 跟著滑鼠、停留時火圈變大。
  - `main.ts`：開火後持續、點擊停火（不觸發連結）、停火後重新計時。

- 第四版：卡通化＋自燃（使用者：「火焰改成卡通的會比較省資源嗎」→「幫我卡通化，燒超過畫面 10% 停火後仍逐漸整頁燒掉」）
  - 燒痕：硬邊色塊＋預先產生的雜訊貼圖（取代每像素約 20 次程序雜訊），火焰層 pixelRatio 1。
  - 粒子：上限 3000 → 600，水滴火舌／圓形火球／菱形火星，平塗不透明。
  - 自燃：每 0.5 秒非同步量燒黑比例，停火時 > 10% 開始擴散，火線前緣畫橘黃火邊，約 40 秒燒光整頁。

- 第五版：光束改為純色方塊，白 → 橘 → 橘紅漸變（`eyeFire.ts`）。

- 第六版：自燃速度 ×3（約 14 秒燒光整頁），火線上冒少許卡通火花（shader 內繪製）。

- 第七版：自燃中點擊無效（燒光後才可雙擊還原）；噴火中若眼睛已被燒掉，點擊只移除光束、落點繼續燒，再點才停火。

- 第八版：落點火苗改為方格（淡黃白 → 橘 → 紅），與方塊光束同風格。

- 第九版：眼睛到目標改為雷射（漸變線，白 → 橘 → 橘紅），燒到眼睛時點擊移除雷射。

- 第十版：雷射使用中燒到眼睛 → 那隻眼睛的雷射自動取消（逐眼判斷），火繼續燒；燒掉的眼睛在還原前不會再射。

- 第十一版：改為按住左鍵 3 秒發射雷射眼，需持續按住、拖動跟隨，放開即停止並立即做自燃判定；取代停留觸發與點擊停火。

- 第十二版：燒穿的地方露出 product.html（iframe ＋ 動態 CSS mask）。
- 第十三版：改用 product.html 截圖畫在燒痕 shader 的洞裡（不再跑第二個 WebGL 頁面、無 mask 延遲），自燃燒光 0.8 秒後跳轉到 product.html。

- 第十四版：跳轉不閃爍——截圖蓋板交接（已由第十五版取代）。
- 第十五版：軟跳轉——自燃期間偷偷載入真的 product.html（iframe ＋ clip-path 只露出燒穿處，模型好了洞裡就改看真頁面），燒光時直接切成全畫面並 pushState 換網址，不重新載入。

- 第十六版：蓄力紅光改為寫輪眼（shader 繪製、勾玉旋轉、跟著虹膜轉向）；發射時嘴角不對稱上揚成壞笑。

- 第十七版：技能發動黑幕演出、雷射延遲到黑幕劃開才發射；雷射三層光束／流動紋／射出動畫／眼睛光芒／命中衝擊波／畫面震動；黑焰與紫色寫輪眼、紫色雷射（`fireTheme.ts` 可切回 classic）。

- 第十八版：發動時人像加上戲劇化打光、眼周紋路、眉毛下壓、紫色頭髮飄動、查克拉氣場（可竄出照片方框）；自燃火線加黑色焦邊、燒痕紫色提高飽和度。

## 驗證佐證

- 對應 `validation.md` 結論：通過。
- 對位前（綠＝舊座標、青＝實際虹膜）：`assets/editorial-eye-align-before.png`
- 對位疊圖：`assets/editorial-eye-align-debug.png`
- 蓄力紅眼（2.7s / 3.6s）：`assets/editorial-eye-fire-charge.png`
- 噴火與燒穿（2.7s / 3.6s / 6s / 12s）：`assets/editorial-eye-fire-sequence.png`
- 12s → 移開停火 → 雙擊還原：`assets/editorial-eye-fire-burn-restore.png`
- 全頁：落點在標題（3.7s / 7s / 14s）：`assets/editorial-page-fire-title.png`
- 全頁：移開 → 還原 → 落點在照片（7s / 14s）：`assets/editorial-page-fire-photo-restore.png`
- 第三版：開火 → S 形拖曳 → 停留變大：`assets/editorial-fire-trail.png`
- 第三版：點連結停火（URL 不變）→ 雙擊還原：`assets/editorial-fire-trail-stop-restore.png`
- 第四版：卡通火焰（小燒／大燒噴火中／停火 2s 自燃）：`assets/editorial-toon-fire.png`
- 自燃（第六版速度）1.5s／3.5s／6s／9s／14s：`assets/editorial-toon-spread.png`（12% 觸發；1.2% 不觸發）
- 自燃火花：`assets/editorial-spread-sparks.png`
- 第五版：方塊光束：`assets/editorial-square-beam.png`
- 第七版：燒到眼睛 → 點擊移除光束 → 自燃中點擊無效 → 燒光後雙擊還原：`assets/editorial-eye-burned-click.png`
- 第八版：方格火苗：`assets/editorial-square-flames.png`
- 第九版：雷射：`assets/editorial-laser.png`；移除雷射後繼續燃燒：`assets/editorial-laser-removed.png`
- 第十版：燒到眼睛自動取消雷射（左：只燒左眼；右：兩眼都燒掉）：`assets/editorial-laser-auto-off.png`
- 第十一版：按住拖動發射：`assets/editorial-hold-laser.png`；放開 222ms 內自燃判定生效
- 第十三版：洞內露出商品頁截圖（發射中／自燃中）→ 燒光跳轉 product.html：`assets/editorial-reveal-product.png`
- 第十五版：自燃中洞內為真頁面／切換後整頁商品頁：`assets/editorial-soft-switch.png`；錄影切換前後最大幀差 1.8／255
- 第十六版：寫輪眼各階段：`assets/editorial-sharingan.png`；壞笑前後：`assets/editorial-smirk.png`
- 第十七版：黑幕 `assets/editorial-skill-curtain.png`、紫色雷射 `assets/editorial-purple-laser.png`、紫色寫輪眼 `assets/editorial-purple-sharingan.png`、黑焰 `assets/editorial-black-flame.png`
- 第十八版：人像發動效果 `assets/editorial-portrait-power.png`、紫髮 `assets/editorial-purple-hair.png`、自燃焦邊 `assets/editorial-spread-char-rim.png`
- 火焰層不攔截滑鼠（燒痕上 `elementFromPoint` 仍為標題元素）。
- tsc、`npm run build` 通過；headless console 無錯誤。

## 風險與後續追蹤

- 觸控裝置沒有停留觸發（可考慮長按）。
- 發射期間洞內是 product.html 的靜態截圖（自燃後才換成真頁面），product.html 改版時需重新截圖。
- 自燃那十幾秒會同時跑 editorial 與 product 兩個 WebGL；切換後 editorial 的資源即釋放。
- 切換後 product 頁內的網址變化（例如 ?variant=）發生在 iframe 內，不會反映到分頁網址；重新整理會載入真的 product.html。
- overlay 只能「蓋」不能真的移除 DOM：被燒掉的連結看不見但仍可點（刻意保留，避免整頁失去互動）。
- 換照片需手動調整 `LEFT` / `RIGHT` 眼眶參數並用 `--debug` 對位。

## 封存前檢查

- [x] validation.md 已完成且結論為「通過」
- [x] 變更檔案與風險說明已整理完成
- [x] `npm run dev` / `npm run build` 已確認正常
- [x] 已產出 `docs/Engineering Evidence/editorial-eye-fire.md`（未影響架構）
- [ ] 可執行 `openspec archive`
