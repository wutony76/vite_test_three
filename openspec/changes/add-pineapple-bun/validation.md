# Validation

## 結果：通過

- **plan**：`validate_plan` ok = True，沒有 warning。
- **建模**：6 個 Object（＋1 個 decal）拓撲全部 pass，麵包上下兩半、奶油各 1 個島、0 非流形；2782 個三角面、9 個 primitive（預算 9000／12）；GPU 貼圖 8.0 MB（預算 10 MB）。
  - Texture QA 剩 warn：上半顆 22% 面積 UV 拉伸 > 1.5×（圓頂頂端用 cylinder UV 的必然結果）、純色面積 44%（奶油、麵包心、青苔刻意用純色）。
- **threejs_plan_check**：ALL PASS（單一根節點、decal 用 MASK、meshopt 壓縮、draw call 9 ≤ 12）。
- **test_shapes**：29 passed（含 `test_pineapple_bun_parts_are_closed_and_face_out`）。
- **瀏覽器**：
  - 預設視角：菠蘿麵包在畫面左下，下半部泡在番茄醬海裡，木牌字清楚。
  - 鏡頭繞球轉兩次（1.4、2.6 弧度）：麵包都留在畫面左側同一個位置，木牌一直朝鏡頭。
  - console 沒有錯誤；`tsc` 通過。

## 問題與修正

- 貼圖 GPU 11 MB 超過預算 → 木牌材質降成 prop tier（沒有調高預算）。
- 酥皮看起來像拼布方塊 → planar UV 改 cylinder；龜裂格看不出來 → 溝加深並換深色材質；焦斑變黑點 → 焦斑色改成接近底色。
- 第一次擺放太高（在綠球邊緣上）→ 先把畫面位置往下調。
- 使用者回報：視窗拉寬時麵包固定在視窗左下、不在番茄醬裡 → 改成沿著番茄醬圈圈找畫面左側的點。
  - 只用固定角度（-55°）的話，1000 寬時 x = -1.15（跑出畫面）、1800 寬時 x = -0.64，所以改用二分搜尋找 x = -0.7 的角度。
  - 實測：1000×700 與 1800×700，預設視角與鏡頭轉 2.2 弧度後，麵包都在 x = -0.70、在醬上（`pineapple-bun-wide.png`）。
  - 1800 寬時曾出現 WebGL texture format 警告，關掉麵包前後 3 秒內都是 0 次，跟麵包無關（headless swiftshader 偶發）。

**截圖**：
- `docs/Engineering Evidence/assets/pineapple-bun-render.png`
- `docs/Engineering Evidence/assets/pineapple-bun-in-scene.png`
- `docs/Engineering Evidence/assets/pineapple-bun-rotated.png`

## 第二輪（使用者回報）

- 面板數值貼回預設；起伏時加上左右轉（`turnDegrees` 14°）。
- 「醬中的食物、鯊魚直接穿過麵包」→ 加上繞道。90 秒、300 次取樣：食物／鯊魚離麵包底部中心最近 0.083（麵包半徑 0.115），進到 0.7 倍半徑內 0 次。
- 「醬流動時隱約看到醬穿刺」→ 醬面在麵包底下壓凹洞（預設 0.07）。近拍連三張，麵包底部不再有醬的流紋、醬面穿出。
- headless swiftshader 偶發 `GL_INVALID_OPERATION: Mismatch between texture format and sampler type` 警告；先前關掉麵包比對時兩邊都是 0 次，判斷跟這次變更無關。

## 第三輪（使用者回報）

- 面板數值貼回：screenX -0.8、凹洞 0.02。
- 「放到綠球後面」＋「視窗寬度改變時不改變位置」→ 改成醬圈上的固定角度 115°（醬圈後段）。
  - 1000×700：畫面 x = -1.02（在左邊緣、一部分在畫面外）；1800×700：x = -0.57，木牌從綠球左後方露出來、下半部被醬擋住（`pineapple-bun-wide.png`）。
  - 兩種寬度下，鏡頭轉 2.2 弧度前後畫面位置都不變。

## 第四輪（使用者回報）

- 「載入時機在番茄醬載完之後」→ 醬繞滿一圈才出現。頁面內逐幀紀錄：2.92s 醬還沒流出、麵包隱藏 → 28.65s 醬繞滿、麵包仍隱藏 → 之後麵包出現並長到 1。
  - headless（swiftshader）一幀很慢，醬從 0 直接跳到 1，看不到中間長出來的過程；順序已確認。

## 第五輪（使用者回報）

- 「轉動綠球時菠蘿飄在空中」→ 原因：高度是「管子中心＋固定 0.09」，沒跟著醬面的鼓包、蠕動與凹洞；醬面往下凹時底部離開醬面。
- 改成放在 `getSurfacePoint` 算出的醬面上（lift 改成相對醬面，預設 -0.03）。鏡頭繞 5 個角度近拍，麵包底部都在醬裡（`bun8_all.png`）。
