// 互動粒子網頁：HTML 內容正常捲動，背景粒子跟著捲動變形、跟著滑鼠互動
import './style.scss'
import * as THREE from 'three'
import { ParticleField, type Palette } from './ParticleField'

// ── 1. 每一段的設定：變形目標、配色、粒子群組位置（桌機） ──
type SectionConfig = { morph: number; palette: Palette; x: number; y: number; opacity: number }
const SECTIONS: SectionConfig[] = [
  { morph: 0, palette: ['#7cf7ff', '#a77bff'], x: 0, y: 0, opacity: 0.55 }, // 球體（文字疊在上面 → 粒子淡一點）
  { morph: 1, palette: ['#ff7aa8', '#ffb86b'], x: 1.8, y: 0, opacity: 0.85 }, // 環面結（文字在左 → 粒子在右）
  { morph: 2, palette: ['#5eead4', '#3b82f6'], x: -2.3, y: -0.4, opacity: 0.85 }, // 波浪（文字在右 → 粒子在左）
  { morph: 3, palette: ['#fde047', '#f97316'], x: 0, y: 0.9, opacity: 0.9 }, // 文字（說明在下方）
  { morph: 3, palette: ['#a5b4fc', '#f0abfc'], x: 0, y: 1.9, opacity: 0.3 }, // 範例清單：粒子變淡退到後面
]

// ── 2. DOM ──
const $ = <T extends HTMLElement = HTMLElement>(ref: string) => document.querySelector<T>(`[data-ref="${ref}"]`)!
const refs = {
  scene: $('scene'),
  progress: $('progress'),
  dots: $('dots'),
  start: $<HTMLButtonElement>('start'),
  fallback: $('fallback'),
  sections: [...document.querySelectorAll<HTMLElement>('[data-section]')],
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const isSmallScreen = () => window.innerWidth < 760

// ── 3. 狀態 ──
const state = {
  section: 0,
  // 捲到第幾段（可以是小數，例如 1.5 = 第 1、2 段中間）
  scrollSection: 0,
  pointer: new THREE.Vector2(),
  lastPointerMove: 0,
}

// ── 4. 私有工具方法（不需要 3D 的部分） ──
const _handlers = {
  buildDots() {
    refs.dots.replaceChildren(
      ...refs.sections.map((section, i) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.setAttribute('aria-label', `第 ${i + 1} 段：${section.querySelector('h1, h2')?.textContent ?? ''}`)
        button.addEventListener('click', () => click.onNav(i))
        return button
      }),
    )
  },
  scrollToSection(index: number) {
    refs.sections[index]?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
  },
  // 依捲動位置更新進度條、導覽點
  syncScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight
    const progress = max > 0 ? window.scrollY / max : 0
    state.scrollSection = window.scrollY / window.innerHeight
    state.section = Math.min(Math.round(state.scrollSection), SECTIONS.length - 1)
    refs.progress.style.transform = `scaleX(${progress})`
    refs.dots.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-current', String(i === state.section)))
  },
  // 段落進入畫面時淡入（IntersectionObserver：元素進出畫面時通知，不用每次捲動都計算）
  observeReveal() {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('is-visible')),
      { threshold: 0.35 },
    )
    refs.sections.forEach((section) => observer.observe(section))
  },
}

// ── 5. UI 入口事件 ──
const click = {
  onNav(index: number) {
    _handlers.scrollToSection(index)
  },
  onStart() {
    _handlers.scrollToSection(1)
  },
}

refs.start.addEventListener('click', click.onStart)
window.addEventListener('scroll', _handlers.syncScroll, { passive: true })
_handlers.buildDots()
_handlers.observeReveal()
_handlers.syncScroll()

// ── 6. 3D ──
function isWebGLAvailable() {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'))
  } catch {
    return false
  }
}

if (isWebGLAvailable()) initScene()
else refs.fallback.hidden = false

function initScene() {
  // 小螢幕或核心數少的裝置：粒子減半
  const count = isSmallScreen() || navigator.hardwareConcurrency <= 4 ? 12000 : 24000
  const pixelRatio = Math.min(window.devicePixelRatio, 2)

  // alpha：背景透明，由 CSS 提供深色漸層
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(pixelRatio)
  refs.scene.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50)
  camera.position.set(0, 0, 7)

  const field = new ParticleField(count, pixelRatio)
  field.setPalette(SECTIONS[0].palette, true)
  // 外層 group 負責位置與旋轉，粒子本身的形狀由 Shader 處理
  const group = new THREE.Group()
  group.add(field.points)
  scene.add(group)

  // 滑鼠位置換算成 3D：從攝影機射出射線，打到 z = 0 的平面
  const raycaster = new THREE.Raycaster()
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  const hit = new THREE.Vector3()
  const pointerToWorld = (event: PointerEvent | MouseEvent) => {
    state.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1)
    raycaster.setFromCamera(state.pointer, camera)
    return raycaster.ray.intersectPlane(plane, hit)
  }

  // 內容疊在 canvas 上面會擋住事件 → 監聽整個 window
  window.addEventListener('pointermove', (event) => {
    field.setMouse(pointerToWorld(event))
    state.lastPointerMove = performance.now()
  })
  window.addEventListener('click', (event) => {
    // 點連結、按鈕時不產生漣漪
    if (reducedMotion || (event.target as HTMLElement).closest('a, button')) return
    const point = pointerToWorld(event)
    if (point) field.ripple(point)
  })

  const resize = () => {
    const { innerWidth: width, innerHeight: height } = window
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    // 直式手機畫面窄，文字形狀會超出 → 依畫面比例縮小
    group.scale.setScalar(THREE.MathUtils.clamp(camera.aspect / 1.25, 0.36, 1))
  }
  window.addEventListener('resize', resize)
  resize()

  // 依捲動位置（可能在兩段之間）算出目前的設定值
  const blendSection = () => {
    const i = Math.min(Math.floor(state.scrollSection), SECTIONS.length - 1)
    const next = Math.min(i + 1, SECTIONS.length - 1)
    const t = THREE.MathUtils.clamp(state.scrollSection - i, 0, 1)
    const lerp = (key: 'morph' | 'x' | 'y' | 'opacity') => THREE.MathUtils.lerp(SECTIONS[i][key], SECTIONS[next][key], t)
    return { morph: lerp('morph'), x: lerp('x'), y: lerp('y'), opacity: lerp('opacity') }
  }

  const timer = new THREE.Timer()
  timer.connect(document)
  let spin = 0
  const tilt = new THREE.Vector2()

  renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp)
    const dt = Math.min(timer.getDelta(), 0.1)
    const elapsed = timer.getElapsed()
    const small = isSmallScreen()

    const target = blendSection()
    field.targetMorph = target.morph
    field.setPalette(SECTIONS[state.section].palette)
    const mouseActive = !small && performance.now() - state.lastPointerMove < 1200
    field.update(dt, elapsed, mouseActive, reducedMotion)
    field.setOpacity(target.opacity)

    // 群組位置：手機時文字在下方，粒子固定在畫面上半部
    const ease = 1 - Math.exp(-dt * 3)
    group.position.x += ((small ? 0 : target.x) - group.position.x) * ease
    group.position.y += ((small ? 1.1 : target.y) - group.position.y) * ease

    // 旋轉：一般時慢慢自轉；變成文字時轉回正面（否則字會是反的）
    if (!reducedMotion) spin += dt * 0.15
    const textness = THREE.MathUtils.clamp(field.morph - 2, 0, 1)
    // 角度換算到 -π ~ π，轉回正面時最多只轉半圈
    const angle = THREE.MathUtils.euclideanModulo(spin + Math.PI, Math.PI * 2) - Math.PI
    // 波浪是水平的平面，往前傾才看得到起伏
    const waveness = Math.max(0, 1 - Math.abs(field.morph - 2))
    // 滑鼠視差：整群跟著滑鼠微微傾斜
    tilt.x += (state.pointer.y * 0.2 - tilt.x) * ease
    tilt.y += (state.pointer.x * 0.3 - tilt.y) * ease
    group.rotation.set(waveness * 0.55 - tilt.x, angle * (1 - textness) + tilt.y, 0)

    renderer.render(scene, camera)
  })

  // 開發模式掛到 window 方便除錯（正式 build 會移除）
  if (import.meta.env.DEV) Object.assign(window, { __web: { field, group, state, renderer } })
}
