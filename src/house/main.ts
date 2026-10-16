// 3D 店面導覽頁進入點：串接 Stage（怎麼看）、World（有什麼）與頁面 UI
import './style.scss'
import * as THREE from 'three'
import { Stage } from './Stage'
import { World } from './World'
import { HOTSPOTS } from './hotspots'
import { Ambience } from './ambience'

// ── 1. DOM ──
const $ = <T extends HTMLElement = HTMLElement>(ref: string) => document.querySelector<T>(`[data-ref="${ref}"]`)!
const refs = {
  app: $('app'),
  stage: $('stage'),
  home: $<HTMLButtonElement>('home'),
  rain: $<HTMLButtonElement>('rain'),
  sound: $<HTMLButtonElement>('sound'),
  daynight: $<HTMLButtonElement>('daynight'),
  listToggle: $<HTMLButtonElement>('listToggle'),
  list: $('list'),
  listItems: $('listItems'),
  label: $('label'),
  card: $('card'),
  cardClose: $<HTMLButtonElement>('cardClose'),
  cardIndex: $('cardIndex'),
  cardTitle: $('cardTitle'),
  cardBody: $('cardBody'),
  cardMeta: $('cardMeta'),
  prev: $<HTMLButtonElement>('prev'),
  next: $<HTMLButtonElement>('next'),
  loader: $('loader'),
  loaderText: $('loaderText'),
  loaderBar: $('loaderBar'),
  hint: $('hint'),
  fullscreen: $<HTMLButtonElement>('fullscreen'),
  toast: $('toast'),
}

// ── 2. 狀態 ──
const state = {
  status: 'building' as 'building' | 'ready' | 'unsupported',
  progress: 0,
  isNight: true,
  isRaining: false,
  soundOn: false,
  listOpen: false,
  hintVisible: true,
  hovered: null as string | null, // 滑鼠指著的物品
  selected: null as string | null, // 正在看介紹卡的物品
  toast: '',
}

const DRAG_THRESHOLD = 6
const pointerDown = { x: 0, y: 0 }
let toastTimer = 0

// ── 3. 檢查 WebGL ──
function isWebGLAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2'))
  } catch {
    return false
  }
}

if (!isWebGLAvailable()) {
  state.status = 'unsupported'
  refs.loaderText.textContent = '您的瀏覽器不支援 WebGL 2，無法顯示 3D 場景。請改用最新版 Chrome、Safari 或 Edge。'
  refs.loaderBar.parentElement!.hidden = true
} else {
  init()
}

function init() {
  const stage = new Stage(refs.stage)
  const world = new World(stage.scene)
  const ambience = new Ambience()
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  // 所有可點擊物件（射線只檢測這些，不檢測地面、天空）
  const hotspotObjects = [...world.hotspots.values()].flat()
  // 每個物品標籤的位置（物品頂端上方一點），搭建完成後計算
  const anchors = new Map<string, THREE.Vector3>()
  const projected = new THREE.Vector3()

  // ── 4. 私有工具方法 ──
  const _handlers = {
    // 射線打到的物件 → 往上找父物件，直到找到標記了 hotspot 的那一層
    pick(event: PointerEvent) {
      const rect = refs.stage.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, stage.camera)
      // 第二個參數 true：連子物件一起檢測（物品都是由很多小零件組成的）
      const hit = raycaster.intersectObjects(hotspotObjects, true)[0]
      let object: THREE.Object3D | null = hit?.object ?? null
      while (object && !object.userData.hotspot) object = object.parent
      return (object?.userData.hotspot as string | undefined) ?? null
    },
    computeAnchors() {
      for (const [id, objects] of world.hotspots) {
        const box = new THREE.Box3()
        for (const object of objects) box.expandByObject(object)
        const center = box.getCenter(new THREE.Vector3())
        anchors.set(id, new THREE.Vector3(center.x, box.max.y + 0.35, center.z))
      }
    },
    // 外框：優先顯示滑鼠指著的，否則顯示正在看的
    syncOutline() {
      const id = state.hovered ?? state.selected
      stage.outline.selectedObjects = id ? (world.hotspots.get(id) ?? []) : []
    },
    // 每幀把 3D 位置投影到螢幕，移動 HTML 標籤
    updateLabel() {
      const anchor = state.hovered ? anchors.get(state.hovered) : undefined
      if (!anchor) {
        refs.label.hidden = true
        return
      }
      // project()：3D 世界座標 → NDC（-1 ~ 1），再換算成像素
      projected.copy(anchor).project(stage.camera)
      refs.label.hidden = projected.z > 1 // 在攝影機背後
      refs.label.style.transform = `translate(${((projected.x + 1) / 2) * refs.stage.clientWidth}px, ${((1 - projected.y) / 2) * refs.stage.clientHeight}px) translate(-50%, -100%)`
    },
    showToast(message: string) {
      state.toast = message
      window.clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => {
        state.toast = ''
        _handlers.render()
      }, 2600)
      _handlers.render()
    },
    buildList() {
      refs.listItems.replaceChildren(
        ...HOTSPOTS.map((item, i) => {
          const li = document.createElement('li')
          const button = document.createElement('button')
          button.type = 'button'
          button.dataset.id = item.id
          button.innerHTML = `<span>${String(i + 1).padStart(2, '0')}</span>`
          button.append(item.title)
          button.addEventListener('click', () => _actions.select(item.id))
          li.append(button)
          return li
        }),
      )
    },
    render() {
      const ready = state.status === 'ready'
      // 搭建進度
      refs.loader.hidden = ready
      refs.loaderText.textContent = `搭建店面中… ${Math.round(state.progress * 100)}%`
      refs.loaderBar.style.width = `${state.progress * 100}%`

      // 工具列
      for (const button of [refs.home, refs.rain, refs.sound, refs.daynight, refs.listToggle]) button.disabled = !ready
      refs.rain.setAttribute('aria-pressed', String(state.isRaining))
      refs.sound.setAttribute('aria-pressed', String(state.soundOn))
      refs.daynight.setAttribute('aria-label', state.isNight ? '切換白天' : '切換夜晚')
      refs.daynight.title = refs.daynight.getAttribute('aria-label')!
      refs.app.classList.toggle('is-day', !state.isNight)
      refs.listToggle.setAttribute('aria-expanded', String(state.listOpen))
      refs.list.hidden = !state.listOpen
      for (const button of refs.listItems.querySelectorAll<HTMLButtonElement>('button')) {
        button.setAttribute('aria-current', String(button.dataset.id === state.selected))
      }

      // 介紹卡
      const index = HOTSPOTS.findIndex((item) => item.id === state.selected)
      const info = HOTSPOTS[index]
      refs.card.hidden = !info
      if (info) {
        refs.cardIndex.textContent = `${String(index + 1).padStart(2, '0')} / ${HOTSPOTS.length}`
        refs.cardTitle.textContent = info.title
        refs.cardBody.textContent = info.body
        refs.cardMeta.textContent = info.meta
      }

      // 標籤文字（位置在 updateLabel 每幀更新）
      refs.label.textContent = HOTSPOTS.find((item) => item.id === state.hovered)?.title ?? ''

      refs.hint.classList.toggle('is-hidden', !state.hintVisible || !ready)
      refs.toast.textContent = state.toast
      refs.toast.classList.toggle('is-visible', Boolean(state.toast))
    },
  }

  // ── 5. 業務流程 ──
  const _actions = {
    select(id: string) {
      const objects = world.hotspots.get(id)
      if (!objects) return
      state.selected = id
      state.listOpen = false
      state.hintVisible = false
      stage.flyTo(stage.poseFor(objects))
      // 網址加上 #id：可以直接分享「看貓」的連結
      history.replaceState(null, '', `#${id}`)
      _handlers.syncOutline()
      _handlers.render()
    },
    closeCard() {
      if (!state.selected) return
      state.selected = null
      history.replaceState(null, '', location.pathname + location.search)
      _handlers.syncOutline()
      _handlers.render()
    },
    step(offset: number) {
      const index = HOTSPOTS.findIndex((item) => item.id === state.selected)
      const next = HOTSPOTS[(index + offset + HOTSPOTS.length) % HOTSPOTS.length]
      _actions.select(next.id)
    },
    async toggleSound() {
      try {
        if (state.soundOn) ambience.stop()
        else {
          ambience.setRain(state.isRaining ? 1 : 0)
          await ambience.start()
        }
        state.soundOn = !state.soundOn
      } catch (error) {
        console.error(error)
        _handlers.showToast('無法播放聲音')
      }
      _handlers.render()
    },
  }

  // ── 6. UI 入口事件 ──
  const click = {
    onPointerDown(event: PointerEvent) {
      pointerDown.x = event.clientX
      pointerDown.y = event.clientY
      if (state.hintVisible) {
        state.hintVisible = false
        _handlers.render()
      }
    },
    onPointerUp(event: PointerEvent) {
      if (state.status !== 'ready') return
      // 拖曳旋轉視角，不算點擊
      if (Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > DRAG_THRESHOLD) return
      const id = _handlers.pick(event)
      if (id) _actions.select(id)
      else _actions.closeCard()
    },
    onPointerMove(event: PointerEvent) {
      // 觸控沒有「指向」；拖曳中也不檢測（省效能）
      if (state.status !== 'ready' || event.pointerType === 'touch' || event.buttons) return
      const id = _handlers.pick(event)
      if (id === state.hovered) return
      state.hovered = id
      refs.stage.style.cursor = id ? 'pointer' : 'grab'
      _handlers.syncOutline()
      _handlers.render()
    },
    onPointerLeave() {
      state.hovered = null
      _handlers.syncOutline()
      _handlers.render()
    },
    onHome() {
      _actions.closeCard()
      stage.goHome()
    },
    onRain() {
      state.isRaining = !state.isRaining
      world.setRaining(state.isRaining)
      ambience.setRain(state.isRaining ? 1 : 0)
      _handlers.render()
    },
    onDayNight() {
      state.isNight = !state.isNight
      world.setNight(state.isNight)
      _handlers.render()
    },
    onListToggle() {
      state.listOpen = !state.listOpen
      _handlers.render()
    },
    onFullscreen() {
      stage.toggleFullscreen(refs.app).catch(() => _handlers.showToast('此瀏覽器不支援全螢幕'))
    },
    onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (state.listOpen) state.listOpen = false
      else _actions.closeCard()
      _handlers.render()
    },
  }

  refs.stage.addEventListener('pointerdown', click.onPointerDown)
  refs.stage.addEventListener('pointerup', click.onPointerUp)
  refs.stage.addEventListener('pointermove', click.onPointerMove)
  refs.stage.addEventListener('pointerleave', click.onPointerLeave)
  refs.home.addEventListener('click', click.onHome)
  refs.rain.addEventListener('click', click.onRain)
  refs.sound.addEventListener('click', () => _actions.toggleSound())
  refs.daynight.addEventListener('click', click.onDayNight)
  refs.listToggle.addEventListener('click', click.onListToggle)
  refs.cardClose.addEventListener('click', () => _actions.closeCard())
  refs.prev.addEventListener('click', () => _actions.step(-1))
  refs.next.addEventListener('click', () => _actions.step(1))
  refs.fullscreen.addEventListener('click', click.onFullscreen)
  window.addEventListener('keydown', click.onKeyDown)

  // ── 7. 每幀更新 ──
  stage.onFrame((dt, elapsed) => {
    world.update(dt, elapsed)
    stage.bloom.strength = world.bloomStrength
    if (world.shadowsDirty) {
      stage.requestShadowUpdate()
      world.shadowsDirty = false
    }
    _handlers.updateLabel()
  })

  // ── 8. 開場搭建動畫 ──
  world.onBuildProgress = (ratio) => {
    state.progress = ratio
    if (ratio === 1 && state.status === 'building') {
      state.status = 'ready'
      _handlers.computeAnchors()
      // 網址帶 #cats 這類 id → 搭好後直接打開該物品
      const fromHash = location.hash.slice(1)
      if (world.hotspots.has(fromHash)) _actions.select(fromHash)
    }
    _handlers.render()
  }
  _handlers.buildList()
  _handlers.render()
  world.startBuild(window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  // 開發模式掛到 window 方便除錯（正式 build 會移除）
  if (import.meta.env.DEV) Object.assign(window, { __house: { stage, world, state } })
}
