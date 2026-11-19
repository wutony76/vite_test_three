import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 小豬頭上的烏雲：隨機在「沒有／下雨／打雷／暴雨／爆米花／甜甜圈」之間切換。
 *
 * 爆米花、甜甜圈是「點心雨」：雲變成淡黃色／粉紅色，掉下來的不是雨滴而是一顆顆小點心，
 * 會邊掉邊翻滾，落地後彈一下、停一下再縮小消失（雨滴是碰到地面就重新從雲底掉）。
 *
 * 整朵雲掛在小豬的 anchor 底下 → 小豬走到哪、雲就跟到哪，
 * 而且 anchor 的 local Y 就是球面法線，雨直接往 local -Y 掉就是「往地面掉」，不用自己算重力方向。
 * 所有尺寸都以「小豬身長」為單位（anchor 底下的 local 長度），調小豬大小時雲和雨會一起縮放。
 */

export type PigCloudState = 'none' | 'rain' | 'thunder' | 'storm' | 'popcorn' | 'donut';
export type PigCloudForce = 'random' | PigCloudState;

export const PIG_CLOUD_STATES: readonly PigCloudForce[] = ['random', 'none', 'rain', 'thunder', 'storm', 'popcorn', 'donut'];

export type PigCloudSettings = {
  enabled: boolean;
  /** 'random' = 隨機輪流；其他值 = 固定在該狀態（給面板 debug 用） */
  forceState: PigCloudForce;
  /** 雲底離地高度（小豬身長的倍數） */
  height: number;
  /** 雲的寬度（小豬身長的倍數） */
  size: number;
  /** 雲繞自己的垂直軸（球面法線）轉幾度：調整雲的「正面」朝哪邊 */
  rotationDegrees: number;
  /** 自轉速度（度/秒）；0 = 不自轉，負數 = 反方向轉 */
  spinDegreesPerSecond: number;
  /** 每個狀態維持的秒數範圍 */
  minSeconds: number;
  maxSeconds: number;
  /** 抽到各狀態的權重（越大越常出現；0 = 不會出現） */
  weightNone: number;
  weightRain: number;
  weightThunder: number;
  weightStorm: number;
  /** 淡黃色的雲，下爆米花 */
  weightPopcorn: number;
  /** 粉紅色的雲，下「半個環淋了草莓醬」的甜甜圈 */
  weightDonut: number;
  /** 爆米花大小（小豬身長的倍數） */
  popcornSize: number;
  /** 甜甜圈大小（小豬身長的倍數） */
  donutSize: number;
  /** 同時在空中的爆米花數量 */
  popcornCount: number;
  /** 同時在空中的甜甜圈數量 */
  donutCount: number;
};

export const PIG_CLOUD_DEFAULT: PigCloudSettings = {
  enabled: true,
  forceState: 'random',
  height: 1.8,
  size: 0.7,
  rotationDegrees: -64,
  spinDegreesPerSecond: 0,
  minSeconds: 5,
  maxSeconds: 10,
  weightNone: 3,
  weightRain: 2,
  weightThunder: 1.5,
  weightStorm: 1,
  weightPopcorn: 1.2,
  weightDonut: 1.2,
  // 0.12／0.26 時從預設鏡頭距離看只是幾個小點，看不出是什麼
  popcornSize: 0.24,
  donutSize: 0.45,
  popcornCount: 14,
  donutCount: 3,
};

/** 點心雨的種類：none = 這個狀態不掉點心 */
type TreatKind = 'none' | 'popcorn' | 'donut';

/** 每種狀態的外觀參數 */
const STATE_LOOK: Record<PigCloudState, {
  color: number;
  drops: number;
  fallSpeed: number;
  slant: number;
  strikeMin: number;
  strikeMax: number;
  shake: number;
  /** 掉什麼點心；treats：同時在空中的點心數；treatSpeed：每秒落下幾個身長 */
  treat: TreatKind;
  treats: number;
  treatSpeed: number;
  /** 雲自己發一點光（用雲的顏色）：淡黃、粉紅這種粉彩色背光那面會變灰，加一點光才「粉」得起來 */
  glow: number;
}> = {
  // drops：同時在空中的雨滴數；fallSpeed：每秒落下幾個身長；slant：雨斜的角度（弧度）
  // strikeMin/Max：兩次閃電間隔秒數（0 = 不打雷）；shake：雲抖動幅度
  none: { color: 0xc4ccd6, drops: 0, fallSpeed: 3, slant: 0, strikeMin: 0, strikeMax: 0, shake: 0, treat: 'none', treats: 0, treatSpeed: 0, glow: 0 },
  rain: { color: 0xa9b4c2, drops: 14, fallSpeed: 3.2, slant: 0.08, strikeMin: 0, strikeMax: 0, shake: 0, treat: 'none', treats: 0, treatSpeed: 0, glow: 0 },
  thunder: { color: 0x737d8c, drops: 0, fallSpeed: 3.2, slant: 0, strikeMin: 1.2, strikeMax: 3, shake: 0.01, treat: 'none', treats: 0, treatSpeed: 0, glow: 0 },
  storm: { color: 0x555e6c, drops: 30, fallSpeed: 5.2, slant: 0.32, strikeMin: 0.7, strikeMax: 2, shake: 0.025, treat: 'none', treats: 0, treatSpeed: 0, glow: 0 },
  // 點心雨：比雨慢很多（輕飄飄掉下來才看得清楚是什麼），數量也少（點心比雨滴大很多）
  popcorn: { color: 0xfff3b8, drops: 0, fallSpeed: 3, slant: 0, strikeMin: 0, strikeMax: 0, shake: 0, treat: 'popcorn', treats: 14, treatSpeed: 1.5, glow: 0.35 },
  donut: { color: 0xffbfd6, drops: 0, fallSpeed: 3, slant: 0, strikeMin: 0, strikeMax: 0, shake: 0, treat: 'donut', treats: 6, treatSpeed: 1.1, glow: 0.3 },
};

/**
 * 點心同時存在的上限（空中＋地上還沒消失的）。落地的點心會停一下才縮掉，也佔名額，
 * 所以要比「同時在空中的數量」多不少；面板數量滑桿的上限是 20，這裡留到 32
 */
const MAX_TREATS = 32;
/** 點心落地後停留幾秒才開始縮小消失 */
const TREAT_REST_SECONDS = 0.7;
/** 縮小消失要幾秒 */
const TREAT_FADE_SECONDS = 0.35;

/**
 * 爆米花：幾顆大小不一的 20 面體（不細分，low poly）擠成一團，像爆開的玉米粒。
 * 頂點上色（vertexColors）：大部分奶油白、少數幾顆偏奶油黃 —— 一個幾何、一個材質，
 * 整批爆米花用 InstancedMesh 1 次 draw call 畫完。大小約 1（之後再乘上身長縮放）。
 */
function createPopcornGeometry() {
  const puffs: Array<[number, number, number, number, number]> = [
    // x, y, z, 半徑, 顏色
    [0, 0, 0, 0.32, 0xfff8e6],
    [0.26, 0.1, 0.05, 0.24, 0xfff3d6],
    [-0.22, 0.12, -0.08, 0.25, 0xfff8e6],
    [0.05, 0.28, 0.1, 0.22, 0xffe7a3],
    [-0.04, -0.2, 0.18, 0.2, 0xfff3d6],
    [0.12, -0.08, -0.24, 0.19, 0xffd977],
  ];
  const color = new THREE.Color();
  const parts = puffs.map(([x, y, z, r, hex]) => {
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.translate(x, y, z);
    color.setHex(hex);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < g.attributes.position.count; i++) color.toArray(colors, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  });
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged ?? new THREE.IcosahedronGeometry(0.4, 0);
}

/**
 * 甜甜圈：胖胖的圓環（Torus），平躺（洞朝上），「半個環」淋了草莓醬。
 * 草莓醬也是頂點上色：只有頂面、而且只有繞一圈的其中一半染成草莓紅，
 * 邊界用 sin 做出不規則的波浪（像醬往下流了幾道），看起來是淋上去的，不是整齊切一半。一個幾何、一個材質。
 */
function createDonutGeometry() {
  const g = new THREE.TorusGeometry(0.33, 0.2, 8, 20);
  // TorusGeometry 預設立著（洞朝 z），轉成平躺：洞朝上（y）
  g.rotateX(-Math.PI / 2);
  const dough = new THREE.Color(0xe9b46a);
  const baked = new THREE.Color(0xc98a45);
  const jam = new THREE.Color(0xe0304a);
  const position = g.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    // 只有「半個環」有草莓醬：繞一圈的角度 around 在 0～π 那一半（兩端用 sin 抖一下，不是一刀切齊）
    // 而且只塗頂面：從鏡頭的高角度看，另一半露出麵團，一眼看得出是甜甜圈
    const around = Math.atan2(z, x);
    const halfEdge = Math.sin(around) + 0.18 * Math.sin(around * 7 + 0.6);
    const topEdge = 0.02 + 0.04 * Math.sin(around * 5) + 0.02 * Math.sin(around * 11 + 1.3);
    if (halfEdge > 0 && y > topEdge) c.copy(jam);
    // 麵團：頂面淺、往下越烤越深（甜甜圈炸過的那一圈）
    else c.copy(dough).lerp(baked, THREE.MathUtils.clamp(-y / 0.2, 0, 1) * 0.8);
    c.toArray(colors, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * 一顆點心。位置是「綠球座標」（掛在綠球上，不是掛在小豬身上）：
 * 從雲底生出來的那一刻換算成綠球座標，之後自己往下掉、落地、停在原地；小豬走開，點心不會跟著跑。
 */
type Treat = {
  /** 落點的地表方向（單位向量，球心 → 地表）：沿著它往下掉，落地也是貼著它 */
  normal: THREE.Vector3;
  /** 地表離球心多遠（小豬腳底那一層） */
  surface: number;
  /** 離地多高（綠球單位） */
  height: number;
  /** 每秒往下掉多少（綠球單位） */
  speed: number;
  /** 翻滾的角度與速度（弧度、弧度/秒） */
  rotX: number;
  rotZ: number;
  spinX: number;
  spinZ: number;
  /** 大小（綠球單位） */
  size: number;
  /** falling = 往下掉；landed = 落地後停著（rest 秒數倒數，接著縮小） */
  phase: 'falling' | 'landed' | 'off';
  rest: number;
  /** 落地彈一下的速度（綠球單位/秒） */
  bounce: number;
};

const MAX_DROPS = 72;
const BOLT_SEGMENTS = 6;

/**
 * 用幾顆 20 面體（細分 1 次 = 80 面，low poly 但看得出圓）疊成一朵雲，再合併成一個幾何：
 * 合併後整朵雲只要 1 次 draw call；少了合併，7 顆球就是 7 次 draw call。
 * 寬度約 1（x 從 -0.58 到 0.57），底部約在 y = -0.2。
 */
function createCloudGeometry() {
  const blobs: Array<[number, number, number, number]> = [
    [0, 0.05, 0, 0.36],
    [0.3, -0.02, 0.04, 0.27],
    [-0.3, -0.02, -0.02, 0.28],
    [0.12, 0.2, -0.05, 0.25],
    [-0.14, 0.16, 0.08, 0.22],
    [0.05, -0.04, 0.2, 0.22],
    [-0.05, -0.04, -0.2, 0.22],
  ];
  const parts = blobs.map(([x, y, z, r]) => {
    const g = new THREE.IcosahedronGeometry(r, 1);
    // 稍微壓扁：雲是「一坨扁扁的棉花」，正圓球看起來像一串葡萄
    g.scale(1, 0.8, 1);
    g.translate(x, y * 0.8, z);
    return g;
  });
  const merged = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return merged ?? new THREE.IcosahedronGeometry(0.4, 1);
}

type Drop = { x: number; y: number; z: number; speed: number; length: number; active: boolean };

type CreatePigCloudOptions = {
  /** 小豬身長（anchor 底下的 local 長度），雲和雨都以它為單位 */
  getBodyLength: () => number;
};

export function createPigCloud({ getBodyLength }: CreatePigCloudOptions) {
  const settings: PigCloudSettings = { ...PIG_CLOUD_DEFAULT };

  const root = new THREE.Group();
  root.name = 'pig_cloud';

  // ---- 雲本體 ----
  const cloudMaterial = new THREE.MeshStandardMaterial({
    color: STATE_LOOK.rain.color,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    // 閃電時雲會從裡面亮起來：用 emissive（自發光）做，不用另外加燈。
    // 多加一盞 PointLight 會讓「整個場景」的材質都重新編譯 shader，只為了閃一下不划算
    emissive: 0xfff2b0,
    emissiveIntensity: 0,
    transparent: true,
  });
  const cloud = new THREE.Mesh(createCloudGeometry(), cloudMaterial);
  cloud.castShadow = true;
  cloud.renderOrder = 7;
  root.add(cloud);

  // ---- 雨：一個 InstancedMesh 畫全部雨滴 ----
  // 每滴都是同一個細長方塊，只是位置不同 → instancing 一次畫完；
  // 用 Line 雖然更省，但 WebGL 線寬固定 1px，小豬這麼小時雨幾乎看不見
  const dropMaterial = new THREE.MeshBasicMaterial({
    color: 0x9fd3ff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const rain = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dropMaterial, MAX_DROPS);
  rain.renderOrder = 7;
  // 雨滴會被搬到雲外面，自動算的包圍球不準 → 關掉視錐剔除，不然鏡頭一轉雨可能整片消失
  rain.frustumCulled = false;
  root.add(rain);
  const drops: Drop[] = Array.from({ length: MAX_DROPS }, () => ({
    x: 0, y: 0, z: 0, speed: 0, length: 0, active: false,
  }));

  // ---- 點心雨：爆米花、甜甜圈各一個 InstancedMesh ----
  // 頂點顏色決定外觀（爆米花的奶油白／黃、甜甜圈的麵包色／果醬紅），材質只要開 vertexColors
  const treatMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0, flatShading: true });
  const treatMeshes: Record<Exclude<TreatKind, 'none'>, THREE.InstancedMesh> = {
    popcorn: new THREE.InstancedMesh(createPopcornGeometry(), treatMaterial, MAX_TREATS),
    donut: new THREE.InstancedMesh(createDonutGeometry(), treatMaterial, MAX_TREATS),
  };
  /**
   * 點心不能掛在雲（小豬）底下：小豬一走，地上的點心會整片被拖走。
   * 改掛在小豬 anchor 的父節點（綠球 ground）上，跟小豬屁股的煙一樣（第一次 update 時才接上去，那時 anchor 已經有父節點）
   */
  const treatGroup = new THREE.Group();
  treatGroup.name = 'pig_cloud_treats';
  for (const mesh of Object.values(treatMeshes)) {
    mesh.castShadow = true;
    mesh.renderOrder = 7;
    // 點心散在綠球各處，自動算的包圍球不準 → 關掉視錐剔除
    mesh.frustumCulled = false;
    mesh.visible = false;
    treatGroup.add(mesh);
  }
  const treats: Treat[] = Array.from({ length: MAX_TREATS }, () => ({
    normal: new THREE.Vector3(0, 1, 0), surface: 1, height: 0, speed: 0,
    rotX: 0, rotZ: 0, spinX: 0, spinZ: 0, size: 0, phase: 'off', rest: 0, bounce: 0,
  }));
  /** 雲（root）→ 綠球座標的轉換：每格算一次，生點心時用 */
  const rootToGround = new THREE.Matrix4();
  const spawnPoint = new THREE.Vector3();
  const treatQuat = new THREE.Quaternion();
  const treatUp = new THREE.Vector3(0, 1, 0);
  /** 目前場上的點心是哪一種（換天氣時，地上的舊點心照樣縮完才消失） */
  let treatKind: Exclude<TreatKind, 'none'> = 'popcorn';
  const treatEuler = new THREE.Euler();

  // ---- 閃電：幾段細方塊接成鋸齒 ----
  const boltMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff3a0,
    // 不吃 tone mapping：閃電要是場景裡最亮的東西，被 tone mapping 壓暗就不像電了
    toneMapped: false,
    transparent: true,
  });
  const bolt = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), boltMaterial, BOLT_SEGMENTS);
  bolt.frustumCulled = false;
  bolt.visible = false;
  bolt.renderOrder = 8;
  root.add(bolt);

  const dummy = new THREE.Object3D();
  const segA = new THREE.Vector3();
  const segB = new THREE.Vector3();
  const segDir = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const lookColor = new THREE.Color();

  let state: PigCloudState = 'none';
  let stateTimer = 0;
  /**
   * 暫時收起（例如小豬去溜滑梯：進門、滑下、泡在水裡時不該有雲跟著）。
   * 收起時記住原本的天氣，恢復時直接回到那個天氣：重新抽的話可能抽到「沒有」，看起來就像雲沒回來
   */
  let suppressed = false;
  let stateBeforeSuppress: PigCloudState = 'none';
  /** 雲出現程度 0～1：切到「沒有」時縮小淡出，切回來時彈出來 */
  let appear = 0;
  let appearVelocity = 0;
  let strikeTimer = 0;
  /** 閃電動畫已經播了幾秒；< 0 表示沒在閃 */
  let strikeAge = -1;
  let time = Math.random() * 10;
  /** 自轉累積的角度（弧度）；跟手動旋轉分開存，拉「旋轉」滑桿時不會把自轉進度歸零 */
  let spinAngle = 0;

  function pickState(): PigCloudState {
    const entries: Array<[PigCloudState, number]> = [
      ['none', settings.weightNone],
      ['rain', settings.weightRain],
      ['thunder', settings.weightThunder],
      ['storm', settings.weightStorm],
      ['popcorn', settings.weightPopcorn],
      ['donut', settings.weightDonut],
    ];
    // 跟現在一樣的狀態權重減半：不然常常「換了」卻看起來沒變
    const weighted = entries.map(([s, w]) => [s, Math.max(0, w) * (s === state ? 0.5 : 1)] as const);
    const total = weighted.reduce((sum, [, w]) => sum + w, 0);
    if (total <= 0) return 'none';
    let r = Math.random() * total;
    for (const [s, w] of weighted) {
      r -= w;
      if (r <= 0) return s;
    }
    return 'none';
  }

  function scheduleStrike() {
    const look = STATE_LOOK[state];
    strikeTimer = look.strikeMax > 0 ? look.strikeMin + Math.random() * (look.strikeMax - look.strikeMin) : Infinity;
  }

  function setState(next: PigCloudState) {
    if (next === state) return;
    state = next;
    scheduleStrike();
  }

  /** 重新產生一條鋸齒閃電：從雲底往下，打在小豬旁邊（不是正中頭頂，才看得到它） */
  function buildBolt(cloudBottom: number, width: number, thickness: number) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const endX = side * width * (0.32 + Math.random() * 0.15);
    const endZ = (Math.random() - 0.5) * width * 0.3;
    const startX = side * width * 0.1;
    segA.set(startX, cloudBottom, 0);
    for (let i = 0; i < BOLT_SEGMENTS; i++) {
      const t = (i + 1) / BOLT_SEGMENTS;
      // 中間的點左右亂抖，最後一點落在地面；抖動越往下越小，才像「劈下去」而不是亂畫
      const jitter = i === BOLT_SEGMENTS - 1 ? 0 : (Math.random() - 0.5) * width * 0.28 * (1 - t * 0.5);
      segB.set(
        THREE.MathUtils.lerp(startX, endX, t) + jitter,
        THREE.MathUtils.lerp(cloudBottom, 0, t),
        THREE.MathUtils.lerp(0, endZ, t) + jitter * 0.4,
      );
      segDir.subVectors(segB, segA);
      const length = segDir.length();
      dummy.position.addVectors(segA, segB).multiplyScalar(0.5);
      // 方塊預設沿 Y 長，轉到這一段的方向
      dummy.quaternion.setFromUnitVectors(yAxis, segDir.normalize());
      dummy.scale.set(thickness, length, thickness);
      dummy.updateMatrix();
      bolt.setMatrixAt(i, dummy.matrix);
      segA.copy(segB);
    }
    bolt.instanceMatrix.needsUpdate = true;
  }

  function spawnDrop(drop: Drop, cloudBottom: number, width: number, body: number, scatterHeight: boolean) {
    const look = STATE_LOOK[state];
    drop.x = (Math.random() - 0.5) * width * 0.8;
    drop.z = (Math.random() - 0.5) * width * 0.45;
    // 第一次出現時散在整段高度上，不然所有雨滴會同時從雲底排成一整片往下掉
    drop.y = scatterHeight ? Math.random() * cloudBottom : cloudBottom;
    drop.speed = body * look.fallSpeed * (0.85 + Math.random() * 0.3);
    drop.length = body * (state === 'storm' ? 0.2 : 0.14) * (0.8 + Math.random() * 0.4);
    drop.active = true;
  }

  /**
   * 從雲底（雲的座標）生一顆點心，換算成綠球座標。
   * groundScale：雲的 1 單位 = 綠球的幾單位（小豬整體縮放），點心的大小、速度都要乘上它
   */
  function spawnTreat(treat: Treat, cloudBottom: number, width: number, body: number, kind: Exclude<TreatKind, 'none'>, scatterHeight: boolean, groundScale: number) {
    const look = STATE_LOOK[state];
    const localY = scatterHeight ? cloudBottom * (0.3 + Math.random() * 0.7) : cloudBottom;
    spawnPoint.set((Math.random() - 0.5) * width * 0.75, localY, (Math.random() - 0.5) * width * 0.45).applyMatrix4(rootToGround);
    // 這一點「往下」就是往球心：落點的地表方向 = 這一點的方向
    treat.normal.copy(spawnPoint).normalize();
    // 地表那一層：小豬腳底離球心的距離（雲的原點就是小豬腳底）
    treat.surface = rootOrigin.length();
    treat.height = Math.max(0, spawnPoint.length() - treat.surface);
    treat.speed = body * Math.max(0.2, look.treatSpeed) * (0.8 + Math.random() * 0.4) * groundScale;
    // 爆米花小顆、翻得快；甜甜圈大一點、慢慢晃（太大塊翻太快會像在丟飛盤）
    const popcorn = kind === 'popcorn';
    treat.size = body * Math.max(0.01, popcorn ? settings.popcornSize : settings.donutSize) * (0.85 + Math.random() * 0.3) * groundScale;
    treat.rotX = Math.random() * Math.PI * 2;
    treat.rotZ = Math.random() * Math.PI * 2;
    const spin = popcorn ? 6 : 1.6;
    treat.spinX = (Math.random() - 0.5) * spin;
    treat.spinZ = (Math.random() - 0.5) * spin;
    if (!popcorn) {
      // 甜甜圈大致平躺著掉（果醬朝上），只小幅度晃
      treat.rotX = (Math.random() - 0.5) * 0.6;
      treat.rotZ = (Math.random() - 0.5) * 0.6;
    }
    treat.phase = 'falling';
    treat.rest = TREAT_REST_SECONDS;
    treat.bounce = 0;
  }

  const rootOrigin = new THREE.Vector3();

  /** 點心雨：掉落 → 落地彈一下 → 停在原地一下 → 縮小消失；還在下就從雲底補新的 */
  function updateTreats(deltaTime: number, cloudBottom: number, width: number, body: number, want: number, kind: TreatKind) {
    // 接到綠球上（跟煙一樣）：root 的父節點是小豬 anchor，anchor 的父節點是綠球
    const anchor = root.parent;
    const ground = anchor?.parent;
    if (!anchor || !ground) return;
    if (treatGroup.parent !== ground) ground.add(treatGroup);
    // 雲座標 → 綠球座標：anchor（相對綠球）× root（相對 anchor）
    anchor.updateMatrix();
    root.updateMatrix();
    rootToGround.multiplyMatrices(anchor.matrix, root.matrix);
    rootOrigin.copy(anchor.position);
    const groundScale = anchor.scale.x;

    if (kind !== 'none' && kind !== treatKind) {
      // 換點心種類：場上剩下的舊點心直接收掉（同一個陣列，不能一半爆米花一半甜甜圈）
      for (const treat of treats) treat.phase = 'off';
      treatKind = kind;
    }
    let falling = 0;
    for (const treat of treats) if (treat.phase === 'falling') falling++;
    // 剛開始下（場上一顆都沒有）：第一批散在半空中，不然會整片從雲底一起掉；之後補的都從雲底出發
    const fresh = treats.every((treat) => treat.phase === 'off');
    let shown = 0;
    const mesh = treatMeshes[treatKind];
    for (let i = 0; i < MAX_TREATS; i++) {
      const treat = treats[i];
      if (treat.phase === 'off' && falling < want && kind !== 'none') {
        spawnTreat(treat, cloudBottom, width, body, kind, fresh, groundScale);
        falling++;
      }
      let scale = treat.size;
      // 落在地面上（點心中心離地一點點，不然會有一半陷進草裡）
      const restHeight = treat.size * 0.25;
      if (treat.phase === 'falling') {
        treat.height -= treat.speed * deltaTime;
        treat.rotX += treat.spinX * deltaTime;
        treat.rotZ += treat.spinZ * deltaTime;
        if (treat.height <= restHeight) {
          treat.height = restHeight;
          treat.phase = 'landed';
          treat.bounce = treat.size * 1.4;
          // 爆米花落地後隨便躺；甜甜圈平躺（果醬朝上）
          if (treatKind === 'donut') {
            treat.rotX = 0;
            treat.rotZ = 0;
          }
        }
      } else if (treat.phase === 'landed') {
        // 彈一下：往上的速度被「重力」慢慢扣掉，掉回地面就停（停在原地，不跟著小豬走）
        treat.height += treat.bounce * deltaTime;
        treat.bounce -= treat.size * 16 * deltaTime;
        if (treat.height <= restHeight) {
          treat.height = restHeight;
          treat.bounce = 0;
        }
        treat.rest -= deltaTime;
        if (treat.rest < 0) scale *= Math.max(0, 1 + treat.rest / TREAT_FADE_SECONDS);
        if (treat.rest <= -TREAT_FADE_SECONDS) treat.phase = 'off';
      }
      if (treat.phase !== 'off' && scale > 0) {
        dummy.position.copy(treat.normal).multiplyScalar(treat.surface + treat.height);
        // 先讓點心的「上」對齊落點的地表方向，再加上自己的翻滾：甜甜圈落地時才會平躺在球面上
        treatQuat.setFromUnitVectors(treatUp, treat.normal);
        dummy.quaternion.setFromEuler(treatEuler.set(treat.rotX, 0, treat.rotZ)).premultiply(treatQuat);
        dummy.scale.setScalar(scale);
        shown++;
      } else {
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = shown > 0;
    // 另一種點心的 mesh 永遠藏起來
    for (const [name, other] of Object.entries(treatMeshes)) if (name !== treatKind) other.visible = false;
  }

  /**
   * @param active 小豬是否已經在跑（入場動畫中雲先藏起來）
   */
  function update(deltaTime: number, active: boolean) {
    time += deltaTime;
    const body = Math.max(getBodyLength(), 1e-4);
    const width = body * settings.size;
    const cloudBottom = body * settings.height;

    // ---- 狀態切換 ----
    if (!active || !settings.enabled || suppressed) {
      setState('none');
    } else if (settings.forceState !== 'random') {
      setState(settings.forceState);
    } else {
      stateTimer -= deltaTime;
      if (stateTimer <= 0) {
        const min = Math.min(settings.minSeconds, settings.maxSeconds);
        const max = Math.max(settings.minSeconds, settings.maxSeconds);
        stateTimer = min + Math.random() * (max - min);
        setState(pickState());
      }
    }
    const look = STATE_LOOK[state];

    // ---- 雲出現／消失：用彈簧（spring）追目標，出現時會稍微「彈」一下比較卡通 ----
    const target = state === 'none' ? 0 : 1;
    appearVelocity += ((target - appear) * 90 - appearVelocity * 12) * deltaTime;
    appear += appearVelocity * deltaTime;
    if (target === 0 && appear < 0.01) {
      appear = 0;
      appearVelocity = 0;
    }
    const visibleCloud = appear > 0.01;
    cloud.visible = visibleCloud;

    // ---- 雲的位置、顏色、抖動 ----
    // 雲幾何的底部在 y = -0.2（寬度 1 時），所以中心要再往上抬 0.2 * 寬度，雲底才剛好在 cloudBottom
    const bob = Math.sin(time * 1.6) * width * 0.04;
    const shake = look.shake * width;
    // 整組（雲＋雨＋閃電）往鼻頭方向（local +Z）挪一點：雲罩在「頭」上，不是罩在肚子上
    root.position.z = body * 0.12;
    cloud.position.set(
      (Math.random() - 0.5) * shake,
      cloudBottom + width * 0.2 + bob + (Math.random() - 0.5) * shake,
      0,
    );
    cloud.scale.setScalar(width * Math.max(0.0001, appear));
    // 旋轉只轉雲本體（繞 local Y = 球面法線）；雨和閃電是從雲底往下掉，跟雲的朝向無關
    spinAngle = (spinAngle + THREE.MathUtils.degToRad(settings.spinDegreesPerSecond) * deltaTime) % (Math.PI * 2);
    cloud.rotation.y = THREE.MathUtils.degToRad(settings.rotationDegrees) + spinAngle;
    // 顏色慢慢過渡（約 0.5 秒），不會一換狀態就瞬間變黑
    lookColor.setHex(look.color);
    cloudMaterial.color.lerp(lookColor, Math.min(1, deltaTime * 3));
    cloudMaterial.opacity = THREE.MathUtils.clamp(appear * 1.2, 0, 1);

    // ---- 閃電 ----
    let flash = 0;
    if (visibleCloud && appear > 0.8) {
      strikeTimer -= deltaTime;
      if (strikeTimer <= 0 && strikeAge < 0) {
        strikeAge = 0;
        buildBolt(cloudBottom, width, body * 0.035);
        scheduleStrike();
      }
    }
    if (strikeAge >= 0) {
      strikeAge += deltaTime;
      // 閃兩下：亮 0.08 秒 → 暗 0.06 秒 → 再亮 0.1 秒，真的閃電通常會連閃
      const on = strikeAge < 0.08 || (strikeAge > 0.14 && strikeAge < 0.24);
      bolt.visible = on;
      flash = on ? 1 : 0.25;
      if (strikeAge > 0.24) {
        strikeAge = -1;
        bolt.visible = false;
      }
    } else {
      bolt.visible = false;
    }
    // 閃電時用暖白光；點心雲平常用自己的顏色微微發光（look.glow），粉彩色才不會在背光面發灰
    if (strikeAge >= 0) cloudMaterial.emissive.setHex(0xfff2b0);
    else cloudMaterial.emissive.copy(cloudMaterial.color);
    cloudMaterial.emissiveIntensity = THREE.MathUtils.lerp(cloudMaterial.emissiveIntensity, flash * 0.9 + look.glow, Math.min(1, deltaTime * 30));
    bolt.position.x = cloud.position.x;

    // ---- 雨 ----
    const wantDrops = visibleCloud && appear > 0.6 ? look.drops : 0;
    let activeCount = 0;
    for (const drop of drops) if (drop.active) activeCount++;
    let shown = 0;
    for (let i = 0; i < MAX_DROPS; i++) {
      const drop = drops[i];
      if (!drop.active && activeCount < wantDrops) {
        spawnDrop(drop, cloudBottom, width, body, true);
        activeCount++;
      }
      if (drop.active) {
        drop.y -= drop.speed * deltaTime;
        drop.x += Math.sin(look.slant) * drop.speed * deltaTime;
        if (drop.y <= 0) {
          // 落地：還需要雨就從雲底重新掉，不需要（停雨了）就收掉，雨會自然「下完」而不是瞬間消失
          if (activeCount <= wantDrops) spawnDrop(drop, cloudBottom, width, body, false);
          else {
            drop.active = false;
            activeCount--;
          }
        }
      }
      if (drop.active) {
        dummy.position.set(drop.x, drop.y + drop.length * 0.5, drop.z);
        dummy.quaternion.setFromAxisAngle(segDir.set(0, 0, 1), look.slant);
        dummy.scale.set(body * 0.03, drop.length, body * 0.03);
      } else {
        // 沒在用的雨滴縮成 0：InstancedMesh 不能單獨隱藏某一個 instance
        dummy.scale.setScalar(0);
      }
      dummy.updateMatrix();
      rain.setMatrixAt(i, dummy.matrix);
      if (drop.active) shown++;
    }
    rain.instanceMatrix.needsUpdate = true;
    rain.visible = shown > 0;

    // ---- 點心雨（爆米花、甜甜圈）----
    // 數量用面板設定（look.treats 只當「這個狀態會不會掉點心」的開關）
    const treatCount = look.treat === 'popcorn' ? settings.popcornCount : look.treat === 'donut' ? settings.donutCount : 0;
    const wantTreats = visibleCloud && appear > 0.6 && look.treats > 0 ? Math.max(0, Math.round(treatCount)) : 0;
    updateTreats(deltaTime, cloudBottom, width, body, wantTreats, look.treat);
  }

  return {
    object: root,
    settings,
    update,
    getState: () => state,
    /** 暫時收起烏雲（連雨、閃電）；false = 恢復成收起前的天氣 */
    setSuppressed: (on: boolean) => {
      if (on === suppressed) return;
      if (on) {
        stateBeforeSuppress = state;
        suppressed = true;
        // 半空中的雨滴、亮著的閃電也一起立刻清掉（不然雲縮掉後，還會看到幾滴雨掉下來、閃電閃一下）
        for (const drop of drops) drop.active = false;
        rain.visible = false;
        // 還在空中的點心收掉；已經落地的留在原地，照樣停一下再消失
        for (const treat of treats) if (treat.phase === 'falling') treat.phase = 'off';
        bolt.visible = false;
        return;
      }
      suppressed = false;
      if (settings.enabled && settings.forceState === 'random' && stateBeforeSuppress !== 'none') {
        setState(stateBeforeSuppress);
      }
    },
    /** 給測試／debug：目前在空中的雨滴數、閃電是否亮著 */
    getDebug: () => ({
      drops: drops.filter((d) => d.active).length,
      treats: treats.filter((t) => t.phase !== 'off').length,
      treatKind,
      bolt: bolt.visible,
      appear,
    }),
  };
}

/** 調完面板後可貼回 pigCloud.ts 的 PIG_CLOUD_DEFAULT */
export function formatPigCloudSettingsForPaste(s: PigCloudSettings) {
  return (
    `// 貼到 src/world/objects/pigCloud.ts\n` +
    `export const PIG_CLOUD_DEFAULT: PigCloudSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  forceState: '${s.forceState}',\n` +
    `  height: ${s.height.toFixed(2)},\n` +
    `  size: ${s.size.toFixed(2)},\n` +
    `  rotationDegrees: ${s.rotationDegrees.toFixed(0)},\n` +
    `  spinDegreesPerSecond: ${s.spinDegreesPerSecond.toFixed(0)},\n` +
    `  minSeconds: ${s.minSeconds.toFixed(1)},\n` +
    `  maxSeconds: ${s.maxSeconds.toFixed(1)},\n` +
    `  weightNone: ${s.weightNone.toFixed(1)},\n` +
    `  weightRain: ${s.weightRain.toFixed(1)},\n` +
    `  weightThunder: ${s.weightThunder.toFixed(1)},\n` +
    `  weightStorm: ${s.weightStorm.toFixed(1)},\n` +
    `  weightPopcorn: ${s.weightPopcorn.toFixed(1)},\n` +
    `  weightDonut: ${s.weightDonut.toFixed(1)},\n` +
    `  popcornSize: ${s.popcornSize.toFixed(2)},\n` +
    `  donutSize: ${s.donutSize.toFixed(2)},\n` +
    `  popcornCount: ${Math.round(s.popcornCount)},\n` +
    `  donutCount: ${Math.round(s.donutCount)},\n` +
    `};`
  );
}
