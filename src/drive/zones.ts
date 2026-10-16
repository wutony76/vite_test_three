// 作品區域：開到發光圓台上，就會出現卡片，按 Enter 進入
import * as THREE from 'three'

export type ZoneInfo = { id: string; title: string; description: string; href: string; color: string }

export const ZONES: ZoneInfo[] = [
  { id: 'market', title: '夜市燈光', description: '霓虹燈、LED 燈條、跑馬燈，熱鬧的台灣夜市', href: '/market.html', color: '#ff4f8b' },
  { id: 'lights', title: '燈光互動網頁', description: '點光源、聚光燈、面光源、霓虹與光暈', href: '/lights.html', color: '#ffb347' },
  { id: 'web', title: '粒子互動網頁', description: '兩萬顆粒子，捲動變形、滑鼠推開', href: '/web.html', color: '#a77bff' },
  { id: 'diorama', title: '3D 店面導覽', description: '巷口咖啡店，日夜與下雨、點物品看故事', href: '/diorama.html', color: '#4fc3a1' },
  { id: 'product', title: '商品 3D 展示', description: '真實 glTF 模型，切換配色、加入購物車', href: '/product.html', color: '#4fa3ff' },
  { id: 'house', title: '雞排與狸貓', description: '漂浮的大雞排，和捧著章魚燒的大狸貓', href: '/house.html', color: '#ffd23f' },
]

export const ZONE_RADIUS = 3.2
const RING_RADIUS = 22

/** 每個區域在小島上的位置：平均分佈在半徑 22 的圓上 */
export function zonePosition(index: number) {
  // 從正前方偏一點開始，避開出生點前方的大字
  const angle = (index / ZONES.length) * Math.PI * 2 + Math.PI / 6
  return new THREE.Vector3(Math.sin(angle) * RING_RADIUS, 0, -Math.cos(angle) * RING_RADIUS)
}

/** 地面圓台：外圈發光環 + 內圈平台 + 平躺的名稱文字 */
export function buildZonePad(zone: ZoneInfo) {
  const group = new THREE.Group()
  const color = new THREE.Color(zone.color)

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(ZONE_RADIUS, ZONE_RADIUS + 0.2, 0.12, 48),
    new THREE.MeshStandardMaterial({ color: color.clone().lerp(new THREE.Color('#ffffff'), 0.55), roughness: 0.7 }),
  )
  base.position.y = 0.06
  base.receiveShadow = true

  // 發光環：車子進入時變亮（由 main 調整 emissiveIntensity）
  const ringMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ZONE_RADIUS, 0.12, 12, 64), ringMaterial)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.14

  // 名稱：Canvas 畫字 → 貼在平躺的平面上
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#2b2b33'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '900 92px "PingFang TC", "Noto Sans TC", sans-serif'
  ctx.fillText(zone.title, 256, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const label = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.3), new THREE.MeshBasicMaterial({ map: texture, transparent: true }))
  label.rotation.x = -Math.PI / 2
  label.position.y = 0.13

  group.add(base, ring, label)
  return { group, ringMaterial }
}
