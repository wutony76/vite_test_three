// 商品 3D 展示頁進入點：把「檢視器」「模型載入」「商品資料」與頁面 UI 串起來
import './style.scss'
import { ProductViewer } from './ProductViewer'
import { loadProduct, type LoadedProduct } from './loadProduct'
import { product, type ProductVariant } from './products'

// ── 1. 取得 DOM ──
const $ = <T extends HTMLElement = HTMLElement>(ref: string) => document.querySelector<T>(`[data-ref="${ref}"]`)!
const refs = {
  brand: $('brand'),
  viewer: $('viewer'),
  canvasHost: $('canvasHost'),
  overlay: $('overlay'),
  loading: $('loading'),
  progressText: $('progressText'),
  progressBar: $('progressBar'),
  error: $('error'),
  errorText: $('errorText'),
  retry: $<HTMLButtonElement>('retry'),
  autoRotate: $<HTMLButtonElement>('autoRotate'),
  reset: $<HTMLButtonElement>('reset'),
  fullscreen: $<HTMLButtonElement>('fullscreen'),
  name: $('name'),
  price: $('price'),
  desc: $('desc'),
  variantLabel: $('variantLabel'),
  swatches: $('swatches'),
  sizes: $('sizes'),
  addToCart: $<HTMLButtonElement>('addToCart'),
  formMessage: $('formMessage'),
  creditLink: $<HTMLAnchorElement>('creditLink'),
  licenseLink: $<HTMLAnchorElement>('licenseLink'),
  toast: $('toast'),
}

// ── 2. 狀態 ──
// 網址帶 ?variant=midnight 時直接顯示該配色（可分享連結）；不認得的值退回第一個
const initialVariant =
  product.variants.find((variant) => variant.key === new URLSearchParams(location.search).get('variant')) ??
  product.variants[0]

const state = {
  // 模型載入三段狀態
  status: 'loading' as 'loading' | 'ready' | 'error',
  progress: null as number | null,
  errorMessage: '',
  canRetry: true,
  variant: initialVariant,
  size: null as string | null,
  autoRotate: true,
  // 加入購物車 loading
  isAdding: false,
  formMessage: '',
  toast: '',
}

let viewer: ProductViewer | null = null
let loaded: LoadedProduct | null = null
let toastTimer = 0

// ── 3. 私有工具方法 ──
const _handlers = {
  formatPrice(value: number) {
    return `NT$ ${value.toLocaleString('zh-TW')}`
  },
  // 依商品資料產生配色、尺寸按鈕（只建立一次，之後只更新狀態）
  buildOptions() {
    refs.swatches.replaceChildren(
      ...product.variants.map((variant) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'swatch'
        button.style.setProperty('--swatch', variant.swatch)
        button.dataset.key = variant.key
        button.title = variant.label
        button.setAttribute('aria-label', `配色：${variant.label}`)
        button.addEventListener('click', () => click.onVariant(variant))
        return button
      }),
    )
    refs.sizes.replaceChildren(
      ...product.sizes.map((size) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'size'
        button.textContent = size
        button.dataset.size = size
        button.addEventListener('click', () => click.onSize(size))
        return button
      }),
    )
  },
  // 把網址的 ?variant= 換成目前配色（replaceState：不新增瀏覽紀錄，上一頁不會一直切配色）
  syncUrl() {
    const url = new URL(location.href)
    url.searchParams.set('variant', state.variant.key)
    history.replaceState(null, '', url)
  },
  showToast(message: string) {
    state.toast = message
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => {
      state.toast = ''
      _handlers.render()
    }, 2500)
  },
  // 模擬加入購物車 API（真實專案改成 fetch）
  fakeCartApi(payload: { variant: string; size: string }) {
    return new Promise<typeof payload>((resolve) => setTimeout(() => resolve(payload), 600))
  },
  // 依 state 更新整個頁面（資料 → 畫面 單向流動）
  render() {
    const isReady = state.status === 'ready'

    // 載入 / 錯誤 覆蓋層
    refs.overlay.hidden = isReady
    refs.loading.hidden = state.status !== 'loading'
    refs.error.hidden = state.status !== 'error'
    refs.retry.hidden = !state.canRetry
    refs.errorText.textContent = state.errorMessage
    // 無法計算百分比時，進度條改成來回跑的動畫（indeterminate）
    const percent = state.progress === null ? null : Math.round(state.progress * 100)
    refs.progressText.textContent = percent === null ? '' : `${percent}%`
    refs.progressBar.classList.toggle('is-indeterminate', percent === null)
    refs.progressBar.style.width = percent === null ? '' : `${percent}%`

    // 工具列：模型還沒好時停用
    refs.autoRotate.disabled = refs.reset.disabled = refs.fullscreen.disabled = !isReady
    refs.autoRotate.setAttribute('aria-pressed', String(state.autoRotate))

    // 配色
    refs.variantLabel.textContent = state.variant.label
    for (const button of refs.swatches.querySelectorAll<HTMLButtonElement>('.swatch')) {
      button.setAttribute('aria-pressed', String(button.dataset.key === state.variant.key))
      button.disabled = !isReady
    }

    // 尺寸
    for (const button of refs.sizes.querySelectorAll<HTMLButtonElement>('.size')) {
      button.setAttribute('aria-pressed', String(button.dataset.size === state.size))
    }

    // 購物車
    refs.addToCart.disabled = state.isAdding
    refs.addToCart.textContent = state.isAdding ? '加入中…' : '加入購物車'
    refs.formMessage.textContent = state.formMessage

    // 提示
    refs.toast.textContent = state.toast
    refs.toast.classList.toggle('is-visible', Boolean(state.toast))
  },
}

// ── 4. 業務流程 ──
const _actions = {
  // 載入模型：loading → ready / error
  async loadModel() {
    if (!viewer) return
    state.status = 'loading'
    state.progress = 0
    state.errorMessage = ''
    _handlers.render()

    try {
      loaded = await loadProduct(product.modelUrl, (ratio) => {
        state.progress = ratio
        _handlers.render()
      })
      // 先套好配色再放進場景，避免一開始閃一下預設配色
      await loaded.applyVariant(state.variant.modelName)
      viewer.setModel(loaded.model)
      state.status = 'ready'
    } catch (error) {
      console.error(error)
      state.status = 'error'
      state.errorMessage = '3D 模型載入失敗，請檢查網路連線後重試。'
    } finally {
      _handlers.render()
    }
  },
  async applyVariant(variant: ProductVariant) {
    if (!loaded || !viewer) return
    state.variant = variant
    _handlers.syncUrl()
    _handlers.render()
    await loaded.applyVariant(variant.modelName)
    viewer.requestRender()
  },
  // 加入購物車：loading guard + early return + success / error
  async addToCart() {
    if (state.isAdding) return
    if (!state.size) {
      state.formMessage = '請先選擇尺寸'
      _handlers.render()
      return
    }

    state.isAdding = true
    state.formMessage = ''
    _handlers.render()
    try {
      const result = await _handlers.fakeCartApi({ variant: state.variant.label, size: state.size })
      _handlers.showToast(`已加入購物車：${product.name}（${result.variant}／${result.size}）`)
    } catch {
      state.formMessage = '加入購物車失敗，請稍後再試'
    } finally {
      state.isAdding = false
      _handlers.render()
    }
  },
}

// ── 5. UI 入口事件 ──
const click = {
  onVariant(variant: ProductVariant) {
    if (variant.key === state.variant.key) return
    _actions.applyVariant(variant)
  },
  onSize(size: string) {
    state.size = size
    state.formMessage = ''
    _handlers.render()
  },
  onAddToCart() {
    _actions.addToCart()
  },
  onRetry() {
    _actions.loadModel()
  },
  onAutoRotate() {
    state.autoRotate = !state.autoRotate
    viewer?.setAutoRotate(state.autoRotate)
    _handlers.render()
  },
  onReset() {
    viewer?.resetView()
  },
  onFullscreen() {
    // 部分瀏覽器（例如 iPhone Safari）不支援元素全螢幕，失敗時不影響其他功能
    viewer?.toggleFullscreen(refs.viewer).catch(() => _handlers.showToast('此瀏覽器不支援全螢幕'))
  },
}

refs.retry.addEventListener('click', click.onRetry)
refs.autoRotate.addEventListener('click', click.onAutoRotate)
refs.reset.addEventListener('click', click.onReset)
refs.fullscreen.addEventListener('click', click.onFullscreen)
refs.addToCart.addEventListener('click', click.onAddToCart)

// ── 6. 初始化 ──
refs.brand.textContent = product.brand
refs.name.textContent = product.name
refs.price.textContent = _handlers.formatPrice(product.price)
refs.desc.textContent = product.description
refs.creditLink.href = product.credit.href
refs.creditLink.textContent = product.credit.text
refs.licenseLink.href = product.credit.licenseHref
refs.licenseLink.textContent = product.credit.license
_handlers.buildOptions()

if (ProductViewer.isWebGLAvailable()) {
  viewer = new ProductViewer(refs.canvasHost)
  // 開發模式才掛到 window，方便在 DevTools 除錯；正式 build 會被移除
  if (import.meta.env.DEV) Object.assign(window, { __productViewer: viewer })
  _actions.loadModel()
} else {
  state.status = 'error'
  state.canRetry = false
  state.errorMessage = '您的瀏覽器不支援 WebGL，無法顯示 3D 商品。請改用最新版 Chrome、Safari 或 Edge。'
  _handlers.render()
}
