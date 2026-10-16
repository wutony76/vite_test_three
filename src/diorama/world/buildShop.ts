// 店面建築：兩層樓磚造小店 + 頂樓（霓虹招牌、水塔、煙囪、串燈）
// 座標：建築群組的原點在建築底部中央；店面朝 +z（面向馬路）
import * as THREE from 'three'
import type { Materials } from './materials'
import { box, cylinder, group, hotspot, mesh } from './helpers'

// 建築尺寸（公尺）
const W = 6.5 // 寬（x）
const D = 5 // 深（z）
const H1 = 3.2 // 一樓高
const H = 6.2 // 總高
const ROOF = H + 0.26 // 屋頂面高度
const FRONT = D / 2 // 正面 z 座標

export function buildShop(M: Materials) {
  // 建築本體放在地塊左後方，正面剛好貼齊人行道（世界座標 z = 0）
  const building = group(-2.75, 0, -FRONT)

  // ── 本體：磚牆 + 樓層腰帶 + 屋簷 + 女兒牆 ──
  building.add(
    box(W, H, D, M.brick, 0, H / 2, 0),
    box(W + 0.16, 0.18, D + 0.16, M.cream, 0, H1 + 0.05, 0),
    box(W + 0.3, 0.26, D + 0.3, M.concrete, 0, H + 0.13, 0),
    // 女兒牆：屋頂四周的矮牆
    box(W + 0.3, 0.5, 0.15, M.concrete, 0, ROOF + 0.25, FRONT + 0.07),
    box(W + 0.3, 0.5, 0.15, M.concrete, 0, ROOF + 0.25, -FRONT - 0.07),
    box(0.15, 0.5, D + 0.3, M.concrete, W / 2 + 0.07, ROOF + 0.25, 0),
    box(0.15, 0.5, D + 0.3, M.concrete, -W / 2 - 0.07, ROOF + 0.25, 0),
    // 側牆排水管
    cylinder(0.06, 0.06, H, M.metal, W / 2 + 0.1, H / 2, -2.1, 8),
    // 側面一樓小窗
    box(0.08, 1.3, 1.5, M.cream, W / 2 + 0.03, 1.9, -0.9),
    box(0.1, 1.1, 1.3, M.windowDark, W / 2 + 0.04, 1.9, -0.9),
  )

  // ── 一樓店面（熱點：我們的故事）──
  // 群組原點放在正面牆底部，開場動畫從地面長出來
  const storefront = hotspot(group(0, 0, FRONT), 'storefront')
  // BoxGeometry 六個面的材質順序：+x、-x、+y、-y、+z（正面）、-z
  const signFaces = [M.trim, M.trim, M.trim, M.trim, M.sign, M.trim]
  // 雨棚：平面往外下斜（繞 x 軸轉 -65°）
  const awning = mesh(new THREE.PlaneGeometry(W - 0.6, 1.3), M.awning, 0, 3.0, 0.65)
  awning.rotation.x = -(Math.PI / 2 - 0.45)
  const valance = mesh(new THREE.PlaneGeometry(W - 0.6, 0.25), M.awning, 0, 2.6, 1.24)
  storefront.add(
    // 深綠色店面框
    box(W - 0.3, 2.9, 0.12, M.trim, 0, 1.45, 0.06),
    // 左大櫥窗、右小櫥窗、玻璃門（晚上透出暖光）
    box(2.4, 2.0, 0.05, M.shopGlass, -1.85, 1.4, 0.13),
    box(1.5, 2.0, 0.05, M.shopGlass, 2.15, 1.4, 0.13),
    box(1.15, 2.55, 0.06, M.darkWood, 0.35, 1.28, 0.12),
    box(0.95, 2.35, 0.05, M.shopGlass, 0.35, 1.25, 0.15),
    // 窗格直條
    box(0.06, 2.0, 0.08, M.trim, -1.85, 1.4, 0.15),
    box(0.06, 2.0, 0.08, M.trim, 2.15, 1.4, 0.15),
    // 踢腳板、外帶窗台、窗台上的外帶杯
    box(W - 0.3, 0.32, 0.16, M.darkWood, 0, 0.16, 0.08),
    box(2.6, 0.08, 0.45, M.wood, -1.85, 1.0, 0.32),
    cylinder(0.07, 0.055, 0.18, M.cream, -2.4, 1.13, 0.36, 10),
    cylinder(0.07, 0.055, 0.18, M.cream, -2.15, 1.13, 0.4, 10),
    // 店招燈箱
    box(5.6, 0.9, 0.22, signFaces, 0, 3.55, 0.12),
    awning,
    valance,
    // 側邊直立招牌（從正面右上角伸出來）
    box(0.5, 0.06, 0.06, M.darkMetal, W / 2 - 0.25, 5.65, 0.4),
    box(0.12, 1.5, 0.75, [M.bladeSign, M.bladeSign, M.trim, M.trim, M.trim, M.trim], W / 2 - 0.2, 4.85, 0.55),
  )

  // ── 二樓窗戶（熱點：烘豆室）──
  const roastery = hotspot(group(0, 4.1, FRONT), 'roastery')
  ;[-2.1, 0, 2.1].forEach((x, i) => {
    // 第三扇窗沒開燈、拉著窗簾（老闆的午睡角落）
    const lit = i < 2
    roastery.add(
      box(1.4, 1.5, 0.1, M.cream, x, 0.75, 0.05),
      box(1.2, 1.3, 0.06, lit ? M.windowLit : M.windowDark, x, 0.75, 0.09),
      box(0.05, 1.3, 0.1, M.cream, x, 0.75, 0.12),
      box(1.2, 0.05, 0.1, M.cream, x, 0.95, 0.12),
      box(1.55, 0.08, 0.28, M.concrete, x, 0, 0.14),
    )
    if (!lit) roastery.add(box(0.55, 1.15, 0.02, M.curtain, x - 0.3, 0.78, 0.13))
  })

  // ── 冷氣室外機（熱點）：掛在側牆，風扇朝 +x ──
  const ac = hotspot(group(W / 2, 0, 0), 'ac')
  const acUnit = (y: number, z: number) => {
    const grill = mesh(new THREE.CircleGeometry(0.27, 24), M.acGrill, 0.49, y, z)
    grill.rotation.y = Math.PI / 2
    return [
      box(0.46, 0.68, 0.9, M.acBody, 0.25, y, z),
      grill,
      box(0.5, 0.04, 0.06, M.darkMetal, 0.25, y - 0.37, z - 0.35),
      box(0.5, 0.04, 0.06, M.darkMetal, 0.25, y - 0.37, z + 0.35),
    ]
  }
  ac.add(...acUnit(4.7, -0.9), ...acUnit(0.38, 1.0))

  // ── 頂樓 ──
  // 煙囪（熱點）：烘豆機排煙管
  // 放在左前角：從預設視角看才不會和霓虹杯重疊
  const chimney = hotspot(group(-2.7, ROOF, 0.5), 'chimney')
  chimney.add(
    cylinder(0.2, 0.24, 1.7, M.darkMetal, 0, 0.85, 0),
    cylinder(0.3, 0.3, 0.06, M.darkMetal, 0, 1.6, 0),
    mesh(new THREE.ConeGeometry(0.36, 0.25, 16), M.darkMetal, 0, 1.85, 0),
  )

  // 不鏽鋼水塔（熱點）：台灣老房子屋頂的經典配備
  const tank = hotspot(group(1.8, ROOF, -1.3), 'tank')
  const dome = mesh(new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.stainless, 0, 1.9, 0)
  tank.add(
    ...[-0.4, 0.4].flatMap((x) => [-0.4, 0.4].map((z) => box(0.07, 0.8, 0.07, M.darkMetal, x, 0.4, z))),
    box(1.0, 0.06, 1.0, M.darkMetal, 0, 0.8, 0),
    cylinder(0.55, 0.55, 1.1, M.stainless, 0, 1.35, 0, 24),
    dome,
    // 水管
    cylinder(0.04, 0.04, 0.9, M.metal, 0.5, 0.45, 0.3, 8),
  )

  // 霓虹咖啡杯（熱點）
  const neon = hotspot(buildNeon(M), 'neon')
  neon.position.set(-0.4, ROOF, 0.7)
  // 稍微轉向右前方，從預設視角看起來比較正
  neon.rotation.y = 0.45

  // 屋頂串燈：沿著正面與右側女兒牆，每段之間微微下垂
  const lights = buildStringLights(M, [
    new THREE.Vector3(-W / 2, ROOF + 0.55, FRONT + 0.1),
    new THREE.Vector3(W / 2 + 0.1, ROOF + 0.55, FRONT + 0.1),
    new THREE.Vector3(W / 2 + 0.1, ROOF + 0.55, -FRONT),
  ])

  building.add(storefront, roastery, ac, chimney, tank, neon, lights)

  // 煙囪頂端的世界座標：煙霧從這裡冒出
  const chimneyTop = new THREE.Vector3(-2.7, ROOF + 2.0, 0.5).add(building.position)

  return {
    // 開場動畫依序長出（父物件要排在子物件前面）
    pieces: [building, storefront, roastery, ac, chimney, tank, lights, neon],
    chimneyTop,
  }
}

/** 霓虹咖啡杯：用 TubeGeometry 沿著曲線做出燈管 */
function buildNeon(M: Materials) {
  const neon = new THREE.Group()
  const BASE = 1.0 // 燈管離屋頂的高度

  // 鐵架：兩根柱子 + 橫桿
  neon.add(
    box(0.08, BASE + 0.6, 0.08, M.darkMetal, -0.9, (BASE + 0.6) / 2, -0.1),
    box(0.08, BASE + 0.6, 0.08, M.darkMetal, 0.9, (BASE + 0.6) / 2, -0.1),
    box(2.0, 0.06, 0.06, M.darkMetal, 0, BASE + 0.55, -0.1),
  )

  // 2D 座標點（燈管所在的平面）轉成 3D 曲線
  const curve = (points: [number, number][]) =>
    new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x, y + BASE, 0)))
  const tube = (path: THREE.Curve<THREE.Vector3>, material: THREE.Material) => {
    // TubeGeometry(路徑, 分段數, 管半徑, 圓周分段)
    const object = new THREE.Mesh(new THREE.TubeGeometry(path, 64, 0.05, 8), material)
    return object
  }

  // 杯身（U 形）、杯口、杯碟
  neon.add(
    tube(curve([[-0.8, 1.4], [-0.72, 0.6], [-0.55, 0.12], [0, 0], [0.55, 0.12], [0.72, 0.6], [0.8, 1.4]]), M.neon.pink),
    tube(new THREE.LineCurve3(new THREE.Vector3(-0.8, 1.4 + BASE, 0), new THREE.Vector3(0.8, 1.4 + BASE, 0)), M.neon.pink),
    tube(new THREE.LineCurve3(new THREE.Vector3(-1.15, -0.12 + BASE, 0), new THREE.Vector3(1.15, -0.12 + BASE, 0)), M.neon.pink),
  )

  // 杯耳：半圓弧
  const handle = new THREE.EllipseCurve(0.82, 0.85 + BASE, 0.32, 0.3, Math.PI / 2, -Math.PI / 2, true)
  const handlePoints = handle.getPoints(24).map((p) => new THREE.Vector3(p.x, p.y, 0))
  neon.add(tube(new THREE.CatmullRomCurve3(handlePoints), M.neon.pink))

  // 三道熱氣（藍色波浪線）
  ;[-0.38, 0, 0.38].forEach((x, i) => {
    const points: [number, number][] = []
    for (let t = 0; t <= 1; t += 0.125) points.push([x + Math.sin(t * Math.PI * 2 + i) * 0.1, 1.65 + t * (0.75 - i * 0.08)])
    neon.add(tube(curve(points), M.neon.cyan))
  })

  return neon
}

/** 串燈：燈泡用 InstancedMesh（幾十顆燈泡只要 1 次 draw call） */
function buildStringLights(M: Materials, corners: THREE.Vector3[]) {
  const lights = new THREE.Group()
  const positions: THREE.Vector3[] = []
  const SPACING = 0.42
  const SAG = 0.18

  for (let i = 0; i < corners.length - 1; i++) {
    const from = corners[i]
    const to = corners[i + 1]
    const count = Math.round(from.distanceTo(to) / SPACING)
    for (let j = 0; j <= count; j++) {
      const t = j / count
      const point = from.clone().lerp(to, t)
      // sin(πt)：兩端 0、中間最大 → 電線中間往下垂
      point.y -= Math.sin(Math.PI * t) * SAG
      positions.push(point)
    }
  }

  // 電線
  const wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints(positions), new THREE.LineBasicMaterial({ color: 0x222222 }))
  // 燈泡
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 10, 8), M.bulb, positions.length)
  const matrix = new THREE.Matrix4()
  positions.forEach((point, i) => bulbs.setMatrixAt(i, matrix.makeTranslation(point.x, point.y - 0.08, point.z)))
  lights.add(wire, bulbs)
  return lights
}
