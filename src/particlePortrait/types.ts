import type { PortraitEffect } from './effects'

export type { PortraitEffect } from './effects'
export type ColorMode = 'photo' | 'tech'

export type ViewMode = 'particles' | 'relief'

/** mesh＝只建 3D 網格；particles＝只建粒子；both＝兩者 */
export type RenderMode = 'mesh' | 'particles' | 'both'

export type PortraitQuality = 'low' | 'medium' | 'high'

export type ParticlePortraitOptions = {
  image?: string | HTMLImageElement
  particleCount?: number
  particleSize?: number
  colorMode?: ColorMode
  /** 相片風格（優先於 colorMode） */
  effect?: PortraitEffect
  viewMode?: ViewMode
  renderMode?: RenderMode
  wireframe?: boolean
  /** 浮雕五官銳化（邊緣加入高度） */
  edgeBoost?: number
  /** 浮雕高度（Z 位移強度） */
  reliefDepth?: number
  /** 浮雕網格細密度（短邊格點） */
  reliefGrid?: number
  interactionEnabled?: boolean
  autoRotate?: boolean
  dispersionStrength?: number
  alphaThreshold?: number
  floatEnabled?: boolean
  quality?: PortraitQuality
}

export type BuildPortraitOptions = {
  particleCount: number
  alphaThreshold: number
  planeHeight: number
  depthScale: number
}