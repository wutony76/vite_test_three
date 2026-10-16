// 小島世界：地面、海、邊界、樹、跳台、可以撞倒的物件
// 每個會動的物件 = 一個 cannon 剛體 + 一個 three 模型，每幀把剛體的位置複製給模型
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { copyTransform } from './Car'
import { ZONES, buildZonePad, zonePosition } from './zones'

export const ISLAND_RADIUS = 40

type Dynamic = { body: CANNON.Body; mesh: THREE.Object3D; home: { position: CANNON.Vec3; quaternion: CANNON.Quaternion } }

// 方塊字（每個字 3 × 5 格）：1 = 有方塊
const FONT: Record<string, string[]> = {
  T: ['111', '010', '010', '010', '010'],
  H: ['101', '101', '111', '101', '101'],
  R: ['110', '101', '110', '101', '101'],
  E: ['111', '100', '110', '100', '111'],
  L: ['100', '100', '100', '100', '111'],
  A: ['010', '101', '111', '101', '101'],
  B: ['110', '101', '110', '101', '110'],
}

const std = (color: THREE.ColorRepresentation, roughness = 0.75) => new THREE.MeshStandardMaterial({ color, roughness })
const shadow = <T extends THREE.Object3D>(object: T) => {
  object.traverse((child) => {
    child.castShadow = true
    child.receiveShadow = true
  })
  return object
}
const v3 = (x: number, y: number, z: number) => new CANNON.Vec3(x, y, z)

/**
 * 加入剛體前，標記「包圍盒需要重算」
 * ⚠️ cannon-es 直接改 body.position / quaternion 不會更新包圍盒（AABB），
 * 而靜態、睡眠中的物體每一步都不會重算 → 包圍盒停在原點，碰撞偵測（broadphase）永遠找不到它，車子會直接穿過去
 */
function addBody(world: CANNON.World, body: CANNON.Body) {
  body.aabbNeedsUpdate = true
  world.addBody(body)
}

export class DriveWorld {
  readonly physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -15, 0) })
  readonly groundMaterial = new CANNON.Material('ground')
  readonly root = new THREE.Group()
  readonly zoneRings: THREE.MeshStandardMaterial[] = []
  readonly zoneCenters: THREE.Vector3[] = []
  private readonly dynamics: Dynamic[] = []
  private readonly water: THREE.Mesh<THREE.CircleGeometry, THREE.MeshStandardMaterial>

  constructor() {
    const world = this.physics
    // SAP：依物體在某一軸上的範圍排序，快速排除不可能碰撞的配對（物體多時比預設快）
    world.broadphase = new CANNON.SAPBroadphase(world)
    // 靜止的物體進入「睡眠」，不再計算，被撞到才醒來
    world.allowSleep = true
    world.defaultContactMaterial.friction = 0.35

    // ── 地面：無限大平面（物理）+ 草地、沙灘、海（外觀）──
    const ground = new CANNON.Body({ mass: 0, material: this.groundMaterial })
    ground.addShape(new CANNON.Plane())
    // Plane 預設法線朝 +z → 轉 -90° 變成朝上
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
    world.addBody(ground)

    const grass = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_RADIUS, 64), std(0x8fd16f, 0.95))
    const sand = new THREE.Mesh(new THREE.RingGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 6, 64), std(0xf3dfa2, 0.95))
    this.water = new THREE.Mesh(new THREE.CircleGeometry(220, 64), new THREE.MeshStandardMaterial({ color: 0x6fc8e8, roughness: 0.25, metalness: 0.1 }))
    for (const [mesh, y] of [[grass, 0.01], [sand, 0.005], [this.water, -0.15]] as const) {
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = y
      mesh.receiveShadow = true
      this.root.add(mesh)
    }

    this.buildBoundary()
    this.buildTrees()
    this.buildRamp(new THREE.Vector3(-12, 0, 8), 0.6)
    this.buildLetters('THREE LAB', new THREE.Vector3(0, 0, -9))
    this.buildPins(new THREE.Vector3(11, 0, 7))
    this.buildCratePyramid(new THREE.Vector3(-10, 0, -4))

    ZONES.forEach((zone, i) => {
      const { group, ringMaterial } = buildZonePad(zone)
      const position = zonePosition(i)
      group.position.copy(position)
      // 文字的「上方」朝向島外：從島中心開過去時，字是正的
      // （平躺的平面，文字上方原本朝 -z；轉 θ 後朝 (-sinθ, -cosθ)，要等於往外的方向 → θ = atan2(x, z) + π）
      group.rotation.y = Math.atan2(position.x, position.z) + Math.PI
      this.root.add(group)
      this.zoneRings.push(ringMaterial)
      this.zoneCenters.push(position)
    })
  }

  /** 邊界：一圈看不見的牆 + 看得見的石頭，車子開不出小島 */
  private buildBoundary() {
    const COUNT = 36
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), std(0xa7a39b, 0.9), COUNT * 2)
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    for (let i = 0; i < COUNT; i++) {
      const angle = (i / COUNT) * Math.PI * 2
      const x = Math.sin(angle) * (ISLAND_RADIUS + 1)
      const z = Math.cos(angle) * (ISLAND_RADIUS + 1)
      // 牆：每段一個長方體，轉向切線方向
      const wall = new CANNON.Body({ mass: 0, shape: new CANNON.Box(v3(3.6, 3, 0.5)) })
      wall.position.set(x, 1.5, z)
      wall.quaternion.setFromEuler(0, angle, 0)
      addBody(this.physics, wall)
      // 石頭：每段兩顆，大小、角度隨機
      for (let j = 0; j < 2; j++) {
        const a = angle + (j - 0.5) * 0.08
        const size = 0.9 + Math.random() * 0.8
        quaternion.setFromEuler(new THREE.Euler(Math.random() * 3, Math.random() * 3, 0))
        matrix.compose(new THREE.Vector3(Math.sin(a) * (ISLAND_RADIUS + 1.2), size * 0.4, Math.cos(a) * (ISLAND_RADIUS + 1.2)), quaternion, new THREE.Vector3(size, size * 0.8, size))
        rock.setMatrixAt(i * 2 + j, matrix)
      }
    }
    this.root.add(shadow(rock))
  }

  /** 樹：圓柱樹幹（物理用圓柱，撞得到但撞不倒）+ 低多邊形樹冠 */
  private buildTrees() {
    const trunk = std(0x8a5a3b)
    const leaves = [std(0x4fa65a), std(0x6cc06a), std(0x3d8f55)]
    const spots = [[-28, -20], [-32, 6], [-22, 26], [6, 32], [30, 18], [33, -8], [24, -28], [-6, -33], [-16, -26], [18, 30], [-34, -10], [14, -16], [-18, 14], [28, 2]]
    spots.forEach(([x, z], i) => {
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Cylinder(0.35, 0.35, 3, 8) })
      body.position.set(x, 1.5, z)
      addBody(this.physics, body)
      const tree = new THREE.Group()
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 2, 8), trunk)
      t.position.y = 1
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 0), leaves[i % 3])
      crown.position.y = 3
      crown.scale.y = 1.2
      const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), leaves[(i + 1) % 3])
      crown2.position.set(0.5, 4.2, 0.2)
      tree.add(t, crown, crown2)
      tree.position.set(x, 0, z)
      this.root.add(shadow(tree))
    })
  }

  /** 跳台：一塊斜放的靜態方塊 */
  private buildRamp(position: THREE.Vector3, heading: number) {
    const HALF = v3(2.4, 0.25, 3.5)
    const tilt = -0.32 // 往上傾斜約 18°
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(HALF), material: this.groundMaterial })
    body.position.set(position.x, 0.75, position.z)
    body.quaternion.setFromEuler(tilt, heading, 0, 'YXZ')
    addBody(this.physics, body)
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(HALF.x * 2, HALF.y * 2, HALF.z * 2), std(0xffc83d, 0.6))
    copyTransform(mesh, body.position, body.quaternion)
    // 斜面上的條紋
    const stripes = new THREE.Mesh(new THREE.BoxGeometry(HALF.x * 2 + 0.02, 0.02, 0.5), std(0x2b2b33))
    for (const z of [-2, 0, 2]) {
      const s = stripes.clone()
      s.position.set(0, HALF.y, z)
      mesh.add(s)
    }
    this.root.add(shadow(mesh))
  }

  /** 加入一個可以被撞動的物件 */
  private addDynamic(body: CANNON.Body, mesh: THREE.Object3D) {
    // 先睡著：一開始不計算，被撞到才醒來（物件多時很省效能）
    body.sleep()
    body.sleepSpeedLimit = 0.3
    addBody(this.physics, body)
    this.root.add(shadow(mesh))
    this.dynamics.push({ body, mesh, home: { position: body.position.clone(), quaternion: body.quaternion.clone() } })
    copyTransform(mesh, body.position, body.quaternion)
  }

  /** 方塊大字：每個字是一個「複合剛體」（多個小方塊組成），撞到會整個字倒下 */
  private buildLetters(text: string, center: THREE.Vector3) {
    const CELL = 0.55
    const colors = [0xff5a4e, 0xffc83d, 0x4fa3ff, 0x4fc3a1, 0xa77bff]
    const letterWidth = CELL * 3 + 0.5
    let x = center.x - ((text.length - 1) * letterWidth) / 2
    let colorIndex = 0
    for (const char of text) {
      const rows = FONT[char]
      if (rows) {
        const body = new CANNON.Body({ mass: 6 })
        const mesh = new THREE.Group()
        const material = std(colors[colorIndex++ % colors.length], 0.5)
        const geometry = new THREE.BoxGeometry(CELL, CELL, CELL)
        rows.forEach((row, r) => {
          ;[...row].forEach((cell, c) => {
            if (cell !== '1') return
            // 以字的中心為原點擺放每個小方塊
            const offset = v3((c - 1) * CELL, (2 - r) * CELL, 0)
            body.addShape(new CANNON.Box(v3(CELL / 2, CELL / 2, CELL / 2)), offset)
            const cube = new THREE.Mesh(geometry, material)
            cube.position.set(offset.x, offset.y, offset.z)
            mesh.add(cube)
          })
        })
        body.position.set(x, CELL * 2.5 + 0.01, center.z)
        this.addDynamic(body, mesh)
      }
      x += letterWidth
    }
  }

  /** 保齡球瓶：三角形排列 10 支 */
  private buildPins(center: THREE.Vector3) {
    // LatheGeometry：把一條側面輪廓繞 y 軸轉一圈 → 球瓶形狀
    const profile = [[0, 0], [0.18, 0], [0.24, 0.25], [0.2, 0.55], [0.1, 0.8], [0.13, 0.95], [0.1, 1.1], [0, 1.15]].map(([x, y]) => new THREE.Vector2(x, y))
    const geometry = new THREE.LatheGeometry(profile, 16).translate(0, -0.575, 0)
    const white = std(0xfafafa, 0.35)
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.07, 16), std(0xff5a4e, 0.4))
    stripe.position.y = 0.3
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i <= row; i++) {
        const body = new CANNON.Body({ mass: 1.2, shape: new CANNON.Cylinder(0.12, 0.22, 1.15, 10) })
        body.position.set(center.x + (i - row / 2) * 0.75, 0.58, center.z - row * 0.7)
        const mesh = new THREE.Group()
        mesh.add(new THREE.Mesh(geometry, white), stripe.clone())
        this.addDynamic(body, mesh)
      }
    }
  }

  /** 木箱金字塔 */
  private buildCratePyramid(center: THREE.Vector3) {
    const SIZE = 0.9
    const wood = new THREE.MeshStandardMaterial({ color: 0xc58b52, roughness: 0.85 })
    const edge = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.85 })
    const geometry = new THREE.BoxGeometry(SIZE, SIZE, SIZE)
    const frame = new THREE.BoxGeometry(SIZE * 1.02, SIZE * 0.14, SIZE * 1.02)
    for (let level = 0; level < 4; level++) {
      for (let i = 0; i < 4 - level; i++) {
        const body = new CANNON.Body({ mass: 2, shape: new CANNON.Box(v3(SIZE / 2, SIZE / 2, SIZE / 2)) })
        body.position.set(center.x + (i - (3 - level) / 2) * (SIZE + 0.02), SIZE / 2 + level * SIZE + 0.01, center.z)
        const mesh = new THREE.Group()
        const top = new THREE.Mesh(frame, edge)
        top.position.y = SIZE * 0.43
        const bottom = top.clone()
        bottom.position.y = -SIZE * 0.43
        mesh.add(new THREE.Mesh(geometry, wood), top, bottom)
        this.addDynamic(body, mesh)
      }
    }
  }

  step(dt: number, time: number) {
    // 固定步長 1/60 秒：物理不受 FPS 影響；一幀最多補算 3 步，卡頓時不會爆量計算
    this.physics.step(1 / 60, dt, 3)
    for (const { body, mesh } of this.dynamics) copyTransform(mesh, body.position, body.quaternion)
    // 海面微微起伏
    this.water.position.y = -0.15 + Math.sin(time * 0.8) * 0.04
  }

  /** 把所有被撞倒的物件放回原位 */
  resetObjects() {
    for (const { body, home } of this.dynamics) {
      body.position.copy(home.position)
      body.quaternion.copy(home.quaternion)
      body.velocity.setZero()
      body.angularVelocity.setZero()
      body.sleep()
    }
  }

  /** 已經被撞離原位的物件數量 */
  get knockedCount() {
    return this.dynamics.filter(({ body, home }) => body.position.distanceTo(home.position) > 0.6).length
  }
}
