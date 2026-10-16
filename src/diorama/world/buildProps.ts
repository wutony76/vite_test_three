// 店門口的道具：機車、生豆麻袋、桂花樹、黑板立牌、長椅、店貓
import * as THREE from 'three'
// 圓角方塊：比一般方塊柔和，適合麻袋、機車車殼
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Materials } from './materials'
import { box, cylinder, group, hotspot, mesh } from './helpers'

const rounded = (w: number, h: number, d: number, radius: number, material: THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material, x, y, z)

export function buildProps(M: Materials) {
  const scooter = hotspot(buildScooter(M), 'scooter')
  scooter.position.set(3.4, 0, -2.4)
  scooter.rotation.y = -0.55

  // ── 生豆麻袋：下面兩袋、上面一袋 ──
  const sacks = hotspot(group(-5.3, 0, 1.15), 'sacks')
  const top = rounded(1.0, 0.44, 0.7, 0.18, M.sack, 0.02, 0.64, 0.02)
  top.rotation.y = 0.12
  sacks.add(
    rounded(1.0, 0.44, 0.7, 0.18, M.sack, -0.52, 0.22, 0),
    rounded(1.0, 0.44, 0.7, 0.18, M.sack, 0.52, 0.22, 0.05),
    top,
  )

  // ── 桂花樹：圓形花台 + 樹幹 + 幾團低多邊形樹葉 ──
  const tree = hotspot(group(1.6, 0, 2.3), 'tree')
  // 樹葉放在獨立群組，之後讓它整團輕輕搖晃
  const foliage = group(0, 2.2, 0)
  const leafBall = (r: number, material: THREE.Material, x: number, y: number, z: number) =>
    // IcosahedronGeometry(半徑, 細分 0) = 20 面體，搭配 flatShading 就是低多邊形風格
    mesh(new THREE.IcosahedronGeometry(r, 0), material, x, y, z)
  foliage.add(
    leafBall(0.9, M.leaf, 0, 0.5, 0),
    leafBall(0.65, M.leafLight, 0.5, 0.15, 0.3),
    leafBall(0.6, M.leaf, -0.45, 0.25, -0.2),
    leafBall(0.55, M.leafLight, 0.1, 1.05, -0.1),
  )
  // 桂花：黃色小花點綴在樹葉表面
  for (let i = 0; i < 16; i++) {
    const angle = i * 2.4
    const height = 0.1 + (i % 5) * 0.22
    foliage.add(leafBall(0.07, M.blossom, Math.cos(angle) * 0.85, height, Math.sin(angle) * 0.85))
  }
  tree.add(
    cylinder(0.6, 0.55, 0.5, M.concrete, 0, 0.25, 0, 20),
    cylinder(0.52, 0.52, 0.04, M.darkWood, 0, 0.5, 0, 20),
    cylinder(0.09, 0.14, 2.3, M.trunk, 0, 1.4, 0, 8),
    foliage,
  )

  // ── 黑板立牌（A 字型）──
  const board = hotspot(group(-0.4, 0, 1.9), 'board')
  board.rotation.y = 0.4
  const front = box(0.7, 1.0, 0.04, [M.wood, M.wood, M.wood, M.wood, M.chalkboard, M.wood], 0, 0.5, 0.12)
  front.rotation.x = -0.2
  const back = box(0.7, 1.0, 0.04, M.wood, 0, 0.5, -0.12)
  back.rotation.x = 0.2
  board.add(front, back)

  // ── 窗邊長椅（不是熱點）──
  const bench = group(-4.6, 0, 0.75)
  bench.add(
    box(1.8, 0.08, 0.42, M.wood, 0, 0.46, 0),
    box(0.08, 0.42, 0.36, M.darkWood, -0.75, 0.21, 0),
    box(0.08, 0.42, 0.36, M.darkWood, 0.75, 0.21, 0),
  )

  // ── 店貓（熱點）：橘貓坐在麻袋上、灰貓趴在人行道 ──
  const orange = buildCat(M.catOrange, M.catWhite, 'sit')
  orange.cat.position.set(-5.25, 0.86, 1.15)
  orange.cat.rotation.y = 0.7
  const grey = buildCat(M.catGrey, M.catWhite, 'lie')
  grey.cat.position.set(0.3, 0.03, 3.6)
  grey.cat.rotation.y = 2.4
  hotspot(orange.cat, 'cats')
  hotspot(grey.cat, 'cats')

  return {
    pieces: [sacks, scooter, tree, board, bench, orange.cat, grey.cat],
    foliage,
    tails: [orange.tail, grey.tail],
  }
}

/** 復古機車：車頭朝 +z */
function buildScooter(M: Materials) {
  const scooter = new THREE.Group()
  const wheel = (z: number) => {
    // 圓柱轉 90°：讓圓面朝向側邊，變成輪子
    const tire = cylinder(0.26, 0.26, 0.13, M.tire, 0, 0.26, z, 20)
    tire.rotation.z = Math.PI / 2
    const hub = cylinder(0.11, 0.11, 0.14, M.metal, 0, 0.26, z, 12)
    hub.rotation.z = Math.PI / 2
    return [tire, hub]
  }
  const shield = rounded(0.52, 0.9, 0.1, 0.04, M.scooter, 0, 0.78, 0.42)
  shield.rotation.x = -0.25
  const handlebar = cylinder(0.025, 0.025, 0.78, M.metal, 0, 1.36, 0.5, 8)
  handlebar.rotation.z = Math.PI / 2
  const headlight = cylinder(0.08, 0.08, 0.05, M.headlight, 0, 1.36, 0.66, 16)
  headlight.rotation.x = Math.PI / 2

  scooter.add(
    ...wheel(0.68),
    ...wheel(-0.62),
    // 腳踏板、後車殼、坐墊、前土除、轉向柱、車頭
    box(0.46, 0.08, 0.74, M.scooter, 0, 0.36, 0.05),
    rounded(0.62, 0.56, 0.82, 0.2, M.scooter, 0, 0.62, -0.46),
    rounded(0.42, 0.13, 0.72, 0.06, M.seat, 0, 0.96, -0.4),
    rounded(0.3, 0.24, 0.5, 0.1, M.scooter, 0, 0.44, 0.64),
    cylinder(0.04, 0.04, 0.55, M.metal, 0, 1.1, 0.5, 8),
    rounded(0.32, 0.18, 0.2, 0.06, M.scooter, 0, 1.36, 0.55),
    shield,
    handlebar,
    headlight,
    // 後照鏡
    cylinder(0.05, 0.05, 0.02, M.metal, -0.36, 1.58, 0.48, 12),
    cylinder(0.05, 0.05, 0.02, M.metal, 0.36, 1.58, 0.48, 12),
    box(0.02, 0.22, 0.02, M.metal, -0.36, 1.46, 0.48),
    box(0.02, 0.22, 0.02, M.metal, 0.36, 1.46, 0.48),
  )
  // 停車時用側柱撐著，車身微微傾斜
  scooter.rotation.z = 0.06
  const wrapper = new THREE.Group()
  wrapper.add(scooter)
  return wrapper
}

/** 貓：用球體縮放組合；尾巴放在獨立群組，之後讓它擺動 */
function buildCat(fur: THREE.Material, chest: THREE.Material, pose: 'sit' | 'lie') {
  const cat = new THREE.Group()
  const ball = (r: number, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const object = mesh(new THREE.SphereGeometry(r, 16, 12), material, x, y, z)
    object.scale.set(sx, sy, sz)
    return object
  }
  const ear = (x: number, y: number, z: number) => mesh(new THREE.ConeGeometry(0.05, 0.11, 4), fur, x, y, z)

  const sitting = pose === 'sit'
  const head = sitting ? new THREE.Vector3(0, 0.5, 0.06) : new THREE.Vector3(0, 0.2, 0.36)
  cat.add(
    sitting ? ball(0.2, fur, 0, 0.22, 0, 1, 1.3, 1) : ball(0.2, fur, 0, 0.14, 0, 1, 0.7, 1.9),
    sitting ? ball(0.12, chest, 0, 0.26, 0.1, 1, 1.3, 0.8) : ball(0.1, chest, 0, 0.1, 0.22, 1.2, 0.6, 1),
    ball(0.14, fur, head.x, head.y, head.z),
    ball(0.06, chest, head.x, head.y - 0.04, head.z + 0.11),
    ear(head.x - 0.08, head.y + 0.13, head.z),
    ear(head.x + 0.08, head.y + 0.13, head.z),
  )

  // 尾巴：沿曲線的細管；group 的原點在屁股，旋轉時以屁股為軸心
  const tail = new THREE.Group()
  tail.position.set(0, sitting ? 0.08 : 0.12, sitting ? -0.18 : -0.36)
  const tailCurve = sitting
    ? new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.2, -0.05, -0.1), new THREE.Vector3(0.32, 0.02, 0.12)])
    : new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.02, -0.25), new THREE.Vector3(0.22, 0.05, -0.4)])
  tail.add(mesh(new THREE.TubeGeometry(tailCurve, 16, 0.035, 6), fur))
  cat.add(tail)

  return { cat, tail }
}
