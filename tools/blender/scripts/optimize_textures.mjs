// GLB 貼圖後處理：PNG → WebP（EXT_texture_webp）。
//
//   node tools/blender/scripts/optimize_textures.mjs <輸入.glb> [輸出.glb] [--quality 88]
//
// 為什麼在 Blender 匯出之後才做：Blender 的 glTF 匯出器只能內嵌 PNG／JPEG。
// 兩階段：
//   1. 一般貼圖（base color、ORM、AO、decal）→ 有損 WebP，quality 88：檔案約小 70～85%，肉眼幾乎看不出差異
//   2. 法線貼圖與 palette atlas → 無損 WebP：
//      - 法線：有損壓縮會讓方向偏掉，光影出現色塊
//      - atlas：每個色格是精確的顏色，又用 NEAREST 取樣；有損壓縮會讓相鄰色格混色
// 注意：WebP 只減少「下載大小」，GPU 記憶體和 PNG 一樣（瀏覽器會解成原始像素）。
// GPU 記憶體太高時要改用 KTX2（Texture QA 超過 150 MB 會提醒）。
//
// 輸出：最後一行印出 JSON（前後大小、每張圖的格式），給 Python 端讀取。

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';

const args = process.argv.slice(2);
const input = args[0];
const output = args[1] && !args[1].startsWith('--') ? args[1] : input;
const qualityIndex = args.indexOf('--quality');
const quality = qualityIndex >= 0 ? Number(args[qualityIndex + 1]) : 88;
if (!input) {
  console.error('用法：node optimize_textures.mjs <輸入.glb> [輸出.glb] [--quality 88]');
  process.exit(2);
}

// meshopt：Blender 匯出的 GLB 用了 EXT_meshopt_compression，讀寫都需要解碼／編碼器
await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const document = await io.read(input);
const describe = () =>
  document.getRoot().listTextures().map((texture) => ({
    name: texture.getName(),
    mime: texture.getMimeType(),
    bytes: texture.getImage()?.byteLength ?? 0,
    size: texture.getSize(),
  }));
const before = describe();
const lossless = /(_atlas_|atlas_color|atlas_mr)/;

await document.transform(
  dedup(),
  // 1. 有損：排除 normalTexture 與 palette atlas
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    quality,
    slots: /^(?!normalTexture).*$/,
    pattern: new RegExp(`^(?!.*${lossless.source}).*$`),
  }),
  // 2. 其餘還是 PNG 的（法線、atlas）→ 無損 WebP
  textureCompress({ encoder: sharp, targetFormat: 'webp', lossless: true, formats: /png/ }),
);
await io.write(output, document);

const after = describe();
const sum = (list) => list.reduce((total, item) => total + item.bytes, 0);
console.log(
  JSON.stringify({
    input,
    output,
    quality,
    file_bytes: statSync(output).size,
    image_bytes_before: sum(before),
    image_bytes_after: sum(after),
    textures: after.map((item, index) => ({ ...item, before_bytes: before[index]?.bytes ?? null })),
  }),
);
