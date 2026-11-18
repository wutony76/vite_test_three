import * as THREE from 'three';
import { makeGlowTexture, makeStarTexture } from './pigCoinShine';

/**
 * 綠球上的大包子：白白胖胖、頂上一圈螺旋褶子，正面一個金色閃閃發亮的「金」字。
 *   - 包子身體用 LatheGeometry（把側面輪廓繞 y 軸轉一圈）：底部平、上面圓鼓，比壓扁的球更像包子
 *   - 「金」字畫在 canvas 上，貼在一片「彎成包子表面形狀」的薄片上（跟著弧面，側面看不會浮起來）
 *   - 字會自己發光、亮度像呼吸；前面一圈光暈＋四顆輪流閃的四角星（貼圖跟小豬金幣共用）
 *   - 整顆包子輕輕「呼吸」（上下微微伸縮），看起來軟軟的
 * 擺放方式跟 Happy Fat、寶箱一樣：離頂端角度＋方位角決定在球面上的位置，面板可調、可拖曳。
 *
 * 模型座標：+z 是正面（「金」字那一側），y 朝上，底部在 y = 0，半徑約 1。
 */

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();

export type BigBunColors = {
  /** 包子皮 */
  bun: string;
  /** 「金」字 */
  text: string;
};

export type BigBunSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 包子直徑（世界單位） */
  size: number;
  sink: number;
  /** 「金」字發光強度（0 = 不發光，只是金色） */
  glow: number;
  colors: BigBunColors;
};

export const BIG_BUN_DEFAULT: BigBunSettings = {
  enabled: true,
  angleFromTopDegrees: 24,
  azimuthDegrees: -69,
  // 讓「金」字正對開場鏡頭
  spinDegrees: 130,
  size: 0.12,
  sink: 0.004,
  glow: 1,
  colors: {
    bun: '#fff4e6',
    text: '#f6c343',
  },
};

// ───────────────────────── 包子輪廓 ─────────────────────────

/** 包子的側面輪廓（r = 離中心軸多遠, y = 高度），從底部中心一路畫到頂端 */
const BUN_PROFILE: THREE.Vector2[] = (() => {
  const points: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(0.82, 0), new THREE.Vector2(0.96, 0.04)];
  const steps = 32;
  for (let k = 0; k <= steps; k++) {
    const angle = (k / steps) * (Math.PI / 2);
    // 次方 < 1：側面比正圓更「鼓」，像發得很飽的包子；頂端收成一點
    const r = Math.max(0.0001, Math.cos(angle) ** 0.7);
    const y = 0.13 + 1.0 * Math.sin(angle) ** 1.15;
    points.push(new THREE.Vector2(r, y));
  }
  return points;
})();

const BUN_TOP = BUN_PROFILE[BUN_PROFILE.length - 1].y;

/** 某個高度上，包子表面離中心軸多遠（在輪廓上線性內插） */
function bunRadiusAt(y: number) {
  for (let i = 1; i < BUN_PROFILE.length; i++) {
    const a = BUN_PROFILE[i - 1];
    const b = BUN_PROFILE[i];
    if (y >= a.y && y <= b.y) {
      const f = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * f;
    }
  }
  return 0;
}

/** 包子表面上某一點：沿經線（從側面往頂端）走到第 t 段（0 = 腰、1 = 頂），方位角 phi */
function bunSurfacePoint(t: number, phi: number, lift = 0) {
  const y = 0.13 + (BUN_TOP - 0.13) * t;
  const r = bunRadiusAt(y) + lift;
  return new THREE.Vector3(r * Math.sin(phi), y + lift * 0.5, r * Math.cos(phi));
}

// ───────────────────────── 「金」字 ─────────────────────────

/** 白字黑底：同一張圖當 alphaMap（哪裡有字）和 emissiveMap（哪裡發光） */
function createCharacterTexture(character: string, strokeWidth: number) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  g.lineWidth = strokeWidth;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${size * 0.82}px "PingFang TC", "Noto Sans TC", "Heiti TC", "Microsoft JhengHei", sans-serif`;
  // 先描邊再填色：筆畫加粗一圈，縮小在遠處看才不會細到糊掉
  g.strokeText(character, size / 2, size * 0.53);
  g.fillText(character, size / 2, size * 0.53);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * 字貼的那片薄片：先在 xy 平面切好格子，再把每個頂點沿 +z 推到包子表面上（再浮起一點點），
 * 字就跟著包子的弧面彎，側面看不會像一張紙卡在前面。
 */
function createCharacterGeometry(width: number, height: number, centerY: number) {
  const geometry = new THREE.PlaneGeometry(width, height, 24, 24);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i) + centerY;
    const r = bunRadiusAt(y);
    position.setXYZ(i, x, y, Math.sqrt(Math.max(0, r * r - x * x)) + 0.012);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// ───────────────────────── 建立 ─────────────────────────

type CreateBigBunOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  /** 金字反射用的環境貼圖（建議用不染色的那張） */
  envMap?: THREE.Texture;
  layout?: BigBunSettings;
};

export function createBigBun({ groundRadius, up, front, envMap, layout = BIG_BUN_DEFAULT }: CreateBigBunOptions) {
  // colors 另外複製：只用 { ...layout } 的話面板改色會改到 BIG_BUN_DEFAULT 本身
  const settings: BigBunSettings = { ...layout, colors: { ...layout.colors } };
  const anchor = new THREE.Object3D();
  anchor.name = 'big_bun';
  const content = new THREE.Group();
  anchor.add(content);
  /** 包子本體（會呼吸伸縮），字和褶子都掛在它底下一起動 */
  const body = new THREE.Group();
  content.add(body);
  let introGrow = 1;

  // ── 材質 ──
  // 包子皮：霧面、不反光，暖白色
  const bunMaterial = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  const characterTexture = createCharacterTexture('金', 10);
  // 描邊層：同一個字、筆畫粗很多，墊在金字後面當深金色的外框；
  // 少了它，亮金色的字直接貼在白包子上，邊緣會糊在一起看不清楚
  const outlineTexture = createCharacterTexture('金', 34);
  const outlineMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.5,
    metalness: 0.3,
    alphaMap: outlineTexture,
    alphaTest: 0.5,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  const textMaterial = new THREE.MeshStandardMaterial({
    metalness: 0.6,
    roughness: 0.25,
    envMap,
    envMapIntensity: 1.3,
    alphaMap: characterTexture,
    // alphaTest：字以外的地方直接不畫，不用排序透明物件，也不會有半透明的方框
    alphaTest: 0.5,
    emissiveMap: characterTexture,
    emissive: 0xffcc33,
    // 往包子表面拉近一點畫，避免跟包子皮搶深度、閃爍
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  function applyColors() {
    bunMaterial.color.set(settings.colors.bun);
    textMaterial.color.set(settings.colors.text);
    outlineMaterial.color.set(settings.colors.text).multiplyScalar(0.45);
    // 發光色往亮黃靠：純金色在暖色燈光下會偏橘
    textMaterial.emissive.set(settings.colors.text).lerp(new THREE.Color(0xffe36b), 0.5);
  }

  // ── 包子身體 ──
  const bodyMesh = new THREE.Mesh(new THREE.LatheGeometry(BUN_PROFILE, 64), bunMaterial);
  body.add(bodyMesh);

  // 頂上的褶子：一圈從肩膀往頂端收的細管，每條往同一邊歪（螺旋），像捏出來的包子摺
  const PLEAT_COUNT = 14;
  for (let k = 0; k < PLEAT_COUNT; k++) {
    const phi0 = (k / PLEAT_COUNT) * Math.PI * 2;
    const points: THREE.Vector3[] = [];
    for (let n = 0; n <= 12; n++) {
      const t = 0.74 + (0.25 * n) / 12;
      // 越往上越歪：0.9 弧度 ≈ 往旁邊扭 50°
      points.push(bunSurfacePoint(t, phi0 + ((t - 0.74) / 0.25) * 0.9, 0.005));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    // 下粗上細看起來比較自然，但 TubeGeometry 只能一種粗細；用小一點的半徑 + 頂端小圓球蓋住收尾
    const pleat = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.035, 6, false), bunMaterial);
    body.add(pleat);
  }
  // 頂端收口的小圓球
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), bunMaterial);
  knot.scale.set(1, 0.7, 1);
  knot.position.y = BUN_TOP + 0.01;
  body.add(knot);

  // ── 「金」字 ──
  const CHARACTER_CENTER_Y = 0.56;
  const CHARACTER_SIZE = 0.78;
  const characterGeometry = createCharacterGeometry(CHARACTER_SIZE, CHARACTER_SIZE, CHARACTER_CENTER_Y);
  body.add(new THREE.Mesh(characterGeometry, outlineMaterial));
  body.add(new THREE.Mesh(characterGeometry, textMaterial));

  // ── 閃光：字前面一圈光暈＋四顆輪流閃的四角星 ──
  const sparkle = new THREE.Group();
  sparkle.name = 'big_bun_sparkle';
  // 光暈中心放在字的表面再往前一點，從正面看會「從字裡透出光」
  sparkle.position.set(0, CHARACTER_CENTER_Y, bunRadiusAt(CHARACTER_CENTER_Y) + 0.05);
  body.add(sparkle);
  const glowSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    }),
  );
  // 光暈不要太大太亮：會把金字洗成一片白，字反而看不出來
  glowSprite.scale.setScalar(CHARACTER_SIZE * 1.5);
  sparkle.add(glowSprite);
  const starTexture = makeStarTexture();
  const stars = Array.from({ length: 4 }, (_, i) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: starTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    // 散在字的四個角外側
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    sprite.position.set(Math.cos(angle) * CHARACTER_SIZE * 0.55, Math.sin(angle) * CHARACTER_SIZE * 0.5, 0.02);
    sparkle.add(sprite);
    return { sprite, phase: i * 1.7, speed: 2.2 + i * 0.55, baseSize: CHARACTER_SIZE * (0.45 + (i % 2) * 0.2) };
  });
  // Sprite 的射線判定需要 raycaster.camera，拖曳工具沒設定會報錯；光暈、星星本來也不該被點到
  sparkle.traverse((child) => {
    child.raycast = () => {};
  });

  content.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  // 模型原始直徑（輪廓最寬處 × 2）：size 設定的是包子直徑
  const modelDiameter = 2 * Math.max(...BUN_PROFILE.map((p) => p.x));

  function currentNormal(target: THREE.Vector3) {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    return target.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));
  }

  function applyPlacement() {
    anchor.visible = settings.enabled;
    currentNormal(normal);
    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.scale.setScalar(Math.max(0.0001, introGrow));
    content.scale.setScalar(settings.size / modelDiameter);
    applyColors();
  }

  applyPlacement();

  let time = 0;
  function update(deltaTime: number) {
    time += deltaTime;
    // 包子軟軟地呼吸：高度 ±2.5%、寬度反向一點點（體積看起來不變，才像軟的不是在充氣）
    const squash = Math.sin(time * 1.8);
    body.scale.set(1 - 0.012 * squash, 1 + 0.025 * squash, 1 - 0.012 * squash);
    // 字的發光像呼吸：數值同小豬金幣，再乘上面板的發光強度
    const glow = Math.max(0, settings.glow);
    const pulse = Math.sin(time * 3.1);
    textMaterial.emissiveIntensity = (0.3 + 0.18 * pulse) * glow;
    glowSprite.material.opacity = (0.22 + 0.12 * pulse) * Math.min(1, glow);
    for (const star of stars) {
      // max(0, sin)^3：大部分時間是暗的，偶爾「叮」一下亮起來
      const t = Math.max(0, Math.sin(time * star.speed + star.phase));
      const flash = t * t * t;
      star.sprite.material.opacity = flash * Math.min(1, glow);
      star.sprite.scale.setScalar(star.baseSize * (0.4 + 0.8 * flash));
      star.sprite.material.rotation = time * 0.8 + star.phase;
    }
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1.5);
    anchor.scale.setScalar(Math.max(0.0001, introGrow));
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

  return {
    object: anchor,
    settings,
    applySettings: applyPlacement,
    setIntroGrow,
    update,
    setNormal,
    getNormal: () => currentNormal(new THREE.Vector3()),
  };
}

export function formatBigBunSettingsForPaste(s: BigBunSettings) {
  return (
    `// 貼回 src/world/objects/bigBun.ts 的 BIG_BUN_DEFAULT\n` +
    `export const BIG_BUN_DEFAULT: BigBunSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
    `  azimuthDegrees: ${s.azimuthDegrees},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  sink: ${s.sink.toFixed(3)},\n` +
    `  glow: ${s.glow.toFixed(2)},\n` +
    `  colors: {\n` +
    `    bun: '${s.colors.bun}',\n` +
    `    text: '${s.colors.text}',\n` +
    `  },\n` +
    `};`
  );
}
