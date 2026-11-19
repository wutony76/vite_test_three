import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 島上的小生物：蝴蝶、蜜蜂、蜻蜓（會飛）、蚱蜢、小蜘蛛（在地上）。讓綠球看起來更活潑。
 *
 * - 造型全部用程式拼的 low poly 幾何（不用 GLB），顏色用「頂點顏色」：
 *   一隻生物的身體 = 1 個網格 + 1 個材質；會拍的翅膀另外拆成網格，才能各自轉
 * - 位置用「綠球座標」：法線 n（球心 → 地表）＋往前的切線 f＋離地高度；
 *   往前走 = 把 n、f 一起繞著 (n × f) 轉一點點（沿大圓走），跟小豬走路的方式一樣
 * - 避開房子、食物：問小豬的 isOpenGround（小豬每格都會更新障礙清單，這裡直接用，不重算）
 * - 尺寸以「世界單位」計（綠球半徑 1，小豬身長約 0.057），跟小豬成比例；造型只留輪廓和顏色，眼睛這類小細節不做
 */

export type CrittersSettings = {
  enabled: boolean;
  /** 各種「同時最多幾隻」：每一隻會輪流出現、離開，不會一直都在場上 */
  butterflies: number;
  bees: number;
  dragonflies: number;
  grasshoppers: number;
  spiders: number;
  /** 整體大小倍率 */
  size: number;
  /** 整體速度倍率 */
  speed: number;
  /** 出現頻率倍率：越大越常來（離開後等待的時間 ÷ 這個值） */
  frequency: number;
  /** 每次出現停留幾秒（最短～最長） */
  stayMinSeconds: number;
  stayMaxSeconds: number;
};

export const CRITTERS_DEFAULT: CrittersSettings = {
  enabled: true,
  butterflies: 4,
  bees: 3,
  dragonflies: 2,
  grasshoppers: 3,
  spiders: 2,
  // 跟小豬（身長約 0.057）成比例：1 倍時蝴蝶、蚱蜢約小豬的 0.26 倍，蜻蜓約 0.4 倍
  size: 1,
  speed: 1,
  frequency: 1,
  stayMinSeconds: 10,
  stayMaxSeconds: 25,
};

/**
 * 離開之後隔多久再來（秒，最短～最長；frequency = 1 時）：
 * 蝴蝶最常見、蜜蜂次之、蚱蜢普通，蜻蜓、小蜘蛛比較少見
 */
const AWAY_SECONDS: Record<'butterfly' | 'bee' | 'dragonfly' | 'grasshopper' | 'spider', [number, number]> = {
  // 平常大約只有三、四成在場上（停留 10～25 秒、離開更久），不會一直滿滿都是
  butterfly: [15, 40],
  bee: [20, 50],
  grasshopper: [25, 60],
  dragonfly: [40, 90],
  spider: [40, 90],
};

type Kind = 'butterfly' | 'bee' | 'dragonfly' | 'grasshopper' | 'spider';

/** 每種最多幾隻（面板滑桿上限） */
export const CRITTER_MAX = 12;

/** 每種的身長（世界單位，size = 1 時） */
const BODY_LENGTH: Record<Kind, number> = {
  // 使用者要求「全部再小三分之一」：原本 0.022／0.016／0.034／0.022／0.016 乘 2/3
  butterfly: 0.015,
  bee: 0.011,
  dragonfly: 0.023,
  grasshopper: 0.015,
  spider: 0.011,
};

const SETTING_KEY: Record<Kind, keyof CrittersSettings> = {
  butterfly: 'butterflies',
  bee: 'bees',
  dragonfly: 'dragonflies',
  grasshopper: 'grasshoppers',
  spider: 'spiders',
};

// ─────────────────────────────── 造型（模型座標：身長約 1、往前 +Z、往上 +Y） ───────────────────────────────

function paint(geometry: THREE.BufferGeometry, hex: number) {
  const color = new THREE.Color(hex);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < geometry.attributes.position.count; i++) color.toArray(colors, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // mergeGeometries 要求每個幾何的屬性一樣：有的有 uv、有的沒有會合併失敗，統一拿掉（頂點顏色用不到 uv）
  geometry.deleteAttribute('uv');
  return geometry;
}

function sphere(r: number, x: number, y: number, z: number, hex: number, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  return paint(g, hex);
}

/** 從 a 到 b 的細圓柱（腳、觸角） */
function limb(a: THREE.Vector3Like, b: THREE.Vector3Like, r: number, hex: number) {
  const from = new THREE.Vector3(a.x, a.y, a.z);
  const to = new THREE.Vector3(b.x, b.y, b.z);
  const dir = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(r, r, dir.length(), 5, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
  return paint(g, hex);
}

function merge(parts: THREE.BufferGeometry[]) {
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()));
  for (const g of parts) g.dispose();
  if (!merged) throw new Error('[critters] 合併幾何失敗');
  merged.computeVertexNormals();
  return merged;
}

/**
 * 平的翅膀：在 xz 平面（躺平、從身體往 +x 伸出去），用 Shape 畫輪廓。
 * points 是 (往外 x, 往前 z)；mirror = 左邊那片（x 取負）
 */
function wing(points: Array<[number, number]>, hex: number, mirror = false, lift = 0) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(mirror ? -x : x, z)));
  const g = new THREE.ShapeGeometry(shape);
  // ShapeGeometry 畫在 xy 平面；繞 x 轉 +90° 變成 xz 平面（原本的 y 變成往前的 z）
  g.rotateX(Math.PI / 2);
  g.translate(0, lift, 0);
  return paint(g, hex);
}

/** 蝴蝶的顏色：整隻純色（翅膀、身體、觸角都同一個顏色），黃、紅、藍三種 */
const BUTTERFLY_COLORS = [0xffd23c, 0xf0473c, 0x3c8cf0];

function butterflyBody(color: number) {
  return merge([
    sphere(0.07, 0, 0, -0.05, color, 1, 1, 4.2),
    sphere(0.085, 0, 0.01, 0.3, color),
    limb({ x: 0.03, y: 0.04, z: 0.35 }, { x: 0.12, y: 0.16, z: 0.62 }, 0.012, color),
    limb({ x: -0.03, y: 0.04, z: 0.35 }, { x: -0.12, y: 0.16, z: 0.62 }, 0.012, color),
  ]);
}

/** 蝴蝶一邊的翅膀：上面大片、下面小片，純色 */
function butterflyWing(colorIndex: number, mirror: boolean) {
  const color = BUTTERFLY_COLORS[colorIndex % BUTTERFLY_COLORS.length];
  return merge([
    wing([[0.02, 0.05], [0.25, 0.48], [0.62, 0.55], [0.72, 0.3], [0.5, 0.02], [0.05, -0.05]], color, mirror),
    wing([[0.03, -0.02], [0.42, -0.08], [0.48, -0.32], [0.3, -0.5], [0.08, -0.38]], color, mirror),
  ]);
}

function beeBody() {
  // 肚子是一顆拉長的球，依前後位置塗成黃、黑相間的條紋
  const belly = new THREE.IcosahedronGeometry(0.3, 2);
  belly.scale(1, 0.95, 1.45);
  belly.translate(0, 0, -0.12);
  const pos = belly.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const yellow = new THREE.Color(0xffc93c);
  const black = new THREE.Color(0x2b2420);
  for (let i = 0; i < pos.count; i++) {
    const band = Math.floor((pos.getZ(i) + 0.6) / 0.17);
    (band % 2 === 0 ? yellow : black).toArray(colors, i * 3);
  }
  belly.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  belly.deleteAttribute('uv');
  return merge([
    belly,
    sphere(0.2, 0, 0.02, 0.36, 0x2b2420),
    limb({ x: 0, y: 0, z: -0.52 }, { x: 0, y: -0.02, z: -0.66 }, 0.025, 0x2b2420),
    limb({ x: 0.06, y: 0.15, z: 0.45 }, { x: 0.15, y: 0.3, z: 0.6 }, 0.015, 0x2b2420),
    limb({ x: -0.06, y: 0.15, z: 0.45 }, { x: -0.15, y: 0.3, z: 0.6 }, 0.015, 0x2b2420),
  ]);
}

function beeWing(mirror: boolean) {
  return merge([
    wing([[0.02, 0.05], [0.3, 0.15], [0.55, 0.0], [0.4, -0.18], [0.05, -0.08]], 0xeaf6ff, mirror, 0.25),
  ]);
}

function dragonflyBody() {
  // 細長的尾巴：從身體往後一節一節變細，顏色從青綠漸漸變藍
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const color = new THREE.Color(0x2fd3b0).lerp(new THREE.Color(0x3a6cf0), t).getHex();
    parts.push(sphere(0.045 * (1 - t * 0.35), 0, 0, 0.02 - i * 0.12, color, 1, 1, 1.6));
  }
  parts.push(sphere(0.085, 0, 0.01, 0.18, 0x2fd3b0, 1, 1, 1.3));
  // 頭：一顆球就好（眼睛之類的小細節在這個大小看不清楚，只會變成雜點）
  parts.push(sphere(0.075, 0, 0.02, 0.31, 0x2fd3b0));
  return merge(parts);
}

function dragonflyWings(mirror: boolean) {
  const long = (z: number, tilt: number): Array<[number, number]> => [
    [0.03, z + 0.03], [0.25, z + 0.06 + tilt * 0.3], [0.55, z + 0.04 + tilt], [0.62, z + tilt], [0.5, z - 0.05 + tilt], [0.05, z - 0.03],
  ];
  return merge([
    wing(long(0.22, 0.06), 0xd8f4ff, mirror, 0.06),
    wing(long(0.1, -0.06), 0xd8f4ff, mirror, 0.06),
  ]);
}

function grasshopperBody() {
  const green = 0x7ccf4a;
  const dark = 0x4e9a2c;
  return merge([
    sphere(0.16, 0, 0.12, -0.05, green, 1, 1.1, 2.6),
    sphere(0.15, 0, 0.17, 0.38, green, 1, 1.15, 1),
    // 大後腿：大腿往後上翹、小腿往下踩地
    limb({ x: 0.13, y: 0.12, z: 0.05 }, { x: 0.2, y: 0.36, z: -0.3 }, 0.045, dark),
    limb({ x: 0.2, y: 0.36, z: -0.3 }, { x: 0.2, y: 0.0, z: -0.4 }, 0.025, dark),
    limb({ x: -0.13, y: 0.12, z: 0.05 }, { x: -0.2, y: 0.36, z: -0.3 }, 0.045, dark),
    limb({ x: -0.2, y: 0.36, z: -0.3 }, { x: -0.2, y: 0.0, z: -0.4 }, 0.025, dark),
    // 前腳、中腳
    limb({ x: 0.08, y: 0.08, z: 0.25 }, { x: 0.18, y: 0.0, z: 0.32 }, 0.02, dark),
    limb({ x: -0.08, y: 0.08, z: 0.25 }, { x: -0.18, y: 0.0, z: 0.32 }, 0.02, dark),
    limb({ x: 0.1, y: 0.08, z: 0.08 }, { x: 0.22, y: 0.0, z: 0.1 }, 0.02, dark),
    limb({ x: -0.1, y: 0.08, z: 0.08 }, { x: -0.22, y: 0.0, z: 0.1 }, 0.02, dark),
    // 觸角
    limb({ x: 0.05, y: 0.28, z: 0.48 }, { x: 0.16, y: 0.5, z: 0.75 }, 0.01, dark),
    limb({ x: -0.05, y: 0.28, z: 0.48 }, { x: -0.16, y: 0.5, z: 0.75 }, 0.01, dark),
  ]);
}

function spiderBody() {
  const body = 0x4a3358;
  const leg = 0x2e2236;
  const parts = [
    sphere(0.28, 0, 0.22, -0.22, body, 1, 0.85, 1.1),
    sphere(0.17, 0, 0.18, 0.15, body),
  ];
  // 8 隻腳：每隻兩節，先往外往上（膝蓋高過身體），再往下踩地，像蜘蛛的「拱形腳」
  for (const side of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.22 - i * 0.12;
      const spread = (i - 1.5) * 0.28;
      const knee = { x: side * 0.32, y: 0.38, z: z + spread * 0.5 };
      const foot = { x: side * 0.55, y: 0.0, z: z + spread };
      parts.push(limb({ x: side * 0.1, y: 0.18, z }, knee, 0.022, leg));
      parts.push(limb(knee, foot, 0.018, leg));
    }
  }
  return merge(parts);
}

// ─────────────────────────────── 行為 ───────────────────────────────

type Critter = {
  kind: Kind;
  root: THREE.Group;
  wingL: THREE.Mesh | null;
  wingR: THREE.Mesh | null;
  /** 地表方向、往前的切線（綠球座標） */
  n: THREE.Vector3;
  f: THREE.Vector3;
  height: number;
  active: boolean;
  /** 出現／消失的縮放（0～1） */
  grow: number;
  /** 這次出現還能停留幾秒；用完就離開 */
  life: number;
  /** 正在離開（會飛的往上飛走、地上的縮小消失） */
  leaving: boolean;
  /** 離開後還要等幾秒才會再出現 */
  away: number;
  phase: number;
  mode: 'move' | 'rest' | 'hop';
  timer: number;
  /** 跳躍：已經跳了幾秒、總共幾秒、跳多遠（弧度） */
  hopAge: number;
  hopTime: number;
  hopDist: number;
  /** 飛行的基準高度 */
  cruise: number;
};

type CreateCrittersOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  /** 這裡是空地嗎（不在房子、食物裡、在活動範圍內）；radiusRad = 生物佔地（弧度） */
  isOpenGround: (normal: THREE.Vector3, radiusRad: number) => boolean;
};

const KINDS: Kind[] = ['butterfly', 'bee', 'dragonfly', 'grasshopper', 'spider'];
const FLYING: Record<Kind, boolean> = { butterfly: true, bee: true, dragonfly: true, grasshopper: false, spider: false };

const axis = new THREE.Vector3();
const quat = new THREE.Quaternion();
const probeN = new THREE.Vector3();
const probeF = new THREE.Vector3();
const east = new THREE.Vector3();
const basis = new THREE.Matrix4();
const tilt = new THREE.Quaternion();
const euler = new THREE.Euler();

export function createCritters({ groundRadius, up, isOpenGround }: CreateCrittersOptions) {
  const settings: CrittersSettings = { ...CRITTERS_DEFAULT };
  const group = new THREE.Group();
  group.name = 'island_critters';

  // 身體不透明；蜜蜂、蜻蜓的翅膀半透明；蝴蝶翅膀不透明但兩面都要畫（翅膀拍起來會看到背面）
  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
  const wingMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
  const glassWingMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });

  const geometries = {
    butterflyBodies: BUTTERFLY_COLORS.map((color) => butterflyBody(color)),
    butterflyWings: BUTTERFLY_COLORS.map((_, i) => [butterflyWing(i, true), butterflyWing(i, false)] as const),
    beeBody: beeBody(),
    beeWings: [beeWing(true), beeWing(false)] as const,
    dragonflyBody: dragonflyBody(),
    dragonflyWings: [dragonflyWings(true), dragonflyWings(false)] as const,
    grasshopperBody: grasshopperBody(),
    spiderBody: spiderBody(),
  };

  function build(kind: Kind, index: number): Critter {
    const root = new THREE.Group();
    root.name = `critter_${kind}_${index}`;
    let wingL: THREE.Mesh | null = null;
    let wingR: THREE.Mesh | null = null;
    let body: THREE.BufferGeometry;
    let wings: readonly [THREE.BufferGeometry, THREE.BufferGeometry] | null = null;
    let wingMat = wingMaterial;
    if (kind === 'butterfly') {
      body = geometries.butterflyBodies[index % geometries.butterflyBodies.length];
      wings = geometries.butterflyWings[index % geometries.butterflyWings.length];
    } else if (kind === 'bee') {
      body = geometries.beeBody;
      wings = geometries.beeWings;
      wingMat = glassWingMaterial;
    } else if (kind === 'dragonfly') {
      body = geometries.dragonflyBody;
      wings = geometries.dragonflyWings;
      wingMat = glassWingMaterial;
    } else if (kind === 'grasshopper') {
      body = geometries.grasshopperBody;
    } else {
      body = geometries.spiderBody;
    }
    const bodyMesh = new THREE.Mesh(body, bodyMaterial);
    bodyMesh.castShadow = true;
    root.add(bodyMesh);
    if (wings) {
      wingL = new THREE.Mesh(wings[0], wingMat);
      wingR = new THREE.Mesh(wings[1], wingMat);
      wingL.castShadow = wingR.castShadow = kind === 'butterfly';
      root.add(wingL, wingR);
    }
    root.visible = false;
    group.add(root);
    return {
      kind, root, wingL, wingR,
      n: new THREE.Vector3(0, 1, 0), f: new THREE.Vector3(0, 0, 1),
      height: 0, active: false, grow: 0, phase: Math.random() * 100,
      life: 0, leaving: false,
      // 一開始每一隻等的時間都不一樣：陸陸續續出現，不會整群同時冒出來
      away: Math.random() * AWAY_SECONDS[kind][1],
      mode: 'move', timer: Math.random() * 2, hopAge: 0, hopTime: 0.45, hopDist: 0, cruise: 0,
    };
  }

  const critters: Critter[] = [];
  for (const kind of KINDS) for (let i = 0; i < CRITTER_MAX; i++) critters.push(build(kind, i));

  const bodyLength = (c: Critter) => BODY_LENGTH[c.kind] * Math.max(0.1, settings.size);
  const footprint = (c: Critter) => (bodyLength(c) * 0.8) / groundRadius;

  /** 隨機找一塊空地出生：離頂端 15～55°，最多試 20 次 */
  function trySpawn(c: Critter) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const colat = THREE.MathUtils.degToRad(15 + Math.random() * 40);
      const az = Math.random() * Math.PI * 2;
      // 跟 up 垂直的一個方向，轉 az 度
      east.set(1, 0, 0);
      if (Math.abs(east.dot(up)) > 0.9) east.set(0, 0, 1);
      east.addScaledVector(up, -east.dot(up)).normalize().applyAxisAngle(up, az);
      probeN.copy(up).multiplyScalar(Math.cos(colat)).addScaledVector(east, Math.sin(colat)).normalize();
      if (!isOpenGround(probeN, footprint(c))) continue;
      c.n.copy(probeN);
      // 往前的切線：隨便一個跟 n 垂直的方向
      c.f.copy(east).applyAxisAngle(probeN, Math.random() * Math.PI * 2);
      c.f.addScaledVector(c.n, -c.f.dot(c.n)).normalize();
      c.active = true;
      c.grow = 0;
      c.mode = FLYING[c.kind] ? 'move' : 'rest';
      c.timer = 0.5 + Math.random() * 2;
      c.cruise = flyHeight(c.kind) * Math.max(0.1, settings.size);
      const stayMin = Math.min(settings.stayMinSeconds, settings.stayMaxSeconds);
      const stayMax = Math.max(settings.stayMinSeconds, settings.stayMaxSeconds);
      c.life = stayMin + Math.random() * (stayMax - stayMin);
      c.leaving = false;
      c.height = FLYING[c.kind] ? c.cruise : 0;
      return true;
    }
    return false;
  }

  function flyHeight(kind: Kind) {
    if (kind === 'butterfly') return 0.035 + Math.random() * 0.03;
    if (kind === 'bee') return 0.025 + Math.random() * 0.02;
    if (kind === 'dragonfly') return 0.06 + Math.random() * 0.04;
    return 0;
  }

  /** 原地轉向（繞地表法線轉 angle 弧度） */
  function turn(c: Critter, angle: number) {
    c.f.applyAxisAngle(c.n, angle);
    c.f.addScaledVector(c.n, -c.f.dot(c.n)).normalize();
  }

  /**
   * 往前走 dist（世界單位）。前面不是空地（房子、食物、活動範圍外）就不走，大轉彎掉頭。
   * 回傳有沒有走成功
   */
  function advance(c: Critter, dist: number) {
    if (dist <= 0) return true;
    axis.crossVectors(c.n, c.f).normalize();
    quat.setFromAxisAngle(axis, dist / groundRadius);
    probeN.copy(c.n).applyQuaternion(quat);
    // 往前多看一點：快撞到才轉會貼著牆抖
    probeF.copy(c.n).applyQuaternion(quat.setFromAxisAngle(axis, (dist + bodyLength(c) * 2) / groundRadius));
    if (!isOpenGround(probeF, footprint(c))) {
      turn(c, (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 1.4));
      return false;
    }
    quat.setFromAxisAngle(axis, dist / groundRadius);
    c.n.copy(probeN);
    c.f.applyQuaternion(quat).addScaledVector(c.n, -c.f.dot(c.n)).normalize();
    return true;
  }

  function updateFlyer(c: Critter, dt: number, t: number) {
    const speedScale = Math.max(0, settings.speed);
    if (c.kind === 'butterfly') {
      // 蝴蝶：慢慢亂飄，方向一直小幅度改變（兩個不同頻率的 sin 疊起來，不會規律得像機器）
      turn(c, (Math.sin(t * 0.9 + c.phase) * 1.4 + Math.sin(t * 2.3 + c.phase * 1.7) * 0.8) * dt);
      advance(c, 0.05 * speedScale * dt);
      c.height = c.cruise + Math.sin(t * 3.1 + c.phase) * 0.012 * settings.size;
    } else if (c.kind === 'bee') {
      // 蜜蜂：飛一段（之字形），停在空中一下，再換方向
      c.timer -= dt;
      if (c.mode === 'move') {
        turn(c, Math.sin(t * 6 + c.phase) * 3 * dt);
        advance(c, 0.09 * speedScale * dt);
        if (c.timer <= 0) {
          c.mode = 'rest';
          c.timer = 0.4 + Math.random() * 1.2;
        }
      } else if (c.timer <= 0) {
        c.mode = 'move';
        c.timer = 1 + Math.random() * 2.5;
        turn(c, (Math.random() - 0.5) * 3);
      }
      c.height = c.cruise + Math.sin(t * 5 + c.phase) * 0.005 * settings.size;
    } else {
      // 蜻蜓：衝一段直線 → 懸停 → 換個方向再衝
      c.timer -= dt;
      if (c.mode === 'move') {
        advance(c, 0.22 * speedScale * dt);
        if (c.timer <= 0) {
          c.mode = 'rest';
          c.timer = 0.8 + Math.random() * 1.8;
        }
      } else if (c.timer <= 0) {
        c.mode = 'move';
        c.timer = 0.4 + Math.random() * 0.6;
        turn(c, (Math.random() - 0.5) * 3.5);
      }
      c.height = c.cruise + Math.sin(t * 2 + c.phase) * 0.004 * settings.size;
    }
  }

  function updateGround(c: Critter, dt: number) {
    const speedScale = Math.max(0, settings.speed);
    c.timer -= dt;
    if (c.kind === 'grasshopper') {
      if (c.mode === 'rest') {
        c.height = 0;
        if (c.timer <= 0) {
          // 起跳：方向大致往前（±60°），跳 3～6 個身長遠
          turn(c, (Math.random() - 0.5) * 2);
          c.mode = 'hop';
          c.hopAge = 0;
          c.hopTime = 0.45;
          c.hopDist = bodyLength(c) * (3 + Math.random() * 3);
        }
      } else {
        const step = (c.hopDist / c.hopTime) * dt * Math.max(0.2, speedScale);
        c.hopAge += dt * Math.max(0.2, speedScale);
        // 拋物線：中間最高（身長的 1.5 倍）
        const t = Math.min(1, c.hopAge / c.hopTime);
        c.height = 4 * t * (1 - t) * bodyLength(c) * 1.5;
        if (!advance(c, step) || t >= 1) {
          c.mode = 'rest';
          c.height = 0;
          c.timer = 1 + Math.random() * 3;
        }
      }
    } else {
      // 小蜘蛛：慢慢爬一陣、停一陣，爬的時候方向小幅度改變
      if (c.mode === 'move') {
        turn(c, (Math.random() - 0.5) * 2.5 * dt);
        advance(c, 0.012 * speedScale * dt);
        if (c.timer <= 0) {
          c.mode = 'rest';
          c.timer = 0.8 + Math.random() * 2.5;
        }
      } else if (c.timer <= 0) {
        c.mode = 'move';
        c.timer = 1.5 + Math.random() * 3;
        turn(c, (Math.random() - 0.5) * 2.4);
      }
      c.height = 0;
    }
  }

  /** 擺好位置、朝向，翅膀拍動 */
  function place(c: Critter, t: number) {
    const length = bodyLength(c);
    c.root.position.copy(c.n).multiplyScalar(groundRadius + c.height);
    // 右手系：X = n × f、Y = n、Z = f（跟小豬一樣）：模型的 +Z（頭）朝前、+Y 朝天
    east.crossVectors(c.n, c.f).normalize();
    basis.makeBasis(east, c.n, c.f);
    c.root.quaternion.setFromRotationMatrix(basis);
    // 飛的時候身體稍微抬頭、蝴蝶左右晃；蚱蜢跳起來時頭往上仰
    let pitch = 0;
    let roll = 0;
    if (c.kind === 'butterfly') roll = Math.sin(t * 1.3 + c.phase) * 0.35;
    if (c.kind === 'bee' || c.kind === 'dragonfly') pitch = -0.12;
    if (c.kind === 'grasshopper' && c.mode === 'hop') pitch = -0.5 * (1 - Math.min(1, c.hopAge / c.hopTime) * 2);
    c.root.quaternion.multiply(tilt.setFromEuler(euler.set(pitch, 0, roll)));
    // 出現時從 0 長大（彈一下），消失時縮回 0
    c.root.scale.setScalar(length * c.grow);
    if (c.wingL && c.wingR) {
      let flap = 0;
      if (c.kind === 'butterfly') flap = 0.25 + Math.sin(t * 13 + c.phase) * 0.85;
      else if (c.kind === 'bee') flap = 0.3 + Math.sin(t * 60 + c.phase) * 0.45;
      else flap = 0.05 + Math.sin(t * 40 + c.phase) * (c.mode === 'rest' ? 0.12 : 0.2);
      // 左翅（x < 0）往上 = 繞 z 轉負角度；右翅往上 = 正角度
      c.wingL.rotation.z = -flap;
      c.wingR.rotation.z = flap;
    }
    // 蜘蛛爬的時候身體上下抖一點點（像腳在動）
    if (c.kind === 'spider' && c.mode === 'move') c.root.position.addScaledVector(c.n, Math.abs(Math.sin(t * 24 + c.phase)) * length * 0.06);
  }

  let time = 0;
  /**
   * @param active 場景開場動畫結束了沒（還沒結束時生物先不出現）
   */
  function nextAway(kind: Kind) {
    const [min, max] = AWAY_SECONDS[kind];
    return (min + Math.random() * (max - min)) / Math.max(0.05, settings.frequency);
  }

  function update(deltaTime: number, active: boolean) {
    const dt = Math.min(deltaTime, 0.1);
    time += dt;
    group.visible = settings.enabled;
    const counts: Record<Kind, number> = { butterfly: 0, bee: 0, dragonfly: 0, grasshopper: 0, spider: 0 };
    for (const c of critters) {
      const want = active && settings.enabled ? Math.min(CRITTER_MAX, Math.round(Number(settings[SETTING_KEY[c.kind]]) || 0)) : 0;
      const index = counts[c.kind]++;
      // 這一格（第 index 隻）可以出現嗎：面板「同時最多幾隻」調小時，多出來的那幾隻要離開
      const slotOpen = index < want;
      if (!c.active) {
        c.root.visible = false;
        if (!slotOpen) continue;
        // 等時間到了才來；找不到空地就 1 秒後再試
        c.away -= dt;
        if (c.away <= 0 && !trySpawn(c)) c.away = 1;
        continue;
      }
      // 停留時間用完、或這一格被關掉 → 離開
      c.life -= dt;
      if (c.life <= 0 || !slotOpen) c.leaving = true;
      if (c.leaving && FLYING[c.kind]) {
        // 會飛的：一邊往上飛走一邊縮小淡出
        c.cruise += 0.05 * Math.max(0.1, settings.size) * dt;
      }
      c.grow += ((c.leaving ? 0 : 1) - c.grow) * Math.min(1, dt * (c.leaving ? 2 : 4));
      if (c.leaving && c.grow < 0.02) {
        c.active = false;
        c.leaving = false;
        c.root.visible = false;
        c.away = nextAway(c.kind);
        continue;
      }
      if (FLYING[c.kind]) updateFlyer(c, dt, time);
      else updateGround(c, dt);
      place(c, time);
      c.root.visible = true;
    }
  }


  return { object: group, settings, update };
}

export function formatCrittersSettingsForPaste(s: CrittersSettings) {
  return (
    `// 貼回 src/world/objects/critters.ts 的 CRITTERS_DEFAULT\n` +
    `export const CRITTERS_DEFAULT: CrittersSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  butterflies: ${Math.round(s.butterflies)},\n` +
    `  bees: ${Math.round(s.bees)},\n` +
    `  dragonflies: ${Math.round(s.dragonflies)},\n` +
    `  grasshoppers: ${Math.round(s.grasshoppers)},\n` +
    `  spiders: ${Math.round(s.spiders)},\n` +
    `  size: ${s.size.toFixed(2)},\n` +
    `  speed: ${s.speed.toFixed(2)},\n` +
    `  frequency: ${s.frequency.toFixed(2)},\n` +
    `  stayMinSeconds: ${s.stayMinSeconds.toFixed(0)},\n` +
    `  stayMaxSeconds: ${s.stayMaxSeconds.toFixed(0)},\n` +
    `};`
  );
}
