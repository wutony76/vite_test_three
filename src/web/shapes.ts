// 粒子的目標形狀：每個函式都回傳「count 顆粒子的 xyz 座標」（Float32Array，長度 count × 3）
// 所有形狀大小都控制在半徑約 2.2 以內，切換時才不會忽大忽小
import * as THREE from 'three'
// MeshSurfaceSampler：在任意模型「表面」隨機取點，點的分布會依面積平均
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js'

/** 球體：Fibonacci（黃金角）分布 → 點在球面上非常均勻，不會集中在兩極 */
export function sphere(count: number, radius = 2) {
  const positions = new Float32Array(count * 3)
  const golden = Math.PI * (3 - Math.sqrt(5)) // 約 137.5°
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2 // 從 1 到 -1
    const ring = Math.sqrt(1 - y * y)
    const angle = golden * i
    // 半徑加一點隨機厚度，看起來像一團光而不是一層殼
    const r = radius * (0.92 + Math.random() * 0.16)
    positions.set([Math.cos(angle) * ring * r, y * r, Math.sin(angle) * ring * r], i * 3)
  }
  return positions
}

/** 環面結：先建一個 TorusKnot 模型，再用 MeshSurfaceSampler 在表面撒點 */
export function torusKnot(count: number) {
  const geometry = new THREE.TorusKnotGeometry(1.3, 0.4, 220, 32)
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(geometry)).build()
  const positions = new Float32Array(count * 3)
  const point = new THREE.Vector3()
  for (let i = 0; i < count; i++) {
    sampler.sample(point)
    positions.set([point.x, point.y, point.z], i * 3)
  }
  geometry.dispose()
  return positions
}

/** 波浪平面：整齊的網格（起伏在 shader 裡每幀計算，這裡只給平面位置） */
export function wavePlane(count: number, size = 4.6) {
  const positions = new Float32Array(count * 3)
  const side = Math.ceil(Math.sqrt(count))
  for (let i = 0; i < count; i++) {
    const x = ((i % side) / (side - 1) - 0.5) * size
    const z = (Math.floor(i / side) / (side - 1) - 0.5) * size
    positions.set([x, 0, z], i * 3)
  }
  return positions
}

/**
 * 文字：把字畫在 Canvas 上，收集「有畫到」的像素，再隨機挑 count 個當作粒子位置
 * 任何字（中文、英文、emoji）、任何圖案都能用同樣方法變成粒子
 */
export function text(count: number, content = 'THREE.JS', width = 6.4) {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '900 190px "Helvetica Neue", Arial, "PingFang TC", sans-serif'
  ctx.fillText(content, canvas.width / 2, canvas.height / 2)

  // getImageData：每 4 個數字是一個像素的 RGBA，取 alpha > 128 的像素
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const filled: number[] = []
  for (let i = 0; i < canvas.width * canvas.height; i++) if (data[i * 4 + 3] > 128) filled.push(i)

  const scale = width / canvas.width
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // 像素數通常比粒子少 → 重複挑選，並加一點隨機偏移避免疊在同一點
    const pixel = filled[Math.floor(Math.random() * filled.length)]
    const px = (pixel % canvas.width) + Math.random()
    const py = Math.floor(pixel / canvas.width) + Math.random()
    positions.set(
      [
        (px - canvas.width / 2) * scale,
        // Canvas 的 y 往下、3D 的 y 往上 → 加負號
        -(py - canvas.height / 2) * scale,
        (Math.random() - 0.5) * 0.3,
      ],
      i * 3,
    )
  }
  return positions
}
