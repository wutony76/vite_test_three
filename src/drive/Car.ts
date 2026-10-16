// 玩具車：物理（cannon-es 的 RaycastVehicle）+ 外觀（Three.js 模型）
//
// RaycastVehicle 的原理：車身是一個方塊剛體，四個輪子「不是」剛體，
// 而是從車身往下打四條射線，射線打到地面的距離 = 懸吊壓縮量 → 算出彈簧力、抓地力
// 好處：穩定、便宜，不會像真的圓柱輪子那樣卡進地面或彈飛
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

export type CarInput = { throttle: number; steer: number; brake: boolean; boost: boolean }

/** cannon 和 three 的向量是不同的類別 → 逐一複製數值 */
export function copyTransform(object: THREE.Object3D, position: CANNON.Vec3, quaternion: CANNON.Quaternion) {
  object.position.set(position.x, position.y, position.z)
  object.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w)
}

// 車身半尺寸（cannon 的 Box 用「一半的長寬高」）
const HALF = new CANNON.Vec3(0.85, 0.35, 1.5)
const WHEEL_RADIUS = 0.42
const ENGINE_FORCE = 520
const BOOST_MULTIPLIER = 1.8
const MAX_SPEED = 16 // 公尺 / 秒（約 58 km/h）
const MAX_STEER = 0.55 // 弧度（約 31°）
const BRAKE_FORCE = 14

export class Car {
  readonly chassis: CANNON.Body
  readonly vehicle: CANNON.RaycastVehicle
  readonly mesh = new THREE.Group()
  private readonly wheelMeshes: THREE.Object3D[] = []
  private readonly headlights: THREE.MeshStandardMaterial
  private steer = 0
  // 每個輪子是否著地、後輪著地點：物理步進後立刻記下來（見 sync 的說明）
  private readonly contacts = [false, false, false, false]
  private readonly rearPoints: CANNON.Vec3[] = []
  private jumpCooldown = 0

  constructor(world: CANNON.World, groundMaterial: CANNON.Material) {
    // ── 物理：車身 ──
    this.chassis = new CANNON.Body({ mass: 150, material: new CANNON.Material('chassis') })
    // 車身形狀往上偏移一點：重心低 → 不容易翻車
    this.chassis.addShape(new CANNON.Box(HALF), new CANNON.Vec3(0, 0.2, 0))
    this.chassis.angularDamping = 0.4
    // 車身和地面之間摩擦小：翻車時可以滑動，不會黏在地上
    world.addContactMaterial(new CANNON.ContactMaterial(this.chassis.material!, groundMaterial, { friction: 0.05, restitution: 0.1 }))

    // ── 物理：車輛（y 軸朝上、z 軸朝前、x 軸朝右）──
    this.vehicle = new CANNON.RaycastVehicle({ chassisBody: this.chassis, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 })
    const wheel = {
      radius: WHEEL_RADIUS,
      directionLocal: new CANNON.Vec3(0, -1, 0), // 射線往下
      axleLocal: new CANNON.Vec3(-1, 0, 0), // 輪軸方向
      suspensionStiffness: 32, // 彈簧硬度
      suspensionRestLength: 0.35, // 彈簧自然長度
      maxSuspensionTravel: 0.35,
      dampingRelaxation: 2.4, // 回彈阻尼
      dampingCompression: 4.4, // 壓縮阻尼
      frictionSlip: 2.2, // 抓地力：越小越容易甩尾
      rollInfluence: 0.04, // 越小越不容易側翻
      maxSuspensionForce: 100000,
      useCustomSlidingRotationalSpeed: true,
      customSlidingRotationalSpeed: -30,
      chassisConnectionPointLocal: new CANNON.Vec3(),
    }
    // 順序：0 左前、1 右前、2 左後、3 右後
    for (const [x, z] of [[0.8, 1.05], [-0.8, 1.05], [0.8, -1.0], [-0.8, -1.0]]) {
      this.vehicle.addWheel({ ...wheel, chassisConnectionPointLocal: new CANNON.Vec3(x, 0, z) })
    }
    this.vehicle.addToWorld(world)

    // ── 外觀 ──
    this.headlights = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff1c0, emissiveIntensity: 0.4 })
    this.buildModel()
  }

  private buildModel() {
    const red = new THREE.MeshStandardMaterial({ color: 0xff5a4e, roughness: 0.45 })
    const cream = new THREE.MeshStandardMaterial({ color: 0xfff3dc, roughness: 0.6 })
    const glass = new THREE.MeshStandardMaterial({ color: 0x2f3b52, roughness: 0.15, metalness: 0.3 })
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.8 })
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      mesh.receiveShadow = true
      this.mesh.add(mesh)
      return mesh
    }
    // 車身、車頂、擋風玻璃、車燈、保險桿
    add(new RoundedBoxGeometry(1.7, 0.6, 3.0, 4, 0.22), red, 0, 0.2, 0)
    add(new RoundedBoxGeometry(1.4, 0.55, 1.5, 4, 0.2), cream, 0, 0.72, -0.25)
    add(new RoundedBoxGeometry(1.42, 0.38, 1.1, 2, 0.12), glass, 0, 0.74, -0.25)
    add(new RoundedBoxGeometry(1.5, 0.2, 0.3, 2, 0.08), dark, 0, 0.0, 1.45)
    add(new RoundedBoxGeometry(1.5, 0.2, 0.3, 2, 0.08), dark, 0, 0.0, -1.45)
    for (const x of [-0.55, 0.55]) add(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 16).rotateX(Math.PI / 2), this.headlights, x, 0.25, 1.5)
    // 車頂小旗子（玩具感）
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), dark, -0.5, 1.3, -0.7)
    add(new THREE.BoxGeometry(0.02, 0.22, 0.34), new THREE.MeshStandardMaterial({ color: 0xffc83d }), -0.5, 1.55, -0.55)

    // 輪子：獨立物件，每幀依物理的輪子位置擺放
    const tire = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.36, 24).rotateZ(Math.PI / 2)
    const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.38, 12).rotateZ(Math.PI / 2)
    for (let i = 0; i < 4; i++) {
      const group = new THREE.Group()
      const t = new THREE.Mesh(tire, dark)
      const h = new THREE.Mesh(hub, cream)
      t.castShadow = true
      group.add(t, h)
      this.wheelMeshes.push(group)
    }
  }

  /** 輪子要直接加到場景（它們的位置是世界座標） */
  get wheels() {
    return this.wheelMeshes
  }

  /** 速度（公尺 / 秒） */
  get speed() {
    return this.chassis.velocity.length()
  }

  /** 前進方向的速度：正 = 往前、負 = 倒車 */
  get forwardSpeed() {
    const forward = this.chassis.quaternion.vmult(new CANNON.Vec3(0, 0, 1))
    return forward.dot(this.chassis.velocity)
  }

  /** 至少兩個輪子著地 */
  get grounded() {
    return this.contacts.filter(Boolean).length >= 2
  }

  /** 車身朝上的程度：1 = 正常、0 = 側躺、-1 = 四輪朝天 */
  get uprightness() {
    return this.chassis.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y
  }

  update(input: CarInput, dt: number) {
    // 轉向平滑：方向盤不會瞬間打到底；速度越快可轉角度越小，高速不容易失控
    const steerLimit = MAX_STEER * THREE.MathUtils.lerp(1, 0.45, Math.min(this.speed / MAX_SPEED, 1))
    this.steer += (input.steer * steerLimit - this.steer) * Math.min(1, dt * 8)
    this.vehicle.setSteeringValue(this.steer, 0)
    this.vehicle.setSteeringValue(this.steer, 1)

    // 引擎：四輪驅動；超過最高速就不再出力
    const max = MAX_SPEED * (input.boost ? 1.4 : 1)
    const force = Math.abs(this.forwardSpeed) < max ? -input.throttle * ENGINE_FORCE * (input.boost ? BOOST_MULTIPLIER : 1) : 0
    for (let i = 0; i < 4; i++) this.vehicle.applyEngineForce(force, i)

    // 煞車；沒踩油門時給一點點煞車，車子會自然慢慢停下
    const brake = input.brake ? BRAKE_FORCE : input.throttle === 0 ? 0.6 : 0
    for (let i = 0; i < 4; i++) this.vehicle.setBrake(brake, i)

    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt)
    this.headlights.emissiveIntensity = input.boost ? 2.5 : 0.4
  }

  /** 跳躍：著地時往上推一把 */
  jump() {
    if (!this.grounded || this.jumpCooldown > 0) return false
    this.chassis.applyImpulse(new CANNON.Vec3(0, this.chassis.mass * 6, 0))
    this.jumpCooldown = 0.6
    return true
  }

  /** 重置：回到指定位置、轉正、停止 */
  reset(position: CANNON.Vec3, heading: number) {
    this.chassis.position.copy(position)
    this.chassis.quaternion.setFromEuler(0, heading, 0)
    this.chassis.velocity.setZero()
    this.chassis.angularVelocity.setZero()
    this.chassis.wakeUp()
  }

  /** 物理 → 畫面：每幀把剛體位置、旋轉複製到模型上 */
  sync() {
    // ⚠️ 必須在 updateWheelTransform 之前讀 isInContact：
    // cannon-es 的 updateWheelTransform 內部會呼叫 updateWheelTransformWorld，把 isInContact 重設成 false
    this.rearPoints.length = 0
    this.vehicle.wheelInfos.forEach((wheel, i) => {
      this.contacts[i] = wheel.isInContact
      if (i >= 2 && wheel.isInContact) this.rearPoints.push(wheel.raycastResult.hitPointWorld.clone())
    })
    copyTransform(this.mesh, this.chassis.position, this.chassis.quaternion)
    for (let i = 0; i < 4; i++) {
      this.vehicle.updateWheelTransform(i)
      const t = this.vehicle.wheelInfos[i].worldTransform
      copyTransform(this.wheelMeshes[i], t.position, t.quaternion)
    }
  }

  /** 後輪著地點（揚塵用） */
  rearContacts() {
    return this.rearPoints
  }
}
