import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 浮空小星球：飄在畫面右後方天空的童話小島。
 * 主島（草地 + 往下長的岩柱）上有一棵「漩渦雲朵樹」與輪胎鞦韆；
 * 左邊小島有井、用吊橋連過來；右邊小島有一根掛燈木樁；四周飄著漩渦雲和碎石。
 *
 * 全部用程式產生（不載 GLB）。同材質的零件會先 merge 成一個 geometry：
 * 幾百個小零件如果各自一個 mesh，每個都要一次 draw call，合併後只剩十幾次。
 *
 * 位置跟荷包蛋太陽一樣「黏在鏡頭上」（camX/camY/camZ 是鏡頭座標）：
 * 轉動場景時它一直留在畫面右後方，像天空背景的一部分。
 */
export type FloatingIslandSettings = {
  enabled: boolean;
  /** 鏡頭座標：+X 右、+Y 上、-Z 往畫面裡（越負越遠） */
  camX: number;
  camY: number;
  camZ: number;
  scale: number;
  /** 繞自己的垂直軸轉（度）：決定看到小島的哪一面 */
  spinDegrees: number;
  /** 往鏡頭方向傾斜（度）：0 = 純側面，越大越看得到草地頂面 */
  tiltDegrees: number;
  /** 自動慢慢自轉（度/秒）；0 = 不轉 */
  autoSpinDegreesPerSecond: number;
  /** 上下漂浮幅度倍率 */
  bobAmount: number;
  /** 鞦韆、水桶擺盪速度倍率 */
  swingSpeed: number;
  /**
   * 遠景霧化（0～1）：把整座島的顏色往 hazeColor 拉，像隔著一層空氣看遠山。
   * 真實世界越遠的東西越淡、越偏天空色（空氣透視），少了它小島會像貼在眼前的貼紙。
   */
  hazeAmount: number;
  hazeColor: string;
  /** 島周圍飄動霧氣的濃度（0 = 關掉） */
  mistAmount: number;
  /** 霧氣大小倍率 */
  mistSize: number;
  /** 霧氣飄動速度倍率 */
  mistSpeed: number;
};

export const FLOATING_ISLAND_DEFAULT: FloatingIslandSettings = {
  enabled: true,
  camX: 2.79,
  camY: 1.89,
  camZ: -11.3,
  scale: 0.2,
  spinDegrees: -109,
  tiltDegrees: 14,
  autoSpinDegreesPerSecond: 0,
  bobAmount: 1,
  swingSpeed: 1,
  hazeAmount: 0.41,
  hazeColor: '#f8bfd8',
  mistAmount: 0.77,
  mistSize: 1.7,
  mistSpeed: 1,
};

// ── 配色（參考圖：奶油白雲、淡紫陰影、黃褐岩石、亮綠草地）──
const COLOR = {
  grass: 0x86c95a,
  grassEdge: 0x5f9f3e,
  rockLight: 0xe2b153,
  rockDark: 0xc48a36,
  trunk: 0x9a6236,
  wood: 0x8b5a2b,
  rope: 0xc9a46a,
  tire: 0x4a4f57,
  brick: 0xb4643c,
  water: 0x3f6f9e,
  cloudTop: 0xfbf1e6,
  cloudBottom: 0xb7a0d8,
  swirl: 0xe2cdbf,
  lamp: 0xffd36b,
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchScale = new THREE.Vector3();
const scratchPos = new THREE.Vector3();
const viewOffset = new THREE.Vector3();
const spinQuat = new THREE.Quaternion();
const tiltQuat = new THREE.Quaternion();

/** 固定種子的亂數：每次重新整理，岩石、雲朵的形狀都一樣 */
function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * 零件收集器：每個零件先套好位置／旋轉／縮放，最後同材質的一起 merge。
 * toNonIndexed：Cylinder 有 index、Icosahedron 沒有，混在一起 merge 會失敗，統一轉成沒有 index 的。
 */
class PartBucket {
  private parts: THREE.BufferGeometry[] = [];
  add(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    if (matrix) g.applyMatrix4(matrix);
    // 只留 position／normal（雲朵另外加 color），uv 沒用到；屬性不一致也會讓 merge 失敗
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
    }
    this.parts.push(g);
  }
  build(material: THREE.Material) {
    if (this.parts.length === 0) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const part of this.parts) part.dispose();
    this.parts = [];
    if (!merged) return null;
    return new THREE.Mesh(merged, material);
  }
}

function compose(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return scratchMatrix.compose(
    scratchPos.set(x, y, z),
    scratchQuat.setFromEuler(scratchEuler.set(rx, ry, rz)),
    scratchScale.set(sx, sy, sz),
  ).clone();
}

/** 粗細會變的管子：TubeGeometry 本身半徑固定，這裡逐圈把頂點往中心縮放，做出樹幹由粗到細 */
function taperedTube(points: THREE.Vector3[], radiusAt: (t: number) => number, tubular = 20, radial = 7) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    // TubeGeometry 的頂點一圈一圈排：第 ring 圈有 radial+1 個點
    const ring = Math.floor(i / (radial + 1));
    const t = ring / tubular;
    curve.getPointAt(t, center);
    v.fromBufferAttribute(position, i).sub(center).multiplyScalar(radiusAt(t)).add(center);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 漩渦雲朵：一顆圓球 + 球面上一條螺旋凹紋。
 * 球的頂點依高度上色（上奶油白、下淡紫），所以一整團雲自然有「底部陰影」。
 */
function addSwirlPuff(
  puffs: PartBucket,
  swirls: PartBucket,
  center: THREE.Vector3,
  radius: number,
  facing: THREE.Vector3,
  shadeTopY: number,
  shadeBottomY: number,
  withSwirl = true,
) {
  const sphere = new THREE.IcosahedronGeometry(radius, 3);
  sphere.translate(center.x, center.y, center.z);
  const position = sphere.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const top = new THREE.Color(COLOR.cloudTop);
  const bottom = new THREE.Color(COLOR.cloudBottom);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const k = THREE.MathUtils.smoothstep(y, shadeBottomY, shadeTopY);
    c.copy(bottom).lerp(top, k);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  sphere.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  puffs.add(sphere);

  if (!withSwirl) return;
  // 螺旋：在「朝外那一面」的切平面上畫阿基米德螺線，再投影回球面
  const n = facing.clone().normalize();
  const t1 = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? X_AXIS : Y_AXIS).normalize();
  const t2 = new THREE.Vector3().crossVectors(n, t1);
  const points: THREE.Vector3[] = [];
  const turns = 1.75;
  const steps = 36;
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * turns * Math.PI * 2;
    const r = 0.62 * (i / steps);
    const dir = n
      .clone()
      .addScaledVector(t1, Math.cos(theta) * r)
      .addScaledVector(t2, Math.sin(theta) * r)
      .normalize();
    points.push(center.clone().addScaledVector(dir, radius * 1.005));
  }
  const swirl = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, radius * 0.045, 5, false);
  swirls.add(swirl);
}

type Bobber = { object: THREE.Object3D; baseY: number; amp: number; speed: number; phase: number };

type CreateFloatingIslandOptions = {
  camera: THREE.Camera;
  settings?: FloatingIslandSettings;
};

export function createFloatingIsland({ camera, settings: initial = FLOATING_ISLAND_DEFAULT }: CreateFloatingIslandOptions) {
  const settings: FloatingIslandSettings = { ...initial };
  const random = seededRandom(31415);

  const anchor = new THREE.Object3D();
  anchor.name = 'floating_island';
  // 擺動層：整座島一起慢慢上下飄、微微晃
  const body = new THREE.Group();
  anchor.add(body);

  const materials = {
    grass: new THREE.MeshStandardMaterial({ color: COLOR.grass, roughness: 0.85 }),
    grassEdge: new THREE.MeshStandardMaterial({ color: COLOR.grassEdge, roughness: 0.9 }),
    rockLight: new THREE.MeshStandardMaterial({ color: COLOR.rockLight, roughness: 0.8, flatShading: true }),
    rockDark: new THREE.MeshStandardMaterial({ color: COLOR.rockDark, roughness: 0.85, flatShading: true }),
    trunk: new THREE.MeshStandardMaterial({ color: COLOR.trunk, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: COLOR.wood, roughness: 0.85, flatShading: true }),
    rope: new THREE.MeshStandardMaterial({ color: COLOR.rope, roughness: 0.9 }),
    tire: new THREE.MeshStandardMaterial({ color: COLOR.tire, roughness: 0.7 }),
    brick: new THREE.MeshStandardMaterial({ color: COLOR.brick, roughness: 0.85, flatShading: true }),
    water: new THREE.MeshStandardMaterial({ color: COLOR.water, roughness: 0.25 }),
    // 雲用頂點色（上白下紫）；roughness 高 + 一點自發光，讓背光面不會變灰黑
    cloud: new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      emissive: 0x6a5a80,
      emissiveIntensity: 0.18,
    }),
    swirl: new THREE.MeshStandardMaterial({ color: COLOR.swirl, roughness: 0.95, emissive: 0x6a5a80, emissiveIntensity: 0.12 }),
    lamp: new THREE.MeshBasicMaterial({ color: COLOR.lamp, toneMapped: false }),
  };

  const buckets = {
    grass: new PartBucket(),
    grassEdge: new PartBucket(),
    rockLight: new PartBucket(),
    rockDark: new PartBucket(),
    trunk: new PartBucket(),
    wood: new PartBucket(),
    rope: new PartBucket(),
    brick: new PartBucket(),
    cloud: new PartBucket(),
    swirl: new PartBucket(),
  };

  /**
   * 一座小島：草地圓盤（邊緣有一圈深綠波浪草）+ 底下一叢往下長的六角岩柱。
   * 岩柱越靠中心越長，整體像倒過來的錐形，就是浮空島的經典剪影。
   */
  function addIsland(cx: number, cy: number, cz: number, radius: number, depth: number) {
    const thickness = radius * 0.22;
    const top = new THREE.CylinderGeometry(radius, radius * 0.96, thickness, 18, 1);
    // 邊緣不要正圓：依角度推進推出一點，比較像自然的土塊
    const pos = top.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const a = Math.atan2(z, x);
      const k = 1 + Math.sin(a * 3 + cx * 7) * 0.05 + Math.sin(a * 5 + cz * 3) * 0.035;
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
    }
    top.computeVertexNormals();
    buckets.grass.add(top, compose(cx, cy - thickness / 2, cz));

    // 波浪草邊：一圈壓扁的小球，貼在草地側面下緣
    const scallops = Math.round(radius * 26);
    for (let i = 0; i < scallops; i++) {
      const a = (i / scallops) * Math.PI * 2;
      const k = 1 + Math.sin(a * 3 + cx * 7) * 0.05 + Math.sin(a * 5 + cz * 3) * 0.035;
      const r = radius * k * 0.98;
      buckets.grassEdge.add(
        new THREE.IcosahedronGeometry(radius * 0.085, 1),
        compose(cx + Math.cos(a) * r, cy - thickness * 0.95, cz + Math.sin(a) * r, 0, 0, 0, 1, 0.75, 1),
      );
    }

    // 岩柱：在圓盤內撒點，越中心越長；淺色、深色交錯，flatShading 讓每個面都有明暗
    const pillarCount = Math.round(radius * 16);
    for (let i = 0; i < pillarCount; i++) {
      const a = random() * Math.PI * 2;
      const d = Math.sqrt(random()) * radius * 0.82;
      const centerFactor = 1 - (d / radius) ** 2 * 0.75;
      const length = depth * centerFactor * (0.55 + random() * 0.55);
      const rTop = radius * (0.16 + random() * 0.08);
      const rBottom = rTop * (0.55 + random() * 0.25);
      const px = cx + Math.cos(a) * d;
      const pz = cz + Math.sin(a) * d;
      const tilt = (random() - 0.5) * 0.25;
      const spin = random() * Math.PI;
      const bucket = random() < 0.5 ? buckets.rockLight : buckets.rockDark;
      const pillar = new THREE.CylinderGeometry(rTop, rBottom, length, 6, 1);
      pillar.translate(0, -length / 2, 0);
      // 底部尖頭：讓岩柱收成一點，不是平平切掉
      const tip = new THREE.CylinderGeometry(rBottom, rBottom * 0.15, rBottom * 1.6, 6, 1);
      tip.translate(0, -length - rBottom * 0.8, 0);
      const m = compose(px, cy - thickness * 0.9, pz, tilt, spin, -tilt * 0.6);
      bucket.add(pillar, m);
      bucket.add(tip, m);
    }
  }

  /** 一團漩渦雲：幾顆大小不一的球擠在一起，朝外那一面畫螺旋 */
  function addCloudCluster(cx: number, cy: number, cz: number, size: number, count: number, swirlFacing: THREE.Vector3) {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + random() * 0.6;
      const spread = size * (i === 0 ? 0 : 0.75);
      const center = new THREE.Vector3(
        cx + Math.cos(a) * spread,
        cy + (random() - 0.4) * size * 0.45,
        cz + Math.sin(a) * spread * 0.6,
      );
      const radius = size * (i === 0 ? 0.75 : 0.45 + random() * 0.25);
      const facing = center.clone().sub(new THREE.Vector3(cx, cy, cz)).add(swirlFacing.clone().multiplyScalar(size));
      addSwirlPuff(buckets.cloud, buckets.swirl, center, radius, facing, cy + size * 0.6, cy - size * 0.7, random() < 0.75);
    }
  }

  // ── 主島 + 兩座小島 ──
  addIsland(0, 0, 0, 1, 1.35);
  const leftIsland = { x: -1.95, y: -0.32, z: 0.25, r: 0.46 };
  addIsland(leftIsland.x, leftIsland.y, leftIsland.z, leftIsland.r, 0.75);
  const rightIsland = { x: 1.6, y: -0.62, z: 0.35, r: 0.42 };
  addIsland(rightIsland.x, rightIsland.y, rightIsland.z, rightIsland.r, 0.7);

  // ── 大樹：S 形樹幹 + 往左伸的掛鞦韆樹枝 + 根部三條小根 ──
  const trunkBase = new THREE.Vector3(0.15, 0, -0.1);
  buckets.trunk.add(
    taperedTube(
      [
        trunkBase,
        new THREE.Vector3(0.3, 0.45, -0.05),
        new THREE.Vector3(0.05, 0.95, 0),
        new THREE.Vector3(-0.15, 1.35, -0.05),
        new THREE.Vector3(-0.05, 1.8, -0.05),
      ],
      // 底部外擴（樹根）、往上漸細
      (t) => 0.17 * (1 - 0.55 * t) + 0.1 * Math.max(0, 0.18 - t) / 0.18,
      28,
      8,
    ),
  );
  const branchPoints = [
    new THREE.Vector3(0.02, 1.05, 0),
    new THREE.Vector3(-0.35, 1.22, 0.04),
    new THREE.Vector3(-0.72, 1.28, 0.06),
    new THREE.Vector3(-0.92, 1.36, 0.06),
  ];
  buckets.trunk.add(taperedTube(branchPoints, (t) => 0.075 * (1 - 0.5 * t), 16, 6));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    buckets.trunk.add(
      taperedTube(
        [
          trunkBase.clone().add(new THREE.Vector3(0, 0.12, 0)),
          trunkBase.clone().add(new THREE.Vector3(Math.cos(a) * 0.18, 0.03, Math.sin(a) * 0.18)),
          trunkBase.clone().add(new THREE.Vector3(Math.cos(a) * 0.32, -0.01, Math.sin(a) * 0.32)),
        ],
        (t) => 0.06 * (1 - 0.7 * t),
        8,
        5,
      ),
    );
  }

  // ── 樹冠：一大團漩渦雲（橢球表面撒點，費氏螺旋分佈比較均勻）──
  const canopyCenter = new THREE.Vector3(0, 2.2, -0.05);
  const canopyRadii = new THREE.Vector3(1.3, 0.72, 0.95);
  // 中間先塞一顆大球，避免球與球之間露出空洞
  addSwirlPuff(
    buckets.cloud,
    buckets.swirl,
    canopyCenter,
    0.85,
    new THREE.Vector3(0, 0, 1),
    canopyCenter.y + 0.6,
    canopyCenter.y - 0.7,
    false,
  );
  const CANOPY_PUFFS = 26;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < CANOPY_PUFFS; i++) {
    const y = 1 - (i / (CANOPY_PUFFS - 1)) * 2;
    const ring = Math.sqrt(1 - y * y);
    const a = i * golden;
    const dir = new THREE.Vector3(Math.cos(a) * ring, y * 0.85, Math.sin(a) * ring);
    const center = canopyCenter.clone().add(
      new THREE.Vector3(dir.x * canopyRadii.x, dir.y * canopyRadii.y, dir.z * canopyRadii.z).multiplyScalar(0.82),
    );
    const radius = 0.34 + random() * 0.2;
    addSwirlPuff(
      buckets.cloud,
      buckets.swirl,
      center,
      radius,
      dir,
      canopyCenter.y + 0.75,
      canopyCenter.y - 0.75,
      // 底部朝下的那幾顆不用畫螺旋，反正看不到
      dir.y > -0.55,
    );
  }

  // ── 輪胎鞦韆：掛在樹枝上，繞掛點擺盪 ──
  const swingPivot = new THREE.Group();
  swingPivot.position.set(-0.68, 1.26, 0.06);
  body.add(swingPivot);
  const ropeLength = 0.62;
  const swingRope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ropeLength, 5), materials.rope);
  swingRope.position.y = -ropeLength / 2;
  swingPivot.add(swingRope);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.05, 8, 18), materials.tire);
  tire.position.y = -ropeLength - 0.1;
  tire.rotation.y = 0.5;
  swingPivot.add(tire);

  // ── 主島邊的小木柵欄 ──
  const fenceStart = new THREE.Vector3(-0.35, 0, -0.72);
  const fenceEnd = new THREE.Vector3(0.45, 0, -0.68);
  const FENCE_POSTS = 4;
  for (let i = 0; i < FENCE_POSTS; i++) {
    const p = fenceStart.clone().lerp(fenceEnd, i / (FENCE_POSTS - 1));
    buckets.wood.add(
      new THREE.BoxGeometry(0.045, 0.3, 0.045),
      compose(p.x, 0.15, p.z, 0, 0, (random() - 0.5) * 0.2),
    );
  }
  const fenceDir = fenceEnd.clone().sub(fenceStart);
  const fenceLength = fenceDir.length();
  const fenceYaw = -Math.atan2(fenceDir.z, fenceDir.x);
  const fenceMid = fenceStart.clone().lerp(fenceEnd, 0.5);
  for (const h of [0.12, 0.23]) {
    buckets.wood.add(new THREE.BoxGeometry(fenceLength, 0.03, 0.025), compose(fenceMid.x, h, fenceMid.z, 0, fenceYaw, 0));
  }

  // ── 左島：紅磚井 + 兩根柱子撐一根橫桿 ──
  const well = { x: leftIsland.x - 0.02, y: leftIsland.y, z: leftIsland.z - 0.02 };
  // LatheGeometry：把「井壁的剖面」繞 Y 軸轉一圈，就是有厚度、中間空心的圓筒
  const wallProfile = [
    new THREE.Vector2(0.15, 0),
    new THREE.Vector2(0.21, 0),
    new THREE.Vector2(0.21, 0.24),
    new THREE.Vector2(0.15, 0.24),
    new THREE.Vector2(0.15, 0),
  ];
  buckets.brick.add(new THREE.LatheGeometry(wallProfile, 10), compose(well.x, well.y, well.z));
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.15, 10), materials.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(well.x, well.y + 0.16, well.z);
  body.add(water);
  for (const side of [-1, 1]) {
    buckets.wood.add(new THREE.BoxGeometry(0.04, 0.55, 0.04), compose(well.x + side * 0.25, well.y + 0.27, well.z));
  }
  buckets.wood.add(new THREE.BoxGeometry(0.6, 0.04, 0.04), compose(well.x, well.y + 0.54, well.z));
  buckets.rope.add(new THREE.CylinderGeometry(0.01, 0.01, 0.26, 5), compose(well.x, well.y + 0.4, well.z));

  // 小島底下吊著一個水桶，會跟著晃
  const bucketPivot = new THREE.Group();
  bucketPivot.position.set(leftIsland.x + 0.12, leftIsland.y - 0.45, leftIsland.z + 0.15);
  body.add(bucketPivot);
  const bucketRope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 5), materials.rope);
  bucketRope.position.y = -0.2;
  bucketPivot.add(bucketRope);
  const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.1, 8), materials.wood);
  pail.position.y = -0.44;
  bucketPivot.add(pail);

  // ── 吊橋：左島邊緣 → 主島邊緣，木板沿著下垂的弧線排 ──
  const bridgeA = new THREE.Vector3(leftIsland.x + leftIsland.r * 0.85, leftIsland.y + 0.01, leftIsland.z - 0.05);
  const bridgeB = new THREE.Vector3(-0.9, 0.01, 0.05);
  const bridgeAt = (t: number, lift = 0) => {
    // 中間往下垂：sin(πt) 兩端是 0、中間最低
    const p = bridgeA.clone().lerp(bridgeB, t);
    p.y -= Math.sin(Math.PI * t) * 0.12;
    p.y += lift;
    return p;
  };
  const bridgeDir = bridgeB.clone().sub(bridgeA);
  const bridgeYaw = -Math.atan2(bridgeDir.z, bridgeDir.x);
  const PLANKS = 9;
  for (let i = 0; i < PLANKS; i++) {
    const t = (i + 0.5) / PLANKS;
    const p = bridgeAt(t);
    // 木板順著弧線的斜率傾斜
    const slope = Math.atan2(bridgeAt(t + 0.02).y - bridgeAt(t - 0.02).y, bridgeDir.length() * 0.04);
    buckets.wood.add(
      new THREE.BoxGeometry(0.06, 0.02, 0.2),
      compose(p.x, p.y, p.z, 0, bridgeYaw, slope + (random() - 0.5) * 0.15),
    );
  }
  // 兩條扶手繩：跟木板同一條弧線，往上抬一點、左右各偏一點
  const sideOffset = new THREE.Vector3(-bridgeDir.z, 0, bridgeDir.x).normalize().multiplyScalar(0.1);
  for (const side of [-1, 1]) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) pts.push(bridgeAt(i / 12, 0.14).addScaledVector(sideOffset, side));
    buckets.rope.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 4, false));
    for (const t of [0, 1]) {
      const p = bridgeAt(t).addScaledVector(sideOffset, side);
      buckets.wood.add(new THREE.BoxGeometry(0.03, 0.2, 0.03), compose(p.x, p.y + 0.08, p.z));
    }
  }

  // ── 右島：掛燈木樁 ──
  const post = { x: rightIsland.x + 0.05, y: rightIsland.y, z: rightIsland.z - 0.05 };
  buckets.wood.add(new THREE.BoxGeometry(0.045, 0.5, 0.045), compose(post.x, post.y + 0.25, post.z, 0, 0, 0.06));
  buckets.wood.add(new THREE.BoxGeometry(0.18, 0.035, 0.035), compose(post.x + 0.06, post.y + 0.48, post.z));
  const lampPivot = new THREE.Group();
  lampPivot.position.set(post.x + 0.13, post.y + 0.47, post.z);
  body.add(lampPivot);
  const lampBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 8), materials.lamp);
  lampBody.position.y = -0.08;
  lampPivot.add(lampBody);
  const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.05, 8), materials.wood);
  lampCap.position.y = -0.02;
  lampPivot.add(lampCap);

  // ── 島邊的漩渦雲：主島兩側、右島底下、後方 ──
  const front = new THREE.Vector3(0, 0, 1);
  addCloudCluster(-0.95, -0.55, 0.35, 0.42, 5, front);
  addCloudCluster(1.15, -0.45, -0.15, 0.5, 6, front);
  addCloudCluster(0.6, -1.05, 0.45, 0.32, 4, front);
  addCloudCluster(2.0, -0.85, 0.0, 0.34, 4, front);
  addCloudCluster(-0.2, -0.35, -0.75, 0.45, 5, front);

  // 合併同材質的零件，加進場景
  for (const [key, bucket] of Object.entries(buckets)) {
    const mesh = bucket.build(materials[key as keyof typeof buckets]);
    if (mesh) {
      mesh.name = `floating_island_${key}`;
      body.add(mesh);
    }
  }

  // ── 周圍漂浮的碎石：每顆自己上下飄 ──
  const bobbers: Bobber[] = [];
  const debrisSpots = [
    [-2.6, -0.2, 0.3],
    [-2.35, -1.0, 0.1],
    [-0.6, -1.4, 0.4],
    [0.9, -1.75, 0.2],
    [2.3, -0.35, 0.3],
    [2.15, -1.35, 0.1],
    [-1.4, -1.25, 0.5],
    [0.25, -1.95, -0.1],
  ];
  for (const [x, y, z] of debrisSpots) {
    const size = 0.07 + random() * 0.07;
    const rock = new THREE.Mesh(
      new THREE.CylinderGeometry(size, size * 0.35, size * 2.4, 6, 1),
      random() < 0.5 ? materials.rockLight : materials.rockDark,
    );
    rock.position.set(x, y, z);
    rock.rotation.set((random() - 0.5) * 0.6, random() * Math.PI, (random() - 0.5) * 0.6);
    body.add(rock);
    bobbers.push({ object: rock, baseY: y, amp: 0.04 + random() * 0.05, speed: 0.6 + random() * 0.6, phase: random() * Math.PI * 2 });
  }

  // 島太遠，太陽光的陰影貼圖照不到；開陰影只會白算，還可能在邊緣留下怪影子
  body.traverse((child) => {
    child.castShadow = false;
    child.receiveShadow = false;
  });

  // ── 遠景霧化：記住每個材質原本的顏色，之後依 hazeAmount 往霧色混 ──
  // 受光材質最後的顏色 ≈ color × 光 + emissive。
  // 把 color 壓暗 (1-a)、emissive 補上 霧色×a，整體就會往霧色靠，而且背光面也一樣變淡（不會留黑影）
  const hazeTargets = Object.values(materials).map((material) => ({
    material,
    color: material.color.clone(),
    emissive: 'emissive' in material ? (material as THREE.MeshStandardMaterial).emissive.clone() : null,
    emissiveIntensity: 'emissiveIntensity' in material ? (material as THREE.MeshStandardMaterial).emissiveIntensity : 1,
  }));
  const hazeColor = new THREE.Color();
  function applyHaze() {
    const a = THREE.MathUtils.clamp(settings.hazeAmount, 0, 1);
    hazeColor.set(settings.hazeColor);
    for (const target of hazeTargets) {
      if (target.emissive) {
        const m = target.material as THREE.MeshStandardMaterial;
        m.color.copy(target.color).multiplyScalar(1 - a);
        // emissiveIntensity 固定成 1，把原本的強度乘進顏色裡，才好跟霧色線性混合
        m.emissive.copy(target.emissive).multiplyScalar(target.emissiveIntensity * (1 - a)).add(
          hazeColor.clone().multiplyScalar(a * 0.85),
        );
        m.emissiveIntensity = 1;
      } else {
        // 發光燈（MeshBasicMaterial）不吃光，直接混顏色就好；只混一半，燈還是要看得出亮
        target.material.color.copy(target.color).lerp(hazeColor, a * 0.5);
      }
    }
  }

  // ── 飄動的霧：幾片柔邊半透明 Sprite（永遠面向鏡頭的平面），繞在島的底部與小島之間 ──
  const mistTexture = createMistTexture();
  type MistPuff = { sprite: THREE.Sprite; material: THREE.SpriteMaterial; base: THREE.Vector3; size: number; phase: number; drift: number };
  const mistPuffs: MistPuff[] = [];
  const mistSpots: Array<[number, number, number, number]> = [
    // x, y, z, 大小
    [-1.6, -0.75, 0.6, 1.6],
    [-0.3, -0.95, 0.75, 2.1],
    [1.0, -1.05, 0.6, 1.8],
    [2.0, -0.9, 0.4, 1.4],
    [0.4, -1.55, 0.3, 2.2],
    [-1.0, -1.45, 0.2, 1.7],
    [-2.4, -0.45, 0.1, 1.2],
    [0.2, 1.3, 0.6, 1.5],
    [1.4, 0.2, -0.4, 1.4],
    [-1.2, 0.15, -0.5, 1.5],
  ];
  for (const [x, y, z, size] of mistSpots) {
    const material = new THREE.SpriteMaterial({
      map: mistTexture,
      color: settings.hazeColor,
      transparent: true,
      opacity: 0,
      // 霧是半透明的「一片」：不寫深度，否則後面的霧和島會被前面這片透明的方塊擋掉
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.name = 'floating_island_mist';
    sprite.position.set(x, y, z);
    // 霧不參與點擊：滑鼠點到霧不算點到島
    sprite.raycast = () => {};
    body.add(sprite);
    mistPuffs.push({ sprite, material, base: new THREE.Vector3(x, y, z), size, phase: random() * Math.PI * 2, drift: 0.15 + random() * 0.2 });
  }

  function updateMist(t: number) {
    const amount = Math.max(0, settings.mistAmount);
    for (const puff of mistPuffs) {
      puff.sprite.visible = amount > 0.001;
      if (!puff.sprite.visible) continue;
      const w = t * settings.mistSpeed;
      // 左右慢慢飄、稍微上下，透明度與大小也跟著呼吸，看起來像霧在流動
      puff.sprite.position.set(
        puff.base.x + Math.sin(w * 0.25 + puff.phase) * puff.drift * 2,
        puff.base.y + Math.sin(w * 0.35 + puff.phase * 1.7) * puff.drift * 0.4,
        puff.base.z,
      );
      const breathe = 1 + Math.sin(w * 0.3 + puff.phase) * 0.12;
      const size = puff.size * settings.mistSize * breathe;
      puff.sprite.scale.set(size * 1.6, size, 1);
      puff.material.opacity = amount * (0.4 + 0.25 * Math.sin(w * 0.4 + puff.phase * 2.3));
      puff.material.color.set(settings.hazeColor);
    }
  }

  let introGrow = 1;
  let time = 0;
  let autoSpin = 0;

  function applyPlacement() {
    anchor.visible = settings.enabled && introGrow > 0.001;
    camera.updateMatrixWorld(true);
    viewOffset.set(settings.camX, settings.camY, settings.camZ);
    anchor.position.copy(viewOffset).applyMatrix4(camera.matrixWorld);
    // 面向鏡頭：先跟鏡頭同方向（側面朝鏡頭），再往鏡頭方向前傾一點露出草地，最後繞自己的軸轉
    anchor.quaternion
      .copy(camera.quaternion)
      .multiply(tiltQuat.setFromAxisAngle(X_AXIS, THREE.MathUtils.degToRad(settings.tiltDegrees)))
      .multiply(spinQuat.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees) + autoSpin));
    anchor.scale.setScalar(settings.scale * Math.max(0.0001, introGrow));
  }

  function applySettings() {
    applyHaze();
    applyPlacement();
  }

  function update(deltaTime: number) {
    const dt = Math.min(deltaTime, 0.1);
    time += dt;
    autoSpin += THREE.MathUtils.degToRad(settings.autoSpinDegreesPerSecond) * dt;
    // 鏡頭每幀可能被轉動，位置要每幀跟著算
    applyPlacement();
    if (!anchor.visible) return;
    const bob = settings.bobAmount;
    body.position.y = Math.sin(time * 0.7) * 0.06 * bob;
    body.rotation.z = Math.sin(time * 0.45 + 1) * 0.015 * bob;
    body.rotation.x = Math.sin(time * 0.38) * 0.01 * bob;
    const swing = time * settings.swingSpeed;
    swingPivot.rotation.z = Math.sin(swing * 1.6) * 0.16;
    swingPivot.rotation.x = Math.sin(swing * 1.1 + 0.6) * 0.05;
    bucketPivot.rotation.z = Math.sin(swing * 1.9 + 2) * 0.12;
    lampPivot.rotation.z = Math.sin(swing * 2.2 + 1) * 0.1;
    updateMist(time);
    for (const b of bobbers) {
      b.object.position.y = b.baseY + Math.sin(time * b.speed + b.phase) * b.amp * bob;
      b.object.rotation.y += dt * 0.3;
    }
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1.4);
    applyPlacement();
  }

  applyHaze();
  applyPlacement();
  updateMist(0);

  return {
    object: anchor,
    settings,
    applySettings,
    setIntroGrow,
    update,
  };
}

/** 霧的貼圖：中間白、往外漸漸透明的圓（柔邊），用 canvas 畫，不用另外放圖檔 */
function createMistTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function formatFloatingIslandSettingsForPaste(s: FloatingIslandSettings) {
  return (
    `// 貼回 src/world/objects/floatingIsland.ts 的 FLOATING_ISLAND_DEFAULT\n` +
    `export const FLOATING_ISLAND_DEFAULT: FloatingIslandSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  camX: ${s.camX.toFixed(2)},\n` +
    `  camY: ${s.camY.toFixed(2)},\n` +
    `  camZ: ${s.camZ.toFixed(2)},\n` +
    `  scale: ${s.scale.toFixed(3)},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  tiltDegrees: ${s.tiltDegrees},\n` +
    `  autoSpinDegreesPerSecond: ${s.autoSpinDegreesPerSecond},\n` +
    `  bobAmount: ${s.bobAmount.toFixed(2)},\n` +
    `  swingSpeed: ${s.swingSpeed.toFixed(2)},\n` +
    `  hazeAmount: ${s.hazeAmount.toFixed(2)},\n` +
    `  hazeColor: '${s.hazeColor}',\n` +
    `  mistAmount: ${s.mistAmount.toFixed(2)},\n` +
    `  mistSize: ${s.mistSize.toFixed(2)},\n` +
    `  mistSpeed: ${s.mistSpeed.toFixed(2)},\n` +
    `};\n`
  );
}
