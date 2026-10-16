// 街道上空的彩色串燈：在兩側雨棚之間 Z 字形來回，每段電線往下垂
// 幾百顆燈泡 → InstancedMesh，一次 draw call；每顆燈泡的顏色用 setColorAt 個別設定
import * as THREE from 'three'

export type BulbMode = 'steady' | 'twinkle' | 'chase'

const PALETTE = ['#ff3b3b', '#ffb627', '#46e36b', '#3fa7ff', '#ff5fd2', '#fff1c9'].map((hex) => new THREE.Color(hex))

export class StringLights {
  readonly group = new THREE.Group()
  private readonly bulbs: THREE.InstancedMesh
  private readonly baseColors: THREE.Color[] = []
  private readonly seeds: number[] = []
  private readonly color = new THREE.Color()

  constructor() {
    const positions: THREE.Vector3[] = []
    const SAG = 0.55
    const HEIGHT = 3.55
    // 錨點：左右交錯，從近處（z 7.5）一路到牌樓前（z −10）
    const anchors: THREE.Vector3[] = []
    for (let i = 0; i <= 8; i++) anchors.push(new THREE.Vector3(i % 2 ? 2.85 : -2.85, HEIGHT, 7.5 - i * 2.2))

    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x111111 })
    for (let i = 0; i < anchors.length - 1; i++) {
      const from = anchors[i]
      const to = anchors[i + 1]
      const count = Math.round(from.distanceTo(to) / 0.32)
      const segment: THREE.Vector3[] = []
      for (let j = 0; j <= count; j++) {
        const t = j / count
        const point = from.clone().lerp(to, t)
        // sin(πt)：兩端 0、中間最大 → 電線中間下垂
        point.y -= Math.sin(Math.PI * t) * SAG
        segment.push(point)
        if (j > 0) positions.push(point)
      }
      this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(segment), wireMaterial))
    }

    // MeshBasicMaterial 白色 × 每顆的 instanceColor → instanceColor 可以超過 1，Bloom 就會發光
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 10, 8), new THREE.MeshBasicMaterial(), positions.length)
    const matrix = new THREE.Matrix4()
    positions.forEach((point, i) => {
      this.bulbs.setMatrixAt(i, matrix.makeTranslation(point.x, point.y - 0.07, point.z))
      this.baseColors.push(PALETTE[i % PALETTE.length])
      this.seeds.push(Math.random() * 100)
      this.bulbs.setColorAt(i, this.baseColors[i])
    })
    this.group.add(this.bulbs)
  }

  get count() {
    return this.baseColors.length
  }

  /** level：0 ~ 1（含總亮度與開關） */
  update(time: number, mode: BulbMode, level: number, speed: number) {
    const step = Math.floor(time * speed * 8)
    for (let i = 0; i < this.baseColors.length; i++) {
      let k = 1
      // 閃爍：每顆用自己的亂數相位，亮暗交錯
      if (mode === 'twinkle') k = 0.25 + 0.75 * Math.max(0, Math.sin(time * speed * 3 + this.seeds[i])) ** 2
      // 追逐：每 4 顆亮 1 顆，亮的位置隨時間往前移
      else if (mode === 'chase') k = (i + step) % 4 === 0 ? 1 : 0.12
      this.bulbs.setColorAt(i, this.color.copy(this.baseColors[i]).multiplyScalar(0.02 + k * level * 2.4))
    }
    // 告訴 GPU 顏色資料改了
    this.bulbs.instanceColor!.needsUpdate = true
  }

  dispose() {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()
      ;(mesh.material as THREE.Material | undefined)?.dispose()
    })
  }
}
