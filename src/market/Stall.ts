// 一個夜市攤位：骨架、雨棚、招牌燈箱、霓虹圖示、LED 燈條、工作燈、台面道具
// 攤位自己的座標：正面朝 +z（面向街道），原點在攤位地面中央
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { StallInfo, PropKind } from './stalls'
import { NEON_ICONS } from './neonIcons'
import { buildNeon, PowerSwitch } from './neon'
import { LedStrip, type StripMode } from './LedStrip'
import { canopyTexture, signboardTexture } from './textures'

const W = 3 // 攤位寬
const STRIP_LENGTH = 3.2

/** 所有攤位共用的材質 */
export function createSharedMaterials() {
  const std = (params: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(params)
  return {
    metal: std({ color: 0x9aa3ad, metalness: 0.8, roughness: 0.3 }),
    steel: std({ color: 0xc8ccd2, metalness: 0.7, roughness: 0.25 }),
    dark: std({ color: 0x1a1a20, roughness: 0.8 }),
    wood: std({ color: 0x7a4a2a, roughness: 0.75 }),
    cream: std({ color: 0xf1e6d0, roughness: 0.6 }),
    golden: std({ color: 0xd9902f, roughness: 0.6 }),
    brown: std({ color: 0x6b3a1e, roughness: 0.5 }),
    yellow: std({ color: 0xf2c230, roughness: 0.6 }),
    white: std({ color: 0xf5f5f5, roughness: 0.4 }),
    mango: std({ color: 0xffa31a, roughness: 0.5 }),
    glass: std({ color: 0xbfe9ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.18 }),
    // 點擊範圍：看不見但射線打得到（visible = false 的物件射線還是會檢測，但這樣寫更明確）
    hitbox: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  }
}
export type SharedMaterials = ReturnType<typeof createSharedMaterials>

export type StallGlobals = { dimmer: number; mode: StripMode; color: THREE.Color | null; speed: number; time: number }

export class Stall {
  readonly info: StallInfo
  readonly group = new THREE.Group()
  /** 射線檢測用的透明方塊（比攤位稍大，點哪裡都算） */
  readonly hitbox: THREE.Mesh
  readonly power = new PowerSwitch()
  readonly strip: LedStrip
  /** 冒熱氣的位置（世界座標），null = 不冒熱氣 */
  readonly steamOrigin: THREE.Vector3 | null

  private readonly neon: ReturnType<typeof buildNeon>
  private readonly sign: THREE.MeshStandardMaterial
  private readonly bulb: THREE.MeshStandardMaterial
  private readonly workLight: THREE.PointLight
  private readonly ownMaterials: THREE.Material[] = []
  private readonly glowMaterials: THREE.MeshStandardMaterial[] = []
  private neonFlicker = 0

  constructor(info: StallInfo, M: SharedMaterials) {
    this.info = info
    const g = this.group
    // 左側攤位轉 +90°（正面朝 +x）、右側轉 -90°（正面朝 -x）
    g.position.set(info.side === 'left' ? -4.3 : 4.3, 0, info.z)
    g.rotation.y = info.side === 'left' ? Math.PI / 2 : -Math.PI / 2

    const own = <T extends THREE.Material>(material: T) => {
      this.ownMaterials.push(material)
      return material
    }
    const box = (w: number, h: number, d: number, material: THREE.Material | THREE.Material[], x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
      mesh.position.set(x, y, z)
      return mesh
    }
    const color = new THREE.Color(info.light)
    const wallColor = color.clone().multiplyScalar(0.12)

    // ── 骨架：後牆、四根柱子 ──
    const wall = own(new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.85 }))
    g.add(box(W, 2.6, 0.08, wall, 0, 1.3, -1))
    for (const x of [-W / 2, W / 2]) for (const z of [-0.95, 0.95]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.75, 8), M.metal)
      post.position.set(x, 1.375, z)
      g.add(post)
    }

    // ── 雨棚：條紋布，前低後高 ──
    const canopy = box(W + 0.4, 0.06, 2.5, own(new THREE.MeshStandardMaterial({ map: canopyTexture(...info.canopy), roughness: 0.8 })), 0, 2.8, 0.15)
    canopy.rotation.x = 0.1
    g.add(canopy)

    // ── 招牌燈箱：正面貼文字，map 和 emissiveMap 同一張 → 整塊發光 ──
    const signMap = signboardTexture(info.name, ...info.board)
    this.sign = own(new THREE.MeshStandardMaterial({ map: signMap, emissiveMap: signMap, emissive: 0xffffff, roughness: 0.4 }))
    // BoxGeometry 材質順序：+x、-x、+y、-y、+z（正面）、-z
    g.add(box(W + 0.4, 0.62, 0.1, [M.dark, M.dark, M.dark, M.dark, this.sign, M.dark], 0, 3.15, 1.42))

    // ── LED 燈條：招牌下緣，往下照亮台面與地面 ──
    this.strip = new LedStrip(STRIP_LENGTH, info.light, { phase: Math.abs(info.z) * 0.13, intensity: 5 })
    this.strip.mesh.position.set(0, 2.82, 1.4)
    g.add(this.strip.mesh, this.strip.light)

    // ── 工作燈：雨棚下一顆燈泡 ──
    this.bulb = own(new THREE.MeshStandardMaterial({ color: 0xfff3dc, emissive: 0xffd59a }))
    this.glowMaterials.push(this.bulb)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), this.bulb)
    bulb.position.set(0, 2.55, 0.3)
    this.workLight = new THREE.PointLight(0xffc98a, 0, 7, 1.8)
    this.workLight.position.copy(bulb.position)
    g.add(bulb, this.workLight)

    // ── 霓虹圖示：掛在後牆 ──
    this.neon = buildNeon(NEON_ICONS[info.neon], 1)
    this.neon.group.position.set(0, 1.85, -0.92)
    g.add(this.neon.group)

    // ── 台面與道具 ──
    if (info.props !== 'claw') {
      g.add(
        box(W - 0.2, 1, 0.7, own(new THREE.MeshStandardMaterial({ color: color.clone().multiplyScalar(0.35), roughness: 0.6 })), 0, 0.5, 0.6),
        box(W - 0.1, 0.06, 0.8, M.steel, 0, 1.03, 0.6),
      )
    }
    addProps(info.props, g, M, own, this.glowMaterials)

    // ── 點擊範圍 ──
    this.hitbox = box(W + 0.4, 3.5, 2.7, M.hitbox, 0, 1.75, 0.2)
    this.hitbox.userData.stallId = info.id
    g.add(this.hitbox)

    // 面光源放在燈條位置，朝向台面前方的地面
    // lookAt 吃的是世界座標 → 先更新矩陣，再把攤位座標的目標點轉成世界座標
    this.strip.light.position.set(0, 2.75, 1.3)
    g.updateMatrixWorld(true)
    this.strip.light.lookAt(g.localToWorld(new THREE.Vector3(0, 0, 1.0)))

    this.steamOrigin = info.steam ? g.localToWorld(new THREE.Vector3(0, 1.15, 0.6)) : null
  }

  update(dt: number, globals: StallGlobals) {
    this.power.update(dt)
    const level = this.power.level * globals.dimmer

    // 霓虹偶爾自己閃一下（真的霓虹燈接觸不良的感覺）
    if (this.power.isOn && this.neonFlicker <= 0 && Math.random() < dt * 0.04) this.neonFlicker = 0.35
    this.neonFlicker = Math.max(0, this.neonFlicker - dt)
    const flicker = this.neonFlicker > 0 && Math.sin(globals.time * 60) > 0 ? 0.2 : 1

    this.neon.setLevel(level * flicker)
    this.sign.emissiveIntensity = level * 1.6
    for (const material of this.glowMaterials) material.emissiveIntensity = level * 3
    this.workLight.intensity = level * 4
    this.strip.update(level, globals.mode, globals.color, globals.time, globals.speed)
  }

  dispose() {
    this.group.traverse((object) => (object as THREE.Mesh).geometry?.dispose())
    for (const material of this.ownMaterials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose()
      material.dispose()
    }
    this.neon.dispose()
    this.strip.dispose()
  }
}

/** 依攤位種類放台面上的東西 */
function addProps(
  kind: PropKind,
  g: THREE.Group,
  M: SharedMaterials,
  own: <T extends THREE.Material>(material: T) => T,
  glow: THREE.MeshStandardMaterial[],
) {
  const at = (mesh: THREE.Mesh, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z)
    g.add(mesh)
    return mesh
  }
  const TOP = 1.06 // 台面高度

  switch (kind) {
    case 'cutlet':
      // 一排炸好的大雞排
      for (let i = 0; i < 4; i++) at(new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.04, 0.32, 2, 0.02), M.golden), -0.9 + i * 0.6, TOP + 0.02, 0.55).rotation.y = i * 0.3
      // 炸鍋
      at(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.25, 20), M.steel), 1.05, TOP + 0.12, 0.55)
      break
    case 'cups':
      // 珍奶杯：杯身 + 底部珍珠
      for (let i = 0; i < 6; i++) {
        const x = -1.1 + i * 0.44
        at(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.065, 0.3, 14), M.cream), x, TOP + 0.15, 0.55)
        at(new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.06, 14), M.brown), x, TOP + 0.04, 0.55)
      }
      break
    case 'takoyaki':
      // 章魚燒烤盤：鐵板上一格格小球
      at(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.5), M.dark), -0.3, TOP + 0.04, 0.55)
      for (let x = 0; x < 6; x++) for (let z = 0; z < 2; z++) at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.golden), -0.85 + x * 0.22, TOP + 0.1, 0.45 + z * 0.2)
      break
    case 'pot':
      // 臭豆腐油鍋 + 泡菜盒
      at(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.32, 0.3, 24), M.steel), -0.5, TOP + 0.15, 0.55)
      for (let i = 0; i < 3; i++) at(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.22), M.cream), 0.4 + i * 0.32, TOP + 0.06, 0.55)
      break
    case 'balloons': {
      // 射氣球：後牆掛滿彩色氣球（InstancedMesh：一次畫完 30 顆）
      const balloons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 12, 10), own(new THREE.MeshStandardMaterial({ roughness: 0.25 })), 30)
      const palette = ['#ff4f8b', '#ffd23f', '#4fc3ff', '#5cff7a', '#c77dff', '#ff8a1f'].map((hex) => new THREE.Color(hex))
      const matrix = new THREE.Matrix4()
      for (let i = 0; i < 30; i++) {
        balloons.setMatrixAt(i, matrix.makeTranslation(-1.2 + (i % 10) * 0.27, 0.7 + Math.floor(i / 10) * 0.28, -0.88))
        balloons.setColorAt(i, palette[i % palette.length])
      }
      g.add(balloons)
      // 台面上的玩具槍
      at(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.1), M.dark), 0.6, TOP + 0.05, 0.55)
      break
    }
    case 'corn':
      // 炭烤架 + 玉米
      at(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), M.dark), 0, TOP + 0.05, 0.55)
      for (let i = 0; i < 5; i++) {
        const corn = at(new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 10), M.yellow), -0.7 + i * 0.35, TOP + 0.16, 0.55)
        corn.rotation.x = Math.PI / 2
      }
      break
    case 'claw': {
      // 兩台夾娃娃機：底座、玻璃櫃、發光頂蓋、彩色邊條
      const edge = own(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x7df9ff }))
      const top = own(new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff6bd6 }))
      glow.push(edge, top)
      for (const x of [-0.75, 0.75]) {
        at(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.0), own(new THREE.MeshStandardMaterial({ color: 0xff006e, roughness: 0.5 }))), x, 0.45, 0.45)
        at(new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.9), M.glass), x, 1.45, 0.45)
        at(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.0), top), x, 2.12, 0.45)
        for (const dx of [-0.52, 0.52]) at(new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 0.04), edge), x + dx, 1.45, 0.92)
        // 娃娃
        for (let i = 0; i < 6; i++) at(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), [M.yellow, M.cream, M.mango][i % 3]), x - 0.3 + (i % 3) * 0.3, 1.0, 0.25 + Math.floor(i / 3) * 0.35)
      }
      break
    }
    case 'ice':
      // 剉冰碗：白色冰山 + 芒果丁
      for (let i = 0; i < 4; i++) {
        const x = -0.9 + i * 0.6
        at(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.12, 16), M.glass), x, TOP + 0.06, 0.55)
        at(new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.28, 14), M.white), x, TOP + 0.26, 0.55)
        at(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), M.mango), x + 0.05, TOP + 0.33, 0.6)
      }
      break
  }
}
