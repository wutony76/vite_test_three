import './style.scss'
import { EditorialPortrait } from './EditorialPortrait'
import { computeEyeOffsets } from './eyeFollow'
import type { PortraitManifest } from './types'
import { PORTRAIT_ASSET_BASE } from './types'

const stage = document.querySelector<HTMLElement>('[data-ref="stage"]')!
const statusEl = document.querySelector<HTMLElement>('[data-ref="status"]')!
const errorEl = document.querySelector<HTMLElement>('[data-ref="error"]')!

if (!EditorialPortrait.isWebGLAvailable()) {
  errorEl.hidden = false
  throw new Error('WebGL unavailable')
}

const portrait = new EditorialPortrait(stage)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const setStatus = (text: string) => {
  statusEl.textContent = text
}

const load = async () => {
  try {
    const manifestUrl = `${PORTRAIT_ASSET_BASE}/portrait.manifest.json`
    const res = await fetch(manifestUrl)
    if (!res.ok) throw new Error(`manifest ${res.status}`)
    const manifest = (await res.json()) as PortraitManifest
    await portrait.loadAssets(manifest, PORTRAIT_ASSET_BASE)
    setStatus(reducedMotion ? '靜態展示 · 減少動態偏好' : '移動滑鼠 · 眼神跟隨')
    const wrap = document.querySelector<HTMLElement>('.editorial__stage-wrap')
    if (wrap) {
      const r = wrap.getBoundingClientRect()
      onPointer(r.left + r.width * 0.65, r.top + r.height * 0.42)
    }
  } catch (err) {
    console.error(err)
    errorEl.hidden = false
    setStatus('載入失敗')
  }
}

void load()

const onPointer = (clientX: number, clientY: number) => {
  const manifest = portrait.getManifest()
  if (!manifest) return
  const { left, right } = computeEyeOffsets(
    clientX,
    clientY,
    portrait.getInteractionRect(),
    manifest,
    portrait.getLookLayout(),
    reducedMotion,
  )
  portrait.setLook(left, right)
}

const pointer = (event: PointerEvent) => {
  onPointer(event.clientX, event.clientY)
}

window.addEventListener('pointermove', pointer, { passive: true })
window.addEventListener('pointerdown', pointer, { passive: true })

document.addEventListener('visibilitychange', () => {
  portrait.setPaused(document.hidden)
})

window.addEventListener('beforeunload', () => portrait.dispose())