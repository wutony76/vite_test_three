import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createRng, PartBucket } from './partBucket';
import { makeStarTexture } from './pigCoinShine';
import { PIG_HOUSE_LAYOUT_DEFAULT, type PigHouseLayout } from './pigHouseLayout';

/**
 * 綠球上的「豬屋」：原本豬豬樹屋上的豬造型小屋，獨立出來直接坐在草地上（沒有樹幹、木筏、梯子）。
 *   - 壓扁的大圓球身體、正面凸出的拱形門廊（白色半截木門）、門上方的豬鼻子（兩個鼻孔）
 *   - 左右鏡射對稱的耳朵（前後／厚度／大小可調）、頂上捲捲的尾巴
 *   - 右側垂直圓窗＋水平圓木板遮雨棚、右後方吊著金色鈴鐺（從原本的樹屋版左右鏡射）、門邊一朵小白花
 *   - 身體有用模型座標雜訊算的細微斑駁（放大不糊）
 *   - 鼻子會不定時「打噴嚏」：鼻孔冒星星、噴出一把粉彩卡通冰塊，Q 彈落地、「噗」地消失
 *
 * 模型座標：y 朝上、地面在 y = 0，+z 是正面（門）；身體半徑 0.4，size 把模型單位換成世界單位。
 * 效能：同材質零件用 PartBucket 合併、顏色存頂點色 → 整棟只有 2 個 mesh。
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
  bodyColor: string;
  /** 耳朵往前（+）／往後（−）繞頭的角度（°） */
  earForward: number;
  /** 耳朵厚度倍率 */
  earThickness: number;
  /** 耳朵大小倍率 */
  earSize: number;
};

/** 豬屋身體表面上某個方位、仰角的位置矩陣（局部 +z 朝外） */
type BodySurface = (azimuthDeg: number, elevationDeg: number, out?: number, upright?: boolean) => THREE.Matrix4;

const UP = new THREE.Vector3(0, 1, 0);

function buildPigHouse(options: BuildOptions) {
  const rng = createRng(3 * 101 + 5);
  const paint = new PartBucket();
  const metal = new PartBucket();
  const body = new THREE.Color(options.bodyColor);
  const shade = (lightness: number, saturation = 0) => body.clone().offsetHSL(0, saturation, lightness);
  const deckTop = 0; // 直接坐在地面上
  // 鼻孔的位置與鼻子朝向（給噴冰塊用）
  const nostrils: THREE.Vector3[] = [];
  const snoutDir = new THREE.Vector3();

  // ── 3-1. 豬屋身體：壓扁一點的大圓球，下緣埋進地面 ──
  const s = 1;
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

  // ── 3-2. 正面拱門：往外凸出的拱形門廊（後半段埋進身體），裡面是深色門洞＋白色半截木門 ──
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

  // ── 3-3. 豬鼻子（門的正上方）：短圓柱＋圓角邊，兩個深色鼻孔 ──
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
      nostrils.push(new THREE.Vector3(side * r * 0.36, 0, length + r * 0.08).applyMatrix4(base));
    }
    snoutDir.setFromMatrixColumn(base, 2).normalize();
  }

  // ── 3-4. 耳朵：扁平的圓弧三角形（擠出薄片＋圓角），內側一片深色內耳；左右鏡射對稱 ──
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

  // ── 3-5. 捲捲的尾巴：頂上偏後，沿螺旋曲線長出一根管子 ──
  {
    const base = surface(160, 55, -0.01); // 鏡射後：頂上偏後、偏左
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

  // ── 3-6. 右側圓窗（垂直擺正）＋水平的圓木板遮雨棚 ──
  // upright = true：窗框不跟著球面往上仰，保持垂直；位置移到 -88°（正側面），離左耳遠一點才不會穿插
  {
    const base = surface(88, 8, 0.004, true); // 鏡射後在右側（+88°）
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

  // ── 3-7. 吊鈴：右後方伸出一根小木棍，掛金色鈴鐺 ──
  {
    const base = surface(128, 30, -0.01, true); // 鏡射後在右後方，跟窗戶保持間距
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

  // ── 3-8. 門邊一朵小白花 ──
  {
    const base = surface(-38, -12, 0.002); // 鏡射後在門的左邊
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

  return { buckets: { paint: paint.build(), metal: metal.build() }, nostrils, snoutDir };
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

export type PigHouseSettings = PigHouseLayout;

type CreatePigHouseOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: PigHouseLayout;
};

export function createPigHouse({ groundRadius, up, front, envMap, layout = PIG_HOUSE_LAYOUT_DEFAULT }: CreatePigHouseOptions) {
  const settings: PigHouseSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'pig_house';
  const model = new THREE.Group();
  model.name = 'pig_house_model';
  anchor.add(model);

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
  addPaintMottle(materials.paint);

  let introGrow = 1;
  let highlighted = false;
  let builtKey = '';

  // ── 噴冰塊（打噴嚏）：卡通風，配合這個粉彩小世界 ──
  // - 冰塊：胖胖的圓角方塊、粉彩色（淡藍、淡紫、薄荷，偶爾一顆淡粉），自發光讓它像糖果一樣亮亮的，不做寫實的玻璃反光
  // - 噴出：「啵」一下從小彈到大（overshoot），鼻孔前冒出一圈星星閃光
  // - 落地：Q 彈地壓扁再彈回、彈兩三下才停
  // - 消失：落地停住後多待 2.5～4 秒，再先膨一下「噗」地縮掉，原地閃一顆星星（不是寫實的融化）
  // 冰塊放在 effects 群組（跟 model 一樣縮放，但不跟著噴嚏「脹一下」）；InstancedMesh 當物件池，只多 1 次 draw call
  const ICE_POOL = 64; // 冰塊落地後會多停一下，同時在場上的數量比較多
  const ICE_SIZE = 0.1;
  const GRAVITY = 4.2;
  const ICE_COLORS = ['#7fd3ff', '#9fe4ff', '#b4a8ff', '#86e8c8', '#ff9fd0'];
  const effects = new THREE.Group();
  effects.name = 'pig_house_effects';
  anchor.add(effects);
  const iceMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, // 各顆的顏色用 instanceColor
    roughness: 0.45,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
    emissive: 0x9fdcff,
    emissiveIntensity: 0.15,
  });
  const ice = new THREE.InstancedMesh(new RoundedBoxGeometry(ICE_SIZE, ICE_SIZE, ICE_SIZE, 3, ICE_SIZE * 0.3), iceMaterial, ICE_POOL);
  ice.name = 'pig_house_ice';
  ice.castShadow = true;
  ice.frustumCulled = false; // 冰塊會飛出原本的包圍球，關掉剔除才不會突然消失
  ice.userData.noFootprint = true; // 小豬避障算佔地時不要算進飛出去的冰塊
  effects.add(ice);
  // 星星閃光：Sprite 物件池（加法混色，永遠面向鏡頭）
  const starMaterialBase = new THREE.SpriteMaterial({
    map: makeStarTexture(),
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  type Star = { sprite: THREE.Sprite; age: number; life: number; size: number; active: boolean };
  const stars: Star[] = Array.from({ length: 16 }, () => {
    const sprite = new THREE.Sprite(starMaterialBase.clone());
    sprite.visible = false;
    sprite.userData.noFootprint = true;
    effects.add(sprite);
    return { sprite, age: 0, life: 0, size: 0, active: false };
  });
  type IceCube = { active: boolean; age: number; life: number; scale: number; pos: THREE.Vector3; vel: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3; resting: boolean; squash: number; bounces: number };
  const cubes: IceCube[] = Array.from({ length: ICE_POOL }, () => ({
    active: false,
    age: 0,
    life: 0,
    scale: 1,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    rot: new THREE.Euler(),
    spin: new THREE.Vector3(),
    resting: false,
    squash: 0,
    bounces: 0,
  }));
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const iceColor = new THREE.Color();
  for (let i = 0; i < ICE_POOL; i++) {
    ice.setMatrixAt(i, zeroMatrix);
    ice.setColorAt(i, iceColor.set(ICE_COLORS[i % ICE_COLORS.length]));
  }
  let nostrils: THREE.Vector3[] = [];
  const snoutDir = new THREE.Vector3(0, 0, 1);
  let sneezeTimer = 2 + Math.random() * 2;
  let sneezePulse = 0; // 1 → 0：噴嚏那一下身體脹起來再回彈
  const iceMatrix = new THREE.Matrix4();
  const iceQuat = new THREE.Quaternion();
  const iceScale = new THREE.Vector3();
  const sideDir = new THREE.Vector3();

  function spawnStar(at: THREE.Vector3, size: number) {
    const star = stars.find((item) => !item.active);
    if (!star) return;
    star.active = true;
    star.age = 0;
    star.life = 0.35 + Math.random() * 0.2;
    star.size = size;
    star.sprite.position.copy(at);
    star.sprite.material.rotation = Math.random() * Math.PI;
    star.sprite.visible = true;
  }

  /** 打一個噴嚏：鼻孔冒星星，兩個鼻孔輪流噴出 count 顆冰塊 */
  function sneeze() {
    if (nostrils.length === 0) return;
    sneezePulse = 1;
    for (const nostril of nostrils) {
      spawnStar(nostril.clone().addScaledVector(snoutDir, 0.03), 0.22);
      spawnStar(nostril.clone().addScaledVector(snoutDir, 0.08).add(new THREE.Vector3(0, 0.05, 0)), 0.14);
    }
    const count = Math.max(1, Math.round(settings.iceCount));
    sideDir.crossVectors(Y_AXIS, snoutDir).normalize();
    let spawned = 0;
    for (let i = 0; i < ICE_POOL && spawned < count; i++) {
      const cube = cubes[i];
      if (cube.active) continue;
      const nostril = nostrils[spawned % nostrils.length];
      const speed = settings.iceSpeed * (0.55 + Math.random() * 0.45);
      cube.active = true;
      cube.resting = false;
      cube.age = 0;
      cube.life = 20; // 還在飛：先給個上限，落地停住時才決定真正的壽命
      cube.scale = 0.7 + Math.random() * 0.5;
      cube.squash = 0;
      cube.bounces = 0;
      cube.pos.copy(nostril);
      // 往鼻子前方噴、往上拋高一點（拋物線比較卡通）、左右散開
      cube.vel
        .copy(snoutDir)
        .multiplyScalar(speed)
        .addScaledVector(Y_AXIS, settings.iceSpeed * (0.8 + Math.random() * 0.6))
        .addScaledVector(sideDir, (Math.random() - 0.5) * 0.8 * settings.iceSpeed);
      cube.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      cube.spin.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
      spawned += 1;
    }
  }

  /** 每幀：倒數下一個噴嚏、冰塊飛行／Q 彈落地／噗地消失、星星閃光、身體脹一下的回彈 */
  function update(deltaTime: number) {
    if (deltaTime <= 0) return;
    if (settings.iceEnabled && introGrow >= 0.999) {
      sneezeTimer -= deltaTime;
      if (sneezeTimer <= 0) {
        sneeze();
        // 下一次：平均 iceInterval 秒，前後隨機 ±50%（「不定時」）
        sneezeTimer = Math.max(0.3, settings.iceInterval) * (0.5 + Math.random());
      }
    }
    // 噴嚏：身體快速脹 7% 再回彈（只動 model，冰塊不跟著脹）
    if (sneezePulse > 0) {
      sneezePulse = Math.max(0, sneezePulse - deltaTime * 4);
      const bump = Math.sin(sneezePulse * Math.PI) * 0.07;
      model.scale.set(settings.size * (1 + bump), settings.size * (1 - bump * 0.5), settings.size * (1 + bump));
    }
    // 星星：瞬間亮起、轉一下、縮掉
    for (const star of stars) {
      if (!star.active) continue;
      star.age += deltaTime;
      const t = star.age / star.life;
      if (t >= 1) {
        star.active = false;
        star.sprite.visible = false;
        continue;
      }
      const s = Math.sin(t * Math.PI);
      star.sprite.scale.setScalar(star.size * (0.4 + 0.8 * s));
      star.sprite.material.opacity = s;
      star.sprite.material.rotation += deltaTime * 3;
    }
    const halfSize = ICE_SIZE * 0.5;
    let dirty = false;
    for (let i = 0; i < ICE_POOL; i++) {
      const cube = cubes[i];
      if (!cube.active) continue;
      dirty = true;
      cube.age += deltaTime;
      if (cube.age >= cube.life) {
        cube.active = false;
        ice.setMatrixAt(i, zeroMatrix);
        spawnStar(cube.pos, 0.12); // 「噗」：消失的地方閃一顆星星
        continue;
      }
      if (!cube.resting) {
        cube.vel.y -= GRAVITY * deltaTime;
        cube.pos.addScaledVector(cube.vel, deltaTime);
        cube.rot.x += cube.spin.x * deltaTime;
        cube.rot.y += cube.spin.y * deltaTime;
        cube.rot.z += cube.spin.z * deltaTime;
        const floor = halfSize * cube.scale;
        if (cube.pos.y <= floor) {
          // 落地：Q 彈——壓扁一下、彈起來（每次彈低一點），彈三下就停
          cube.pos.y = floor;
          cube.squash = 1;
          cube.bounces += 1;
          cube.vel.y = Math.abs(cube.vel.y) * 0.5;
          cube.vel.x *= 0.6;
          cube.vel.z *= 0.6;
          cube.spin.multiplyScalar(0.5);
          if (cube.bounces >= 3 || cube.vel.y < 0.2) {
            cube.resting = true;
            // 停在地上多待一下（2.5～4 秒，隨機）再「噗」地消失
            cube.life = cube.age + 2.5 + Math.random() * 1.5;
            // 停下來時擺正一點（卡通感：不要歪七扭八地斜插在地上）
            cube.rot.x = Math.round(cube.rot.x / (Math.PI / 2)) * (Math.PI / 2);
            cube.rot.z = Math.round(cube.rot.z / (Math.PI / 2)) * (Math.PI / 2);
          }
        }
      }
      cube.squash = Math.max(0, cube.squash - deltaTime * 6);
      // 出場：前 0.18 秒從 0「啵」地彈到 1.15 再回 1（overshoot）
      const born = Math.min(1, cube.age / 0.18);
      const pop = born < 1 ? Math.sin(born * Math.PI * 0.5) * (1 + 0.15 * Math.sin(born * Math.PI)) : 1;
      // 退場：最後 0.25 秒先膨到 1.25 再縮到 0
      const left = cube.life - cube.age;
      const out = left < 0.25 ? (left > 0.15 ? 1 + (0.25 - left) * 2.5 : (left / 0.15) * 1.25) : 1;
      const k = cube.scale * pop * out;
      const sq = Math.sin(cube.squash * Math.PI) * 0.35; // 落地壓扁：變矮變胖
      iceScale.set(k * (1 + sq), k * (1 - sq), k * (1 + sq));
      iceQuat.setFromEuler(cube.rot);
      iceMatrix.compose(cube.pos, iceQuat, iceScale);
      ice.setMatrixAt(i, iceMatrix);
    }
    if (dirty) ice.instanceMatrix.needsUpdate = true;
  }

  /** 造型（顏色、耳朵）改變才重建；拖曳位置、改大小不用重建 */
  function rebuild() {
    const key = [settings.bodyColor, settings.earForward, settings.earThickness, settings.earSize].join('|');
    if (key === builtKey) return;
    builtKey = key;
    for (const child of [...model.children]) {
      (child as THREE.Mesh).geometry?.dispose();
      model.remove(child);
    }
    const built = buildPigHouse({
      bodyColor: settings.bodyColor,
      earForward: settings.earForward,
      earThickness: Math.max(0.2, settings.earThickness),
      earSize: Math.max(0.3, settings.earSize),
    });
    nostrils = built.nostrils;
    snoutDir.copy(built.snoutDir);
    for (const [name, geometry] of Object.entries(built.buckets)) {
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, materials[name as keyof typeof materials]);
      mesh.name = `pig_house_${name}`;
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
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
    model.scale.setScalar(settings.size);
    effects.scale.setScalar(settings.size);
  }

  function applyVisuals() {
    for (const material of Object.values(materials)) {
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
    applyPlacement();
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1);
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
  }

  function dispose() {
    anchor.removeFromParent();
    for (const child of model.children) (child as THREE.Mesh).geometry?.dispose();
    for (const material of Object.values(materials)) material.dispose();
    ice.geometry.dispose();
    ice.dispose();
    iceMaterial.dispose();
    for (const star of stars) star.sprite.material.dispose();
    starMaterialBase.dispose();
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
    update,
    /** 立刻打一個噴嚏（面板測試用） */
    sneeze,
    dispose,
    getNormal: () => normal.clone(),
    setNormal,
  };
}

export function formatPigHousePlacementsForPaste(entries: Array<{ id: string; settings: PigHouseLayout }>) {
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
      `    bodyColor: '${s.bodyColor}',\n` +
      `    earForward: ${s.earForward},\n` +
      `    earThickness: ${s.earThickness.toFixed(2)},\n` +
      `    earSize: ${s.earSize.toFixed(2)},\n` +
      `    iceEnabled: ${s.iceEnabled},\n` +
      `    iceInterval: ${s.iceInterval.toFixed(1)},\n` +
      `    iceCount: ${Math.round(s.iceCount)},\n` +
      `    iceSpeed: ${s.iceSpeed.toFixed(2)},\n` +
      `    colorBoost: ${s.colorBoost.toFixed(2)},\n` +
      `  }${comma}`
    );
  });
  return (
    `// 貼回 src/world/objects/pigHouseLayout.ts\n` +
    `export const PIG_HOUSE_PLACEMENTS: PigHousePlacement[] = [\n` +
    lines.join('\n') +
    `\n];\n`
  );
}
