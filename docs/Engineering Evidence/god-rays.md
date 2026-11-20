# Engineering Evidence：畫面上方的森林光束（add-god-rays）

## 變更摘要

- `src/world/godRays.ts`：全螢幕疊加光束，平行、從左上往右下，慢慢飄移、呼吸；面板「畫面上方光束（森林光）」可調。

## 驗證佐證

- `tsc` 通過、console 無錯誤；截圖 `assets/god-rays.png`。

## 風險與後續追蹤

- 疊加在整個畫面上，不會被房子、綠球擋住（不是體積光）；太亮會讓左上角的 UI（控制面板以外）跟著變亮，亮度建議 ≤ 0.6。

## 追加：WebGL 警告修正（softLayerPass）

- 現象：開頁面後約 5.6 秒，console 出現 7 次 `GL_INVALID_OPERATION: glDrawArrays: Mismatch between texture format and sampler type (signed/unsigned/float/shadow)`；真 GPU（Apple M2、ANGLE Metal）也會出現，不是 headless 的問題。
- 定位：攔截每個 WebGL 呼叫、呼叫後立刻 getError，抓到出錯的 draw 都在 `softLayerPass.ts`（浮空小星球那一層）的 `renderer.render`，shader 裡有讀陰影貼圖的 sampler2DShadow。
- 原因：小島不投影、不接影，但 renderer 開著陰影時 three.js 還是會在它的 shader 放陰影取樣器；這一層在主場景之前畫，開場某一幀綁到的不是深度貼圖。
- 修正：畫這一層時把 `renderer.shadowMap.enabled` 關掉（畫完還原），小島的 shader 不再有陰影取樣器；開場預熱改用 `islandSoftPass.compileLayer()` 編同樣「沒有陰影」的版本，第一次畫不會卡。
- 驗證：真 GPU 從載入開始 60 秒 console 0 則；每個 WebGL 呼叫都檢查 getError 也是 0 次。
