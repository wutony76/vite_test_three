import * as THREE from 'three'
import { colorizeForEffect } from './effects'
import type { PortraitEffect } from './effects'

export type ReliefBuildOptions = {
  /** 短邊格點數 */
  maxGrid: number
  alphaThreshold: number
  planeHeight: number
  depthScale: number
  /** 高度場平滑次數（減少雜訊、浮雕更連續） */
  blurPasses: number
  effect: PortraitEffect
  /** 0～1：邊緣加進高度，強化五官立體 */
  edgeBoost: number
}

export type ReliefBuildResult = {
  geometry: THREE.BufferGeometry
  planeWidth: number
  planeHeight: number
  gridWidth: number
  gridHeight: number
  vertexCount: number
  triangleCount: number
}

function reliefGridSize(naturalWidth: number, naturalHeight: number, maxGrid: number) {
  const aspect = naturalWidth / naturalHeight
  let height = maxGrid
  let width = Math.max(8, Math.round(height * aspect))
  const longCap = Math.round(maxGrid * 1.45)
  if (width > longCap) {
    width = longCap
    height = Math.max(8, Math.round(width / aspect))
  }
  return { width, height }
}

function boxBlurHeight(src: Float32Array, valid: Uint8Array, w: number, h: number) {
  const dst = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!valid[i]) {
        dst[i] = 0
        continue
      }
      let sum = 0
      let n = 0
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox
          const ny = y + oy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const j = ny * w + nx
          if (!valid[j]) continue
          sum += src[j]
          n++
        }
      }
      dst[i] = n > 0 ? sum / n : src[i]
    }
  }
  return dst
}

/** 由照片亮度建立可旋轉檢視的 3D 浮雕曲面（height field mesh） */
export function buildPortraitRelief(image: HTMLImageElement, options: ReliefBuildOptions): ReliefBuildResult | null {
  const { width, height } = reliefGridSize(image.naturalWidth, image.naturalHeight, options.maxGrid)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D 不可用')

  ctx.drawImage(image, 0, 0, width, height)
  const { data } = ctx.getImageData(0, 0, width, height)

  const n = width * height
  const heightField = new Float32Array(n)
  const brightField = new Float32Array(n)
  const valid = new Uint8Array(n)
  const colors = new Float32Array(n * 3)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const p = i * 4
      const r8 = data[p]
      const g8 = data[p + 1]
      const b8 = data[p + 2]
      const a8 = data[p + 3] === 0 && r8 + g8 + b8 > 0 ? 255 : data[p + 3]
      if (a8 < options.alphaThreshold) continue

      valid[i] = 1
      const bright = (r8 * 0.299 + g8 * 0.587 + b8 * 0.114) / 255
      brightField[i] = bright
      heightField[i] = (bright - 0.5) * options.depthScale

      const o = i * 3
      const tint = colorizeForEffect(r8 / 255, g8 / 255, b8 / 255, bright, options.effect)
      colors[o] = tint.r
      colors[o + 1] = tint.g
      colors[o + 2] = tint.b
    }
  }

  if (options.edgeBoost > 0) {
    const boost = options.edgeBoost * options.depthScale * 0.45
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x
        if (!valid[i]) continue
        const gx =
          -brightField[i - width - 1] +
          brightField[i - width + 1] -
          2 * brightField[i - 1] +
          2 * brightField[i + 1] -
          brightField[i + width - 1] +
          brightField[i + width + 1]
        const gy =
          -brightField[i - width - 1] -
          2 * brightField[i - width] -
          brightField[i - width + 1] +
          brightField[i + width - 1] +
          2 * brightField[i + width] +
          brightField[i + width + 1]
        const edge = Math.min(1, Math.hypot(gx, gy) * 1.6)
        heightField[i] += edge * boost
      }
    }
  }

  let smoothed = heightField
  for (let pass = 0; pass < options.blurPasses; pass++) {
    smoothed = boxBlurHeight(smoothed, valid, width, height)
  }

  const aspect = width / height
  const planeHeight = options.planeHeight
  const planeWidth = planeHeight * aspect

  const positions = new Float32Array(n * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const o = i * 3
      const u = x / (width - 1) - 0.5
      const v = y / (height - 1) - 0.5
      positions[o] = u * planeWidth
      positions[o + 1] = -v * planeHeight
      positions[o + 2] = valid[i] ? smoothed[i] : -options.depthScale * 0.65
    }
  }

  const indices: number[] = []
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const a = y * width + x
      const b = a + 1
      const c = a + width
      const d = c + 1
      const mask = valid[a] + valid[b] + valid[c] + valid[d]
      if (mask < 3) continue
      indices.push(a, c, b, b, c, d)
    }
  }

  if (indices.length === 0) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()

  return {
    geometry,
    planeWidth,
    planeHeight,
    gridWidth: width,
    gridHeight: height,
    vertexCount: n,
    triangleCount: indices.length / 3,
  }
}