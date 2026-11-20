import * as THREE from 'three';
import { CANDY_JAR_LAYOUT_DEFAULT, type CandyJarLayout } from './candyJarLayout';

/**
 * 綠球上的「糖果罐」：柑仔店屋頂那個超大玻璃糖果罐的獨立版（柑仔店那罐不動）。
 *   - 圓肚玻璃罐（LatheGeometry 把側面輪廓轉一圈），裡面塞滿彩色糖球（InstancedMesh，每顆各自顏色）
 *   - 紅色罐蓋＋小圓鈕、罐口一圈白色緞帶
 * 造型與尺寸照抄 candyShop.ts 的 buildCandyJar，這裡另外包成可拖曳、可複製的物件（跟檸檬片一樣）。
 *
 * 模型座標：y 朝上、罐底在 y = 0，罐身半徑 0.36、高 0.62（含蓋約 0.78）。
 */

const R = 0.36;
const H = 0.62;
const BALL_R = 0.055;
const CANDY_COLORS = [0xff5a7a, 0xffd23f, 0x4ac3ff, 0x7ee07a, 0xb07cff, 0xff9a3c, 0xffffff];

// ── 擺到綠球上 ──

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const HIGHLIGHT = new THREE.Color('#ffb36b');
const BLACK = new THREE.Color(0x000000);

export type CandyJarSettings = CandyJarLayout;

type CreateCandyJarOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: CandyJarLayout;
};

export function createCandyJar({ groundRadius, up, front, envMap, layout = CANDY_JAR_LAYOUT_DEFAULT }: CreateCandyJarOptions) {
  const settings: CandyJarSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'candy_jar';
  const model = new THREE.Group();
  anchor.add(model);

  // ── 材質（跟柑仔店那罐一樣） ──
  // 玻璃：透明、不寫深度（depthWrite: false），裡面的糖球才看得到；DoubleSide 讓罐子內側也有一點反光
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xeafcff,
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMap: envMap ?? null,
  });
  const lidMaterial = new THREE.MeshStandardMaterial({ roughness: 0.45 });
  // 糖球：顏色用 instanceColor 各自上色，材質本身白色
  const candyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.25 });
  const ribbonMaterial = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.5 });
  // 會發亮（選中效果）的材質；玻璃不算，玻璃發亮會整片糊掉
  const solidMaterials = [lidMaterial, candyMaterial, ribbonMaterial];

  // ── 罐身 ──
  const profile: THREE.Vector2[] = [new THREE.Vector2(0.001, 0), new THREE.Vector2(R - 0.06, 0), new THREE.Vector2(R - 0.01, 0.04)];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    profile.push(new THREE.Vector2(R + Math.sin(t * Math.PI) * 0.03, 0.06 + t * (H - 0.16)));
  }
  profile.push(new THREE.Vector2(R - 0.05, H - 0.04), new THREE.Vector2(R - 0.07, H));
  const ballGeometry = new THREE.SphereGeometry(BALL_R, 12, 8);
  let balls: THREE.InstancedMesh | null = null;
  // 玻璃罐身要在糖球之後畫（透明物件 three 會自動排在後面）
  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), glassMaterial);
  glass.name = 'candy_jar_glass';
  model.add(glass);
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.04, R - 0.04, 0.09, 32), lidMaterial);
  lid.position.y = H + 0.04;
  model.add(lid);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), lidMaterial);
  knob.scale.y = 0.7;
  knob.position.y = H + 0.1;
  model.add(knob);
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(R - 0.055, 0.018, 8, 32), ribbonMaterial);
  ribbon.rotation.x = Math.PI / 2;
  ribbon.position.y = H - 0.03;
  model.add(ribbon);

  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh !== glass; // 透明玻璃不投影，不然影子是實心的
    mesh.receiveShadow = true;
  });

  /** 糖球：在罐子裡隨機（但每次一樣）塞到 7 成高。改顆數才重建 */
  let builtCount = -1;
  function rebuildCandies() {
    const count = Math.max(0, Math.round(settings.candyCount));
    if (count === builtCount) return;
    builtCount = count;
    if (balls) {
      model.remove(balls);
      balls.dispose();
      balls = null;
    }
    if (count === 0) return;
    balls = new THREE.InstancedMesh(ballGeometry, candyMaterial, count);
    balls.name = 'candy_jar_candies';
    balls.castShadow = true;
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let seed = 11;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * (R - BALL_R - 0.02);
      const y = BALL_R + 0.02 + (i / count) * (H * 0.62);
      matrix.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r);
      balls.setMatrixAt(i, matrix);
      balls.setColorAt(i, color.set(CANDY_COLORS[i % CANDY_COLORS.length]));
    }
    // 糖球先加進去：同一層裡不透明的物件先畫，玻璃罐（透明）會排在後面畫
    model.add(balls);
  }

  let introGrow = 1;
  let highlighted = false;

  function applyPlacement() {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));
    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
    model.scale.setScalar(settings.size);
  }

  function applyVisuals() {
    lidMaterial.color.set(settings.lidColor);
    for (const material of solidMaterials) {
      if (material !== lidMaterial) material.color.set(material === candyMaterial ? 0xffffff : 0xfffaf2);
      material.color.multiplyScalar(settings.colorBoost);
      material.emissive.copy(highlighted ? HIGHLIGHT : BLACK);
      material.emissiveIntensity = highlighted ? 0.22 : 0;
    }
  }

  function applySettings() {
    rebuildCandies();
    applyPlacement();
    applyVisuals();
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
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    balls?.dispose();
    for (const material of [glassMaterial, ...solidMaterials]) material.dispose();
  }

  applySettings();

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

export function formatCandyJarPlacementsForPaste(entries: Array<{ id: string; settings: CandyJarLayout }>) {
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
      `    lidColor: '${s.lidColor}',\n` +
      `    candyCount: ${Math.round(s.candyCount)},\n` +
      `    colorBoost: ${s.colorBoost.toFixed(2)},\n` +
      `  }${comma}`
    );
  });
  return (
    `// 貼回 src/world/objects/candyJarLayout.ts\n` +
    `export const CANDY_JAR_PLACEMENTS: CandyJarPlacement[] = [\n` +
    lines.join('\n') +
    `\n];\n`
  );
}
