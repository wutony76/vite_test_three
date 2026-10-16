# Design

## 1. Scene Structure

- 1 單位 = 1 公尺；小島半徑 46（草地 40、沙灘環），外圍海面
- 出生點 (0, 1, 6) 朝 -z；「THREE LAB」大字在 z = -8
- 作品區域：半徑 22 的圓上平均 6 個；保齡球、木箱、跳台在半徑 11~14 之間錯開
- 鏡頭：跟隨點平滑追車，偏移方向可被拖曳旋轉（方位角），距離可縮放

## 2. Module Breakdown

- `src/drive/main.ts`：狀態、UI、迴圈
- `src/drive/Car.ts`：底盤剛體 + RaycastVehicle + 車模型同步
- `src/drive/world.ts`：小島、邊界、樹、跳台、可撞物件（剛體 + Mesh 配對）
- `src/drive/zones.ts`：作品區域資料、地面圓台
- `src/drive/Input.ts`：鍵盤 / 觸控 → { throttle, steer, brake, boost }
- `src/drive/CameraRig.ts`：跟車鏡頭
- `src/drive/Dust.ts`：揚塵粒子
- `src/drive/audio.ts`：引擎聲、喇叭
- `src/drive/style.scss`

## 3. State 設計

- `status`：`'intro' | 'playing'`
- `activeZone`、`flippedFor`（秒）、`sound`

## 4. Interaction Flow

- 每幀：Input → Car.update → world.step → 同步 Mesh → 區域偵測 → 鏡頭 → 揚塵 → 音效 → render
- Enter / 卡片按鈕：前往該區域連結
- R / 按鈕：重置到最近的安全點（出生點）

## 5. 效能

- SAP broadphase、睡眠、陰影 2048 跟車

## 6. Assets

- 無外部資源（Canvas 文字貼圖、程式幾何、Web Audio）

## 7. 錯誤處理

- WebGL 不支援提示；AudioContext 失敗不影響駕駛

## 8. 測試

- Playwright 鍵盤 / 觸控、截圖、FPS
