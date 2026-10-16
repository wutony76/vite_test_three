// 店門口的道具：機車、生豆麻袋、桂花樹、黑板立牌、長椅、店貓、拿章魚燒的大狸貓
import * as THREE from 'three'
// 圓角方塊：比一般方塊柔和，適合麻袋、機車車殼
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Materials } from './materials'
import { box, cylinder, group, hotspot, mesh } from './helpers'

const rounded = (w: number, h: number, d: number, radius: number, material: THREE.Material, x = 0, y = 0, z = 0) =>
  mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material, x, y, z)

export function buildProps(M: Materials) {
  const scooter = hotspot(buildScooter(M), 'scooter')
  // 停在桂花樹和狸貓之間的空地（原本的位置會被大狸貓擋住）
  scooter.position.set(3.5, 0, 1.3)
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

  // ── 大狸貓（熱點）：站在雞排右側，約 1.5 層樓高，雙手捧著一盒章魚燒 ──
  const tanuki = buildTanuki(M)
  hotspot(tanuki.root, 'tanuki')
  // 放在機車右前方，避免擋住機車；整隻（含尾巴）仍在雞排範圍內
  tanuki.root.position.set(6.8, 0, 0.6)
  // 面向預設攝影機的方向（攝影機在右前方）
  tanuki.root.rotation.y = 0.45

  return {
    pieces: [sacks, scooter, tree, board, bench, orange.cat, grey.cat, tanuki.root],
    foliage,
    tails: [orange.tail, grey.tail],
    // 其他每幀動畫（狸貓呼吸、點頭、搖尾巴）
    animations: [tanuki.animate],
  }
}

/**
 * 狸貓：用球體、膠囊組合的Q版造型，臉朝 +z
 * 先用「真實比例」（約 1.6 公尺）建模，最後依量到的高度整隻放大到 TARGET_HEIGHT
 */
function buildTanuki(M: Materials) {
  const TARGET_HEIGHT = 4.7 // 約 1.5 層樓（一樓高 3.2 公尺）

  const ball = (r: number, material: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) => {
    const object = mesh(new THREE.SphereGeometry(r, 20, 14), material, x, y, z)
    object.scale.set(sx, sy, sz)
    return object
  }

  // root：放在場景裡的位置；model：被放大的本體（開場動畫縮放 root，不會和這裡的放大互相干擾）
  const root = new THREE.Group()
  const model = new THREE.Group()
  root.add(model)

  // ── 身體 ──
  const body = new THREE.Group()
  body.add(
    ball(0.5, M.tanukiFur, 0, 0.62, 0, 1, 1.1, 0.9),
    // 圓滾滾的米白肚子
    ball(0.36, M.tanukiCream, 0, 0.6, 0.27, 1, 1.1, 0.6),
    // 腳
    ball(0.15, M.tanukiDark, -0.2, 0.08, 0.08, 1, 0.6, 1.3),
    ball(0.15, M.tanukiDark, 0.2, 0.08, 0.08, 1, 0.6, 1.3),
  )

  // ── 頭：狸貓的特徵是眼睛周圍的深色「眼罩」和米白色的嘴邊 ──
  const head = new THREE.Group()
  head.position.set(0, 1.28, 0.02)
  head.add(
    ball(0.34, M.tanukiFur, 0, 0, 0, 1.08, 0.95, 1),
    ball(0.16, M.tanukiCream, 0, -0.09, 0.27, 1.25, 0.8, 1),
    ball(0.05, M.eye, 0, -0.04, 0.43),
    ...[-1, 1].flatMap((side) => [
      // 眼罩、眼睛、眼睛反光點
      ball(0.11, M.tanukiDark, side * 0.13, 0.03, 0.27, 1.25, 0.85, 0.45),
      ball(0.04, M.eye, side * 0.13, 0.04, 0.31),
      ball(0.013, M.eyeShine, side * 0.12, 0.06, 0.348),
      // 耳朵
      ball(0.11, M.tanukiDark, side * 0.23, 0.26, -0.02, 1, 1, 0.5),
    ]),
  )

  // ── 手臂：從肩膀往前伸，捧著盤子 ──
  const arm = (side: number) => {
    const object = mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 10), M.tanukiDark, side * 0.32, 0.82, 0.3)
    object.rotation.set(-1.1, 0, side * 0.45)
    return object
  }

  // ── 章魚燒：木舟盤 + 6 顆 ──
  const tray = new THREE.Group()
  tray.position.set(0, 0.8, 0.5)
  // 盤子稍微往攝影機傾斜，看得到裡面的章魚燒
  tray.rotation.x = 0.2
  tray.add(
    box(0.52, 0.04, 0.34, M.boat, 0, 0, 0),
    box(0.52, 0.07, 0.02, M.boat, 0, 0.04, 0.17),
    box(0.52, 0.07, 0.02, M.boat, 0, 0.04, -0.17),
    box(0.02, 0.07, 0.34, M.boat, 0.26, 0.04, 0),
    box(0.02, 0.07, 0.34, M.boat, -0.26, 0.04, 0),
  )
  // 球體只取上半部（thetaLength）→ 蓋在章魚燒頂端的醬汁
  const sauceCap = new THREE.SphereGeometry(0.074, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.42)
  for (const x of [-0.15, 0, 0.15]) {
    for (const z of [-0.075, 0.075]) {
      tray.add(ball(0.07, M.takoyaki, x, 0.09, z), mesh(sauceCap, M.sauce, x, 0.093, z))
      // 海苔粉：幾個綠色小點
      tray.add(box(0.016, 0.006, 0.016, M.aonori, x + 0.02, 0.163, z - 0.01), box(0.014, 0.006, 0.014, M.aonori, x - 0.025, 0.16, z + 0.015))
    }
  }
  // 美乃滋：一條白色細管在章魚燒上來回 Z 字形
  const mayoPath = new THREE.CatmullRomCurve3(
    [-0.2, -0.1, 0, 0.1, 0.2].flatMap((x, i) => [new THREE.Vector3(x, 0.165, i % 2 ? 0.09 : -0.09)]),
  )
  tray.add(mesh(new THREE.TubeGeometry(mayoPath, 48, 0.008, 6), M.mayo))
  // 柴魚片：幾片翹起來的薄片
  for (let i = 0; i < 6; i++) {
    const flake = mesh(new THREE.PlaneGeometry(0.05, 0.035), M.bonito, -0.15 + i * 0.06, 0.175, (i % 2 ? 1 : -1) * 0.03)
    flake.rotation.set(-0.6 + i * 0.3, i, 0.4)
    tray.add(flake)
  }
  // 竹籤插在一顆章魚燒上
  const pick = cylinder(0.006, 0.006, 0.22, M.boat, 0.15, 0.2, 0.075, 6)
  pick.rotation.z = -0.35
  tray.add(pick)

  // ── 尾巴：粗粗的條紋尾巴（棕、深色交錯），從屁股往後再往上翹 ──
  const tail = new THREE.Group()
  tail.position.set(0, 0.38, -0.38)
  const segments = [
    { r: 0.17, y: 0, z: 0, m: M.tanukiFur },
    { r: 0.19, y: 0.04, z: -0.2, m: M.tanukiDark },
    { r: 0.19, y: 0.12, z: -0.38, m: M.tanukiFur },
    { r: 0.16, y: 0.24, z: -0.52, m: M.tanukiDark },
  ]
  for (const segment of segments) tail.add(ball(segment.r, segment.m, 0, segment.y, segment.z))

  model.add(body, head, arm(-1), arm(1), tray, tail)

  // 依實際高度放大到目標高度
  const height = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).y
  model.scale.setScalar(TARGET_HEIGHT / height)

  // 每幀動畫：呼吸（身體微微脹縮）、歪頭、搖尾巴
  const animate = (elapsed: number) => {
    body.scale.y = 1 + Math.sin(elapsed * 1.8) * 0.015
    head.rotation.z = Math.sin(elapsed * 0.9) * 0.07
    head.position.y = 1.28 + Math.sin(elapsed * 1.8) * 0.008
    tail.rotation.y = Math.sin(elapsed * 2.2) * 0.35
  }

  return { root, animate }
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
