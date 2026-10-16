// 街尾牌樓：兩根紅柱 + 跑馬燈字幕招牌 + 一圈追逐燈泡
import * as THREE from 'three'
import { marqueeTexture } from './textures'

const SIGN_W = 5.2
const SIGN_H = 1.1
const SIGN_Y = 4.7

export class Gate {
  readonly group = new THREE.Group()
  private readonly marquee: THREE.Texture
  private readonly marqueeMaterial: THREE.MeshBasicMaterial
  private readonly bulbs: THREE.InstancedMesh
  private readonly bulbColor = new THREE.Color()
  private readonly warm = new THREE.Color('#ffcf6b')

  constructor(z: number) {
    this.group.position.z = z
    const red = new THREE.MeshStandardMaterial({ color: 0x9e1b1b, roughness: 0.6 })
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4a63a, metalness: 0.6, roughness: 0.35 })
    const box = (w: number, h: number, d: number, material: THREE.Material | THREE.Material[], x: number, y: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
      mesh.position.set(x, y, 0)
      this.group.add(mesh)
      return mesh
    }

    // 柱子、屋頂
    box(0.4, 5.6, 0.4, red, -2.8, 2.8)
    box(0.4, 5.6, 0.4, red, 2.8, 2.8)
    box(6.6, 0.22, 0.9, red, 0, 5.75)
    box(6.2, 0.1, 0.7, gold, 0, 5.58)

    // 跑馬燈：貼圖只顯示其中一段（repeat.x < 1），每幀把 offset.x 往前推 → 字往左捲
    this.marquee = marqueeTexture('　歡迎光臨　好吃好玩夜市　大雞排・珍珠奶茶・章魚燒・臭豆腐・烤玉米・芒果剉冰　射氣球・夾娃娃　今晚不醉不歸　')
    this.marquee.repeat.x = 0.32
    this.marqueeMaterial = new THREE.MeshBasicMaterial({ map: this.marquee })
    box(SIGN_W, SIGN_H, 0.25, [red, red, red, red, this.marqueeMaterial, red], 0, SIGN_Y)

    // 招牌外框燈泡
    const points: THREE.Vector3[] = []
    const SPACING = 0.2
    const w = SIGN_W / 2 + 0.15
    const h = SIGN_H / 2 + 0.15
    const corners = [new THREE.Vector3(-w, -h), new THREE.Vector3(w, -h), new THREE.Vector3(w, h), new THREE.Vector3(-w, h), new THREE.Vector3(-w, -h)]
    for (let i = 0; i < 4; i++) {
      const count = Math.round(corners[i].distanceTo(corners[i + 1]) / SPACING)
      for (let j = 0; j < count; j++) points.push(corners[i].clone().lerp(corners[i + 1], j / count))
    }
    this.bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial(), points.length)
    const matrix = new THREE.Matrix4()
    points.forEach((p, i) => {
      this.bulbs.setMatrixAt(i, matrix.makeTranslation(p.x, p.y + SIGN_Y, 0.16))
      this.bulbs.setColorAt(i, this.warm)
    })
    this.group.add(this.bulbs)
  }

  update(dt: number, time: number, level: number, speed: number) {
    // 跑馬燈捲動（關燈時停住）
    this.marquee.offset.x += dt * 0.05 * speed * (level > 0.05 ? 1 : 0)
    this.marqueeMaterial.color.setScalar(0.05 + level * 2.4)
    // 外框燈泡：每 3 顆亮 1 顆，依序往前跑
    const step = Math.floor(time * speed * 10)
    for (let i = 0; i < this.bulbs.count; i++) {
      const on = (i + step) % 3 === 0 ? 1 : 0.18
      this.bulbs.setColorAt(i, this.bulbColor.copy(this.warm).multiplyScalar(0.05 + on * level * 3))
    }
    this.bulbs.instanceColor!.needsUpdate = true
  }

  dispose() {
    this.group.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()
      for (const material of [mesh.material].flat()) (material as THREE.Material | undefined)?.dispose()
    })
    this.marquee.dispose()
  }
}
