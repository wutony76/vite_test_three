// 底座：大雞排 + 路燈（沒有地面與馬路，整塊漂浮在天空中）
import * as THREE from 'three'
import type { Materials } from './materials'
import { box, cylinder, group, hotspot } from './helpers'

export function buildStreet(M: Materials) {
  // 不要地面與馬路：雞排直接漂浮在天空中（surroundings 保留為空群組，World 不用改）
  const surroundings = new THREE.Group()

  // ── 底座：一大塊雞排（熱點）──
  const lot = hotspot(buildCutlet(M), 'cutlet')

  // ── 路燈（熱點）──
  const lamp = hotspot(group(6.3, 0, 4.9), 'lamp')
  lamp.add(
    cylinder(0.12, 0.16, 0.3, M.darkMetal, 0, 0.15, 0, 12),
    cylinder(0.07, 0.09, 5, M.darkMetal, 0, 2.5, 0, 12),
    // 燈臂往雞排外側（+z）伸出
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

/**
 * 大雞排：不規則外形的厚片 + 圓潤酥脆的邊 + 表面散落的麵衣碎屑
 * 頂面在 y = 0，店面和道具直接放在上面
 */
function buildCutlet(M: Materials) {
  const cutlet = new THREE.Group()

  // ── 外形：超橢圓（介於橢圓和圓角矩形之間）再加上不規則起伏 ──
  // |x/A|^N + |z/B|^N = 1；N 越大越接近方形，才蓋得住原本方形地塊的四個角
  const A = 8.8
  const B = 7
  const N = 3
  const outline = (angle: number) => {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    // 幾個不同頻率的 sin 疊加 → 邊緣凹凸不平，像真的炸雞排
    const wobble = 1 + 0.035 * Math.sin(angle * 3 + 1) + 0.025 * Math.sin(angle * 7 + 2) + 0.015 * Math.sin(angle * 13)
    return {
      x: A * Math.sign(c) * Math.abs(c) ** (2 / N) * wobble,
      z: B * Math.sign(s) * Math.abs(s) ** (2 / N) * wobble,
    }
  }
  const shape = new THREE.Shape()
  const SEGMENTS = 120
  for (let i = 0; i < SEGMENTS; i++) {
    const { x, z } = outline((i / SEGMENTS) * Math.PI * 2)
    // Shape 畫在 XY 平面；之後整塊轉 -90° 躺平時，shape 的 y 會變成世界的 -z
    if (i === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  }

  // ── 擠出成厚片：bevel（倒角）讓邊緣圓潤，像麵衣包住的厚邊 ──
  // 總厚度 = DEPTH + BEVEL × 2（上下各一段圓弧倒角）≈ 1.6 公尺
  const DEPTH = 0.9
  const BEVEL = 0.35
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL,
    bevelSize: 0.55,
    bevelSegments: 6,
    curveSegments: 1,
  })
  const slab = new THREE.Mesh(geometry, M.cutlet)
  // 擠出方向是 +z，轉 -90° 後變成往上（+y）
  slab.rotation.x = -Math.PI / 2
  // 擠出後的厚度範圍是 -BEVEL ~ DEPTH + BEVEL，往下移讓頂面剛好在 y = 0
  slab.position.y = -(DEPTH + BEVEL)
  slab.receiveShadow = true
  slab.castShadow = true
  cutlet.add(slab)

  // ── 麵衣碎屑：幾百顆小多面體 → InstancedMesh，只要 1 次 draw call ──
  const COUNT = 320
  const crumbs = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.07, 0), M.crumb, COUNT)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  const euler = new THREE.Euler()
  let placed = 0
  // 固定亂數：每次重新整理碎屑位置都一樣
  let seed = 5
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  while (placed < COUNT) {
    const x = (random() * 2 - 1) * A
    const z = (random() * 2 - 1) * B
    // 只放在雞排內側（避開倒角斜面）；建築底下看不到，也不放
    const inside = Math.abs(x / A) ** N + Math.abs(z / B) ** N < 0.8
    const underBuilding = x > -6.2 && x < 0.7 && z > -5.2 && z < 0.1
    if (!inside || underBuilding) continue
    position.set(x, 0.02, z)
    rotation.setFromEuler(euler.set(random() * 3, random() * 3, random() * 3))
    const size = 0.6 + random() * 1.2
    // 壓扁一點，像黏在表面的碎屑
    scale.set(size, size * 0.6, size)
    crumbs.setMatrixAt(placed++, matrix.compose(position, rotation, scale))
  }
  crumbs.castShadow = true
  crumbs.receiveShadow = true
  cutlet.add(crumbs)

  return cutlet
}
