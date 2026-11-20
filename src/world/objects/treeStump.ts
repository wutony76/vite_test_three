import * as THREE from 'three';
import { TREE_STUMP_LAYOUT_DEFAULT, type TreeStumpLayout } from './treeStumpLayout';

/**
 * 綠球上的樹墩：方方胖胖的樹幹、切面有年輪和裂縫、左下一截小樹枝。
 *
 * 為什麼不用 glb＋貼圖？
 *   點陣貼圖（png/webp）解析度是固定的：模型放大 3 倍，每個貼圖像素也跟著放大 3 倍 → 糊掉；
 *   只拉寬某一軸，貼圖還會被拉扁。
 *   這裡改成「程序化紋路」：每個像素在 GPU 上用數學（雜訊、年輪公式）即時算出顏色，
 *   沒有解析度上限，放多大都是銳利的。
 *
 * 拉寬時紋路怎麼辦？
 *   幾何頂點存的是「原始模型座標」，shader 再乘上 uStretch（寬、高、深的倍率）得到「實際尺寸座標」。
 *   樹皮紋用實際尺寸座標算 → 拉寬只會多長出幾條紋路，不會被拉扁；
 *   年輪則跟著外形走（樹變橢圓，年輪也變橢圓，跟真的木頭一樣），線條用 fwidth 抗鋸齒，一樣不糊。
 *
 * 模型座標：y 朝上、底部在 y = 0（再往下埋 BURY_Y 一截進球裡，避免球面彎曲露出縫）、
 *           底寬約 1，+z 是正面。
 */

// ── 1. 尺寸常數（模型座標） ──

const TOP_Y = 0.7; // 切口平均高度
const BURY_Y = -0.14; // 往球裡埋多深：綠球是彎的，平底放上去邊緣會翹起，所以多埋一截
const BASE_RADIUS = 0.47;
const BARK_SEGMENTS = 96; // 繞一圈幾格：太少輪廓會變多邊形
const BARK_ROWS = 24;
const CAP_RINGS = 8;

/** 每一種表面在 shader 裡用不同公式上色（存在頂點屬性 aKind） */
const KIND_BARK = 0; // 樹皮：直向裂紋
const KIND_END_GRAIN = 1; // 切面：年輪

// ── 2. 小工具：可重現的亂數 ──

/** mulberry32：同一個 seed 每次得到一樣的亂數序列 → 存檔後重新整理，造型不會變 */
function createRng(seed: number) {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 3. 幾何建造器 ──

type VertexAttrs = {
  kind: number;
  /** 年輪座標：xy = 以髓心為中心的正規化圓盤座標（邊緣長度 1），z = 年輪密度倍率 */
  coord: [number, number, number];
  /** 木紋方向（樹幹 = 向上，樹枝 = 沿樹枝） */
  axis: THREE.Vector3;
  /** 預先烘好的陰影（ambient occlusion）：0.5 = 很暗的凹處，1 = 不遮擋 */
  ao: number;
};

class StumpMeshBuilder {
  private positions: number[] = [];
  private kinds: number[] = [];
  private coords: number[] = [];
  private axes: number[] = [];
  private aos: number[] = [];
  private indices: number[] = [];
  private readonly ab = new THREE.Vector3();
  private readonly ac = new THREE.Vector3();
  private readonly pa = new THREE.Vector3();
  private readonly pb = new THREE.Vector3();
  private readonly pc = new THREE.Vector3();

  addVertex(p: THREE.Vector3, attrs: VertexAttrs) {
    this.positions.push(p.x, p.y, p.z);
    this.kinds.push(attrs.kind);
    this.coords.push(...attrs.coord);
    this.axes.push(attrs.axis.x, attrs.axis.y, attrs.axis.z);
    this.aos.push(attrs.ao);
    return this.positions.length / 3 - 1;
  }

  /**
   * 加一個三角形，並保證它朝 outward 那一面。
   * 三角形的「正面」由頂點順序（逆時針）決定，順序反了光照會變黑、背面剔除還會整片消失；
   * 與其每個地方手算順序，不如算一下法線，跟期望方向相反就交換。
   */
  addTri(a: number, b: number, c: number, outward: THREE.Vector3) {
    this.read(a, this.pa);
    this.read(b, this.pb);
    this.read(c, this.pc);
    this.ab.subVectors(this.pb, this.pa);
    this.ac.subVectors(this.pc, this.pa);
    const faceNormal = this.ab.cross(this.ac);
    if (faceNormal.dot(outward) >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  addQuad(a: number, b: number, c: number, d: number, outward: THREE.Vector3) {
    this.addTri(a, b, c, outward);
    this.addTri(a, c, d, outward);
  }

  private read(index: number, target: THREE.Vector3) {
    return target.set(this.positions[index * 3], this.positions[index * 3 + 1], this.positions[index * 3 + 2]);
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('aKind', new THREE.Float32BufferAttribute(this.kinds, 1));
    geometry.setAttribute('aCoord', new THREE.Float32BufferAttribute(this.coords, 3));
    geometry.setAttribute('aAxis', new THREE.Float32BufferAttribute(this.axes, 3));
    geometry.setAttribute('aAO', new THREE.Float32BufferAttribute(this.aos, 1));
    geometry.setIndex(this.indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// ── 4. 樹幹外形 ──

type TrunkShape = {
  radiusAt: (theta: number, y: number) => number;
  /** 切口高度（不是完全平的，有一點高低差才像手鋸的） */
  topAt: (theta: number) => number;
  /** 樹皮凸起程度 -1（凹溝）~ 1（凸脊），拿來烘 AO */
  ridgeAt: (theta: number, y: number) => number;
};

function createTrunkShape(rng: () => number): TrunkShape {
  const phase = Array.from({ length: 8 }, () => rng() * Math.PI * 2);
  const squareRotation = rng() * Math.PI * 0.5;

  // 超橢圓（superellipse）：n = 2 是圓、n 越大越接近方形。參考圖的樹墩方方的，取 n = 3
  const squareness = (theta: number) => {
    const n = 3;
    const t = theta - squareRotation;
    return Math.pow(Math.pow(Math.abs(Math.cos(t)), n) + Math.pow(Math.abs(Math.sin(t)), n), -1 / n) / 1.06;
  };

  const ridgeAt = (theta: number, y: number) => {
    const twist = theta + 0.25 * y; // 樹皮直紋稍微扭一點，比較自然
    return (
      (Math.sin(9 * twist + phase[0]) * 0.5 +
        Math.sin(15 * twist + phase[1]) * 0.32 +
        Math.sin(26 * twist + phase[2]) * 0.18)
    );
  };

  const radiusAt = (theta: number, y: number) => {
    const yy = Math.max(y, 0);
    const ridge = ridgeAt(theta, y) * 0.045;
    const bulge = Math.sin(yy * 6 + phase[3]) * 0.012;
    // 樹根往外張（只在底部），四個方向各一條粗根
    const rootLobe = Math.pow(Math.max(0, Math.cos(4 * theta + phase[4])), 3);
    const flare = 0.12 * Math.pow(Math.max(0, 1 - (yy + 0.02) / 0.32), 2) * (0.5 + 0.5 * rootLobe);
    const taper = 0.03 * (1 - yy / TOP_Y);
    return BASE_RADIUS * squareness(theta) * (1 + ridge + bulge) + flare + taper;
  };

  const topAt = (theta: number) =>
    TOP_Y + 0.022 * Math.sin(2 * theta + phase[5]) + 0.01 * Math.sin(5 * theta + phase[6]);

  return { radiusAt, topAt, ridgeAt };
}

const UP = new THREE.Vector3(0, 1, 0);

/** 樹皮：繞一圈的格子網（頭尾相接，不另外複製接縫那一排，法線才不會在接縫斷掉） */
function buildBark(shape: TrunkShape) {
  const builder = new StumpMeshBuilder();
  const grid: number[][] = [];
  const p = new THREE.Vector3();
  for (let i = 0; i < BARK_SEGMENTS; i++) {
    const theta = (i / BARK_SEGMENTS) * Math.PI * 2;
    const column: number[] = [];
    const top = shape.topAt(theta);
    for (let j = 0; j <= BARK_ROWS; j++) {
      // t^1.4：底部格子比較密，樹根張開的曲線才圓滑
      const t = Math.pow(j / BARK_ROWS, 1.4);
      const y = BURY_Y + (top - BURY_Y) * t;
      const r = shape.radiusAt(theta, y);
      p.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
      // AO：越靠近地面越暗、凹溝比凸脊暗
      const groundAo = 0.55 + 0.45 * THREE.MathUtils.smoothstep(y, -0.04, 0.32);
      const ridgeAo = 0.86 + 0.14 * shape.ridgeAt(theta, y);
      column.push(builder.addVertex(p, { kind: KIND_BARK, coord: [0, 0, 0], axis: UP, ao: groundAo * ridgeAo }));
    }
    grid.push(column);
  }
  const outward = new THREE.Vector3();
  for (let i = 0; i < BARK_SEGMENTS; i++) {
    const next = (i + 1) % BARK_SEGMENTS;
    const theta = ((i + 0.5) / BARK_SEGMENTS) * Math.PI * 2;
    outward.set(Math.cos(theta), 0, Math.sin(theta));
    for (let j = 0; j < BARK_ROWS; j++) {
      builder.addQuad(grid[i][j], grid[next][j], grid[next][j + 1], grid[i][j + 1], outward);
    }
  }
  return builder.build();
}

/**
 * 切面：從樹皮頂端那圈往髓心收，一圈一圈的同心網格。
 * 髓心（年輪中心）故意偏一點，真的樹很少剛好在正中間。
 */
function buildCap(shape: TrunkShape, rng: () => number) {
  const builder = new StumpMeshBuilder();
  const pithX = (rng() - 0.5) * 0.1;
  const pithZ = (rng() - 0.5) * 0.1;
  const phase = rng() * Math.PI * 2;
  const centerY = TOP_Y + 0.03;
  const rings: number[][] = [];
  const p = new THREE.Vector3();
  const rim = new THREE.Vector3();

  // 第 0 圈 = 跟樹皮頂端同一個位置（rho 標 1）；第 1 圈往內縮一點、抬高一點 → 一道小倒角
  for (let k = 0; k <= CAP_RINGS; k++) {
    const ring: number[] = [];
    const rho = k === 0 ? 1 : 0.97 * (1 - (k - 1) / CAP_RINGS);
    for (let i = 0; i < BARK_SEGMENTS; i++) {
      const theta = (i / BARK_SEGMENTS) * Math.PI * 2;
      const top = shape.topAt(theta);
      const r = shape.radiusAt(theta, top);
      rim.set(Math.cos(theta) * r, top, Math.sin(theta) * r);
      if (k === 0) {
        p.copy(rim);
      } else {
        // 從髓心往邊緣內插，再加一點中間微微隆起、有點起伏
        const rimInnerY = top + 0.012;
        p.set(
          pithX + (rim.x - pithX) * rho,
          rimInnerY + (centerY - rimInnerY) * (1 - rho) + 0.015 * (1 - rho * rho) + 0.006 * Math.sin(3 * theta + phase) * rho,
          pithZ + (rim.z - pithZ) * rho,
        );
      }
      ring.push(
        builder.addVertex(p, {
          kind: KIND_END_GRAIN,
          coord: [Math.cos(theta) * rho, Math.sin(theta) * rho, 1],
          axis: UP,
          ao: 1,
        }),
      );
    }
    rings.push(ring);
  }
  const pith = builder.addVertex(new THREE.Vector3(pithX, centerY + 0.015, pithZ), {
    kind: KIND_END_GRAIN,
    coord: [0, 0, 1],
    axis: UP,
    ao: 1,
  });
  for (let k = 0; k < CAP_RINGS; k++) {
    for (let i = 0; i < BARK_SEGMENTS; i++) {
      const next = (i + 1) % BARK_SEGMENTS;
      builder.addQuad(rings[k][i], rings[k][next], rings[k + 1][next], rings[k + 1][i], UP);
    }
  }
  const inner = rings[CAP_RINGS];
  for (let i = 0; i < BARK_SEGMENTS; i++) builder.addTri(inner[i], inner[(i + 1) % BARK_SEGMENTS], pith, UP);
  return builder.build();
}

/** 左下的小樹枝：一段斜斜往外伸的圓木，末端是有年輪的切面 */
function buildBranch(shape: TrunkShape, rng: () => number) {
  const builder = new StumpMeshBuilder();
  const SEGMENTS = 24;
  const ROWS = 8;
  const theta = THREE.MathUtils.degToRad(150 + rng() * 25);
  const baseY = 0.13 + rng() * 0.05;
  const dir = new THREE.Vector3(Math.cos(theta), 0.22, Math.sin(theta)).normalize();
  const start = new THREE.Vector3(Math.cos(theta) * 0.22, baseY, Math.sin(theta) * 0.22);
  const surfaceR = shape.radiusAt(theta, baseY);
  const length = (surfaceR - 0.22 + 0.16) / Math.hypot(dir.x, dir.z);
  const radius = 0.085;
  const phase = rng() * Math.PI * 2;

  // 跟樹枝方向垂直的兩個軸，用來繞一圈
  const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
  const lift = new THREE.Vector3().crossVectors(side, dir).normalize();
  const ring = (along: number, scale: number) => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const a = (i / SEGMENTS) * Math.PI * 2;
      const r = radius * scale * (1 + 0.07 * Math.sin(6 * a + phase) + 0.04 * Math.sin(11 * a + phase * 2));
      points.push(
        start
          .clone()
          .addScaledVector(dir, along)
          .addScaledVector(side, Math.cos(a) * r)
          .addScaledVector(lift, Math.sin(a) * r),
      );
    }
    return points;
  };

  const bodyRows: number[][] = [];
  for (let j = 0; j <= ROWS; j++) {
    const t = j / ROWS;
    const points = ring(length * t, 1 - 0.12 * t);
    bodyRows.push(
      points.map((pt) =>
        builder.addVertex(pt, {
          kind: KIND_BARK,
          coord: [0, 0, 0],
          axis: dir,
          ao: 0.6 + 0.4 * THREE.MathUtils.smoothstep(t, 0.2, 0.7),
        }),
      ),
    );
  }
  const outward = new THREE.Vector3();
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const next = (i + 1) % SEGMENTS;
      const a = ((i + 0.5) / SEGMENTS) * Math.PI * 2;
      outward.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(lift, Math.sin(a));
      builder.addQuad(bodyRows[j][i], bodyRows[j][next], bodyRows[j + 1][next], bodyRows[j + 1][i], outward);
    }
  }

  // 末端切面：邊緣一圈（樹皮）→ 內縮倒角一圈 → 髓心
  const capAttrs = (u: number, v: number): VertexAttrs => ({
    kind: KIND_END_GRAIN,
    coord: [u, v, 0.32], // 0.32：小樹枝的年輪比樹幹少
    axis: dir,
    ao: 1,
  });
  const tipRim = ring(length, 0.88);
  const tipInset = ring(length + 0.012, 0.88 * 0.92);
  const rimIds = tipRim.map((pt, i) => {
    const a = (i / SEGMENTS) * Math.PI * 2;
    return builder.addVertex(pt, capAttrs(Math.cos(a), Math.sin(a)));
  });
  const insetIds = tipInset.map((pt, i) => {
    const a = (i / SEGMENTS) * Math.PI * 2;
    return builder.addVertex(pt, capAttrs(Math.cos(a) * 0.93, Math.sin(a) * 0.93));
  });
  const center = builder.addVertex(start.clone().addScaledVector(dir, length + 0.018), capAttrs(0, 0));
  for (let i = 0; i < SEGMENTS; i++) {
    const next = (i + 1) % SEGMENTS;
    builder.addQuad(rimIds[i], rimIds[next], insetIds[next], insetIds[i], dir);
    builder.addTri(insetIds[i], insetIds[next], center, dir);
  }
  return builder.build();
}

/**
 * 依 seed 產生樹墩各零件的幾何（模型座標：底寬約 1、切口高約 0.7）。
 * 每個零件用各自的亂數流：關掉樹枝不會讓切面跟著變形。
 */
export function buildStumpGeometries(seedValue: number, showBranch: boolean): Array<[string, THREE.BufferGeometry]> {
  const seed = Math.round(seedValue);
  const shape = createTrunkShape(createRng(seed));
  const parts: Array<[string, THREE.BufferGeometry]> = [
    ['tree_stump_bark', buildBark(shape)],
    ['tree_stump_cap', buildCap(shape, createRng(seed * 31 + 7))],
  ];
  if (showBranch) parts.push(['tree_stump_branch', buildBranch(shape, createRng(seed * 89 + 13))]);
  return parts;
}

/** 樹墩切口的平均高度（模型座標） */
export const STUMP_TOP_Y = TOP_Y;

// ── 5. 程序化紋路 shader ──
//
// 做法：沿用 MeshStandardMaterial（燈光、陰影、環境反射都不用自己寫），
// 用 onBeforeCompile 在 three.js 編譯 shader 前，插入自己的顏色與凹凸計算。

const STUMP_VERTEX_HEAD = /* glsl */ `
attribute float aKind;
attribute vec3 aCoord;
attribute vec3 aAxis;
attribute float aAO;
uniform vec3 uStretch;
varying float vKind;
varying vec3 vCoord;
varying vec3 vAxis;
varying float vAO;
varying vec3 vStumpPos;
`;

const STUMP_VERTEX_BODY = /* glsl */ `
#include <begin_vertex>
vKind = aKind;
vCoord = aCoord;
// 方向向量跟著拉伸一起變（例如樹枝被拉寬後，木紋方向也會稍微轉）
vAxis = normalize(aAxis * uStretch);
vAO = aAO;
// 實際尺寸座標：紋路用它算，拉寬時紋路不會被拉扁
vStumpPos = position * uStretch;
`;

const STUMP_FRAGMENT_HEAD = /* glsl */ `
uniform float uSeed;
uniform float uRings;
uniform float uBumpDepth;
uniform vec3 uBarkDark;
uniform vec3 uBarkMid;
uniform vec3 uBarkLight;
uniform vec3 uWoodHeart;
uniform vec3 uWoodLate;
varying float vKind;
varying vec3 vCoord;
varying vec3 vAxis;
varying float vAO;
varying vec3 vStumpPos;

// 值雜訊（value noise）：格點上放亂數、中間平滑內插。連續函數 → 放大看是平滑的，不會出現像素格
float stumpHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float stumpNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(stumpHash(i), stumpHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(stumpHash(i + vec3(0.0, 1.0, 0.0)), stumpHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(stumpHash(i + vec3(0.0, 0.0, 1.0)), stumpHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(stumpHash(i + vec3(0.0, 1.0, 1.0)), stumpHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
// fbm：把好幾層不同大小的雜訊疊起來，大塊＋細節都有
float stumpFbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += amp * stumpNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amp *= 0.5;
  }
  return sum / 0.9375;
}
// 沿木紋方向「拉長」的座標：垂直木紋方向用高頻、沿著木紋用低頻 → 雜訊變成一條條長紋
vec3 stumpGrain(vec3 p, vec3 axis, vec2 freq) {
  float along = dot(p, axis);
  vec3 across = p - axis * along;
  return across * freq.x + axis * along * freq.y;
}
// 用高度場的螢幕空間導數擾動法線（跟 three.js bumpMap 同一套公式，只是高度改成即時算）
vec3 stumpPerturb(vec3 surfPos, vec3 surfNorm, float h) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

const STUMP_COLOR_BODY = /* glsl */ `
#include <color_fragment>
float stumpHeight = 0.5;
float stumpDepth = 0.0;
{
  vec3 seedOff = vec3(uSeed * 7.13, uSeed * 3.71, uSeed * 5.29);
  vec3 axis = normalize(vAxis);
  vec3 col;

  // 年輪相關的值先在分支外算：fwidth（看相鄰像素差多少）要在每個像素都執行的地方呼叫才可靠
  vec2 c = vCoord.xy;
  float rho = length(c);
  float ang = atan(c.y, c.x + 1e-5);
  vec3 dirN = vec3(cos(ang), sin(ang), 0.0);
  float wob = (stumpNoise(vec3(c * 2.5, 0.0) + seedOff) - 0.5) * 0.16
            + (stumpNoise(dirN * 1.8 + seedOff.zxy) - 0.5) * 0.12;
  float rr = max(rho + wob * rho * 1.3, 0.0) * uRings * vCoord.z;
  float ringAA = fwidth(rr) * 1.2 + 1e-4;

  vec3 barkP = stumpGrain(vStumpPos + seedOff, axis, vec2(9.0, 0.9));
  float plates = stumpFbm(barkP);
  float plateAA = fwidth(plates);

  if (vKind < 0.5) {
    // ── 樹皮：大片樹皮板＋板間深色裂縫（雜訊的 0.5 等高線）＋細纖維
    float fibers = stumpNoise(stumpGrain(vStumpPos + seedOff, axis, vec2(55.0, 4.0)));
    float crack = 1.0 - smoothstep(0.012, 0.03 + plateAA * 1.5, abs(plates - 0.5));
    col = mix(uBarkDark, uBarkMid, smoothstep(0.25, 0.55, plates));
    col = mix(col, uBarkLight, smoothstep(0.58, 0.85, plates) * 0.85);
    col *= 0.85 + 0.3 * fibers;
    col = mix(col, uBarkDark * 0.6, crack * 0.8);
    stumpHeight = plates * 0.7 + fibers * 0.15 - crack * 0.5;
    stumpDepth = 0.022;
  } else {
    // ── 切面：年輪（一圈一圈，靠外那側有深色的晚材線）＋淺色心材＋放射狀裂縫
    float f = fract(rr);
    // 年輪小於一個像素時就淡掉，否則遠看會閃爍（摩爾紋）
    float ringFade = 1.0 - smoothstep(0.35, 0.7, ringAA);
    float late = pow(f, 5.0) * (1.0 - smoothstep(1.0 - ringAA, 1.0, f));
    float line = 1.0 - smoothstep(0.0, ringAA + 0.03, min(f, 1.0 - f));
    // 整個切面都用中心（心材）的顏色，不再由內往外變深；年輪線、斑點照樣疊上去
    col = uWoodHeart;
    float heart = 0.0;
    col = mix(col, uWoodLate, (late * 0.55 + line * 0.4) * ringFade);
    float speckle = stumpNoise(vec3(c * 38.0, 1.0) + seedOff);
    col *= 0.93 + 0.14 * speckle;
    // 最外圈是樹皮（倒角那一小段）
    col = mix(col, uBarkMid, smoothstep(0.955, 0.975, rho));

    // 放射狀裂縫：從髓心附近往外裂，越外越細
    float cracks = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float crackAng = uSeed * 1.7 + fk * 2.2 + stumpHash(vec3(fk, uSeed, 3.0)) * 1.2;
      float reach = 0.3 + 0.2 * stumpHash(vec3(uSeed, fk, 7.0));
      // 帶正負號的角度差（-π ~ π）：先加上彎曲量再取絕對值，裂縫才是一條線（先 abs 會變成兩條）
      float dA = mod(ang - crackAng + 3.14159265, 6.2831853) - 3.14159265;
      float dist = abs(dA * rho + (stumpNoise(vec3(rho * 9.0, fk * 3.1, uSeed)) - 0.5) * 0.03);
      // 寬度不收到 0（太細會斷成虛線），改用尾端淡出
      float w = 0.01 * max(1.0 - rho / reach, 0.3);
      float m = (1.0 - smoothstep(w, w + fwidth(dist) * 1.5 + 1e-4, dist))
              * smoothstep(0.06, 0.1, rho) * (1.0 - smoothstep(reach * 0.75, reach, rho));
      // 只有大切面（樹墩本體 z = 1）才裂；小原木端面年輪少，裂縫會像時鐘指針
      cracks = max(cracks, m * step(0.6, vCoord.z));
    }
    col = mix(col, uWoodLate * 0.55, cracks * 0.85);
    stumpHeight = 0.5 - late * 0.3 + heart * 0.1 + speckle * 0.1 - cracks;
    stumpDepth = 0.006;
  }
  diffuseColor.rgb *= col * vAO;
}
`;

const STUMP_NORMAL_BODY = /* glsl */ `
#include <normal_fragment_maps>
normal = stumpPerturb(-vViewPosition, normal, stumpHeight * stumpDepth * uBumpDepth);
`;

/** 樹墩的程序化紋路材質（矮樹屋的樹幹也共用） */
export function createStumpMaterial(envMap?: THREE.Texture) {
  const uniforms = {
    uStretch: { value: new THREE.Vector3(1, 1, 1) },
    uSeed: { value: 1 },
    uRings: { value: 9 },
    /** 模型座標 → 世界單位的倍率；凹凸深度要用世界單位算 */
    uBumpDepth: { value: 0.1 },
    // THREE.Color 會把 sRGB 色碼轉成線性色彩空間，shader 拿到的是正確的光照計算值
    uBarkDark: { value: new THREE.Color('#4f2616') },
    uBarkMid: { value: new THREE.Color('#8c4a28') },
    uBarkLight: { value: new THREE.Color('#c98048') },
    uWoodHeart: { value: new THREE.Color('#f8e1aa') },
    uWoodLate: { value: new THREE.Color('#985627') },
  };
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0,
    envMap: envMap ?? null,
    envMapIntensity: 0.15,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${STUMP_VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', STUMP_VERTEX_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${STUMP_FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', STUMP_COLOR_BODY)
      .replace('#include <normal_fragment_maps>', STUMP_NORMAL_BODY);
  };
  // 所有樹墩共用同一支編譯好的 shader（uniform 各自一份）
  material.customProgramCacheKey = () => 'tree-stump-v1';
  return { material, uniforms };
}

// ── 6. 擺到綠球上 ──

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const tilt = new THREE.Quaternion();
const tintColor = new THREE.Color();
const HIGHLIGHT = new THREE.Color('#ffb36b');

export type TreeStumpSettings = TreeStumpLayout;

type CreateTreeStumpOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: TreeStumpLayout;
};

export function createTreeStump({
  groundRadius,
  up,
  front,
  envMap,
  layout = TREE_STUMP_LAYOUT_DEFAULT,
}: CreateTreeStumpOptions) {
  const settings: TreeStumpSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'tree_stump';
  // model：放所有零件；非等比縮放（變寬、變高）設在這一層
  const model = new THREE.Group();
  model.name = 'tree_stump_model';
  anchor.add(model);

  const { material, uniforms } = createStumpMaterial(envMap);
  let introGrow = 1;
  let highlighted = false;
  let builtKey = '';

  /** 造型相關的設定改了才重建幾何（拖曳位置、改大小不用重建） */
  function rebuildGeometry() {
    const key = `${settings.seed}|${settings.showBranch}`;
    if (key === builtKey) return;
    builtKey = key;
    for (const child of [...model.children]) {
      (child as THREE.Mesh).geometry?.dispose();
      model.remove(child);
    }
    for (const [name, geometry] of buildStumpGeometries(settings.seed, settings.showBranch)) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
    }
  }

  function applyPlacement() {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));

    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.quaternion.multiply(tilt.setFromAxisAngle(X_AXIS, THREE.MathUtils.degToRad(settings.tiltXDegrees)));
    anchor.quaternion.multiply(tilt.setFromAxisAngle(Z_AXIS, THREE.MathUtils.degToRad(settings.tiltZDegrees)));
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));

    const width = Math.max(0.1, settings.widthScale);
    const height = Math.max(0.1, settings.heightScale);
    const depth = Math.max(0.1, settings.depthScale);
    model.scale.set(settings.modelSize * width, settings.modelSize * height, settings.modelSize * depth);
    uniforms.uStretch.value.set(width, height, depth);
    uniforms.uSeed.value = Math.round(settings.seed);
    uniforms.uRings.value = settings.ringCount;
    uniforms.uBumpDepth.value = settings.modelSize * settings.placementScale;
  }

  function applyVisuals() {
    const boost = settings.colorBoost;
    material.color.setRGB(boost, boost, boost);
    const mix = THREE.MathUtils.clamp(settings.tintMix, 0, 1);
    if (mix > 0.001) material.color.lerp(tintColor.set(settings.tintColor).multiplyScalar(boost), mix);
    if (highlighted) {
      material.emissive.copy(HIGHLIGHT);
      material.emissiveIntensity = 0.28;
    } else {
      material.emissive.setHex(0x000000);
      material.emissiveIntensity = 0;
    }
  }

  function applySettings() {
    rebuildGeometry();
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
    for (const child of model.children) (child as THREE.Mesh).geometry?.dispose();
    material.dispose();
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
    update: () => {},
    dispose,
    getNormal: () => normal.clone(),
    setNormal,
  };
}

export function formatTreeStumpPlacementsForPaste(entries: Array<{ id: string; settings: TreeStumpLayout }>) {
  const lines = entries.map((entry, index) => {
    const s = entry.settings;
    const comma = index < entries.length - 1 ? ',' : '';
    return (
      `  {\n` +
      `    id: '${entry.id}',\n` +
      `    angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
      `    azimuthDegrees: ${s.azimuthDegrees},\n` +
      `    spinDegrees: ${s.spinDegrees},\n` +
      `    tiltXDegrees: ${s.tiltXDegrees},\n` +
      `    tiltZDegrees: ${s.tiltZDegrees},\n` +
      `    sink: ${s.sink.toFixed(3)},\n` +
      `    placementScale: ${s.placementScale.toFixed(2)},\n` +
      `    modelSize: ${s.modelSize.toFixed(3)},\n` +
      `    widthScale: ${s.widthScale.toFixed(2)},\n` +
      `    depthScale: ${s.depthScale.toFixed(2)},\n` +
      `    heightScale: ${s.heightScale.toFixed(2)},\n` +
      `    ringCount: ${s.ringCount},\n` +
      `    showBranch: ${s.showBranch},\n` +
      `    seed: ${s.seed},\n` +
      `    colorBoost: ${s.colorBoost.toFixed(2)},\n` +
      `    tintColor: '${s.tintColor}',\n` +
      `    tintMix: ${s.tintMix.toFixed(2)},\n` +
      `  }${comma}`
    );
  });
  return (
    `// 貼回 src/world/objects/treeStumpLayout.ts\n` +
    `export const TREE_STUMP_PLACEMENTS: TreeStumpPlacement[] = [\n` +
    lines.join('\n') +
    `\n];\n`
  );
}
