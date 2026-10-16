// 夜市燈光範例進入點：組裝場景、控制台 UI、點擊攤位、情境預設
import './style.scss'
import * as THREE from 'three'
import { Stage } from './Stage'
import { STALLS } from './stalls'
import { Stall, createSharedMaterials } from './Stall'
import { updateStripUniforms, type StripMode } from './LedStrip'
import { StringLights, type BulbMode } from './StringLights'
import { Gate } from './Gate'
import { Crowd } from './Crowd'
import { buildBuildings, buildGround, Steam } from './Street'
import { PowerSwitch } from './neon'
import { softDotTexture } from './textures'
import { Ambience } from './ambience'

// ── 1. DOM ──
const $ = <T extends HTMLElement = HTMLElement>(ref: string) => document.querySelector<T>(`[data-ref="${ref}"]`)!
const refs = {
  app: $('app'),
  stage: $('stage'),
  console: $('console'),
  consoleToggle: $<HTMLButtonElement>('consoleToggle'),
  presets: $('presets'),
  power: $<HTMLButtonElement>('power'),
  powerLabel: $('powerLabel'),
  stalls: $('stalls'),
  modes: $('modes'),
  colors: $('colors'),
  customColor: $<HTMLInputElement>('customColor'),
  speed: $<HTMLInputElement>('speed'),
  bulbs: $('bulbs'),
  dimmer: $<HTMLInputElement>('dimmer'),
  bloom: $<HTMLInputElement>('bloom'),
  haze: $<HTMLInputElement>('haze'),
  ambient: $<HTMLInputElement>('ambient'),
  crowd: $<HTMLButtonElement>('crowd'),
  sound: $<HTMLButtonElement>('sound'),
  fullscreen: $<HTMLButtonElement>('fullscreen'),
  label: $('label'),
  toast: $('toast'),
  fallback: $('fallback'),
}

// ── 2. 狀態與情境預設 ──
type PresetId = 'open' | 'party' | 'chill' | 'close'
type Settings = {
  power: boolean
  dimmer: number
  bloom: number
  haze: number
  // 基本環境光強度（不管攤位開不開都在，讓整條街有基本亮度）
  ambient: number
  crowd: boolean
  strip: { mode: StripMode; color: string; speed: number }
  bulbs: BulbMode
}

const PRESETS: Record<PresetId, Settings> = {
  open: { power: true, dimmer: 1, bloom: 0.9, haze: 0.45, ambient: 1, crowd: true, strip: { mode: 'solid', color: 'stall', speed: 1 }, bulbs: 'twinkle' },
  party: { power: true, dimmer: 1.1, bloom: 1.35, haze: 0.6, ambient: 0.7, crowd: true, strip: { mode: 'rainbow', color: 'stall', speed: 2.2 }, bulbs: 'chase' },
  chill: { power: true, dimmer: 0.55, bloom: 0.75, haze: 0.75, ambient: 0.8, crowd: true, strip: { mode: 'breathe', color: '#ffb36b', speed: 0.6 }, bulbs: 'steady' },
  close: { power: false, dimmer: 1, bloom: 0.9, haze: 0.5, ambient: 0.6, crowd: false, strip: { mode: 'solid', color: 'stall', speed: 1 }, bulbs: 'steady' },
}

const isSmallScreen = window.innerWidth < 760
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const state = {
  ...structuredClone(PRESETS.open),
  stalls: Object.fromEntries(STALLS.map((s) => [s.id, true])) as Record<string, boolean>,
  preset: 'open' as PresetId | null, // 手動調整後變成 null（不屬於任何情境）
  sound: false,
  consoleOpen: !isSmallScreen,
  hovered: null as string | null,
  toast: '',
}

let toastTimer = 0

if (document.createElement('canvas').getContext('webgl2')) init()
else refs.fallback.hidden = false

function init() {
  // ── 3. 場景 ──
  const stage = new Stage(refs.stage, Math.min(window.devicePixelRatio, isSmallScreen ? 1.25 : 1.5))
  const { scene } = stage
  scene.background = new THREE.Color(0x08060f)
  const fog = new THREE.FogExp2(0x0b0816, 0.03)
  scene.fog = fog
  // ── 基本光：攤位燈以外的整體照明，強度由控制台「環境光」調整 ──
  // HemisphereLight：上方是夜空的藍紫色、下方是地面反射的暖色，讓物體上下有自然的明暗
  const baseLight = new THREE.HemisphereLight(0x8f9ad6, 0x4a3038, 0)
  // 補光：從鏡頭後上方斜照進街道，照出攤位與行人的輪廓（像遠處路燈與招牌的散射光）
  const fillLight = new THREE.DirectionalLight(0xc4ccff, 0)
  fillLight.position.set(4, 12, 14)
  fillLight.target.position.set(0, 0, -4)
  scene.add(baseLight, fillLight, fillLight.target)

  const M = createSharedMaterials()
  const stalls = STALLS.map((info) => new Stall(info, M))
  const stringLights = new StringLights()
  const gate = new Gate(-11.5)
  const crowd = new Crowd(isSmallScreen ? 16 : 26)
  const softDot = softDotTexture()
  const steam = new Steam(stalls.flatMap((s) => (s.steamOrigin ? [s.steamOrigin] : [])), softDot)
  scene.add(
    buildGround(),
    buildBuildings(),
    ...stalls.map((s) => s.group),
    stringLights.group,
    gate.group,
    crowd.group,
    steam.group,
  )

  // 串燈與牌樓一起開關
  const streetPower = new PowerSwitch()
  const ambience = new Ambience()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const hitboxes = stalls.map((s) => s.hitbox)
  const stripColor = new THREE.Color()
  const pointerDown = { x: 0, y: 0 }

  // ── 4. 私有工具方法 ──
  const _handlers = {
    buildStallButtons() {
      refs.stalls.replaceChildren(
        ...STALLS.map((info) => {
          const button = document.createElement('button')
          button.type = 'button'
          button.dataset.id = info.id
          button.style.setProperty('--dot', info.light)
          button.innerHTML = '<span class="dot"></span>'
          button.append(info.name)
          button.addEventListener('click', () => _actions.toggleStall(info.id))
          return button
        }),
      )
    },
    pickStall(event: PointerEvent) {
      const rect = refs.stage.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, stage.camera)
      return (raycaster.intersectObjects(hitboxes, false)[0]?.object.userData.stallId as string | undefined) ?? null
    },
    showToast(message: string) {
      state.toast = message
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => {
        state.toast = ''
        _handlers.render()
      }, 2200)
      _handlers.render()
    },
    // 依 state 更新控制台的按鈕狀態
    render() {
      const pressed = (container: HTMLElement, key: string, value: string) =>
        container.querySelectorAll<HTMLButtonElement>(`[data-${key}]`).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset[key] === value)))
      pressed(refs.presets, 'preset', state.preset ?? '')
      pressed(refs.modes, 'mode', state.strip.mode)
      pressed(refs.colors, 'color', state.strip.color)
      pressed(refs.bulbs, 'bulbs', state.bulbs)
      refs.customColor.parentElement!.setAttribute('aria-pressed', String(state.strip.color.startsWith('#') && !refs.colors.querySelector(`[data-color="${state.strip.color}"]`)))
      refs.power.setAttribute('aria-pressed', String(state.power))
      refs.powerLabel.textContent = state.power ? '總電源 開' : '總電源 關'
      refs.stalls.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
        b.setAttribute('aria-pressed', String(state.power && state.stalls[b.dataset.id!]))
      })
      refs.speed.value = String(state.strip.speed)
      refs.dimmer.value = String(state.dimmer)
      refs.bloom.value = String(state.bloom)
      refs.haze.value = String(state.haze)
      refs.ambient.value = String(state.ambient)
      refs.crowd.setAttribute('aria-pressed', String(state.crowd))
      refs.sound.setAttribute('aria-pressed', String(state.sound))
      refs.console.hidden = !state.consoleOpen
      refs.consoleToggle.setAttribute('aria-expanded', String(state.consoleOpen))
      refs.label.textContent = state.hovered ? `${STALLS.find((s) => s.id === state.hovered)?.name} · 點擊${state.stalls[state.hovered] && state.power ? '關燈' : '開燈'}` : ''
      refs.toast.textContent = state.toast
      refs.toast.classList.toggle('is-visible', Boolean(state.toast))
    },
  }

  // ── 5. 業務流程 ──
  const _actions = {
    /** 把 state 同步到 3D：開關燈、人潮、燈條顏色 */
    apply({ stagger = true } = {}) {
      stalls.forEach((stall, i) => {
        const on = state.power && state.stalls[stall.info.id]
        if (stall.power.isOn !== on) stall.power.set(on, { delay: stagger ? i * 0.16 : 0, instant: reducedMotion })
      })
      if (streetPower.isOn !== state.power) streetPower.set(state.power, { delay: state.power && stagger ? stalls.length * 0.16 : 0, instant: reducedMotion })
      crowd.group.visible = state.crowd
      if (state.strip.color !== 'stall') stripColor.set(state.strip.color)
      _handlers.render()
    },
    usePreset(id: PresetId) {
      Object.assign(state, structuredClone(PRESETS[id]))
      // 開市、派對、微醺：所有攤位都開
      if (id !== 'close') for (const key in state.stalls) state.stalls[key] = true
      state.preset = id
      _actions.apply()
    },
    // 手動調整任何設定 → 不再屬於某個情境
    change(update: () => void) {
      update()
      state.preset = null
      _actions.apply({ stagger: false })
    },
    toggleStall(id: string) {
      if (!state.power) {
        _handlers.showToast('總電源已關閉，先打開總電源')
        return
      }
      _actions.change(() => (state.stalls[id] = !state.stalls[id]))
    },
    async toggleSound() {
      try {
        if (state.sound) ambience.stop()
        else await ambience.start()
        state.sound = !state.sound
      } catch (error) {
        console.error(error)
        _handlers.showToast('無法播放聲音')
      }
      _handlers.render()
    },
  }

  // ── 6. UI 入口事件 ──
  const click = {
    onPreset(event: Event) {
      const id = (event.target as HTMLElement).closest<HTMLElement>('[data-preset]')?.dataset.preset as PresetId | undefined
      if (id) _actions.usePreset(id)
    },
    onMode(event: Event) {
      const mode = (event.target as HTMLElement).closest<HTMLElement>('[data-mode]')?.dataset.mode as StripMode | undefined
      if (mode) _actions.change(() => (state.strip.mode = mode))
    },
    onColor(event: Event) {
      const color = (event.target as HTMLElement).closest<HTMLElement>('[data-color]')?.dataset.color
      if (color) _actions.change(() => (state.strip.color = color))
    },
    onBulbs(event: Event) {
      const mode = (event.target as HTMLElement).closest<HTMLElement>('[data-bulbs]')?.dataset.bulbs as BulbMode | undefined
      if (mode) _actions.change(() => (state.bulbs = mode))
    },
    onPointerDown(event: PointerEvent) {
      pointerDown.x = event.clientX
      pointerDown.y = event.clientY
    },
    onPointerUp(event: PointerEvent) {
      // 拖曳旋轉視角不算點擊
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 6) return
      const id = _handlers.pickStall(event)
      if (id) _actions.toggleStall(id)
    },
    onPointerMove(event: PointerEvent) {
      if (event.pointerType === 'touch' || event.buttons) return
      const id = _handlers.pickStall(event)
      refs.label.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 14}px)`
      refs.label.hidden = !id
      if (id === state.hovered) return
      state.hovered = id
      refs.stage.style.cursor = id ? 'pointer' : 'grab'
      _handlers.render()
    },
  }

  refs.presets.addEventListener('click', click.onPreset)
  refs.modes.addEventListener('click', click.onMode)
  refs.colors.addEventListener('click', click.onColor)
  refs.bulbs.addEventListener('click', click.onBulbs)
  refs.customColor.addEventListener('input', () => _actions.change(() => (state.strip.color = refs.customColor.value)))
  refs.speed.addEventListener('input', () => _actions.change(() => (state.strip.speed = +refs.speed.value)))
  refs.dimmer.addEventListener('input', () => _actions.change(() => (state.dimmer = +refs.dimmer.value)))
  refs.bloom.addEventListener('input', () => _actions.change(() => (state.bloom = +refs.bloom.value)))
  refs.haze.addEventListener('input', () => _actions.change(() => (state.haze = +refs.haze.value)))
  refs.ambient.addEventListener('input', () => _actions.change(() => (state.ambient = +refs.ambient.value)))
  refs.power.addEventListener('click', () => _actions.change(() => (state.power = !state.power)))
  refs.crowd.addEventListener('click', () => _actions.change(() => (state.crowd = !state.crowd)))
  refs.sound.addEventListener('click', () => _actions.toggleSound())
  refs.fullscreen.addEventListener('click', () => stage.toggleFullscreen(refs.app).catch(() => _handlers.showToast('此瀏覽器不支援全螢幕')))
  refs.consoleToggle.addEventListener('click', () => {
    state.consoleOpen = !state.consoleOpen
    _handlers.render()
  })
  refs.stage.addEventListener('pointerdown', click.onPointerDown)
  refs.stage.addEventListener('pointerup', click.onPointerUp)
  refs.stage.addEventListener('pointermove', click.onPointerMove)
  refs.stage.addEventListener('pointerleave', () => {
    refs.label.hidden = true
    state.hovered = null
  })

  // ── 7. 每幀更新 ──
  stage.onFrame((dt, time) => {
    updateStripUniforms(time, state.strip.speed, state.strip.mode)
    const globals = { dimmer: state.dimmer, mode: state.strip.mode, color: state.strip.color === 'stall' ? null : stripColor, speed: state.strip.speed, time }
    for (const stall of stalls) stall.update(dt, globals)

    streetPower.update(dt)
    const streetLevel = streetPower.level * state.dimmer
    stringLights.update(time, state.bulbs, streetLevel, state.strip.speed)
    gate.update(dt, time, streetLevel, state.strip.speed)
    crowd.update(dt, time)
    // 熱氣亮度跟著攤位燈：攤位平均亮度 × 總亮度
    const stallLight = stalls.reduce((sum, s) => sum + s.power.level, 0) / stalls.length
    steam.update(dt, state.power ? 1 : 0.3, Math.min(1, stallLight * state.dimmer))

    // 滑桿的值平滑套用，拖動時不會一跳一跳
    const ease = 1 - Math.exp(-dt * 6)
    stage.bloom.strength += (state.bloom - stage.bloom.strength) * ease
    fog.density += (0.012 + state.haze * 0.035 - fog.density) * ease
    baseLight.intensity += (state.ambient * 1.1 - baseLight.intensity) * ease
    fillLight.intensity += (state.ambient * 0.7 - fillLight.intensity) * ease
  })

  // ── 8. 開場：攤位依序閃爍點亮 ──
  _handlers.buildStallButtons()
  _actions.apply()

  if (import.meta.env.DEV) Object.assign(window, { __market: { stage, stalls, state, stringLights, gate, crowd } })
}
