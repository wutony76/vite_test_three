# lime_shop

## lime_shop.glb

Low Poly 版（lowpoly_kit 流程）。正面朝 **-Y**，原點在地面中心。

- 根節點：`LimeShop`
- 招牌掛點：`LimeShop_SignAnchor`（`userData.attach_model` → `denpa_sign/denpa_sign.glb`）
- 場景內建時會一併掛上縮放版霓虹字（`neon_channel` 與獨立招牌相同）

重建：

```bash
Blender --background --factory-startup --python-exit-code 1 \
  --python tools/blender/scripts/build_lime_shop.py
```

## lime_shop_art.glb

插畫風較高還原版：**不走** lowpoly_kit，使用 primitive、倒角、曲線電線、分格窗、多塊剝落磚、發光燈罩。

```bash
Blender --background --python tools/blender/scripts/build_lime_shop_art.py
```

或在已開 Blender 裡執行同腳本。根節點 `LimeShopArt`，招牌掛點 `LimeArt_SignAnchor`。
