// 粒子效果：煙囪的煙、下雨
import * as THREE from 'three'

/** 煙：一群 Sprite 循環「冒出 → 上升變大 → 淡出 → 回到煙囪口」 */
export class Smoke {
  readonly group = new THREE.Group()
  private readonly origin: THREE.Vector3
  private readonly particles: { sprite: THREE.Sprite; material: THREE.SpriteMaterial; age: number; seed: number }[] = []
  private static readonly LIFE = 4.5 // 每團煙存活秒數

  constructor(origin: THREE.Vector3, texture: THREE.Texture, count = 26) {
    this.origin = origin
    for (let i = 0; i < count; i++) {
      // 每個粒子要能各自淡出 → 材質不能共用（透明度是材質的屬性）
      const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 })
      const sprite = new THREE.Sprite(material)
      // 年齡錯開，一開始就是連續的一縷煙，而不是同時冒出一大團
      this.particles.push({ sprite, material, age: (i / count) * Smoke.LIFE, seed: Math.random() * 10 })
      this.group.add(sprite)
    }
  }

  /**
   * @param wind 風往 +x 吹的強度
   * @param color 煙的顏色（白天偏白、晚上偏灰藍）
   * @param density 整體濃度 0 ~ 1
   */
  update(dt: number, wind: number, color: THREE.Color, density: number) {
    for (const particle of this.particles) {
      particle.age = (particle.age + dt) % Smoke.LIFE
      const t = particle.age / Smoke.LIFE // 0 = 剛冒出、1 = 消散
      const wobble = Math.sin(particle.seed + particle.age * 1.3) * 0.18 * t
      particle.sprite.position.set(
        this.origin.x + wind * t * 2.2 + wobble,
        this.origin.y + t * 3.6,
        this.origin.z - wind * t * 0.6 + wobble * 0.5,
      )
      particle.sprite.scale.setScalar(0.45 + t * 2.4)
      // sin(πt)：中段最濃，開頭和結尾淡，看起來像慢慢散開
      particle.material.opacity = Math.sin(Math.PI * t) * 0.42 * density
      particle.material.color.copy(color)
    }
  }
}

/** 雨：每滴雨是一條短線段，全部放在同一個 LineSegments → 2000 滴只要 1 次 draw call */
export class Rain {
  readonly lines: THREE.LineSegments
  private readonly positions: Float32Array
  private readonly material: THREE.LineBasicMaterial
  private readonly count: number
  // 雨下在攝影機附近的範圍
  private static readonly AREA = { minX: -24, maxX: 24, minZ: -18, maxZ: 24, top: 26 }
  private static readonly SPEED = 24 // 每秒落下幾公尺
  private static readonly LENGTH = 0.7 // 雨絲長度

  constructor(count = 2000) {
    this.count = count
    // 每滴雨 2 個頂點（上端、下端）× 3 個座標
    this.positions = new Float32Array(count * 6)
    for (let i = 0; i < count; i++) this.resetDrop(i, Math.random() * Rain.AREA.top)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.material = new THREE.LineBasicMaterial({ color: 0xa9bad6, transparent: true, opacity: 0, depthWrite: false })
    this.lines = new THREE.LineSegments(geometry, this.material)
    // 頂點每幀都在變，包圍球不準 → 關閉視錐剔除，避免雨突然消失
    this.lines.frustumCulled = false
    this.lines.visible = false
  }

  private resetDrop(i: number, y: number) {
    const { minX, maxX, minZ, maxZ } = Rain.AREA
    const x = minX + Math.random() * (maxX - minX)
    const z = minZ + Math.random() * (maxZ - minZ)
    // 雨絲稍微斜：被風吹往 +x
    this.positions.set([x, y, z, x + 0.12, y - Rain.LENGTH, z], i * 6)
  }

  /** amount：雨量 0 ~ 1 */
  update(dt: number, amount: number) {
    this.lines.visible = amount > 0.01
    if (!this.lines.visible) return
    this.material.opacity = 0.5 * amount
    const fall = Rain.SPEED * dt
    for (let i = 0; i < this.count; i++) {
      const top = i * 6 + 1
      const y = this.positions[top] - fall
      // 落到地面以下 → 回到上方重新落下
      if (y < 0) this.resetDrop(i, Rain.AREA.top)
      else {
        this.positions[top] = y
        this.positions[top + 3] = y - Rain.LENGTH
        this.positions[top - 1] += fall * 0.17
        this.positions[top + 2] += fall * 0.17
      }
    }
    // 告訴 GPU 頂點資料改了，要重新上傳
    this.lines.geometry.attributes.position.needsUpdate = true
  }
}
