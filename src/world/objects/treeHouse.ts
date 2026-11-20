import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildStumpGeometries } from './treeStump';
import { createRng, PartBucket } from './partBucket';
import { TREE_HOUSE_LAYOUT_DEFAULT, type TreeHouseLayout } from './treeHouseLayout';

/**
 * 綠球上的「豬豬樹屋」：圓滾滾的豬造型小屋，蓋在樹幹撐起來的方形木筏平台上（四周原木欄杆）。
 *   - 底座（卡通木頭）：樹墩幾何拉高當樹幹（樹根外張當底座）＋四根彎樹枝斜撐＋方形木筏與欄杆＋門口梯子＋背後垂下的麻繩，
 *     紋路是 shader 即時算的卡通色塊與描線（放大不糊）；木筏大小、樹幹粗細可調
 *   - 豬屋：壓扁的大圓球身體、正面凸出的拱形門廊（白色半截木門）、門上方的豬鼻子（兩個鼻孔）、
 *     一垂一翹的耳朵、頂上捲捲的尾巴、左側圓窗＋撐開的圓木板、左後方吊著金色鈴鐺、門邊小白花
 *
 * 模型座標：木筏寬約 1.2，y 朝上、地面在 y = 0，+z 是正面（門）。
 *
 * 效能：同材質零件用 mergeGeometries 合併、顏色存頂點色 → 豬屋 2 個 mesh、支架 3 個 mesh。
 */

// ── 1. 小工具 ──

const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/** 位置、旋轉（弧度）、縮放 → 4x4 矩陣 */
function m4(
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] | number = 1,
) {
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  tmpQuat.setFromEuler(tmpEuler.set(rotation[0], rotation[1], rotation[2]));
  return new THREE.Matrix4().compose(new THREE.Vector3(...position), tmpQuat, new THREE.Vector3(s[0], s[1], s[2]));
}

/** 在基準色上隨機亮一點／暗一點，手工感 */
function jitter(hex: string, rng: () => number, amount = 0.06) {
  return new THREE.Color(hex).offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * amount);
}

/** 拱形（下方長方形＋上方半圓），給門洞、門板、門框用 */
function archShape(width: number, height: number) {
  const r = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-r, 0);
  shape.lineTo(r, 0);
  shape.lineTo(r, height - r);
  shape.absarc(0, height - r, r, 0, Math.PI, false);
  shape.lineTo(-r, 0);
  return shape;
}

function archPath(width: number, height: number) {
  const r = width / 2;
  const path = new THREE.Path();
  path.moveTo(-r, 0);
  path.lineTo(r, 0);
  path.lineTo(r, height - r);
  path.absarc(0, height - r, r, 0, Math.PI, false);
  path.lineTo(-r, 0);
  return path;
}

function extrude(shape: THREE.Shape, depth: number, bevel = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 16,
  });
  return geometry;
}

// ── 2. 顏色 ──

const COLORS = {
  doorway: '#3a1f1a',
  halfDoor: '#efe8dc',
  plankLine: '#c9bfae',
  nostril: '#5a2f2a',
  gold: '#e8b23a',
  stick: '#7a4a2a',
  shutter: '#ece5d7',
  hinge: '#8fbf7a',
  petal: '#fbf8f2',
};

// ── 3. 建造 ──

type BuildOptions = {
  houseScale: number;
  supportHeight: number;
  /** 木筏大小倍率（邊長、原木數量、欄杆一起變） */
  raftSize: number;
  /** 樹幹粗細倍率 */
  trunkWidth: number;
  trunkSeed: number;
  bodyColor: string;
  /** 耳朵往前（+）／往後（−）繞頭的角度（°） */
  earForward: number;
  /** 耳朵厚度倍率 */
  earThickness: number;
  /** 耳朵大小倍率 */
  earSize: number;
};

/** 豬屋身體表面上某個方位、仰角的位置矩陣（局部 +z 朝外）；芭蕉葉也用它找位置 */
type BodySurface = (azimuthDeg: number, elevationDeg: number, out?: number, upright?: boolean) => THREE.Matrix4;

type BuiltParts = {
  /** 樹幹支架（樹墩幾何＋程序化紋路），已經擺好位置、縮放 */
  trunk: THREE.Group;
  /** 斜撐樹枝（也用樹皮紋路，但座標單位不同，另外一個材質實例） */
  braces: THREE.BufferGeometry;
  /** 木筏平台＋欄杆（淺色原木） */
  raft: THREE.BufferGeometry;
  /** 底座（木筏麻繩等）的合併幾何 */
  buckets: Record<'paint' | 'metal', THREE.BufferGeometry | null>;
  /** 豬屋本體的合併幾何（原點在豬屋正下方，整組可以在平台上移動、旋轉） */
  houseBuckets: Record<'paint' | 'metal', THREE.BufferGeometry | null>;
  /** 樹幹的縮放（給 shader 算紋路拉伸） */
  trunkScale: THREE.Vector3;
  surface: BodySurface;
  /** 豬屋身體（橢球）的中心與半徑，給拖曳芭蕉葉時用的隱形代理 mesh */
  bodyCenter: THREE.Vector3;
  bodyRadii: THREE.Vector3;
};

/** 樹幹寬度佔模型的比例（再乘 trunkWidth）；斜撐、木筏的紋路也用它換算成同樣密度 */
const TRUNK_WIDTH = 0.34;
/** 木頭紋路以「樹墩座標」為準設計；模型座標要乘這個倍率，紋路密度才一致 */
const WOOD_STRETCH = 1 / TRUNK_WIDTH;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * 讓普通幾何也能用樹墩的樹皮 shader：補上 shader 需要的頂點屬性。
 * 少了 aAxis，shader 裡 normalize(0 向量) 會得到 NaN，整段變黑。
 */
function asBark(geometry: THREE.BufferGeometry, axis: THREE.Vector3) {
  const count = geometry.attributes.position.count;
  const axes = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) axes.set([axis.x, axis.y, axis.z], i * 3);
  geometry.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(count), 1));
  geometry.setAttribute('aCoord', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aAxis', new THREE.BufferAttribute(axes, 3));
  geometry.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(count).fill(0.95), 1));
  geometry.deleteAttribute('uv');
  return geometry;
}

function buildTreeHouse(options: BuildOptions, trunkMaterial: THREE.Material): BuiltParts {
  const rng = createRng(options.trunkSeed * 101 + 5);
  let paint = new PartBucket();
  let metal = new PartBucket();
  const body = new THREE.Color(options.bodyColor);
  const shade = (lightness: number, saturation = 0) => body.clone().offsetHSL(0, saturation, lightness);

  // ── 3-1. 樹幹支架：拿樹墩幾何拉高、變細，樹根外張剛好當底座 ──
  const supportTop = 0.55 * options.supportHeight;
  const trunk = new THREE.Group();
  const trunkW = TRUNK_WIDTH * options.trunkWidth;
  const trunkScale = new THREE.Vector3(trunkW, supportTop / 0.7, trunkW);
  trunk.scale.copy(trunkScale);
  for (const [name, geometry] of buildStumpGeometries(options.trunkSeed, false)) {
    const mesh = new THREE.Mesh(geometry, trunkMaterial);
    mesh.name = name.replace('tree_stump', 'tree_house_trunk');
    trunk.add(mesh);
  }

  // ── 3-2. 斜撐樹枝：從樹幹中段彎彎地往外上方撐到平台底下 ──
  const braceParts: THREE.BufferGeometry[] = [];
  const BRACES = 4;
  for (let i = 0; i < BRACES; i++) {
    const a = (i / BRACES) * Math.PI * 2 + Math.PI / 4 + (rng() - 0.5) * 0.3;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const rs = options.raftSize;
    const start = dir.clone().multiplyScalar(0.08 * options.trunkWidth).setY(supportTop * (0.22 + rng() * 0.08));
    const control = dir.clone().multiplyScalar(0.26 * rs).setY(supportTop * 0.62);
    const end = dir.clone().multiplyScalar((0.46 + rng() * 0.04) * rs).setY(supportTop - 0.06);
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);
    const tube = new THREE.TubeGeometry(curve, 14, 0.036 * Math.sqrt(options.trunkWidth), 8, false);
    braceParts.push(asBark(tube, end.clone().sub(start).normalize()));
  }
  const braces = mergeGeometries(
    braceParts.map((g) => (g.index ? g.toNonIndexed() : g)),
    false,
  )!;
  braces.computeBoundingSphere();

  // ── 3-3. 卡通木筏平台：圓頭原木並排（端面有粗年輪＋深色描邊），底下三根橫木，四周原木欄杆、正面留門口 ──
  const rs = options.raftSize;
  const RAFT_HALF = 0.6 * rs;
  const LOG_R = 0.05;
  const raftParts: THREE.BufferGeometry[] = [];
  /**
   * 從 start 到 end 的一根原木。用 LatheGeometry 把「圓角長方形」側面輪廓繞一圈，
   * 兩端是圓角（卡通感），平的端面標成年輪（aKind = 1）。
   */
  const log = (start: THREE.Vector3, end: THREE.Vector3, radius: number, rings = 0.3) => {
    const axis = end.clone().sub(start);
    const length = axis.length();
    axis.normalize();
    const r = radius * (0.94 + rng() * 0.06);
    const corner = Math.min(r * 0.35, length * 0.2);
    const half = length / 2;
    const profile: THREE.Vector2[] = [new THREE.Vector2(0, -half)];
    const arc = (cy: number, from: number, to: number) => {
      for (let k = 0; k <= 4; k++) {
        const a = from + ((to - from) * k) / 4;
        profile.push(new THREE.Vector2(r - corner + Math.cos(a) * corner, cy + Math.sin(a) * corner));
      }
    };
    profile.push(new THREE.Vector2(r - corner, -half));
    arc(-half + corner, -Math.PI / 2, 0);
    arc(half - corner, 0, Math.PI / 2);
    profile.push(new THREE.Vector2(0, half));
    const geometry = new THREE.LatheGeometry(profile, 16);
    // 在原木自己的座標（軸 = y）標好每個頂點是側面還是端面
    const pos = geometry.attributes.position;
    const nor = geometry.attributes.normal;
    const count = pos.count;
    const kind = new Float32Array(count);
    const coord = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      if (Math.abs(nor.getY(i)) > 0.97) {
        // 平的端面：年輪座標用平面那一圈的半徑（r - corner）正規化，邊緣剛好是 1 → 描邊畫在邊上
        kind[i] = 1;
        coord.set([pos.getX(i) / (r - corner), pos.getZ(i) / (r - corner), rings], i * 3);
      }
    }
    geometry.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    geometry.setAttribute('aCoord', new THREE.BufferAttribute(coord, 3));
    const axes = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) axes.set([axis.x, axis.y, axis.z], i * 3);
    geometry.setAttribute('aAxis', new THREE.BufferAttribute(axes, 3));
    geometry.setAttribute('aAO', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1));
    geometry.deleteAttribute('uv');
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, axis));
    geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    raftParts.push(geometry.index ? geometry.toNonIndexed() : geometry);
  };
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // 底下三根橫木（跟原木垂直），斜撐頂在它們下面
  for (const x of [-0.4 * rs, 0, 0.4 * rs]) {
    log(v3(x, supportTop - 0.034, -RAFT_HALF + 0.03), v3(x, supportTop - 0.034, RAFT_HALF - 0.03), 0.036, 0.25);
  }
  // 甲板原木：沿 x 方向，長度、位置各有一點誤差，端面參差不齊才像手綁的木筏
  const LOGS = Math.max(7, Math.round(RAFT_HALF / LOG_R));
  const spacing = (2 * RAFT_HALF) / LOGS;
  for (let i = 0; i < LOGS; i++) {
    const z = -RAFT_HALF + (i + 0.5) * spacing;
    const shift = (rng() - 0.5) * 0.04;
    const half = RAFT_HALF + (rng() - 0.5) * 0.05;
    const y = supportTop + LOG_R + (rng() - 0.5) * 0.006;
    log(v3(-half + shift, y, z), v3(half + shift, y, z), Math.min(LOG_R, spacing * 0.52));
  }
  const deckTop = supportTop + LOG_R * 1.85;

  // 欄杆：柱子（端面朝上看得到年輪）＋上下兩條扶手；正面中間留門口
  const P = RAFT_HALF - 0.045;
  const GAP = Math.max(0.2, 0.2 * options.houseScale); // 門口寬度跟著豬屋大小
  const MID = P > 0.45; // 木筏夠大才在每邊中間加一根柱子
  const sides: Array<Array<[number, number]>> = [
    MID ? [[-P, -P], [0, -P], [P, -P]] : [[-P, -P], [P, -P]], // 後
    MID ? [[-P, -P], [-P, 0], [-P, P]] : [[-P, -P], [-P, P]], // 左
    MID ? [[P, -P], [P, 0], [P, P]] : [[P, -P], [P, P]], // 右
    [[-P, P], [-GAP, P]], // 前左
    [[GAP, P], [P, P]], // 前右
  ];
  const postTop = deckTop + 0.2;
  const posts = new Set<string>();
  for (const side of sides) {
    for (const [x, z] of side) {
      const key = `${x},${z}`;
      if (posts.has(key)) continue;
      posts.add(key);
      log(v3(x, deckTop - 0.03, z), v3(x, postTop + (rng() - 0.5) * 0.015, z), 0.03, 0.12);
    }
    for (let i = 0; i < side.length - 1; i++) {
      const [x0, z0] = side[i];
      const [x1, z1] = side[i + 1];
      for (const h of [0.17, 0.085]) {
        log(v3(x0, deckTop + h, z0), v3(x1, deckTop + h + (rng() - 0.5) * 0.01, z1), 0.02, 0.08);
      }
      // 扶手綁在柱子上的麻繩
      for (const [x, z] of [side[i], side[i + 1]]) {
        paint.add(new THREE.TorusGeometry(0.03, 0.007, 6, 14), m4([x, deckTop + 0.17, z], [Math.PI / 2, 0, 0]), '#d8c08a');
      }
    }
  }
  // ── 門口的梯子：兩根側桿從木筏門口斜斜靠到地上，中間一階一階的橫木 ──
  {
    const top = deckTop - 0.01;
    const lean = 0.22 + supportTop * 0.25; // 支架越高，梯子底部離得越遠
    const topZ = RAFT_HALF + 0.01;
    const bottomZ = RAFT_HALF + lean;
    const halfWidth = Math.min(GAP * 0.75, 0.13);
    for (const x of [-halfWidth, halfWidth]) {
      log(v3(x, top + 0.06, topZ - 0.03), v3(x * 1.08, -0.02, bottomZ), 0.022, 0.1);
    }
    const STEPS = Math.max(3, Math.round(supportTop / 0.11));
    for (let i = 1; i <= STEPS; i++) {
      const t = i / (STEPS + 1);
      const y = top + (-0.02 - top) * t;
      const z = topZ + (bottomZ - topZ) * t;
      const w = halfWidth * (1 + 0.08 * t);
      log(v3(-w - 0.015, y, z), v3(w + 0.015, y + (rng() - 0.5) * 0.008, z), 0.016, 0.08);
    }
  }

  // ── 背後垂下來的麻繩：綁在後面的扶手上，往下垂到地面、尾端在地上捲一小圈，中間打幾個結 ──
  {
    const ropeColor = '#d8c08a';
    const x = 0.18 * rs;
    const railY = deckTop + 0.17;
    const z = -P - 0.035;
    const points: THREE.Vector3[] = [];
    const DROP = 10;
    for (let i = 0; i <= DROP; i++) {
      const t = i / DROP;
      // 微微往外飄、有一點左右擺，才不會像一根直棍
      points.push(v3(x + Math.sin(t * 5) * 0.012, railY - (railY - 0.03) * t, z - 0.04 * Math.sin(t * Math.PI) - 0.02 * t));
    }
    // 尾端在地上捲一圈
    const coilCenter = v3(x + 0.05, 0.015, z - 0.07);
    for (let i = 1; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI * 1.7;
      points.push(v3(coilCenter.x + Math.cos(a) * 0.05, 0.015, coilCenter.z + Math.sin(a) * 0.05));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    paint.add(new THREE.TubeGeometry(curve, 80, 0.011, 6, false), new THREE.Matrix4(), ropeColor);
    // 繩結
    for (const t of [0.12, 0.28, 0.44]) {
      const p = curve.getPointAt(t);
      paint.add(new THREE.SphereGeometry(0.019, 8, 6), m4([p.x, p.y, p.z], [0, 0, 0], [1, 0.8, 1]), new THREE.Color(ropeColor).offsetHSL(0, 0, -0.05));
    }
    // 綁在扶手上的那一圈
    paint.add(new THREE.TorusGeometry(0.026, 0.008, 6, 14), m4([x, railY, -P], [0, Math.PI / 2, 0]), ropeColor);
  }

  const raft = mergeGeometries(raftParts, false)!;
  for (const geometry of raftParts) geometry.dispose();
  raft.computeBoundingSphere();

  // ── 從這裡開始是豬屋本體：換一組新的 bucket 另外收集 ──
  // 底座和豬屋分開成不同 mesh，豬屋在平台上移動、旋轉時只要改它那一組的位置，不用重建
  const basePaint = paint;
  const baseMetal = metal;
  paint = new PartBucket();
  metal = new PartBucket();

  // ── 3-4. 豬屋身體：壓扁一點的大圓球，下緣埋進平台 ──
  const s = options.houseScale;
  const R = 0.4 * s;
  const center = new THREE.Vector3(0, deckTop + R * 0.7, 0);
  const radii = new THREE.Vector3(R, R * 0.92, R * 1.04);
  paint.add(new THREE.SphereGeometry(1, 48, 32), m4([center.x, center.y, center.z], [0, 0, 0], [radii.x, radii.y, radii.z]), shade(0));

  /**
   * 身體表面上某個方位（azimuth：0° = 正面 +z，90° = 右邊 +x）、仰角（elevation）的位置，
   * 回傳一個「局部 +z 朝外」的矩陣，零件就用局部座標往外長。
   * 橢球的法線不是單純的方向向量：要除以半徑平方（壓扁的方向法線比較陡）。
   */
  const surface: BodySurface = (azimuthDeg, elevationDeg, out = 0, upright = false) => {
    const a = THREE.MathUtils.degToRad(azimuthDeg);
    const e = THREE.MathUtils.degToRad(elevationDeg);
    const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
    const point = new THREE.Vector3(dir.x * radii.x, dir.y * radii.y, dir.z * radii.z).add(center);
    const n = new THREE.Vector3(dir.x / radii.x, dir.y / radii.y, dir.z / radii.z).normalize();
    if (upright) {
      n.y = 0;
      n.normalize();
    }
    point.addScaledVector(n, out);
    const x = new THREE.Vector3().crossVectors(UP, n);
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const y = new THREE.Vector3().crossVectors(n, x);
    return new THREE.Matrix4().makeBasis(x, y, n).setPosition(point);
  };
  const at = (base: THREE.Matrix4, local: THREE.Matrix4) => base.clone().multiply(local);

  // ── 3-5. 正面拱門：往外凸出的拱形門廊（後半段埋進身體），裡面是深色門洞＋白色半截木門 ──
  {
    const width = 0.2 * s;
    const height = 0.27 * s;
    // 門廊正面放在球面前方一點：門洞上緣也在球面外，粉紅色身體才不會從門洞裡穿出來
    const frontZ = center.z + radii.z + 0.03 * s;
    const base = m4([0, deckTop - 0.005, frontZ]);
    const porch = archShape(width * 1.45, height * 1.18);
    porch.holes.push(archPath(width, height));
    paint.add(extrude(porch, 0.24 * s, 0.012), at(base, m4([0, 0, -0.24 * s])), shade(-0.06, 0.05));
    paint.add(extrude(archShape(width, height), 0.02), at(base, m4([0, 0, -0.045 * s])), COLORS.doorway);
    // 半截白木門：一片片直木板，頂端參差
    const PLANKS = 4;
    for (let i = 0; i < PLANKS; i++) {
      const w = width / PLANKS;
      const h = height * (0.5 + (rng() - 0.5) * 0.06);
      paint.add(
        new THREE.BoxGeometry(w * 0.92, h, 0.014),
        at(base, m4([-width / 2 + w * (i + 0.5), h / 2, -0.018 * s], [0, 0, (rng() - 0.5) * 0.04])),
        jitter(COLORS.halfDoor, rng, 0.05),
      );
    }
    paint.add(new THREE.BoxGeometry(width * 0.95, 0.014, 0.008), at(base, m4([0, height * 0.36, -0.009 * s])), COLORS.plankLine);
    metal.add(new THREE.SphereGeometry(0.01 * s, 10, 8), at(base, m4([width * 0.36, height * 0.28, -0.004 * s])), '#9aa7a0');
    // 門檻
    paint.add(new THREE.BoxGeometry(width * 1.5, 0.015, 0.05 * s), at(base, m4([0, 0.007, -0.01])), shade(-0.12, -0.1));
  }

  // ── 3-6. 豬鼻子（門的正上方）：短圓柱＋圓角邊，兩個深色鼻孔 ──
  {
    const base = surface(0, 35, -0.02);
    const r = 0.16 * s;
    const length = 0.1 * s;
    paint.add(new THREE.CylinderGeometry(r, r * 1.08, length, 36), at(base, m4([0, 0, length / 2], [Math.PI / 2, 0, 0])), shade(-0.03, 0.04));
    paint.add(new THREE.TorusGeometry(r * 0.88, r * 0.14, 10, 36), at(base, m4([0, 0, length - r * 0.02])), shade(-0.02, 0.04));
    paint.add(new THREE.CircleGeometry(r * 0.9, 36), at(base, m4([0, 0, length + r * 0.02])), shade(-0.04, 0.04));
    for (const side of [-1, 1]) {
      paint.add(
        new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.02, 20),
        at(base, m4([side * r * 0.36, 0, length + r * 0.02], [Math.PI / 2, 0, 0], [1, 1, 1.6])),
        COLORS.nostril,
      );
    }
  }

  // ── 3-7. 耳朵：扁平的圓弧三角形（擠出薄片＋圓角），內側一片深色內耳；左右鏡射對稱 ──
  const earShape = (scale: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.13 * scale, 0);
    shape.quadraticCurveTo(-0.13 * scale, 0.2 * scale, 0, 0.31 * scale);
    shape.quadraticCurveTo(0.13 * scale, 0.2 * scale, 0.13 * scale, 0);
    shape.lineTo(-0.13 * scale, 0);
    return shape;
  };
  /**
   * 直接指定耳朵的方向（比用角度轉來轉去直覺）：
   *   lengthDir：耳朵從根部往尖端的方向
   *   faceDir：耳朵正面（有內耳那面）大概朝哪
   * 用 Gram-Schmidt 把 faceDir 修成跟 lengthDir 垂直，再用叉積補出寬度方向，組成旋轉矩陣。
   */
  const es = s * options.earSize; // 耳朵大小
  const thickness = 0.02 * es * options.earThickness; // 耳朵本體厚度
  const bevel = 0.012 * es * Math.min(options.earThickness, 1.5); // 圓角：太厚時不要跟著無限變大
  const ear = (azimuth: number, elevation: number, lengthDir: THREE.Vector3, faceDir: THREE.Vector3) => {
    const root = new THREE.Vector3().setFromMatrixPosition(surface(azimuth, elevation, -0.045 * s - thickness * 0.5)); // 根部埋進頭裡，越厚埋越深
    const length = lengthDir.clone().normalize();
    const face = faceDir.clone().addScaledVector(length, -faceDir.dot(length)).normalize();
    const width = new THREE.Vector3().crossVectors(length, face).normalize();
    const pose = new THREE.Matrix4().makeBasis(width, length, face).setPosition(root);
    const outer = extrude(earShape(es), thickness, bevel);
    outer.translate(0, 0, -thickness / 2);
    paint.add(outer, pose, shade(0.01));
    // 內耳：放在外耳正面（thickness/2 + bevel）再前面一點，重疊會閃爍（z-fighting）
    const inner = extrude(earShape(es * 0.68), 0.006 * es);
    inner.translate(0, 0.03 * es, thickness / 2 + bevel + 0.002 * es);
    paint.add(inner, pose, shade(-0.1, 0.1));
  };
  /**
   * 右耳的基準：方位 55°、仰角 50°，往右上方翹、正面朝前。
   * 「前後」：耳朵沿著頭繞，方位角往正面（0°）靠近；耳朵的方向也跟著繞 y 軸轉同樣角度，看起來才一致。
   * 左耳 = 右耳的 x 鏡射：方位取負號、方向向量的 x 取負號 → 位置與角度完全對稱。
   */
  const earAzimuth = 55 - options.earForward;
  const turn = THREE.MathUtils.degToRad(-options.earForward); // 繞 y 軸：往正面轉
  const rightLength = new THREE.Vector3(0.45, 0.9, -0.2).applyAxisAngle(UP, -turn);
  const rightFace = new THREE.Vector3(0.3, 0.05, 1).applyAxisAngle(UP, -turn);
  const mirrorX = (v: THREE.Vector3) => new THREE.Vector3(-v.x, v.y, v.z);
  ear(earAzimuth, 50, rightLength, rightFace);
  ear(-earAzimuth, 50, mirrorX(rightLength), mirrorX(rightFace));

  // ── 3-8. 捲捲的尾巴：頂上偏後，沿螺旋曲線長出一根管子 ──
  {
    const base = surface(200, 55, -0.01);
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28;
      const angle = t * Math.PI * 3.4;
      const radius = 0.045 * s * (1 - t * 0.3);
      points.push(new THREE.Vector3(Math.sin(angle) * radius, Math.cos(angle) * radius - radius, 0.03 * s + t * 0.11 * s));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.017 * s, 8, false);
    paint.add(tube, at(base, m4([0, 0, 0], [-0.5, 0, 0])), shade(0.02));
    paint.add(new THREE.SphereGeometry(0.017 * s, 8, 6), at(base, m4([0, 0, 0])), shade(0.02));
  }

  // ── 3-9. 左側圓窗（垂直擺正）＋水平的圓木板遮雨棚 ──
  // upright = true：窗框不跟著球面往上仰，保持垂直；位置移到 -88°（正側面），離左耳遠一點才不會穿插
  {
    const base = surface(-88, 8, 0.004, true);
    const r = 0.07 * s;
    paint.add(new THREE.CylinderGeometry(r, r, 0.07, 24), at(base, m4([0, 0, -0.03], [Math.PI / 2, 0, 0])), COLORS.doorway);
    paint.add(new THREE.TorusGeometry(r * 1.05, r * 0.28, 10, 28), at(base, m4([0, 0, 0.008])), shade(-0.07, 0.04));
    // 遮雨棚：圓木板水平地從窗戶上緣往外伸（CylinderGeometry 預設就是水平的圓盤），板子中心往外推一個半徑，不會切進身體
    const top = r * 1.4;
    const boardR = r * 1.4;
    const out = 0.012 * s;
    paint.add(new THREE.CylinderGeometry(boardR, boardR, 0.014, 26), at(base, m4([0, top, out + boardR])), COLORS.shutter);
    for (const x of [-0.75, 0, 0.75]) {
      paint.add(new THREE.BoxGeometry(0.004, 0.004, boardR * 1.9), at(base, m4([x * r, top + 0.008, out + boardR])), COLORS.plankLine);
    }
    // 鉸鏈（綠色）＋兩根斜撐小木棍
    paint.add(new THREE.CylinderGeometry(0.008, 0.008, r * 1.2, 8), at(base, m4([0, top, out], [0, 0, Math.PI / 2])), COLORS.hinge);
    for (const x of [-0.8, 0.8]) {
      const from = new THREE.Vector3(x * r, top - r * 1.1, out * 0.5);
      const to = new THREE.Vector3(x * r, top - 0.008, out + boardR * 1.3);
      const dir = to.clone().sub(from);
      const stick = new THREE.CylinderGeometry(0.004, 0.004, dir.length(), 6);
      const pose = new THREE.Matrix4().compose(
        from.clone().add(to).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()),
        new THREE.Vector3(1, 1, 1),
      );
      paint.add(stick, at(base, pose), COLORS.stick);
    }
  }

  // ── 3-10. 吊鈴：左後方伸出一根小木棍，掛金色鈴鐺 ──
  {
    const base = surface(-128, 30, -0.01, true); // 窗戶移到 -88° 後，鈴鐺也往後挪保持間距
    const length = 0.14 * s;
    paint.add(new THREE.CylinderGeometry(0.008, 0.011, length, 8), at(base, m4([0, 0.01, length / 2], [Math.PI / 2 - 0.3, 0, 0])), COLORS.stick);
    const tip = new THREE.Vector3(0, 0.01 + Math.sin(0.3) * length, Math.cos(0.3) * length);
    paint.add(new THREE.CylinderGeometry(0.002, 0.002, 0.06, 4), at(base, m4([tip.x, tip.y - 0.03, tip.z])), '#6b5a48');
    const profile = [
      [0.0, 0.0],
      [0.03, 0.0],
      [0.034, 0.007],
      [0.025, 0.023],
      [0.019, 0.042],
      [0.011, 0.052],
      [0.0, 0.054],
    ].map(([x, y]) => new THREE.Vector2(x * s, y * s));
    metal.add(new THREE.LatheGeometry(profile, 18), at(base, m4([tip.x, tip.y - 0.06 - 0.054 * s, tip.z])), COLORS.gold);
    paint.add(new THREE.SphereGeometry(0.009 * s, 8, 6), at(base, m4([tip.x, tip.y - 0.065 - 0.054 * s, tip.z])), '#d24a3a');
  }

  // ── 3-11. 門邊一朵小白花 ──
  {
    const base = surface(38, -12, 0.002);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      paint.add(
        new THREE.SphereGeometry(0.014 * s, 8, 6),
        at(base, m4([Math.cos(a) * 0.017 * s, Math.sin(a) * 0.017 * s, 0], [0, 0, a], [1.3, 0.8, 0.35])),
        COLORS.petal,
      );
    }
    paint.add(new THREE.SphereGeometry(0.008 * s, 8, 6), at(base, m4([0, 0, 0.004])), '#f2c230');
  }

  return {
    trunk,
    braces,
    raft,
    buckets: { paint: basePaint.build(), metal: baseMetal.build() },
    houseBuckets: { paint: paint.build(), metal: metal.build() },
    trunkScale,
    surface,
    bodyCenter: center,
    bodyRadii: radii,
  };
}

// ── 卡通木頭 shader ──
//
// 跟樹墩一樣用 onBeforeCompile 即時算紋路（放大不糊），但畫法改成卡通：
//   側面：兩種木色的大色塊（邊界銳利）＋兩條深色描線，沒有細碎雜訊、沒有凹凸
//   端面：三圈粗年輪＋中心點＋外圈樹皮色＋深色描邊
// 用的頂點屬性跟樹墩一樣（aKind、aCoord、aAxis、aAO），所以樹墩幾何、原木、斜撐都能直接套。

export type CartoonWoodPalette = { light: string; mid: string; dark: string; endLight: string; endRing: string };

const CARTOON_WOOD_VERTEX_HEAD = /* glsl */ `
attribute float aKind;
attribute vec3 aCoord;
attribute vec3 aAxis;
attribute float aAO;
uniform vec3 uStretch;
varying float vKind;
varying vec3 vCoord;
varying vec3 vAxis;
varying float vAO;
varying vec3 vWoodPos;
`;

const CARTOON_WOOD_FRAGMENT_HEAD = /* glsl */ `
uniform float uSeed;
uniform vec3 uLight;
uniform vec3 uMid;
uniform vec3 uDark;
uniform vec3 uEndLight;
uniform vec3 uEndRing;
varying float vKind;
varying vec3 vCoord;
varying vec3 vAxis;
varying float vAO;
varying vec3 vWoodPos;
float cwHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float cwNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cwHash(i), cwHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(cwHash(i + vec3(0.0, 1.0, 0.0)), cwHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(cwHash(i + vec3(0.0, 0.0, 1.0)), cwHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(cwHash(i + vec3(0.0, 1.0, 1.0)), cwHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
`;

const CARTOON_WOOD_COLOR_BODY = /* glsl */ `
#include <color_fragment>
{
  vec3 seedOff = vec3(uSeed * 7.13, uSeed * 3.71, uSeed * 5.29);
  vec3 axis = normalize(vAxis);
  vec3 p = vWoodPos + seedOff;
  float along = dot(p, axis);
  vec3 across = p - axis * along;
  // 側面：沿木紋拉長的大塊雜訊 → 只切兩個顏色（卡通的「色塊」），描線取兩條等高線
  float n = cwNoise(across * 4.5 + axis * along * 0.6);
  float aa = fwidth(n) * 1.2 + 1e-4;
  float band = smoothstep(0.5 - aa, 0.5 + aa, n);
  float line = 1.0 - smoothstep(0.014, 0.014 + aa, min(abs(n - 0.32), abs(n - 0.7)));
  // 端面：粗年輪
  vec2 c = vCoord.xy;
  float rho = length(c);
  float wob = (cwNoise(vec3(c * 2.0, uSeed)) - 0.5) * 0.1;
  float rings = mix(3.0, 6.0, step(0.6, vCoord.z));
  float r = (rho + wob) * rings;
  float f = fract(r);
  float raa = fwidth(r) * 1.2 + 1e-4;
  float rhoAA = fwidth(rho) * 1.2 + 1e-4;
  vec3 col;
  if (vKind < 0.5) {
    col = mix(uMid, uLight, band);
    col = mix(col, uDark, line * 0.8);
  } else {
    float ring = (1.0 - smoothstep(0.08, 0.08 + raa, min(f, 1.0 - f))) * step(0.12, rho);
    col = mix(uEndLight, uEndRing, ring);
    col = mix(col, uEndRing, 1.0 - smoothstep(0.08, 0.08 + rhoAA, rho)); // 髓心小圓點
    col = mix(col, uMid, smoothstep(0.84 - rhoAA, 0.84 + rhoAA, rho)); // 外圈樹皮
    col = mix(col, uDark, smoothstep(0.94 - rhoAA, 0.94 + rhoAA, rho)); // 深色描邊
  }
  diffuseColor.rgb *= col * vAO;
}
`;

function createCartoonWoodMaterial(palette: CartoonWoodPalette, envMap?: THREE.Texture) {
  const uniforms = {
    uStretch: { value: new THREE.Vector3(1, 1, 1) },
    uSeed: { value: 1 },
    uLight: { value: new THREE.Color(palette.light) },
    uMid: { value: new THREE.Color(palette.mid) },
    uDark: { value: new THREE.Color(palette.dark) },
    uEndLight: { value: new THREE.Color(palette.endLight) },
    uEndRing: { value: new THREE.Color(palette.endRing) },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    envMap: envMap ?? null,
    envMapIntensity: 0.2,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CARTOON_WOOD_VERTEX_HEAD}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vKind = aKind;
vCoord = aCoord;
vAxis = normalize(aAxis * uStretch);
vAO = aAO;
vWoodPos = position * uStretch;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CARTOON_WOOD_FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', CARTOON_WOOD_COLOR_BODY);
  };
  material.customProgramCacheKey = () => 'tree-house-cartoon-wood-v1';
  return { material, uniforms };
}

/** 身體表面的細微斑駁：用模型座標算雜訊，放大也不會糊（跟樹墩同一個概念） */
function addPaintMottle(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPaintPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vPaintPos;
float paintHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float paintNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(paintHash(i), paintHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(paintHash(i + vec3(0.0, 1.0, 0.0)), paintHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(paintHash(i + vec3(0.0, 0.0, 1.0)), paintHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(paintHash(i + vec3(0.0, 1.0, 1.0)), paintHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float mottle = paintNoise(vPaintPos * 9.0) * 0.6 + paintNoise(vPaintPos * 31.0) * 0.4;
diffuseColor.rgb *= 0.9 + 0.17 * mottle;`,
      );
  };
  material.customProgramCacheKey = () => 'tree-house-paint-v1';
}

// ── 4. 擺到綠球上 ──

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const HIGHLIGHT = new THREE.Color('#ffb36b');

export type TreeHouseSettings = TreeHouseLayout;

type CreateTreeHouseOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: TreeHouseLayout;
};

export function createTreeHouse({
  groundRadius,
  up,
  front,
  envMap,
  layout = TREE_HOUSE_LAYOUT_DEFAULT,
}: CreateTreeHouseOptions) {
  const settings: TreeHouseSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'tree_house';
  const model = new THREE.Group();
  model.name = 'tree_house_model';
  anchor.add(model);

  // 底座全部用卡通木頭 shader。座標單位不同（樹幹是樹墩座標、斜撐與木筏是模型座標），
  // 所以各用一個材質實例（uStretch 不同），但共用同一支編譯好的 shader
  const barkPalette: CartoonWoodPalette = { light: '#b06b3c', mid: '#82492a', dark: '#4a2616', endLight: '#f0cf96', endRing: '#b9793f' };
  const stump = createCartoonWoodMaterial(barkPalette, envMap);
  const braceBark = createCartoonWoodMaterial(barkPalette, envMap);
  // 木筏：剝了皮的淺色原木
  const raftBark = createCartoonWoodMaterial(
    { light: '#f2c07a', mid: '#d69a58', dark: '#8a5530', endLight: '#fbe4b4', endRing: '#c98a4a' },
    envMap,
  );
  const makeMaterial = (options: THREE.MeshStandardMaterialParameters) =>
    new THREE.MeshStandardMaterial({
      vertexColors: true, // 顏色來自每個零件烤進去的頂點色
      roughness: 0.8,
      metalness: 0,
      envMap: envMap ?? null,
      envMapIntensity: 0.25,
      ...options,
    });
  const materials = {
    paint: makeMaterial({ roughness: 0.75 }),
    metal: makeMaterial({ metalness: 0.55, roughness: 0.35, envMapIntensity: 0.6 }),
  };
  // houseRig：豬屋本體，整組在平台上移動、旋轉（不用重建）
  const houseRig = new THREE.Group();
  houseRig.name = 'tree_house_rig';
  anchor.add(houseRig);
  const houseBody = new THREE.Group(); // 豬屋本體的 mesh（造型改變時重建）
  houseBody.name = 'tree_house_body';
  houseRig.add(houseBody);
  addPaintMottle(materials.paint);
  const allMaterials: THREE.MeshStandardMaterial[] = [stump.material, braceBark.material, raftBark.material, ...Object.values(materials)];

  let introGrow = 1;
  let highlighted = false;
  let builtKey = '';

  function rebuild() {
    const key = [settings.trunkSeed, settings.houseScale, settings.supportHeight, settings.raftSize, settings.trunkWidth, settings.bodyColor, settings.earForward, settings.earThickness, settings.earSize].join('|');
    if (key === builtKey) return;
    builtKey = key;
    disposeGeometries();
    const built = buildTreeHouse(
      {
        houseScale: Math.max(0.3, settings.houseScale),
        supportHeight: Math.max(0.3, settings.supportHeight),
        raftSize: Math.max(0.6, settings.raftSize),
        trunkWidth: Math.max(0.4, settings.trunkWidth),
        trunkSeed: Math.round(settings.trunkSeed),
        bodyColor: settings.bodyColor,
        earForward: settings.earForward,
        earThickness: Math.max(0.2, settings.earThickness),
        earSize: Math.max(0.3, settings.earSize),
      },
      stump.material,
    );
    const braces = new THREE.Mesh(built.braces, braceBark.material);
    braces.name = 'tree_house_braces';
    const raft = new THREE.Mesh(built.raft, raftBark.material);
    raft.name = 'tree_house_raft';
    model.add(built.trunk, braces, raft);
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
    const addBuckets = (buckets: BuiltParts['buckets'], parent: THREE.Object3D, prefix: string) => {
      for (const [name, geometry] of Object.entries(buckets)) {
        if (!geometry) continue;
        const mesh = new THREE.Mesh(geometry, materials[name as keyof typeof materials]);
        mesh.name = `${prefix}_${name}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parent.add(mesh);
      }
    };
    addBuckets(built.buckets, model, 'tree_house_base');
    addBuckets(built.houseBuckets, houseBody, 'tree_house_body');
    // 樹幹紋路：樹幹被拉高（y 比 x、z 大），告訴 shader 實際比例，樹皮紋才不會被拉長
    const t = built.trunkScale;
    stump.uniforms.uStretch.value.set(1, t.y / t.x, 1);
    // 斜撐是模型座標（比樹墩座標小 TRUNK_WIDTH 倍），放大回去紋路密度才跟樹幹一樣
    braceBark.uniforms.uStretch.value.setScalar(WOOD_STRETCH);
    raftBark.uniforms.uStretch.value.setScalar(WOOD_STRETCH);
    raftBark.uniforms.uSeed.value = Math.round(settings.trunkSeed) + 17;
    stump.uniforms.uSeed.value = braceBark.uniforms.uSeed.value = Math.round(settings.trunkSeed);
  }

  function disposeGeometries() {
    for (const group of [model, houseBody]) {
      for (const child of [...group.children]) {
        child.traverse((node) => (node as THREE.Mesh).geometry?.dispose());
        group.remove(child);
      }
    }
  }

  function applyPlacement() {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));
    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
    model.scale.setScalar(settings.size);
    // 豬屋在平台上的位置與朝向：位置是模型單位，rig 自己的縮放不會套到自己的 position 上，所以要先乘 size
    houseRig.scale.setScalar(settings.size);
    houseRig.position.set(settings.houseOffsetX * settings.size, 0, settings.houseOffsetZ * settings.size);
    houseRig.rotation.set(0, THREE.MathUtils.degToRad(settings.houseYaw), 0);
  }

  function applyVisuals() {
    for (const material of allMaterials) {
      material.color.setScalar(settings.colorBoost);
      if (highlighted) {
        material.emissive.copy(HIGHLIGHT);
        material.emissiveIntensity = 0.22;
      } else {
        material.emissive.setHex(0x000000);
        material.emissiveIntensity = 0;
      }
    }
  }

  function applySettings() {
    rebuild();
    applyPlacement();
  }

  function setHighlighted(value: boolean) {
    highlighted = value;
    applyVisuals();
  }

  function setNormal(target: THREE.Vector3) {
    const angle = Math.acos(THREE.MathUtils.clamp(target.dot(up), -1, 1));
    horizontal.copy(target).addScaledVector(up, -target.dot(up));
    side.crossVectors(up, front);
    const azimuth = Math.atan2(horizontal.dot(side), horizontal.dot(front));
    settings.angleFromTopDegrees = Math.round(THREE.MathUtils.radToDeg(angle));
    settings.azimuthDegrees = Math.round(THREE.MathUtils.radToDeg(azimuth));
    applySettings();
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1);
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
  }

  function dispose() {
    anchor.removeFromParent();
    disposeGeometries();
    for (const material of allMaterials) material.dispose();
  }

  applySettings();
  applyVisuals();

  return {
    object: anchor,
    settings,
    applySettings,
    applyVisuals,
    setHighlighted,
    setIntroGrow,
    dispose,
    getNormal: () => normal.clone(),
    setNormal,
  };
}

export function formatTreeHousePlacementsForPaste(entries: Array<{ id: string; settings: TreeHouseLayout }>) {
  const lines = entries.map((entry, index) => {
    const s = entry.settings;
    const comma = index < entries.length - 1 ? ',' : '';
    return (
      `  {\n` +
      `    id: '${entry.id}',\n` +
      `    angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
      `    azimuthDegrees: ${s.azimuthDegrees},\n` +
      `    spinDegrees: ${s.spinDegrees},\n` +
      `    sink: ${s.sink.toFixed(3)},\n` +
      `    placementScale: ${s.placementScale.toFixed(2)},\n` +
      `    size: ${s.size.toFixed(3)},\n` +
      `    houseScale: ${s.houseScale.toFixed(2)},\n` +
      `    supportHeight: ${s.supportHeight.toFixed(2)},\n` +
      `    raftSize: ${s.raftSize.toFixed(2)},\n` +
      `    trunkWidth: ${s.trunkWidth.toFixed(2)},\n` +
      `    trunkSeed: ${s.trunkSeed},\n` +
      `    bodyColor: '${s.bodyColor}',\n` +
      `    earForward: ${s.earForward},\n` +
      `    earThickness: ${s.earThickness.toFixed(2)},\n` +
      `    earSize: ${s.earSize.toFixed(2)},\n` +
      `    houseOffsetX: ${s.houseOffsetX.toFixed(3)},\n` +
      `    houseOffsetZ: ${s.houseOffsetZ.toFixed(3)},\n` +
      `    houseYaw: ${s.houseYaw},\n` +
      `    colorBoost: ${s.colorBoost.toFixed(2)},\n` +
      `  }${comma}`
    );
  });
  return (
    `// 貼回 src/world/objects/treeHouseLayout.ts\n` +
    `export const TREE_HOUSE_PLACEMENTS: TreeHousePlacement[] = [\n` +
    lines.join('\n') +
    `\n];\n`
  );
}
