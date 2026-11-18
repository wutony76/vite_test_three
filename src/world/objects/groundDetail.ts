import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GROUND_PATHS_LAYOUT, type GroundPathPoint } from './groundPathsLayout';

export const GROUND_PATH_MODES = ['auto', 'custom'] as const;
export type GroundPathMode = (typeof GROUND_PATH_MODES)[number];

/**
 * 綠球表面細節：
 *   1. 色彩斑塊：大塊低頻的深淺綠（像插畫裡草地的筆觸）＋頂端偏黃綠、往番茄醬偏藍綠的漸層
 *   2. 番茄醬陰影帶：綠球貼近番茄醬緞帶的地方柔和變暗，緞帶才像「壓」在草地上
 *   3. 草叢：數千叢 low-poly 小草（一個 InstancedMesh），vertex shader 做微風擺動
 *   4. 泥土小徑：房子、篝火之間的彎曲小路（fragment shader 依球面距離上色，房子被拖動會跟著更新）
 *   5. 零星小道具：小石頭、蘑菇、小樹叢（各一個 InstancedMesh）
 *
 * 1、2、4 都畫在綠球「本身的顏色」上（打光之前），不加任何模型；3、5 是 InstancedMesh：
 * 幾千個一樣的東西只要一次 draw call，GPU 用 instanceMatrix 把每一份擺到不同位置。
 *
 * 座標：全部在 ground 的本地座標（球心在原點、半徑 groundRadius）。
 */
export type GroundDetailSettings = {
  // 1. 色彩斑塊與漸層
  patchEnabled: boolean;
  patchAmount: number;
  /** 斑塊大小：數字越大斑塊越小、越碎 */
  patchScale: number;
  patchLight: string;
  patchDark: string;
  gradientAmount: number;
  topTint: string;
  bottomTint: string;
  // 2. 番茄醬陰影帶
  aoEnabled: boolean;
  aoAmount: number;
  /** 陰影帶寬度（世界單位；綠球半徑 1） */
  aoWidth: number;
  aoColor: string;
  // 3. 草叢
  tuftsEnabled: boolean;
  tuftCount: number;
  tuftHeight: number;
  windStrength: number;
  windSpeed: number;
  // 4. 小徑
  pathEnabled: boolean;
  /** auto = 自動串起房子與篝火；custom = 使用自訂路點（GROUND_PATHS_LAYOUT／畫面上編輯） */
  pathMode: GroundPathMode;
  /** 小路寬度（度，球面角度） */
  pathWidthDegrees: number;
  /** 小路彎曲程度 */
  pathCurve: number;
  pathColor: string;
  pathEdgeColor: string;
  // 5. 小道具
  propsEnabled: boolean;
  rockCount: number;
  mushroomCount: number;
  bushCount: number;
  propScale: number;
};

export const GROUND_DETAIL_DEFAULT: GroundDetailSettings = {
  patchEnabled: true,
  patchAmount: 0.55,
  patchScale: 3.2,
  patchLight: '#a4f0c6',
  patchDark: '#5ccf9c',
  gradientAmount: 0.45,
  topTint: '#c9f2a2',
  bottomTint: '#55c4b4',
  aoEnabled: true,
  aoAmount: 0.6,
  aoWidth: 0.12,
  aoColor: '#7a7fb0',
  tuftsEnabled: true,
  tuftCount: 1000,
  tuftHeight: 1,
  windStrength: 1,
  windSpeed: 1,
  pathEnabled: true,
  pathMode: GROUND_PATHS_LAYOUT.length > 0 ? 'custom' : 'auto',
  pathWidthDegrees: 2,
  pathCurve: 1,
  pathColor: '#e3c79a',
  pathEdgeColor: '#c9a676',
  propsEnabled: true,
  rockCount: 45,
  mushroomCount: 30,
  bushCount: 35,
  propScale: 1,
};

/** fragment shader 裡小徑段數的上限（uniform 陣列要固定長度） */
const MAX_PATH_SEGMENTS = 64;
/** 每條連線切成幾段：中間的點往側邊偏，連起來就是彎的路 */
const SEGMENTS_PER_EDGE = 4;
/** 草叢一叢的原始高度（世界單位），風擺幅度依「在葉子的多高」來算 */
const TUFT_BASE_HEIGHT = 0.018;
const MAX_TUFTS = 6000;

export type GroundObstacle = { normal: THREE.Vector3; radiusRad: number };
export type GroundRibbon = { groundToRing: THREE.Matrix4; radius: number; tube: number };

type CreateGroundDetailOptions = {
  /** 綠球 mesh（材質是 MeshPhongMaterial） */
  ballMesh: THREE.Mesh;
  groundRadius: number;
  up: THREE.Vector3;
  /** 方位角 0° 的方向（跟房子、檸檬片的 azimuthDegrees 同一個基準），自訂路點的角度換算用 */
  front: THREE.Vector3;
  /** 小路要串起來的點（房子、篝火的地表法線） */
  getPathNodes: () => THREE.Vector3[];
  /** 撒道具要避開的東西（房子、食物、篝火） */
  getObstacles: () => GroundObstacle[];
  /**
   * 撒完之後才「遮住」的範圍（例如水潭）：落在裡面的草、道具只是隱藏，不影響撒點。
   * 和 getObstacles 的差別：
   *   getObstacles 會改變撒點過程 → 東西一動，整顆球的草全部重新排列；
   *   getMasks 只決定哪些已經撒好的要藏起來 → 東西搬走，原本的草原樣長回來，其他地方完全不動。
   */
  getMasks?: () => GroundObstacle[];
  /** 番茄醬緞帶：ground 座標 → 緞帶座標的矩陣、圈半徑、管子半徑 */
  getRibbon: () => GroundRibbon | null;
  getRibbonTopColatitude: () => number | null;
  settings?: GroundDetailSettings;
};

// ─────────────────────────────── GLSL 共用函式 ───────────────────────────────

const NOISE_GLSL = /* glsl */ `
  // value noise：在整數格點上放亂數，中間平滑內插；三層疊起來（fbm）就有大塊加小塊的自然斑紋
  float gdHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float gdNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(gdHash(i + vec3(0, 0, 0)), gdHash(i + vec3(1, 0, 0)), f.x),
          mix(gdHash(i + vec3(0, 1, 0)), gdHash(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(gdHash(i + vec3(0, 0, 1)), gdHash(i + vec3(1, 0, 1)), f.x),
          mix(gdHash(i + vec3(0, 1, 1)), gdHash(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  float gdFbm(vec3 p) {
    return gdNoise(p) * 0.55 + gdNoise(p * 2.03 + 7.1) * 0.3 + gdNoise(p * 4.1 + 13.7) * 0.15;
  }
`;

const ARC_DISTANCE_GLSL = /* glsl */ `
  // 點 p 到球面上「a→b 這段大圓弧」的角距離（三個都是單位向量）
  float gdArcDistance(vec3 p, vec3 a, vec3 b) {
    vec3 n = cross(a, b);
    float nl = length(n);
    if (nl < 1e-5) return acos(clamp(dot(p, a), -1.0, 1.0));
    n /= nl;
    float off = dot(p, n);
    // 投影到弧所在的大圓上；投影點落在 a、b 之間才算「在弧旁邊」，否則算到較近的端點
    vec3 q = normalize(p - n * off);
    if (dot(cross(a, q), n) >= 0.0 && dot(cross(q, b), n) >= 0.0) {
      return asin(clamp(abs(off), 0.0, 1.0));
    }
    return min(acos(clamp(dot(p, a), -1.0, 1.0)), acos(clamp(dot(p, b), -1.0, 1.0)));
  }
`;

/** CPU 版的弧距離（撒道具時避開小路用），跟 GLSL 版一模一樣 */
const arcN = new THREE.Vector3();
const arcQ = new THREE.Vector3();
const arcT = new THREE.Vector3();
function arcDistance(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  arcN.crossVectors(a, b);
  const nl = arcN.length();
  if (nl < 1e-5) return Math.acos(THREE.MathUtils.clamp(p.dot(a), -1, 1));
  arcN.divideScalar(nl);
  const off = p.dot(arcN);
  arcQ.copy(p).addScaledVector(arcN, -off).normalize();
  if (arcT.crossVectors(a, arcQ).dot(arcN) >= 0 && arcT.crossVectors(arcQ, b).dot(arcN) >= 0) {
    return Math.asin(Math.min(1, Math.abs(off)));
  }
  return Math.min(
    Math.acos(THREE.MathUtils.clamp(p.dot(a), -1, 1)),
    Math.acos(THREE.MathUtils.clamp(p.dot(b), -1, 1)),
  );
}

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ─────────────────────────────── 道具幾何 ───────────────────────────────

/** 幫 geometry 塗上單一顏色（vertex color），merge 之後一個 mesh 就能有多種顏色 */
function paint(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const c = new THREE.Color(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/** 一叢草：三片細長三角形，繞中心各轉 120°、往外微微張開；底部深、尖端亮（vertex color） */
function buildTuftGeometry() {
  const positions: number[] = [];
  const colors: number[] = [];
  // 顏色貼近地面的薄荷綠：草叢是「增加質感」，不是另一個主角；太深會變成一片橄欖色的刺
  const base = new THREE.Color('#5cc98f');
  const tip = new THREE.Color('#c4f7cf');
  const blades = 3;
  for (let i = 0; i < blades; i++) {
    const yaw = (i / blades) * Math.PI * 2 + 0.3;
    const lean = 0.35;
    const w = 0.0035;
    const h = TUFT_BASE_HEIGHT * (0.8 + (i % 2) * 0.35);
    // 葉子在自己的平面上：底部兩點、尖端一點；尖端往外傾
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const tipOut = Math.sin(lean) * h;
    const bl = [-w * sin, 0, w * cos];
    const br = [w * sin, 0, -w * cos];
    const tp = [cos * tipOut, h, sin * tipOut];
    positions.push(...bl, ...br, ...tp);
    colors.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

function buildRockGeometry() {
  const g = new THREE.DodecahedronGeometry(0.012, 0);
  g.scale(1.2, 0.6, 1);
  g.translate(0, 0.002, 0);
  return paint(g, '#a9a4bd');
}

/** 蘑菇：奶油色短柄 + 粉紅半球傘 */
function buildMushroomGeometry() {
  const stem = new THREE.CylinderGeometry(0.0035, 0.0045, 0.012, 6);
  stem.translate(0, 0.006, 0);
  const cap = new THREE.SphereGeometry(0.0095, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.scale(1, 0.75, 1);
  cap.translate(0, 0.011, 0);
  const merged = mergeGeometries([paint(stem, '#f4ead4'), paint(cap, '#ff8fa3')], false);
  return merged ?? paint(stem, '#f4ead4');
}

/** 小樹叢：三顆大小不一的低面數圓球擠在一起 */
function buildBushGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: Array<[number, number, number, number, string]> = [
    [0, 0.009, 0, 0.012, '#5fc48a'],
    [0.009, 0.007, 0.003, 0.009, '#6fd39a'],
    [-0.008, 0.006, -0.004, 0.0085, '#55b880'],
  ];
  for (const [x, y, z, r, color] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.translate(x, y, z);
    parts.push(paint(g, color));
  }
  return mergeGeometries(parts, false) ?? parts[0];
}

// ─────────────────────────────── 主體 ───────────────────────────────

export function createGroundDetail({
  ballMesh,
  groundRadius,
  up,
  front,
  getPathNodes,
  getObstacles,
  getMasks,
  getRibbon,
  getRibbonTopColatitude,
  settings: initial = GROUND_DETAIL_DEFAULT,
}: CreateGroundDetailOptions) {
  const settings: GroundDetailSettings = { ...initial };
  const group = new THREE.Group();
  group.name = 'ground_detail';

  // ── 綠球 shader 注入（1、2、4）──
  const pathA = Array.from({ length: MAX_PATH_SEGMENTS }, () => new THREE.Vector3(0, 1, 0));
  const pathB = Array.from({ length: MAX_PATH_SEGMENTS }, () => new THREE.Vector3(0, 1, 0));
  const ballUniforms = {
    uGdUp: { value: up.clone().normalize() },
    uGdPatchAmount: { value: 0 },
    uGdPatchScale: { value: 3 },
    uGdPatchLight: { value: new THREE.Color() },
    uGdPatchDark: { value: new THREE.Color() },
    uGdGradient: { value: 0 },
    uGdTopTint: { value: new THREE.Color() },
    uGdBottomTint: { value: new THREE.Color() },
    uGdAoAmount: { value: 0 },
    uGdAoWidth: { value: 0.07 },
    uGdAoColor: { value: new THREE.Color() },
    uGdRingMatrix: { value: new THREE.Matrix4() },
    uGdRingRadius: { value: 0 },
    uGdRingTube: { value: 0 },
    uGdPathAmount: { value: 0 },
    uGdPathWidth: { value: 0.02 },
    uGdPathColor: { value: new THREE.Color() },
    uGdPathEdge: { value: new THREE.Color() },
    uGdPathCount: { value: 0 },
    uGdPathA: { value: pathA },
    uGdPathB: { value: pathB },
  };

  const ballMaterial = ballMesh.material as THREE.MeshPhongMaterial;
  const previousCompile = ballMaterial.onBeforeCompile;
  ballMaterial.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(ballMaterial, shader, renderer);
    Object.assign(shader.uniforms, ballUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGdPos;')
      // position 是綠球自己的座標 = ground 座標（綠球掛在 ground 原點、沒有旋轉縮放）
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGdPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vGdPos;
        uniform vec3 uGdUp;
        uniform float uGdPatchAmount;
        uniform float uGdPatchScale;
        uniform vec3 uGdPatchLight;
        uniform vec3 uGdPatchDark;
        uniform float uGdGradient;
        uniform vec3 uGdTopTint;
        uniform vec3 uGdBottomTint;
        uniform float uGdAoAmount;
        uniform float uGdAoWidth;
        uniform vec3 uGdAoColor;
        uniform mat4 uGdRingMatrix;
        uniform float uGdRingRadius;
        uniform float uGdRingTube;
        uniform float uGdPathAmount;
        uniform float uGdPathWidth;
        uniform vec3 uGdPathColor;
        uniform vec3 uGdPathEdge;
        uniform int uGdPathCount;
        uniform vec3 uGdPathA[${MAX_PATH_SEGMENTS}];
        uniform vec3 uGdPathB[${MAX_PATH_SEGMENTS}];
        ${NOISE_GLSL}
        ${ARC_DISTANCE_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 gdDir = normalize(vGdPos);
          // 1. 斑塊：低頻 fbm → 深淺兩色；再加一點高頻細紋，近看不會是一整片平的
          float gdPatch = gdFbm(gdDir * uGdPatchScale);
          float gdT = smoothstep(0.32, 0.68, gdPatch);
          float gdSpeck = gdNoise(gdDir * uGdPatchScale * 9.0) - 0.5;
          vec3 gdPatchColor = mix(uGdPatchDark, uGdPatchLight, gdT) * (1.0 + gdSpeck * 0.12);
          diffuseColor.rgb = mix(diffuseColor.rgb, gdPatchColor, uGdPatchAmount);
          // 漸層：離頂端越近越偏黃綠，越往下越偏藍綠
          float gdCol = acos(clamp(dot(gdDir, uGdUp), -1.0, 1.0)) / 1.5708;
          diffuseColor.rgb = mix(diffuseColor.rgb, uGdTopTint, uGdGradient * pow(clamp(1.0 - gdCol, 0.0, 1.0), 2.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, uGdBottomTint, uGdGradient * clamp(gdCol * gdCol, 0.0, 1.0) * 0.8);

          // 4. 小徑：到每段弧的最短距離；寬度用雜訊抖一下，邊緣才不會像尺畫的
          if (uGdPathAmount > 0.001) {
            float gdD = 10.0;
            for (int i = 0; i < ${MAX_PATH_SEGMENTS}; i++) {
              if (i >= uGdPathCount) break;
              gdD = min(gdD, gdArcDistance(gdDir, uGdPathA[i], uGdPathB[i]));
            }
            float gdW = uGdPathWidth * (0.75 + 0.5 * gdNoise(gdDir * 60.0));
            float gdMask = 1.0 - smoothstep(gdW * 0.75, gdW, gdD);
            float gdEdge = smoothstep(gdW * 0.35, gdW * 0.85, gdD);
            vec3 gdDirt = mix(uGdPathColor, uGdPathEdge, gdEdge) * (0.92 + 0.16 * gdNoise(gdDir * 140.0));
            diffuseColor.rgb = mix(diffuseColor.rgb, gdDirt, gdMask * uGdPathAmount);
          }

          // 2. 番茄醬陰影帶：算到緞帶管子表面的距離，越近越暗
          if (uGdAoAmount > 0.001) {
            vec3 gdQ = (uGdRingMatrix * vec4(vGdPos, 1.0)).xyz;
            float gdRing = length(vec2(length(gdQ.xz) - uGdRingRadius, gdQ.y)) - uGdRingTube;
            float gdAo = 1.0 - smoothstep(0.0, uGdAoWidth, gdRing);
            diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uGdAoColor, gdAo * uGdAoAmount);
          }
        }`,
      );
  };
  // 換了 hook 之後原始碼字串跟別的材質不同，cache key 自然不同；needsUpdate 讓它重新編譯
  ballMaterial.needsUpdate = true;

  // ── 草叢（3）──
  const tuftUniforms = {
    uTime: { value: 0 },
    uWindStrength: { value: 1 },
    uWindSpeed: { value: 1 },
    uGrow: { value: 0 },
    uTuftHeight: { value: 1 },
  };
  const tuftMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  tuftMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, tuftUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uWindStrength;
        uniform float uWindSpeed;
        uniform float uGrow;
        uniform float uTuftHeight;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // 越高的點擺越多（h²）：根部固定在地上，只有葉尖在晃
          float h = clamp(position.y / ${TUFT_BASE_HEIGHT.toFixed(4)}, 0.0, 1.5);
          #ifdef USE_INSTANCING
            vec3 root = instanceMatrix[3].xyz;
          #else
            vec3 root = vec3(0.0);
          #endif
          // 用這叢草在球上的位置當相位：整片草會一波一波地動，不是全部一起擺
          float phase = uTime * 1.7 * uWindSpeed + root.x * 9.0 + root.z * 6.0 + root.y * 4.0;
          float sway = sin(phase) * 0.6 + sin(phase * 2.3 + 1.3) * 0.25;
          transformed.x += sway * 0.005 * uWindStrength * h * h;
          transformed.z += cos(phase * 0.8) * 0.0025 * uWindStrength * h * h;
          transformed.y *= uTuftHeight;
          transformed *= uGrow;
        }`,
      );
  };
  const tufts = new THREE.InstancedMesh(buildTuftGeometry(), tuftMaterial, MAX_TUFTS);
  tufts.name = 'ground_tufts';
  tufts.count = 0;
  // 草叢遍佈整顆球，包圍球算不準時會整批被裁掉
  tufts.frustumCulled = false;
  group.add(tufts);

  // ── 小道具（5）──
  const propUniforms = { uGrow: { value: 0 } };
  function makePropMaterial() {
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uGrow = propUniforms.uGrow;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uGrow;')
        // 在「自己的座標」縮放：從地面長出來，而不是整批往球心縮
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed *= uGrow;');
    };
    return material;
  }
  const PROP_MAX = 200;
  const rocks = new THREE.InstancedMesh(buildRockGeometry(), makePropMaterial(), PROP_MAX);
  const mushrooms = new THREE.InstancedMesh(buildMushroomGeometry(), makePropMaterial(), PROP_MAX);
  const bushes = new THREE.InstancedMesh(buildBushGeometry(), makePropMaterial(), PROP_MAX);
  rocks.name = 'ground_rocks';
  mushrooms.name = 'ground_mushrooms';
  bushes.name = 'ground_bushes';
  for (const mesh of [rocks, mushrooms, bushes]) {
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    group.add(mesh);
  }

  // ── 小徑網路 ──
  const pathSegments: Array<[THREE.Vector3, THREE.Vector3]> = [];
  /** 自訂路線：每條是一串地表法線（ground 座標的單位向量） */
  const customPaths: THREE.Vector3[][] = GROUND_PATHS_LAYOUT.map((path) =>
    path.map((point) => normalFromAngles(point.colat, point.az)),
  );
  /** 最近一次算出來的自動路線（「從自動路線複製」用） */
  let lastAutoPolylines: THREE.Vector3[][] = [];

  // 角度 ↔ 地表法線：跟 lemonSlice 等的 angleFromTopDegrees／azimuthDegrees 一樣的算法
  const sideAxis = new THREE.Vector3().crossVectors(up, front).normalize();
  function normalFromAngles(colatDeg: number, azDeg: number) {
    const direction = front.clone().applyAxisAngle(up, THREE.MathUtils.degToRad(azDeg));
    const angle = THREE.MathUtils.degToRad(colatDeg);
    return up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle)).normalize();
  }
  function anglesFromNormal(n: THREE.Vector3): GroundPathPoint {
    const colat = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(n.dot(up), -1, 1)));
    const horizontal = n.clone().addScaledVector(up, -n.dot(up));
    const az = THREE.MathUtils.radToDeg(Math.atan2(horizontal.dot(sideAxis), horizontal.dot(front)));
    return { colat: Math.round(colat * 10) / 10, az: Math.round(az * 10) / 10 };
  }

  /**
   * 用最小生成樹（Prim）把節點連起來：每次挑「離已連好那群最近」的點接上，
   * 所有房子都會連到，且不會有多餘的交叉路線。
   */
  /**
   * 自動路線：用最小生成樹（Prim）把節點連起來：每次挑「離已連好那群最近」的點接上，
   * 所有房子都會連到，且不會有多餘的交叉路線。每條連線切成幾段、往側邊彎，回傳成一條條折線。
   */
  function autoPolylines(): THREE.Vector3[][] {
    const nodes = getPathNodes().map((n) => n.clone().normalize());
    if (nodes.length < 2) return [];
    const connected = [0];
    const remaining = nodes.map((_, i) => i).slice(1);
    const edges: Array<[number, number]> = [];
    while (remaining.length > 0) {
      let best: [number, number, number] | null = null;
      for (const a of connected) {
        for (const b of remaining) {
          const d = nodes[a].angleTo(nodes[b]);
          if (!best || d < best[2]) best = [a, b, d];
        }
      }
      if (!best) break;
      edges.push([best[0], best[1]]);
      connected.push(best[1]);
      remaining.splice(remaining.indexOf(best[1]), 1);
    }

    const normal = new THREE.Vector3();
    const side = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    return edges.map(([ia, ib], edgeIndex) => {
      const a = nodes[ia];
      const b = nodes[ib];
      const angle = a.angleTo(b);
      normal.crossVectors(a, b).normalize();
      // 偶數邊彎成弧形、奇數邊彎成 S 形，整張路網看起來比較自然
      const sCurve = edgeIndex % 2 === 1;
      const sign = edgeIndex % 3 === 0 ? -1 : 1;
      const points: THREE.Vector3[] = [];
      for (let k = 0; k <= SEGMENTS_PER_EDGE; k++) {
        const t = k / SEGMENTS_PER_EDGE;
        const p = a.clone().applyQuaternion(quat.setFromAxisAngle(normal, angle * t));
        const bend = sCurve ? Math.sin(t * Math.PI * 2) * 0.5 : Math.sin(t * Math.PI);
        // 往路的側邊偏一點：以「這一點沿路前進的方向」為軸轉 offset，
        // 點就會垂直於路線移動、而且仍然在球面上；偏移量跟路長成正比
        side.crossVectors(normal, p).normalize();
        const offset = bend * sign * angle * 0.18 * settings.pathCurve;
        p.applyAxisAngle(side, offset).normalize();
        points.push(p);
      }
      return points;
    });
  }

  /**
   * 自訂路線：使用者點的路點之間用 Catmull-Rom 曲線補成平滑的彎路（取樣後再推回球面）。
   * 段數依「全部路點數」平均分配，總段數不超過 shader 的上限。
   */
  function customPolylines(): THREE.Vector3[][] {
    const usable = customPaths.filter((path) => path.length >= 2);
    const spans = usable.reduce((sum, path) => sum + path.length - 1, 0);
    if (spans === 0) return [];
    const perSpan = Math.max(1, Math.min(6, Math.floor(MAX_PATH_SEGMENTS / spans)));
    return usable.map((path) => {
      if (path.length === 2) {
        // 只有兩點：沿大圓弧切幾段就好（Catmull-Rom 兩點會是直線穿過球內部）
        const out: THREE.Vector3[] = [];
        for (let k = 0; k <= perSpan; k++) out.push(path[0].clone().lerp(path[1], k / perSpan).normalize());
        return out;
      }
      const curve = new THREE.CatmullRomCurve3(path, false, 'centripetal');
      const samples = (path.length - 1) * perSpan;
      const out: THREE.Vector3[] = [];
      for (let k = 0; k <= samples; k++) out.push(curve.getPoint(k / samples).normalize());
      return out;
    });
  }

  function rebuildPaths() {
    pathSegments.length = 0;
    const polylines = settings.pathMode === 'custom' ? customPolylines() : autoPolylines();
    lastAutoPolylines = settings.pathMode === 'custom' ? lastAutoPolylines : polylines;
    for (const points of polylines) {
      for (let k = 0; k < points.length - 1; k++) {
        if (pathSegments.length >= MAX_PATH_SEGMENTS) break;
        pathSegments.push([points[k], points[k + 1]]);
      }
    }
    for (let i = 0; i < MAX_PATH_SEGMENTS; i++) {
      const seg = pathSegments[i];
      if (seg) {
        pathA[i].copy(seg[0]);
        pathB[i].copy(seg[1]);
      }
    }
    ballUniforms.uGdPathCount.value = pathSegments.length;
  }

  function distanceToPaths(dir: THREE.Vector3) {
    let d = Infinity;
    for (const [a, b] of pathSegments) d = Math.min(d, arcDistance(dir, a, b));
    return d;
  }

  // ── 撒點 ──
  const tmpMatrix = new THREE.Matrix4();
  const tmpQuat = new THREE.Quaternion();
  const yawQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpPos = new THREE.Vector3();
  const tmpColor = new THREE.Color();
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  let scattered = false;

  /**
   * 拒絕取樣：隨便挑一個點，不合格（在房子底下、小路上、番茄醬下面）就丟掉重挑。
   * 草叢、蘑菇用「先挑群聚中心、再在附近撒」→ 一叢一叢的，比均勻撒更像自然生長。
   */
  function scatter() {
    const random = seededRandom(20261116);
    const obstacles = getObstacles();
    const ribbonTop = getRibbonTopColatitude();
    const maxCol = THREE.MathUtils.degToRad((ribbonTop ?? 70) - 2.5);
    const pathClear = THREE.MathUtils.degToRad(settings.pathWidthDegrees);

    const randomDir = (target: THREE.Vector3) => {
      // 球面均勻分佈：z 均勻、角度均勻
      const z = random() * 2 - 1;
      const t = random() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      return target.set(r * Math.cos(t), z, r * Math.sin(t));
    };
    const isFree = (dir: THREE.Vector3, margin: number, pathMargin: number) => {
      if (dir.angleTo(up) > maxCol) return false;
      for (const o of obstacles) {
        if (dir.angleTo(o.normal) < o.radiusRad + margin) return false;
      }
      if (pathSegments.length && distanceToPaths(dir) < pathClear * pathMargin) return false;
      return true;
    };
    /** 在 center 附近 spread（弧度）內隨機挑一個方向 */
    const near = (center: THREE.Vector3, spread: number, target: THREE.Vector3) => {
      const axis = randomDir(new THREE.Vector3()).cross(center).normalize();
      return target.copy(center).applyAxisAngle(axis, Math.sqrt(random()) * spread).normalize();
    };
    const place = (
      mesh: THREE.InstancedMesh,
      index: number,
      dir: THREE.Vector3,
      scale: number,
      sink: number,
    ) => {
      tmpQuat.setFromUnitVectors(Y_AXIS, dir);
      tmpQuat.multiply(yawQuat.setFromAxisAngle(Y_AXIS, random() * Math.PI * 2));
      tmpPos.copy(dir).multiplyScalar(groundRadius - sink);
      tmpScale.setScalar(scale);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(index, tmpMatrix);
    };

    // 草叢：群聚中心 → 每群 6～16 叢
    let tuftIndex = 0;
    const tuftTarget = Math.min(MAX_TUFTS, Math.max(0, Math.round(settings.tuftCount)));
    const center = new THREE.Vector3();
    const dir = new THREE.Vector3();
    let guard = 0;
    while (tuftIndex < tuftTarget && guard++ < 4000) {
      randomDir(center);
      if (!isFree(center, 0.01, 1.3)) continue;
      const clump = 6 + Math.floor(random() * 11);
      for (let k = 0; k < clump && tuftIndex < tuftTarget; k++) {
        near(center, THREE.MathUtils.degToRad(3.5), dir);
        if (!isFree(dir, 0.004, 1.0)) continue;
        place(tufts, tuftIndex, dir, 0.7 + random() * 0.6, 0.002);
        // 每叢顏色微微不同（instanceColor 會跟 vertex color 相乘）
        tmpColor.setHSL(0.4 + (random() - 0.5) * 0.06, 0.4, 0.88 + random() * 0.12);
        tufts.setColorAt(tuftIndex, tmpColor);
        tuftIndex++;
      }
    }
    tufts.count = tuftIndex;
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;

    const scatterProps = (mesh: THREE.InstancedMesh, count: number, clumpMax: number, baseScale: number, sink: number) => {
      let index = 0;
      const target = Math.min(PROP_MAX, Math.max(0, Math.round(count)));
      let tries = 0;
      while (index < target && tries++ < 3000) {
        randomDir(center);
        if (!isFree(center, 0.03, 1.6)) continue;
        const clump = 1 + Math.floor(random() * clumpMax);
        for (let k = 0; k < clump && index < target; k++) {
          if (k === 0) dir.copy(center);
          else near(center, THREE.MathUtils.degToRad(2.2), dir);
          if (!isFree(dir, 0.02, 1.4)) continue;
          place(mesh, index, dir, baseScale * settings.propScale * (0.7 + random() * 0.6), sink);
          index++;
        }
      }
      mesh.count = index;
      mesh.instanceMatrix.needsUpdate = true;
    };
    scatterProps(rocks, settings.rockCount, 3, 1, 0.003);
    scatterProps(mushrooms, settings.mushroomCount, 4, 1, 0.001);
    scatterProps(bushes, settings.bushCount, 2, 1, 0.004);
    // 記下撒好的原始位置：遮罩只是把某些藏起來，之後要能原樣還原
    for (const mesh of [tufts, rocks, mushrooms, bushes]) {
      scatteredMatrices.set(mesh, mesh.instanceMatrix.array.slice(0, mesh.count * 16) as Float32Array);
    }
    scattered = true;
    applyMasks();
  }

  const scatteredMatrices = new Map<THREE.InstancedMesh, Float32Array>();
  const maskDir = new THREE.Vector3();

  /**
   * 依 getMasks 把落在範圍內的草、道具藏起來（縮放設成 0），其他的還原成撒好時的樣子。
   * 不重新撒點，所以只有遮罩附近會變，整顆球其他地方的佈局完全不動。
   */
  function applyMasks() {
    const masks = getMasks?.() ?? [];
    for (const [mesh, original] of scatteredMatrices) {
      const target = mesh.instanceMatrix.array as Float32Array;
      const count = Math.min(mesh.count, original.length / 16);
      for (let i = 0; i < count; i++) {
        const o = i * 16;
        // matrix 的第 12～14 個數字是位置；球心在原點，所以正規化就是地表方向
        maskDir.set(original[o + 12], original[o + 13], original[o + 14]).normalize();
        const hidden = masks.some((mask) => maskDir.angleTo(mask.normal) < mask.radiusRad);
        if (hidden) {
          for (let k = 0; k < 16; k++) target[o + k] = 0;
          // 不整個歸零：位置會跑到球心，影響包圍球（視錐剔除）的計算；保留位置、只把縮放歸零
          target[o + 12] = original[o + 12];
          target[o + 13] = original[o + 13];
          target[o + 14] = original[o + 14];
          target[o + 15] = 1;
        } else {
          for (let k = 0; k < 16; k++) target[o + k] = original[o + k];
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ── 設定與更新 ──
  let pathTimer = 0;
  let forcePaths = false;
  let grow = 0;
  let pathReveal = 0;

  function apply() {
    const u = ballUniforms;
    u.uGdPatchAmount.value = settings.patchEnabled ? settings.patchAmount : 0;
    u.uGdPatchScale.value = settings.patchScale;
    u.uGdPatchLight.value.set(settings.patchLight);
    u.uGdPatchDark.value.set(settings.patchDark);
    u.uGdGradient.value = settings.patchEnabled ? settings.gradientAmount : 0;
    u.uGdTopTint.value.set(settings.topTint);
    u.uGdBottomTint.value.set(settings.bottomTint);
    u.uGdAoAmount.value = settings.aoEnabled ? settings.aoAmount : 0;
    u.uGdAoWidth.value = Math.max(0.001, settings.aoWidth);
    u.uGdAoColor.value.set(settings.aoColor);
    u.uGdPathWidth.value = THREE.MathUtils.degToRad(settings.pathWidthDegrees);
    u.uGdPathColor.value.set(settings.pathColor);
    u.uGdPathEdge.value.set(settings.pathEdgeColor);
    tuftUniforms.uWindStrength.value = settings.windStrength;
    tuftUniforms.uWindSpeed.value = settings.windSpeed;
    tuftUniforms.uTuftHeight.value = settings.tuftHeight;
    tufts.visible = settings.tuftsEnabled;
    rocks.visible = mushrooms.visible = bushes.visible = settings.propsEnabled;
  }

  /** 重新撒草叢與道具（用目前的房子、小路位置） */
  function rescatter() {
    rebuildPaths();
    scatter();
  }

  /**
   * @param housesReady 房子入場動畫已經長完：這時才撒（房子的最終位置、模型大小都確定了），並讓草和道具長出來
   */
  function update(deltaTime: number, housesReady: boolean) {
    const dt = Math.min(deltaTime, 0.1);
    tuftUniforms.uTime.value += dt;

    // 番茄醬緞帶可能被拖動：每幀更新「ground → 緞帶」矩陣
    const ribbon = getRibbon();
    if (ribbon) {
      ballUniforms.uGdRingMatrix.value.copy(ribbon.groundToRing);
      ballUniforms.uGdRingRadius.value = ribbon.radius;
      ballUniforms.uGdRingTube.value = ribbon.tube;
    }

    pathTimer -= dt;
    if (pathTimer <= 0) {
      pathTimer = 0.5;
      rebuildPaths();
    }

    if (housesReady && !scattered) scatter();
    // 草、道具、小路都等房子長完才出現，入場時才不會一開始就有一堆東西在空地上
    const target = housesReady ? 1 : 0;
    grow += (target - grow) * Math.min(1, dt * 3);
    pathReveal += (target - pathReveal) * Math.min(1, dt * 2);
    tuftUniforms.uGrow.value = grow;
    propUniforms.uGrow.value = grow;
    ballUniforms.uGdPathAmount.value = settings.pathEnabled ? (forcePaths ? 1 : pathReveal) : 0;
  }

  apply();

  /** 路線被編輯後呼叫：立刻重算小路（不等 0.5 秒的定時更新） */
  function refreshPaths() {
    rebuildPaths();
  }

  /** 從目前的自動路線複製成自訂路線（每條連線取頭、中、尾三點，方便接著拖） */
  function copyAutoToCustom() {
    if (lastAutoPolylines.length === 0) {
      const saved = settings.pathMode;
      settings.pathMode = 'auto';
      rebuildPaths();
      settings.pathMode = saved;
    }
    customPaths.length = 0;
    for (const points of lastAutoPolylines) {
      const mid = points[Math.floor(points.length / 2)];
      customPaths.push([points[0].clone(), mid.clone(), points[points.length - 1].clone()]);
    }
    rebuildPaths();
  }

  return {
    object: group,
    settings,
    apply,
    update,
    rescatter,
    /** 遮罩範圍（例如水潭）移動後呼叫：只更新哪些要藏，不重新撒 */
    refreshMasks: applyMasks,
    refreshPaths,
    copyAutoToCustom,
    /** 自訂路線本體（編輯器直接改這個陣列裡的向量，改完呼叫 refreshPaths） */
    customPaths,
    anglesFromNormal,
    /** 編輯時讓小路立刻完整顯示（不用等房子長完的淡入） */
    forcePathVisible: (on: boolean) => {
      forcePaths = on;
    },
  };
}

export function formatGroundDetailSettingsForPaste(s: GroundDetailSettings) {
  const lines = Object.entries(s).map(([key, value]) => {
    const v = typeof value === 'string' ? `'${value}'` : typeof value === 'number' ? Number(value.toFixed(3)) : value;
    return `  ${key}: ${v},`;
  });
  return `// 貼回 src/world/objects/groundDetail.ts 的 GROUND_DETAIL_DEFAULT\nexport const GROUND_DETAIL_DEFAULT: GroundDetailSettings = {\n${lines.join('\n')}\n};\n`;
}

export function formatGroundPathsForPaste(paths: GroundPathPoint[][]) {
  const body = paths
    .map((path) => `  [\n${path.map((p) => `    { colat: ${p.colat}, az: ${p.az} },`).join('\n')}\n  ],`)
    .join('\n');
  return (
    `// 貼回 src/world/objects/groundPathsLayout.ts\n` +
    `export const GROUND_PATHS_LAYOUT: GroundPathPoint[][] = [\n${body}\n];\n`
  );
}
