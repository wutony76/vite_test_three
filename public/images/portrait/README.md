# Editorial Portrait 素材

正式替換時保持檔名不變，並依 `portrait.manifest.json` 調整眼心座標。

| 檔案 | 說明 |
|------|------|
| `portrait-base.webp` | 已去除虹膜／瞳孔的底圖 |
| `left-eye.webp` / `right-eye.webp` | 虹膜＋瞳孔，透明背景 |
| `left-eye-mask.webp` / `right-eye-mask.webp` | 眼眶移動遮罩（白＝可見） |
| `portrait.manifest.json` | UV 眼心、`maxOffsetUv`、視線增益 |

重新從單張照片烘焙（專案內參考圖）：

```bash
npm run bake:portrait
```

源圖預設為 `tools/img/portrait-source.jpg`。換圖後可改 `tools/bakePortraitLayers.ts` 內的 `centerU` / `centerV`。