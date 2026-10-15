# Design

## 1. Scene Structure（場景結構）

- Scene graph：地板（Plane）、階梯 ×7（Box，共用材質）、銀幕（Plane + MeshBasicMaterial）、座位 ×96（Mesh）
- Camera：PerspectiveCamera(55)，位於最後一排後方高處 `(0, 15, ROWS×ROW_GAP + 9)`；OrbitControls 限制 `maxPolarAngle`、`min/maxDistance`
- Lights：AmbientLight 0.6 + DirectionalLight 1.5
- 座標：觀眾面向 -Z；A 排 z = 0 最靠近銀幕，每往後一排 z += 1.4、y += 0.35

## 2. Module Breakdown（模組拆分）

- 新增：`src/cinema/main.ts`（單檔、依段落分區）、`src/cinema/style.scss`、`cinema.html`、`vite.config.ts`
- 職責：Mesh 只負責外觀；座位業務資料存在 `SeatInfo`，以 `Map<Object3D, SeatInfo>` 由 Raycaster 結果反查

## 3. State 設計

- `seats: SeatInfo[]`：`{ id, status: 'available' | 'selected' | 'sold', mesh }`
- `state`：`pointer`、`downX/downY`（點擊 vs 拖曳）、`hovered`、`isBooking`、`message`、`messageType`
- 材質由狀態推導：`materialFor(seat)` = hovered 且可選 → hover，否則 `seatMaterials[status]`

## 4. Interaction Flow（click / _actions / _handlers）

- `click.onPointerUp`：拖曳超過 5px 或送出中 → return；sold → 錯誤訊息；selected → 取消；達上限 6 → 錯誤訊息；否則選取
- `click.onPointerMove / onPointerLeave`：更新 hovered，只 refresh 新舊兩個座位
- `click.onClear` / `click.onConfirm`
- `_actions.submitBooking`：loading guard → early return（無選位）→ await API → success 改 sold / error 保留選取並顯示訊息 → finally 解除 loading
- `_handlers`：`pickSeat`、`materialFor`、`refreshSeat`、`selectedSeats`、`setMessage`、`renderPanel`、`fakeBookingApi`

## 5. Render Loop 與效能

- 每幀只有 `controls.update()` + `render()`，無逐物體更新
- draw calls ≈ 96 座位 + 7 階梯 + 地板 + 銀幕
- 座位形狀以 `mergeGeometries` 合併椅墊 + 椅背為一個 geometry，全部共用

## 6. Assets（資源）

- 無外部資源，全部為程式產生的幾何

## 7. 錯誤處理與可觀測性

- `fakeBookingApi`：800ms、20% 機率 reject
- 錯誤顯示於面板 `.message.error`，不吞錯；送出中按鈕 disabled 並顯示「訂位中…」

## 8. 測試與驗證策略

- `npm run build`（tsc + 多頁面 build）
- Playwright：以 `Math.random` stub 固定 API 成功 / 失敗路徑
- 截圖確認 hover、已選、已售顏色
