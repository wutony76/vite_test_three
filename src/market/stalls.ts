// 夜市攤位資料：名稱、位置、配色、霓虹圖示、台面道具
// 左側攤位面向 +x、右側面向 -x，都朝向街道中央
import type { NeonIconId } from './neonIcons'

export type PropKind = 'cutlet' | 'cups' | 'takoyaki' | 'pot' | 'balloons' | 'corn' | 'claw' | 'ice'

export type StallInfo = {
  id: string
  name: string
  side: 'left' | 'right'
  z: number
  // 雨棚條紋兩色、招牌底色 / 字色、燈條與工作燈的主色
  canopy: [string, string]
  board: [string, string]
  light: string
  neon: NeonIconId
  props: PropKind
  // 食物攤會冒熱氣
  steam: boolean
}

export const STALLS: StallInfo[] = [
  { id: 'cutlet', name: '大雞排', side: 'left', z: 5, canopy: ['#d62828', '#f7f3e3'], board: ['#2a0a0a', '#ffd23f'], light: '#ff9a3c', neon: 'drumstick', props: 'cutlet', steam: true },
  { id: 'boba', name: '珍珠奶茶', side: 'right', z: 5, canopy: ['#6a4c93', '#f7f3e3'], board: ['#1b0f2e', '#ffd9a0'], light: '#ff7ad9', neon: 'boba', props: 'cups', steam: false },
  { id: 'takoyaki', name: '章魚燒', side: 'left', z: 1, canopy: ['#f77f00', '#f7f3e3'], board: ['#2b1400', '#ffffff'], light: '#ffb347', neon: 'takoyaki', props: 'takoyaki', steam: true },
  { id: 'tofu', name: '臭豆腐', side: 'right', z: 1, canopy: ['#2a9d8f', '#f7f3e3'], board: ['#06221f', '#ffe066'], light: '#5ef0d0', neon: 'tofu', props: 'pot', steam: true },
  { id: 'balloon', name: '射氣球', side: 'left', z: -3, canopy: ['#3a86ff', '#f7f3e3'], board: ['#081a3a', '#ff5fa2'], light: '#4fa3ff', neon: 'balloon', props: 'balloons', steam: false },
  { id: 'corn', name: '烤玉米', side: 'right', z: -3, canopy: ['#bc6c25', '#f7f3e3'], board: ['#2a1606', '#ffd23f'], light: '#ffc14d', neon: 'corn', props: 'corn', steam: true },
  { id: 'claw', name: '夾娃娃', side: 'left', z: -7, canopy: ['#ff006e', '#f7f3e3'], board: ['#2a0015', '#7df9ff'], light: '#c77dff', neon: 'claw', props: 'claw', steam: false },
  { id: 'ice', name: '芒果剉冰', side: 'right', z: -7, canopy: ['#ffb703', '#f7f3e3'], board: ['#062a33', '#ffffff'], light: '#7df9ff', neon: 'ice', props: 'ice', steam: false },
]
