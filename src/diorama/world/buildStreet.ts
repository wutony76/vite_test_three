// 街道：地塊（微縮模型的底座）、人行道、停車格、馬路、路燈
import * as THREE from 'three'
import type { Materials } from './materials'
import { box, cylinder, group, hotspot } from './helpers'

export function buildStreet(M: Materials) {
  // ── 遠處地面與馬路：不參與開場動畫，一開始就在 ──
  const surroundings = new THREE.Group()
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), M.ground)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.42
  ground.receiveShadow = true

  // 馬路沿 x 方向延伸，在地塊前方（z 6.5 ~ 14）
  const ROAD_Z = 10.25
  const road = box(160, 0.1, 7.5, M.asphalt, 0, -0.36, ROAD_Z)
  road.castShadow = false

  // 中央虛線：很多段一樣的白線 → InstancedMesh，一次畫完
  const DASHES = 40
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 0.012, 0.16), M.lineWhite, DASHES)
  const matrix = new THREE.Matrix4()
  for (let i = 0; i < DASHES; i++) dashes.setMatrixAt(i, matrix.makeTranslation(-78 + i * 4, -0.305, ROAD_Z))
  dashes.receiveShadow = true

  surroundings.add(
    ground,
    road,
    dashes,
    // 路邊白線
    box(160, 0.012, 0.12, M.lineWhite, 0, -0.305, 6.85),
    box(160, 0.012, 0.12, M.lineWhite, 0, -0.305, 13.65),
  )

  // ── 地塊：像模型底座的一塊厚板，上面鋪地面 ──
  const lot = group(0, 0, 0)
  lot.add(
    box(14, 0.42, 11, M.slab, 0, -0.21, 0),
    // 右側停車場的水泥地
    box(6.5, 0.02, 5.5, M.concrete, 3.75, 0.01, -2.75),
    // 人行道地磚
    box(14, 0.03, 5.5, M.paving, 0, 0.015, 2.75),
    // 路緣石
    box(14, 0.12, 0.25, M.curb, 0, 0.03, 5.38),
  )
  // 停車格白線
  for (const x of [1.0, 3.25, 5.5]) lot.add(box(0.08, 0.012, 4.2, M.lineWhite, x, 0.03, -2.9))
  lot.add(box(4.6, 0.012, 0.08, M.lineWhite, 3.25, 0.03, -5.0))

  // ── 路燈（熱點）──
  const lamp = hotspot(group(6.3, 0, 4.9), 'lamp')
  lamp.add(
    cylinder(0.12, 0.16, 0.3, M.darkMetal, 0, 0.15, 0, 12),
    cylinder(0.07, 0.09, 5, M.darkMetal, 0, 2.5, 0, 12),
    // 燈臂往馬路方向（+z）伸出
    box(0.08, 0.08, 1.4, M.darkMetal, 0, 4.92, 0.62),
    box(0.34, 0.16, 0.6, M.darkMetal, 0, 4.86, 1.3),
    box(0.28, 0.03, 0.46, M.lampHead, 0, 4.77, 1.3),
  )

  // 路燈的光：SpotLight 像手電筒，只照一個圓錐範圍
  const lampLight = new THREE.SpotLight(0xffc98a, 0, 16, 0.75, 0.6, 1.4)
  lampLight.position.set(6.3, 4.7, 6.2)
  lampLight.target.position.set(6.0, 0, 6.8)

  return {
    surroundings,
    pieces: [lot, lamp],
    lampLight,
  }
}
