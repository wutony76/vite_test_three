import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeStarTexture } from './pigCoinShine';

/**
 * 綠球上的「古井冰西瓜」：鄉下院子那種洗石子水槽，裡面泡著冰涼的西瓜和水果。
 *   - 水槽：灰白洗石子，方形倒角的寬邊框，槽裡一池會流動的彩虹色水，水面有閃光
 *   - 水裡：一顆大西瓜（有小臉）、番茄、水蜜桃、橘子，跟著水面輕輕浮動
 *   - 右後方：紅磚八角座＋深色木頭八角手壓幫浦，長長的握把會一上一下壓，出水口滴水進水槽
 *   - 左後方：一叢龜背芋，葉子有缺口、會隨風輕晃
 *   - 邊框上一串綠葡萄，地上幾顆石頭、幾撮草、一片青苔
 * 擺放方式跟大包子一樣：離頂端角度＋方位角決定在球面上的位置，面板可調、可拖曳，「印出設定」貼回預設值。
 *
 * 模型座標：+z 是正面，y 朝上，底部在 y = 0，水槽寬約 1.05。
 */

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();

export type MelonTroughColors = {
  /** 水槽洗石子 */
  stone: string;
  /** 水（輕輕染在彩虹水面上） */
  water: string;
  /** 幫浦底下的紅磚座 */
  brick: string;
  /** 幫浦木頭 */
  pump: string;
  /** 龜背芋葉子 */
  leaf: string;
};

export type MelonTroughSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 整組寬度（世界單位，含幫浦握把） */
  size: number;
  sink: number;
  /** 水面閃光強度（0 = 不閃） */
  glow: number;
  colors: MelonTroughColors;
};

export const MELON_TROUGH_DEFAULT: MelonTroughSettings = {
  enabled: true,
  angleFromTopDegrees: 19,
  azimuthDegrees: 130,
  spinDegrees: -104,
  size: 0.12,
  sink: 0.003,
  glow: 1,
  colors: {
    stone: '#e6e2d6',
    water: '#3fb8f0',
    brick: '#a8553a',
    pump: '#4a4640',
    leaf: '#8cc63f',
  },
};

// ───────────────────────── 尺寸 ─────────────────────────

const TROUGH_OUT = 1.05; // 邊框外寬
const TROUGH_IN = 0.7; // 水池內寬
const BODY_W = 0.9; // 下半槽身寬
const BODY_H = 0.42;
const RIM_H = 0.12;
const RIM_TOP = BODY_H + RIM_H;
const WATER_Y = RIM_TOP - 0.05;
const PUMP_X = 0.3;
const PUMP_Z = -0.62;
const BRICK_H = 0.38;
const PUMP_H = 0.42;

// ───────────────────────── 貼圖 ─────────────────────────

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, g: canvas.getContext('2d')! };
}

function toTexture(canvas: HTMLCanvasElement) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** 洗石子：白底上撒灰色小點（材質 color 染成石頭色） */
function createTerrazzoTexture() {
  const { canvas, g } = makeCanvas(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const v = 150 + Math.floor(rand() * 80);
    g.fillStyle = `rgb(${v},${v},${v - 6})`;
    g.beginPath();
    g.arc(rand() * 128, rand() * 128, 0.6 + rand() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  const texture = toTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  return texture;
}

/** 水面波紋：白色的彎彎細線（材質 color 是水色），update() 裡讓貼圖慢慢流動 */
function createRippleTexture() {
  const { canvas, g } = makeCanvas(256, 256);
  // 彩虹水面：色相沿斜對角繞一整圈（0°→360°），貼圖左右上下重複時接得起來；粉嫩一點不要太刺眼
  for (let x = 0; x < 256; x++) {
    for (let y = 0; y < 256; y += 4) {
      const hue = ((x + y) / 256) * 360;
      g.fillStyle = `hsl(${hue}, 95%, 64%)`;
      g.fillRect(x, y, 1, 4);
    }
  }
  g.lineCap = 'round';
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const len = 18 + rand() * 40;
    g.strokeStyle = `rgba(255,255,255,${0.6 + rand() * 0.4})`;
    g.lineWidth = 2 + rand() * 3;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + len / 2, y - 6 - rand() * 6, x + len, y);
    g.stroke();
  }
  const texture = toTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** 西瓜皮：亮綠底＋深綠鋸齒條紋（沿經線），正面畫一張小臉 */
function createMelonTexture() {
  const { canvas, g } = makeCanvas(512, 256);
  g.fillStyle = '#5dbb3a';
  g.fillRect(0, 0, 512, 256);
  const stripes = 12;
  g.fillStyle = '#1f6a2a';
  for (let i = 0; i < stripes; i++) {
    const cx = (i + 0.5) * (512 / stripes);
    g.beginPath();
    g.moveTo(cx, 0);
    for (let y = 0; y <= 256; y += 8) {
      const w = 7 + 4 * Math.sin(y * 0.5 + i) + (Math.sin((y / 256) * Math.PI) * 5);
      g.lineTo(cx + w + (y % 16 ? 3 : -3), y);
    }
    for (let y = 256; y >= 0; y -= 8) {
      const w = 7 + 4 * Math.sin(y * 0.5 + i) + (Math.sin((y / 256) * Math.PI) * 5);
      g.lineTo(cx - w + (y % 16 ? -3 : 3), y);
    }
    g.closePath();
    g.fill();
  }
  // 小臉：SphereGeometry 的 u = 0.25 是 +z 正面。西瓜會躺下（繞 z 轉 90°），貼圖的「右」變成世界的「上」，
  // 所以臉要先轉 90° 畫，躺下後才是正的
  g.save();
  g.translate(512 * 0.25, 128);
  g.rotate(Math.PI / 2);
  const fx = 0;
  const fy = 0;
  g.fillStyle = '#ffffff';
  g.globalAlpha = 0.85;
  g.beginPath();
  g.ellipse(fx, fy, 30, 22, 0, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#1b2a1b';
  g.beginPath();
  g.arc(fx - 11, fy - 4, 3.5, 0, Math.PI * 2);
  g.arc(fx + 11, fy - 4, 3.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1b2a1b';
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(fx, fy + 2, 7, 0.2 * Math.PI, 0.8 * Math.PI);
  g.stroke();
  g.fillStyle = 'rgba(255,120,140,0.7)';
  g.beginPath();
  g.ellipse(fx - 20, fy + 5, 5, 3, 0, 0, Math.PI * 2);
  g.ellipse(fx + 20, fy + 5, 5, 3, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return toTexture(canvas);
}

/** 龜背芋葉子：心形大葉、兩側開裂、中間幾個洞，白色畫（材質 color 染成葉色），透明的地方用 alphaTest 挖掉 */
function createMonsteraTexture() {
  const { canvas, g } = makeCanvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  // 葉身：心形
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(128, 250);
  g.bezierCurveTo(30, 200, 0, 120, 30, 60);
  g.bezierCurveTo(55, 15, 105, 10, 128, 40);
  g.bezierCurveTo(151, 10, 201, 15, 226, 60);
  g.bezierCurveTo(256, 120, 226, 200, 128, 250);
  g.fill();
  // 葉脈（淡一點）
  g.strokeStyle = 'rgba(200,220,170,1)';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(128, 245);
  g.lineTo(128, 45);
  g.stroke();
  // 兩側的裂口：從邊緣往中脈切進去
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = 6;
  g.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const y = 80 + k * 38;
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(128 + dir * 130, y - 20);
      g.lineTo(128 + dir * 36, y + 4);
      g.stroke();
    }
  }
  // 中脈旁邊的小洞
  for (let k = 0; k < 3; k++) {
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.ellipse(128 + dir * 22, 95 + k * 45, 5, 9, dir * 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalCompositeOperation = 'source-over';
  return toTexture(canvas);
}

// ───────────────────────── 小工具 ─────────────────────────

function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number, radius = 0.03) {
  const r = Math.min(radius, Math.min(width, height, depth) * 0.45);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, r), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** 倒角方形（八角形的方框輪廓），中心在原點 */
function chamferedSquare(half: number, chamfer: number, path: THREE.Shape | THREE.Path) {
  path.moveTo(-half + chamfer, -half);
  path.lineTo(half - chamfer, -half);
  path.lineTo(half, -half + chamfer);
  path.lineTo(half, half - chamfer);
  path.lineTo(half - chamfer, half);
  path.lineTo(-half + chamfer, half);
  path.lineTo(-half, half - chamfer);
  path.lineTo(-half, -half + chamfer);
  path.closePath();
  return path;
}

// ───────────────────────── 建立 ─────────────────────────

type CreateMelonTroughOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: MelonTroughSettings;
};

export function createMelonTrough({ groundRadius, up, front, envMap, layout = MELON_TROUGH_DEFAULT }: CreateMelonTroughOptions) {
  // colors 另外複製：只用 { ...layout } 的話面板改色會改到 MELON_TROUGH_DEFAULT 本身
  const settings: MelonTroughSettings = { ...layout, colors: { ...layout.colors } };
  const anchor = new THREE.Object3D();
  anchor.name = 'melon_trough';
  const content = new THREE.Group();
  anchor.add(content);
  let introGrow = 1;

  // ── 材質 ──
  const terrazzo = createTerrazzoTexture();
  const stoneMaterial = new THREE.MeshStandardMaterial({ map: terrazzo, roughness: 0.85 });
  const stoneShadeMaterial = new THREE.MeshStandardMaterial({ map: terrazzo, roughness: 0.9 });
  const rippleTexture = createRippleTexture();
  const waterMaterial = new THREE.MeshStandardMaterial({
    map: rippleTexture,
    // 自己發一點光：彩虹色在陰影裡也鮮豔
    emissiveMap: rippleTexture,
    emissive: 0xffffff,
    emissiveIntensity: 0.35,
    roughness: 0.1,
    metalness: 0.1,
    envMap,
    transparent: true,
    opacity: 0.92,
  });
  const brickMaterial = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const mortarMaterial = new THREE.MeshStandardMaterial({ color: 0xd9c9b0, roughness: 0.95 });
  const pumpMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const pumpDarkMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0x7c7f84, roughness: 0.4, metalness: 0.7, envMap });
  const gripMaterial = new THREE.MeshStandardMaterial({ color: 0xd99550, roughness: 0.7 });
  const leafTexture = createMonsteraTexture();
  const leafMaterial = new THREE.MeshStandardMaterial({ map: leafTexture, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
  const stemMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const melonMaterial = new THREE.MeshStandardMaterial({ map: createMelonTexture(), roughness: 0.35 });
  const grapeMaterial = new THREE.MeshStandardMaterial({ color: 0xa8d65a, roughness: 0.3, emissive: 0x2a4010, emissiveIntensity: 0.3 });
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.9, flatShading: true });
  const mossMaterial = new THREE.MeshStandardMaterial({ color: 0x5fa83f, roughness: 1 });
  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x7fbf4a, roughness: 0.8, side: THREE.DoubleSide });
  const waterDropMaterial = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, roughness: 0.05, envMap, transparent: true, opacity: 0.8 });

  const tint = new THREE.Color();
  function applyColors() {
    const c = settings.colors;
    stoneMaterial.color.set(c.stone);
    stoneShadeMaterial.color.set(c.stone).multiplyScalar(0.82);
    // 水色只輕輕染一層，彩虹色才看得出來
    waterMaterial.color.set('#ffffff').lerp(tint.set(c.water), 0.3);
    brickMaterial.color.set(c.brick);
    pumpMaterial.color.set(c.pump);
    pumpDarkMaterial.color.set(c.pump).multiplyScalar(0.7);
    leafMaterial.color.set(c.leaf);
    stemMaterial.color.set(c.leaf).multiplyScalar(0.8);
  }

  // ── 青苔地墊：水槽底下一片不規則的深綠 ──
  {
    const shape = new THREE.Shape();
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = 0.64 + 0.08 * Math.sin(a * 3 + 1) + 0.04 * Math.sin(a * 7);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.9;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const moss = new THREE.Mesh(new THREE.ShapeGeometry(shape), mossMaterial);
    moss.rotation.x = -Math.PI / 2;
    moss.position.set(0.05, 0.004, -0.1);
    content.add(moss);
  }

  // ── 水槽 ──
  // 下半槽身：比邊框小一圈，底部再一條深色踢腳
  content.add(box(BODY_W, BODY_H, BODY_W, stoneShadeMaterial, 0, BODY_H / 2, 0, 0.04));
  content.add(box(BODY_W + 0.04, 0.06, BODY_W + 0.04, stoneShadeMaterial, 0, 0.03, 0, 0.02));
  // 寬邊框：倒角方框（中間挖空），有斜角收邊
  {
    const outer = chamferedSquare(TROUGH_OUT / 2 - 0.02, 0.12, new THREE.Shape()) as THREE.Shape;
    outer.holes.push(chamferedSquare(TROUGH_IN / 2, 0.04, new THREE.Path()) as THREE.Path);
    const rimGeometry = new THREE.ExtrudeGeometry(outer, {
      depth: RIM_H - 0.04,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 2,
      curveSegments: 4,
    });
    rimGeometry.rotateX(-Math.PI / 2);
    // ExtrudeGeometry 的 uv 是模型座標，縮一下讓洗石子的點點不會太大
    const uv = rimGeometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.8, uv.getY(i) * 0.8);
    const rim = new THREE.Mesh(rimGeometry, stoneMaterial);
    rim.position.y = BODY_H + 0.02;
    content.add(rim);
  }
  // 槽裡的內壁（深一點），水面下看起來有深度
  {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(TROUGH_IN - 0.01, 0.2, TROUGH_IN - 0.01, 1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x2a7fb0, roughness: 0.9, side: THREE.BackSide }),
    );
    wall.position.y = WATER_Y - 0.1;
    content.add(wall);
  }
  // 水面
  const water = new THREE.Mesh(new THREE.PlaneGeometry(TROUGH_IN, TROUGH_IN), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  content.add(water);

  // ── 水裡的西瓜和水果：update() 裡跟著水面上下浮 ──
  const floaters: Array<{ obj: THREE.Object3D; baseY: number; phase: number; tilt: number }> = [];
  {
    // 西瓜：兩極（條紋收攏的地方）沿 y，拉長成橢圓後繞 z 轉 90° 躺下，條紋就變成左右橫向；臉在 +z 正面
    const melon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 20), melonMaterial);
    melon.scale.set(0.92, 1.3, 1.0);
    melon.rotation.z = Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.set(-0.02, WATER_Y + 0.05, -0.04);
    holder.add(melon);
    content.add(holder);
    floaters.push({ obj: holder, baseY: holder.position.y, phase: 0, tilt: 0.04 });

    const fruits: Array<[number, number, number, number, number]> = [
      // x, z, 半徑, 顏色, 種類（0 番茄 1 水蜜桃 2 橘子）
      [-0.23, 0.2, 0.045, 0xe8402f, 0],
      [0.06, 0.24, 0.05, 0xff8fa0, 1],
      [0.24, 0.17, 0.042, 0xff9a2a, 2],
      [0.25, -0.2, 0.04, 0xe8402f, 0],
      [-0.25, -0.22, 0.04, 0xff9a2a, 2],
      [0.24, 0.0, 0.04, 0xe8402f, 0],
    ];
    fruits.forEach(([x, z, r, color, kind], i) => {
      const holder = new THREE.Group();
      holder.position.set(x, WATER_Y + r * 0.35, z);
      const fruit = new THREE.Mesh(
        new THREE.SphereGeometry(r, 16, 12),
        new THREE.MeshStandardMaterial({ color, roughness: kind === 2 ? 0.7 : 0.3 }),
      );
      fruit.scale.y = kind === 0 ? 0.85 : 1;
      holder.add(fruit);
      if (kind === 0) {
        // 番茄的綠色小星星蒂頭
        const calyx = new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, r * 0.3, 5), stemMaterial);
        calyx.position.y = r * 0.85;
        calyx.rotation.x = Math.PI;
        holder.add(calyx);
      } else {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, r * 0.4, 5), stemMaterial);
        stem.position.y = r * 1.05;
        holder.add(stem);
        if (kind === 1) {
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 8, 6), stemMaterial);
          leaf.scale.set(1, 0.25, 0.5);
          leaf.position.set(r * 0.3, r * 1.05, 0);
          holder.add(leaf);
        }
      }
      content.add(holder);
      floaters.push({ obj: holder, baseY: holder.position.y, phase: 1 + i * 1.3, tilt: 0.15 });
    });
  }

  // ── 邊框上的一串綠葡萄 ──
  {
    const bunch = new THREE.Group();
    bunch.position.set(0.43, RIM_TOP + 0.02, -0.12);
    content.add(bunch);
    const grapeGeometry = new THREE.SphereGeometry(0.022, 10, 8);
    const layers = [7, 5, 3, 1];
    layers.forEach((count, layer) => {
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + layer;
        const r = count === 1 ? 0 : 0.025 + (count - 1) * 0.008;
        const grape = new THREE.Mesh(grapeGeometry, grapeMaterial);
        // 平躺在邊框上：越外圈越低，往 -z 拉長成一串
        grape.position.set(Math.cos(a) * r * 0.6, layer * 0.026, Math.sin(a) * r * 1.1);
        bunch.add(grape);
      }
    });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.08, 5), new THREE.MeshStandardMaterial({ color: 0x7a6040 }));
    stem.position.set(0, 0.1, -0.02);
    stem.rotation.x = 0.6;
    bunch.add(stem);
  }

  // ── 手壓幫浦：紅磚八角座＋深色木頭八角桶＋出水口＋長握把 ──
  const pump = new THREE.Group();
  pump.position.set(PUMP_X, 0, PUMP_Z);
  content.add(pump);
  // 紅磚座：八角柱、上下兩圈灰縫
  {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, BRICK_H, 8), brickMaterial);
    base.position.y = BRICK_H / 2;
    base.rotation.y = Math.PI / 8;
    pump.add(base);
    for (const y of [0.13, 0.26]) {
      const seam = new THREE.Mesh(new THREE.CylinderGeometry(0.287 - y * 0.08, 0.287 - y * 0.08, 0.012, 8), mortarMaterial);
      seam.position.y = y;
      seam.rotation.y = Math.PI / 8;
      pump.add(seam);
    }
    // 頂面一點點青苔
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.02, 8), mossMaterial);
    top.position.y = BRICK_H + 0.01;
    top.rotation.y = Math.PI / 8;
    pump.add(top);
  }
  // 木桶：上寬下窄的八角柱，上面一圈收邊
  const barrelBottom = BRICK_H + 0.02;
  {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, PUMP_H, 8), pumpMaterial);
    barrel.position.y = barrelBottom + PUMP_H / 2;
    barrel.rotation.y = Math.PI / 8;
    pump.add(barrel);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.17, 0.05, 8), pumpDarkMaterial);
    collar.position.y = barrelBottom + PUMP_H - 0.02;
    collar.rotation.y = Math.PI / 8;
    pump.add(collar);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 8), new THREE.MeshStandardMaterial({ color: 0x1e1c1a }));
    hole.position.y = barrelBottom + PUMP_H + 0.006;
    pump.add(hole);
    // 中間一根活塞桿：握把壓下去時跟著動
  }
  // 出水口：從桶子側面伸出來，往水槽方向（+z、-x）斜斜朝下
  const spoutDir = new THREE.Vector3(-0.35, -0.12, 1).normalize();
  const spoutStart = new THREE.Vector3(0, barrelBottom + PUMP_H * 0.62, 0);
  const spoutLength = 0.34;
  {
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, spoutLength, 12), pumpDarkMaterial);
    spout.quaternion.setFromUnitVectors(Y_AXIS, spoutDir);
    spout.position.copy(spoutStart).addScaledVector(spoutDir, spoutLength / 2 + 0.08);
    pump.add(spout);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 14), pumpDarkMaterial);
    lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spoutDir);
    lip.position.copy(spoutStart).addScaledVector(spoutDir, spoutLength + 0.08);
    pump.add(lip);
  }
  const spoutTip = spoutStart.clone().addScaledVector(spoutDir, spoutLength + 0.08).add(pump.position);
  // 握把：支點在桶頂邊緣，一根長鐵桿往右上斜伸出去，外段包橘色木頭
  const handlePivot = new THREE.Group();
  handlePivot.position.set(-0.06, barrelBottom + PUMP_H + 0.12, 0);
  pump.add(handlePivot);
  {
    // 支架：兩根短柱夾住支點
    for (const z of [-0.03, 0.03]) {
      pump.add(box(0.02, 0.16, 0.012, metalMaterial, -0.06, barrelBottom + PUMP_H + 0.06, z, 0.004));
    }
    const rodLength = 0.8;
    const rod = box(rodLength, 0.025, 0.025, metalMaterial, rodLength / 2 - 0.12, 0, 0, 0.008);
    handlePivot.add(rod);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 10), gripMaterial);
    grip.rotation.z = Math.PI / 2;
    grip.position.set(rodLength - 0.3, 0, 0);
    handlePivot.add(grip);
    // 活塞桿：從握把短端垂進桶子
    const piston = box(0.022, 0.22, 0.022, metalMaterial, -0.1, -0.11, 0, 0.006);
    handlePivot.add(piston);
  }
  // 出水口滴下來的水珠
  const drops = Array.from({ length: 3 }, (_, i) => {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), waterDropMaterial);
    drop.scale.y = 1.4;
    drop.castShadow = false;
    content.add(drop);
    return { mesh: drop, phase: i / 3 };
  });

  // ── 龜背芋：水槽左後方一叢，莖從地上長出來，大葉子往外張 ──
  const leaves: Array<{ pivot: THREE.Object3D; base: THREE.Euler; phase: number }> = [];
  {
    const plant = new THREE.Group();
    plant.position.set(-0.32, 0, -0.62);
    content.add(plant);
    const leafSpecs: Array<[number, number, number, number]> = [
      // 方位(rad)、莖長、仰角(rad)、葉子大小
      [-0.5, 0.72, 0.3, 0.52],
      [0.55, 0.62, 0.42, 0.48],
      [1.7, 0.55, 0.5, 0.42],
      [-1.5, 0.6, 0.5, 0.44],
      [2.8, 0.5, 0.55, 0.38],
      [0.05, 0.85, 0.12, 0.46],
    ];
    leafSpecs.forEach(([az, len, lean, size], i) => {
      const pivot = new THREE.Group();
      pivot.rotation.set(0, az, 0, 'YXZ');
      plant.add(pivot);
      const tilt = new THREE.Group();
      tilt.rotation.x = lean;
      pivot.add(tilt);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, len, 6), stemMaterial);
      stem.position.y = len / 2;
      tilt.add(stem);
      // 葉子：掛在莖頂，往外翻、葉尖朝外下垂
      const leafHolder = new THREE.Group();
      leafHolder.position.y = len;
      leafHolder.rotation.x = 0.25 + lean * 0.6;
      tilt.add(leafHolder);
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(size, size), leafMaterial);
      // 貼圖的葉柄在下緣中間：往上移，讓葉柄剛好接在莖頂
      leaf.position.y = size / 2 - 0.02;
      leafHolder.add(leaf);
      leaves.push({ pivot: tilt, base: tilt.rotation.clone(), phase: i * 1.7 });
    });
  }

  // ── 地上的石頭、草 ──
  {
    const rocks: Array<[number, number, number]> = [
      [0.5, 0.45, 0.09],
      [0.62, 0.32, 0.06],
      [-0.55, 0.42, 0.05],
      [0.62, -0.18, 0.08],
      [-0.08, 0.6, 0.04],
    ];
    rocks.forEach(([x, z, r], i) => {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMaterial);
      rock.scale.y = 0.65;
      rock.position.set(x, r * 0.4, z);
      rock.rotation.set(i, i * 2.1, 0);
      content.add(rock);
    });
    // 草：每一撮是幾片細長的三角葉，從同一點往外張
    const bladeGeometry = new THREE.BufferGeometry();
    bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.015, 0, 0, 0.015, 0, 0, 0, 1, 0], 3));
    bladeGeometry.computeVertexNormals();
    const tufts: Array<[number, number, number]> = [
      [0.56, 0.12, 0.2],
      [-0.52, 0.5, 0.16],
      [0.42, 0.58, 0.14],
      [-0.6, -0.1, 0.18],
      [0.7, -0.4, 0.15],
    ];
    tufts.forEach(([x, z, h], i) => {
      for (let k = 0; k < 5; k++) {
        const blade = new THREE.Mesh(bladeGeometry, grassMaterial);
        blade.scale.set(1, h * (0.7 + ((k * 37 + i * 11) % 10) / 25), 1);
        blade.position.set(x, 0, z);
        blade.rotation.set(0, (k / 5) * Math.PI * 2 + i, 0, 'YXZ');
        blade.rotateX(0.25 + (k % 2) * 0.2);
        content.add(blade);
      }
    });
  }

  // ── 水面閃光：幾顆小星星在水面上輪流亮 ──
  const starTexture = makeStarTexture();
  const sparkles = Array.from({ length: 5 }, (_, i) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: starTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
    );
    // Sprite 的射線判定需要 raycaster.camera，拖曳工具沒設定會報錯
    sprite.raycast = () => {};
    const a = i * 2.4;
    sprite.position.set(Math.cos(a) * 0.24, WATER_Y + 0.03, Math.sin(a) * 0.24);
    content.add(sprite);
    return { sprite, phase: i * 1.3 };
  });

  content.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.material === waterDropMaterial || mesh === water) {
      mesh.receiveShadow = true;
      return;
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  // 模型原始寬度（水槽＋右邊伸出去的握把）：size 設定的是整組的寬
  const modelWidth = 1.45;

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
    content.scale.setScalar(settings.size / modelWidth);
    applyColors();
  }

  applyPlacement();

  let time = 0;
  function update(deltaTime: number) {
    time += deltaTime;
    const glow = Math.max(0, settings.glow);
    // 水面流動
    rippleTexture.offset.set(time * 0.03, time * 0.05);
    // 彩虹慢慢流動，再跟著水面閃光呼吸
    waterMaterial.emissiveIntensity = (0.25 + 0.1 * Math.sin(time * 1.7)) * (0.5 + 0.5 * Math.min(2, glow));
    // 西瓜和水果跟著水面浮
    for (const f of floaters) {
      f.obj.position.y = f.baseY + Math.sin(time * 1.6 + f.phase) * 0.008;
      f.obj.rotation.x = Math.sin(time * 1.1 + f.phase) * f.tilt;
      f.obj.rotation.z = Math.cos(time * 0.9 + f.phase) * f.tilt;
    }
    // 握把：慢慢壓下去再抬起來（約 3 秒一次）
    const pumpCycle = (time / 3) % 1;
    const press = Math.sin(pumpCycle * Math.PI * 2);
    handlePivot.rotation.z = 0.32 + press * 0.12;
    // 水珠：從出水口掉進水槽
    for (const d of drops) {
      const t = (time * 0.9 + d.phase) % 1;
      d.mesh.position.set(spoutTip.x, spoutTip.y - 0.03 - t * t * (spoutTip.y - 0.03 - WATER_Y), spoutTip.z);
      d.mesh.visible = t < 0.98;
    }
    // 龜背芋葉子隨風晃
    for (const l of leaves) {
      l.pivot.rotation.x = l.base.x + Math.sin(time * 1.3 + l.phase) * 0.05;
      l.pivot.rotation.z = Math.sin(time * 0.9 + l.phase) * 0.04;
    }
    // 水面星星輪流閃
    for (const s of sparkles) {
      const on = Math.max(0, Math.sin(time * 2.2 + s.phase));
      s.sprite.material.opacity = on * on * Math.min(1, glow);
      s.sprite.scale.setScalar((0.04 + 0.06 * on) * (0.6 + 0.4 * glow));
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

export function formatMelonTroughSettingsForPaste(s: MelonTroughSettings) {
  return (
    `// 貼回 src/world/objects/melonTrough.ts 的 MELON_TROUGH_DEFAULT\n` +
    `export const MELON_TROUGH_DEFAULT: MelonTroughSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
    `  azimuthDegrees: ${s.azimuthDegrees},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  sink: ${s.sink.toFixed(3)},\n` +
    `  glow: ${s.glow.toFixed(2)},\n` +
    `  colors: {\n` +
    `    stone: '${s.colors.stone}',\n` +
    `    water: '${s.colors.water}',\n` +
    `    brick: '${s.colors.brick}',\n` +
    `    pump: '${s.colors.pump}',\n` +
    `    leaf: '${s.colors.leaf}',\n` +
    `  },\n` +
    `};`
  );
}
