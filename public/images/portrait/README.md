# Editorial Portrait 素材

由 `tools/bakePortraitLayers.ts` 從單張照片烘焙，正式替換時保持檔名不變。

| 檔案 | 說明 |
|------|------|
| `portrait-base.webp` | 虹膜位置已填成眼白的底圖 |
| `left-eye.webp` / `right-eye.webp` | 只有虹膜＋瞳孔的圓盤，透明背景；執行時只有這層會位移 |
| `left-eye-mask.webp` / `right-eye-mask.webp` | 固定不動的眼眶開口遮罩（白＝可見），與虹膜層同尺寸 |
| `portrait.manifest.json` | 圖層矩形、虹膜中心、最大位移（皆為原圖像素）與視線增益 |

重新烘焙：

```bash
npm run bake:portrait
# 換照片時先輸出對位疊圖，確認洋紅（眼眶）、青色（虹膜）貼合
npm run bake:portrait -- --debug portrait-debug.png
```

源圖預設為 `tools/img/portrait-source.jpg`，換圖後改腳本內 `LEFT` / `RIGHT` 的眼角、眼皮高度、虹膜中心與半徑。
