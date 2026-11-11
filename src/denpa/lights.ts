// 電波町的燈光設定。GUI 和 setDenpaLights 都改這一份，每一幀再套到材質與點光源。

export const DENPA_CHANNELS = ['den', 'ha', 'machi', 'dot', 'outer', 'trim', 'bay'] as const
export type DenpaChannelId = (typeof DENPA_CHANNELS)[number]

export const DENPA_CHANNEL_LABEL: Record<DenpaChannelId, string> = {
  den: '電',
  ha: '波',
  machi: '町',
  dot: '圓點',
  outer: '外框',
  trim: '內框',
  bay: '內壁',
}

/** 總色只覆寫燈管，內壁維持自己的暗橘色 */
const TINTED: DenpaChannelId[] = ['den', 'ha', 'machi', 'dot', 'outer', 'trim']

export type DenpaLightMode = 'steady' | 'breathe' | 'chase' | 'flicker'

export interface ChannelLight {
  color: string
  intensity: number
  enabled: boolean
}

export interface DenpaLightState {
  master: number
  /** 燈管的共同顏色。改它會順便寫進電、波、町、圓點、內框 */
  color: string
  mode: DenpaLightMode
  speed: number
  bloom: number
  channels: Record<DenpaChannelId, ChannelLight>
}

export interface DenpaLightPatch {
  master?: number
  color?: string
  mode?: DenpaLightMode
  speed?: number
  bloom?: number
  channels?: Partial<Record<DenpaChannelId, Partial<ChannelLight>>>
}

export function createDenpaLightState(): DenpaLightState {
  const tube = (color = '#ff6110'): ChannelLight => ({ color, intensity: 1, enabled: true })
  return {
    master: 1,
    color: '#ff6110',
    mode: 'steady',
    speed: 1,
    bloom: 0.55,
    channels: {
      den: tube(),
      ha: tube(),
      machi: tube(),
      dot: tube('#ff7a2a'),
      outer: tube('#ff6110'),
      trim: tube('#ff4d0a'),
      bay: { color: '#732004', intensity: 1, enabled: true },
    },
  }
}

export function patchDenpaLights(state: DenpaLightState, patch: DenpaLightPatch) {
  if (patch.master !== undefined) state.master = patch.master
  if (patch.mode !== undefined) state.mode = patch.mode
  if (patch.speed !== undefined) state.speed = patch.speed
  if (patch.bloom !== undefined) state.bloom = patch.bloom
  if (patch.color !== undefined) {
    state.color = patch.color
    for (const id of TINTED) state.channels[id].color = patch.color
  }
  if (patch.channels) {
    for (const id of DENPA_CHANNELS) {
      const next = patch.channels[id]
      if (!next) continue
      Object.assign(state.channels[id], next)
    }
  }
}

/** 這一幀這個通道要乘上的亮度。0 是關掉，1 是面板上的設定。 */
export function channelEnvelope(id: DenpaChannelId, state: DenpaLightState, time: number, reducedMotion: boolean) {
  const channel = state.channels[id]
  if (!channel.enabled) return 0
  const level = channel.intensity * state.master
  if (reducedMotion || state.mode === 'steady') return level

  const speed = Math.max(0.05, state.speed)
  if (state.mode === 'breathe') {
    return level * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(time * speed * 1.7)))
  }
  if (state.mode === 'chase') {
    const order: DenpaChannelId[] = ['den', 'ha', 'machi']
    const index = order.indexOf(id)
    if (index === -1) return level * (id === 'bay' ? 0.7 : 0.9)
    const active = Math.floor(time * speed * 0.85) % order.length
    return level * (active === index ? 1 : 0.16)
  }
  const wave = Math.sin(time * speed * 8.5 + indexOf(id) * 1.7) * Math.sin(time * speed * 3.1 + indexOf(id))
  return level * (0.4 + 0.6 * (0.5 + 0.5 * wave))
}

function indexOf(id: DenpaChannelId) {
  return DENPA_CHANNELS.indexOf(id)
}
