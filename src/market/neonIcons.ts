// 霓虹燈圖示：每個圖示由幾條「筆畫」組成，每條筆畫 = 一根燈管
// 座標範圍約 -0.5 ~ 0.5（1 公尺見方），建立時再縮放
// smooth：true = 圓滑曲線（CatmullRom）；false = 折線（轉角是尖的）

export type Stroke = { points: [number, number][]; color: string; closed?: boolean; smooth?: boolean }
export type NeonIconId = 'drumstick' | 'boba' | 'takoyaki' | 'tofu' | 'balloon' | 'corn' | 'claw' | 'ice'

// 圓形 / 橢圓：取 n 個點，搭配 smooth + closed 就是平滑的圈
const ellipse = (cx: number, cy: number, rx: number, ry: number, color: string, n = 14): Stroke => ({
  points: Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number]
  }),
  color,
  closed: true,
  smooth: true,
})

// 熱氣：上升的波浪線
const steam = (x: number, y: number, color: string): Stroke => ({
  points: Array.from({ length: 6 }, (_, i) => [x + Math.sin(i * 1.4) * 0.05, y + i * 0.06] as [number, number]),
  color,
  smooth: true,
})

export const NEON_ICONS: Record<NeonIconId, Stroke[]> = {
  // 雞腿：肉 + 骨頭
  drumstick: [
    { points: [[-0.38, 0.32], [-0.08, 0.45], [0.2, 0.26], [0.2, -0.04], [0.0, -0.2], [-0.32, -0.06]], color: '#ff8a1f', closed: true, smooth: true },
    { points: [[0.12, -0.12], [0.38, -0.38]], color: '#fff3d6' },
    ellipse(0.42, -0.33, 0.06, 0.06, '#fff3d6', 10),
    ellipse(0.33, -0.43, 0.06, 0.06, '#fff3d6', 10),
  ],
  // 珍奶：杯子、杯蓋、吸管、珍珠
  boba: [
    { points: [[-0.28, 0.32], [0.28, 0.32], [0.2, -0.45], [-0.2, -0.45]], color: '#ffd18a', closed: true },
    { points: [[-0.33, 0.39], [0.33, 0.39]], color: '#ffd18a' },
    { points: [[0.04, 0.39], [0.16, 0.62]], color: '#ff4f8b' },
    ellipse(-0.1, -0.33, 0.05, 0.05, '#c084ff', 8),
    ellipse(0.04, -0.36, 0.05, 0.05, '#c084ff', 8),
    ellipse(0.1, -0.24, 0.05, 0.05, '#c084ff', 8),
  ],
  // 章魚燒：舟盤 + 三顆 + 竹籤
  takoyaki: [
    { points: [[-0.46, -0.02], [0.46, -0.02], [0.34, -0.24], [-0.34, -0.24]], color: '#ffb347', closed: true },
    ellipse(-0.26, 0.13, 0.14, 0.14, '#ff6b3d'),
    ellipse(0.02, 0.13, 0.14, 0.14, '#ff6b3d'),
    ellipse(0.3, 0.13, 0.14, 0.14, '#ff6b3d'),
    { points: [[0.3, 0.13], [0.44, 0.55]], color: '#ffe08a' },
  ],
  // 臭豆腐：立體方塊 + 熱氣
  tofu: [
    { points: [[-0.3, -0.38], [0.15, -0.38], [0.15, 0.06], [-0.3, 0.06]], color: '#ffd166', closed: true },
    { points: [[-0.3, 0.06], [-0.12, 0.24], [0.33, 0.24], [0.15, 0.06]], color: '#ffd166' },
    { points: [[0.15, -0.38], [0.33, -0.2], [0.33, 0.24]], color: '#ffd166' },
    steam(-0.08, 0.3, '#7df9ff'),
    steam(0.14, 0.32, '#7df9ff'),
  ],
  // 氣球：兩顆 + 線
  balloon: [
    ellipse(-0.16, 0.18, 0.17, 0.23, '#ff4f8b'),
    ellipse(0.2, 0.26, 0.15, 0.2, '#4fc3ff'),
    { points: [[-0.16, -0.05], [-0.1, -0.2], [-0.18, -0.35], [-0.1, -0.5]], color: '#ffffff', smooth: true },
    { points: [[0.2, 0.06], [0.24, -0.12], [0.16, -0.3], [0.22, -0.48]], color: '#ffffff', smooth: true },
  ],
  // 玉米：玉米粒（橢圓 + 格線）+ 葉子
  corn: [
    ellipse(0.04, 0.08, 0.16, 0.4, '#ffe14d'),
    { points: [[-0.08, -0.12], [0.16, -0.12]], color: '#ffe14d' },
    { points: [[-0.1, 0.1], [0.18, 0.1]], color: '#ffe14d' },
    { points: [[-0.08, 0.3], [0.16, 0.3]], color: '#ffe14d' },
    { points: [[0.0, -0.36], [-0.25, -0.2], [-0.3, 0.15]], color: '#5cff7a', smooth: true },
    { points: [[0.08, -0.36], [0.32, -0.15], [0.32, 0.12]], color: '#5cff7a', smooth: true },
  ],
  // 夾娃娃：橫桿、繩子、三爪、娃娃
  claw: [
    { points: [[-0.4, 0.45], [0.4, 0.45]], color: '#7c5cff' },
    { points: [[0.0, 0.45], [0.0, 0.12]], color: '#7c5cff' },
    { points: [[-0.2, -0.12], [-0.12, 0.08], [0.12, 0.08], [0.2, -0.12]], color: '#ff6bd6' },
    { points: [[0.0, 0.08], [0.0, -0.12]], color: '#ff6bd6' },
    ellipse(0.0, -0.32, 0.13, 0.12, '#ffe14d', 12),
  ],
  // 芒果剉冰：碗、冰山、芒果丁
  ice: [
    { points: [[-0.42, -0.06], [0.42, -0.06], [0.26, -0.42], [-0.26, -0.42]], color: '#7df9ff', closed: true },
    { points: [[-0.38, -0.06], [-0.22, 0.22], [0.0, 0.4], [0.22, 0.22], [0.38, -0.06]], color: '#ffffff', smooth: true },
    { points: [[-0.12, 0.12], [-0.02, 0.12], [-0.02, 0.22], [-0.12, 0.22]], color: '#ffa31a', closed: true },
    { points: [[0.06, 0.02], [0.16, 0.02], [0.16, 0.12], [0.06, 0.12]], color: '#ffa31a', closed: true },
  ],
}
