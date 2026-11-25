import { EMBED_READY } from '../shared/embed'

/**
 * 「下一頁」軟跳轉：自燃期間把下一頁偷偷載進全螢幕 iframe，燒光時直接切換顯示，
 * 網址用 history.pushState 換過去，不重新載入頁面 → 沒有任何閃爍或版面落差。
 *
 * 圖層：editorial 內容 < 這個 iframe（z 40）< 火焰層（z 50）
 * 燒的期間 iframe 用 clip-path 只露出燒穿的區域；燒光後拿掉 clip、開放操作。
 *
 * 為什麼用 clip-path 而不是 mask-image：
 * mask-image 每換一張圖（blob URL）瀏覽器都要重新載入，載入期間整層看不見；
 * clip-path: path(...) 只是一段文字，設定後下一幀就生效，不用載入任何東西。
 */
export class NextPage {
  readonly iframe: HTMLIFrameElement
  /** 下一頁真的準備好（3D 模型畫出來）時 resolve；逾時也會 resolve，不會卡住 */
  readonly ready: Promise<void>

  private readonly url: string
  private active = false

  constructor(url: string) {
    this.url = url
    this.iframe = document.createElement('iframe')
    this.iframe.src = url
    this.iframe.className = 'next-page'
    this.iframe.title = '下一頁'
    this.iframe.tabIndex = -1
    // 一開始什麼都不露出（空路徑 = 全部裁掉）
    this.iframe.style.clipPath = 'path("M0 0Z")'
    document.body.appendChild(this.iframe)

    this.ready = new Promise((resolve) => {
      const onMessage = (event: MessageEvent) => {
        if (event.source !== this.iframe.contentWindow || event.data?.type !== EMBED_READY) return
        window.removeEventListener('message', onMessage)
        resolve()
      }
      window.addEventListener('message', onMessage)
      // 保險：下一頁沒送通知（載入失敗等）也不要永遠等下去
      setTimeout(resolve, 10000)
    })

    // iframe 裡的連結（例如「← 練習首頁」）要讓整個分頁跳轉，而不是只在 iframe 裡換頁
    this.iframe.addEventListener('load', () => {
      const doc = this.iframe.contentDocument
      if (!doc || doc.querySelector('base[target]')) return
      const base = doc.createElement('base')
      base.target = '_top'
      doc.head.prepend(base)
    })
  }

  /**
   * 更新露出區域。data 是 w×h 的 RGBA（列由上到下），R = 255 表示要露出；
   * 每格代表 cell × cell 個 CSS px。把每一列連續露出的格子合成一個矩形，串成一條 path。
   */
  setClip(data: Uint8Array, w: number, h: number, cell: number) {
    if (this.active) return
    const parts: string[] = []
    for (let y = 0; y < h; y++) {
      let x = 0
      while (x < w) {
        if (data[(y * w + x) * 4] < 128) {
          x++
          continue
        }
        const start = x
        while (x < w && data[(y * w + x) * 4] >= 128) x++
        parts.push(`M${start * cell} ${y * cell}h${(x - start) * cell}v${cell}h${-(x - start) * cell}Z`)
      }
    }
    this.iframe.style.clipPath = `path("${parts.length ? parts.join('') : 'M0 0Z'}")`
  }

  /** 燒光：整頁換成下一頁（拿掉 clip、開放操作、網址換過去，不重新載入） */
  activate() {
    if (this.active) return
    this.active = true
    const s = this.iframe.style
    s.clipPath = 'none'
    s.pointerEvents = 'auto'
    this.iframe.tabIndex = 0
    this.iframe.focus()
    history.pushState({ nextPage: true }, '', this.url)
    const title = this.iframe.contentDocument?.title
    if (title) document.title = title
    // 按上一頁：網址回到 editorial，但畫面還是 iframe → 重新載入讓畫面跟網址一致
    window.addEventListener('popstate', () => window.location.reload(), { once: true })
  }

  dispose() {
    this.iframe.remove()
  }
}
