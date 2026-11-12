# grilled_corn

卡通烤玉米（低多邊形＋程序化玉米粒／醬汁貼圖、竹籤）。

- 來源 plan：`tools/blender/plans/grilled_corn.plan.json`
- 場景佈局：**`src/world/objects/grilledCornLayout.ts`**

## 數量（要幾根）

| 方式 | 說明 |
|------|------|
| **寫死** | `GRILLED_CORN_PLACEMENTS` 陣列有幾筆物件，場景就長幾根 |
| **執行時** | GUI「烤玉米」→「新增玉米」；「移除選中玉米」刪目前選到的那根 |
| **匯出** | 「印出全部設定 (console)」→ 複製 Console 整段貼回 layout 檔或給助手 |

## 每根欄位（皆可各別不同）

| 欄位 | 範圍參考 | 意義 |
|------|----------|------|
| `angleFromTopDegrees` | 0–90 | 離球頂角度 |
| `azimuthDegrees` | -180–180 | 繞球方位 |
| `spinDegrees` | -180–180 | 玉米自轉 |
| `sink` | 約 -0.05–0.08 | 陷入球面 |
| `placementScale` | 0.05–2 | 整體縮放（裝飾大小） |
| `modelSize` | 0.03–0.35 m | 模型最長邊 |
| `emissiveIntensity` | 0–1.2 | 發光 |
| `colorBoost` | 0.7–1.4 | 亮度 |
| `orangeBias` | 0–0.25 | 偏橘 |
| `normalScale` | 0.5–2.5 | 顆粒立體 |
| `steamDensity` | 0–1.8 | 熱氣濃度（0=關） |
| `tintColor` | `#rrggbb` | 染色（乘色；`#ffffff` 不偏色） |
| `tintMix` | 0–1 | 染色強度（0=關） |

`GRILLED_CORN_VISUAL_DEFAULT` 僅為 **新增玉米** 時的初值；已擺好的以 placements 各筆為準。

## 重新產生 GLB

```bash
Blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/scripts/build_from_plan.py -- \
  tools/blender/plans/grilled_corn.plan.json --export
```
