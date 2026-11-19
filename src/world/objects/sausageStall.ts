import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeGlowTexture } from './pigCoinShine';

/**
 * 綠球上的「打彈珠烤香腸攤」：台灣夜市那種推車小攤。
 *   - 推車：素面木頭車身（不放字）、兩個輪子、旁邊一桶紅色瓦斯
 *   - 左半邊檯面：烤肉架，底下炭火會發光，上面一排香腸慢慢翻面，冒出一縷縷白煙
 *   - 右半邊檯面：一台斜放的彈珠台（深藍盤面、一顆顆釘子、得分洞），玻璃彈珠會從上面一路彈跳滾下來
 *   - 四根柱子撐起條紋布篷，前緣一排會閃的小燈泡，篷頂一塊紅色大招牌（目前空白）
 *   - 前面一張紅色塑膠矮凳（整台攤子都不放文字）
 * 擺放方式跟大包子一樣：離頂端角度＋方位角決定在球面上的位置，面板可調、可拖曳，「印出設定」貼回預設值。
 *
 * 模型座標：+z 是正面（客人站的那邊），y 朝上，底部在 y = 0，寬約 1.6。
 */

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();

export type SausageStallColors = {
  /** 條紋布篷的顏色（另一色固定白） */
  canopy: string;
  /** 推車車身 */
  cart: string;
  /** 檯面、柱子、彈珠台木框 */
  trim: string;
  /** 彈珠台盤面 */
  board: string;
};

export type SausageStallSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 攤子寬度（世界單位） */
  size: number;
  sink: number;
  /** 炭火、燈泡的發光強度（0 = 不發光） */
  glow: number;
  colors: SausageStallColors;
};

export const SAUSAGE_STALL_DEFAULT: SausageStallSettings = {
  enabled: true,
  angleFromTopDegrees: 34,
  azimuthDegrees: -27,
  // 正面（香腸、彈珠台那側）大致朝開場鏡頭
  spinDegrees: 135,
  size: 0.11,
  sink: 0.003,
  glow: 1,
  colors: {
    canopy: '#ff8a2a',
    cart: '#c94f3d',
    trim: '#f3d9a6',
    board: '#2f5fa8',
  },
};

// ───────────────────────── 尺寸 ─────────────────────────

const WHEEL_R = 0.14;
const CART_BOTTOM = 0.12;
const CART_H = 0.55;
const CART_W = 1.3;
const CART_D = 0.6;
const COUNTER_Y = CART_BOTTOM + CART_H;
const COUNTER_T = 0.04;
const COUNTER_TOP = COUNTER_Y + COUNTER_T;
const CANOPY_BACK_Y = COUNTER_TOP + 0.85;
const CANOPY_FRONT_Y = COUNTER_TOP + 0.68;
const POLE_X = 0.68;
const POLE_Z = 0.34;

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

/** 布篷條紋：一條布篷色、一條白（改色時重畫同一張 canvas） */
function drawStripes(canvas: HTMLCanvasElement, color: string) {
  const g = canvas.getContext('2d')!;
  const stripes = 10;
  const w = canvas.width / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = i % 2 ? '#fffaf0' : color;
    g.fillRect(i * w, 0, w, canvas.height);
  }
}

/** 彈珠台盤面：金框得分洞、上方一道拱形軌道、底部一排得分格（盤面底色由材質 color 決定，這張是白線） */
function createBoardTexture() {
  const { canvas, g } = makeCanvas(256, 320);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 256, 320);
  g.strokeStyle = '#ffe680';
  g.lineWidth = 6;
  // 上方拱形
  g.beginPath();
  g.arc(128, 128, 110, Math.PI, 0);
  g.stroke();
  // 得分洞：金框白洞＋數字
  const holes: Array<[number, number]> = [
    [70, 120],
    [186, 120],
    [128, 170],
    [60, 220],
    [196, 220],
    [128, 250],
  ];
  for (const [x, y] of holes) {
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.arc(x, y, 17, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1b2440';
    g.beginPath();
    g.arc(x, y, 11, 0, Math.PI * 2);
    g.fill();
  }
  // 底部得分格
  g.fillStyle = '#ffe680';
  for (let i = 0; i < 6; i++) g.fillRect(14 + i * 40, 290, 4, 30);
  return { texture: toTexture(canvas), canvas };
}

// ───────────────────────── 小工具 ─────────────────────────

/** 圓角方塊（跟柑仔店一樣的玩具感） */
function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
  const radius = Math.min(0.03, Math.min(width, height, depth) * 0.45);
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, radius), material);
  mesh.position.set(x, y, z);
  return mesh;
}

// ───────────────────────── 建立 ─────────────────────────

type CreateSausageStallOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: SausageStallSettings;
};

export function createSausageStall({ groundRadius, up, front, envMap, layout = SAUSAGE_STALL_DEFAULT }: CreateSausageStallOptions) {
  // colors 另外複製：只用 { ...layout } 的話面板改色會改到 SAUSAGE_STALL_DEFAULT 本身
  const settings: SausageStallSettings = { ...layout, colors: { ...layout.colors } };
  const anchor = new THREE.Object3D();
  anchor.name = 'sausage_stall';
  const content = new THREE.Group();
  anchor.add(content);
  let introGrow = 1;

  // ── 材質 ──
  const cartMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const trimMaterial = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const darkTrimMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 });
  const stripeCanvas = makeCanvas(160, 16).canvas;
  const stripeTexture = toTexture(stripeCanvas);
  const canopyMaterial = new THREE.MeshStandardMaterial({ map: stripeTexture, roughness: 0.75, side: THREE.DoubleSide });
  const boardTexture = createBoardTexture().texture;
  const boardMaterial = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.4 });
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xc9d1d6, roughness: 0.35, metalness: 0.6, envMap });
  const grillMaterial = new THREE.MeshStandardMaterial({ color: 0x3b3640, roughness: 0.6, metalness: 0.3 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x3b3640, roughness: 0.9 });
  const coalMaterial = new THREE.MeshStandardMaterial({ color: 0x5a1a10, emissive: 0xff5a1a, roughness: 0.9 });
  const sausageMaterial = new THREE.MeshStandardMaterial({ color: 0xc8402e, roughness: 0.35, emissive: 0x501008, emissiveIntensity: 0.25 });
  const stickMaterial = new THREE.MeshStandardMaterial({ color: 0xf3e2c0, roughness: 0.7 });
  const marbleMaterial = new THREE.MeshStandardMaterial({ color: 0xd8f4ff, roughness: 0.05, metalness: 0.2, envMap, transparent: true, opacity: 0.85 });
  const pinMaterial = new THREE.MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.25, metalness: 0.8, envMap });
  const gasMaterial = new THREE.MeshStandardMaterial({ color: 0xe0393b, roughness: 0.45 });
  const stoolMaterial = new THREE.MeshStandardMaterial({ color: 0xe8473f, roughness: 0.45 });
  const cableMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3f4f, roughness: 0.6 });
  const bulbMaterial = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffd36a, roughness: 0.3 });
  // 招牌底板：紅色（目前空白，不放字）
  const signBoardMaterial = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.5 });

  function applyColors() {
    const c = settings.colors;
    cartMaterial.color.set(c.cart);
    trimMaterial.color.set(c.trim);
    darkTrimMaterial.color.set(c.trim).multiplyScalar(0.62);
    drawStripes(stripeCanvas, c.canopy);
    stripeTexture.needsUpdate = true;
    boardMaterial.color.set(c.board);
  }

  // ── 推車 ──
  const cartY = CART_BOTTOM + CART_H / 2;
  // 車身
  const cartBody = new THREE.Mesh(new THREE.BoxGeometry(CART_W, CART_H, CART_D), [
    cartMaterial,
    cartMaterial,
    cartMaterial,
    cartMaterial,
    cartMaterial,
    cartMaterial,
  ]);
  cartBody.position.y = cartY;
  content.add(cartBody);
  // 車身上下兩條收邊
  content.add(box(CART_W + 0.02, 0.04, CART_D + 0.02, darkTrimMaterial, 0, CART_BOTTOM + 0.02, 0));
  // 檯面：比車身大一圈
  content.add(box(CART_W + 0.12, COUNTER_T, CART_D + 0.14, trimMaterial, 0, COUNTER_Y + COUNTER_T / 2, 0));
  // 兩個輪子（車身左右兩側）＋另一頭兩根短腳
  for (const z of [-CART_D / 2 - 0.03, CART_D / 2 + 0.03]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.03, 0.035, 10, 24), tireMaterial);
    wheel.position.set(-0.38, WHEEL_R, z);
    content.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), metalMaterial);
    hub.rotation.x = Math.PI / 2;
    hub.position.copy(wheel.position);
    content.add(hub);
    content.add(box(0.05, CART_BOTTOM, 0.05, darkTrimMaterial, 0.55, CART_BOTTOM / 2, z * 0.85));
  }
  // 推把：車身右側伸出去
  content.add(box(0.3, 0.03, 0.03, metalMaterial, CART_W / 2 + 0.14, COUNTER_Y - 0.08, -0.2));
  content.add(box(0.3, 0.03, 0.03, metalMaterial, CART_W / 2 + 0.14, COUNTER_Y - 0.08, 0.2));
  content.add(box(0.03, 0.03, 0.43, metalMaterial, CART_W / 2 + 0.28, COUNTER_Y - 0.08, 0));

  // ── 烤肉架＋香腸（檯面左半邊） ──
  const grill = new THREE.Group();
  grill.position.set(-0.33, COUNTER_TOP, 0);
  content.add(grill);
  const grillW = 0.56;
  const grillD = 0.42;
  const grillH = 0.1;
  grill.add(box(grillW, grillH, grillD, grillMaterial, 0, grillH / 2, 0));
  // 炭火：烤架盒子上面一片發光的紅橘色
  const coals = new THREE.Mesh(new THREE.PlaneGeometry(grillW - 0.06, grillD - 0.06), coalMaterial);
  coals.rotation.x = -Math.PI / 2;
  coals.position.y = grillH + 0.002;
  grill.add(coals);
  // 炭塊：幾顆小石頭狀的東西，讓炭火不是平平一片
  for (let k = 0; k < 10; k++) {
    const coal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), coalMaterial);
    coal.position.set(((k * 37) % 9) / 9 * (grillW - 0.12) - (grillW - 0.12) / 2, grillH + 0.012, ((k * 53) % 7) / 7 * (grillD - 0.12) - (grillD - 0.12) / 2);
    coal.rotation.set(k, k * 2, 0);
    grill.add(coal);
  }
  // 烤網：一條條沿 x 的細鐵條
  const barY = grillH + 0.045;
  for (let k = 0; k < 7; k++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, grillW - 0.02, 6), metalMaterial);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, barY, -grillD / 2 + 0.04 + (k / 6) * (grillD - 0.08));
    grill.add(bar);
  }
  // 香腸：膠囊形狀、沿 z 擺（竹籤從前面伸出來），update() 裡慢慢翻面
  const sausages: THREE.Object3D[] = [];
  for (let k = 0; k < 5; k++) {
    const holder = new THREE.Group();
    holder.position.set(-grillW / 2 + 0.07 + k * 0.105, barY + 0.035, 0);
    grill.add(holder);
    const sausage = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.24, 6, 12), sausageMaterial);
    sausage.rotation.x = Math.PI / 2;
    holder.add(sausage);
    // 烤痕：兩圈深色細環
    for (const z of [-0.06, 0.06]) {
      const mark = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.005, 6, 16), grillMaterial);
      mark.position.z = z;
      holder.add(mark);
    }
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.18, 6), stickMaterial);
    stick.rotation.x = Math.PI / 2;
    stick.position.z = 0.22;
    holder.add(stick);
    sausages.push(holder);
  }
  // 檯面最前面插一杯烤好的香腸（直立的竹籤）
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 14), trimMaterial);
  cup.position.set(-0.6, COUNTER_TOP + 0.05, 0.3);
  content.add(cup);
  for (let k = 0; k < 3; k++) {
    const ready = new THREE.Group();
    ready.position.set(-0.6 + (k - 1) * 0.025, COUNTER_TOP + 0.1, 0.3 + ((k % 2) - 0.5) * 0.02);
    ready.rotation.z = (k - 1) * 0.2;
    content.add(ready);
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.14, 4, 10), sausageMaterial);
    s.position.y = 0.13;
    ready.add(s);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 5), stickMaterial);
    stick.position.y = 0.02;
    ready.add(stick);
  }

  // ── 彈珠台（檯面右半邊，斜斜躺著，越後面越高） ──
  const boardW = 0.46;
  const boardL = 0.62;
  const boardTilt = 0.42;
  const board = new THREE.Group();
  board.position.set(0.32, COUNTER_TOP + 0.03, 0.27);
  // 盤面原本在 xy 平面（朝 +z）；繞 x 轉 -(90° - 傾角)：上緣往後、往上翹，盤面朝上偏前，客人看得到
  board.rotation.x = -(Math.PI / 2 - boardTilt);
  content.add(board);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(boardW, boardL), boardMaterial);
  face.position.set(0, boardL / 2, 0.001);
  board.add(face);
  // 木框四邊
  board.add(box(boardW + 0.06, 0.04, 0.05, trimMaterial, 0, -0.01, 0.015));
  board.add(box(boardW + 0.06, 0.04, 0.05, trimMaterial, 0, boardL + 0.01, 0.015));
  board.add(box(0.035, boardL + 0.06, 0.05, trimMaterial, -boardW / 2 - 0.012, boardL / 2, 0.015));
  board.add(box(0.035, boardL + 0.06, 0.05, trimMaterial, boardW / 2 + 0.012, boardL / 2, 0.015));
  // 背面撐腳：讓彈珠台看起來是架在檯面上
  board.add(box(boardW, 0.03, 0.02, darkTrimMaterial, 0, boardL * 0.8, -0.04));
  // 釘子：交錯排列的小鐵釘（InstancedMesh 一次畫完）
  const pinRows = 7;
  const pinCols = 6;
  const pins = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6), pinMaterial, pinRows * pinCols);
  {
    const matrix = new THREE.Matrix4();
    const rotate = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    let n = 0;
    for (let r = 0; r < pinRows; r++) {
      for (let c = 0; c < pinCols; c++) {
        const x = -boardW / 2 + 0.05 + c * ((boardW - 0.1) / (pinCols - 1)) + (r % 2 ? 0.03 : 0);
        const y = 0.12 + r * ((boardL - 0.24) / (pinRows - 1));
        matrix.makeTranslation(Math.min(x, boardW / 2 - 0.03), y, 0.015).multiply(rotate);
        pins.setMatrixAt(n++, matrix);
      }
    }
  }
  board.add(pins);
  // 彈射桿：右邊一根拉桿＋紅色握把
  board.add(box(0.012, boardL * 0.55, 0.012, metalMaterial, boardW / 2 + 0.05, boardL * 0.3, 0.03));
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), stoolMaterial);
  knob.position.set(boardW / 2 + 0.05, 0.0, 0.05);
  board.add(knob);
  // 玻璃彈珠：update() 裡從上面一路左右彈跳滾到下面，再從上面重來
  const MARBLE_R = 0.02;
  const marbles = Array.from({ length: 3 }, (_, i) => {
    const marble = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_R, 12, 10), marbleMaterial);
    board.add(marble);
    return { mesh: marble, phase: i / 3, x0: (i - 1) * 0.11 };
  });
  // 檯面上一小堆備用彈珠
  for (let k = 0; k < 4; k++) {
    const spare = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_R, 10, 8), marbleMaterial);
    spare.position.set(0.58 + (k % 2) * 0.03, COUNTER_TOP + MARBLE_R, 0.32 + Math.floor(k / 2) * 0.03);
    content.add(spare);
  }

  // ── 布篷：四根柱子、後高前低的條紋篷、前緣扇貝垂邊、篷頂空白招牌、一排小燈泡 ──
  for (const [x, z] of [
    [-POLE_X, -POLE_Z],
    [POLE_X, -POLE_Z],
    [-POLE_X, POLE_Z],
    [POLE_X, POLE_Z],
  ]) {
    const top = z < 0 ? CANOPY_BACK_Y : CANOPY_FRONT_Y;
    content.add(box(0.035, top - COUNTER_Y, 0.035, darkTrimMaterial, x, (COUNTER_Y + top) / 2, z));
  }
  const canopyW = POLE_X * 2 + 0.16;
  const canopyD = POLE_Z * 2 + 0.24;
  const slope = Math.atan2(CANOPY_BACK_Y - CANOPY_FRONT_Y, POLE_Z * 2);
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(canopyW, canopyD / Math.cos(slope)), canopyMaterial);
  roof.rotation.x = -Math.PI / 2 + slope;
  roof.position.set(0, (CANOPY_BACK_Y + CANOPY_FRONT_Y) / 2 + 0.01, 0);
  content.add(roof);
  // 前緣垂邊（扇貝）
  const frontEdgeY = CANOPY_FRONT_Y - Math.tan(slope) * 0.12;
  const frontEdgeZ = canopyD / 2;
  const scallops = 11;
  for (let k = 0; k < scallops; k++) {
    const r = canopyW / scallops / 2;
    const scallop = new THREE.Mesh(new THREE.CircleGeometry(r, 14, Math.PI, Math.PI), canopyMaterial);
    scallop.position.set(-canopyW / 2 + r * (2 * k + 1), frontEdgeY, frontEdgeZ);
    content.add(scallop);
  }
  // 篷頂的大招牌：立在布篷後半邊、正面朝前。目前先留空白（之後要放字，把底板換成有字的貼圖即可）
  const signW = 0.9;
  const signH = 0.3;
  content.add(box(signW + 0.05, signH + 0.05, 0.04, darkTrimMaterial, 0, CANOPY_BACK_Y + signH / 2 + 0.02, -POLE_Z + 0.01));
  content.add(box(signW, signH, 0.05, signBoardMaterial, 0, CANOPY_BACK_Y + signH / 2 + 0.02, -POLE_Z + 0.02));
  // 一排小燈泡：沿著前緣垂下來的電線
  const bulbs: THREE.Mesh[] = [];
  {
    const points: THREE.Vector3[] = [];
    const count = 9;
    for (let k = 0; k < count; k++) {
      const t = k / (count - 1);
      const x = -canopyW / 2 + 0.05 + t * (canopyW - 0.1);
      // 兩根柱子之間各垂一段
      const sag = 0.05 * Math.sin(t * Math.PI * 2) ** 2;
      points.push(new THREE.Vector3(x, frontEdgeY - 0.07 - sag, frontEdgeZ + 0.01));
    }
    content.add(
      new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 48, 0.004, 4, false), cableMaterial),
    );
    for (const p of points) {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), bulbMaterial.clone());
      bulb.position.copy(p).add(new THREE.Vector3(0, -0.025, 0));
      content.add(bulb);
      bulbs.push(bulb);
    }
  }

  // ── 地上的東西 ──
  // 紅色瓦斯桶：放在推車左邊
  const gas = new THREE.Group();
  gas.position.set(-CART_W / 2 - 0.16, 0, 0.05);
  content.add(gas);
  const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.2, 6, 16), gasMaterial);
  tank.position.y = 0.2;
  gas.add(tank);
  const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.06, 10), metalMaterial);
  valve.position.y = 0.42;
  gas.add(valve);
  // 瓦斯管接到烤架
  const hose = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-CART_W / 2 - 0.16, 0.44, 0.05),
    new THREE.Vector3(-CART_W / 2 - 0.1, 0.55, 0.1),
    new THREE.Vector3(-CART_W / 2 + 0.05, COUNTER_TOP + 0.05, 0.12),
  ]);
  content.add(new THREE.Mesh(new THREE.TubeGeometry(hose, 16, 0.008, 5, false), cableMaterial));
  // 紅色塑膠矮凳：彈珠台前面
  const stool = new THREE.Group();
  stool.position.set(0.35, 0, CART_D / 2 + 0.32);
  content.add(stool);
  const stoolBody = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.07, 0.2, 16, 1, true), stoolMaterial);
  stoolBody.position.y = 0.1;
  stool.add(stoolBody);
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 18), stoolMaterial);
  seat.position.y = 0.205;
  stool.add(seat);

  // ── 烤香腸的煙：幾團白白的光往上飄 ──
  const smokeMaterial = new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.4 });
  const smokes = Array.from({ length: 4 }, (_, i) => {
    const sprite = new THREE.Sprite(smokeMaterial.clone());
    sprite.raycast = () => {};
    content.add(sprite);
    return { sprite, phase: i / 4, x: -0.45 + i * 0.08 };
  });
  // 炭火的光暈
  const fireGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }),
  );
  fireGlow.position.set(-0.33, COUNTER_TOP + 0.2, 0.05);
  fireGlow.scale.setScalar(0.7);
  // Sprite 的射線判定需要 raycaster.camera，拖曳工具沒設定會報錯；光暈、煙本來也不該被點到
  fireGlow.raycast = () => {};
  content.add(fireGlow);

  content.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.material !== marbleMaterial;
    mesh.receiveShadow = true;
  });

  // 模型原始寬度（含推把、瓦斯桶）：size 設定的是整個攤子的寬
  const modelWidth = CART_W + 0.6;

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
    // 炭火忽明忽暗（兩個不同頻率的 sin 疊起來，比較不規則）
    const flicker = 0.8 + 0.12 * Math.sin(time * 7.3) + 0.08 * Math.sin(time * 13.1);
    coalMaterial.emissiveIntensity = 1.1 * flicker * glow;
    fireGlow.material.opacity = 0.35 * flicker * Math.min(1, glow);
    // 小燈泡：一顆亮一顆暗輪流閃（跑馬燈）
    bulbs.forEach((bulb, k) => {
      const on = 0.5 + 0.5 * Math.sin(time * 4 - k * 1.2);
      (bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = (0.4 + 1.1 * on) * glow;
    });
    // 香腸慢慢翻面
    sausages.forEach((holder, k) => {
      holder.rotation.z = Math.sin(time * 0.8 + k) * 0.6;
    });
    // 煙：往上飄、變大、變淡
    for (const smoke of smokes) {
      const t = (time * 0.4 + smoke.phase) % 1;
      smoke.sprite.position.set(smoke.x + Math.sin(time * 1.5 + smoke.phase * 6) * 0.05, COUNTER_TOP + 0.2 + t * 0.6, 0);
      smoke.sprite.scale.setScalar(0.15 + t * 0.3);
      smoke.sprite.material.opacity = 0.4 * Math.sin(t * Math.PI);
    }
    // 彈珠：從上往下滾，左右彈來彈去（撞到釘子的感覺），滾到底再從上面重來
    for (const marble of marbles) {
      const t = (time * 0.32 + marble.phase) % 1;
      const y = boardL - 0.06 - t * (boardL - 0.12);
      const bounce = Math.abs(Math.sin(t * Math.PI * 7)) * 0.05 * (Math.floor(t * 7) % 2 ? 1 : -1);
      const x = THREE.MathUtils.clamp(marble.x0 + bounce, -boardW / 2 + 0.04, boardW / 2 - 0.04);
      marble.mesh.position.set(x, y, MARBLE_R + 0.002);
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

export function formatSausageStallSettingsForPaste(s: SausageStallSettings) {
  return (
    `// 貼回 src/world/objects/sausageStall.ts 的 SAUSAGE_STALL_DEFAULT\n` +
    `export const SAUSAGE_STALL_DEFAULT: SausageStallSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
    `  azimuthDegrees: ${s.azimuthDegrees},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  sink: ${s.sink.toFixed(3)},\n` +
    `  glow: ${s.glow.toFixed(2)},\n` +
    `  colors: {\n` +
    `    canopy: '${s.colors.canopy}',\n` +
    `    cart: '${s.colors.cart}',\n` +
    `    trim: '${s.colors.trim}',\n` +
    `    board: '${s.colors.board}',\n` +
    `  },\n` +
    `};`
  );
}
