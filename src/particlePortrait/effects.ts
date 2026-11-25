import * as THREE from 'three'

export type PortraitEffect =
  | 'original'
  | 'cyber'
  | 'neon'
  | 'vintage'
  | 'noir'
  | 'hologram'
  | 'ember'
  | 'aurora'

export type EffectPreset = {
  id: PortraitEffect
  label: string
  hint: string
  background: number
  accentA: string
  accentB: string
  accentC: string
  shaderId: number
}

/** 相片風格預設（粒子 Shader + 浮雕頂色共用） */
export const PORTRAIT_EFFECTS: EffectPreset[] = [
  {
    id: 'cyber',
    label: '科技青紫',
    hint: '預設科技感粒子人像',
    background: 0x07080c,
    accentA: '#7cf7ff',
    accentB: '#a77bff',
    accentC: '#5eead4',
    shaderId: 1,
  },
  {
    id: 'original',
    label: '原彩肖像',
    hint: '保留照片 RGB',
    background: 0x0a0a0e,
    accentA: '#ffffff',
    accentB: '#cccccc',
    accentC: '#888888',
    shaderId: 0,
  },
  {
    id: 'neon',
    label: '霓虹都市',
    hint: '桃紅 × 電青高對比',
    background: 0x08060f,
    accentA: '#ff4fd8',
    accentB: '#5ffbff',
    accentC: '#ffe566',
    shaderId: 2,
  },
  {
    id: 'vintage',
    label: '復古膠片',
    hint: '暖棕褪色、暗角感',
    background: 0x120e0a,
    accentA: '#f2d2a0',
    accentB: '#c9895a',
    accentC: '#8b5e3c',
    shaderId: 3,
  },
  {
    id: 'noir',
    label: '黑白銀鹽',
    hint: '高對比灰階',
    background: 0x050505,
    accentA: '#f0f0f0',
    accentB: '#a0a0a0',
    accentC: '#404040',
    shaderId: 4,
  },
  {
    id: 'hologram',
    label: '全息掃描',
    hint: '掃描線 + 青洋紅',
    background: 0x040810,
    accentA: '#58fff9',
    accentB: '#9d7bff',
    accentC: '#ff6bcb',
    shaderId: 5,
  },
  {
    id: 'ember',
    label: '餘燼暖焰',
    hint: '橘紅火光漸層',
    background: 0x100806,
    accentA: '#ffcf6b',
    accentB: '#ff6b3d',
    accentC: '#c41832',
    shaderId: 6,
  },
  {
    id: 'aurora',
    label: '極光冷夜',
    hint: '深藍綠極光',
    background: 0x030812,
    accentA: '#4ef0c3',
    accentB: '#3b82f6',
    accentC: '#c084fc',
    shaderId: 7,
  },
]

const byId = Object.fromEntries(PORTRAIT_EFFECTS.map((e) => [e.id, e])) as Record<PortraitEffect, EffectPreset>

export function getEffectPreset(effect: PortraitEffect) {
  return byId[effect] ?? byId.cyber
}

/** 舊 API：photo / tech */
export function effectFromColorMode(mode: 'photo' | 'tech'): PortraitEffect {
  return mode === 'photo' ? 'original' : 'cyber'
}

export function colorizeForEffect(r: number, g: number, b: number, bright: number, effect: PortraitEffect) {
  const photo = new THREE.Color(r, g, b)
  const preset = getEffectPreset(effect)

  if (effect === 'original') return photo

  const a = new THREE.Color(preset.accentA)
  const c = new THREE.Color(preset.accentC)
  const accent = new THREE.Color(preset.accentB).lerp(c, smooth(bright))

  switch (effect) {
    case 'noir': {
      const gry = bright
      return new THREE.Color(gry, gry, gry).multiplyScalar(0.85 + bright * 0.35)
    }
    case 'vintage': {
      const sepia = new THREE.Color(bright * 1.05, bright * 0.82, bright * 0.58)
      return photo.clone().lerp(sepia, 0.72)
    }
    case 'neon': {
      const neon = a.clone().lerp(accent, bright).lerp(c, bright * bright * 0.4)
      return photo.clone().lerp(neon, 0.82 + bright * 0.15)
    }
    case 'ember':
    case 'aurora':
    case 'hologram':
    case 'cyber':
    default: {
      const styled = a.clone().lerp(accent, bright)
      if (bright > 0.4) styled.lerp(c, (bright - 0.4) / 0.55)
      return photo.clone().lerp(styled, effect === 'cyber' ? 0.88 : 0.8)
    }
  }
}

function smooth(t: number) {
  return t * t * (3 - 2 * t)
}

export function particleBlendingFor(effect: PortraitEffect) {
  return effect === 'noir' || effect === 'original' ? THREE.NormalBlending : THREE.AdditiveBlending
}