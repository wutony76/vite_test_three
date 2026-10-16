// 燈光互動網頁：捲動切換光源、滑鼠控制光、點一下換顏色
import './style.scss'
import * as THREE from 'three'
import { LightStage, LIGHT_KEYS, type LightKey, type Weights } from './LightStage'

// ── 1. 每一段的設定：各光源權重、這段的主燈（點擊換它的顏色）、展台位置、光暈強度 ──
type SectionConfig = { weights: Partial<Weights>; main: LightKey; x: number; bloom: number }
const SECTIONS: SectionConfig[] = [
  { weights: { cursor: 1 }, main: 'cursor', x: 0, bloom: 0.5 },
  { weights: { rgb: 1 }, main: 'rgb', x: 1.6, bloom: 0.55 }, // 文字在左 → 展台在右
  { weights: { spot: 1 }, main: 'spot', x: -1.6, bloom: 0.5 },
  { weights: { area: 1 }, main: 'area', x: 1.6, bloom: 0.5 },
  { weights: { neon: 1 }, main: 'neon', x: -1.6, bloom: 1.25 },
  // 範例清單：所有燈都開但調暗，當作卡片後面的背景，不搶文字
  { weights: { cursor: 0.15, rgb: 0.25, spot: 0.2, area: 0, neon: 0.45 }, main: 'neon', x: 0, bloom: 0.6 },
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
  scrollSection: 0, // 可以是小數：1.5 = 第 1、2 段中間
  pointer: new THREE.Vector2(0.3, 0.2),
}

// ── 4. 私有工具方法 ──
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
  syncScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight
    state.scrollSection = window.scrollY / window.innerHeight
    state.section = Math.min(Math.round(state.scrollSection), SECTIONS.length - 1)
    refs.progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`
    refs.dots.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-current', String(i === state.section)))
  },
  observeReveal() {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('is-visible')),
      { threshold: 0.35 },
    )
    refs.sections.forEach((section) => observer.observe(section))
  },
  // 依捲動位置混合相鄰兩段的設定
  blend() {
    const i = Math.min(Math.floor(state.scrollSection), SECTIONS.length - 1)
    const next = Math.min(i + 1, SECTIONS.length - 1)
    const t = THREE.MathUtils.clamp(state.scrollSection - i, 0, 1)
    const weights = Object.fromEntries(
      LIGHT_KEYS.map((key) => [key, THREE.MathUtils.lerp(SECTIONS[i].weights[key] ?? 0, SECTIONS[next].weights[key] ?? 0, t)]),
    ) as Weights
    return {
      weights,
      x: THREE.MathUtils.lerp(SECTIONS[i].x, SECTIONS[next].x, t),
      bloom: THREE.MathUtils.lerp(SECTIONS[i].bloom, SECTIONS[next].bloom, t),
    }
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
if (document.createElement('canvas').getContext('webgl2')) initScene()
else refs.fallback.hidden = false

function initScene() {
  const small = isSmallScreen()
  // 手機：解析度降低、不開陰影
  const stage = new LightStage(refs.scene, Math.min(window.devicePixelRatio, small ? 1.25 : 1.5), !small)

  const resize = () => stage.resize(window.innerWidth, window.innerHeight)
  window.addEventListener('resize', resize)
  resize()

  // 內容疊在 canvas 上會擋住事件 → 監聽 window
  window.addEventListener('pointermove', (event) => {
    state.pointer.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1)
  })
  window.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a, button')) return
    stage.nextColor(SECTIONS[state.section].main)
  })

  const timer = new THREE.Timer()
  timer.connect(document)
  stage.renderer.setAnimationLoop((timestamp) => {
    timer.update(timestamp)
    const dt = Math.min(timer.getDelta(), 0.1)
    const target = _handlers.blend()
    const ease = 1 - Math.exp(-dt * 3)
    // 手機：文字在下方 → 展台往上移，出現在畫面上半部
    stage.display.position.x += ((isSmallScreen() ? 0 : target.x) - stage.display.position.x) * ease
    stage.display.position.y += ((isSmallScreen() ? 0.7 : 0) - stage.display.position.y) * ease
    stage.display.updateMatrixWorld()
    stage.setPointer(state.pointer)
    stage.bloom.strength += (target.bloom - stage.bloom.strength) * ease
    stage.update(dt, timer.getElapsed(), target.weights, reducedMotion)
  })

  if (import.meta.env.DEV) Object.assign(window, { __lights: { stage, state } })
}
