// 輪胎揚塵：一個 Sprite 物件池，循環使用（不會一直 new 新物件）
import * as THREE from 'three'

type Puff = { sprite: THREE.Sprite; material: THREE.SpriteMaterial; age: number; life: number; velocity: THREE.Vector3 }

export class Dust {
  readonly group = new THREE.Group()
  private readonly pool: Puff[] = []
  private next = 0
  private carry = 0

  constructor(count = 60) {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')!
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    const texture = new THREE.CanvasTexture(canvas)
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({ map: texture, color: 0xe9e1cf, transparent: true, depthWrite: false, opacity: 0 })
      const sprite = new THREE.Sprite(material)
      sprite.visible = false
      this.pool.push({ sprite, material, age: 1, life: 1, velocity: new THREE.Vector3() })
      this.group.add(sprite)
    }
  }

  /** @param rate 每秒冒出幾團（依車速決定） */
  emit(points: { x: number; y: number; z: number }[], rate: number, dt: number) {
    this.carry += rate * dt
    while (this.carry >= 1 && points.length) {
      this.carry -= 1
      const p = points[Math.floor(Math.random() * points.length)]
      const puff = this.pool[this.next]
      this.next = (this.next + 1) % this.pool.length
      puff.sprite.position.set(p.x, p.y + 0.15, p.z)
      puff.velocity.set((Math.random() - 0.5) * 0.8, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8)
      puff.age = 0
      puff.life = 0.6 + Math.random() * 0.5
      puff.sprite.visible = true
    }
    if (!points.length) this.carry = 0
  }

  update(dt: number) {
    for (const puff of this.pool) {
      if (puff.age >= puff.life) continue
      puff.age += dt
      const t = Math.min(puff.age / puff.life, 1)
      puff.sprite.position.addScaledVector(puff.velocity, dt)
      puff.sprite.scale.setScalar(0.3 + t * 1.2)
      puff.material.opacity = (1 - t) * 0.55
      if (t >= 1) puff.sprite.visible = false
    }
  }
}
