import type { PortraitQuality } from './types'

/** 品質檔：粒子目標數（不依 web 頁硬體偵測） */
export const QUALITY_COUNTS: Record<PortraitQuality, number> = {
  low: 18_000,
  medium: 48_000,
  high: 96_000,
}

export const TECH_COLORS = {
  a: '#7cf7ff',
  b: '#a77bff',
  c: '#5eead4',
} as const

export const DEFAULTS = {
  particleCount: 48_000,
  particleSize: 2.4,
  colorMode: 'tech' as const,
  effect: 'cyber' as const,
  viewMode: 'relief' as const,
  renderMode: 'mesh' as const,
  reliefDepth: 0.95,
  reliefGrid: 280,
  edgeBoost: 0.38,
  wireframe: false,
  interactionEnabled: true,
  autoRotate: false,
  dispersionStrength: 1.35,
  alphaThreshold: 20,
  floatEnabled: true,
  planeHeight: 3.2,
  depthScale: 0.14,
  clearColor: 0x07080c,
}