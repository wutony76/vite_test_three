import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeGlowTexture, makeStarTexture } from './pigCoinShine';
import { SKIP_SPHERE_CONFORM } from './conformToSphere';

/**
 * 綠球上的「柑仔店」：台灣巷口那種賣零食、汽水、糖果的小雜貨店，兩層樓＋一塊餅乾地磚台座。
 *   - 一樓：正面（+z）左半邊是開著的店面：紅白條紋遮雨棚、紅色「柑仔店」橫招牌，
 *           裡面一整面零食貨架（發光的貨架圖），櫃台上擺一排玻璃糖果罐，遮雨棚下掛一串零食包；
 *           右側面（+x）是木頭牆＋亮著燈的格子窗，上面一小片藍色屋瓦
 *   - 二樓：粉藍色牆，左前角是圓角（ExtrudeGeometry 把「圓角矩形」往上擠出來），大窗戶看得到裡面的房間，
 *           側面一個圓形通風口、牆上掛冷氣室外機
 *   - 屋頂：一個超大的玻璃糖果罐（紅蓋子、裡面裝滿彩色糖球），旁邊插一支棒棒糖
 *   - 左上角一塊黃色直立燈箱「古早味」；右邊電線桿掛著「地下道」燈箱，電線垂到屋頂
 *   - 背面（-z）：一片金光閃閃的金色布棚，從二樓垂到一樓、微微往外鼓，上面一個紅色大「彩」字，旁邊有光暈和輪流閃的星星
 *   - 地上：紅色塑膠矮凳、扭蛋機兩台、一箱彈珠汽水、「冰」字立牌、往下走的地下道樓梯
 * 招牌、窗戶都是自發光材質（emissive），亮度跟著 glow 設定；「柑仔店」招牌偶爾會「閃一下」像老燈管。
 *
 * 配色刻意跟綠球上其他房子錯開（紅色點心樓、奶油紫屋頂的主屋、綠色的電 • 波 • 町）：
 *   主色是粉藍（二樓）＋番茄紅（招牌、遮雨棚）＋奶油白（一樓），點綴黃色燈箱、深藍屋瓦，
 *   是很「懷舊雜貨店」的配色，在一片暖色裡會跳出來。
 *   所有方塊都是圓角（RoundedBoxGeometry），樓板有圓邊；地磚是「蘇打餅乾」，每塊有一排小洞。
 *
 * 這裡只做「外觀」：它是 twRoom 那棟房子的模型（取代原本的 twhall），
 * 位置、旋轉、大小都在房子面板調（點選 twRoom 就會出現），這裡只管顏色和發光。
 *
 * 模型座標：+z 是店面那面，+x 是木窗那面，y 朝上，台座底部在 y = 0，台座寬約 2.5。
 */


export type CandyShopColors = {
  /** 二樓牆、樓板 */
  wall: string;
  /** 一樓木頭牆、櫃台 */
  wood: string;
  /** 遮雨棚、橫招牌、塑膠椅（紅白條紋的紅） */
  awning: string;
  /** 側面小屋瓦 */
  roofTile: string;
  /** 地磚台座 */
  pavement: string;
  /** 直立燈箱的顏色 */
  sign: string;
};

export type CandyShopSettings = {
  /** 招牌、窗戶的發光強度（0 = 全部關燈） */
  glow: number;
  colors: CandyShopColors;
};

export const CANDY_SHOP_DEFAULT: CandyShopSettings = {
  glow: 1,
  colors: {
    wall: '#9fd3ef',
    wood: '#f6e2b8',
    awning: '#e8473f',
    roofTile: '#3f7fc0',
    pavement: '#f1d29a',
    sign: '#ffd94a',
  },
};

// ───────────────────────── 尺寸 ─────────────────────────

/** 台座厚度：要夠厚，地鐵樓梯才挖得下去 */
const BASE_H = 0.22;
/** 台座一格地磚的大小 */
const TILE = 0.5;
/** 建築半寬（x、z 都一樣） */
const HALF = 0.6;
const GROUND_FLOOR_H = 0.8;
const SLAB_H = 0.1;
const UPPER_H = 0.65;
const ROOF_SLAB_H = 0.07;
const FLOOR1_TOP = BASE_H + GROUND_FLOOR_H;
const UPPER_BOTTOM = FLOOR1_TOP + SLAB_H;
const UPPER_TOP = UPPER_BOTTOM + UPPER_H;
const ROOF_TOP = UPPER_TOP + ROOF_SLAB_H;
/** 開放店面佔一樓正面的 x 範圍 */
const COUNTER_X0 = -HALF;
const COUNTER_X1 = 0.12;
/** 地鐵入口挖洞的範圍 */
const SUBWAY = { x0: 0.8, x1: 1.2, z0: -0.05, z1: 0.95 };
/** 電線桿位置 */
const POLE = new THREE.Vector3(1.0, BASE_H, -0.62);
const POLE_H = 2.1;

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

const FONT = '"PingFang TC", "Hiragino Sans", "Noto Sans TC", "Noto Sans JP", "Microsoft JhengHei", sans-serif';

/**
 * 招牌字：黑底白字，當 emissiveMap 用（白的地方發光、黑的地方不發光），
 * 招牌本體的顏色另外由材質 color 決定。vertical = 直書（一個字一行）。
 */
function createSignTexture(text: string, width: number, height: number, vertical: boolean, background = '#000', ink = '#fff') {
  const { canvas, g } = makeCanvas(width, height);
  g.fillStyle = background;
  g.fillRect(0, 0, width, height);
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (vertical) {
    const chars = [...text];
    const step = height / (chars.length + 0.6);
    g.font = `700 ${Math.min(width * 0.72, step * 0.86)}px ${FONT}`;
    chars.forEach((char, i) => g.fillText(char, width / 2, step * (i + 0.8)));
  } else {
    g.font = `800 ${Math.min(height * 0.7, (width / [...text].length) * 0.95)}px ${FONT}`;
    g.fillText(text, width / 2, height * 0.54);
  }
  return toTexture(canvas);
}

/** 「地下道」燈箱：深藍底、左邊一個圓角方框裡畫往下的樓梯記號，字是暖黃色（這張直接當顏色＋發光用） */
function createSubwaySignTexture() {
  const { canvas, g } = makeCanvas(384, 128);
  g.fillStyle = '#23426b';
  g.fillRect(0, 0, 384, 128);
  g.strokeStyle = '#ffd66b';
  g.lineWidth = 9;
  g.beginPath();
  g.roundRect(22, 28, 72, 72, 16);
  g.stroke();
  g.fillStyle = '#ffd66b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 樓梯記號：三階往右下
  g.beginPath();
  g.moveTo(34, 50);
  g.lineTo(50, 50);
  g.lineTo(50, 66);
  g.lineTo(66, 66);
  g.lineTo(66, 82);
  g.lineTo(82, 82);
  g.stroke();
  g.font = `800 64px ${FONT}`;
  g.fillText('地下道', 236, 68);
  return toTexture(canvas);
}

/** 二樓大窗戶看進去的房間：藍白地磚、一張床、暖色的牆（整張也當發光圖，像房間開著燈） */
function createRoomTexture() {
  const { canvas, g } = makeCanvas(256, 192);
  // 牆
  g.fillStyle = '#f3e3c4';
  g.fillRect(0, 0, 256, 192);
  // 右邊一面黃色的牆
  g.fillStyle = '#f2c35a';
  g.fillRect(200, 0, 56, 192);
  // 地板：藍白格子，越往下越大（假透視）
  for (let row = 0; row < 4; row++) {
    const y0 = 118 + row * row * 6 + row * 6;
    const y1 = 118 + (row + 1) * (row + 1) * 6 + (row + 1) * 6;
    for (let col = 0; col < 10; col++) {
      g.fillStyle = (row + col) % 2 ? '#cfe3f3' : '#9fc1df';
      g.fillRect(col * 26, y0, 26, y1 - y0);
    }
  }
  // 床
  g.fillStyle = '#e9eef5';
  g.fillRect(70, 96, 150, 46);
  g.fillStyle = '#c9d6e8';
  g.fillRect(70, 132, 150, 14);
  g.fillStyle = '#ffffff';
  g.fillRect(186, 88, 30, 18);
  // 牆上的小燈
  const lamp = g.createRadialGradient(40, 40, 2, 40, 40, 40);
  lamp.addColorStop(0, 'rgba(255,240,200,1)');
  lamp.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = lamp;
  g.fillRect(0, 0, 90, 90);
  return toTexture(canvas);
}

/** 一樓店面裡面：三層木頭貨架，擺滿彩色零食包、汽水瓶、糖果罐（整張當發光圖，像店裡開著日光燈） */
function createShelfTexture() {
  const { canvas, g } = makeCanvas(256, 192);
  g.fillStyle = '#fff6e0';
  g.fillRect(0, 0, 256, 192);
  const colors = ['#ff5a5a', '#ffb02e', '#ffe04a', '#5ccf7a', '#4aa8ff', '#b07cff', '#ff7ab8'];
  let seed = 7;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let row = 0; row < 3; row++) {
    const shelfY = 58 + row * 62;
    // 層板
    g.fillStyle = '#b9824f';
    g.fillRect(0, shelfY, 256, 7);
    // 層板上的東西：零食包（方塊）、瓶子（細長）、罐子（圓）交錯
    let x = 6;
    while (x < 246) {
      const kind = Math.floor(rand() * 3);
      g.fillStyle = colors[Math.floor(rand() * colors.length)];
      if (kind === 0) {
        const w = 18 + rand() * 10;
        const h = 30 + rand() * 14;
        g.fillRect(x, shelfY - h, w, h);
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(x + 4, shelfY - h + 8, w - 8, 6);
        x += w + 4;
      } else if (kind === 1) {
        g.fillRect(x, shelfY - 40, 9, 40);
        g.fillRect(x + 2, shelfY - 48, 5, 8);
        x += 14;
      } else {
        g.beginPath();
        g.ellipse(x + 11, shelfY - 13, 11, 13, 0, 0, Math.PI * 2);
        g.fill();
        x += 26;
      }
    }
  }
  return toTexture(canvas);
}

/** 一樓木窗：暖白的燈光＋黑色格子窗櫺 */
function createWindowTexture() {
  const { canvas, g } = makeCanvas(96, 128);
  g.fillStyle = '#fff1cf';
  g.fillRect(0, 0, 96, 128);
  g.strokeStyle = '#3a2a20';
  g.lineWidth = 6;
  g.strokeRect(3, 3, 90, 122);
  g.lineWidth = 4;
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo((96 * i) / 4, 0);
    g.lineTo((96 * i) / 4, 128);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(0, 50);
  g.lineTo(96, 50);
  g.stroke();
  return toTexture(canvas);
}

/** 遮雨棚的直條紋：一條遮雨棚色、一條白色（改顏色時重畫同一張 canvas） */
function drawAwningStripes(canvas: HTMLCanvasElement, color: string) {
  const g = canvas.getContext('2d')!;
  const stripes = 8;
  const w = canvas.width / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#fff8f0' : color;
    g.fillRect(i * w, 0, w, canvas.height);
  }
}

/** 棒棒糖：白底上一圈一圈彩色螺旋 */
function createLollipopTexture() {
  const { canvas, g } = makeCanvas(128, 128);
  g.fillStyle = '#fffaf5';
  g.fillRect(0, 0, 128, 128);
  g.lineWidth = 10;
  g.lineCap = 'round';
  const colors = ['#ff5a7a', '#ffd23f', '#4ac3ff', '#7ee07a'];
  for (let c = 0; c < colors.length; c++) {
    g.strokeStyle = colors[c];
    g.beginPath();
    for (let k = 0; k <= 80; k++) {
      const a = (k / 80) * Math.PI * 4 + (c * Math.PI) / 2;
      const r = 2 + (k / 80) * 60;
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  return toTexture(canvas);
}

/** 金色布棚的布紋：兩種金色的直條紋（布棚的縫線感），當 map 用 */
function createGoldClothTexture() {
  const { canvas, g } = makeCanvas(128, 16);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#ffd970' : '#ffffff';
    g.fillRect(i * 16, 0, 16, 16);
  }
  return toTexture(canvas);
}

/** 紅色「彩」字：透明底、紅字、外圈一道奶油色描邊（金底上才分得清楚字的邊） */
function createCaiTexture() {
  const size = 256;
  const { canvas, g } = makeCanvas(size, size);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.font = `900 ${size * 0.8}px ${FONT}`;
  g.strokeStyle = '#fff3c4';
  g.lineWidth = 22;
  g.strokeText('彩', size / 2, size * 0.53);
  g.fillStyle = '#d81e1e';
  g.fillText('彩', size / 2, size * 0.53);
  return toTexture(canvas);
}

/** 「冰」字立牌：台灣冰店門口那種白底、紅色大「冰」字、下面一條藍色海浪 */
function createIceSignTexture() {
  const { canvas, g } = makeCanvas(128, 160);
  g.fillStyle = '#fffdf6';
  g.fillRect(0, 0, 128, 160);
  g.fillStyle = '#e8473f';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 92px ${FONT}`;
  g.fillText('冰', 64, 66);
  g.fillStyle = '#3f9be0';
  g.beginPath();
  g.moveTo(0, 160);
  for (let x = 0; x <= 128; x += 4) g.lineTo(x, 128 + Math.sin(x / 10) * 7);
  g.lineTo(128, 160);
  g.closePath();
  g.fill();
  return toTexture(canvas);
}

/** 地磚表面的細顆粒（灰白雜點），讓台座看起來像水泥磚不是塑膠 */
function createGrainTexture() {
  const { canvas, g } = makeCanvas(128, 128);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1400; i++) {
    const v = 190 + Math.floor(Math.random() * 60);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const texture = toTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// ───────────────────────── 小工具 ─────────────────────────

/** 圓角矩形（只有 (-x,+z) 那個角是圓的），shape 的 (x, s) 會對應到模型的 (x, -z) */
function createCornerRoundedShape(half: number, radius: number) {
  const shape = new THREE.Shape();
  // s = -z：所以 +z 那邊在 s = -half
  shape.moveTo(-half, -half + radius);
  shape.lineTo(-half, half);
  shape.lineTo(half, half);
  shape.lineTo(half, -half);
  shape.lineTo(-half + radius, -half);
  shape.quadraticCurveTo(-half, -half, -half, -half + radius);
  return shape;
}

/** 把圓角矩形往上擠出 height，底部在 y = bottom */
function createRoundedSlab(half: number, radius: number, height: number, bottom: number) {
  // 圓邊（bevel）：會往外長 bevel 這麼多、上下各厚 bevel，所以形狀先縮一圈、擠出深度先扣掉，總尺寸才不變
  const bevel = Math.min(0.03, height * 0.3);
  const geometry = new THREE.ExtrudeGeometry(createCornerRoundedShape(half - bevel, Math.max(0.01, radius - bevel)), {
    depth: Math.max(0.001, height - bevel * 2),
    bevelEnabled: bevel > 0.002,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });
  // 擠出方向是 +z，轉成 +y：(x, s, d) → (x, d, -s)
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bottom + bevel, 0);
  return geometry;
}

/** 圓角方塊：圓角半徑跟著最薄的那邊走（太薄的板子圓角太大會變形），整棟看起來軟軟的像玩具 */
function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
  const radius = Math.min(0.045, Math.min(width, height, depth) * 0.45);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, radius), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** 兩點之間的一條電線：中間往下垂（拋物線），用細管子畫 */
function createCable(from: THREE.Vector3, to: THREE.Vector3, sag: number, material: THREE.Material, radius = 0.008) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const p = from.clone().lerp(to, t);
    p.y -= sag * 4 * t * (1 - t);
    points.push(p);
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, radius, 5, false), material);
}

// ───────────────────────── 建立 ─────────────────────────

type CreateCandyShopOptions = {
  envMap?: THREE.Texture;
  layout?: CandyShopSettings;
};

export function createCandyShop({ envMap, layout = CANDY_SHOP_DEFAULT }: CreateCandyShopOptions = {}) {
  // colors 另外複製：只用 { ...layout } 的話面板改色會改到 CANDY_SHOP_DEFAULT 本身
  const settings: CandyShopSettings = { ...layout, colors: { ...layout.colors } };
  const content = new THREE.Group();
  content.name = 'candy_shop';
  // 房子系統會把模型底部「彎」貼到球面上；這棟是程式拼的，每個零件的幾何中心都在自己原點，
  // 彎下去會把零件的下半部壓扁，所以整棟跳過
  content.userData[SKIP_SPHERE_CONFORM] = true;

  // ── 材質 ──
  const grain = createGrainTexture();
  const pavementMaterial = new THREE.MeshStandardMaterial({ roughness: 0.95, map: grain });
  const concreteMaterial = new THREE.MeshStandardMaterial({ roughness: 0.88 });
  const darkConcreteMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  const gravelMaterial = new THREE.MeshStandardMaterial({ roughness: 1, map: grain });
  const woodMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const darkWoodMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const awningCanvas = makeCanvas(128, 16).canvas;
  const awningTexture = toTexture(awningCanvas);
  const awningMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide, map: awningTexture });
  const roofTileMaterial = new THREE.MeshStandardMaterial({ roughness: 0.65 });
  // 深色只用一種「莓果紫」（跟點心樓的屋脊同色系），比純黑柔和，跟粉彩搭得起來
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xd3dbe0, roughness: 0.4, metalness: 0.35, envMap });
  const copperMaterial = new THREE.MeshStandardMaterial({ color: 0xf0a878, roughness: 0.35, metalness: 0.4, envMap });
  const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x6e5a72, roughness: 0.6 });
  const acMaterial = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.55 });
  const fanMaterial = new THREE.MeshStandardMaterial({ color: 0x6e5a72, roughness: 0.6 });
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x9fdcc8, roughness: 0.6 });
  const crackerHoleMaterial = new THREE.MeshStandardMaterial({ roughness: 1 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8fff4,
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    envMap,
  });
  // 糖果罐：比窗戶玻璃更「有存在感」一點（不透明度高一些，才看得出罐子形狀）
  const jarGlassMaterial = new THREE.MeshStandardMaterial({
    color: 0xeafcff,
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMap,
  });
  // 紅色的東西（罐蓋、塑膠椅、扭蛋機）跟遮雨棚同色
  const redPlasticMaterial = new THREE.MeshStandardMaterial({ roughness: 0.45 });
  // 糖球：顏色用 instanceColor 各自上色，材質本身白色
  const candyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.25 });
  const lollipopMaterial = new THREE.MeshStandardMaterial({ map: createLollipopTexture(), roughness: 0.3 });
  const stickMaterial = new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.5 });
  const sodaGlassMaterial = new THREE.MeshStandardMaterial({ color: 0x9fe6ff, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.75, envMap });
  const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x3f7fc0, roughness: 0.6 });
  const pitMaterial = new THREE.MeshStandardMaterial({ roughness: 0.9 });
  // 背面布棚：金色、帶一點金屬反光，自發光像呼吸（金光閃閃）；DoubleSide 從底下看也是金的
  const goldClothMaterial = new THREE.MeshStandardMaterial({
    color: 0xe9a91f,
    map: createGoldClothTexture(),
    metalness: 0.55,
    roughness: 0.3,
    envMap,
    envMapIntensity: 1.4,
    emissive: 0xffc93c,
    side: THREE.DoubleSide,
  });
  const goldTrimMaterial = new THREE.MeshStandardMaterial({ color: 0xe0a92a, metalness: 0.8, roughness: 0.2, envMap, emissive: 0xffb820 });
  const caiMaterial = new THREE.MeshStandardMaterial({
    map: createCaiTexture(),
    alphaTest: 0.5,
    roughness: 0.4,
    side: THREE.DoubleSide,
    // 往布面拉近一點畫，避免跟布搶深度、閃爍
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  let canopyHalo: THREE.Sprite | null = null;
  const canopyStars: Array<{ sprite: THREE.Sprite; phase: number; speed: number; baseSize: number }> = [];

  // 自發光的東西：亮度都在 update() 裡跟著 glow 調
  // 直立招牌是「燈箱」：整塊亮、字是深色的（白底深字，同一張當顏色和發光圖）
  const verticalSignTexture = createSignTexture('古早味', 96, 320, true, '#ffffff', '#9c2b22');
  const verticalSignMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4, emissiveMap: verticalSignTexture, map: verticalSignTexture });
  // 橫招牌：紅底（顏色在 applyColors 跟遮雨棚同色），白色大字自己發光
  const shopSignTexture = createSignTexture('柑仔店', 384, 96, false);
  const shopSignMaterial = new THREE.MeshStandardMaterial({
    roughness: 0.5,
    emissive: 0xfff4d6,
    emissiveMap: shopSignTexture,
  });
  const subwaySignTexture = createSubwaySignTexture();
  const subwaySignMaterial = new THREE.MeshStandardMaterial({ map: subwaySignTexture, emissive: 0xffffff, emissiveMap: subwaySignTexture, roughness: 0.5 });
  const roomTexture = createRoomTexture();
  const roomMaterial = new THREE.MeshStandardMaterial({ map: roomTexture, emissive: 0xffffff, emissiveMap: roomTexture, roughness: 0.9 });
  const shelfTexture = createShelfTexture();
  const shelfMaterial = new THREE.MeshStandardMaterial({ map: shelfTexture, emissive: 0xffffff, emissiveMap: shelfTexture, roughness: 0.9 });
  const windowTexture = createWindowTexture();
  const windowMaterial = new THREE.MeshStandardMaterial({ map: windowTexture, emissive: 0xffffff, emissiveMap: windowTexture, roughness: 0.6 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff3d0, emissive: 0xffd9a0, roughness: 0.3 });
  const greenLampMaterial = new THREE.MeshStandardMaterial({ color: 0xd6fff0, emissive: 0x7dffd0, roughness: 0.3 });
  const orangeLampMaterial = new THREE.MeshStandardMaterial({ color: 0xffd2a0, emissive: 0xff9a3c, roughness: 0.3 });
  const glowMaterials: Array<{ material: THREE.MeshStandardMaterial; base: number }> = [
    { material: verticalSignMaterial, base: 0.75 },
    { material: subwaySignMaterial, base: 0.8 },
    { material: roomMaterial, base: 0.55 },
    { material: shelfMaterial, base: 0.45 },
    { material: windowMaterial, base: 0.6 },
    { material: lampMaterial, base: 1.2 },
    { material: greenLampMaterial, base: 1.2 },
    { material: orangeLampMaterial, base: 1.2 },
  ];

  function applyColors() {
    const c = settings.colors;
    pavementMaterial.color.set(c.pavement);
    crackerHoleMaterial.color.set(c.pavement).multiplyScalar(0.55);
    pitMaterial.color.set(c.pavement).multiplyScalar(0.62);
    concreteMaterial.color.set(c.wall);
    darkConcreteMaterial.color.set(c.wall).multiplyScalar(0.72);
    gravelMaterial.color.set(c.wall).multiplyScalar(0.62);
    woodMaterial.color.set(c.wood);
    darkWoodMaterial.color.set(c.wood).multiplyScalar(0.6);
    // 遮雨棚顏色畫在條紋貼圖裡（白色條紋要保持白，不能用 material.color 去乘）
    drawAwningStripes(awningCanvas, c.awning);
    awningTexture.needsUpdate = true;
    redPlasticMaterial.color.set(c.awning);
    shopSignMaterial.color.set(c.awning);
    roofTileMaterial.color.set(c.roofTile);
    // 直立招牌：白底的地方被染成霓虹色並發光，深色字的地方不亮，字就浮出來
    verticalSignMaterial.color.set(c.sign);
    verticalSignMaterial.emissive.set(c.sign);
    greenLampMaterial.emissive.set(c.sign);
  }

  // ── 屋頂的超大糖果罐＋棒棒糖 ──
  const CANDY_COLORS = [0xff5a7a, 0xffd23f, 0x4ac3ff, 0x7ee07a, 0xb07cff, 0xff9a3c, 0xffffff];
  /** 棒棒糖的糖果圓盤（update() 裡慢慢轉） */
  let lollipopDisc: THREE.Object3D | null = null;
  function buildCandyJar(parent: THREE.Object3D, at: THREE.Vector3) {
    const jar = new THREE.Group();
    jar.position.copy(at);
    parent.add(jar);
    const R = 0.36;
    const H = 0.62;
    // 罐身：圓肚、上面收一點瓶口（LatheGeometry 轉一圈）
    const profile: THREE.Vector2[] = [new THREE.Vector2(0.001, 0), new THREE.Vector2(R - 0.06, 0), new THREE.Vector2(R - 0.01, 0.04)];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      profile.push(new THREE.Vector2(R + Math.sin(t * Math.PI) * 0.03, 0.06 + t * (H - 0.16)));
    }
    profile.push(new THREE.Vector2(R - 0.05, H - 0.04), new THREE.Vector2(R - 0.07, H));
    // 裡面的糖球：在罐子裡隨機（但每次一樣）塞滿到 7 成高；InstancedMesh + 每顆各自顏色
    const ballR = 0.055;
    const count = 110;
    const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(ballR, 12, 8), candyMaterial, count);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let seed = 11;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * (R - ballR - 0.02);
      const y = ballR + 0.02 + (i / count) * (H * 0.62);
      matrix.makeTranslation(Math.cos(a) * r, y, Math.sin(a) * r);
      balls.setMatrixAt(i, matrix);
      balls.setColorAt(i, color.set(CANDY_COLORS[i % CANDY_COLORS.length]));
    }
    jar.add(balls);
    // 玻璃罐身要在糖球之後畫（透明物件 three 會自動排在後面）
    jar.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 40), jarGlassMaterial));
    // 紅色罐蓋＋頂上的小圓鈕
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.04, R - 0.04, 0.09, 32), redPlasticMaterial);
    lid.position.y = H + 0.04;
    jar.add(lid);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 10), redPlasticMaterial);
    knob.scale.y = 0.7;
    knob.position.y = H + 0.1;
    jar.add(knob);
    // 罐口綁一圈白色緞帶
    const ribbon = new THREE.Mesh(new THREE.TorusGeometry(R - 0.055, 0.018, 8, 32), stickMaterial);
    ribbon.rotation.x = Math.PI / 2;
    ribbon.position.y = H - 0.03;
    jar.add(ribbon);

    // 棒棒糖：斜插在罐子旁邊，圓盤是彩色螺旋
    const lollipop = new THREE.Group();
    lollipop.position.set(-0.42, 0, 0.28);
    lollipop.rotation.z = 0.22;
    jar.add(lollipop);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), stickMaterial);
    stick.position.y = 0.35;
    lollipop.add(stick);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 32), [stickMaterial, lollipopMaterial, lollipopMaterial]);
    disc.rotation.x = Math.PI / 2;
    const discHolder = new THREE.Group();
    discHolder.position.y = 0.82;
    discHolder.add(disc);
    lollipop.add(discHolder);
    lollipopDisc = discHolder;
  }

  // ── 台座：一格格地磚，中間留細縫；有幾格缺角、幾格歪出去，像參考圖那樣碎碎的 ──
  const base = new THREE.Group();
  content.add(base);
  const crackerTops: THREE.Vector3[] = [];
  const missing = new Set(['-2,-2', '2,-2', '-2,2', '1,-2', '-2,-1']);
  for (let ix = -2; ix <= 2; ix++) {
    for (let iz = -2; iz <= 2; iz++) {
      if (missing.has(`${ix},${iz}`)) continue;
      const cx = ix * TILE;
      const cz = iz * TILE;
      // 地鐵入口那兩格不鋪，另外做樓梯
      if (cx > SUBWAY.x0 && cx < SUBWAY.x1 && cz > SUBWAY.z0 && cz < SUBWAY.z1) continue;
      // 每格高度差一點點，邊緣不會一整片平得很假
      const h = BASE_H - ((ix * 7 + iz * 13 + 20) % 3) * 0.008;
      base.add(box(TILE - 0.03, h, TILE - 0.03, pavementMaterial, cx, h / 2, cz));
      crackerTops.push(new THREE.Vector3(cx, h, cz));
    }
  }
  // 蘇打餅乾的小洞：每塊 3×3 個，用 InstancedMesh 一次畫完（幾百個小圓點只花一次 draw call）
  {
    const holeGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.012, 12);
    const holes = new THREE.InstancedMesh(holeGeometry, crackerHoleMaterial, crackerTops.length * 9);
    const matrix = new THREE.Matrix4();
    let n = 0;
    for (const top of crackerTops) {
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          matrix.makeTranslation(top.x + a * TILE * 0.28, top.y - 0.002, top.z + b * TILE * 0.28);
          holes.setMatrixAt(n++, matrix);
        }
      }
    }
    holes.receiveShadow = true;
    base.add(holes);
  }
  // 外圍零散的幾塊
  base.add(box(0.36, BASE_H * 0.6, 0.36, pavementMaterial, -1.55, BASE_H * 0.3, 0.6));
  base.add(box(0.3, BASE_H * 0.5, 0.3, pavementMaterial, 0.5, BASE_H * 0.25, 1.52));
  base.add(box(0.32, BASE_H * 0.55, 0.32, pavementMaterial, 1.5, BASE_H * 0.27, -0.6));

  // ── 地鐵入口：挖下去的洞、往下的樓梯、三面玻璃欄杆、一條綠色燈 ──
  {
    const width = SUBWAY.x1 - SUBWAY.x0;
    const cx = (SUBWAY.x0 + SUBWAY.x1) / 2;
    const length = SUBWAY.z1 - SUBWAY.z0;
    // 洞底
    base.add(box(width, 0.02, length, pitMaterial, cx, 0.01, (SUBWAY.z0 + SUBWAY.z1) / 2));
    // 兩側牆
    base.add(box(0.04, BASE_H, length, pavementMaterial, SUBWAY.x0 + 0.02, BASE_H / 2, (SUBWAY.z0 + SUBWAY.z1) / 2));
    base.add(box(0.04, BASE_H, length, pavementMaterial, SUBWAY.x1 - 0.02, BASE_H / 2, (SUBWAY.z0 + SUBWAY.z1) / 2));
    // 樓梯：從前面（+z，地面高度）往後面（-z）一階階往下
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const top = BASE_H - (i + 1) * (BASE_H / (steps + 1));
      const depth = length * 0.7 / steps;
      const z = SUBWAY.z1 - depth * (i + 0.5);
      base.add(box(width - 0.08, top, depth, pitMaterial, cx, top / 2, z));
    }
    // 樓梯底的入口：發光的門洞
    const doorway = box(width - 0.12, 0.16, 0.02, lampMaterial, cx, 0.1, SUBWAY.z0 + 0.03);
    base.add(doorway);
    // 玻璃欄杆（左右兩邊＋後面），上面一條金屬扶手
    const railH = 0.22;
    const railY = BASE_H + railH / 2;
    const sides: Array<[number, number, number, number]> = [
      [SUBWAY.x0, (SUBWAY.z0 + SUBWAY.z1) / 2, 0.01, length],
      [SUBWAY.x1, (SUBWAY.z0 + SUBWAY.z1) / 2, 0.01, length],
      [cx, SUBWAY.z0, width, 0.01],
    ];
    for (const [x, z, w, d] of sides) {
      base.add(box(w, railH, d, glassMaterial, x, railY, z));
      base.add(box(Math.max(w, 0.025), 0.025, Math.max(d, 0.025), metalMaterial, x, BASE_H + railH, z));
    }
    // 綠色燈條沿著左邊扶手下緣
    base.add(box(0.02, 0.015, length * 0.9, greenLampMaterial, SUBWAY.x0 + 0.03, BASE_H - 0.02, (SUBWAY.z0 + SUBWAY.z1) / 2));
  }

  // ── 一樓 ──
  const building = new THREE.Group();
  content.add(building);
  const groundY = BASE_H + GROUND_FLOOR_H / 2;
  {
    // 後牆、左牆（水泥）
    building.add(box(HALF * 2, GROUND_FLOOR_H, 0.06, darkConcreteMaterial, 0, groundY, -HALF + 0.03));
    building.add(box(0.06, GROUND_FLOOR_H, HALF * 2, darkConcreteMaterial, -HALF + 0.03, groundY, 0));
    // 店面：往裡縮的一整面零食貨架（貼發光的貨架圖）
    const counterW = COUNTER_X1 - COUNTER_X0;
    const counterCx = (COUNTER_X0 + COUNTER_X1) / 2;
    const shelf = new THREE.Mesh(new THREE.PlaneGeometry(counterW - 0.06, GROUND_FLOOR_H - 0.06), shelfMaterial);
    shelf.position.set(counterCx, groundY, 0.1);
    building.add(shelf);
    // 店面天花板
    building.add(box(counterW, 0.04, HALF - 0.1, darkWoodMaterial, counterCx, FLOOR1_TOP - 0.02, (HALF + 0.1) / 2));
    // 櫃台：木頭箱子＋上面一塊檯面
    building.add(box(counterW, 0.34, 0.16, woodMaterial, counterCx, BASE_H + 0.17, HALF - 0.08));
    building.add(box(counterW + 0.04, 0.03, 0.22, darkWoodMaterial, counterCx, BASE_H + 0.355, HALF - 0.06));
    // 櫃台上一排玻璃糖果罐：玻璃圓罐裡一顆顆彩色糖，紅蓋子
    [counterCx - 0.22, counterCx - 0.06, counterCx + 0.1, counterCx + 0.25].forEach((x, i) => {
      const jarH = 0.13;
      const y0 = BASE_H + 0.37;
      const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, jarH * 0.7, 12), new THREE.MeshStandardMaterial({ color: CANDY_COLORS[i], roughness: 0.35 }));
      fill.position.set(x, y0 + jarH * 0.35, HALF - 0.06);
      building.add(fill);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, jarH, 14), jarGlassMaterial);
      glass.position.set(x, y0 + jarH / 2, HALF - 0.06);
      building.add(glass);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.025, 14), redPlasticMaterial);
      lid.position.set(x, y0 + jarH + 0.012, HALF - 0.06);
      building.add(lid);
    });
    // 右半邊正面的牆＋店面右邊的柱子
    const rightW = HALF - COUNTER_X1;
    building.add(box(rightW, GROUND_FLOOR_H, 0.08, woodMaterial, COUNTER_X1 + rightW / 2, groundY, HALF - 0.04));
    building.add(box(0.06, GROUND_FLOOR_H, 0.08, darkWoodMaterial, COUNTER_X1, groundY, HALF - 0.04));
    // 右半邊牆上一個電錶箱
    building.add(box(0.12, 0.16, 0.04, metalMaterial, COUNTER_X1 + 0.2, groundY + 0.05, HALF + 0.01));
    // 側面（+x）木頭牆
    building.add(box(0.08, GROUND_FLOOR_H, HALF * 2, woodMaterial, HALF - 0.04, groundY, 0));
    // 木牆上的兩扇發光格子窗＋窗框
    for (const z of [-0.28, 0.2]) {
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), windowMaterial);
      pane.rotation.y = Math.PI / 2;
      pane.position.set(HALF + 0.002, groundY + 0.02, z);
      building.add(pane);
      building.add(box(0.03, 0.03, 0.36, darkWoodMaterial, HALF + 0.01, groundY - 0.2, z));
    }
    // 牆角的木柱
    for (const z of [-HALF + 0.03, HALF - 0.03]) building.add(box(0.07, GROUND_FLOOR_H, 0.07, darkWoodMaterial, HALF - 0.035, groundY, z));

    // 紅色遮雨棚：從牆上斜斜往外伸，前面一條垂下來的布邊
    const awningDepth = 0.4;
    const awningDrop = 0.14;
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(counterW + 0.04, Math.hypot(awningDepth, awningDrop)), awningMaterial);
    awning.rotation.x = -Math.PI / 2 + Math.atan2(awningDrop, awningDepth);
    awning.position.set(counterCx, FLOOR1_TOP - 0.12 - awningDrop / 2, HALF + awningDepth / 2);
    building.add(awning);
    building.add(box(counterW + 0.04, 0.07, 0.01, awningMaterial, counterCx, FLOOR1_TOP - 0.12 - awningDrop - 0.035, HALF + awningDepth));
    // 遮雨棚的兩根撐桿
    for (const x of [COUNTER_X0 + 0.03, COUNTER_X1 - 0.03]) {
      const rod = createCable(
        new THREE.Vector3(x, FLOOR1_TOP - 0.05, HALF),
        new THREE.Vector3(x, FLOOR1_TOP - 0.12 - awningDrop, HALF + awningDepth),
        0,
        metalMaterial,
        0.008,
      );
      building.add(rod);
    }

    // 「柑仔店」橫招牌：紅底白字，貼在遮雨棚上面、樓板下面（比原本大一點，是店的門面）
    const shopSign = new THREE.Mesh(new THREE.BoxGeometry(counterW * 0.9, 0.13, 0.04), [
      darkWoodMaterial,
      darkWoodMaterial,
      darkWoodMaterial,
      darkWoodMaterial,
      shopSignMaterial,
      darkWoodMaterial,
    ]);
    shopSign.position.set(counterCx, FLOOR1_TOP - 0.07, HALF + 0.035);
    building.add(shopSign);

    // 遮雨棚前緣下面掛一串零食包：一條細線＋一包包彩色小袋子（微微歪來歪去）
    const snackY = FLOOR1_TOP - 0.12 - awningDrop - 0.09;
    const snackZ = HALF + awningDepth - 0.02;
    building.add(box(counterW - 0.06, 0.008, 0.008, cableMaterial, counterCx, snackY + 0.05, snackZ));
    for (let k = 0; k < 7; k++) {
      const x = COUNTER_X0 + 0.08 + (k / 6) * (counterW - 0.16);
      const bag = box(0.06, 0.08, 0.02, new THREE.MeshStandardMaterial({ color: CANDY_COLORS[k % CANDY_COLORS.length], roughness: 0.4 }), x, snackY, snackZ);
      bag.rotation.z = Math.sin(k * 1.7) * 0.18;
      building.add(bag);
    }

    // 側面的小屋瓦：一片斜斜的板子＋上面一條條瓦楞
    const tileDepth = 0.28;
    const tileDrop = 0.12;
    const tileRoof = new THREE.Group();
    tileRoof.position.set(HALF, FLOOR1_TOP - 0.08, 0);
    tileRoof.rotation.z = -Math.atan2(tileDrop, tileDepth);
    building.add(tileRoof);
    tileRoof.add(box(tileDepth, 0.02, HALF * 2 - 0.08, roofTileMaterial, tileDepth / 2, 0, 0));
    const tileCount = 14;
    for (let i = 0; i < tileCount; i++) {
      const z = -HALF + 0.08 + (i / (tileCount - 1)) * (HALF * 2 - 0.16);
      const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, tileDepth + 0.02, 6), roofTileMaterial);
      ridge.rotation.z = Math.PI / 2;
      ridge.position.set(tileDepth / 2 + 0.01, 0.015, z);
      tileRoof.add(ridge);
    }
    // 屋瓦最外緣一條深色的邊
    tileRoof.add(box(0.03, 0.04, HALF * 2 - 0.06, darkWoodMaterial, tileDepth + 0.01, 0.005, 0));

    // 背面的金色布棚：從二樓後牆頂端開始，一路往外、往下垂到一樓的高度，中間微微往外鼓（像撐飽的帆布）。
    // 布面是一片「沿著曲線彎」的格子板：側面看是一條二次貝茲曲線（起點 A 在二樓牆上、終點 B 在一樓外側），
    // 「彩」字也用同一條曲線做一片小的貼上去，才會跟著布彎、不會插進布裡或浮在空中
    {
      const canopyW = HALF * 2 - 0.08;
      // 側面的曲線（y = 高度, z = 往外）：A 貼著二樓牆、B 垂到原本一樓布棚外緣的位置
      const A = new THREE.Vector2(UPPER_TOP - 0.1, -HALF - 0.03);
      const B = new THREE.Vector2(FLOOR1_TOP - 0.26, -HALF - 0.55);
      // 控制點：AB 中點往「外上方」推一點 → 布面微微往外鼓
      const dir = B.clone().sub(A);
      const outward = new THREE.Vector2(-dir.y, dir.x).normalize();
      // Vector2 的 x = 高度、y = z；往外是 z 變負，所以 y > 0 就是朝牆裡，要反過來
      if (outward.y > 0) outward.negate();
      const C = A.clone().add(B).multiplyScalar(0.5).addScaledVector(outward, 0.09);
      /** 曲線上第 t 段（0 = 牆上, 1 = 垂下來的尾端）的位置 */
      const curveAt = (t: number) =>
        new THREE.Vector2(
          (1 - t) * (1 - t) * A.x + 2 * (1 - t) * t * C.x + t * t * B.x,
          (1 - t) * (1 - t) * A.y + 2 * (1 - t) * t * C.y + t * t * B.y,
        );
      /** 曲線往外的法線方向（布面朝外那一側） */
      const normalAt = (t: number) => {
        const tangent = new THREE.Vector2(
          2 * (1 - t) * (C.x - A.x) + 2 * t * (B.x - C.x),
          2 * (1 - t) * (C.y - A.y) + 2 * t * (B.y - C.y),
        );
        const n = new THREE.Vector2(-tangent.y, tangent.x).normalize();
        return n.y > 0 ? n.negate() : n;
      };
      /**
       * 沿著曲線彎的薄片：x 方向寬 width（中心在 xCenter），曲線上從 t0 到 t1，再沿法線浮起 lift。
       * 貼圖的上緣在牆那一側；x 反過來放，從外面（-z）看過去字才不會左右相反
       */
      const createCurvedSheet = (width: number, t0: number, t1: number, lift: number) => {
        const geometry = new THREE.PlaneGeometry(width, 1, 12, 24);
        const position = geometry.getAttribute('position');
        for (let k = 0; k < position.count; k++) {
          const t = t0 + (0.5 - position.getY(k)) * (t1 - t0);
          const p = curveAt(t).addScaledVector(normalAt(t), lift);
          position.setXYZ(k, -position.getX(k), p.x, p.y);
        }
        position.needsUpdate = true;
        geometry.computeVertexNormals();
        return geometry;
      };
      building.add(new THREE.Mesh(createCurvedSheet(canopyW, 0, 1, 0), goldClothMaterial));
      // 「彩」字放在布的中段偏下（垂下來那一段最正對著人）；字是正方形，所以 t 的範圍按曲線長度換算
      // 字要夠大：布寬約 1.1，字佔一半多，遠遠看也認得出來
      const caiSize = 0.62;
      const curveLength = A.distanceTo(C) + C.distanceTo(B);
      const caiT = 0.52;
      const caiHalfT = (caiSize / curveLength) / 2;
      building.add(new THREE.Mesh(createCurvedSheet(caiSize, caiT - caiHalfT, caiT + caiHalfT, 0.008), caiMaterial));
      // 牆上收邊：一條金色橫木壓住布的上緣
      building.add(box(canopyW + 0.04, 0.05, 0.05, goldTrimMaterial, 0, A.x + 0.01, -HALF - 0.02));
      // 尾端的垂邊：一條金邊＋一排半圓（扇貝邊），直直掛著
      const valance = new THREE.Group();
      valance.position.set(0, B.x, B.y);
      building.add(valance);
      valance.add(box(canopyW, 0.06, 0.014, goldTrimMaterial, 0, -0.025, 0));
      const scallops = 9;
      for (let k = 0; k < scallops; k++) {
        const r = canopyW / scallops / 2;
        const scallop = new THREE.Mesh(new THREE.CircleGeometry(r, 14, Math.PI, Math.PI), goldClothMaterial);
        scallop.position.set(-canopyW / 2 + r * (2 * k + 1), -0.055, 0);
        scallop.rotation.y = Math.PI;
        valance.add(scallop);
      }
      // 兩根金色撐桿：從一樓牆頂斜撐到布的尾端
      for (const x of [-canopyW / 2 + 0.03, canopyW / 2 - 0.03]) {
        building.add(createCable(new THREE.Vector3(x, FLOOR1_TOP - 0.15, -HALF), new THREE.Vector3(x, B.x - 0.01, B.y + 0.01), 0, goldTrimMaterial, 0.01));
      }
      // 閃光：「彩」字前面一團光暈＋五顆輪流閃的四角星（跟大包子的金字同一套）
      const caiCenter = curveAt(caiT).addScaledVector(normalAt(caiT), 0.12);
      const sparkle = new THREE.Group();
      sparkle.position.set(0, caiCenter.x, caiCenter.y);
      building.add(sparkle);
      const goldHalo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffd76a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
      );
      goldHalo.scale.setScalar(canopyW * 1.1);
      goldHalo.raycast = () => {};
      sparkle.add(goldHalo);
      canopyHalo = goldHalo;
      const starTexture = makeStarTexture();
      for (let i = 0; i < 5; i++) {
        const star = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: starTexture, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
        );
        star.position.set((i / 4 - 0.5) * canopyW * 0.9, ((i % 3) - 1) * 0.18, (i % 2) * 0.05);
        star.raycast = () => {};
        sparkle.add(star);
        canopyStars.push({ sprite: star, phase: i * 1.3, speed: 2 + i * 0.45, baseSize: 0.12 + (i % 2) * 0.06 });
      }
    }

    // 店門口兩張紅色塑膠矮凳（台灣巷口必備）：上大下小的圓凳，凳面中間一個小洞
    for (const x of [counterCx - 0.2, counterCx + 0.16]) {
      const stool = new THREE.Group();
      stool.position.set(x, BASE_H, HALF + 0.24);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.16, 16, 1, true), redPlasticMaterial);
      body.material = redPlasticMaterial;
      body.position.y = 0.08;
      stool.add(body);
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 18), redPlasticMaterial);
      seat.position.y = 0.165;
      stool.add(seat);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.015, 10), cableMaterial);
      hole.rotation.x = -Math.PI / 2;
      hole.position.y = 0.176;
      stool.add(hole);
      building.add(stool);
    }

    // 牆角那根銅色水管：從屋頂一路下來，到地面拐一下
    const pipe = createCable(
      new THREE.Vector3(HALF + 0.05, ROOF_TOP - 0.05, HALF + 0.05),
      new THREE.Vector3(HALF + 0.05, BASE_H + 0.1, HALF + 0.05),
      0,
      copperMaterial,
      0.028,
    );
    building.add(pipe);
    const elbow = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.028, 8, 12, Math.PI / 2), copperMaterial);
    elbow.rotation.y = -Math.PI / 4;
    elbow.position.set(HALF + 0.05 + 0.042, BASE_H + 0.1, HALF + 0.05 + 0.042);
    building.add(elbow);
    // 管子上的固定環
    for (const y of [BASE_H + 0.45, UPPER_BOTTOM + 0.3]) {
      const clamp = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 6, 12), metalMaterial);
      clamp.rotation.x = Math.PI / 2;
      clamp.position.set(HALF + 0.05, y, HALF + 0.05);
      building.add(clamp);
    }
  }

  // ── 樓板、二樓、屋頂 ──
  {
    building.add(new THREE.Mesh(createRoundedSlab(HALF + 0.07, 0.32, SLAB_H, FLOOR1_TOP), concreteMaterial));
    const upper = new THREE.Mesh(createRoundedSlab(HALF + 0.02, 0.28, UPPER_H, UPPER_BOTTOM), concreteMaterial);
    building.add(upper);
    building.add(new THREE.Mesh(createRoundedSlab(HALF + 0.07, 0.32, ROOF_SLAB_H, UPPER_TOP), darkConcreteMaterial));
    // 屋頂碎石：比屋頂板小一圈的薄片
    building.add(new THREE.Mesh(createRoundedSlab(HALF - 0.02, 0.25, 0.012, ROOF_TOP), gravelMaterial));
    // 屋頂一圈矮牆（只做後面跟右邊，前面讓開給鏡頭看溫室）
    building.add(box(HALF * 2 + 0.14, 0.07, 0.05, darkConcreteMaterial, 0, ROOF_TOP + 0.035, -HALF - 0.045));
    building.add(box(0.05, 0.07, HALF * 2 + 0.14, darkConcreteMaterial, HALF + 0.045, ROOF_TOP + 0.035, 0));

    // 二樓正面大窗戶：發光的房間圖＋深色窗框（框比圖往外凸一點，看起來有深度）
    const winW = 0.62;
    const winH = 0.44;
    const winCx = 0.0;
    const winCy = UPPER_BOTTOM + UPPER_H / 2;
    const frontZ = HALF + 0.02;
    const room = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), roomMaterial);
    room.position.set(winCx, winCy, frontZ + 0.002);
    building.add(room);
    const frameT = 0.035;
    building.add(box(winW + frameT * 2, frameT, 0.05, fanMaterial, winCx, winCy + winH / 2 + frameT / 2, frontZ + 0.02));
    building.add(box(winW + frameT * 2, frameT, 0.07, fanMaterial, winCx, winCy - winH / 2 - frameT / 2, frontZ + 0.03));
    building.add(box(frameT, winH, 0.05, fanMaterial, winCx - winW / 2 - frameT / 2, winCy, frontZ + 0.02));
    building.add(box(frameT, winH, 0.05, fanMaterial, winCx + winW / 2 + frameT / 2, winCy, frontZ + 0.02));
    building.add(box(0.012, winH, 0.02, fanMaterial, winCx + winW * 0.18, winCy, frontZ + 0.01));
    // 窗外的玻璃一層（淡淡反光）
    building.add(box(winW, winH, 0.005, glassMaterial, winCx, winCy, frontZ + 0.035));

    // 側面（+x）圓形通風口：圓盤＋外框＋幾條橫百葉
    const vent = new THREE.Group();
    vent.position.set(HALF + 0.02, winCy + 0.02, -0.12);
    vent.rotation.y = Math.PI / 2;
    building.add(vent);
    const ventR = 0.22;
    const ventDisc = new THREE.Mesh(new THREE.CircleGeometry(ventR, 32), fanMaterial);
    ventDisc.position.z = 0.003;
    vent.add(ventDisc);
    const ventRim = new THREE.Mesh(new THREE.TorusGeometry(ventR, 0.025, 8, 32), copperMaterial);
    ventRim.position.z = 0.01;
    vent.add(ventRim);
    for (let i = -3; i <= 3; i++) {
      const y = (i / 3.6) * ventR;
      const w = 2 * Math.sqrt(Math.max(0, ventR * ventR - y * y)) - 0.02;
      vent.add(box(w, 0.018, 0.02, darkConcreteMaterial, 0, y, 0.015));
    }

    // 二樓牆上的冷氣室外機（正面右邊、側面下方各一台）
    const makeAc = (scale: number) => {
      const ac = new THREE.Group();
      ac.add(box(0.3 * scale, 0.22 * scale, 0.12 * scale, acMaterial, 0, 0, 0));
      const fan = new THREE.Mesh(new THREE.CircleGeometry(0.075 * scale, 20), fanMaterial);
      fan.position.set(-0.05 * scale, 0, 0.061 * scale);
      ac.add(fan);
      const hub = new THREE.Mesh(new THREE.TorusGeometry(0.075 * scale, 0.008 * scale, 6, 20), metalMaterial);
      hub.position.copy(fan.position);
      ac.add(hub);
      return ac;
    };
    const acFront = makeAc(1);
    acFront.position.set(HALF - 0.12, FLOOR1_TOP - 0.2, HALF + 0.07);
    building.add(acFront);
    const acSide = makeAc(0.9);
    acSide.rotation.y = Math.PI / 2;
    acSide.position.set(HALF + 0.08, UPPER_BOTTOM + 0.14, 0.32);
    building.add(acSide);
    // 屋頂：一個超大的糖果罐（Q 版比例故意做很大，遠遠就看得出是賣糖果零食的）
    buildCandyJar(building, new THREE.Vector3(0.1, ROOF_TOP, -0.08));

    // 「古早味」直立燈箱：掛在二樓圓角那一側，兩根支架伸出牆外
    const sign = new THREE.Group();
    sign.position.set(-HALF - 0.2, UPPER_BOTTOM + 0.38, HALF - 0.12);
    building.add(sign);
    const signW = 0.2;
    const signH = 0.66;
    // 前後兩面都貼字（從背面看也是亮的），側面用深色
    sign.add(
      new THREE.Mesh(new THREE.BoxGeometry(signW, signH, 0.06), [
        fanMaterial,
        fanMaterial,
        fanMaterial,
        fanMaterial,
        verticalSignMaterial,
        verticalSignMaterial,
      ]),
    );
    sign.add(box(signW + 0.03, 0.05, 0.08, fanMaterial, 0, signH / 2 + 0.025, 0));
    for (const y of [signH * 0.32, -signH * 0.32]) sign.add(box(0.2, 0.02, 0.02, metalMaterial, 0.17, y, -0.06));
    // 招牌下面的燈管（斜斜照向店面那邊）
    const tubeLamp = new THREE.Group();
    tubeLamp.position.set(-HALF - 0.08, UPPER_BOTTOM + 0.0, HALF - 0.1);
    building.add(tubeLamp);
    tubeLamp.add(box(0.22, 0.035, 0.05, fanMaterial, -0.02, 0, 0));
    tubeLamp.add(box(0.2, 0.012, 0.035, lampMaterial, -0.02, -0.022, 0));

  }

  // ── 電線桿：桿子、橫擔、三顆礙子、燈箱、往屋頂垂的電線 ──
  {
    const pole = new THREE.Group();
    pole.position.copy(POLE);
    content.add(pole);
    // 薄荷色、胖一點的桿子，頂端一顆圓球收尾（玩具感）
    const poleBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, POLE_H, 14), poleMaterial);
    poleBody.position.y = POLE_H / 2;
    pole.add(poleBody);
    pole.add(box(0.16, 0.08, 0.16, darkConcreteMaterial, 0, 0.04, 0));
    const poleCap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), poleMaterial);
    poleCap.position.y = POLE_H;
    pole.add(poleCap);
    // 橫擔（沿 z 方向），三顆礙子
    pole.add(box(0.05, 0.05, 0.5, poleMaterial, 0, POLE_H - 0.1, 0));
    for (const z of [-0.2, 0.05, 0.2]) {
      const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.06, 8), acMaterial);
      insulator.position.set(0, POLE_H - 0.055, z);
      pole.add(insulator);
    }
    // 第二根短橫擔，掛路燈
    pole.add(box(0.045, 0.045, 0.32, poleMaterial, 0, POLE_H - 0.42, 0));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), orangeLampMaterial);
    lamp.position.set(0, POLE_H - 0.47, 0.16);
    pole.add(lamp);
    // 「地下道」燈箱：從桿子往 +x 伸出一根手臂，燈箱面向 +z
    pole.add(box(0.26, 0.035, 0.035, poleMaterial, 0.13, POLE_H - 0.72, 0));
    const subwaySign = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.05), [
      fanMaterial,
      fanMaterial,
      fanMaterial,
      fanMaterial,
      subwaySignMaterial,
      subwaySignMaterial,
    ]);
    subwaySign.position.set(0.3, POLE_H - 0.82, 0.03);
    pole.add(subwaySign);
    pole.add(box(0.012, 0.08, 0.012, metalMaterial, 0.18, POLE_H - 0.75, 0.03));
    pole.add(box(0.012, 0.08, 0.012, metalMaterial, 0.42, POLE_H - 0.75, 0.03));
    // 桿子上的小變電箱
    pole.add(box(0.1, 0.16, 0.08, metalMaterial, -0.06, POLE_H - 0.95, 0));
    // 電線：礙子 → 屋頂角、礙子 → 往外飄出去（垂一點）
    const top = (z: number) => new THREE.Vector3(POLE.x, POLE.y + POLE_H - 0.03, POLE.z + z);
    content.add(createCable(top(0.2), new THREE.Vector3(HALF + 0.05, ROOF_TOP + 0.02, -HALF + 0.1), 0.18, cableMaterial));
    content.add(createCable(top(0.05), new THREE.Vector3(HALF + 0.05, UPPER_TOP - 0.15, 0.1), 0.22, cableMaterial));
  }

  // ── 地上的小東西 ──
  {
    // 扭蛋機兩台：紅色底座＋透明圓頂，裡面一顆顆彩色扭蛋、前面一個銀色轉鈕
    // 放在店門口前面（鏡頭看得到的那側），身體朝斜前方
    [-0.62, -0.36].forEach((x, n) => {
      const gacha = new THREE.Group();
      gacha.position.set(x, BASE_H, HALF + 0.5);
      gacha.rotation.y = 0.5;
      content.add(gacha);
      gacha.add(box(0.2, 0.22, 0.2, redPlasticMaterial, 0, 0.11, 0));
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 14), metalMaterial);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, 0.15, 0.11);
      gacha.add(knob);
      gacha.add(box(0.05, 0.04, 0.02, cableMaterial, 0, 0.05, 0.1));
      for (let k = 0; k < 9; k++) {
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.03, 10, 8),
          new THREE.MeshStandardMaterial({ color: CANDY_COLORS[(k + n * 3) % CANDY_COLORS.length], roughness: 0.3 }),
        );
        ball.position.set(Math.cos(k * 2.2) * 0.05, 0.25 + Math.floor(k / 4) * 0.045, Math.sin(k * 2.2) * 0.05);
        gacha.add(ball);
      }
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), jarGlassMaterial);
      dome.scale.y = 1.4;
      dome.position.y = 0.22;
      gacha.add(dome);
    });

    // 一箱彈珠汽水：藍色塑膠箱、3×2 瓶淡藍玻璃瓶，瓶口一顆彈珠
    const crate = new THREE.Group();
    crate.position.set(0.42, BASE_H, HALF + 0.38);
    crate.rotation.y = -0.3;
    content.add(crate);
    crate.add(box(0.26, 0.1, 0.18, crateMaterial, 0, 0.05, 0));
    for (let a = 0; a < 3; a++) {
      for (let b = 0; b < 2; b++) {
        const x = (a - 1) * 0.075;
        const z = (b - 0.5) * 0.08;
        const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.16, 10), sodaGlassMaterial);
        bottle.position.set(x, 0.12, z);
        crate.add(bottle);
        const marble = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), stickMaterial);
        marble.position.set(x, 0.205, z);
        crate.add(marble);
      }
    }

    // 「冰」字立牌（A 字型）
    const warning = new THREE.Group();
    warning.position.set(-0.95, BASE_H, 0.8);
    warning.rotation.y = 0.5;
    content.add(warning);
    const warningTexture = createIceSignTexture();
    const warningMaterial = new THREE.MeshStandardMaterial({ map: warningTexture, roughness: 0.6 });
    const boardW = 0.2;
    const boardH = 0.3;
    const tilt = 0.22;
    for (const dir of [1, -1]) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(boardW, boardH, 0.012), [
        warningMaterial,
        warningMaterial,
        warningMaterial,
        warningMaterial,
        warningMaterial,
        warningMaterial,
      ]);
      board.position.set(0, (boardH / 2) * Math.cos(tilt), dir * (boardH / 2) * Math.sin(tilt));
      board.rotation.x = dir * tilt;
      if (dir < 0) board.rotation.y = Math.PI;
      warning.add(board);
    }

  }

  // ── 光暈：幾個會發光的地方前面放一顆加亮的 sprite，夜晚感更明顯 ──
  const glowTexture = makeGlowTexture();
  const halos: Array<{ sprite: THREE.Sprite; base: number; flicker?: boolean }> = [];
  const addHalo = (position: THREE.Vector3, size: number, color: THREE.ColorRepresentation, base: number, flicker = false) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    // Sprite 的射線判定需要 raycaster.camera，拖曳工具沒設定會報錯；光暈本來也不該被點到
    sprite.raycast = () => {};
    content.add(sprite);
    halos.push({ sprite, base, flicker });
    return sprite;
  };
  const signHalo = addHalo(new THREE.Vector3(-HALF - 0.2, UPPER_BOTTOM + 0.38, HALF - 0.05), 0.9, settings.colors.sign, 0.35);
  addHalo(new THREE.Vector3((COUNTER_X0 + COUNTER_X1) / 2, FLOOR1_TOP - 0.065, HALF + 0.08), 0.7, 0xfff0c0, 0.25, true);
  addHalo(new THREE.Vector3(POLE.x + 0.3, POLE.y + POLE_H - 0.82, POLE.z + 0.08), 0.6, 0xffd66b, 0.28);
  addHalo(new THREE.Vector3(POLE.x, POLE.y + POLE_H - 0.5, POLE.z + 0.16), 0.4, 0xffa04a, 0.45);
  addHalo(new THREE.Vector3(0, UPPER_BOTTOM + UPPER_H / 2, HALF + 0.08), 0.8, 0xfff0c8, 0.16);
  addHalo(new THREE.Vector3((COUNTER_X0 + COUNTER_X1) / 2, BASE_H + 0.45, HALF + 0.1), 0.8, 0xffc070, 0.22);
  addHalo(new THREE.Vector3((SUBWAY.x0 + SUBWAY.x1) / 2, BASE_H + 0.05, (SUBWAY.z0 + SUBWAY.z1) / 2), 0.6, settings.colors.sign, 0.2);

  content.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    // 玻璃不擋影子（不然溫室底下一整塊黑）
    mesh.castShadow = mesh.material !== glassMaterial;
    mesh.receiveShadow = true;
  });

  function applySettings() {
    applyColors();
    // 招牌光暈跟著燈箱顏色
    signHalo.material.color.set(settings.colors.sign);
  }

  applySettings();

  let time = 0;
  /** 「柑仔店」招牌下一次「閃一下」的時間 */
  let nextFlicker = 3;
  function update(deltaTime: number) {
    time += deltaTime;
    const glow = Math.max(0, settings.glow);
    // 老燈管：大部分時間穩定亮，偶爾快速暗兩下
    let signLevel = 1;
    if (time > nextFlicker) {
      const t = time - nextFlicker;
      if (t < 0.35) signLevel = Math.sin(t * 60) > 0 ? 0.25 : 1;
      else nextFlicker = time + 3 + Math.random() * 5;
    }
    // 直立招牌、窗戶慢慢呼吸（很小的幅度，只是讓畫面有一點活的感覺）
    const breathe = 1 + 0.08 * Math.sin(time * 1.6);
    for (const { material, base } of glowMaterials) material.emissiveIntensity = base * glow * breathe;
    shopSignMaterial.emissiveIntensity = 1.1 * glow * signLevel;
    // 金色布棚：發光像呼吸、光暈跟著亮暗，星星偶爾「叮」一下亮起來
    const goldPulse = Math.sin(time * 3.1);
    goldClothMaterial.emissiveIntensity = (0.22 + 0.12 * goldPulse) * glow;
    goldTrimMaterial.emissiveIntensity = (0.3 + 0.15 * goldPulse) * glow;
    if (canopyHalo) canopyHalo.material.opacity = (0.22 + 0.1 * goldPulse) * Math.min(1, glow);
    for (const star of canopyStars) {
      const t = Math.max(0, Math.sin(time * star.speed + star.phase));
      const flash = t * t * t;
      star.sprite.material.opacity = flash * Math.min(1, glow);
      star.sprite.scale.setScalar(star.baseSize * (0.4 + 0.8 * flash));
      star.sprite.material.rotation = time * 0.8 + star.phase;
    }
    // 棒棒糖的螺旋在原地慢慢轉（繞圓盤自己的軸，正面一直朝外）
    if (lollipopDisc) lollipopDisc.rotation.z = time * 0.8;
    for (const halo of halos) {
      // 綠球是白天，光暈太亮會把粉彩洗白：整體壓到 6 成
      halo.sprite.material.opacity = 0.6 * halo.base * Math.min(1.5, glow) * (halo.flicker ? signLevel : breathe);
    }
  }

  return {
    object: content,
    settings,
    applySettings,
    update,
  };
}

export function formatCandyShopSettingsForPaste(s: CandyShopSettings) {
  return (
    `// 貼回 src/world/objects/candyShop.ts 的 CANDY_SHOP_DEFAULT\n` +
    `export const CANDY_SHOP_DEFAULT: CandyShopSettings = {\n` +
    `  glow: ${s.glow.toFixed(2)},\n` +
    `  colors: {\n` +
    `    wall: '${s.colors.wall}',\n` +
    `    wood: '${s.colors.wood}',\n` +
    `    awning: '${s.colors.awning}',\n` +
    `    roofTile: '${s.colors.roofTile}',\n` +
    `    pavement: '${s.colors.pavement}',\n` +
    `    sign: '${s.colors.sign}',\n` +
    `  },\n` +
    `};`
  );
}
