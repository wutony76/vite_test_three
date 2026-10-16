// 逛夜市的人潮：膠囊身體 + 球形頭，用 InstancedMesh（二十幾個人只要 2 次 draw call）
import * as THREE from 'three'

type Person = { x: number; z: number; speed: number; dir: number; phase: number }

const MIN_Z = -10
// 不走到鏡頭正前方（攝影機在 z 12.5），避免擋住畫面
const MAX_Z = 5

export class Crowd {
  readonly group = new THREE.Group()
  private readonly bodies: THREE.InstancedMesh
  private readonly heads: THREE.InstancedMesh
  private readonly people: Person[] = []
  // 用一個暫存 Object3D 算出每個人的變換矩陣，再寫進 InstancedMesh
  private readonly dummy = new THREE.Object3D()

  constructor(count = 26) {
    const clothes = ['#e63946', '#f1faee', '#457b9d', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#8d99ae'].map((hex) => new THREE.Color(hex))
    const skin = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524'].map((hex) => new THREE.Color(hex))
    this.bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.75, 4, 10), new THREE.MeshStandardMaterial({ roughness: 0.8 }), count)
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshStandardMaterial({ roughness: 0.7 }), count)

    for (let i = 0; i < count; i++) {
      this.people.push({
        // 只在街道中央走（兩側是攤位）
        x: -1.8 + Math.random() * 3.6,
        z: MIN_Z + Math.random() * (MAX_Z - MIN_Z),
        speed: 0.5 + Math.random() * 0.7,
        dir: Math.random() < 0.5 ? 1 : -1,
        phase: Math.random() * 10,
      })
      this.bodies.setColorAt(i, clothes[i % clothes.length])
      this.heads.setColorAt(i, skin[i % skin.length])
    }
    this.group.add(this.bodies, this.heads)
  }

  update(dt: number, time: number) {
    if (!this.group.visible) return
    const d = this.dummy
    this.people.forEach((p, i) => {
      p.z += p.speed * p.dir * dt
      // 走出範圍 → 從另一頭重新出現
      if (p.z > MAX_Z) p.z = MIN_Z
      if (p.z < MIN_Z) p.z = MAX_Z
      // 走路時身體上下起伏、左右微晃
      const step = time * p.speed * 7 + p.phase
      const bob = Math.abs(Math.sin(step)) * 0.05

      d.position.set(p.x, 0.62 + bob, p.z)
      d.rotation.set(0, p.dir > 0 ? 0 : Math.PI, Math.sin(step) * 0.04)
      d.updateMatrix()
      this.bodies.setMatrixAt(i, d.matrix)

      d.position.y = 1.33 + bob
      d.updateMatrix()
      this.heads.setMatrixAt(i, d.matrix)
    })
    this.bodies.instanceMatrix.needsUpdate = true
    this.heads.instanceMatrix.needsUpdate = true
  }

  dispose() {
    for (const mesh of [this.bodies, this.heads]) {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    }
  }
}
