// 街道環境：水泥地面、兩側大樓、攤位冒出的熱氣
import * as THREE from 'three'
import { buildingTexture, concreteTextures, seeded } from './textures'

/** 水泥地面：完全霧面、不反光 */
export function buildGround() {
  const SIZE_X = 30
  const SIZE_Z = 44
  const concrete = concreteTextures()
  // 一張圖 = 4 公尺見方的一塊水泥板 → 依地面大小決定重複次數
  concrete.map.repeat.set(SIZE_X / 4, SIZE_Z / 4)
  concrete.bump.repeat.copy(concrete.map.repeat)
  // 用 MeshStandardMaterial → 燈條的 RectAreaLight、工作燈仍會在地上照出光區
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE_X, SIZE_Z),
    new THREE.MeshStandardMaterial({
      map: concrete.map,
      // 凹凸：分割縫、裂縫、顆粒在燈光下有立體感
      bumpMap: concrete.bump,
      bumpScale: 1.5,
      // roughness 1 = 完全霧面：光打上去只會均勻散開，不會有亮點或倒影
      roughness: 1,
      metalness: 0,
    }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.z = -4
  return ground
}

/** 兩側與遠方的大樓：深色牆面 + 發光的窗戶，營造城市夜景 */
export function buildBuildings() {
  const group = new THREE.Group()
  const random = seeded(21)
  const add = (x: number, z: number, w: number, h: number, d: number, seed: number) => {
    const map = buildingTexture(seed)
    map.wrapS = map.wrapT = THREE.RepeatWrapping
    map.repeat.set(w / 2.5, h / 5)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      // emissiveMap：窗戶自己發光，牆面保持暗色
      new THREE.MeshStandardMaterial({ color: 0x0c0d14, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.28, roughness: 0.9 }),
    )
    mesh.position.set(x, h / 2, z)
    group.add(mesh)
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      // 離街道遠一點（x ±15 以外），讓霧把它們淡化成背景
      add(side * (15 + random() * 3), 8 - i * 6, 5, 10 + random() * 12, 5, i * 7 + (side > 0 ? 3 : 0))
    }
  }
  // 牌樓後方的遠景大樓
  for (let i = 0; i < 6; i++) add(-14 + i * 5.6, -30 - random() * 5, 5, 12 + random() * 14, 4, 50 + i)
  return group
}

/** 熱氣：一群 Sprite 循環上升、變大、淡出 */
export class Steam {
  readonly group = new THREE.Group()
  private readonly particles: { sprite: THREE.Sprite; material: THREE.SpriteMaterial; age: number; origin: THREE.Vector3 }[] = []
  private static readonly LIFE = 2.6

  constructor(origins: THREE.Vector3[], texture: THREE.Texture, perOrigin = 9) {
    for (const origin of origins) {
      for (let i = 0; i < perOrigin; i++) {
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 })
        const sprite = new THREE.Sprite(material)
        this.particles.push({ sprite, material, age: (i / perOrigin) * Steam.LIFE, origin })
        this.group.add(sprite)
      }
    }
  }

  /**
   * @param density 濃度 0 ~ 1
   * @param brightness 亮度 0 ~ 1：Sprite 不受光照影響，燈關了熱氣不會自己變暗 → 要手動調暗
   */
  update(dt: number, density: number, brightness: number) {
    for (const p of this.particles) {
      p.material.color.setScalar(0.15 + brightness * 0.75)
      p.age = (p.age + dt) % Steam.LIFE
      const t = p.age / Steam.LIFE
      p.sprite.position.set(p.origin.x + Math.sin(p.age * 2 + p.origin.z) * 0.1 * t, p.origin.y + t * 1.4, p.origin.z)
      p.sprite.scale.setScalar(0.25 + t * 0.9)
      p.material.opacity = Math.sin(Math.PI * t) * 0.2 * density
    }
  }

  dispose() {
    for (const p of this.particles) p.material.dispose()
  }
}
