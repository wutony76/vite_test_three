import './style.scss'
import { EditorialPortrait } from './EditorialPortrait'
import { computeEyeOffsets } from './eyeFollow'
import { PageFire } from './PageFire'
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
/** 全頁火焰層：噴火與燒痕畫在整頁最上層，標題、文字、照片都燒得到 */
const pageFire = new PageFire()
// 開發模式掛到 window，方便在 console／自動化測試裡看 coverage、isSpreading
if (import.meta.env.DEV) Object.assign(window, { __pageFire: pageFire })
pageFire.bindPortrait(
  () => portrait.getEyePagePositions(),
  () => portrait.pxPerUnit,
)
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
    setStatus(reducedMotion ? '靜態展示 · 減少動態偏好' : '移動滑鼠 · 眼神跟隨 · 按住 3 秒發射雷射眼 · 放開停止 · 雙擊還原（自燃中無法操作）')
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

/**
 * 按住發射雷射眼：
 * 1. 按住滑鼠左鍵 HOLD_MS（3 秒）→ 眼睛發射雷射、落點開始燒（整頁都能燒）
 *    最後 CHARGE_MS 眼睛逐漸發紅（蓄力）；不到 3 秒放開 → 取消
 * 2. 發射中必須一直按住；拖動時雷射與火跟著走、沿路燒出軌跡，停在原地火圈越燒越大
 * 3. 放開 → 雷射與火立刻消失，接著「自然判定」：燒黑面積 > 畫面 10% 就開始自燃
 */
const HOLD_MS = 3000
const CHARGE_MS = 1000

const hold = {
  /** 左鍵是否按著、從什麼時候開始按 */
  down: false,
  since: 0,
  /** 最新的指標位置（client 座標） */
  x: 0,
  y: 0,
  firing: false,
  /** 剛發射過：放開時瀏覽器會補送一個 click，要吞掉（不然按著連結 3 秒放開會跳頁） */
  swallowNextClick: false,
}

/** client 座標 → 頁面座標（含捲動）：燒痕存頁面座標，捲動時才會黏在內容上 */
const toPage = (clientX: number, clientY: number) => ({ x: clientX + window.scrollX, y: clientY + window.scrollY })

/** 自燃中、還沒燒光：這段期間所有點擊無效，也不能發射（火停不下來） */
const isLocked = () => pageFire.isSpreading && !pageFire.spreadDone

const startFire = () => {
  hold.firing = true
  hold.swallowNextClick = true
  portrait.setFiring(true)
  pageFire.start(toPage(hold.x, hold.y))
  // 發射中禁止反白文字：拖動時不然會一路把文字選起來
  document.documentElement.classList.add('is-lasering')
  window.getSelection()?.removeAllRanges()
}

/** 放開（或視窗失焦、指標被取消）：停止發射、取消蓄力，並馬上做一次自燃判定 */
const release = () => {
  hold.down = false
  portrait.setCharge(0)
  if (!hold.firing) return
  hold.firing = false
  pageFire.stop()
  portrait.setFiring(false)
  document.documentElement.classList.remove('is-lasering')
  pageFire.evaluateSpreadSoon()
}

const tickHold = () => {
  requestAnimationFrame(tickHold)
  // 自燃中、或已經整頁燒光（等雙擊還原）：都不能蓄力發射
  if (pageFire.isSpreading || reducedMotion || !hold.down || hold.firing || !portrait.getManifest()) return
  const held = performance.now() - hold.since
  portrait.setCharge((held - (HOLD_MS - CHARGE_MS)) / CHARGE_MS)
  if (held >= HOLD_MS) startFire()
}
requestAnimationFrame(tickHold)

window.addEventListener(
  'pointerdown',
  (event) => {
    onPointer(event.clientX, event.clientY)
    hold.x = event.clientX
    hold.y = event.clientY
    // 只認左鍵（右鍵、中鍵不觸發）；自燃中按了也沒用
    if (event.button !== 0 || isLocked()) return
    hold.down = true
    hold.since = performance.now()
  },
  { passive: true },
)

window.addEventListener(
  'pointermove',
  (event) => {
    onPointer(event.clientX, event.clientY)
    hold.x = event.clientX
    hold.y = event.clientY
    // 發射中：雷射與火跟著指標走
    if (hold.firing) pageFire.moveTo(toPage(event.clientX, event.clientY))
  },
  { passive: true },
)

// 放開的各種情況：正常放開、指標被系統取消（例如觸控被當成捲動）、切走視窗
window.addEventListener('pointerup', release)
window.addEventListener('pointercancel', release)
window.addEventListener('blur', release)

// 按著連結拖動會觸發瀏覽器原生的拖放，拖放一開始就不再送 pointermove → 蓄力或發射中禁止拖放
document.addEventListener('dragstart', (event) => {
  if (hold.down) event.preventDefault()
})

// 捲動時指標在頁面上的位置其實變了：發射中要更新落點
window.addEventListener(
  'scroll',
  () => {
    if (hold.firing) pageFire.moveTo(toPage(hold.x, hold.y))
  },
  { passive: true },
)

const swallow = (event: Event) => {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * 點擊規則（capture 階段攔截，點到連結時不要順便跳頁）：
 * - 自燃中：點擊完全無效
 * - 剛發射完放開的那一下 click：吞掉
 */
document.addEventListener(
  'click',
  (event) => {
    if (isLocked()) return swallow(event)
    if (!hold.swallowNextClick) return
    hold.swallowNextClick = false
    swallow(event)
  },
  { capture: true },
)
// 放開後如果瀏覽器沒有補送 click（例如放開時已經在別的元素上），下一次正常的點擊不能被吞掉
window.addEventListener('pointerdown', () => {
  if (!hold.firing) hold.swallowNextClick = false
}, { capture: true })

document.addEventListener('dblclick', (event) => {
  // 自燃中雙擊也無效；整頁燒光之後才能雙擊還原
  if (isLocked()) return swallow(event)
  pageFire.clear()
  // 雙擊會順便反白文字，還原時一起取消
  window.getSelection()?.removeAllRanges()
})

document.addEventListener('visibilitychange', () => {
  portrait.setPaused(document.hidden)
})

window.addEventListener('beforeunload', () => {
  portrait.dispose()
  pageFire.dispose()
})