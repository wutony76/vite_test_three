// 開車逛小島：組裝物理世界、車、鏡頭、操作、UI
// 每一幀的順序：讀操作 → 車子出力 → 物理前進一步 → 物理結果同步到畫面 → 判斷區域 → 鏡頭 → 畫出來
import './style.scss'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car'
import { DriveWorld, ISLAND_RADIUS } from './world'
import { ZONES, ZONE_RADIUS } from './zones'
import { Input } from './Input'
import { CameraRig } from './CameraRig'
import { Dust } from './Dust'
import { CarAudio } from './audio'
import { Grass } from './Grass'

// ── 1. DOM ──
const $ = <T extends HTMLElement = HTMLElement>(ref: string) => document.querySelector<T>(`[data-ref="${ref}"]`)!
const refs = {
  app: $('app'),
  stage: $('stage'),
  knocked: $('knocked'),
  sound: $<HTMLButtonElement>('sound'),
  respawn: $<HTMLButtonElement>('respawn'),
  resetObjects: $<HTMLButtonElement>('resetObjects'),
  help: $<HTMLButtonElement>('help'),
  helpPanel: $('helpPanel'),
  zoneCard: $('zoneCard'),
  zoneTitle: $('zoneTitle'),
  zoneDescription: $('zoneDescription'),
  zoneLink: $<HTMLAnchorElement>('zoneLink'),
  toast: $('toast'),
  touch: $('touch'),
  touchJump: $<HTMLButtonElement>('touchJump'),
  touchBrake: $<HTMLButtonElement>('touchBrake'),
  touchBoost: $<HTMLButtonElement>('touchBoost'),
  intro: $('intro'),
  start: $<HTMLButtonElement>('start'),
  fallback: $('fallback'),
}

const SPAWN = new CANNON.Vec3(0, 1.2, 6)
// 出生時車頭朝 -z（面向大字）
const SPAWN_HEADING = Math.PI
// 太陽相對於鏡頭焦點的位置（右前上方）
const SUN_OFFSET = new THREE.Vector3(14, 26, 10)

// ── 2. 狀態 ──
const state = {
  status: 'intro' as 'intro' | 'playing',
  zone: null as number | null, // 目前停在第幾個作品區域
  sound: true,
  helpOpen: false,
  flippedFor: 0, // 翻車多久了（秒）
  knocked: 0,
  toast: '',
}
let toastTimer = 0

if (document.createElement('canvas').getContext('webgl2')) init()
else {
  refs.fallback.hidden = false
  refs.intro.hidden = true
}

function init() {
  // ── 3. 渲染與場景 ──
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  refs.stage.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x9fd8ef)
  scene.fog = new THREE.Fog(0x9fd8ef, 60, 160)
  scene.add(new THREE.HemisphereLight(0xdff4ff, 0x7aa35a, 1.6))
  // 太陽：陰影相機只涵蓋車子周圍 30 公尺，並跟著車移動 → 範圍小，陰影才清楚
  const sun = new THREE.DirectionalLight(0xfff2dc, 2.4)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  const shadowCamera = sun.shadow.camera
  shadowCamera.left = shadowCamera.bottom = -22
  shadowCamera.right = shadowCamera.top = 22
  shadowCamera.near = 1
  shadowCamera.far = 80
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.03
  scene.add(sun, sun.target)

  const world = new DriveWorld()
  const car = new Car(world.physics, world.groundMaterial)
  car.reset(SPAWN, SPAWN_HEADING)
  const dust = new Dust()
  // 草：手機數量減少；作品圓台、跳台上不長草
  const grass = new Grass({
    count: window.matchMedia('(pointer: coarse)').matches ? 24000 : 70000,
    radius: ISLAND_RADIUS - 1,
    exclude: [...world.zoneCenters.map((c) => ({ x: c.x, z: c.z, r: ZONE_RADIUS + 0.4 })), { x: -12, z: 8, r: 4.6 }],
  })
  scene.add(world.root, grass.mesh, car.mesh, ...car.wheels, dust.group)

  const rig = new CameraRig(refs.stage)
  const audio = new CarAudio()

  // ── 4. 私有工具方法 ──
  const _handlers = {
    showToast(message: string, ms = 2200) {
      state.toast = message
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => {
        state.toast = ''
        _handlers.render()
      }, ms)
      _handlers.render()
    },
    // 車子在哪個作品區域裡（只看水平距離）
    findZone() {
      const p = car.chassis.position
      const index = world.zoneCenters.findIndex((center) => Math.hypot(p.x - center.x, p.z - center.z) < ZONE_RADIUS)
      return index === -1 ? null : index
    },
    render() {
      const zone = state.zone === null ? null : ZONES[state.zone]
      refs.zoneCard.hidden = !zone
      if (zone) {
        refs.zoneCard.style.setProperty('--zone', zone.color)
        refs.zoneTitle.textContent = zone.title
        refs.zoneDescription.textContent = zone.description
        refs.zoneLink.href = zone.href
      }
      refs.knocked.textContent = `撞倒 ${state.knocked} 個`
      refs.sound.setAttribute('aria-pressed', String(state.sound))
      refs.sound.textContent = state.sound ? '🔊' : '🔇'
      refs.helpPanel.hidden = !state.helpOpen
      refs.help.setAttribute('aria-expanded', String(state.helpOpen))
      refs.intro.hidden = state.status !== 'intro'
      refs.toast.textContent = state.toast
      refs.toast.classList.toggle('is-visible', Boolean(state.toast))
    },
  }

  // ── 5. 業務流程 ──
  const _actions = {
    async start() {
      if (state.status === 'playing') return
      state.status = 'playing'
      _handlers.render()
      try {
        await audio.start()
        audio.setMuted(!state.sound)
      } catch (error) {
        // 沒有聲音也能玩
        console.error(error)
      }
    },
    interact() {
      if (state.status !== 'playing' || state.zone === null) return
      window.location.href = ZONES[state.zone].href
    },
    respawn() {
      car.reset(SPAWN, SPAWN_HEADING)
      rig.snap(new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z))
      state.flippedFor = 0
      _handlers.showToast('回到起點')
    },
    resetObjects() {
      world.resetObjects()
      _handlers.showToast('物件都放回原位了')
    },
    jump() {
      if (state.status === 'playing') car.jump()
    },
    honk() {
      audio.honk()
    },
    toggleSound() {
      state.sound = !state.sound
      audio.setMuted(!state.sound)
      _handlers.render()
    },
  }

  const input = new Input({
    jump: _actions.jump,
    interact: _actions.interact,
    reset: _actions.respawn,
    honk: _actions.honk,
    mute: _actions.toggleSound,
  })
  input.bindTouch(refs.stage, refs.touchBrake, refs.touchBoost)

  // ── 6. UI 入口事件 ──
  const click = {
    onHelp() {
      state.helpOpen = !state.helpOpen
      _handlers.render()
    },
    // 觸控：沒有拖動、很快放開 = 點一下 → 跳
    onStageTap(event: PointerEvent) {
      if (event.pointerType === 'touch' && input.touchDistance < 0.15) _actions.jump()
    },
  }
  refs.start.addEventListener('click', () => _actions.start())
  refs.sound.addEventListener('click', _actions.toggleSound)
  refs.respawn.addEventListener('click', _actions.respawn)
  refs.resetObjects.addEventListener('click', _actions.resetObjects)
  refs.help.addEventListener('click', click.onHelp)
  refs.touchJump.addEventListener('click', _actions.jump)
  refs.stage.addEventListener('pointerup', click.onStageTap)
  // 開始畫面：按任意鍵也可以開始
  window.addEventListener('keydown', (event) => {
    if (state.status === 'intro' && event.code !== 'Tab') _actions.start()
  })
  // 有觸控才顯示觸控按鈕
  refs.touch.hidden = !window.matchMedia('(pointer: coarse)').matches

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
    rig.resize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', resize)
  resize()
  rig.snap(new THREE.Vector3(SPAWN.x, SPAWN.y, SPAWN.z))

  // ── 7. 每一幀 ──
  const timer = new THREE.Timer()
  timer.connect(document)
  const carPosition = new THREE.Vector3()
  const carVelocity = new THREE.Vector3()
  let knockedCheck = 0

  renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp)
    const dt = Math.min(timer.getDelta(), 0.1)
    const time = timer.getElapsed()

    // 開始畫面時：車子不受操作（但物理照跑，畫面是活的）
    const controls = state.status === 'playing' ? input.update() : { throttle: 0, steer: 0, brake: true, boost: false }
    car.update(controls, dt)
    world.step(dt, time)
    car.sync()

    const p = car.chassis.position
    const v = car.chassis.velocity
    carPosition.set(p.x, p.y, p.z)
    carVelocity.set(v.x, v.y, v.z)

    // 掉到島外（跳太遠）→ 自動回起點
    if (p.y < -5) _actions.respawn()

    // 翻車偵測：朝上程度 < 0.3 持續 2 秒 → 提示
    if (car.uprightness < 0.3) {
      state.flippedFor += dt
      if (state.flippedFor > 2 && !state.toast) _handlers.showToast('翻車了！按 R 或 ↺ 回到起點', 3000)
    } else state.flippedFor = 0

    // 作品區域
    const zone = _handlers.findZone()
    if (zone !== state.zone) {
      state.zone = zone
      _handlers.render()
    }
    world.zoneRings.forEach((ring, i) => (ring.emissiveIntensity = i === zone ? 1.6 + Math.sin(time * 6) * 0.5 : 0.3))

    // 每 0.5 秒更新撞倒數量（不必每幀算）
    knockedCheck += dt
    if (knockedCheck > 0.5) {
      knockedCheck = 0
      const knocked = world.knockedCount
      if (knocked !== state.knocked) {
        state.knocked = knocked
        _handlers.render()
      }
    }

    // 揚塵：著地且有速度才冒煙，越快越多
    dust.emit(car.rearContacts(), car.speed > 3 ? car.speed * 2.2 : 0, dt)
    dust.update(dt)
    grass.update(time, carPosition)

    // 鏡頭與太陽跟著車
    rig.update(carPosition, carVelocity, dt)
    sun.target.position.copy(rig.focus)
    sun.position.copy(rig.focus).add(SUN_OFFSET)

    audio.update(Math.min(car.speed / 16, 1), Math.abs(controls.throttle))
    renderer.render(scene, rig.camera)
  })

  _handlers.render()
  if (import.meta.env.DEV) Object.assign(window, { __drive: { car, world, state, rig, input } })
}
