/**
 * 從單張人像產生 editorial 分層素材（底圖去虹膜、虹膜層、固定眼眶遮罩）。
 *
 * 執行：npm run bake:portrait
 * 除錯：npm run bake:portrait -- --debug <輸出.png>   → 額外輸出「眼眶輪廓＋虹膜圓」疊圖，用來對位
 *
 * 分層概念（為什麼要這樣拆）：
 * - 虹膜層（left-eye.webp）：只有「虹膜＋瞳孔」的圓盤，透明背景。滑鼠移動時只有這層在動。
 * - 眼眶遮罩（left-eye-mask.webp）：杏仁形的眼睛開口，白＝可見。它「固定不動」，
 *   虹膜往旁邊移時會被眼皮裁掉 → 看起來是眼球在眼眶裡轉。
 *   少了它（或遮罩跟著一起動）→ 會變成整塊眼睛貼紙在臉上滑來滑去。
 * - 底圖（portrait-base.webp）：把原本虹膜的位置填成眼白色。
 *   少了這步 → 虹膜一移開，底下還留著原本的虹膜，看起來像「兩顆眼珠」。
 *
 * 所有座標都用「原圖像素」，換照片時只要調整下方 LEFT / RIGHT 設定，再用 --debug 疊圖確認。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(fileURLToPath(import.meta.url), '..', '..')
const SOURCE = join(ROOT, 'tools/img/portrait-source.jpg')
const OUT_DIR = join(ROOT, 'public/images/portrait')

type Pt = { x: number; y: number }

type EyeSpec = {
  /** 虹膜中心（原圖像素） */
  iris: Pt
  /** 虹膜半徑（像素） */
  irisR: number
  /** 外眼角、內眼角 */
  outer: Pt
  inner: Pt
  /** 上眼皮最高點離「眼角連線」的垂直距離（像素） */
  upper: number
  /** 下眼皮最低點離「眼角連線」的垂直距離（像素） */
  lower: number
  /** 上／下眼皮弧線的飽滿度：1 = 拋物線，越小越圓鈍 */
  upperCurve: number
  lowerCurve: number
  /** 上／下眼皮最高（低）點在眼角連線上的位置 0..1（0 = 畫面左邊的眼角） */
  upperPeak: number
  lowerPeak: number
  /** 虹膜最大位移（像素）；眼睛左右轉得多、上下轉得少 */
  maxOffset: Pt
}

// 照片中人物的右眼在畫面左邊；這裡一律用「畫面左／右」命名，避免混淆
const LEFT: EyeSpec = {
  iris: { x: 158, y: 406 },
  irisR: 21,
  outer: { x: 116, y: 405 },
  inner: { x: 206, y: 421 },
  upper: 27,
  lower: 13,
  upperCurve: 0.5,
  lowerCurve: 0.7,
  upperPeak: 0.56,
  lowerPeak: 0.5,
  maxOffset: { x: 10, y: 3.5 },
}

const RIGHT: EyeSpec = {
  iris: { x: 370, y: 405 },
  irisR: 21,
  outer: { x: 442, y: 404 },
  inner: { x: 326, y: 420 },
  upper: 28,
  lower: 13,
  upperCurve: 0.7,
  lowerCurve: 0.7,
  upperPeak: 0.5,
  lowerPeak: 0.5,
  maxOffset: { x: 10, y: 3.5 },
}

/** 圖層矩形四周多留的邊（像素），讓虹膜位移後也不會碰到貼圖邊緣 */
const PAD = 6

type Img = { data: Buffer; w: number; h: number }

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * 眼皮弧線高度：(4s(1-s))^curve，其中 s = u^k 把峰值從 u=peak 搬到 s=0.5。
 * 少了 peak → 弧頂永遠在正中間，但真實眼睛的上眼皮最高點通常偏向內側。
 */
const lidBulge = (u: number, curve: number, peak: number) => {
  const s = Math.pow(u, Math.log(0.5) / Math.log(peak))
  return Math.pow(4 * s * (1 - s), curve)
}

/** 眼角連線：一律「畫面左邊的眼角 → 右邊」，垂直向量 (-ay, ax)/len 才會固定朝下（影像 y 向下） */
function cornerAxis(spec: EyeSpec) {
  const a = spec.outer.x < spec.inner.x ? spec.outer : spec.inner
  const b = a === spec.outer ? spec.inner : spec.outer
  const ax = b.x - a.x
  const ay = b.y - a.y
  const len = Math.hypot(ax, ay)
  return { a, ax, ay, len, nx: -ay / len, ny: ax / len }
}

/**
 * 眼眶開口的「可見度」0..1（杏仁形，邊緣約 1.2px 柔化）。
 * 做法：以「外眼角→內眼角」為 u 軸（0..1），垂直方向為 v 軸（往下為正），
 * 上下眼皮各是一條 (4u(1-u))^curve 的弧線。
 */
function openingAlpha(spec: EyeSpec, x: number, y: number) {
  const { a, ax, ay, len, nx, ny } = cornerAxis(spec)
  const px = x - a.x
  const py = y - a.y
  const u = (px * ax + py * ay) / (len * len)
  const v = px * nx + py * ny
  if (u <= 0 || u >= 1) return 0
  const top = -spec.upper * lidBulge(u, spec.upperCurve, spec.upperPeak)
  const bottom = spec.lower * lidBulge(u, spec.lowerCurve, spec.lowerPeak)
  const feather = 1.2
  return smoothstep(top - feather, top + feather, v) * (1 - smoothstep(bottom - feather, bottom + feather, v))
}

/** 圖層矩形：包住整個眼眶開口＋位移空間 */
function eyeRect(spec: EyeSpec, img: Img) {
  const xs = [spec.outer.x, spec.inner.x, spec.iris.x - spec.irisR, spec.iris.x + spec.irisR]
  const ys = [
    Math.min(spec.outer.y, spec.inner.y) - spec.upper,
    Math.max(spec.outer.y, spec.inner.y) + spec.lower,
    spec.iris.y - spec.irisR,
    spec.iris.y + spec.irisR,
  ]
  const x0 = Math.max(0, Math.floor(Math.min(...xs) - spec.maxOffset.x - PAD))
  const y0 = Math.max(0, Math.floor(Math.min(...ys) - spec.maxOffset.y - PAD))
  const x1 = Math.min(img.w, Math.ceil(Math.max(...xs) + spec.maxOffset.x + PAD))
  const y1 = Math.min(img.h, Math.ceil(Math.max(...ys) + spec.maxOffset.y + PAD))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const px = (img: Img, x: number, y: number) => (y * img.w + x) * 3

/** 取眼白平均色：眼眶內、虹膜外、夠亮的像素 */
function scleraColor(img: Img, spec: EyeSpec, rect: ReturnType<typeof eyeRect>) {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      if (openingAlpha(spec, x, y) < 0.99) continue
      if (Math.hypot(x - spec.iris.x, y - spec.iris.y) < spec.irisR + 3) continue
      const i = px(img, x, y)
      const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
      if (lum < 150) continue
      r += img.data[i]
      g += img.data[i + 1]
      b += img.data[i + 2]
      n++
    }
  }
  if (n === 0) return [235, 228, 225]
  return [r / n, g / n, b / n]
}

/**
 * 底圖：虹膜圓盤（稍微放大）∩ 眼眶開口 → 填成眼白。
 *
 * 填色方式：逐行取「虹膜左、右兩側」真實的眼白像素，再左右內插。
 * 這樣會自動帶到原照片的明暗（上緣被眼皮遮的陰影、眼角偏暗）。
 * 若只用一個平均色 → 虹膜一移開就露出一塊均勻灰片，很假。
 */
function paintSclera(img: Img, spec: EyeSpec) {
  const rect = eyeRect(spec, img)
  const [ar, ag, ab] = scleraColor(img, spec, rect)
  const fillR = spec.irisR + 2.5

  // 在 [x0, x1] 這段取眼白樣本（眼眶內、夠亮）；取不到就回傳 null
  const sampleRow = (y: number, x0: number, x1: number) => {
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      if (openingAlpha(spec, x, y) < 0.99) continue
      const i = px(img, x, y)
      const lum = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
      if (lum < 120) continue
      r += img.data[i]
      g += img.data[i + 1]
      b += img.data[i + 2]
      n++
    }
    return n ? [r / n, g / n, b / n] : null
  }

  const cx = spec.iris.x
  type Rgb = number[]
  const rows: { l: Rgb | null; r: Rgb | null }[] = []
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    rows.push({
      l: sampleRow(y, cx - fillR - 8, cx - fillR - 2),
      r: sampleRow(y, cx + fillR + 2, cx + fillR + 8),
    })
  }

  // 取不到樣本的行（貼近上下眼皮）沿用最近一行有樣本的顏色；都沒有就用平均色
  const fillGaps = (side: 'l' | 'r') => {
    const out: Rgb[] = []
    for (let j = 0; j < rows.length; j++) {
      let found: Rgb | null = null
      for (let k = 0; k < rows.length && !found; k++) {
        found = rows[j - k]?.[side] ?? rows[j + k]?.[side] ?? null
      }
      out.push(found ?? [ar, ag, ab])
    }
    return out
  }
  // 垂直方向平滑（±4 行盒狀模糊）。少了這步 → 每行樣本雜訊不同，會出現一條條橫紋
  const smoothRows = (arr: Rgb[]) =>
    arr.map((_, j) => {
      const acc = [0, 0, 0]
      let n = 0
      for (let k = Math.max(0, j - 4); k <= Math.min(arr.length - 1, j + 4); k++) {
        for (let c = 0; c < 3; c++) acc[c] += arr[k][c]
        n++
      }
      return acc.map((v) => v / n)
    })
  const leftCols = smoothRows(fillGaps('l'))
  const rightCols = smoothRows(fillGaps('r'))

  for (let y = rect.y; y < rect.y + rect.h; y++) {
    // 靠上眼皮再壓暗一點，模擬眼皮投在眼白上的陰影
    const shade = 0.8 + 0.2 * smoothstep(spec.iris.y - spec.irisR, spec.iris.y - spec.irisR * 0.4, y)
    const lc = leftCols[y - rect.y].map((c) => c * shade)
    const rc = rightCols[y - rect.y].map((c) => c * shade)

    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const d = Math.hypot(x - cx, y - spec.iris.y)
      const disc = 1 - smoothstep(fillR - 1.5, fillR + 0.5, d)
      // 眼眶稍微放寬 1px 去填，避免邊緣殘留一圈原本虹膜的深色
      const open = Math.max(openingAlpha(spec, x, y), openingAlpha(spec, x, y - 1), openingAlpha(spec, x, y + 1))
      const a = disc * open
      if (a <= 0) continue
      const k = smoothstep(cx - fillR, cx + fillR, x)
      const i = px(img, x, y)
      for (let c = 0; c < 3; c++) {
        const fill = lc[c] * (1 - k) + rc[c] * k
        img.data[i + c] = img.data[i + c] * (1 - a) + fill * a
      }
    }
  }
}

/** 虹膜層與眼眶遮罩：兩張貼圖都用同一個矩形，shader 裡才能用同一組 UV 對齊 */
async function buildEyeLayers(src: Img, spec: EyeSpec) {
  const rect = eyeRect(spec, src)
  const iris = Buffer.alloc(rect.w * rect.h * 4)
  const mask = Buffer.alloc(rect.w * rect.h)
  for (let y = 0; y < rect.h; y++) {
    for (let x = 0; x < rect.w; x++) {
      const sx = rect.x + x
      const sy = rect.y + y
      const o = (y * rect.w + x) * 4
      const i = px(src, sx, sy)
      const d = Math.hypot(sx - spec.iris.x, sy - spec.iris.y)
      // 虹膜邊緣 1.5px 柔化，移動時才不會有鋸齒
      const a = 1 - smoothstep(spec.irisR - 1, spec.irisR + 0.5, d)
      iris[o] = src.data[i]
      iris[o + 1] = src.data[i + 1]
      iris[o + 2] = src.data[i + 2]
      iris[o + 3] = Math.round(a * 255)
      mask[y * rect.w + x] = Math.round(openingAlpha(spec, sx, sy) * 255)
    }
  }
  const irisWebp = await sharp(iris, { raw: { width: rect.w, height: rect.h, channels: 4 } })
    .webp({ lossless: true })
    .toBuffer()
  const maskWebp = await sharp(mask, { raw: { width: rect.w, height: rect.h, channels: 1 } })
    .webp({ lossless: true })
    .toBuffer()
  return { rect, irisWebp, maskWebp }
}

/** --debug：把眼眶輪廓（洋紅）、虹膜圓（青）、圖層矩形（黃）畫在原圖上並放大 */
async function writeDebug(src: Img, out: string) {
  const outline = (spec: EyeSpec) => {
    const pts: string[] = []
    const { a, ax, ay, nx, ny } = cornerAxis(spec)
    for (let k = 0; k <= 40; k++) {
      const u = k / 40
      const b = spec.upper * lidBulge(u, spec.upperCurve, spec.upperPeak)
      pts.push(`${a.x + ax * u - nx * b},${a.y + ay * u - ny * b}`)
    }
    for (let k = 40; k >= 0; k--) {
      const u = k / 40
      const b = spec.lower * lidBulge(u, spec.lowerCurve, spec.lowerPeak)
      pts.push(`${a.x + ax * u + nx * b},${a.y + ay * u + ny * b}`)
    }
    const r = eyeRect(spec, src)
    return `<polygon points="${pts.join(' ')}" fill="none" stroke="magenta" stroke-width="0.5"/>
      <circle cx="${spec.iris.x}" cy="${spec.iris.y}" r="${spec.irisR}" fill="none" stroke="cyan" stroke-width="0.5"/>
      <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="none" stroke="yellow" stroke-width="0.5"/>`
  }
  const sil = SILHOUETTE.map(([x, y]) => `${x},${y}`).join(' ')
  const svg = `<svg width="${src.w}" height="${src.h}" xmlns="http://www.w3.org/2000/svg">${outline(LEFT)}${outline(RIGHT)}<polygon points="${sil}" fill="none" stroke="white" stroke-width="1.5"/></svg>`
  const marked = await sharp(src.data, { raw: { width: src.w, height: src.h, channels: 3 } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer()
  const top = Math.min(LEFT.iris.y, RIGHT.iris.y) - 60
  const left = Math.max(0, LEFT.outer.x - 30)
  const width = Math.min(src.w - left, RIGHT.outer.x + 30 - left)
  await sharp(marked).extract({ left, top, width, height: 120 }).resize(width * 4).toFile(out)
  console.log(`debug overlay → ${out}`)
}

async function readRgb(file: string): Promise<Img> {
  const { data, info } = await sharp(file).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

/**
 * 人物輪廓（原圖像素，順時針）：頭髮外緣 → 右耳 → 右臉頰／下巴 → 脖子 → 肩膀 → 左側回到頭頂。
 * 照片背景跟皮膚都是米白色，用顏色自動去背很容易把臉也當成背景，所以手動描點最穩。
 * 換照片時用 --debug 看疊圖（白線）調整這些點。
 */
const SILHOUETTE: [number, number][] = [
  [75, 0], [505, 0], [532, 40], [553, 110], [566, 190], [572, 260], [568, 380], [562, 430],
  [552, 480], [536, 532], [512, 552], [492, 585], [474, 640], [452, 700], [434, 745],
  [428, 780], [446, 830], [500, 866], [560, 890], [576, 896], [576, 1024], [0, 1024],
  [0, 905], [40, 896], [100, 876], [148, 856], [156, 800], [156, 760], [140, 726],
  [116, 678], [92, 612], [72, 548], [48, 524], [28, 474], [15, 400], [12, 250],
  [25, 130], [48, 50],
]

/**
 * 頭髮大致範圍（原圖像素）：頭頂、髮際線以上、兩側到耳朵。
 * 真正的頭髮 = 這個範圍內「夠暗」的像素 → 眉毛（在範圍外）、皮膚、耳環（太亮）都不會被算進去。
 */
const HAIR_REGION: [number, number][] = [
  [0, 0], [576, 0], [576, 470], [534, 470], [505, 300], [452, 200], [380, 158],
  [288, 148], [196, 158], [128, 200], [76, 300], [46, 470], [0, 470],
]

/**
 * 頭髮遮罩（0..255，原圖尺寸）：範圍（邊緣柔化）× 暗度（亮度 60 以下全算、130 以上不算）。
 * 發動時 shader 用它把頭髮染紫、讓頭髮飄動。
 */
async function buildHairMask(src: Img) {
  const pts = HAIR_REGION.map(([x, y]) => `${x},${y}`).join(' ')
  const svg = Buffer.from(
    `<svg width="${src.w}" height="${src.h}" xmlns="http://www.w3.org/2000/svg"><rect width="${src.w}" height="${src.h}" fill="black"/><polygon points="${pts}" fill="white"/></svg>`,
  )
  const region = await sharp(svg).resize(src.w, src.h).blur(6).greyscale().raw().toBuffer()
  const hair = Buffer.alloc(src.w * src.h)
  for (let i = 0; i < src.w * src.h; i++) {
    const lum = 0.299 * src.data[i * 3] + 0.587 * src.data[i * 3 + 1] + 0.114 * src.data[i * 3 + 2]
    const dark = 1 - smoothstep(60, 130, lum)
    hair[i] = Math.round((region[i] / 255) * dark * 255)
  }
  // 稍微柔化，染色邊緣才不會一顆顆像素很硬。
  // extractChannel(0)：sharp 對單通道原始資料做 blur 會輸出 3 通道，不取回單通道的話長度變 3 倍、讀起來整張錯位
  return sharp(hair, { raw: { width: src.w, height: src.h, channels: 1 } }).blur(1).extractChannel(0).raw().toBuffer()
}

/**
 * 遮罩四周多留的邊（原圖像素）：氣場火焰要能竄出照片的方框，遮罩也得涵蓋照片外面一圈。
 * 輪廓碰到照片左右下緣的點（肩膀、底部）會延伸到加大後的邊緣，那些地方才不會冒出一排火；
 * 頭頂碰到照片上緣的地方則保留（人物在照片上方被切掉），火焰會從頭頂往上竄出方框。
 */
const MASK_PAD = 96

/**
 * 輪廓遮罩 portrait-mask.webp（尺寸 = 原圖 + 四周各 MASK_PAD；三個通道各有用途）：
 * - R：人物＝白、背景＝黑（邊緣 1.5px 柔化）
 * - G：大範圍模糊（σ 45）→ 背景區域「離人物多近」，氣場火焰用來決定往外延伸多遠
 * - B：小範圍模糊（σ 5）→ 只有輪廓附近是中間值，用來畫貼著邊緣的輪廓光
 * - A：頭髮遮罩（buildHairMask，放在照片範圍內；邊框區為 0）
 */
async function buildSilhouetteMask(srcW: number, srcH: number, hair: Buffer) {
  const P = MASK_PAD
  const w = srcW + P * 2
  const h = srcH + P * 2
  const pts = SILHOUETTE.map(([x, y]) => {
    // 碰到照片左／右／下緣的點推到加大後的邊緣（人物在那些方向是延續出去的）
    const px = x <= 0 ? -P : x >= srcW ? srcW + P : x
    const py = y >= srcH ? srcH + P : y
    return `${px + P},${py + P}`
  }).join(' ')
  const svg = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" fill="black"/><polygon points="${pts}" fill="white"/></svg>`,
  )
  const gray = async (sigma: number) =>
    sharp(svg).resize(w, h).blur(sigma).greyscale().raw().toBuffer()
  const [r, g, b] = await Promise.all([gray(1.5), gray(45), gray(5)])
  const rgba = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      rgba[i * 4] = r[i]
      rgba[i * 4 + 1] = g[i]
      rgba[i * 4 + 2] = b[i]
      const sx = x - P
      const sy = y - P
      rgba[i * 4 + 3] = sx >= 0 && sx < srcW && sy >= 0 && sy < srcH ? hair[sy * srcW + sx] : 0
    }
  }
  // exact：保留 alpha 為 0 處的 RGB（預設會把全透明像素的顏色丟掉，R/G/B 資料就壞了）
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).webp({ lossless: true, exact: true }).toBuffer()
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const src = await readRgb(SOURCE)
  const debugIdx = process.argv.indexOf('--debug')
  if (debugIdx > -1) {
    await writeDebug(src, process.argv[debugIdx + 1] ?? join(ROOT, 'portrait-debug.png'))
  }

  // 底圖：複製一份再塗，虹膜層要從「原圖」取，不能從塗過的底圖取
  const base: Img = { data: Buffer.from(src.data), w: src.w, h: src.h }
  paintSclera(base, LEFT)
  paintSclera(base, RIGHT)
  const baseWebp = await sharp(base.data, { raw: { width: base.w, height: base.h, channels: 3 } })
    .webp({ quality: 94, effort: 6 })
    .toBuffer()
  writeFileSync(join(OUT_DIR, 'portrait-base.webp'), baseWebp)

  const eyes = {} as Record<'leftEye' | 'rightEye', unknown>
  for (const [key, file, spec] of [
    ['leftEye', 'left', LEFT],
    ['rightEye', 'right', RIGHT],
  ] as const) {
    const { rect, irisWebp, maskWebp } = await buildEyeLayers(src, spec)
    writeFileSync(join(OUT_DIR, `${file}-eye.webp`), irisWebp)
    writeFileSync(join(OUT_DIR, `${file}-eye-mask.webp`), maskWebp)
    eyes[key] = { rect, iris: spec.iris, maxOffset: spec.maxOffset }
  }

  writeFileSync(join(OUT_DIR, 'portrait-mask.webp'), await buildSilhouetteMask(src.w, src.h, await buildHairMask(src)))

  const manifest = {
    version: 2,
    sourceSize: { width: src.w, height: src.h },
    planeHeight: 1,
    ...eyes,
    maskPadding: MASK_PAD,
    look: { gain: 0.9, stereo: 0.94 },
  }
  writeFileSync(join(OUT_DIR, 'portrait.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  console.log(`Wrote portrait assets to ${OUT_DIR} (${src.w}×${src.h})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
