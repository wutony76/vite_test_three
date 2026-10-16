// 場景世界：組裝所有物件，並負責「隨時間變化」的東西
// - 日夜、下雨的平滑過渡（天空、光線、發光材質一起變）
// - 煙、雨、霓虹閃爍、貓尾巴、樹葉
// - 開場「逐件長出來」的動畫
import * as THREE from 'three'
import { createMaterials, type Materials } from './world/materials'
import { buildShop } from './world/buildShop'
import { buildStreet } from './world/buildStreet'
import { buildProps } from './world/buildProps'
import { buildSky } from './world/buildSky'
import { Rain, Smoke } from './world/effects'

const { lerp, clamp } = THREE.MathUtils

// 日夜兩組配色：先建好 Color 物件，每幀直接拿來用（避免每幀 new 物件，造成垃圾回收卡頓）
const c = (hex: number) => new THREE.Color(hex)
const PALETTE = {
  day: { top: c(0x5fa8e6), bottom: c(0xd4e8f4), mountainNear: c(0x8aa0ad), mountainFar: c(0xb2c4d0) },
  night: { top: c(0x070b24), bottom: c(0x2b2452), mountainNear: c(0x141633), mountainFar: c(0x1f2045) },
  // 下雨時天空往灰色靠
  rainDay: c(0x8c97a3),
  rainNight: c(0x1d2030),
  hemiSky: [c(0xcfe6ff), c(0x5464a8)],
  hemiGround: [c(0x8a7a66), c(0x1a1428)],
  light: [c(0xfff1d6), c(0x9fb4ff)],
  smoke: [c(0xf2f2f2), c(0x8c86a6)],
  sunPosition: new THREE.Vector3(16, 24, 9),
  moonPosition: new THREE.Vector3(8, 22, 18),
}

// 開場動畫：每件間隔與長出時間（秒）
const BUILD_STAGGER = 0.09
const BUILD_DURATION = 0.55

// 回彈的緩動：會稍微超過 1 再回來，像「蹦」一下長出來
const easeOutBack = (t: number) => {
  const c = 1.70158
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2
}

const mix = (target: THREE.Color, a: THREE.Color, b: THREE.Color, t: number) => target.copy(a).lerp(b, t)

export class World {
  readonly root = new THREE.Group()
  /** 熱點 id → 物件（店貓有兩隻，所以是陣列） */
  readonly hotspots = new Map<string, THREE.Object3D[]>()
  /** 目前 Bloom 強度，Stage 每幀讀取 */
  bloomStrength = 0.8
  /**
   * 陰影是否需要重畫：場景大多是靜止的，只有開場動畫、日夜 / 雨切換（光線移動）時才需要
   * Stage 讀到 true 就請 renderer 重畫一次陰影貼圖
   */
  shadowsDirty = true
  /** 開場動畫進度回報 */
  onBuildProgress: ((ratio: number) => void) | null = null

  private readonly M: Materials
  private readonly scene: THREE.Scene
  // 霧：近處清楚、遠處漸漸融入天空底色（near 之前完全清楚，far 之後完全是霧色）
  private readonly fog = new THREE.Fog(0x000000, 26, 150)
  private readonly hemi = new THREE.HemisphereLight()
  private readonly mainLight = new THREE.DirectionalLight()
  private readonly shopLight = new THREE.PointLight(0xffb46a, 0, 9, 1.6)
  private readonly lampLight: THREE.SpotLight
  private readonly sky: ReturnType<typeof buildSky>
  private readonly smoke: Smoke
  private readonly rainFx = new Rain()
  private readonly foliage: THREE.Object3D
  private readonly tails: THREE.Object3D[]
  private readonly animations: ((elapsed: number) => void)[]
  private readonly pieces: THREE.Object3D[]

  // 0 = 白天、1 = 晚上；target 是切換後要前往的值，每幀慢慢靠近
  private nightness = 1
  private targetNightness = 1
  private rain = 0
  private targetRain = 0
  private neonFlicker = 0
  // 開場動畫開始的時間（毫秒）；-1 = 沒有在播
  private buildStart = -1

  // 暫存顏色物件：每幀重複使用，避免一直 new 產生垃圾回收負擔
  private readonly tmp = { a: new THREE.Color(), b: new THREE.Color(), c: new THREE.Color() }

  constructor(scene: THREE.Scene) {
    this.scene = scene
    this.M = createMaterials()
    scene.add(this.root)
    scene.fog = this.fog

    const shop = buildShop(this.M)
    const street = buildStreet(this.M)
    const props = buildProps(this.M)
    this.sky = buildSky(this.M.softDot)
    this.smoke = new Smoke(shop.chimneyTop, this.M.softDot)
    this.foliage = props.foliage
    this.tails = props.tails
    this.animations = props.animations
    this.lampLight = street.lampLight

    // 開場順序：地塊 → 建築 → 頂樓 → 道具
    this.pieces = [...street.pieces.slice(0, 1), ...shop.pieces, street.pieces[1], ...props.pieces]
    // pieces 裡有些是建築的子物件（已經在 building 底下），只把最上層的加進場景
    for (const piece of this.pieces) if (!piece.parent) this.root.add(piece)
    this.root.add(street.surroundings, this.sky.sky, this.smoke.group, this.rainFx.lines)

    // ── 光 ──
    // 主光：白天是太陽、晚上是月光，負責投射陰影
    this.mainLight.castShadow = true
    this.mainLight.shadow.mapSize.set(2048, 2048)
    const shadowCam = this.mainLight.shadow.camera
    shadowCam.left = shadowCam.bottom = -13
    shadowCam.right = shadowCam.top = 13
    shadowCam.near = 1
    shadowCam.far = 70
    this.mainLight.shadow.bias = -0.0004
    this.mainLight.shadow.normalBias = 0.02
    // 店裡透出來的暖光，照亮門口人行道
    this.shopLight.position.set(-2.75, 1.6, 0.9)
    this.root.add(this.hemi, this.mainLight, this.shopLight, this.lampLight, this.lampLight.target)

    // 霓虹燈管、天空、粒子不需要陰影
    for (const piece of this.pieces) {
      piece.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.isMesh && mesh.material instanceof THREE.MeshBasicMaterial) mesh.castShadow = mesh.receiveShadow = false
      })
    }

    // 建立熱點索引
    this.root.traverse((object) => {
      const id = object.userData.hotspot as string | undefined
      if (!id) return
      this.hotspots.set(id, [...(this.hotspots.get(id) ?? []), object])
    })

    this.applyEnvironment()
  }

  /** 開始開場動畫；reducedMotion 時直接完成 */
  startBuild(reducedMotion: boolean) {
    if (reducedMotion) {
      this.onBuildProgress?.(1)
      return
    }
    for (const piece of this.pieces) piece.scale.setScalar(0.0001)
    this.buildStart = performance.now()
  }

  setNight(isNight: boolean) {
    this.targetNightness = isNight ? 1 : 0
  }

  setRaining(isRaining: boolean) {
    this.targetRain = isRaining ? 1 : 0
  }

  get rainAmount() {
    return this.rain
  }

  update(dt: number, elapsed: number) {
    this.updateBuild()

    // 朝目標值平滑靠近：每秒最多變化 0.8，約 1.2 秒完成日夜切換
    const step = dt * 0.8
    const transitioning = this.nightness !== this.targetNightness || this.rain !== this.targetRain
    this.nightness += clamp(this.targetNightness - this.nightness, -step, step)
    this.rain += clamp(this.targetRain - this.rain, -step, step)
    if (transitioning) this.shadowsDirty = true

    // 霓虹偶爾閃一下：每秒約 15% 機率觸發，閃 0.5 秒
    if (this.neonFlicker <= 0 && Math.random() < dt * 0.15) this.neonFlicker = 0.5
    this.neonFlicker = Math.max(0, this.neonFlicker - dt)

    this.applyEnvironment(elapsed)

    // 煙：晚上被霓虹映成淡紫灰、白天偏白；下雨時煙比較淡
    const smokeColor = mix(this.tmp.c, PALETTE.smoke[0], PALETTE.smoke[1], this.nightness)
    this.smoke.update(dt, 0.6 + this.rain * 0.8, smokeColor, 1 - this.rain * 0.5)
    this.rainFx.update(dt, this.rain)

    // 樹葉搖晃（下雨時風比較大）、貓尾巴擺動
    this.foliage.rotation.z = Math.sin(elapsed * 0.9) * (0.025 + this.rain * 0.04)
    this.foliage.rotation.x = Math.sin(elapsed * 0.7 + 1) * 0.015
    this.tails.forEach((tail, i) => (tail.rotation.y = Math.sin(elapsed * (1.6 + i * 0.5) + i * 2) * 0.45))
    for (const animate of this.animations) animate(elapsed)
  }

  // 用「實際經過的時間」而不是累加每幀 dt：
  // 低階裝置每秒只有幾幀時，dt 有上限（0.1 秒），累加會讓 2 秒的動畫拖到十幾秒
  private updateBuild() {
    if (this.buildStart < 0) return
    this.shadowsDirty = true
    const elapsed = (performance.now() - this.buildStart) / 1000
    let done = 0
    this.pieces.forEach((piece, i) => {
      const t = clamp((elapsed - i * BUILD_STAGGER) / BUILD_DURATION, 0, 1)
      piece.scale.setScalar(Math.max(0.0001, easeOutBack(t)))
      if (t === 1) done++
    })
    this.onBuildProgress?.(done / this.pieces.length)
    if (done === this.pieces.length) this.buildStart = -1
  }

  /** 依目前的 nightness、rain 設定天空、光線、發光材質 */
  private applyEnvironment(elapsed = 0) {
    const n = this.nightness
    const r = this.rain
    const { a, b } = this.tmp
    const P = PALETTE

    // 天空與霧：霧的顏色 = 天空底部顏色，遠處物體才會自然融入天空
    const rainGrey = mix(b, P.rainDay, P.rainNight, n)
    mix(a, P.day.top, P.night.top, n).lerp(rainGrey, r * 0.6)
    this.sky.skyUniforms.topColor.value.copy(a)
    mix(a, P.day.bottom, P.night.bottom, n).lerp(rainGrey, r * 0.6)
    this.sky.skyUniforms.bottomColor.value.copy(a)
    this.fog.color.copy(a)
    this.fog.far = lerp(150, 95, r)

    mix(this.sky.mountains[0].color, P.day.mountainNear, P.night.mountainNear, n)
    mix(this.sky.mountains[1].color, P.day.mountainFar, P.night.mountainFar, n)
    // 星星微微閃爍
    this.sky.starMaterial.opacity = n * (1 - r) * (0.85 + Math.sin(elapsed * 2) * 0.15)
    this.sky.moonMaterial.opacity = n * (1 - r * 0.8)

    // 環境光：天空色 / 地面反射色
    const dim = 1 - r * 0.35
    mix(this.hemi.color, P.hemiSky[0], P.hemiSky[1], n)
    mix(this.hemi.groundColor, P.hemiGround[0], P.hemiGround[1], n)
    this.hemi.intensity = lerp(1.4, 0.75, n) * dim

    // 主光：太陽（右前上方、暖白、強）↔ 月亮（右前上方偏左、冷藍、弱）
    this.mainLight.position.lerpVectors(P.sunPosition, P.moonPosition, n)
    mix(this.mainLight.color, P.light[0], P.light[1], n)
    this.mainLight.intensity = lerp(2.6, 0.7, n) * (1 - r * 0.5)

    // 人造光：只在晚上亮
    this.shopLight.intensity = n * 14
    this.lampLight.intensity = n * 55

    // 會發光的材質（櫥窗、招牌、燈泡…）
    for (const glow of this.M.glows) glow(n)

    // 霓虹：亮度 > 1 才會產生 Bloom 光暈；藍色熱氣那幾根會閃爍
    const neon = lerp(1.1, 4.2, n)
    const flicker = this.neonFlicker > 0 && Math.sin(elapsed * 70) > 0 ? 0.15 : 1
    this.M.neon.pink.color.copy(this.M.neon.pinkBase).multiplyScalar(neon)
    this.M.neon.cyan.color.copy(this.M.neon.cyanBase).multiplyScalar(neon * flicker)

    this.bloomStrength = lerp(0.12, 0.85, n)
  }

  dispose() {
    // 收集所有材質（Set 去重複），連同 geometry 一起釋放
    const materials = new Set<THREE.Material>()
    this.root.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.geometry) return
      mesh.geometry.dispose()
      for (const material of [mesh.material].flat()) materials.add(material)
    })
    for (const material of materials) material.dispose()
    // 共用材質的貼圖
    this.M.dispose()
    this.scene.remove(this.root)
    this.scene.fog = null
  }
}
