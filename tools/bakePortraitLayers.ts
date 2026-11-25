/**
 * 從單張人像產生 editorial 分層 WebP（底圖去瞳孔、雙眼、遮罩）。
 * 執行：npm run bake:portrait
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const SOURCE = join(ROOT, 'tools/img/portrait-source.jpg')
const OUT_DIR = join(ROOT, 'public/images/portrait')

type EyeSpec = {
  centerU: number
  centerV: number
  radiusUv: number
  maxOffsetUv: number
  maskScale: number
}

const LEFT: EyeSpec = {
  centerU: 0.358,
  centerV: 0.428,
  radiusUv: 0.068,
  maxOffsetUv: 0.038,
  maskScale: 2.35,
}

const RIGHT: EyeSpec = {
  centerU: 0.642,
  centerV: 0.428,
  radiusUv: 0.068,
  maxOffsetUv: 0.038,
  maskScale: 2.35,
}

const ellipseSvg = (size: number, rx: number, ry: number, feather = 0) => {
  const cx = size / 2
  const cy = size / 2
  const soft = feather > 0
    ? `<defs><filter id="f"><feGaussianBlur stdDeviation="${feather}"/></filter></defs>`
    : ''
  const filt = soft ? ' filter="url(#f)"' : ''
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${soft}<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"${filt}/></svg>`,
  )
}

const radialMaskSvg = (size: number) => {
  const id = 'g'
  return Buffer.from(
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="${id}" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stop-color="white"/>
          <stop offset="100%" stop-color="black" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#${id})"/>
    </svg>`,
  )
}

async function extractEye(
  source: Buffer,
  w: number,
  h: number,
  spec: EyeSpec,
  feather: number,
) {
  const cx = Math.round(spec.centerU * w)
  const cy = Math.round(spec.centerV * h)
  const r = Math.max(8, Math.round(spec.radiusUv * w))
  const size = r * 2
  const left = Math.max(0, Math.min(cx - r, w - size))
  const top = Math.max(0, Math.min(cy - r, h - size))
  const cropW = Math.min(size, w - left)
  const cropH = Math.min(size, h - top)

  const crop = await sharp(source).extract({ left, top, width: cropW, height: cropH }).png().toBuffer()

  const irisMask = await sharp(ellipseSvg(size, r * 0.92, r * 0.68, feather))
    .resize(cropW, cropH)
    .png()
    .toBuffer()

  const eyeWebp = await sharp(crop)
    .ensureAlpha()
    .composite([{ input: irisMask, blend: 'dest-in' }])
    .webp({ quality: 94, effort: 6 })
    .toBuffer()

  const maskSize = Math.max(cropW, Math.round(r * spec.maskScale * 2))
  const socketMask = await sharp(radialMaskSvg(maskSize))
    .resize(cropW, cropH, { fit: 'fill' })
    .webp({ quality: 92, effort: 6 })
    .toBuffer()

  return { eyeWebp, socketMask, cx, cy, r, maskSize }
}

async function inpaintSocket(source: Buffer, w: number, h: number, spec: EyeSpec) {
  const cx = Math.round(spec.centerU * w)
  const cy = Math.round(spec.centerV * h)
  const rx = Math.max(12, Math.round(spec.radiusUv * w * 1.22))
  const ry = Math.max(10, Math.round(spec.radiusUv * w * 0.95))
  const patchW = rx * 2
  const patchH = ry * 2
  const sampleTop = Math.max(0, cy - ry * 5)
  const sampleLeft = Math.max(0, Math.min(cx - rx, w - patchW))

  const skinPatch = await sharp(source)
    .extract({
      left: sampleLeft,
      top: sampleTop,
      width: Math.min(patchW, w - sampleLeft),
      height: Math.min(patchH, h - sampleTop),
    })
    .resize(patchW, patchH, { fit: 'fill' })
    .blur(14)
    .toBuffer()

  const holeMask = await sharp(ellipseSvg(patchW, rx, ry, 2.4))
    .resize(patchW, patchH, { fit: 'fill' })
    .png()
    .toBuffer()

  const stamp = await sharp(skinPatch)
    .composite([{ input: holeMask, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const left = cx - rx
  const top = cy - ry
  const actualLeft = Math.max(0, left)
  const actualTop = Math.max(0, top)
  const cutLeft = actualLeft - left
  const cutTop = actualTop - top
  const actualW = Math.min(patchW - cutLeft, w - actualLeft)
  const actualH = Math.min(patchH - cutTop, h - actualTop)

  const stampCropped = await sharp(stamp)
    .extract({ left: cutLeft, top: cutTop, width: actualW, height: actualH })
    .png()
    .toBuffer()

  return sharp(source).composite([{ input: stampCropped, left: actualLeft, top: actualTop }])
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const source = await sharp(SOURCE).rotate().toBuffer()
  const meta = await sharp(source).metadata()
  const w = meta.width!
  const h = meta.height!

  let base = sharp(source)
  base = await inpaintSocket(await base.toBuffer(), w, h, LEFT)
  base = await inpaintSocket(await base.toBuffer(), w, h, RIGHT)

  const baseWebp = await base.webp({ quality: 94, effort: 6 }).toBuffer()
  writeFileSync(join(OUT_DIR, 'portrait-base.webp'), baseWebp)

  const left = await extractEye(await sharp(source).toBuffer(), w, h, LEFT, 1.2)
  const right = await extractEye(await sharp(source).toBuffer(), w, h, RIGHT, 1.2)

  writeFileSync(join(OUT_DIR, 'left-eye.webp'), left.eyeWebp)
  writeFileSync(join(OUT_DIR, 'right-eye.webp'), right.eyeWebp)
  writeFileSync(join(OUT_DIR, 'left-eye-mask.webp'), left.socketMask)
  writeFileSync(join(OUT_DIR, 'right-eye-mask.webp'), right.socketMask)

  const manifest = {
    version: 1,
    sourceSize: { width: w, height: h },
    planeHeight: 1,
    leftEye: {
      centerU: LEFT.centerU,
      centerV: LEFT.centerV,
      radiusUv: LEFT.radiusUv,
      maxOffsetUv: LEFT.maxOffsetUv,
    },
    rightEye: {
      centerU: RIGHT.centerU,
      centerV: RIGHT.centerV,
      radiusUv: RIGHT.radiusUv,
      maxOffsetUv: RIGHT.maxOffsetUv,
    },
    look: {
      gain: 0.9,
      stereo: 0.94,
    },
  }

  writeFileSync(join(OUT_DIR, 'portrait.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(`Wrote portrait assets to ${OUT_DIR} (${w}×${h})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})