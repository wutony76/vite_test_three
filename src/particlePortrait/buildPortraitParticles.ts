import type { BuildPortraitOptions } from './types'

export type PortraitBuildResult = {
  count: number
  rasterWidth: number
  rasterHeight: number
  planeWidth: number
  planeHeight: number
  geometryAttributes: {
    position: Float32Array
    aTarget: Float32Array
    aScatter: Float32Array
    aColor: Float32Array
    aBright: Float32Array
    aSeed: Float32Array
  }
}

const hash2 = (x: number, y: number, salt = 0) => {
  let h = (x * 374761393) ^ (y * 668265263) ^ (salt * 1442695041)
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/** 依目標粒子數推算取樣網格尺寸 */
function rasterDimensions(naturalWidth: number, naturalHeight: number, targetCount: number) {
  const aspect = naturalWidth / naturalHeight
  let height = Math.max(32, Math.round(Math.sqrt(targetCount / aspect)))
  let width = Math.max(32, Math.round(height * aspect))
  while (width * height > targetCount * 1.15 && width > 32 && height > 32) {
    if (width > height) width--
    else height--
  }
  return { width, height }
}

/**
 * 將照片像素轉成粒子屬性：每顆對應一個真實像素（或固定 stride 格點）。
 */
export function buildPortraitParticles(
  image: HTMLImageElement,
  options: BuildPortraitOptions,
): PortraitBuildResult {
  const { width, height } = rasterDimensions(image.naturalWidth, image.naturalHeight, options.particleCount)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D 不可用')

  ctx.drawImage(image, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)

  const aspect = width / height
  const planeHeight = options.planeHeight
  const planeWidth = planeHeight * aspect

  const totalCells = width * height
  let stride = 1
  if (totalCells > options.particleCount) {
    stride = Math.ceil(Math.sqrt(totalCells / options.particleCount))
  }

  const capacity = Math.ceil(width / stride) * Math.ceil(height / stride)
  const aTarget = new Float32Array(capacity * 3)
  const aScatter = new Float32Array(capacity * 3)
  const aColor = new Float32Array(capacity * 3)
  const aBright = new Float32Array(capacity)
  const aSeed = new Float32Array(capacity)
  const position = new Float32Array(capacity * 3)

  let count = 0

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const i = (y * width + x) * 4
      const r8 = data[i]
      const g8 = data[i + 1]
      const b8 = data[i + 2]
      // JPG 在部分環境 alpha 會是 0，仍應視為不透明像素
      const a8 = data[i + 3] === 0 && r8 + g8 + b8 > 0 ? 255 : data[i + 3]
      if (a8 < options.alphaThreshold) continue

      const r = r8 / 255
      const g = g8 / 255
      const b = b8 / 255
      const bright = r * 0.299 + g * 0.587 + b * 0.114

      const u = x / (width - 1) - 0.5
      const v = y / (height - 1) - 0.5
      const px = u * planeWidth
      const py = -v * planeHeight
      const pz = (bright - 0.5) * options.depthScale

      const seed = hash2(x, y)
      const seed2 = hash2(x, y, 7)
      const seed3 = hash2(x, y, 13)
      const theta = seed * Math.PI * 2
      const phi = (0.25 + seed2 * 0.65) * Math.PI
      const scatterR = 0.55 + bright * 0.95
      const sx = Math.cos(theta) * Math.sin(phi) * scatterR
      const sy = Math.sin(theta) * Math.sin(phi) * scatterR
      const sz = (Math.cos(phi) + bright * 0.35) * scatterR

      const o = count * 3
      position[o] = px
      position[o + 1] = py
      position[o + 2] = pz
      aTarget[o] = px
      aTarget[o + 1] = py
      aTarget[o + 2] = pz
      aScatter[o] = sx
      aScatter[o + 1] = sy
      aScatter[o + 2] = sz
      aColor[o] = r
      aColor[o + 1] = g
      aColor[o + 2] = b
      aBright[count] = bright
      aSeed[count] = seed3
      count++
    }
  }

  if (count === 0) {
    return {
      count: 0,
      rasterWidth: width,
      rasterHeight: height,
      planeWidth,
      planeHeight,
      geometryAttributes: {
        position: new Float32Array(0),
        aTarget: new Float32Array(0),
        aScatter: new Float32Array(0),
        aColor: new Float32Array(0),
        aBright: new Float32Array(0),
        aSeed: new Float32Array(0),
      },
    }
  }

  return {
    count,
    rasterWidth: width,
    rasterHeight: height,
    planeWidth,
    planeHeight,
    geometryAttributes: {
      position: position.subarray(0, count * 3),
      aTarget: aTarget.subarray(0, count * 3),
      aScatter: aScatter.subarray(0, count * 3),
      aColor: aColor.subarray(0, count * 3),
      aBright: aBright.subarray(0, count),
      aSeed: aSeed.subarray(0, count),
    },
  }
}