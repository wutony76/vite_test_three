# Validation

## 驗證範圍

- 對應變更：add-editorial-eye-fire
- 驗證環境：本機 Vite dev、Playwright 1.62 headless Chromium（SwiftShader）、1400×1000

## 功能驗證

- [x] 虹膜對位 — 靜止時與原照片一致；左／右／左上看時虹膜在眼眶內移動並被眼皮裁切，無雙影
- [x] 停留 1.5s 無反應、2.7s 眼睛泛紅、3.6s 開火 — 符合
- [x] 中途 2px 抖動不重設計時 — 符合
- [x] 燒痕隨停留時間擴大（6s → 12s），燒到眼睛時眼睛層一併燒穿 — 符合
- [x] 移開後停火、焦痕保留；雙擊還原 — 符合

## 視覺驗證

- `docs/Engineering Evidence/assets/editorial-eye-fire-*.png`、`editorial-eye-align-*.png`

## 回歸驗證

- 滑鼠眼神跟隨正常；console 無錯誤；`npm run build` 通過。

## 問題與修正紀錄

- 蓄力時虹膜變平的橘色圓片：線性亮度門檻用錯 → 改瞳孔中心放射光暈。
- 光束斷成點點：低幀率每幀成批出生 → 出生時間在幀內隨機前推。
- 邊緣火焰像泡泡：縮小尺寸、加密數量、柔化邊緣。
- 右眼眶輪廓上下顛倒：眼角軸方向反了 → 一律以畫面左側眼角為起點。

## 結論

- 是否通過：是
- 已知限制：觸控裝置無停留觸發；燒痕不持久化。

## 第二版：全頁燃燒

- [x] 落點在標題：3.7s 開始燒、7s 左半頁標題與文字被燒掉、14s 蔓延到照片 — `assets/editorial-page-fire-title.png`
- [x] 落點在照片：往外燒到左側標題 — `assets/editorial-page-fire-photo-restore.png`
- [x] 移開停火、焦痕保留；雙擊整頁還原
- [x] 火焰層不攔截滑鼠：`elementFromPoint` 在燒痕上仍回傳 `editorial__title`
- [x] console 無錯誤；tsc、`npm run build` 通過
- 問題：燒穿處整片亮黃方格 → 餘燼沒限制內側（第一版洞會 discard 所以看不出）→ 加內側 smoothstep。
- 問題：7 秒就燒掉大半頁 → τ 8s → 16s。

## 第三版：持續燃燒、跟著滑鼠燒、點擊停火

- [x] 標題上停 3.6s 開火；S 形拖到照片 → 沿路燒出不規則軌跡、中心燒穿、游標附近軌跡有餘燼 — `assets/editorial-fire-trail.png`
- [x] 停在照片 4s → 火圈變大燒出大洞，洞口亮紅餘燼
- [x] 移到「← 練習首頁」點擊 → 停火，URL 不變（不跳頁）；1.5s 後無火、無重新開火；雙擊還原 — `assets/editorial-fire-trail-stop-restore.png`
- [x] console 無錯誤；tsc、`npm run build` 通過
- 問題：軌跡像平滑墨跡、洞是圓盤 → 燒灼速率 4 → 8、加 domain warp 與焦痕紋理。
- 問題：大洞洞口沒有餘燼 → 熱度範圍放寬到半徑 1.5 倍。

## 第四版：卡通化＋自燃

- [x] 卡通火焰：水滴火舌、圓形火球光束、菱形火星；燒痕硬邊色塊 — `assets/editorial-toon-fire.png`
- [x] 燒 1.2% 停火 → 不自燃（spreading = false）
- [x] 燒 12.1% 停火 → 2 秒內開始自燃；2s／8s／16s／26s／40s 逐漸擴大，火線橘黃前緣往外推，40s 整頁燒光 — `assets/editorial-toon-spread.png`
- [x] 雙擊還原：燒痕清空、spreading = false
- [x] console 無錯誤；tsc、`npm run build` 通過
- 效能：headless 為軟體渲染無法量真實 GPU 時間；依計算量估計燒痕層每像素成本由約 20 次程序雜訊降為 1 次貼圖讀取、Retina 像素數 ÷4，粒子數 ÷5。
- 問題：擴散 8 秒就全黑、火線看不到 → 速率 10 → 4，新增 B 通道火線前緣。
- 問題：測試停火後滑鼠停住 3 秒又重新開火（設計行為），自燃只在停火期間觸發 → 測試改為停火後小幅移動滑鼠。

## 第五版：方塊光束

- [x] 光束為純色方塊，靠近眼睛白、往目標漸變橘到橘紅 — `assets/editorial-square-beam.png`
- [x] console 無錯誤；tsc、`npm run build` 通過
- 備註：headless 軟體渲染幀率低，截圖中方塊較稀疏；60fps 下約每道光束 35 顆方塊。

## 第六版：自燃加速＋火花

- [x] 12.4% 停火 → 1.5s／3.5s／6s／9s／14s，約 14 秒整頁燒光 — `assets/editorial-toon-spread.png`（已更新）
- [x] 火線上零星黃／橘菱形火花往上飄 — `assets/editorial-spread-sparks.png`
- [x] 小燒不自燃、雙擊還原；console 無錯誤；`npm run build` 通過
- 問題：火花幾乎看不到（火線帶 12px、出生點落在上面機率低）→ B 通道外圈 0.25 擴大出生範圍、火花加大。

## 第七版：自燃鎖定＋燒到眼睛移除光束

- [x] 瞄準左眼噴火 → eyesBurned = true；點擊 → firing 仍為 true、beam = false；移動滑鼠火跟著走 — `assets/editorial-eye-burned-click.png`
- [x] 再點擊 → 停火；面積 18.8% → 開始自燃
- [x] 自燃中連點 5 下＋雙擊：spreading 仍為 true、面積持續上升（燒痕未被清除）
- [x] 燒光（97.7%）後不再自動開火；雙擊還原，且還原後不會立刻開火
- [x] console 無錯誤；`npm run build` 通過
- 問題：燒光後解除鎖定，滑鼠停著又從燒掉的眼睛噴火 → 燒光後也不蓄力。
- 問題：還原瞬間立刻開火 → 還原時重設停留計時。
- 問題：燒光門檻 98.5% 時量到 98.7%，太接近 → 放寬為 97%。

## 第八版：方格火苗

- [x] 落點火苗為純色方塊、往上竄並縮小消失 — `assets/editorial-square-flames.png`
- [x] console 無錯誤；`npm run build` 通過

## 第九版：雷射

- [x] 兩眼各一條漸變雷射直達目標 — `assets/editorial-laser.png`
- [x] 燒到眼睛 → 點擊移除雷射、火繼續燒並跟著滑鼠 — `assets/editorial-laser-removed.png`
- [x] 回歸：自燃鎖定、燒光後雙擊還原流程不變；console 無錯誤；`npm run build` 通過

## 第十版：燒到眼睛自動取消雷射

- [x] 燒掉左眼（未點擊）→ eyeBurned = [true, false]，左眼雷射消失、右眼照常 — `assets/editorial-laser-auto-off.png`（左）
- [x] 再燒右眼（未點擊）→ 兩條雷射都消失，firing 仍為 true — 同圖（右）
- [x] 點擊停火後停留 3 秒重新開火 → 沒有雷射（眼睛已燒掉）
- [x] 雙擊還原後重新開火 → 雷射恢復、eyeBurned 重設
- [x] console 無錯誤；`npm run build` 通過

## 第十一版：按住發射雷射眼

- [x] 按住 1.5 秒放開 → 不發射；只停著不按 4 秒 → 不發射
- [x] 在「← 練習首頁」連結上按住 3.5 秒 → 發射；拖動 → 雷射與火跟著走、文字未被反白 — `assets/editorial-hold-laser.png`
- [x] 放開 → 立即停止；URL 未改變（連結 click 被吞掉）
- [x] 燒 14.3% 後放開 → 222ms 內開始自燃；自燃中按住 4 秒不發射
- [x] console 無錯誤；`npm run build` 通過

## 第十二版：燒穿露出 product.html

- [x] 發射燒出的洞內顯示 product.html（藍鞋、尺寸按鈕），外圈焦黑邊正常 — `assets/editorial-reveal-product.png`（左）
- [x] 自燃燒光（97.6%）→ 整頁顯示 product.html 商品頁 — 同圖（中）
- [x] 雙擊還原 → iframe 移除、回到 editorial — 同圖（右）
- [x] console 無錯誤（含 iframe 內頁面）；`npm run build` 通過
- 備註：headless 軟體渲染下兩個 WebGL 頁面同時跑，幀率大降、同樣按住時間燒得較少（8～9%），自燃驗證以除錯介面直接啟動；真實 GPU 不受此影響。

## 第十三版：截圖取代 iframe、燒光後跳轉

- [x] 發射燒出的洞內顯示商品頁截圖 — `assets/editorial-reveal-product.png`（左）
- [x] 放開時 17.5% → 自燃，火線內顯示商品頁截圖 — 同圖（中）
- [x] 燒光（95%+）後自動跳轉 `/product.html` — 同圖（右）
- [x] 全流程自然觸發（不需除錯介面）；console 無錯誤；`npm run build` 通過
- 問題：CSS mask 版本自燃中洞內看到原本頁面（mask 圖反覆重新載入）→ 改 shader 內繪製截圖。

## 第十四版：跳轉不閃爍

- [x] 直接開 product.html：`<html>` 無 handoff class
- [x] 錄影逐幀分析（Chromium 播放錄影、requestVideoFrameCallback 取樣）：跳轉前後平均亮度穩定（227.5），無白屏／空白幀
- [x] 跳轉後第一張截圖與 editorial 最後一張差異 0.9／255（蓋板與上一頁一致）
- [x] 蓋板淡出那一幀可見版面落差：截圖 1440×900 以 cover 放到 1400×1000 視窗，與真實排版不同 — `assets/editorial-handoff-frames.png`；改為 0.6s ease-in-out 淡出讓落差變柔和
- [x] console 無錯誤；`npm run build` 通過
- 已知限制：視窗尺寸 ≠ 1440×900 時，蓋板與真實頁面版面略有差異（淡出時看得到漸變）。

## 第十五版：軟跳轉

- [x] 自燃中洞內為真的 product.html（依目前視窗排版）— `assets/editorial-soft-switch.png`（左）
- [x] 燒光後網址 `/product.html`、標題換成商品頁、editorial 未重新載入（同一 document：`.editorial` display none、火焰層已移除）— 同圖（右）
- [x] 切換後 iframe 可操作：點第二個配色 → 標籤變「珊瑚粉」
- [x] 錄影逐幀：切換前後最大幀差 1.8／255、平均亮度 225～230，無閃白、無版面跳動
- [x] console 無錯誤；`npm run build` 通過
- 備註：headless 同時跑兩個 WebGL 很慢，測試需按住較久才超過 10% 門檻。

## 第十六版：寫輪眼＋壞笑

- [x] 寫輪眼：平常／蓄力中／蓄力滿／發射中／轉向右上／放開恢復 — `assets/editorial-sharingan.png`
- [x] 壞笑：發射前（上）與發射中（下）嘴角比較 — `assets/editorial-smirk.png`
- [x] console 無錯誤；`npm run build` 通過
- 問題：第一版右嘴角只上 6px 幾乎看不出 → 加大為 10px＋笑紋陰影加深。

## 第十七版：技能發動黑幕、雷射加強、黑焰與紫色配色

- [x] 黑幕各階段（暫停動畫截圖 0／90／180／300／450／590ms）— `assets/editorial-skill-curtain.png`
- [x] 雷射在黑幕出現後才發射；黑幕中放開 → 不發射
- [x] 紫色雷射（三層＋流動紋）、眼睛光芒、衝擊波、畫面震動觸發 — `assets/editorial-purple-laser.png`
- [x] 紫色寫輪眼 — `assets/editorial-purple-sharingan.png`；黑焰火苗 — `assets/editorial-black-flame.png`
- [x] console 無錯誤；`npm run build` 通過
- 問題：先做的「整頁上下切開」（View Transitions）改為使用者要求的「新黑幕切開」；黑幕淡出太快看不出破開 → 延後淡出、加大滑動距離；火苗描邊版使用者偏好單色漸層 → 移除描邊。

## 第十八版：人像發動效果、紫色頭髮、燒痕紫色加強

- [x] 蓄力／發射／放開：打光、紋路、眉毛、輪廓光、氣場（竄出方框）、紫髮，放開後全部退回 — `assets/editorial-portrait-power.png`
- [x] 紫色頭髮兩幀比較（光澤位置流動）— `assets/editorial-purple-hair.png`
- [x] 自燃火線：黑焦邊＋深紫＋亮紫 — `assets/editorial-spread-char-rim.png`
- [x] console 無錯誤；`npm run build` 通過
- 問題：氣場只有細帶 → 遮罩模糊 σ18→45、雜訊權重加大、三段色階；肩膀上方實心紫帶與放開殘留 → 取樣值上限 0.5、門檻隨強度提高
- 問題：sharp 對單通道原始資料 blur 會輸出 3 通道 → 頭髮遮罩錯位橫紋 → `extractChannel(0)`
