// 霓虹燈管 + 開關動畫
import * as THREE from 'three'
import type { Stroke } from './neonIcons'

/**
 * 電源開關：真的霓虹燈 / 日光燈打開時，會「啪、啪」閃幾下才穩定亮起
 * level 是目前亮度 0 ~ 1，依照一串「持續時間、亮度」步驟播放
 */
export class PowerSwitch {
  level = 0
  isOn = false
  private steps: [number, number][] = []
  private elapsed = 0

  /** @param delay 延遲幾秒才開始（讓多個招牌依序點亮） */
  set(on: boolean, { delay = 0, instant = false } = {}) {
    this.isOn = on
    this.elapsed = 0
    if (instant) {
      this.steps = []
      this.level = on ? 1 : 0
      return
    }
    const jitter = () => 0.6 + Math.random() * 0.8
    this.steps = on
      ? [
          [delay, this.level],
          [0.05 * jitter(), 1],
          [0.07 * jitter(), 0],
          [0.04 * jitter(), 0.75],
          [0.12 * jitter(), 0],
          [0.05 * jitter(), 1],
          [0.15 * jitter(), 0.3],
        ]
      : [
          [delay, this.level],
          [0.05, 0.45],
          [0.08, 0],
        ]
  }

  update(dt: number) {
    if (!this.steps.length) return
    this.elapsed += dt
    // 跳過已經播完的步驟
    while (this.steps.length && this.elapsed >= this.steps[0][0]) {
      this.elapsed -= this.steps[0][0]
      this.steps.shift()
    }
    // 步驟播完 → 停在最終狀態；否則用目前步驟的亮度
    this.level = this.steps.length ? this.steps[0][1] : this.isOn ? 1 : 0
  }
}

type NeonColor = { core: THREE.MeshBasicMaterial; halo: THREE.MeshBasicMaterial; base: THREE.Color }

/**
 * 把筆畫做成燈管：每條筆畫兩層
 * - 核心：細管，MeshBasicMaterial 顏色乘上 > 1 的亮度 → Bloom 光暈
 * - 外暈：粗管，半透明疊加混合 → 燈管周圍的一圈柔光
 */
export function buildNeon(strokes: Stroke[], size: number) {
  const group = new THREE.Group()
  const colors = new Map<string, NeonColor>()

  const colorFor = (hex: string) => {
    let entry = colors.get(hex)
    if (!entry) {
      entry = {
        base: new THREE.Color(hex),
        core: new THREE.MeshBasicMaterial({ color: hex }),
        halo: new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
      }
      colors.set(hex, entry)
    }
    return entry
  }

  for (const stroke of strokes) {
    const points = stroke.points.map(([x, y]) => new THREE.Vector3(x * size, y * size, 0))
    let path: THREE.Curve<THREE.Vector3>
    if (stroke.smooth) {
      // centripetal：轉彎處不會打結或過衝
      path = new THREE.CatmullRomCurve3(points, stroke.closed, 'centripetal')
    } else {
      // 折線：一段段直線接起來
      const polyline = new THREE.CurvePath<THREE.Vector3>()
      const all = stroke.closed ? [...points, points[0]] : points
      for (let i = 0; i < all.length - 1; i++) polyline.add(new THREE.LineCurve3(all[i], all[i + 1]))
      path = polyline
    }
    const { core, halo } = colorFor(stroke.color)
    const segments = Math.max(16, stroke.points.length * 12)
    group.add(
      new THREE.Mesh(new THREE.TubeGeometry(path, segments, 0.02 * size, 8, stroke.closed && stroke.smooth), core),
      new THREE.Mesh(new THREE.TubeGeometry(path, segments, 0.055 * size, 8, stroke.closed && stroke.smooth), halo),
    )
  }

  /** level 0 ~ 1：0 時燈管仍隱約看得到（沒通電的玻璃管） */
  const setLevel = (level: number) => {
    for (const { core, halo, base } of colors.values()) {
      core.color.copy(base).multiplyScalar(0.08 + level * 3.6)
      halo.opacity = 0.22 * level
    }
  }
  setLevel(0)

  const dispose = () => {
    group.traverse((object) => (object as THREE.Mesh).geometry?.dispose())
    for (const { core, halo } of colors.values()) {
      core.dispose()
      halo.dispose()
    }
  }

  return { group, setLevel, dispose }
}
