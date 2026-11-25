# Design

## 分層與對位

| 層 | 內容 | 移動方式 |
|----|------|----------|
| 底圖 | 照片，虹膜處以左右眼白逐行內插填色 | 固定 |
| 眼睛層（左右各一） | mesh 蓋在 manifest `rect` 上；`uMap` = 虹膜圓盤、`uMask` = 杏仁形眼眶 | mesh 與遮罩固定，只位移虹膜貼圖 UV（`uOffset`） |
| 噴火粒子 | `THREE.Points`，renderOrder 10 | CPU 每幀更新 |

- manifest v2 全部使用原圖像素：`rect`、`iris`、`maxOffset`（x 10px / y 3.5px）。
- 眼眶形狀：兩眼角 + 上下眼皮高度 + 弧度 + 峰值位置；`--debug` 輸出疊圖對位。

## 噴火流程（`main.ts`）

```
pointermove ──位移 > 6px 或離開人像區──> 重設計時、停火
每幀 tick：停留 ≥ 2s → setCharge(0..1)（眼睛泛紅）
           停留 ≥ 3s → startFire(x, y)
dblclick → clearBurns()
prefers-reduced-motion → 不噴火
```

## 燒痕（`burn.ts`）

- 最多 12 個燒點（uniform `vec4[]`：中心 xy、半徑、熱度）；超過丟最舊的。
- 半徑 `0.3 × (1 − e^(−t/5))`，點火延遲 0.22s（等火飛到）；停火後熱度以 τ=0.8s 冷卻。
- GLSL `applyBurn`：fbm 雜訊扭曲半徑 → 洞（alpha 0）／餘燼（HDR 橘黃、閃爍）／焦黑漸層。
- 6% 調色原為獨立疊層，燒穿後會在洞上留灰影 → 併入底圖 shader。

## 粒子（`eyeFire.ts`）

- 光束：每眼 1400/s，從目前瞳孔（含視線位移）射向落點，0.22s 抵達。
- 落點火焰：700/s，燒痕小時在中心、變大後沿邊緣冒，向上擾流。
- 火星：70/s，受重力。
- 出生時間在一幀內隨機前推（preAge），低幀率也連續。
- NormalBlending（亮背景上 Additive 會變死白）。

## 第二版：全頁燃燒（使用者回報「想影響整頁」「標題內容都要可以燒掉」）

- 燒痕與噴火粒子從人像 WebGL 移到 `PageFire.ts`：一張 `position: fixed` 全螢幕透明畫布，`z-index: 50`、`pointer-events: none`。
- 座標：頁面 CSS px（含捲動）；長度單位 unit = 照片在螢幕上的高度，火焰比例跟照片一致。
- 燒痕畫法（overlay 看不到底下 HTML 顏色）：
  - 焦痕 → 半透明焦褐色疊上去
  - 燒穿 → 不透明焦黑空洞（邊緣透一點暗紅殘火）
  - 餘燼 → 只在洞口一圈發亮
- 人像只負責眼睛紅光，並提供 `getEyePagePositions()`（瞳孔頁面座標，含視線位移）與 `pxPerUnit`。
- 停留判斷改為整頁任何位置；捲動時停火；雙擊整頁還原（同時清掉雙擊造成的文字反白）。
- 閒置（無燒痕、無粒子）時跳過繪製。
- 燒痕半徑上限 1.8 unit、τ = 16s（約 11 秒燒到一個照片高度）。

## 第三版：持續燃燒、跟著滑鼠燒、點擊停火

- 互動：停住 3 秒開火 → 之後一直燒，滑鼠移到哪火跟到哪 → 再點一下停火（capture 階段 preventDefault，停火那下點到連結不跳頁）→ 停火後重新計時。
- 噴火中離開視窗／失焦不停火（只有點擊能停）；捲動時落點跟著更新。
- 燒痕改為「燒灼遮罩」`BurnMask`（取代固定 12 個燒點）：
  - 頁面大小 × 0.5 的 HalfFloat 貼圖，ping-pong 兩張輪流讀寫
  - R = 累積燒灼量（≥ 1 燒穿）、G = 熱度（τ 0.9s 冷卻）
  - 每幀以「上一幀 → 這一幀落點」線段蓋章，快速移動也不會斷成點點
  - 熱度範圍比燒灼範圍大一圈，洞口燃燒中才有亮紅餘燼
  - 頁面尺寸改變時按頁面座標搬移舊遮罩
- 火圈半徑：移動時 0.05 unit（燒出軌跡），停在原地 `0.05 + 0.45 × (1 − e^(−t/8))` 逐漸變大。
- 顯示：domain warp（雜訊扭曲遮罩取樣位置）讓邊緣不規則；燒灼量 × 雜訊比門檻；焦痕疊細碎紋理。

## 第四版：卡通化（省資源）＋燒超過 10% 自燃

- 成本分析：最貴的是全頁燒痕 shader（有燒痕時每像素每幀約 20 次程序雜訊，Retina 約 560 萬像素），其次是 3000 顆柔邊粒子的重疊繪製。
- 燒痕卡通化：硬邊色塊（深褐描邊 → 焦褐 → 焦黑 → 空洞；燃燒中洞口橘＋黃火邊），`fwidth` 做 1px 反鋸齒；雜訊改讀預先產生的 128² 可拼接雜訊貼圖（每像素 1 次讀取）；火焰層 pixelRatio 固定 1。
- 粒子卡通化：上限 3000 → 600；火舌為水滴形、光束為圓形火球、火星為菱形；黃／橘／紅／深紅描邊四個硬邊色階、不透明，不再大量半透明疊加。
- 自燃擴散：
  - 每 0.5 秒把視窗範圍的遮罩縮成 16×16（每格 6×6 樣本）算燒黑比例，`readRenderTargetPixelsAsync` 非同步讀回（不卡 GPU）
  - 停火時 > 10% → `spreading`：遮罩 shader 讓燒穿處點燃 3 texel 外的鄰居，每格速度隨機（火線參差），約 30～40 秒燒光整頁
  - B 通道記錄火線前緣（燒穿處外 6～12px），畫成橘黃卡通火邊
  - 雙擊還原會停止擴散；用 generation 計數丟棄還原前送出的量測結果

## 第五版：方塊光束

- 眼睛到目標的光束改為純色正方形（point sprite 本身即正方形，整顆單色、無描邊）。
- 顏色依粒子年齡兩段內插：白（剛離開眼睛）→ 橘 → 橘紅（抵達目標）。
- 光束密度 110 → 160 顆／秒／眼（方塊之間才不會斷開）；落點火舌、火星不變。

## 第六版：自燃加速＋火花

- 擴散速率 4 → 12（火線每秒約 70～100 px，整頁約 10～15 秒燒光）。
- 火花畫在燒痕 shader 內（CPU 不知道火線位置）：28px 格子、35% 有火花，起點在火線附近才出現，往上飄約 40px 並縮小；每像素檢查本格與下方兩格。只在自燃時計算（`uSparks`）。
- 遮罩 B 通道多記一圈 0.25（4 倍距離），低於火邊顯示門檻，只供火花判斷出生範圍。

## 第七版：自燃鎖定＋燒到眼睛移除光束

- 自燃中（未燒光）：所有 click / dblclick 在 capture 階段吞掉，不蓄力、不噴火。燒光（面積 ≥ 97%）後才能雙擊還原；燒光後也不再蓄力噴火。
- 噴火時每 0.25 秒用 `BurnMask.probe()` 非同步讀兩眼位置的燒灼量（2×1 小貼圖），≥ 0.9 記為 `eyesBurned`。
- 噴火中點擊：
  - 眼睛已燒掉且光束還在 → 只移除光束（`EyeFire.removeBeam()`）、眼睛紅光熄滅，落點繼續燒並跟著滑鼠
  - 其他情況 → 停火
- 雙擊還原時重設停留計時（不然還原瞬間會因為滑鼠一直停著而立刻開火）。

## 第八版：方格火苗

- 落點火苗由水滴形改為純色方塊，顏色依燃燒時間 淡黃白 → 橘 → 紅，與方塊光束同風格；尺寸縮為約 70%（方塊填滿整個 sprite，視覺上比水滴大）。
- 火星維持小菱形。

## 第九版：雷射

- 眼睛到目標由方塊粒子改為雷射線：每隻眼睛一個 1×1 長方形 mesh，每幀縮放為「兩點距離 × 線寬（0.014 unit ≈ 12px）」、旋轉到連線角度、中點置中。
- 顏色沿線（uv.x）白 → 橘 → 橘紅；上下邊緣以 fwidth 做 1px 反鋸齒；線寬以 sin 微閃。
- 移除光束粒子（BEAM 種類、發射程式）；`removeBeam()` 改為隱藏雷射。
- `EyeFire.object`（Group：雷射＋火苗粒子）取代直接把 points 加進場景。

## 第十版：燒到眼睛自動取消雷射

- `PageFire.eyeBurned[i]`：噴火中每 0.25 秒探測兩眼燒灼量，哪隻眼睛 ≥ 0.9 就呼叫 `EyeFire.disableEye(i)`，那隻的雷射立即關閉（不需點擊），另一隻照常。
- 燒掉狀態保留到雙擊還原（`resetEyes()`）；期間重新開火，燒掉的眼睛不再射雷射。
- 點擊規則不變：有眼睛燒掉且仍有雷射 → 移除剩下的雷射、繼續燒；否則停火。

## 第十一版：按住發射雷射眼

- 觸發改為「按住左鍵 3 秒」（取代滑鼠停留 3 秒），最後 1 秒眼睛蓄力發紅；不到 3 秒放開取消。
- 發射中必須持續按住；拖動時雷射與火跟著走。放開（pointerup / pointercancel / blur）→ 立即停止，並 `evaluateSpreadSoon()` 馬上量面積做自燃判定（> 10% 自燃）。
- 移除「點擊停火」「燒到眼睛點擊移除雷射」（發射中無法點擊）；燒到眼睛自動取消雷射保留。
- 發射後放開時瀏覽器補送的 click 在 capture 階段吞掉（按著連結 3 秒放開不跳頁）；任何新的 pointerdown 會清掉這個旗標，避免誤吞正常點擊。
- 發射中 `html.is-lasering { user-select: none }` 並清除選取；蓄力／發射中 `dragstart` preventDefault（拖動連結不會變原生拖放）。
- 自燃中按住無效；雙擊還原不變。

## 第十二版：燒穿露出 product.html

- `RevealFrame.ts`：全螢幕 iframe（`/product.html`），z-index 40（editorial 內容之上、火焰層 50 之下），`pointer-events: none`，背景焦黑色。
- 遮罩：`BurnMask.renderReveal()` 以顯示相同的雜訊扭曲＋門檻 0.7 畫出「燒穿」區（視窗 ÷ 4 解析度，列由上到下），`readRenderTargetPixelsAsync` 讀回 → 2D canvas → PNG blob → 先 `decode()` 再設 `mask-image`（避免換圖瞬間閃爍），舊 URL 延遲釋放。
- 更新頻率約 15 fps，只在發射中、自燃中與停火後 0.6 秒更新；燒痕不動時不更新。
- 火焰層燒穿處改透明（`uReveal`），焦黑圈與火邊仍畫在上面並蓋住遮罩模糊邊；遮罩門檻 0.7 比洞（1.0）寬，洞擴大時不會因遮罩延遲先露出 editorial。
- iframe 在第一次發射時才建立（product 頁也跑 WebGL），雙擊還原時移除。

## 第十三版：截圖取代 iframe、燒光後跳轉

- 燒穿處改顯示 product.html 的靜態截圖 `public/images/editorial/product-preview.webp`（1440×900），自燃燒光後 0.8 秒 `location.assign('/product.html')`（`PageFire.onSpreadDone`）。
- 截圖直接當貼圖畫在燒痕 shader 的洞裡（object-fit: cover、靠上對齊，貼圖 NoColorSpace 原值輸出），與燒痕同幀、無延遲；移除 iframe、CSS mask、遮罩讀回與 PNG 轉檔（`RevealFrame` / `RevealLayer` 皆刪除）。
- 曾嘗試「截圖 + CSS mask-image 動態遮罩」：自燃時遮罩更新頻繁，瀏覽器每換一次 blob 圖都要重新載入，載入期間整層不可見，洞裡反而看到原本頁面 → 改為 shader 內繪製。

## 第十四版：跳轉不閃爍（頁面交接）

- 閃爍原因：跳到 product.html 時第一個畫面是「3D 模型還沒出來」的半成品（甚至空白），模型載完才冒出來。
- `src/shared/pageHandoff.ts`：
  - editorial 跳轉前 `markHandoff(截圖)` 寫入 sessionStorage
  - product.html `<head>` 內嵌 script＋style：有標記 → `html.is-handoff::after` 第一個畫面就用同一張截圖蓋滿（cover、靠上，與 editorial 最後一刻相同）
  - product 模型 `ready`／`error`（或不支援 WebGL）後 `finishHandoff()`：等兩個 animation frame 再淡出（0.6s ease-in-out）；6 秒保險（僅在蓋板仍存在時觸發）
- 開始自燃時（`onSpreadStart`）prefetch product.html 與 shoe.glb，跳過去多半已在快取。
- 直接開啟 product.html 不受影響（沒有標記就不加蓋板）。

## 第十五版：軟跳轉（取代截圖蓋板交接）

- 開始自燃（`onSpreadStart`）→ `NextPage`：全螢幕同源 iframe 載入 product.html（z 40，editorial 之上、火焰層之下），`clip-path: path(...)` 只露出燒穿區。
- `BurnMask.renderClip()`：視窗 ÷ 4 格子圖（nb ≥ 0.3 或火線前緣 ≥ 0.35，比洞大、落在不透明焦痕／火邊下），約 20 fps 非同步讀回 → 每列連續格合成矩形 → path 字串。clip-path 是文字、設定即生效，不像 mask-image 要載入圖片。
- product 頁模型 ready／error 時 `notifyEmbedReady()`（postMessage，`src/shared/embed.ts`）→ `PageFire.showLive()`：洞裡截圖 0.3 秒淡成透明，看到真的 iframe；焦褐圈在 live 後改不透明（避免透出下一頁的字）。
- 燒光（`onSpreadDone`）＋ 0.6 秒 → `NextPage.activate()`：clip none、開放操作、`history.pushState` 換網址、換 document.title；editorial 人像與火焰層 dispose、`.editorial` display none。
- iframe 載入後插入 `<base target="_top">`：裡面的連結整個分頁跳轉。上一頁（popstate）→ 重新載入 editorial。
- 移除上一版的 `pageHandoff.ts` 與 product.html 內嵌蓋板、prefetch。

## 第十六版：寫輪眼＋壞笑

- 寫輪眼（取代蓄力紅光）：眼睛 shader 以距離函式畫紅色虹膜、黑瞳孔、外環、勾玉軌道與三個勾玉（頭為圓點、尾巴沿軌道收尖）；座標用扣掉視線位移的 irisUv，圖案跟著虹膜轉向。`uCharge` 0→1 漸變出現，保留原眼反光；勾玉角度在 CPU 累加（基本 1.2 rad/s ＋ 蓄力 ×5，發射中 ×1.6）避免轉速改變時跳格。
- 壞笑：底圖 shader 以嘴角為中心的橢圓高斯反向取樣扭曲——右嘴角上 10px／外 3px、左嘴角上 3px（不對稱才像壞笑），右嘴角外上方淡笑紋陰影；發射中 `uSmirk` 以 τ 0.12s 趨近 1，放開回 0。嘴角座標（原圖像素）左 (192, 644)、右 (340, 640)。
