// 夜市用的程式產生貼圖：招牌燈箱、雨棚條紋、大樓窗光、水泥地、跑馬燈字幕
import * as THREE from 'three'

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

export function canvasTexture(width: number, height: number, draw: Draw, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d')!, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = colorSpace
  texture.anisotropy = 8
  return texture
}

// 固定亂數：每次重新整理結果都一樣
export function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
}

/** 招牌燈箱：深色底 + 亮色粗字 + 外框；晚上整張當作自發光貼圖 */
export function signboardTexture(text: string, background: string, ink: string) {
  return canvasTexture(1024, 180, (ctx, w, h) => {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = ink
    ctx.lineWidth = 8
    ctx.strokeRect(12, 12, w - 24, h - 24)
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '900 120px "PingFang TC", "Noto Sans TC", sans-serif'
    // 字距拉開一點，比較像招牌
    ctx.letterSpacing = '16px'
    ctx.fillText(text, w / 2, h / 2 + 6)
  })
}

/** 雨棚條紋 */
export function canopyTexture(colorA: string, colorB: string) {
  return canvasTexture(256, 64, (ctx, w, h) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? colorA : colorB
      ctx.fillRect((i * w) / 8, 0, w / 8, h)
    }
  })
}

/** 大樓立面：深色牆 + 隨機亮燈的窗戶（暖黃、冷白、少數電視藍） */
export function buildingTexture(seed: number) {
  const random = seeded(seed)
  return canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#0d0f17'
    ctx.fillRect(0, 0, w, h)
    for (let y = 16; y < h - 16; y += 28) {
      for (let x = 12; x < w - 12; x += 30) {
        const r = random()
        if (r < 0.45) continue // 暗窗
        ctx.fillStyle = r < 0.8 ? '#ffcf7a' : r < 0.95 ? '#e8f0ff' : '#7aa8ff'
        ctx.globalAlpha = 0.5 + random() * 0.5
        ctx.fillRect(x, y, 18, 16)
      }
    }
    ctx.globalAlpha = 1
  })
}

/** 跑馬燈字幕：一長條文字，貼圖 offset 一直往左移就會捲動 */
export function marqueeTexture(text: string) {
  const texture = canvasTexture(2048, 128, (ctx, w, h) => {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#ffd34d'
    ctx.textBaseline = 'middle'
    ctx.font = '900 84px "PingFang TC", "Noto Sans TC", sans-serif'
    ctx.fillText(text, 20, h / 2 + 4)
    // LED 點陣感：蓋上細格線
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    for (let x = 0; x < w; x += 6) ctx.fillRect(x, 0, 2, h)
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2)
  })
  texture.wrapS = THREE.RepeatWrapping
  return texture
}

/** 柔和圓點：熱氣、燈泡光暈 */
export function softDotTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
    gradient.addColorStop(0, 'rgba(255,255,255,1)')
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.4)')
    gradient.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  })
}

/**
 * 水泥地：灰色斑駁底 + 污漬 + 分割縫（每 4 公尺一塊）+ 細裂縫
 * 回傳顏色貼圖 map 與凹凸貼圖 bump（分割縫、裂縫凹下去，表面有細微顆粒）
 * 一張圖代表 4 × 4 公尺的一塊水泥板
 */
export function concreteTextures() {
  const SIZE = 1024
  const random = seeded(31)
  // 污漬、裂縫位置先產生，顏色圖和凹凸圖共用，凹凸才對得上
  const stains = Array.from({ length: 18 }, () => ({ x: random() * SIZE, y: random() * SIZE, r: 40 + random() * 160, a: 0.04 + random() * 0.1 }))
  const cracks = Array.from({ length: 4 }, () => {
    let x = random() * SIZE
    let y = random() * SIZE
    const points: [number, number][] = [[x, y]]
    for (let i = 0; i < 8; i++) {
      x += (random() - 0.5) * 90
      y += (random() - 0.2) * 70
      points.push([x, y])
    }
    return points
  })
  const drawCracks = (ctx: CanvasRenderingContext2D, style: string) => {
    ctx.strokeStyle = style
    ctx.lineWidth = 1.5
    for (const crack of cracks) {
      ctx.beginPath()
      crack.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.stroke()
    }
  }
  // 分割縫畫在圖的邊緣：平鋪時剛好接成每 4 公尺一條的格線
  const drawJoints = (ctx: CanvasRenderingContext2D, style: string) => {
    ctx.fillStyle = style
    ctx.fillRect(0, 0, SIZE, 5)
    ctx.fillRect(0, 0, 5, SIZE)
  }

  const map = canvasTexture(SIZE, SIZE, (ctx, w, h) => {
    ctx.fillStyle = '#7d7a74'
    ctx.fillRect(0, 0, w, h)
    // 細顆粒：上萬個深淺不一的小點
    for (let i = 0; i < 26000; i++) {
      const v = 95 + random() * 60
      ctx.fillStyle = `rgba(${v}, ${v - 2}, ${v - 6}, 0.35)`
      ctx.fillRect(random() * w, random() * h, 2, 2)
    }
    // 污漬：大片半透明深色斑
    for (const s of stains) {
      const gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r)
      gradient.addColorStop(0, `rgba(40, 36, 32, ${s.a})`)
      gradient.addColorStop(1, 'rgba(40, 36, 32, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2)
    }
    drawCracks(ctx, 'rgba(45, 42, 38, 0.7)')
    drawJoints(ctx, '#4d4a45')
  })

  const bump = canvasTexture(
    SIZE,
    SIZE,
    (ctx, w, h) => {
      ctx.fillStyle = '#808080'
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 20000; i++) {
        const v = 110 + random() * 40
        ctx.fillStyle = `rgb(${v}, ${v}, ${v})`
        ctx.fillRect(random() * w, random() * h, 2, 2)
      }
      // 裂縫、分割縫是凹下去的 → 畫深色
      drawCracks(ctx, '#202020')
      drawJoints(ctx, '#101010')
    },
    THREE.NoColorSpace,
  )

  for (const texture of [map, bump]) texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return { map, bump }
}
