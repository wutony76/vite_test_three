// 程式產生的貼圖：用 Canvas 2D 畫圖，再交給 Three.js 當貼圖
// 好處：不需要任何圖檔，文字、磚牆、條紋都能隨時改；缺點是細節不如照片貼圖
import * as THREE from 'three'

type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void

export function canvasTexture(width: number, height: number, draw: Draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  // 畫在 Canvas 上的顏色是 sRGB，要告訴 Three.js，否則顏色會偏淡
  texture.colorSpace = THREE.SRGBColorSpace
  // 斜看時（例如磚牆側面）貼圖較清楚
  texture.anisotropy = 8
  return texture
}

// 可重複平鋪的貼圖（磚牆、地磚）
function tiled(texture: THREE.Texture, repeatX: number, repeatY: number) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  return texture
}

// 固定亂數：每次重新整理畫出來的磚塊顏色都一樣（Math.random 每次都不同）
function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

/** 紅磚牆：一排一排錯開的磚塊，每塊顏色略有差異 */
export function brickTexture() {
  const random = seeded(7)
  return tiled(
    canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#5b3a30' // 磚縫（水泥）
      ctx.fillRect(0, 0, w, h)
      const brickW = 64
      const brickH = 21
      for (let row = 0; row * brickH < h; row++) {
        const offset = row % 2 ? brickW / 2 : 0 // 奇數排錯開半塊
        for (let x = -brickW; x < w + brickW; x += brickW) {
          const shade = 0.85 + random() * 0.3
          ctx.fillStyle = `rgb(${150 * shade}, ${78 * shade}, ${58 * shade})`
          ctx.fillRect(x + offset + 2, row * brickH + 2, brickW - 4, brickH - 4)
        }
      }
    }),
    2,
    2,
  )
}

/** 人行道地磚 */
export function pavingTexture() {
  const random = seeded(3)
  return tiled(
    canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = '#6d6a66'
      ctx.fillRect(0, 0, w, h)
      for (let y = 0; y < h; y += 32) {
        for (let x = 0; x < w; x += 32) {
          const shade = 150 + random() * 30
          ctx.fillStyle = `rgb(${shade}, ${shade - 6}, ${shade - 12})`
          ctx.fillRect(x + 1, y + 1, 30, 30)
        }
      }
    }),
    7,
    6,
  )
}

/** 店招：深綠底 + 米白字；同一張圖也當發光貼圖，晚上像燈箱 */
export function signTexture() {
  return canvasTexture(1024, 192, (ctx, w, h) => {
    ctx.fillStyle = '#16352a'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#d9b77a'
    ctx.lineWidth = 6
    ctx.strokeRect(14, 14, w - 28, h - 28)
    ctx.fillStyle = '#f3e6c8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 92px "PingFang TC", "Noto Sans TC", sans-serif'
    ctx.fillText('巷口烘焙', w * 0.36, h / 2 + 4)
    ctx.font = '600 54px Georgia, serif'
    ctx.fillText('ALLEY ROAST', w * 0.76, h / 2 + 4)
  })
}

/** 側面直立招牌（圓形 logo） */
export function bladeSignTexture() {
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f3e6c8'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#16352a'
    ctx.beginPath()
    ctx.arc(w / 2, 150, 95, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f3e6c8'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 120px "PingFang TC", sans-serif'
    ctx.fillText('烘', w / 2, 156)
    ctx.fillStyle = '#16352a'
    ctx.font = 'bold 64px "PingFang TC", sans-serif'
    ;['咖', '啡'].forEach((char, i) => ctx.fillText(char, w / 2, 320 + i * 82))
  })
}

/** 黑板立牌 */
export function chalkboardTexture() {
  return canvasTexture(256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#1f2a24'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#f4f1e8'
    ctx.textAlign = 'center'
    ctx.font = 'bold 34px "PingFang TC", sans-serif'
    ctx.fillText('今日手沖', w / 2, 62)
    ctx.font = '26px "PingFang TC", sans-serif'
    ctx.fillText('耶加雪菲', w / 2, 128)
    ctx.fillText('$150', w / 2, 166)
    ctx.fillText('自家烘焙', w / 2, 230)
    // 粉筆畫的咖啡杯
    ctx.strokeStyle = '#f2c46d'
    ctx.lineWidth = 4
    ctx.strokeRect(w / 2 - 22, 252, 44, 34)
    ctx.beginPath()
    ctx.arc(w / 2 + 26, 268, 9, -Math.PI / 2, Math.PI / 2)
    ctx.stroke()
  })
}

/** 雨棚條紋 */
export function awningTexture() {
  return canvasTexture(256, 64, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#f3e6c8' : '#1f5a43'
      ctx.fillRect((i * w) / 8, 0, w / 8, h)
    }
  })
}

/** 冷氣室外機的風扇網 */
export function fanGrillTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d7d9d6'
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = '#6b706f'
    ctx.lineWidth = 3
    for (let r = 12; r < 56; r += 9) {
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
      ctx.stroke()
    }
  })
}

/** 麻袋上的印字 */
export function sackTexture() {
  return canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#b08d5e'
    ctx.fillRect(0, 0, w, h)
    // 麻布紋理：細橫線
    ctx.fillStyle = 'rgba(80, 55, 25, 0.18)'
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1)
    ctx.fillStyle = '#5a3b1c'
    ctx.textAlign = 'center'
    ctx.font = 'bold 30px Georgia, serif'
    ctx.fillText('ETHIOPIA', w / 2, 60)
    ctx.font = '20px Georgia, serif'
    ctx.fillText('GREEN COFFEE · 60KG', w / 2, 92)
  })
}

/** 柔和圓點：煙霧、星星、月暈共用（中心白、邊緣透明） */
export function softDotTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  })
}
