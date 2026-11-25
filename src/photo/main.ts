// 照片 → Three.js 3D 浮雕網格（內建示範照，免上傳）
import './style.scss'
import { PORTRAIT_EFFECTS, type PortraitEffect } from '../particlePortrait/effects'
import { type OrbitView, ParticlePortrait } from '../particlePortrait/ParticlePortrait'

const ORBIT_VIEWS: { id: OrbitView; label: string }[] = [
  { id: 'front', label: '正面' },
  { id: 'threeQuarter', label: '斜視' },
  { id: 'left', label: '左側' },
  { id: 'right', label: '右側' },
  { id: 'top', label: '俯視' },
]

const $ = <T extends HTMLElement = HTMLElement>(ref: string) => document.querySelector<T>(`[data-ref="${ref}"]`)!

const refs = {
  app: document.querySelector<HTMLDivElement>('#app')!,
  photoLabel: $('photoLabel'),
  photoSize: $('photoSize'),
  controls: $('controls'),
  views: $<HTMLDivElement>('views'),
  effects: $<HTMLDivElement>('effects'),
  effectHint: $('effectHint'),
  alpha: $<HTMLInputElement>('alpha'),
  alphaVal: $('alphaVal'),
  reliefDepth: $<HTMLInputElement>('reliefDepth'),
  reliefDepthVal: $('reliefDepthVal'),
  reliefGrid: $<HTMLInputElement>('reliefGrid'),
  reliefGridVal: $('reliefGridVal'),
  edgeBoost: $<HTMLInputElement>('edgeBoost'),
  edgeBoostVal: $('edgeBoostVal'),
  wireframe: $<HTMLInputElement>('wireframe'),
  autoRotate: $<HTMLInputElement>('autoRotate'),
  rebuild: $<HTMLButtonElement>('rebuild'),
  swapPhoto: $<HTMLButtonElement>('swapPhoto'),
  file: $<HTMLInputElement>('file'),
  status: $('status'),
  error: $('error'),
}

if (!ParticlePortrait.isWebGLAvailable()) {
  refs.error.hidden = false
  throw new Error('WebGL2 unavailable')
}

const DEFAULT_PHOTO_URL = `${import.meta.env.BASE_URL}photo/default.png`

const portrait = new ParticlePortrait(refs.app, {
  renderMode: 'mesh',
  effect: 'cyber',
  reliefDepth: Number(refs.reliefDepth.value),
  reliefGrid: Number(refs.reliefGrid.value),
  edgeBoost: Number(refs.edgeBoost.value),
  alphaThreshold: Number(refs.alpha.value),
  wireframe: refs.wireframe.checked,
  autoRotate: true,
})

let activeView: OrbitView = 'threeQuarter'
let currentImage: HTMLImageElement | null = null
let hasModel = false
let rebuildTimer = 0
let rebuildInFlight = false
let pendingRebuild = false

const ui = {
  effect: 'cyber' as PortraitEffect,
  alphaThreshold: Number(refs.alpha.value),
  reliefDepth: Number(refs.reliefDepth.value),
  reliefGrid: Number(refs.reliefGrid.value),
  edgeBoost: Number(refs.edgeBoost.value),
  wireframe: refs.wireframe.checked,
  autoRotate: refs.autoRotate.checked,
}

const setStatus = (text: string) => {
  refs.status.textContent = text
  refs.status.hidden = false
}

const syncViewButtons = () => {
  refs.views.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((btn) => {
    const on = btn.dataset.view === activeView
    btn.classList.toggle('is-active', on)
    btn.setAttribute('aria-pressed', String(on))
  })
}

const pickView = (view: OrbitView) => {
  activeView = view
  syncViewButtons()
  portrait.setOrbitView(view)
}

ORBIT_VIEWS.forEach(({ id, label }) => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'views__btn'
  btn.dataset.view = id
  btn.textContent = label
  btn.setAttribute('aria-pressed', 'false')
  btn.addEventListener('click', () => pickView(id))
  refs.views.appendChild(btn)
})

const syncEffectButtons = () => {
  refs.effects.querySelectorAll<HTMLButtonElement>('[data-effect]').forEach((btn) => {
    const active = btn.dataset.effect === ui.effect
    btn.classList.toggle('is-active', active)
    btn.setAttribute('aria-pressed', String(active))
  })
  refs.effectHint.textContent = PORTRAIT_EFFECTS.find((e) => e.id === ui.effect)?.hint ?? ''
}

const applyLiveOptions = () => {
  portrait.applyOptions({
    effect: ui.effect,
    alphaThreshold: ui.alphaThreshold,
    reliefDepth: ui.reliefDepth,
    reliefGrid: ui.reliefGrid,
    edgeBoost: ui.edgeBoost,
    wireframe: ui.wireframe,
    autoRotate: ui.autoRotate,
  })
  syncEffectButtons()
}

const updateMeta = (label: string, image: HTMLImageElement) => {
  refs.photoLabel.textContent = label
  refs.photoSize.textContent = `${image.naturalWidth} × ${image.naturalHeight}`
}

const rebuild = async () => {
  if (!currentImage) return
  if (rebuildInFlight) {
    pendingRebuild = true
    return
  }
  rebuildInFlight = true
  portrait.applyOptions({
    alphaThreshold: ui.alphaThreshold,
    reliefDepth: ui.reliefDepth,
    reliefGrid: ui.reliefGrid,
    edgeBoost: ui.edgeBoost,
    effect: ui.effect,
  })
  try {
    const result = await portrait.setImage(currentImage)
    if (!result || result.reliefTriangles === 0) {
      setStatus('無法建立模型：請降低透明度門檻。')
      return
    }
    const effectLabel = PORTRAIT_EFFECTS.find((e) => e.id === ui.effect)?.label ?? ui.effect
    setStatus(
      `【${effectLabel}】${result.reliefTriangles.toLocaleString()} 面 · 可切換效果或拖曳旋轉`,
    )
    applyLiveOptions()
    if (!hasModel) {
      pickView('threeQuarter')
      hasModel = true
    }
  } finally {
    rebuildInFlight = false
    if (pendingRebuild) {
      pendingRebuild = false
      void rebuild()
    }
  }
}

const scheduleRebuild = () => {
  if (!currentImage || !hasModel) return
  window.clearTimeout(rebuildTimer)
  rebuildTimer = window.setTimeout(() => void rebuild(), 320)
}

const selectEffect = (effect: PortraitEffect) => {
  if (ui.effect === effect) return
  ui.effect = effect
  syncEffectButtons()
  scheduleRebuild()
}

PORTRAIT_EFFECTS.forEach((preset) => {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'effects__btn'
  btn.dataset.effect = preset.id
  btn.textContent = preset.label
  btn.setAttribute('aria-pressed', 'false')
  btn.addEventListener('click', () => selectEffect(preset.id))
  refs.effects.appendChild(btn)
})

const onImageReady = async (image: HTMLImageElement, label: string) => {
  currentImage = image
  updateMeta(label, image)
  await rebuild()
}

const loadImageUrl = (url: string, label: string) => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.onload = () => void onImageReady(image, label)
  image.onerror = () => setStatus('示範照片載入失敗。')
  image.src = url
}

const loadFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    setStatus('請選擇圖片檔案。')
    return
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.onload = async () => {
    hasModel = false
    await onImageReady(image, file.name)
    URL.revokeObjectURL(url)
  }
  image.onerror = () => {
    URL.revokeObjectURL(url)
    setStatus('無法讀取這張圖片。')
  }
  image.src = url
}

refs.swapPhoto.addEventListener('click', () => refs.file.click())
refs.file.addEventListener('change', () => {
  const file = refs.file.files?.[0]
  if (file) loadFile(file)
  refs.file.value = ''
})

const syncLabels = () => {
  refs.alphaVal.textContent = String(ui.alphaThreshold)
  refs.reliefDepthVal.textContent = ui.reliefDepth.toFixed(2)
  refs.reliefGridVal.textContent = String(ui.reliefGrid)
  refs.edgeBoostVal.textContent = ui.edgeBoost.toFixed(2)
}

const onControlInput = () => {
  ui.alphaThreshold = Number(refs.alpha.value)
  ui.reliefDepth = Number(refs.reliefDepth.value)
  ui.reliefGrid = Number(refs.reliefGrid.value)
  ui.edgeBoost = Number(refs.edgeBoost.value)
  ui.wireframe = refs.wireframe.checked
  ui.autoRotate = refs.autoRotate.checked
  syncLabels()
  applyLiveOptions()
}

refs.alpha.addEventListener('input', onControlInput)
refs.reliefDepth.addEventListener('input', onControlInput)
refs.reliefGrid.addEventListener('input', onControlInput)
refs.edgeBoost.addEventListener('input', onControlInput)
refs.wireframe.addEventListener('change', () => {
  onControlInput()
})
refs.autoRotate.addEventListener('change', onControlInput)

for (const el of [refs.alpha, refs.reliefDepth, refs.reliefGrid, refs.edgeBoost] as const) {
  el.addEventListener('change', scheduleRebuild)
}

refs.rebuild.addEventListener('click', () => void rebuild())

syncLabels()
syncViewButtons()
syncEffectButtons()
applyLiveOptions()

loadImageUrl(DEFAULT_PHOTO_URL, '內建示範照')

window.addEventListener('beforeunload', () => portrait.dispose())