import * as THREE from 'three';
import { makeGlowTexture, makeStarTexture } from './pigCoinShine';
import { SKIP_SPHERE_CONFORM } from './conformToSphere';

/**
 * 綠球上的中式小廟「點心樓」：圓形的中式樓閣，配合這個世界（食物、小豬金幣、粉嫩色調、Q 版造型）：
 *   - 台基是一個大竹蒸籠，屋簷下掛的不是燈籠而是包子
 *   - 屋頂寶頂是一枚會自轉、閃閃發光的方孔金幣（光暈和星星跟小豬背上的金幣同一套）
 *   - 紅色為主（番茄紅瓦、酒紅柱）、深紫屋脊、灰色石階；比例是 Q 版（短胖柱子、屋頂佔整棟一半以上），細節加粗減量
 * 整棟是圓的：圓牆、一圈六根柱子、兩層凸的圓屋頂（屋簷一圈起翹的尖角）。
 * 不用 GLB，整棟用程式拼出來：屋頂是自己算的格點曲面（凹曲屋面＋尖角起翹），
 * 磚紋、瓦片、門窗花紋都畫在 canvas 上當貼圖。
 *
 * 模型座標：+z 是正面（圓月門、台階那一側），y 朝上，台基底部在 y = 0。
 * 這裡只負責「長出模型」，不管擺在哪：它取代 bgRoom，掛進 bgRoom 那棟房子裡（obj.ts），
 * 位置、旋轉、大小、點選、名牌、「進入」、開場長出來都跟其他房子一樣由房子系統處理。
 */

const Y_AXIS = new THREE.Vector3(0, 1, 0);

export type ChineseTempleColors = {
  /** 琉璃瓦屋面 */
  roof: string;
  /** 柱子、門 */
  wood: string;
  /** 屋脊（每個屋角那條垂脊）＋封簷板（屋簷外緣一圈） */
  ridge: string;
  /** 白牆 */
  wall: string;
  /** 金色捲雲、柱礎、門框 */
  gold: string;
  /** 竹蒸籠台基 */
  steamer: string;
  /** 前方台階（石階） */
  stairs: string;
};

export type ChineseTempleSettings = {
  /** 屋簷下包子的擺動幅度（0 = 不動） */
  lanternSwing: number;
  colors: ChineseTempleColors;
};

export const CHINESE_TEMPLE_DEFAULT: ChineseTempleSettings = {
  lanternSwing: 1,
  // 紅色為主：番茄紅瓦（呼應外圍的番茄醬環）、柱子用深一階的酒紅；
  // 暖白牆、竹蒸籠的淺木色；金色維持飽和，讓金幣當焦點
  colors: {
    roof: '#e5473d',
    wood: '#a8232c',
    // 深紫：在一片紅瓦上壓出屋頂的輪廓，又不像金色那麼搶金幣的焦點
    ridge: '#573d53',
    wall: '#ff2e2e',
    gold: '#f6c343',
    steamer: '#e0b878',
    stairs: '#9a9fa5',
  },
};

// ───────────────────────── canvas 貼圖 ─────────────────────────

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return { canvas, context: canvas.getContext('2d')! };
}

function toTexture(canvas: HTMLCanvasElement, repeat = true) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/**
 * 琉璃瓦：灰階畫，顏色交給 material.color 乘上去（面板換色不必重畫）。
 * 一張圖 = 8 欄筒瓦 × 4 排；每片中間亮、兩側暗，下緣有一道半圓瓦頭的陰影。
 */
function createTileTexture() {
  const { canvas, context: g } = makeCanvas(256, 256);
  g.fillStyle = '#6c6c6c';
  g.fillRect(0, 0, 256, 256);
  const columns = 8;
  const rows = 4;
  const cw = 256 / columns;
  const rh = 256 / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // 每排錯開半片，看起來才像一片疊一片
      const x = column * cw + (row % 2) * (cw / 2);
      const y = row * rh;
      for (const offset of [0, -256]) {
        const left = x + offset;
        const gradient = g.createLinearGradient(left, 0, left + cw, 0);
        gradient.addColorStop(0, '#8a8a8a');
        gradient.addColorStop(0.45, '#f4f4f4');
        gradient.addColorStop(1, '#7a7a7a');
        g.fillStyle = gradient;
        g.beginPath();
        g.roundRect(left + 2, y + 2, cw - 4, rh - 2, cw * 0.45);
        g.fill();
        // 瓦頭下緣的陰影
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.beginPath();
        g.ellipse(left + cw / 2, y + rh - 2, cw * 0.42, 5, 0, 0, Math.PI);
        g.fill();
      }
    }
  }
  return toTexture(canvas);
}

/**
 * 竹蒸籠側面：一條條橫向竹篾，上下錯開的編織格子（一格亮、一格暗），篾和篾之間一道細縫。
 * 灰階畫，顏色由 material.color 決定（面板換色不必重畫）
 */
function createSteamerTexture() {
  const { canvas, context: g } = makeCanvas(256, 64);
  g.fillStyle = '#bdbdbd';
  g.fillRect(0, 0, 256, 64);
  const rows = 4;
  const columns = 8;
  const rh = 64 / rows;
  const cw = 256 / columns;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      // 編織：每排錯開一格，亮暗交替
      const light = (row + column) % 2 === 0;
      const gradient = g.createLinearGradient(0, row * rh, 0, row * rh + rh);
      gradient.addColorStop(0, light ? '#ffffff' : '#d8d8d8');
      gradient.addColorStop(1, light ? '#dedede' : '#b4b4b4');
      g.fillStyle = gradient;
      g.beginPath();
      g.roundRect(column * cw + 1, row * rh + 1, cw - 2, rh - 2, 4);
      g.fill();
    }
  }
  return toTexture(canvas);
}

/** 圓月門：紅底、金框、上半部方格窗花、中間門縫、兩顆門環。依面板顏色重畫 */
function drawDoor(canvas: HTMLCanvasElement, wood: string, gold: string) {
  const g = canvas.getContext('2d')!;
  const s = canvas.width;
  const c = s / 2;
  g.clearRect(0, 0, s, s);
  g.fillStyle = wood;
  g.fillRect(0, 0, s, s);
  // 暗一點的內圈，門板才有厚度感
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.arc(c, c, s * 0.42, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = wood;
  g.beginPath();
  g.arc(c, c, s * 0.4, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = gold;
  g.lineWidth = s * 0.018;
  // 上半部窗花：兩扇門各一格「回」字
  for (const sign of [-1, 1]) {
    const x = c + sign * s * 0.17 - s * 0.11;
    const y = s * 0.2;
    g.strokeRect(x, y, s * 0.22, s * 0.22);
    g.strokeRect(x + s * 0.05, y + s * 0.05, s * 0.12, s * 0.12);
    g.beginPath();
    g.moveTo(x + s * 0.11, y);
    g.lineTo(x + s * 0.11, y + s * 0.05);
    g.stroke();
    // 下半部門板的橫條
    g.strokeRect(c + sign * s * 0.17 - s * 0.1, s * 0.56, s * 0.2, s * 0.16);
  }
  // 門縫
  g.strokeStyle = 'rgba(40,10,5,0.75)';
  g.lineWidth = s * 0.012;
  g.beginPath();
  g.moveTo(c, 0);
  g.lineTo(c, s);
  g.stroke();
  // 門環
  g.fillStyle = gold;
  for (const sign of [-1, 1]) {
    g.beginPath();
    g.arc(c + sign * s * 0.05, s * 0.5, s * 0.025, 0, Math.PI * 2);
    g.fill();
  }
}

/** 圓窗：暗暖色的室內＋十字窗櫺 */
function drawWindow(canvas: HTMLCanvasElement, wood: string, wall: string) {
  const g = canvas.getContext('2d')!;
  const s = canvas.width;
  g.fillStyle = '#3b2a22';
  g.fillRect(0, 0, s, s);
  // 室內透一點暖光
  const glow = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  glow.addColorStop(0, 'rgba(255,200,120,0.55)');
  glow.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = wall;
  g.lineWidth = s * 0.07;
  g.beginPath();
  g.moveTo(s / 2, 0);
  g.lineTo(s / 2, s);
  g.moveTo(0, s / 2);
  g.lineTo(s, s / 2);
  g.stroke();
  g.strokeStyle = wood;
  g.lineWidth = s * 0.1;
  g.beginPath();
  g.arc(s / 2, s / 2, s * 0.45, 0, Math.PI * 2);
  g.stroke();
}

// ───────────────────────── 圓形屋頂曲面 ─────────────────────────

type RoundRoofShape = {
  /** 屋簷半徑 */
  radius: number;
  /** 屋頂中心比屋簷高多少 */
  height: number;
  /**
   * 屋面弧度：0 = 直坡（圓錐）；正數 = 往下凹（上陡下緩，傳統「舉折」）；
   * 負數 = 往外凸（上緩下陡，像圓頂饅頭），-1 是最凸、再小坡面會在簷口往回折
   */
  sag: number;
  /** 屋簷一圈有幾個起翹的尖角 */
  tipCount: number;
  /** 第一個尖角的方位（弧度，0 = 正前方 +z） */
  tipPhase: number;
  /** 尖角往上翹多少 */
  tipLift: number;
  /** 尖角往外甩出去多少（比例） */
  tipFlare: number;
  /** 越大尖角越尖、兩個尖角之間的簷口越平 */
  tipSharpness: number;
  /** 曲面從哪裡開始（0 = 尖頂；一樓屋簷中間被二樓蓋住，不用從中心長） */
  innerT: number;
};

type RoundRoofSample = { x: number; y: number; z: number; tip: number };

/** 這個方位有多靠近尖角：尖角正上方 = 1，兩個尖角正中間 = 0 */
function tipWeight(s: RoundRoofShape, theta: number) {
  return ((1 + Math.cos(s.tipCount * (theta - s.tipPhase))) / 2) ** s.tipSharpness;
}

/** theta = 方位角（0 = +z，往 +x 轉），t = 離中心多遠（0 = 頂、1 = 屋簷） */
function sampleRoundRoof(s: RoundRoofShape, theta: number, t: number): RoundRoofSample {
  const tip = tipWeight(s, theta);
  // 越靠近簷口起翹越明顯（t³），屋頂上半部維持平順的圓錐
  const edge = t ** 3;
  const r = s.radius * t * (1 + s.tipFlare * tip * edge);
  const fall = 1 - t;
  const y = s.height * (fall * (1 - s.sag) + fall * fall * s.sag) + s.tipLift * tip * edge;
  return { x: r * Math.sin(theta), y, z: r * Math.cos(theta), tip };
}

function toVector(sample: RoundRoofSample) {
  return new THREE.Vector3(sample.x, sample.y, sample.z);
}

function createRoundRoofGeometry(s: RoundRoofShape, segA = 96, segT = 28) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  // 一圈排幾欄瓦：貼圖一張 8 欄，取整數張才不會在接縫（theta = 2π）斷掉
  const repeatsAround = Math.max(2, Math.round((Math.PI * 2 * s.radius) / 1.6));
  const slope = Math.hypot(s.radius, s.height);
  for (let j = 0; j <= segT; j++) {
    const t = s.innerT + (1 - s.innerT) * (j / segT);
    for (let i = 0; i <= segA; i++) {
      const theta = (i / segA) * Math.PI * 2;
      const p = sampleRoundRoof(s, theta, t);
      positions.push(p.x, p.y, p.z);
      uvs.push((i / segA) * repeatsAround, (t * slope) / 0.9);
    }
  }
  const row = segA + 1;
  for (let j = 0; j < segT; j++) {
    for (let i = 0; i < segA; i++) {
      const a = j * row + i;
      const b = a + row;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function tubeAlong(points: THREE.Vector3[], radius: number, material: THREE.Material, closed = false, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(16, points.length * 3), radius, radial, closed), material);
}

/** 捲雲（渦卷）：平面阿基米德螺線，畫在 xy 平面上，正面朝 +z */
function createScroll(radius: number, tube: number, material: THREE.Material, mirror = false) {
  const turns = 1.5;
  const points: THREE.Vector3[] = [];
  const total = turns * Math.PI * 2;
  for (let k = 0; k <= 48; k++) {
    const theta = (k / 48) * total;
    const r = radius * (1 - (theta / total) * 0.82);
    const angle = -Math.PI / 2 + theta;
    points.push(new THREE.Vector3((mirror ? -1 : 1) * r * Math.cos(angle), r * Math.sin(angle), 0));
  }
  return tubeAlong(points, tube, material, false, 6);
}

/**
 * 方孔金幣（古錢）：圓餅中間挖一個方孔，外緣一圈凸起的邊、方孔周圍一圈凸起的框。
 * 立起來放：錢面朝 ±z，厚度沿 z。
 */
function createCoin(radius: number, thickness: number, material: THREE.Material) {
  const coin = new THREE.Group();
  const hole = radius * 0.28;
  const squareHole = (size: number) => {
    const path = new THREE.Path();
    path.moveTo(-size, -size);
    path.lineTo(-size, size);
    path.lineTo(size, size);
    path.lineTo(size, -size);
    path.lineTo(-size, -size);
    return path;
  };
  const extrude = (shape: THREE.Shape, depth: number) => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: depth * 0.2,
      bevelSize: radius * 0.02,
      bevelSegments: 2,
      curveSegments: 40,
    });
    // ExtrudeGeometry 從 z = 0 往 +z 長，移回中間才會以錢幣中心旋轉
    geometry.translate(0, 0, -depth / 2);
    return new THREE.Mesh(geometry, material);
  };
  // 錢身
  const body = new THREE.Shape();
  body.absarc(0, 0, radius * 0.86, 0, Math.PI * 2, false);
  body.holes.push(squareHole(hole));
  coin.add(extrude(body, thickness * 0.7));
  // 外緣凸邊
  const rim = new THREE.Shape();
  rim.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const rimHole = new THREE.Path();
  rimHole.absarc(0, 0, radius * 0.84, 0, Math.PI * 2, true);
  rim.holes.push(rimHole);
  coin.add(extrude(rim, thickness));
  // 方孔外框
  const frame = new THREE.Shape();
  frame.moveTo(-hole * 1.45, -hole * 1.45);
  frame.lineTo(hole * 1.45, -hole * 1.45);
  frame.lineTo(hole * 1.45, hole * 1.45);
  frame.lineTo(-hole * 1.45, hole * 1.45);
  frame.lineTo(-hole * 1.45, -hole * 1.45);
  frame.holes.push(squareHole(hole));
  coin.add(extrude(frame, thickness));
  return coin;
}

/**
 * 把平面（xy 平面、正面朝 +z）的門窗彎到半徑 radius 的圓牆上：
 * 每個頂點往 +z 推到牆面，門窗就貼著弧形牆，側面看不會有縫。
 */
function bendOntoWall(geometry: THREE.BufferGeometry, radius: number, offset: number) {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    position.setZ(i, position.getZ(i) + Math.sqrt(Math.max(0, radius * radius - x * x)) + offset);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

// ───────────────────────── 建築本體 ─────────────────────────

type CreateChineseTempleOptions = {
  /** 金色反射用的環境貼圖（建議用不染色的那張） */
  envMap?: THREE.Texture;
  layout?: ChineseTempleSettings;
};

export function createChineseTemple({
  envMap,
  layout = CHINESE_TEMPLE_DEFAULT,
}: CreateChineseTempleOptions) {
  // colors 另外複製：只用 { ...layout } 的話，面板改色會改到 CHINESE_TEMPLE_DEFAULT 本身
  const settings: ChineseTempleSettings = { ...layout, colors: { ...layout.colors } };
  const content = new THREE.Group();
  content.name = 'chinese_temple';
  // 掛進房子後不要被「貼球」：零件幾何都以自己中心為原點，貼球會把每個零件的下半部壓扁（見 conformToSphere.ts）
  content.userData[SKIP_SPHERE_CONFORM] = true;
  /** 屋頂寶頂上的金幣，update 時讓它慢慢轉 */
  let topCoin: THREE.Object3D | null = null;
  /** 金幣半徑：整棟的視覺焦點，做大一點 */
  const COIN_RADIUS = 0.26;
  /** 金幣的光暈＋星星（不跟著金幣轉） */
  const coinSparkle = new THREE.Group();
  coinSparkle.name = 'chinese_temple_coin_sparkle';

  // ── 材質 ──
  const tileTexture = createTileTexture();
  const steamerTexture = createSteamerTexture();
  // 蒸籠一圈的竹編數：圓周長 ≈ 9.7，一張貼圖寬度約 1 單位
  steamerTexture.repeat.set(10, 1);
  const doorCanvas = makeCanvas(256, 256).canvas;
  const windowCanvas = makeCanvas(128, 128).canvas;
  const doorTexture = toTexture(doorCanvas, false);
  const windowTexture = toTexture(windowCanvas, false);

  const roofMaterial = new THREE.MeshStandardMaterial({ map: tileTexture, roughness: 0.5, metalness: 0.02 });
  const roofUnderMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.BackSide });
  const tileEndMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55 });
  const woodMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const wallMaterial = new THREE.MeshStandardMaterial({ roughness: 0.92 });
  const goldMaterial = new THREE.MeshStandardMaterial({ metalness: 0.6, roughness: 0.32, envMap, envMapIntensity: 0.8 });
  // 屋頂的金幣：比一般金飾更亮，還會自己發光（做法同小豬背上的金幣）
  const coinMaterial = new THREE.MeshStandardMaterial({
    metalness: 0.55,
    roughness: 0.22,
    envMap,
    envMapIntensity: 1.4,
    emissive: 0xffcc33,
    emissiveIntensity: 0.45,
  });
  const steamerSideMaterial = new THREE.MeshStandardMaterial({ map: steamerTexture, roughness: 0.85 });
  const steamerRimMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const steamerTopMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const stairsMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95 });
  const ridgeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55 });
  const doorMaterial = new THREE.MeshStandardMaterial({ map: doorTexture, roughness: 0.6 });
  const windowMaterial = new THREE.MeshStandardMaterial({ map: windowTexture, roughness: 0.7 });
  // 包子：白白軟軟、粗糙不反光；頂上一點粉紅
  const bunMaterial = new THREE.MeshStandardMaterial({ color: 0xfff4e6, roughness: 0.95 });
  const bunDotMaterial = new THREE.MeshStandardMaterial({ color: 0xf58aa6, roughness: 0.8 });
  const cordMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 1 });

  let drawnColorKey = '';
  function applyColors() {
    const c = settings.colors;
    roofMaterial.color.set(c.roof);
    // 屋簷底面、瓦當用同一個色相但暗一些，抬頭看屋簷才有陰影感
    roofUnderMaterial.color.set(c.roof).multiplyScalar(0.55);
    tileEndMaterial.color.set(c.roof).multiplyScalar(0.88);
    woodMaterial.color.set(c.wood);
    ridgeMaterial.color.set(c.ridge);
    stairsMaterial.color.set(c.stairs);
    wallMaterial.color.set(c.wall);
    goldMaterial.color.set(c.gold);
    // 金幣再往亮黃靠一點：暖色燈光下純金色會偏橘
    coinMaterial.color.set(c.gold).lerp(new THREE.Color(0xffe36b), 0.5);
    steamerSideMaterial.color.set(c.steamer);
    // 竹片框邊比竹編深一點，台面（蒸籠底的竹片）淺一點
    steamerRimMaterial.color.set(c.steamer).multiplyScalar(0.82);
    steamerTopMaterial.color.set(c.steamer).lerp(new THREE.Color(0xffffff), 0.25);
    // 門窗的花紋要重畫 canvas，顏色沒變就不重畫（拖拉滑桿時每格都會呼叫）
    const key = `${c.wood}|${c.gold}|${c.wall}`;
    if (key !== drawnColorKey) {
      drawnColorKey = key;
      drawDoor(doorCanvas, c.wood, c.gold);
      drawWindow(windowCanvas, c.wood, c.wall);
      doorTexture.needsUpdate = true;
      windowTexture.needsUpdate = true;
    }
  }

  function add(mesh: THREE.Mesh, x = 0, y = 0, z = 0) {
    mesh.position.set(x, y, z);
    content.add(mesh);
    return mesh;
  }

  // ── 台基：一個大竹蒸籠（側面竹編、上下兩圈竹片框邊）＋前方三階灰色石階 ──
  const BASE_R = 1.55;
  const BASE_H = 0.3;
  const RIM_H = 0.07;
  const FLOOR = BASE_H;
  // CylinderGeometry 的材質順序：側面、頂面、底面
  add(new THREE.Mesh(new THREE.CylinderGeometry(BASE_R, BASE_R, BASE_H, 64), [steamerSideMaterial, steamerTopMaterial, steamerTopMaterial]), 0, BASE_H / 2, 0);
  // 上下兩圈框邊稍微凸出來，蒸籠的輪廓才出得來
  add(new THREE.Mesh(new THREE.CylinderGeometry(BASE_R + 0.04, BASE_R + 0.04, RIM_H, 64), steamerRimMaterial), 0, BASE_H - RIM_H / 2 + 0.01, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(BASE_R + 0.04, BASE_R + 0.04, RIM_H, 64), steamerRimMaterial), 0, RIM_H / 2, 0);
  const STEP_COUNT = 3;
  const STEP_DEPTH = 0.16;
  for (let i = 0; i < STEP_COUNT; i++) {
    const h = (FLOOR * (STEP_COUNT - i)) / (STEP_COUNT + 1);
    // 第一階往台基裡多伸一點，蓋住圓弧邊和方台階之間的縫
    const depth = STEP_DEPTH + (i === 0 ? 0.12 : 0);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.85, h, depth), stairsMaterial), 0, h / 2, BASE_R + STEP_DEPTH * (i + 0.5) - (i === 0 ? 0.04 : 0));
  }

  // ── 一樓圓牆 ──
  const WALL_R = 0.95;
  const WALL_H = 0.85;
  add(new THREE.Mesh(new THREE.CylinderGeometry(WALL_R, WALL_R, WALL_H, 48), wallMaterial), 0, FLOOR + WALL_H / 2, 0);
  // 牆腳一圈紅色踢腳
  add(new THREE.Mesh(new THREE.CylinderGeometry(WALL_R + 0.02, WALL_R + 0.02, 0.1, 48), woodMaterial), 0, FLOOR + 0.05, 0);

  // 圓月門（彎成牆面的弧度）
  const DOOR_R = 0.32;
  const doorY = FLOOR + DOOR_R + 0.02;
  add(new THREE.Mesh(bendOntoWall(new THREE.CircleGeometry(DOOR_R, 40), WALL_R, 0.006), doorMaterial), 0, doorY, 0);
  add(new THREE.Mesh(bendOntoWall(new THREE.TorusGeometry(DOOR_R, 0.05, 8, 40), WALL_R, 0.012), goldMaterial), 0, doorY, 0);

  // 圓窗：門的左右前方、左右側面、後面
  for (const angle of [-60, 60, -120, 120, 180]) {
    const yaw = THREE.MathUtils.degToRad(angle);
    const y = FLOOR + 0.46;
    add(new THREE.Mesh(bendOntoWall(new THREE.CircleGeometry(0.14, 28), WALL_R, 0.006), windowMaterial), 0, y, 0).rotation.y = yaw;
    add(new THREE.Mesh(bendOntoWall(new THREE.TorusGeometry(0.14, 0.035, 6, 28), WALL_R, 0.012), woodMaterial), 0, y, 0).rotation.y = yaw;
  }

  // ── 柱子：一圈六根，短短胖胖（Q 版比例）；錯開正前方，才不會擋住圓月門 ──
  const COLUMN_TOP = FLOOR + WALL_H + 0.02;
  const COLUMN_H = COLUMN_TOP - FLOOR;
  const COLUMN_R = 1.4;
  const COLUMN_COUNT = 6;
  const COLUMN_PHASE = Math.PI / COLUMN_COUNT;
  for (let k = 0; k < COLUMN_COUNT; k++) {
    const theta = COLUMN_PHASE + (k / COLUMN_COUNT) * Math.PI * 2;
    const x = COLUMN_R * Math.sin(theta);
    const z = COLUMN_R * Math.cos(theta);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.135, COLUMN_H, 16), woodMaterial), x, FLOOR + COLUMN_H / 2, z);
    // 柱礎：金色鼓形
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 18), goldMaterial), x, FLOOR + 0.06, z);
    // 柱頭：金色斗栱，朝向圓心
    add(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.3), goldMaterial), x, COLUMN_TOP - 0.06, z).rotation.y = theta;
  }

  // ── 一樓圓屋簷：六個尖角對齊六根柱子 ──
  const lowerRoof: RoundRoofShape = {
    radius: 1.7,
    // 矮一點：凸屋面越高，柱子那一圈到簷口的落差越大，屋簷就得壓得越低、把圓月門擋住
    height: 0.55,
    // 一樓只露出外圈（中間被二樓蓋住），要用最凸的 -1 才看得出鼓起來
    sag: -1,
    tipCount: COLUMN_COUNT,
    tipPhase: COLUMN_PHASE,
    // 翹角收小：簷口往上翹太多，會讓鼓起來的屋面看起來又像凹的
    tipLift: 0.1,
    tipFlare: 0.06,
    tipSharpness: 6,
    innerT: 0.3,
  };
  // 凸屋面在柱子那一圈離簷口還有一段高度，整座屋簷往下放，柱頭才頂得到屋簷底
  const LOWER_ROOF_Y = COLUMN_TOP - 0.12;
  const lowerRoofGroup = new THREE.Group();
  lowerRoofGroup.position.y = LOWER_ROOF_Y;
  content.add(lowerRoofGroup);
  buildRoof(lowerRoofGroup, lowerRoof, false);

  // ── 二樓：小一號的圓樓＋大大的尖頂圓屋頂（屋頂佔整棟一半以上，Q 版比例） ──
  const UPPER_R = 0.6;
  const UPPER_BOTTOM = LOWER_ROOF_Y + 0.4;
  const UPPER_H = 0.42;
  const UPPER_TOP = UPPER_BOTTOM + UPPER_H;
  add(new THREE.Mesh(new THREE.CylinderGeometry(UPPER_R, UPPER_R, UPPER_H, 40), wallMaterial), 0, UPPER_BOTTOM + UPPER_H / 2, 0);
  for (const angle of [0, 90, 180, 270]) {
    const yaw = THREE.MathUtils.degToRad(angle);
    const y = UPPER_TOP - 0.17;
    add(new THREE.Mesh(bendOntoWall(new THREE.CircleGeometry(0.1, 24), UPPER_R, 0.006), windowMaterial), 0, y, 0).rotation.y = yaw;
    add(new THREE.Mesh(bendOntoWall(new THREE.TorusGeometry(0.1, 0.03, 6, 24), UPPER_R, 0.012), woodMaterial), 0, y, 0).rotation.y = yaw;
  }

  const upperRoof: RoundRoofShape = {
    radius: 1.25,
    height: 1.0,
    sag: -0.7,
    tipCount: 6,
    tipPhase: 0,
    tipLift: 0.14,
    tipFlare: 0.06,
    tipSharpness: 5,
    innerT: 0,
  };
  const upperRoofGroup = new THREE.Group();
  upperRoofGroup.position.y = UPPER_TOP;
  content.add(upperRoofGroup);
  buildRoof(upperRoofGroup, upperRoof, true);

  /**
   * 一座圓屋頂：瓦面＋底面＋粗粗的封簷板＋金線＋大圓點瓦當＋每個尖角一條垂脊。
   * 細節都加粗、數量減少：整棟在球上只有 0.2 大小，太細的東西遠看會糊成雜訊。
   * withFinial = false（一樓）：尖角上放金色捲雲；true（二樓）：不放捲雲，正中央立一枚會發光的金幣
   */
  function buildRoof(group: THREE.Group, s: RoundRoofShape, withFinial: boolean) {
    const geometry = createRoundRoofGeometry(s);
    group.add(new THREE.Mesh(geometry, roofMaterial));
    const under = new THREE.Mesh(geometry, roofUnderMaterial);
    under.position.y = -0.06;
    group.add(under);

    // 屋簷外緣一圈：粗的封簷板＋下方一條金線，順便蓋住瓦面和底面之間的縫
    const rim: THREE.Vector3[] = [];
    const rimCount = 128;
    for (let k = 0; k < rimCount; k++) rim.push(toVector(sampleRoundRoof(s, (k / rimCount) * Math.PI * 2, 1)));
    // 封簷板跟屋脊同色：屋頂的輪廓線（簷口一圈＋每條垂脊）整套用同一個顏色
    const fascia = tubeAlong(rim, 0.07, ridgeMaterial, true, 10);
    fascia.position.y = -0.03;
    group.add(fascia);
    const goldLine = tubeAlong(rim, 0.025, goldMaterial, true);
    goldLine.position.y = -0.1;
    group.add(goldLine);

    // 瓦當：簷口下一排大圓點，面朝外；尖角起翹的地方不放
    const tileEndGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.04, 16);
    tileEndGeometry.rotateX(Math.PI / 2);
    const placements: { position: THREE.Vector3; yaw: number }[] = [];
    const tileEndCount = Math.floor((Math.PI * 2 * s.radius) / 0.24);
    for (let k = 0; k < tileEndCount; k++) {
      const theta = (k / tileEndCount) * Math.PI * 2;
      const p = sampleRoundRoof(s, theta, 1);
      if (p.tip > 0.3) continue;
      placements.push({ position: new THREE.Vector3(p.x, p.y - 0.15, p.z), yaw: theta });
    }
    const tileEnds = new THREE.InstancedMesh(tileEndGeometry, tileEndMaterial, placements.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const unit = new THREE.Vector3(1, 1, 1);
    placements.forEach(({ position, yaw }, index) => {
      rotation.setFromAxisAngle(Y_AXIS, yaw);
      tileEnds.setMatrixAt(index, matrix.compose(position, rotation, unit));
    });
    group.add(tileEnds);

    // 每個尖角：一條粗的深紫垂脊從屋頂往下順到尖角（在一片紅瓦上勾出屋頂輪廓）；一樓的尖角上再放金色捲雲（面朝外）
    for (let k = 0; k < s.tipCount; k++) {
      const theta = s.tipPhase + (k / s.tipCount) * Math.PI * 2;
      const points: THREE.Vector3[] = [];
      const start = Math.max(s.innerT, 0.06);
      for (let n = 0; n <= 16; n++) points.push(toVector(sampleRoundRoof(s, theta, start + (1 - start) * (n / 16))));
      const rib = tubeAlong(points, 0.055, ridgeMaterial, false, 10);
      rib.position.y = 0.02;
      group.add(rib);
      if (!withFinial) {
        const tip = sampleRoundRoof(s, theta, 1);
        const scroll = createScroll(0.17, 0.035, goldMaterial, k % 2 === 1);
        scroll.position.set(tip.x, tip.y + 0.16, tip.z);
        scroll.rotation.y = theta;
        group.add(scroll);
      }
    }

    if (withFinial) {
      // 寶頂：紅色底座＋金色短柱，上面立一枚方孔金幣（會慢慢自轉、閃閃發光）
      const top = s.height;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.1, 18), woodMaterial);
      base.position.y = top + 0.02;
      group.add(base);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 10), goldMaterial);
      post.position.y = top + 0.1;
      group.add(post);
      const coinCenterY = top + 0.14 + COIN_RADIUS;
      const coin = createCoin(COIN_RADIUS, 0.06, coinMaterial);
      coin.position.y = coinCenterY;
      group.add(coin);
      topCoin = coin;
      coinSparkle.position.y = coinCenterY;
      group.add(coinSparkle);
    }
  }

  // ── 金幣閃光：背後一圈光暈＋四顆輪流閃的四角星（貼圖跟小豬金幣共用） ──
  // 光暈、星星不跟著金幣轉（Sprite 本來就永遠面向鏡頭），所以掛在金幣旁邊的獨立 group
  const coinGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    }),
  );
  coinGlow.scale.setScalar(COIN_RADIUS * 4.2);
  coinSparkle.add(coinGlow);
  const starTexture = makeStarTexture();
  const coinStars = Array.from({ length: 4 }, (_, i) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: starTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    // 金幣繞直立軸轉，星星散在金幣四周（上下左右、前後錯開），哪個角度看都有星星
    const angle = (i / 4) * Math.PI * 2 + 0.6;
    sprite.position.set(Math.cos(angle) * COIN_RADIUS * 1.3, Math.sin(angle) * COIN_RADIUS * 1.3, (i % 2 ? 1 : -1) * COIN_RADIUS * 0.4);
    coinSparkle.add(sprite);
    return { sprite, phase: i * 1.7, speed: 2.2 + i * 0.55, baseSize: COIN_RADIUS * (1.4 + (i % 2) * 0.5) };
  });
  // Sprite 的射線判定需要 raycaster.camera，拖曳工具沒有設定會報錯；光暈、星星本來也不該被點到
  coinSparkle.traverse((child) => {
    child.raycast = () => {};
  });

  // ── 包子：取代燈籠，掛在一樓屋簷正面左右兩個尖角下，會輕輕晃 ──
  const buns: THREE.Group[] = [];
  {
    const BUN_R = 0.21;
    const bodyGeometry = new THREE.SphereGeometry(BUN_R, 24, 16);
    // 包子頂上的褶子：一圈小小的橢圓球，往中心收
    const pleatGeometry = new THREE.SphereGeometry(BUN_R * 0.22, 10, 8);
    const dotGeometry = new THREE.SphereGeometry(BUN_R * 0.16, 10, 8);
    const CORD = 0.16;
    for (const theta of [COLUMN_PHASE, -COLUMN_PHASE]) {
      const tip = sampleRoundRoof(lowerRoof, theta, 0.95);
      const pivot = new THREE.Group();
      pivot.position.set(tip.x, LOWER_ROOF_Y + tip.y - 0.1, tip.z);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, CORD, 5), cordMaterial);
      cord.position.y = -CORD / 2;
      pivot.add(cord);
      const bun = new THREE.Group();
      bun.position.y = -CORD - BUN_R * 0.75;
      pivot.add(bun);
      // 底部壓扁、上面圓鼓：包子的形
      const body = new THREE.Mesh(bodyGeometry, bunMaterial);
      body.scale.set(1, 0.78, 1);
      bun.add(body);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const pleat = new THREE.Mesh(pleatGeometry, bunMaterial);
        pleat.position.set(Math.sin(a) * BUN_R * 0.25, BUN_R * 0.74, Math.cos(a) * BUN_R * 0.25);
        pleat.scale.set(0.7, 0.8, 1.6);
        pleat.rotation.y = a;
        bun.add(pleat);
      }
      const dot = new THREE.Mesh(dotGeometry, bunDotMaterial);
      dot.position.y = BUN_R * 0.86;
      bun.add(dot);
      content.add(pivot);
      buns.push(pivot);
    }
  }

  content.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  applyColors();

  let time = 0;
  function update(deltaTime: number) {
    time += deltaTime;
    // 金幣繞直立軸慢慢轉（約 6 秒一圈），從各個方向都看得到正面的方孔
    if (topCoin) topCoin.rotation.y = time * 1.05;
    // 金幣自發光像呼吸，光暈跟著一起明暗（數值同小豬的金幣）
    coinMaterial.emissiveIntensity = 0.45 + 0.2 * Math.sin(time * 3.1);
    coinGlow.material.opacity = 0.55 + 0.25 * Math.sin(time * 3.1);
    for (const star of coinStars) {
      // max(0, sin)^3：大部分時間是暗的，偶爾「叮」一下亮起來
      const t = Math.max(0, Math.sin(time * star.speed + star.phase));
      const flash = t * t * t;
      star.sprite.material.opacity = flash;
      star.sprite.scale.setScalar(star.baseSize * (0.4 + 0.8 * flash));
      star.sprite.material.rotation = time * 0.8 + star.phase;
    }
    const swing = Math.max(0, settings.lanternSwing);
    buns.forEach((bun, index) => {
      bun.rotation.z = Math.sin(time * 1.5 + index * 1.9) * 0.12 * swing;
      bun.rotation.x = Math.sin(time * 1.1 + index * 2.7) * 0.06 * swing;
    });
  }

  return {
    /** 模型本體：台基底部中心在原點、+z 是正面，直接塞進房子的長方體範圍 */
    object: content,
    settings,
    /** 面板改色、改包子擺動後呼叫 */
    applySettings: applyColors,
    /** 每幀呼叫：金幣自轉閃光、包子晃動 */
    update,
  };
}

export function formatChineseTempleSettingsForPaste(s: ChineseTempleSettings) {
  return (
    `// 貼回 src/world/objects/chineseTemple.ts 的 CHINESE_TEMPLE_DEFAULT（位置、大小在 obj.ts 的 bgRoom 設定）\n` +
    `export const CHINESE_TEMPLE_DEFAULT: ChineseTempleSettings = {\n` +
    `  lanternSwing: ${s.lanternSwing.toFixed(2)},\n` +
    `  colors: {\n` +
    (Object.keys(s.colors) as (keyof ChineseTempleColors)[]).map((key) => `    ${key}: '${s.colors[key]}',\n`).join('') +
    `  },\n` +
    `};`
  );
}
