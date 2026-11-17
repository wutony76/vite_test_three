import * as THREE from 'three';
import { cloneGltfMaterialsOnly, loadGltfOnce } from './sharedGltf';
import { createSplash } from './splash';

const ROAST_CHICKEN_URL = `${import.meta.env.BASE_URL}models/roast_chicken/roast_chicken.glb`;
// 醬上漂的其他食物（香菇）：沿用綠球上已有的模型，跟球上的東西呼應
const SHIITAKE_URL = `${import.meta.env.BASE_URL}models/shiitake/shiitake.glb`;
// 薯條：細長方塊（不載入 GLB）；長邊與碰撞半徑以 REFERENCE 比例縮放
const FRY_REFERENCE_LENGTH = 0.06;
const FRY_REFERENCE_REACH = 0.038;
const FRY_REFERENCE_THICKNESS = 0.014;
// 長邊露出醬面的比例（舊 -0.026/0.06 縮放後小薯條幾乎全沉）
const FRY_EXPOSED_FRACTION = 0.42;

/** 醬海薯條外觀（控制面板可調） */
export type FryFoodSettings = {
  /** 薯條長邊公尺（截面依 REFERENCE 比例） */
  size: number;
};

const fryFoodSettings: FryFoodSettings = {
  // 0.027 時在畫面上只是一個小橘點；放大到看得出是一根薯條
  size: 0.045,
};

function fryCollisionReach() {
  return fryFoodSettings.size * (FRY_REFERENCE_REACH / FRY_REFERENCE_LENGTH);
}

function frySurfaceLift() {
  const half = fryFoodSettings.size * 0.5;
  const exposed = fryFoodSettings.size * FRY_EXPOSED_FRACTION;
  return exposed - half;
}

/** 醬海烤雞外觀（控制面板可調） */
export type ChickenFoodSettings = {
  /** 最長邊公尺，約 0.04 = 4cm */
  size: number;
  boneColor: string;
};

// 換成深番茄紅的醬之後，舊的深咖啡色表皮（#7e4120 等）跟醬糊成一團 → 改成亮一點的金黃烤色
const CHICKEN_CRUST_PALETTE = ['#e0952e', '#f2b246', '#c97a2a'] as const;

const chickenFoodSettings: ChickenFoodSettings = {
  size: 0.095,
  boneColor: '#fff8f0',
};

/** 醬上其他食物（香菇）的大小與所有食物的亮邊（控制面板可調） */
export type ExtraFoodSettings = {
  /** 香菇最長邊（公尺） */
  mushroomSize: number;
  /** 香菇中心離醬面多高（× 香菇大小）。越小沉越深；0 ≈ 一半泡在醬裡 */
  mushroomFloat: number;
  /** 食物邊緣亮光：讓食物從紅色的醬上「跳」出來，0 = 關閉 */
  rim: number;
};

/**
 * 香菇漂在醬上要「躺著」：直立時菇柄插進醬裡，看起來像從土裡長出來，不合邏輯。
 * 轉 70° 而不是 90°：菇柄橫躺、菇傘往上斜一點，比完全側立自然，也看得到菇傘上的十字花刀
 */
const MUSHROOM_LIE_DEGREES = 70;

const extraFoodSettings: ExtraFoodSettings = {
  mushroomSize: 0.075,
  // 0.3 時只沉一小截；使用者要「再沉下去一半」→ 約一半泡在醬裡
  mushroomFloat: 0,
  rim: 0.45,
};

/** 所有食物材質共用的亮邊強度：面板改這個值，全部食物立刻跟著變（不用重編 shader） */
const foodRimUniform = { value: extraFoodSettings.rim };

/**
 * 食物邊緣亮光（菲涅耳）：越側面越亮。
 * 少了它，金黃色的雞腿、薯條放在深紅色的醬上，邊緣會跟醬的暗部混在一起，看不出輪廓。
 * 用 userData 標記：同一個材質只包一次，避免重複注入
 */
function addFoodRim(material: THREE.Material) {
  if (material.userData.foodRim) return;
  material.userData.foodRim = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uFoodRim = foodRimUniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFoodRim;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.93, 0.8) * uFoodRim * pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);`,
      );
  };
  material.needsUpdate = true;
}

function addFoodRimToObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) addFoodRim(material);
  });
}

function mushroomReach() {
  return extraFoodSettings.mushroomSize * 0.55;
}

/** 每種食物沿著醬佔多長（碰撞半徑） */
function foodReach(kind: FoodKind) {
  if (kind === 'nugget') return chickenCollisionReach();
  if (kind === 'fry') return fryCollisionReach();
  return mushroomReach();
}

/** 每種食物的中心離醬面多高（負 = 一部分埋進醬裡） */
function foodLift(kind: FoodKind) {
  if (kind === 'nugget') return chickenSurfaceLift();
  if (kind === 'fry') return frySurfaceLift();
  // 香菇側躺漂著，沉多深由面板「香菇浮起高度」決定（× 香菇大小）
  return extraFoodSettings.mushroomSize * extraFoodSettings.mushroomFloat;
}

function pickChickenCrustColor(seed: number) {
  const random = createRandom(8800 + seed * 131);
  const index = Math.floor(random() * CHICKEN_CRUST_PALETTE.length);
  return CHICKEN_CRUST_PALETTE[index];
}

let chickenSourceRoot: THREE.Object3D | null = null;

function chickenCollisionReach() {
  return chickenFoodSettings.size * 0.9;
}

function chickenSurfaceLift() {
  return -chickenFoodSettings.size * 0.4;
}

// 番茄醬緞帶：沿著「繞球、上下起伏」的曲線長出一條管子，再用 shader 讓它流動

// 繞行半徑：比球（半徑 1）大一點，醬汁才會貼著球外圍繞，而不是陷進球裡
const ORBIT_RADIUS = 0.96;
// 管子粗細（半徑）
const TUBE_RADIUS = 0.12;
// 上下起伏的「最大」高度：隨機起伏再怎麼疊加都不會超過這個值
// const WAVE_HEIGHT = 0.03;
const WAVE_HEIGHT = 0;
// 隨機種子：換一個數字就會得到一條不同的起伏曲線；同一個數字每次重新整理都長一樣
const WAVE_SEED = 7;
// 整條緞帶繞球自轉的速度（弧度 / 秒）
const SPIN_SPEED = 0.15;
// 醬汁表面流動、蠕動的速度倍率：1 = 原速，0.5 = 慢一半，0 = 完全靜止
const FLOW_SPEED = 0.5;
// 醬汁表面浮動的幅度（沿表面往外推多少）：
// BLOB_AMOUNT   = 一團一團往前流的鼓包，越大鼓得越明顯
// WOBBLE_AMOUNT = 表面細微的蠕動
// 兩個加起來不要超過管子半徑的一半，不然最細處會凹到快斷掉
const BLOB_AMOUNT = 0.03;
const WOBBLE_AMOUNT = 0.012;
/** 醬汁管子最粗時的半徑（管子 + 鼓包 + 蠕動），給綠球上的小東西判斷「會不會被醬蓋到」 */
export const KETCHUP_TUBE_OUTER_RADIUS = TUBE_RADIUS + BLOB_AMOUNT + WOBBLE_AMOUNT;
// 環境反射強度（見材質的 envMapIntensity）
const ENV_INTENSITY = 0.4;
// 緞帶整圈的擺放角度：
// RING_TILT = 從水平往上翻幾度（0 = 水平繞球、π/2 = 垂直繞球，從球頂翻過去）
// RING_YAW  = 翻起來之後，整圈面向哪個方位（繞 y 軸轉）
// 用「度」來寫比較直覺：數值可以直接從控制面板抄過來
const RING_TILT = THREE.MathUtils.degToRad(131);
const RING_YAW = THREE.MathUtils.degToRad(107);
// 整圈的位置（世界座標）：三個都是 0 = 圈圈中心對準球心
// 可以在畫面上直接拖曳緞帶來調整（見 main.ts 的 enableViewPlaneDrag）
const RING_OFFSET_X = -0.44;
const RING_OFFSET_Y = 0.38;
const RING_OFFSET_Z = 0.13;
// 噴濺效果開關：false = 不建立醬滴、也不跑噴濺的模擬，效能完全不受影響
const SPLASH_ENABLED = false;
// 醬海裡烤雞的數量。控制面板可以改，這裡是一打開畫面時的數量
const FOOD_COUNT = 11;
// 一打開畫面時實際放幾塊。11 塊大多在綠球背面或畫面邊緣，前景常常一塊都看不到 → 多放一些。
// 前 FOOD_COUNT 塊的種類、位置維持原樣；多出來的依 EXTRA_FOOD_KINDS 輪流放（含香菇）
const FOOD_COUNT_DEFAULT = 20;
const EXTRA_FOOD_KINDS: FoodKind[] = ['mushroom', 'nugget', 'fry', 'mushroom', 'fry', 'nugget', 'mushroom', 'fry'];
// 滑桿上限。形狀和材質是共用的，不會每一塊都做一份新的
const FOOD_COUNT_MAX = 150;
// 番茄醬海：三角魚鰭（鯊魚），沿環較快游動
const SHARK_FIN_ENABLED = true;
// 淡紫粉（舊 0xc07ab8）不像鯊魚 → 深藍灰，在紅醬上對比清楚
const SHARK_FIN_COLOR = 0x56708c;
// 整圈進度 / 秒；烤雞約 0.006~0.046，鰭快很多才有「掠過醬海」的感覺
const SHARK_FIN_DRIFT = 0.115;
/** 沿醬環截面左右擺（弧度上限），0 = 貼外緣直線游 */
const SHARK_FIN_CURVE_AMP = 0.6;
/** 曲線游動快慢（弧度 / 秒 量級） */
const SHARK_FIN_CURVE_RATE = 1.15;
const SHARK_FIN_WAVE_ENABLED = true;
const SHARK_FIN_WAVE_INTERVAL = 0.17;
const SHARK_FIN_WAVE_LIFE = 0.88;
const SHARK_FIN_WAVE_SCALE = 2;
const SHARK_FIN_WAVE_OPACITY = 0.52;
const SHARK_FIN_WAVE_SIDE = 0.016;
const SHARK_FIN_WAVE_TRAIL = 0.028;
// 亮粉色（舊 0xff85e9）放在番茄紅上很突兀 → 奶油白，像醬被劃開翻起的亮面
const SHARK_FIN_WAVE_COLOR = 0xfff0dc;

/**
 * 簡單的「可重現亂數」（mulberry32）：同一個 seed 每次產生的數列都一樣
 * 為什麼不用 Math.random()？每次重新整理形狀都會變，調好的畫面就留不住了
 */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 產生隨機的上下起伏：把幾個不同頻率的 sin 波疊在一起
 * 單一個 sin 會規律得像波浪板；疊加後高低、間距都不一樣，看起來就像隨手淋上去的醬汁
 */
function createWaves(seed: number) {
  const random = createRandom(seed);
  // 頻率一定要是整數：繞一圈剛好走完整數個週期，頭尾高度才接得起來，不會斷一截
  const waves = [1, 2, 3, 5].map((frequency) => ({
    frequency,
    // 每個波的強度、起點（相位）都隨機
    amplitude: 0.3 + random() * 0.7,
    phase: random() * Math.PI * 2,
  }));
  // 用強度總和做正規化：所有波同時到頂也只會等於 1，乘上 WAVE_HEIGHT 就不會超過上限
  const total = waves.reduce((sum, wave) => sum + wave.amplitude, 0);
  return (angle: number) =>
    waves.reduce((sum, wave) => sum + Math.sin(angle * wave.frequency + wave.phase) * wave.amplitude, 0) / total;
}

const wave = createWaves(WAVE_SEED);

/**
 * 番茄醬的路徑：t 從 0 走到 1 就是繞球一圈
 * 繼承 THREE.Curve 只要實作 getPoint，TubeGeometry 就會沿著它長出管子
 */
class KetchupCurve extends THREE.Curve<THREE.Vector3> {
  // 繞行半徑：做成屬性而不是直接讀常數，控制面板調整時才能即時改
  radius: number;

  // @types/three 把 Curve 的建構子標成 protected（只准子類別呼叫），
  // 少了這個公開的建構子，外面 new KetchupCurve() 會被 TypeScript 擋下
  constructor(radius: number) {
    super();
    this.radius = radius;
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const angle = t * Math.PI * 2;
    // wave 回傳 -1 ~ 1 的隨機起伏，乘上 WAVE_HEIGHT 就是實際高度
    const y = wave(angle) * WAVE_HEIGHT;
    return target.set(Math.cos(angle) * this.radius, y, Math.sin(angle) * this.radius);
  }
}

/**
 * 醬汁質感（面板「番茄醬質感」可調，調完印出貼回 KETCHUP_SAUCE_DEFAULT）
 *
 * 舊版的問題：顏色是全場最飽和的 #e83055、粗糙度 0.42、清漆只有 0.2、又加了橘色自發光把暗部填平，
 * 再加上管子只切 25×8 段 → 前景一大片看起來像「紅色塑膠板」，看不出是濕亮的醬。
 */
export type KetchupSauceSettings = {
  /** 醬的主色（番茄醬是帶一點橘的暖深紅） */
  color: string;
  /** 暗部透出來的顏色（自發光），0 強度 = 不補光 */
  emissiveColor: string;
  emissiveStrength: number;
  roughness: number;
  /** 清漆層：濕亮感主要靠它 */
  clearcoat: number;
  clearcoatRoughness: number;
  envIntensity: number;
  /** 菲涅耳亮邊：越側面越亮，黏稠液體的邊緣特徵 */
  rimStrength: number;
  rimColor: string;
  rimPower: number;
  /** 貼著綠球那一側變暗的程度（接觸陰影） */
  contactDark: number;
  /** 沿著流動方向移動的高光條紋 */
  streakStrength: number;
  streakSpeed: number;
  /** 醬面的小氣泡亮點 */
  bubbleStrength: number;
  /** 小豬靠近醬邊時的漣漪 */
  rippleStrength: number;
  /** 小豬離醬面多近（世界單位）開始起漣漪 */
  rippleDistance: number;
};

export const KETCHUP_SAUCE_DEFAULT: KetchupSauceSettings = {
  color: '#c42a1f',
  emissiveColor: '#3a0c02',
  emissiveStrength: 0.6,
  roughness: 0.24,
  clearcoat: 0.7,
  clearcoatRoughness: 0.2,
  envIntensity: 0.5,
  rimStrength: 0.35,
  rimColor: '#ff9a7a',
  rimPower: 2.6,
  contactDark: 0.45,
  streakStrength: 0.12,
  streakSpeed: 1,
  bubbleStrength: 0.35,
  rippleStrength: 0.6,
  rippleDistance: 0.08,
};

/** 同時存在的漣漪數量上限（shader 的陣列長度） */
const RIPPLE_SLOTS = 4;
/** 一圈漣漪擴散多久（秒） */
const RIPPLE_LIFE = 1.4;

/**
 * 番茄醬的材質：緞帶和噴濺的醬滴共用同一組設定，顏色、光澤才會一致
 * 用函式每次產生新的一份，而不是共用同一個材質：緞帶會再加上流動變形，醬滴不需要
 */
function createKetchupMaterial(envMap: THREE.Texture) {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe83055,
    // color: 0xfffb8f,
    // 粗糙度低 = 表面滑順、高光集中，像濕潤的醬汁
    // 粗糙度低 = 表面滑順、高光集中。太陽很強時 0.15 會在畫面下緣亮成一顆白點，所以略為霧一點
    roughness: 0.42,
    // 清漆層：在表面再疊一層透明的亮面，醬汁「油亮」的感覺主要靠它
    // 不要全開：全開時下緣那條醬會亮過房子
    clearcoat: 0.2,
    clearcoatRoughness: 0.55,
    // 環境貼圖：讓側面、凹折處反射出柔和的環境光，不會變成死黑
    envMap,
    // 環境反射的強度：越大暗部越亮，但太大醬汁會泛白、黃光紫光的氣氛也會被沖淡
    envMapIntensity: ENV_INTENSITY,
    // 一點橙紅色的自發光：不受燈光影響，凹折處就算照不到光、反射也很弱，最暗也只會是橙紅，不會死黑
    // 亮面的燈光比它強很多會蓋過去，所以橙色只在暗部看得出來，整體還是紅的
    emissive: 0x5a1800,
  });
  // 管子貼在球面上，深度太接近會和綠球搶同一層像素而閃爍
  material.polygonOffset = true;
  material.polygonOffsetFactor = -4;
  material.polygonOffsetUnits = -4;
  return material;
}

/**
 * 沿著路徑長出管子，並加上 shader 用的 aProgress
 * 抽成函式：半徑改變時要整個重建，不能只改既有的形狀
 */
function createTubeGeometry(curve: KetchupCurve) {
  // 參數：路徑、沿路徑切幾段、管子半徑、管子圓周切幾段、頭尾是否接起來
  // 段數切細一點，下面 shader 推動頂點時表面才會平滑，不會一格一格
  // const geometry = new THREE.TubeGeometry(curve, 400, TUBE_RADIUS, 24, true);
  // 舊版 25×8 段：近看是一塊塊平面，高光只會一整片亮或一整片暗，看起來像塑膠板。
  // 200×24 段讓表面圓滑，清漆高光、亮邊才會是一條漂亮的弧線
  const geometry = new THREE.TubeGeometry(curve, 200, TUBE_RADIUS, 24, true);

  // aProgress：每個頂點在管子上走到哪裡（0 ~ 1），shader 用它算「哪一段該鼓起來」
  // TubeGeometry 的 uv.x 剛好就是沿管子的進度，複製一份成自訂屬性
  // 為什麼不直接用 uv？內建材質只有在用到貼圖時才會宣告 uv，沒貼圖時 shader 裡讀不到
  const uv = geometry.getAttribute('uv');
  const progress = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) progress[i] = uv.getX(i);
  geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
  // aRadial：繞管子一圈的位置（0 ~ 1），uv.y 就是。給小氣泡排格子用
  const radial = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) radial[i] = uv.getY(i);
  geometry.setAttribute('aRadial', new THREE.BufferAttribute(radial, 1));
  return geometry;
}

/**
 * 緞帶擺放的可調參數（給控制面板用）
 * 角度用「度」而不是弧度：拖拉面板時 135° 比 2.356 直覺得多
 */
export type KetchupRingSettings = {
  radius: number;
  tiltDegrees: number;
  yawDegrees: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
};

/** 醬汁外觀（除錯用，例如調透明看魚鰭） */
export type KetchupVisualSettings = {
  /** 1 = 不透明，0 = 全透明 */
  opacity: number;
};

/** 番茄醬海鯊魚鰭：控制面板可調 */
export type SharkFinSettings = {
  enabled: boolean;
  drift: number;
  /** true = 沿環正向游，false = 反向 */
  forward: boolean;
  color: string;
  lift: number;
  depth: number;
  /** 截面 S 擺幅度，0 = 貼外緣中線 */
  curveAmp: number;
  curveRate: number;
  /** 平均幾秒躍出醬面一次（0 = 不跳） */
  jumpEvery: number;
  /** 躍起的高度（世界單位） */
  jumpHeight: number;
};

/** 魚鰭兩側卡通水波：控制面板可調 */
export type SharkFinWaveSettings = {
  enabled: boolean;
  /** 兩道水波間隔（秒） */
  interval: number;
  /** 單道水波存活時間（秒） */
  life: number;
  /** 尺寸倍率 */
  scale: number;
  /** 峰值透明度 0~1 */
  opacity: number;
  /** 離鰭中心往兩側偏移（起點） */
  sideSpread: number;
  /** 落在鰭後方距離（起點） */
  trail: number;
  color: string;
};

type KetchupOptions = {
  envMap: THREE.Texture;
  camera: THREE.Camera;
};

export function createKetchup({ envMap, camera }: KetchupOptions) {
  const curve = new KetchupCurve(ORBIT_RADIUS);
  const geometry = createTubeGeometry(curve);

  const material = createKetchupMaterial(envMap);

  // 所有 shader 共用同一個 uniform 物件：每幀改 value，shader 就會讀到新的時間
  const uniforms = {
    uTime: { value: 0 },
    // 載入時醬從 uWrapOrigin 開始，沿著圈圈長到 uWrap。1 = 已經繞滿
    uWrap: { value: 0 },
    uWrapOrigin: { value: 0 },
    // ── 醬汁質感（由 applySauceSettings 寫入）──
    uRimStrength: { value: 0 },
    uRimColor: { value: new THREE.Color() },
    uRimPower: { value: 2.6 },
    uContactDark: { value: 0 },
    uStreakStrength: { value: 0 },
    uStreakTime: { value: 0 },
    uBubbleStrength: { value: 0 },
    uBallCenter: { value: new THREE.Vector3() },
    // 漣漪：xyz = 世界座標中心、w = 開始時間（uRippleClock 的秒數）；w < 0 代表空位
    uRipples: { value: Array.from({ length: RIPPLE_SLOTS }, () => new THREE.Vector4(0, 0, 0, -100)) },
    uRippleClock: { value: 0 },
    uRippleStrength: { value: 0 },
  };

  // onBeforeCompile：在 three.js 編譯內建材質的 shader 前插入自己的程式碼
  // 好處是保留 MeshPhysicalMaterial 的光照、清漆效果，只加上我們要的變形
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWrap = uniforms.uWrap;
    shader.uniforms.uWrapOrigin = uniforms.uWrapOrigin;
    for (const key of [
      'uRimStrength', 'uRimColor', 'uRimPower', 'uContactDark', 'uStreakStrength', 'uStreakTime',
      'uBubbleStrength', 'uBallCenter', 'uRipples', 'uRippleClock', 'uRippleStrength',
    ] as const) {
      shader.uniforms[key] = uniforms[key];
    }

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWrap;
        uniform float uWrapOrigin;
        varying float vWrapProgress;
        uniform float uRimStrength;
        uniform vec3 uRimColor;
        uniform float uRimPower;
        uniform float uContactDark;
        uniform float uStreakStrength;
        uniform float uStreakTime;
        uniform float uBubbleStrength;
        uniform vec3 uBallCenter;
        uniform vec4 uRipples[${RIPPLE_SLOTS}];
        uniform float uRippleClock;
        uniform float uRippleStrength;
        varying float vRadial;
        varying vec3 vSauceWorldPos;
        varying vec3 vSauceWorldNormal;
        // 一圈漣漪的亮度：離中心 d、已經擴散 age 秒 → 一道往外推的細環，越久越淡
        float sauceRipple(vec3 p) {
          float sum = 0.0;
          for (int i = 0; i < ${RIPPLE_SLOTS}; i++) {
            vec4 r = uRipples[i];
            float age = uRippleClock - r.w;
            if (age <= 0.0 || age >= ${RIPPLE_LIFE.toFixed(2)}) continue;
            float d = distance(p, r.xyz);
            float front = age * 0.085;
            float band = exp(-pow((d - front) / 0.011, 2.0));
            sum += band * (1.0 - age / ${RIPPLE_LIFE.toFixed(2)});
          }
          return sum;
        }
        float sauceHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // 接觸陰影：法線越朝向綠球中心（貼地那一側），醬越暗。少了它，醬像浮在球外面的一圈塑膠
        vec3 toBall = normalize(uBallCenter - vSauceWorldPos);
        float contact = clamp(dot(normalize(vSauceWorldNormal), toBall), 0.0, 1.0);
        diffuseColor.rgb *= 1.0 - uContactDark * contact * contact;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 viewDir = normalize(vViewPosition);
          float facing = clamp(dot(normal, viewDir), 0.0, 1.0);
          // ① 菲涅耳亮邊：越側面（facing 越小）越亮
          totalEmissiveRadiance += uRimColor * uRimStrength * pow(1.0 - facing, uRimPower);
          // ② 流動高光條紋：沿著管子方向往前移動的細亮帶，帶一點彎曲，只出現在正對鏡頭的那面
          float wave = vWrapProgress * 6.2831853 * 20.0 - uStreakTime * 2.0
                     + sin(vRadial * 6.2831853 * 2.0 + vWrapProgress * 40.0) * 1.4;
          float streak = pow(0.5 + 0.5 * sin(wave), 48.0) * facing * facing;
          totalEmissiveRadiance += vec3(1.0, 0.85, 0.8) * uStreakStrength * streak;
          // ③ 小氣泡：把醬面切成小格子，少數格子放一顆亮點，跟著醬一起往前流
          vec2 cell = vec2(vWrapProgress * 420.0 - uStreakTime * 1.2, vRadial * 52.0);
          vec2 id = floor(cell);
          vec2 f = fract(cell) - 0.5;
          float pick = step(0.94, sauceHash(id));
          float bubble = pick * smoothstep(0.32, 0.12, length(f)) * facing;
          totalEmissiveRadiance += vec3(1.0, 0.92, 0.88) * uBubbleStrength * bubble;
          // ④ 漣漪
          totalEmissiveRadiance += vec3(1.0, 0.8, 0.75) * uRippleStrength * sauceRipple(vSauceWorldPos) * 0.6;
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        // 還沒繞到的部分剪掉。從球後方那一點開始長，再繞到前面
        if (uWrap < 0.999 && fract(vWrapProgress - uWrapOrigin + 1.0) > uWrap) discard;`,
      );

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute float aProgress;
        attribute float aRadial;
        varying float vWrapProgress;
        varying float vRadial;
        varying vec3 vSauceWorldPos;
        varying vec3 vSauceWorldNormal;
        uniform vec4 uRipples[${RIPPLE_SLOTS}];
        uniform float uRippleClock;
        uniform float uRippleStrength;`,
      )
      // begin_vertex 之後 transformed 就是頂點原始位置，在這裡把它推出去
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // ① 一團一團的醬汁沿著管子往前流：
        //    sin 的相位扣掉 uTime，鼓起來的位置就會隨時間往 aProgress 增加的方向移動
        //    繞一圈 7 團，乘 2π 讓頭尾接得起來
        float blob = sin(aProgress * 6.2831853 * 7.0 - uTime * 2.0);
        // ② 表面細微的蠕動：三個方向的 sin 相乘，產生不規則的起伏
        float wobble = sin(position.x * 9.0 + uTime * 1.7)
                     * sin(position.y * 11.0 - uTime * 1.3)
                     * sin(position.z * 7.0 + uTime * 2.1);
        // 沿法線（管子表面朝外的方向）推動：正值變粗、負值變細
        transformed += objectNormal * (blob * ${BLOB_AMOUNT.toFixed(4)} + wobble * ${WOBBLE_AMOUNT.toFixed(4)});
        vWrapProgress = aProgress;
        vRadial = aRadial;
        vSauceWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSauceWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
        // ⑤ 漣漪也讓醬面微微隆起一圈（不只是變亮），看起來才像真的被碰到
        float rippleLift = 0.0;
        for (int i = 0; i < ${RIPPLE_SLOTS}; i++) {
          vec4 r = uRipples[i];
          float age = uRippleClock - r.w;
          if (age <= 0.0 || age >= ${RIPPLE_LIFE.toFixed(2)}) continue;
          float d = distance(vSauceWorldPos, r.xyz);
          rippleLift += exp(-pow((d - age * 0.085) / 0.012, 2.0)) * (1.0 - age / ${RIPPLE_LIFE.toFixed(2)});
        }
        transformed += objectNormal * rippleLift * 0.006 * uRippleStrength;`,
      );
  };

  const mesh = new THREE.Mesh(geometry, material);
  // 烤雞掛在緞帶自己身上：mesh 繞 y 軸轉的時候，它們會跟著醬一起繞，不用另外算位置
  // 用 let：控制面板改數量時會換掉這份清單，update 每幀讀到的才是新的
  let riders = createRiders(mesh, FOOD_COUNT_DEFAULT);
  loadFoodPrototypes(() => {
    for (const rider of riders) upgradeRiderMesh(rider);
  });
  const sharkFinSettings: SharkFinSettings = {
    enabled: SHARK_FIN_ENABLED,
    drift: SHARK_FIN_DRIFT,
    color: `#${SHARK_FIN_COLOR.toString(16).padStart(6, '0')}`,
    forward: true,
    lift: -0.035,
    depth: 0.008,
    curveAmp: SHARK_FIN_CURVE_AMP,
    curveRate: SHARK_FIN_CURVE_RATE,
    jumpEvery: 9,
    jumpHeight: 0.07,
  };
  // 跳躍狀態：jumpT < 0 = 在醬裡游；0～1 = 空中的進度
  let jumpT = -1;
  let jumpTimer = 4 + Math.random() * 4;
  const JUMP_SECONDS = 1.0;
  let sharkFin: Rider | null = sharkFinSettings.enabled ? createSharkFinRider(mesh, sharkFinSettings) : null;
  const sharkFinWaveSettings: SharkFinWaveSettings = {
    enabled: SHARK_FIN_WAVE_ENABLED,
    interval: SHARK_FIN_WAVE_INTERVAL,
    life: SHARK_FIN_WAVE_LIFE,
    scale: SHARK_FIN_WAVE_SCALE,
    opacity: SHARK_FIN_WAVE_OPACITY,
    sideSpread: SHARK_FIN_WAVE_SIDE,
    trail: SHARK_FIN_WAVE_TRAIL,
    color: `#${SHARK_FIN_WAVE_COLOR.toString(16).padStart(6, '0')}`,
  };
  const finWaves = createSharkFinWaves(mesh, sharkFinWaveSettings);

  function applySharkFinWaveSettings() {
    finWaves.applyColor();
  }
  const foodSettings = { count: FOOD_COUNT_DEFAULT };

  /** 香菇大小／亮邊改了：重建原型、換上新尺寸 */
  function applyExtraFoodSettings() {
    foodRimUniform.value = Math.max(0, extraFoodSettings.rim);
    rebuildExtraPrototypes();
    for (const rider of riders) {
      if (rider.kind === 'mushroom') upgradeRiderMesh(rider);
    }
    if (sharkFin) setWrap(uniforms.uWrap.value);
  }
  const visualSettings: KetchupVisualSettings = { opacity: 1 };
  const sauceSettings: KetchupSauceSettings = { ...KETCHUP_SAUCE_DEFAULT };

  /** 把 sauceSettings 套到材質和 shader uniform 上（面板每次改值都會呼叫） */
  function applySauceSettings() {
    const s = sauceSettings;
    material.color.set(s.color);
    material.emissive.set(s.emissiveColor).multiplyScalar(Math.max(0, s.emissiveStrength));
    material.roughness = THREE.MathUtils.clamp(s.roughness, 0, 1);
    material.clearcoat = THREE.MathUtils.clamp(s.clearcoat, 0, 1);
    material.clearcoatRoughness = THREE.MathUtils.clamp(s.clearcoatRoughness, 0, 1);
    material.envMapIntensity = Math.max(0, s.envIntensity);
    uniforms.uRimStrength.value = Math.max(0, s.rimStrength);
    uniforms.uRimColor.value.set(s.rimColor);
    uniforms.uRimPower.value = Math.max(0.5, s.rimPower);
    uniforms.uContactDark.value = THREE.MathUtils.clamp(s.contactDark, 0, 1);
    uniforms.uStreakStrength.value = Math.max(0, s.streakStrength);
    uniforms.uBubbleStrength.value = Math.max(0, s.bubbleStrength);
    uniforms.uRippleStrength.value = Math.max(0, s.rippleStrength);
  }
  applySauceSettings();

  // ── 漣漪：小豬靠近醬邊時，在醬面上「離小豬最近的點」起一圈 ──
  let rippleClock = 0;
  let rippleSlot = 0;
  let rippleCooldown = 0;
  const touchLocal = new THREE.Vector3();
  const touchCenter = new THREE.Vector3();
  const touchWorldScale = new THREE.Vector3();

  /**
   * 每幀呼叫：worldPos 是小豬（或其他會碰到醬的東西）的世界座標。
   * 換算到緞帶自己的座標 → 找同一個角度上的管子中心線 → 量離醬面多遠；
   * 夠近就在醬面上那一點放一圈漣漪（有冷卻時間，站著不動也只會一圈一圈慢慢冒）。
   */
  function touch(worldPos: THREE.Vector3) {
    if (rippleCooldown > 0 || sauceSettings.rippleStrength <= 0) return;
    mesh.updateMatrixWorld();
    touchLocal.copy(worldPos);
    mesh.worldToLocal(touchLocal);
    const angle = Math.atan2(touchLocal.z, touchLocal.x);
    const t = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
    curve.getPoint(t, touchCenter);
    mesh.localToWorld(touchCenter);
    mesh.getWorldScale(touchWorldScale);
    const tubeWorld = TUBE_RADIUS * touchWorldScale.x;
    const fromCenter = touchLocal.copy(worldPos).sub(touchCenter);
    const gap = fromCenter.length() - tubeWorld;
    if (gap > sauceSettings.rippleDistance) return;
    // 醬面上最靠近小豬的點 = 中心線往小豬方向走一個管子半徑
    const surface = touchCenter.addScaledVector(fromCenter.normalize(), tubeWorld);
    addRipple(surface);
    rippleCooldown = 0.45;
  }

  /** 在醬面上（世界座標）放一圈漣漪；delay 秒後才開始擴散 */
  function addRipple(worldPoint: THREE.Vector3, delay = 0) {
    const slot = uniforms.uRipples.value[rippleSlot];
    slot.set(worldPoint.x, worldPoint.y, worldPoint.z, rippleClock + delay);
    rippleSlot = (rippleSlot + 1) % RIPPLE_SLOTS;
  }
  const landingPoint = new THREE.Vector3();

  /** 綠球中心（世界座標），接觸陰影用 */
  function setBallCenter(center: THREE.Vector3) {
    uniforms.uBallCenter.value.copy(center);
  }

  function applyChickenFoodSettings() {
    rebuildChickenPrototype();
    for (const rider of riders) {
      if (rider.kind !== 'nugget') continue;
      rider.reach = chickenCollisionReach();
      rider.lift = chickenSurfaceLift();
      if (nuggetPrototype) upgradeRiderMesh(rider);
      else applyChickenAppearance(rider.mesh, rider.crustColor);
    }
    if (sharkFin) setWrap(uniforms.uWrap.value);
  }

  function applyFryFoodSettings() {
    ensureFryGeometry();
    for (const rider of riders) {
      if (rider.kind !== 'fry') continue;
      rider.reach = fryCollisionReach();
      rider.lift = frySurfaceLift();
      upgradeRiderMesh(rider);
    }
    if (sharkFin) setWrap(uniforms.uWrap.value);
  }

  function rerollChickenCrustColors() {
    let salt = Math.floor(Math.random() * 1e6);
    for (const rider of riders) {
      if (rider.kind !== 'nugget') continue;
      rider.crustColor = pickChickenCrustColor(rider.progress * 1e4 + salt++);
      applyChickenAppearance(rider.mesh, rider.crustColor);
    }
  }

  function applyVisualSettings() {
    const o = THREE.MathUtils.clamp(visualSettings.opacity, 0, 1);
    visualSettings.opacity = o;
    const seeThrough = o < 0.999;
    material.transparent = seeThrough;
    material.opacity = o;
    // 半透明時不寫深度，裡面的魚鰭才看得見（僅除錯用）
    material.depthWrite = !seeThrough;
    material.needsUpdate = true;
  }
  applyVisualSettings();

  function applySharkFinSettings() {
    if (!sharkFinSettings.enabled) {
      if (sharkFin) sharkFin.mesh.visible = false;
      return;
    }
    if (!sharkFin) sharkFin = createSharkFinRider(mesh, sharkFinSettings);
    sharkFin.drift = sharkFinSettings.drift;
    sharkFin.lift = sharkFinSettings.lift;
    const mat = sharkFinMaterial ?? sharedSharkFinMaterial();
    mat.color.set(sharkFinSettings.color);
    mat.emissive.set(sharkFinSettings.color).multiplyScalar(0.55);
    if (sharkFin.mesh instanceof THREE.Mesh) {
      sharkFin.mesh.geometry = sharedSharkFinGeometry(sharkFinSettings.depth);
    }
    setWrap(uniforms.uWrap.value);
  }

  /** 把食物數量改成 count。多的從尾巴拿掉，少的只補新的，已經在漂的不會被重新洗牌 */
  function setFoodCount(count: number) {
    const next = THREE.MathUtils.clamp(Math.round(count), 0, FOOD_COUNT_MAX);
    while (riders.length > next) {
      const removed = riders.pop();
      if (removed) disposeRider(removed);
    }
    while (riders.length < next) {
      const rider = createRider(mesh, riders.length);
      riders.push(rider);
      upgradeRiderMesh(rider);
    }
    foodSettings.count = next;
  }

  // 為什麼要多包一層 pivot？
  // 「擺放角度」和「自轉」要分開：pivot 負責把整圈翻起來、轉到想要的方位，
  // 裡面的 mesh 只管繞自己的 y 軸自轉。少了這層，兩種旋轉寫在同一個物件上會互相干擾，
  // 自轉軸會跟著歪掉，醬汁就不會沿著圈圈流
  const pivot = new THREE.Group();
  pivot.add(mesh);

  // 目前的擺放參數：初始值來自上面的常數，控制面板會直接改這個物件
  const ringSettings: KetchupRingSettings = {
    radius: ORBIT_RADIUS,
    tiltDegrees: THREE.MathUtils.radToDeg(RING_TILT),
    yawDegrees: THREE.MathUtils.radToDeg(RING_YAW),
    offsetX: RING_OFFSET_X,
    offsetY: RING_OFFSET_Y,
    offsetZ: RING_OFFSET_Z,
  };

  let wrapOriginReady = false;

  /** 依照 ringSettings 擺放整圈；半徑有變才重建管子（重建比較花時間，角度、高度改變不需要） */
  function applyRingSettings() {
    wrapOriginReady = false;
    // 'YXZ'：先轉方位（y），再往上翻（x），翻的方向才會跟著方位走
    pivot.rotation.set(
      THREE.MathUtils.degToRad(ringSettings.tiltDegrees),
      THREE.MathUtils.degToRad(ringSettings.yawDegrees),
      0,
      'YXZ',
    );
    // 位置也放在 pivot 上：只搬動整圈，不影響裡面 mesh 的自轉
    pivot.position.set(ringSettings.offsetX, ringSettings.offsetY, ringSettings.offsetZ);

    if (curve.radius !== ringSettings.radius) {
      curve.radius = ringSettings.radius;
      // 舊的形狀要 dispose 釋放 GPU 記憶體，少了這步，拖拉半徑時每一格都會殘留一份在顯示卡裡
      mesh.geometry.dispose();
      mesh.geometry = createTubeGeometry(curve);
    }
  }
  applyRingSettings();

  // 噴濺的醬滴：從緞帶表面噴出
  // 醬滴不放進 pivot：它們噴出去之後要受「場景的」重力往下掉，不該跟著緞帶一起翻轉、自轉
  // 醬滴的位置是用場景座標算的，所以 root 和外層的 all 都要維持在原點、不旋轉
  // 醬滴的表面比緞帶霧一點：太光滑、高光太集中會像玻璃珠或水珠，霧一點才像濃稠的醬
  // 關掉時回傳 null：連醬滴的形狀、材質都不建立，而不是建好再藏起來
  const splash = SPLASH_ENABLED ? createDropSplash() : null;

  function createDropSplash() {
    const dropMaterial = createKetchupMaterial(envMap);
    dropMaterial.roughness = 0.35;
    dropMaterial.clearcoat = 0.4;
    dropMaterial.clearcoatRoughness = 0.3;
    return createSplash({ curve, ribbon: mesh, tubeRadius: TUBE_RADIUS, material: dropMaterial, camera });
  }

  const root = new THREE.Group();
  root.add(pivot);
  if (splash) root.add(splash.object);

  const wrapPoint = new THREE.Vector3();
  const ballCenter = new THREE.Vector3(0, 0, 0);
  const viewToBall = new THREE.Vector3();
  const fromBallCenter = new THREE.Vector3();

  let lastTime: number | null = null;
  // 每幀重算配料位置用的暫存，避免一直 new 新的向量
  const riderInverse = new THREE.Matrix4();
  const riderWorld = new THREE.Vector3();
  const riderOffset = new THREE.Vector3();
  const riderTangent = new THREE.Vector3();
  const riderLocalDir = new THREE.Vector3();
  const riderSurface = new THREE.Vector3();
  const riderBinormal = new THREE.Vector3();
  const riderDir = new THREE.Vector3();
  const flowAlongTube = new THREE.Vector3();
  const finLateral = new THREE.Vector3();
  const finBasis = new THREE.Matrix4();
  const RIDER_Y_AXIS = new THREE.Vector3(0, 1, 0);

  /** 每幀呼叫：time 單位是秒 */
  function update(time: number) {
    // 傳進 shader 的時間先乘上倍率：shader 裡所有用到 uTime 的動畫會一起變快或變慢
    uniforms.uTime.value = time * FLOW_SPEED;
    uniforms.uStreakTime.value = time * Math.max(0, sauceSettings.streakSpeed);
    // 整條緞帶繞自己的軸（翻起來之後的 y 軸）慢慢轉，看起來像醬汁在繞著球跑
    mesh.rotation.y = time * SPIN_SPEED;
    // 配料貼在醬的外側，沿著醬慢慢漂。不看鏡頭，旋轉畫面時才不會跟著滑
    const deltaTime = lastTime === null ? 0 : Math.min(time - lastTime, 0.1);
    lastTime = time;
    rippleClock += deltaTime;
    uniforms.uRippleClock.value = rippleClock;
    rippleCooldown = Math.max(0, rippleCooldown - deltaTime);
    mesh.updateWorldMatrix(true, false);
    riderInverse.copy(mesh.matrixWorld).invert();
    if (sharkFin && sharkFinSettings.enabled) {
      const swimSign = sharkFinSettings.forward ? 1 : -1;
      sharkFin.progress = THREE.MathUtils.euclideanModulo(
        sharkFin.progress + deltaTime * sharkFin.drift * swimSign,
        1,
      );
      const ringLength = curve.radius * Math.PI * 2;
      const curveAmp = sharkFinSettings.curveAmp;
      const curveRate = sharkFinSettings.curveRate;
      if (curveAmp > 0.001) {
        sharkFin.climb =
          curveAmp * Math.sin(time * curveRate + sharkFin.phase) +
          curveAmp * 0.38 * Math.sin(time * curveRate * 1.65 + sharkFin.driftPhase);
      } else {
        sharkFin.climb = 0;
      }
      yieldFoodFromShark(sharkFin, riders, ringLength, time);

      // ── 偶爾躍出醬面：畫一道弧線，落回醬裡時醬面起兩圈漣漪 ──
      if (jumpT >= 0) {
        jumpT += deltaTime / JUMP_SECONDS;
        if (jumpT >= 1) {
          jumpT = -1;
          // 落水點：鰭目前的位置（緞帶座標 → 世界座標）
          landingPoint.copy(sharkFin.mesh.position).applyMatrix4(mesh.matrixWorld);
          addRipple(landingPoint);
          addRipple(landingPoint, 0.35);
        }
      } else if (sharkFinSettings.jumpEvery > 0) {
        jumpTimer -= deltaTime;
        if (jumpTimer <= 0) {
          jumpT = 0;
          // 間隔加一點亂數，才不會像節拍器一樣準時
          jumpTimer = sharkFinSettings.jumpEvery * (0.6 + Math.random() * 0.8);
        }
      }
    }
    const pushDecay = Math.exp(-3.2 * deltaTime);
    for (const rider of riders) {
      rider.ringKnock *= pushDecay;
      const surge = 0.35 + 0.65 * Math.sin(time * 0.45 + rider.driftPhase);
      const heading = Math.sin(time * rider.climbRate + rider.driftPhase) >= 0 ? 1 : -1;
      rider.progress = THREE.MathUtils.euclideanModulo(
        rider.progress + deltaTime * (rider.drift * surge + rider.ringKnock),
        1,
      );
      const yielding = time < rider.sharkYieldUntil;
      if (yielding) {
        rider.climb += deltaTime * SHARK_YIELD_CLIMB_SPEED * rider.yieldClimbDir;
        rider.climb = THREE.MathUtils.clamp(rider.climb, -0.88, 0.88);
      } else if (!rider.freeSectionAfterShark) {
        rider.climb = THREE.MathUtils.clamp(rider.climb + deltaTime * rider.climbSpeed * heading, -0.7, 0.7);
      }
      // 被撞後維持讓開結束時的截面角，不用 heading 擺回環的中線
      rider.yaw += deltaTime * rider.yawSpeed;
    }
    separateRiders(riders);
    const movers = sharkFin ? [...riders, sharkFin] : riders;
    for (const rider of movers) {
      curve.getPoint(rider.progress, rider.center);
      const along = rider.progress * Math.PI * 2;
      riderTangent.set(-Math.sin(along), 0, Math.cos(along)).transformDirection(mesh.matrixWorld);
      riderWorld.copy(rider.center).applyMatrix4(mesh.matrixWorld);
      // 從球心指向管子中心線，扣掉沿管切線 — 才是貼在醬外側的法線方向
      fromBallCenter.copy(riderWorld).sub(ballCenter);
      riderOffset.copy(fromBallCenter);
      riderOffset.addScaledVector(riderTangent, -riderOffset.dot(riderTangent));
      if (riderOffset.lengthSq() < 1e-8) riderOffset.copy(riderWorld);
      riderOffset.normalize();
      // 沿管子轉一點：正值往畫面上方的醬緣，負值往下方。還是貼在管子上，不會離醬
      riderBinormal.crossVectors(riderTangent, riderOffset);
      if (riderBinormal.lengthSq() < 1e-8) riderBinormal.set(0, 1, 0);
      else riderBinormal.normalize();
      if (riderBinormal.dot(camera.up) < 0) riderBinormal.negate();
      if (rider.kind === 'sharkFin' && sharkFinSettings.curveAmp > 0.001) {
        riderDir
          .copy(riderOffset)
          .multiplyScalar(Math.cos(rider.climb))
          .addScaledVector(riderBinormal, Math.sin(rider.climb))
          .normalize();
      } else if (rider.kind === 'sharkFin') {
        riderDir.copy(riderOffset);
      } else {
        riderDir
          .copy(riderOffset)
          .multiplyScalar(Math.cos(rider.climb))
          .addScaledVector(riderBinormal, Math.sin(rider.climb))
          .normalize();
      }
      riderLocalDir.copy(riderDir).transformDirection(riderInverse);
      riderSurface.copy(rider.center).addScaledVector(riderLocalDir, TUBE_RADIUS);
      // swell 要跟醬面鼓包一致，否則鰭會懸在管子的理論半徑上、看起來像漂在空中
      const swell = sauceSwell(rider.progress, riderSurface, uniforms.uTime.value);
      const bob =
        rider.kind === 'sharkFin'
          ? 0
          : Math.sin(time * 0.9 + rider.phase) * 0.007 + Math.sin(time * 0.27 + rider.driftPhase) * 0.004;
      const airborne = rider.kind === 'sharkFin' && jumpT >= 0;
      // 跳躍弧線：sin(π t) 從 0 升到頂再落回 0
      const jumpLift = airborne ? Math.sin(Math.PI * jumpT) * sharkFinSettings.jumpHeight : 0;
      rider.mesh.position.copy(riderWorld).addScaledVector(riderDir, TUBE_RADIUS + swell + rider.lift + bob + jumpLift);
      rider.mesh.position.applyMatrix4(riderInverse);
      if (rider.kind === 'sharkFin') {
        // 解析切線 + 固定游向：只朝前或朝後，不吃 getTangent 分段抖動
        const along = rider.progress * Math.PI * 2;
        const swimSign = sharkFinSettings.forward ? 1 : -1;
        flowAlongTube.set(-Math.sin(along), 0, Math.cos(along)).multiplyScalar(swimSign);
        finLateral.crossVectors(flowAlongTube, riderLocalDir);
        if (finLateral.lengthSq() < 1e-10) finLateral.set(0, 0, 1);
        else finLateral.normalize();
        finBasis.makeBasis(flowAlongTube, riderLocalDir, finLateral);
        rider.mesh.quaternion.setFromRotationMatrix(finBasis);
        // 空中：上升時鰭尖往前上仰、下降時往前下栽（繞鰭自己的側向軸轉）
        if (airborne) rider.mesh.rotateZ((0.5 - jumpT) * 1.2);
        finWaves.update(
          deltaTime,
          sharkFinWaveSettings.enabled && sharkFinSettings.enabled && rider.mesh.visible && !airborne,
          rider.mesh.position,
          flowAlongTube,
          finLateral,
          riderLocalDir,
        );
      } else {
        rider.mesh.quaternion.setFromUnitVectors(RIDER_Y_AXIS, riderLocalDir);
        rider.mesh.rotateY(rider.yaw);
        if (rider.kind === 'fry') rider.mesh.rotateX(rider.tilt);
      }
    }

    // 醬滴是「每幀往前推一點」的模擬。時間差在上面算過，切分頁回來時已壓在 0.1 秒內
    splash?.update(deltaTime);
  }

  /** 環上落在球後方的那一點當起點，醬從背面先長出來 */
  function ensureWrapOrigin() {
    if (wrapOriginReady) return;
    wrapOriginReady = true;
    pivot.updateMatrixWorld(true);
    mesh.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    viewToBall.copy(ballCenter).sub(camera.position).normalize();
    let bestT = 0;
    let mostBehind = -Infinity;
    for (let i = 0; i < 48; i++) {
      const t = i / 48;
      curve.getPoint(t, wrapPoint);
      wrapPoint.applyMatrix4(mesh.matrixWorld);
      fromBallCenter.copy(wrapPoint).sub(ballCenter);
      // 球心→環上點 若和 鏡頭→球心 同向，人在球後方；dot 越大越靠後
      const behind = fromBallCenter.dot(viewToBall);
      if (behind > mostBehind) {
        mostBehind = behind;
        bestT = t;
      }
    }
    uniforms.uWrapOrigin.value = bestT;
  }

  /**
   * 載入時讓醬沿著圈圈長出來。0 = 還沒流出，1 = 繞滿一圈
   * 食物跟在醬的後面出現，才不會先浮在空的位置上
   */
  function setWrap(amount: number) {
    const wrap = THREE.MathUtils.clamp(amount, 0, 1);
    ensureWrapOrigin();
    uniforms.uWrap.value = wrap;
    mesh.visible = wrap > 0.001;
    const origin = uniforms.uWrapOrigin.value;
    const visibleOnRing = sharkFin ? [...riders, sharkFin] : riders;
    for (const rider of visibleOnRing) {
      const along = (rider.progress - origin + 1) % 1;
      const inWrap = wrap >= 1 || along < wrap - 0.04;
      if (inWrap && rider.kind !== 'sharkFin') rider.revealed = true;
      const onRing =
        wrap >= 1 ||
        along < wrap - 0.04 ||
        (rider.kind !== 'sharkFin' && rider.revealed);
      rider.mesh.visible = onRing && (rider.kind !== 'sharkFin' || sharkFinSettings.enabled);
    }
  }

  setWrap(0);

  /** 入場重播：起點重算，醬帶收成 0 */
  function resetIntro() {
    wrapOriginReady = false;
    setWrap(0);
  }

  // ringObject：整圈緞帶（pivot），給「在畫面上直接拖曳」用
  // foodSettings：食物數量，給控制面板的滑桿用
  return {
    object: root,
    update,
    ringObject: pivot,
    ringSettings,
    applyRingSettings,
    visualSettings,
    applyVisualSettings,
    sauceSettings,
    applySauceSettings,
    touch,
    setBallCenter,
    foodSettings,
    setFoodCount,
    chickenFoodSettings,
    applyChickenFoodSettings,
    rerollChickenCrustColors,
    fryFoodSettings,
    applyFryFoodSettings,
    extraFoodSettings,
    applyExtraFoodSettings,
    sharkFinSettings,
    applySharkFinSettings,
    sharkFinWaveSettings,
    applySharkFinWaveSettings,
    setWrap,
    resetIntro,
  };
}

/**
 * 醬面鼓起的高度，公式和管子 shader 裡的 blob、wobble 相同
 * 配料跟著這個高度走，表面縮進去時才不會懸在空中
 */
// 沿著圈圈，兩塊中心至少要隔開「各自佔的長度」。圈長 = 半徑 × 2π
const RING_LENGTH = ORBIT_RADIUS * Math.PI * 2;

/**
 * 沿著醬把疊在一起的食物推開
 * 走捷徑（較短的那段弧），所以頭尾相接的地方也算得到
 */
// 依進度排序後重複使用，數量很大時不要每幀重新配置陣列
const separateOrder: Rider[] = [];

/** 碰到鯊魚：短暫沿截面 90° 讓開，之後在當前位置順流漂，不回到原路線 */
const SHARK_FOOD_YIELD_DURATION = 1.3;
const SHARK_YIELD_CLIMB_SPEED = 0.42;

function yieldFoodFromShark(shark: Rider, foods: Rider[], ringLength: number, time: number) {
  for (const food of foods) {
    let delta = food.progress - shark.progress;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    const gap = Math.abs(delta) * ringLength;
    const need = shark.reach + food.reach + 0.01;
    if (gap >= need) continue;

    food.revealed = true;
    if (time < food.sharkYieldUntil) continue;

    food.sharkYieldUntil = time + SHARK_FOOD_YIELD_DURATION;
    food.freeSectionAfterShark = true;
    food.ringKnock = 0;
    // 魚貼外緣游（climb≈0）；食物往截面兩側滑，與游向垂直
    if (Math.abs(food.climb) > 0.08) {
      food.yieldClimbDir = food.climb > 0 ? 1 : -1;
    } else {
      food.yieldClimbDir = delta >= 0 ? 1 : -1;
    }
  }
}

function separateRiders(riders: Rider[]) {
  separateOrder.length = 0;
  for (let i = 0; i < riders.length; i++) {
    if (riders[i].kind === 'sharkFin') continue;
    separateOrder.push(riders[i]);
  }
  const count = separateOrder.length;
  if (count < 2) return;
  // 只推開相鄰的兩塊。數量到幾千時，如果每塊都跟其他所有塊比，畫面會卡住
  for (let pass = 0; pass < 4; pass++) {
    separateOrder.sort((a, b) => a.progress - b.progress);
    for (let i = 0; i < count; i++) {
      const a = separateOrder[i];
      const b = separateOrder[(i + 1) % count];
      let delta = b.progress - a.progress;
      // 最後一塊的下一塊是繞回開頭，差距要加一整圈
      if (delta < 0) delta += 1;
      const gap = delta * RING_LENGTH;
      const need = a.reach + b.reach + 0.012;
      if (gap >= need) continue;
      const push = (need - gap) / RING_LENGTH / 2;
      a.progress = THREE.MathUtils.euclideanModulo(a.progress - push, 1);
      b.progress = THREE.MathUtils.euclideanModulo(b.progress + push, 1);
    }
  }
}

function sauceSwell(progress: number, surface: THREE.Vector3, uTime: number) {
  const blob = Math.sin(progress * Math.PI * 2 * 7 - uTime * 2);
  const wobble =
    Math.sin(surface.x * 9 + uTime * 1.7) *
    Math.sin(surface.y * 11 - uTime * 1.3) *
    Math.sin(surface.z * 7 + uTime * 2.1);
  return blob * BLOB_AMOUNT + wobble * WOBBLE_AMOUNT;
}

type FoodKind = 'nugget' | 'fry' | 'mushroom';
type RiderKind = FoodKind | 'sharkFin';

type Rider = {
  mesh: THREE.Object3D;
  kind: RiderKind;
  // 管子中心線上的點（緞帶自己的座標）。每幀再往「離開球心」推到醬的表面
  center: THREE.Vector3;
  // 目前漂到整圈的哪裡（0~1）。每幀會往前走，不是釘在固定刻度
  progress: number;
  // 沿著圈圈佔多長。兩塊中心近過這個和，就會疊在一起
  reach: number;
  // 沿著醬漂的速度（整圈進度 / 秒）。每塊不一樣，間距才會一直變
  drift: number;
  driftPhase: number;
  yawSpeed: number;
  // 繞著管子偏離外側中線的角度。正值往上緣，負值往下緣
  climb: number;
  climbSpeed: number;
  climbRate: number;
  // 負值 = 中心在表面裡面，底部埋進醬裡
  lift: number;
  // 每塊自己的轉向，每幀重設朝向之後再疊上去，才不會越轉越多
  yaw: number;
  tilt: number;
  phase: number;
  swimRate1: number;
  swimRate2: number;
  swimRate3: number;
  swimPhase1: number;
  swimPhase2: number;
  swimPhase3: number;
  /** 被鯊魚撞後沿環緩漂（progress / 秒） */
  ringKnock: number;
  /** 已在醬上出現過或被撞過，入場時不會再被 setWrap 藏起來 */
  revealed: boolean;
  /** 秒；在此時間前以截面滑開（讓開期間仍沿環順流） */
  sharkYieldUntil: number;
  /** 截面滑開方向（±1，與魚游向 90°） */
  yieldClimbDir: number;
  /** 被鯊魚撞過：不再用上下擺動把 climb 拉回環外緣中線 */
  freeSectionAfterShark: boolean;
  /** 表皮色（從 CHICKEN_CRUST_PALETTE 隨機，僅 nugget） */
  crustColor: string;
};

/**
 * 方塊朝向醬的那一側塗暗。頂點顏色會和材質顏色相乘，埋進醬裡的邊就比較深
 */
function darkenSunkSide(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute('position');
  const color = new Float32Array(position.count * 3);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let i = 0; i < position.count; i++) {
    // 0 = 朝外的亮面，1 = 埋進醬裡的暗面
    const sunk = 1 - THREE.MathUtils.smoothstep(position.getY(i), minY, maxY);
    const shade = 1 - sunk * 0.78;
    color[i * 3] = shade;
    color[i * 3 + 1] = shade;
    color[i * 3 + 2] = shade;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
}

function disposeRider(rider: Rider) {
  // GLB 原型是共用的，只拆掉這一顆的實例
  rider.mesh.removeFromParent();
  if (rider.kind !== 'sharkFin') disposeFoodInstance(rider.mesh);
}

type FoodPrototype = { clone: () => THREE.Object3D };

let nuggetPrototype: FoodPrototype | null = null;
let mushroomPrototype: FoodPrototype | null = null;
let mushroomSourceRoot: THREE.Object3D | null = null;

/**
 * 香菇的原型：沿用 GLB 的材質，只提高一點自發光（在醬的紅色反光裡才不會變暗沉），
 * 大小縮到面板設定的尺寸
 */
function rebuildExtraPrototypes() {
  const tint = (mesh: THREE.Mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!('emissive' in material)) continue;
      const m = material as THREE.MeshStandardMaterial;
      m.emissive.copy(m.color).multiplyScalar(0.35);
      m.emissiveMap = m.map ?? null;
      m.emissiveIntensity = 0.5;
      m.envMapIntensity = 0.15;
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
    }
  };
  if (mushroomSourceRoot) {
    mushroomPrototype = lyingPrototype(
      foodPrototypeFromRoot(mushroomSourceRoot.clone(true), extraFoodSettings.mushroomSize, false, tint),
      MUSHROOM_LIE_DEGREES,
    );
  }
}
let foodPrototypeLoadStarted = false;

function enhanceFoodMaterial(mesh: THREE.Mesh, crustColor: string) {
  const isBone = mesh.name.toLowerCase().includes('bone');
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!('emissive' in material)) continue;
    const m = material as THREE.MeshStandardMaterial;
    if (isBone) {
      m.color.set(chickenFoodSettings.boneColor);
      m.emissive.set(chickenFoodSettings.boneColor);
      m.emissive.multiplyScalar(0.92);
      m.emissiveIntensity = 0.72;
    } else {
      m.color.set(crustColor);
      m.emissive.set(crustColor);
      m.emissive.multiplyScalar(0.62);
      m.emissiveIntensity = 0.88;
    }
    m.metalness = 0;
    m.roughness = 0.5;
    m.envMapIntensity = 0.08;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
}

function applyChickenAppearance(object: THREE.Object3D, crustColor: string) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) enhanceFoodMaterial(mesh, crustColor);
  });
}

function rebuildChickenPrototype() {
  if (!chickenSourceRoot) return;
  nuggetPrototype = prepareFoodPrototype(chickenSourceRoot.clone(true), chickenFoodSettings.size);
}

function fitFoodPrototype(root: THREE.Object3D, targetMax: number, layChickenFlat = false) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetMax / Math.max(size.x, size.y, size.z, 1e-6);
  root.scale.setScalar(scale);
  root.position.copy(center).multiplyScalar(-scale);
  if (layChickenFlat) root.rotation.x = Math.PI / 2;
}

/**
 * 讓食物「躺著」：外面包一層 Group，繞 X 軸轉 degrees 度。
 *
 * 為什麼不直接轉原型的 root：root 的原點在模型自己的原點（香菇是菇柄底部），
 * 直接轉會繞著菇柄底部甩出去，整顆偏離中心。fitFoodPrototype 已經把模型置中在「包外那一層」的原點，
 * 所以轉外層 = 繞著香菇自己的中心轉，躺下後還是在原位。
 */
function lyingPrototype(prototype: FoodPrototype, degrees: number): FoodPrototype {
  return {
    clone: () => {
      // 兩層：外層 holder 交給漂浮系統（每幀都會重設它的朝向，讓它的 +Y 對準醬面法線），
      // 內層 tilt 才是「躺下」的旋轉。只包一層的話，躺下的角度每幀都會被覆蓋掉，又變回直立
      const holder = new THREE.Group();
      const tilt = new THREE.Group();
      tilt.rotation.x = THREE.MathUtils.degToRad(degrees);
      tilt.add(prototype.clone());
      holder.add(tilt);
      return holder;
    },
  };
}

function foodPrototypeFromRoot(
  root: THREE.Object3D,
  targetMax: number,
  layChickenFlat: boolean,
  tint: (mesh: THREE.Mesh) => void,
): FoodPrototype {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    tint(mesh);
  });
  fitFoodPrototype(root, targetMax, layChickenFlat);
  return {
    clone: () => cloneGltfMaterialsOnly(root),
  };
}

function prepareFoodPrototype(source: THREE.Object3D, targetMax: number): FoodPrototype {
  const root = source.clone(true);
  return foodPrototypeFromRoot(root, targetMax, true, (mesh) => {
    enhanceFoodMaterial(mesh, CHICKEN_CRUST_PALETTE[0]);
  });
}

function loadFoodPrototypes(onReady: () => void) {
  if (foodPrototypeLoadStarted) return;
  foodPrototypeLoadStarted = true;
  // 香菇載完就先換上（不用等烤雞）
  loadGltfOnce(SHIITAKE_URL)
    .then((gltf) => {
      mushroomSourceRoot = gltf.scene;
      rebuildExtraPrototypes();
      onReady();
    })
    .catch((error) => console.error(`[ketchup] 香菇模型載入失敗：${SHIITAKE_URL}`, error));
  loadGltfOnce(ROAST_CHICKEN_URL)
    .then((gltf) => {
      chickenSourceRoot = gltf.scene;
      rebuildChickenPrototype();
      onReady();
    })
    .catch((error) => {
      console.error(`[ketchup] 烤雞模型載入失敗：${ROAST_CHICKEN_URL}`, error);
      onReady();
    });
}

function createFoodMesh(kind: FoodKind) {
  if (kind === 'nugget' && nuggetPrototype) return nuggetPrototype.clone();
  if (kind === 'mushroom' && mushroomPrototype) return mushroomPrototype.clone();
  // 模型還沒載入：先用方塊占位（香菇借用雞塊的方塊）
  const placeholder: RiderKind = kind === 'fry' ? 'fry' : 'nugget';
  return new THREE.Mesh(sharedFoodGeometry(placeholder), sharedFoodMaterial(placeholder));
}

function disposeFoodInstance(object: THREE.Object3D) {
  if (
    object instanceof THREE.Mesh &&
    (object.geometry === nuggetGeometry || object.geometry === fryGeometry)
  ) {
    return;
  }
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
}

function upgradeRiderMesh(rider: Rider) {
  if (rider.kind === 'sharkFin') return;
  const parent = rider.mesh.parent;
  if (!parent) return;
  const position = rider.mesh.position.clone();
  const quaternion = rider.mesh.quaternion.clone();
  const visible = rider.mesh.visible;
  disposeFoodInstance(rider.mesh);
  rider.mesh.removeFromParent();
  const next = createFoodMesh(rider.kind);
  next.position.copy(position);
  next.quaternion.copy(quaternion);
  next.visible = visible;
  parent.add(next);
  rider.mesh = next;
  rider.reach = foodReach(rider.kind);
  rider.lift = foodLift(rider.kind);
  if (rider.kind === 'nugget') applyChickenAppearance(next, rider.crustColor);
  // 材質是每塊各自 clone 的，clone 不會帶 onBeforeCompile → 每換一次模型都要重新加亮邊
  addFoodRimToObject(next);
}

let nuggetGeometry: THREE.BoxGeometry | null = null;
let fryGeometry: THREE.BoxGeometry | null = null;
let fryGeometryLength = NaN;
let sharkFinGeometry: THREE.BufferGeometry | null = null;
let sharkFinGeometryDepth = NaN;
let nuggetMaterial: THREE.MeshPhongMaterial | null = null;
let fryMaterial: THREE.MeshPhongMaterial | null = null;
let sharkFinMaterial: THREE.MeshPhongMaterial | null = null;

function sharedSharkFinGeometry(depth = 0.008) {
  if (sharkFinGeometry && sharkFinGeometryDepth === depth) return sharkFinGeometry;
  if (sharkFinGeometry) sharkFinGeometry.dispose();
  // 鯊魚鰭：前緣（+X，游的方向）是外凸的弧線，鰭尖往後勾，後緣內凹 —— 一看就是鯊魚。
  // 舊版是直角三角形的平板（沒倒角），從側面看像一張紙片。
  // 尺寸比舊版大 1.3 倍：在畫面上更容易注意到
  const baseW = 0.073;
  const height = 0.08;
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.lineTo(baseW, 0);
  // 前緣：從底部前端往上彎到鰭尖（控制點偏前上方 → 外凸）
  outline.quadraticCurveTo(baseW * 0.62, height * 0.62, baseW * 0.06, height);
  // 後緣：鰭尖往後下回到底部（控制點偏內 → 內凹的「勾」）
  outline.quadraticCurveTo(baseW * 0.2, height * 0.42, baseW * 0.16, 0);
  outline.closePath();
  // 倒角：邊緣圓潤，有厚度感；curveSegments 讓弧線順
  const bevel = Math.min(depth * 0.45, 0.004);
  const geom = new THREE.ExtrudeGeometry(outline, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 3,
    curveSegments: 14,
  });
  geom.translate(-baseW * 0.5, 0, -depth / 2);
  darkenSunkSide(geom);
  sharkFinGeometry = geom;
  sharkFinGeometryDepth = depth;
  return sharkFinGeometry;
}

function sharedSharkFinMaterial() {
  if (!sharkFinMaterial) {
    sharkFinMaterial = new THREE.MeshPhongMaterial({
      color: SHARK_FIN_COLOR,
      emissive: 0x704068,
      emissiveIntensity: 0.42,
      shininess: 26,
      vertexColors: true,
      // 略埋進醬時仍畫在管子表面之上，不用把 lift 拉到 0.02 才看得到
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
  }
  return sharkFinMaterial;
}

function sharedFoodGeometry(kind: RiderKind) {
  if (kind === 'sharkFin') return sharedSharkFinGeometry();
  const nugget = kind === 'nugget';
  if (nugget) {
    if (!nuggetGeometry) {
      nuggetGeometry = new THREE.BoxGeometry(0.04, 0.04, 0.04);
      darkenSunkSide(nuggetGeometry);
    }
    return nuggetGeometry;
  }
  return ensureFryGeometry();
}

function ensureFryGeometry() {
  const length = fryFoodSettings.size;
  const thick = length * (FRY_REFERENCE_THICKNESS / FRY_REFERENCE_LENGTH);
  if (!fryGeometry || fryGeometryLength !== length) {
    fryGeometry?.dispose();
    fryGeometry = new THREE.BoxGeometry(thick, length, thick);
    darkenSunkSide(fryGeometry);
    fryGeometryLength = length;
  }
  return fryGeometry;
}

function sharedFoodMaterial(kind: RiderKind) {
  if (kind === 'sharkFin') return sharedSharkFinMaterial();
  const nugget = kind === 'nugget';
  if (nugget) {
    if (!nuggetMaterial) {
      nuggetMaterial = new THREE.MeshPhongMaterial({
        // 雞塊偏深褐。自發光拉高，才不會被醬的高光染成同一種紅
        color: 0xa85a20,
        emissive: 0x7a4010,
        emissiveIntensity: 0.65,
        shininess: 12,
        vertexColors: true,
      });
    }
    return nuggetMaterial;
  }
  if (!fryMaterial) {
    fryMaterial = new THREE.MeshPhongMaterial({
      // 薯條偏亮黃
      color: 0xfff2b0,
      emissive: 0xffc850,
      emissiveIntensity: 0.65,
      shininess: 12,
      vertexColors: true,
    });
  }
  return fryMaterial;
}

/**
 * 烤雞（GLB）與薯條（方塊），散在緞帶外緣
 * 每一塊用自己的編號當種子：加數量時只多出新的，原來那幾塊位置不變
 */
function createRiders(parent: THREE.Object3D, count: number) {
  const riders: Rider[] = [];
  for (let index = 0; index < count; index++) riders.push(createRider(parent, index));
  return riders;
}

/**
 * 前 FOOD_COUNT 塊沿用原來的亂數順序，畫面才不會因為加了滑桿而整批換位置
 * 超過 FOOD_COUNT 的各自用編號當種子，加數量時不會牽動前面那些
 */
function riderSpec(index: number) {
  if (index < FOOD_COUNT) {
    const random = createRandom(11);
    const kinds = [
      'nugget',
      'nugget',
      'nugget',
      'fry',
      'fry',
      'fry',
      'fry',
      'fry',
      'fry',
      'fry',
      'fry',
    ];
    for (let i = kinds.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
    }
    let angle = random() * Math.PI * 2;
    let spec: ReturnType<typeof oneSpec> | null = null;
    for (let i = 0; i <= index; i++) {
      const kind = kinds[i] === 'nugget' ? 'nugget' : 'fry';
      const clustered = random() < 0.4;
      // 最近也要超過兩塊食物的長度，不然一放上去就穿在一起
      angle += clustered ? 0.16 + random() * 0.2 : 0.9 + random() * 1.5;
      spec = oneSpec(kind, angle, random);
    }
    return spec!;
  }
  const random = createRandom(11 + index * 97);
  const kind = EXTRA_FOOD_KINDS[(index - FOOD_COUNT) % EXTRA_FOOD_KINDS.length];
  const angle = random() * Math.PI * 2;
  return oneSpec(kind, angle, random);
}

/** 鯊魚三角鰭：固定一塊，不計入食物數量 */
/** 魚鰭兩側：卡通半圓水紋（Sprite 循環冒出 → 放大淡出） */
const FIN_WAVE_SLOTS = 8;

let finWaveTexture: THREE.CanvasTexture | null = null;

function sharedFinWaveTexture() {
  if (finWaveTexture) return finWaveTexture;
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    const cx = size * 0.5;
    const cy = size * 0.58;
    const strokes = [
      { w: 4.5, rgba: 'rgba(255,255,255,0.92)' },
      // 舊版這一筆是淡藍色，配粉紅水波；醬是番茄紅之後改成暖奶油色
      { w: 3.2, rgba: 'rgba(255,214,170,0.75)' },
      { w: 2.4, rgba: 'rgba(255,255,255,0.55)' },
    ];
    for (let i = 0; i < 3; i++) {
      const r = 14 + i * 11;
      for (const stroke of strokes) {
        ctx.strokeStyle = stroke.rgba;
        ctx.lineWidth = stroke.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(cx, cy, r, Math.PI + 0.35, -0.35);
        ctx.stroke();
      }
    }
  }
  finWaveTexture = new THREE.CanvasTexture(canvas);
  finWaveTexture.colorSpace = THREE.SRGBColorSpace;
  return finWaveTexture;
}

type FinWaveSlot = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  age: number;
  life: number;
  side: number;
  trail: number;
};

function createSharkFinWaves(parent: THREE.Object3D, settings: SharkFinWaveSettings) {
  const group = new THREE.Group();
  group.name = 'sharkFinWaves';
  parent.add(group);
  const map = sharedFinWaveTexture();
  const slots: FinWaveSlot[] = [];
  for (let i = 0; i < FIN_WAVE_SLOTS; i++) {
    const material = new THREE.SpriteMaterial({
      map,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      color: new THREE.Color(settings.color),
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 3;
    sprite.visible = false;
    group.add(sprite);
    slots.push({
      sprite,
      material,
      age: settings.life,
      life: settings.life,
      side: 1,
      trail: settings.trail,
    });
  }
  let spawnTimer = settings.interval * 0.35;
  let nextSide = 1;
  const pos = new THREE.Vector3();
  const back = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  const lift = new THREE.Vector3();

  function applyColor() {
    const c = new THREE.Color(settings.color);
    for (const slot of slots) slot.material.color.copy(c);
  }

  function takeSlot() {
    const idle = slots.find((s) => s.age >= s.life);
    if (idle) return idle;
    return slots.reduce((best, s) => (s.age > best.age ? s : best));
  }

  function spawn() {
    const slot = takeSlot();
    slot.age = 0;
    slot.life = settings.life * (0.82 + Math.random() * 0.36);
    slot.side = nextSide;
    nextSide *= -1;
    slot.trail = settings.trail + Math.random() * settings.trail * 0.75;
    slot.sprite.visible = true;
  }

  function update(
    dt: number,
    enabled: boolean,
    finPos: THREE.Vector3,
    flowAlongTube: THREE.Vector3,
    finLateral: THREE.Vector3,
    surfaceNormal: THREE.Vector3,
  ) {
    if (!enabled) {
      for (const slot of slots) slot.sprite.visible = false;
      spawnTimer = 0;
      return;
    }
    const interval = Math.max(0.04, settings.interval);
    spawnTimer += dt;
    if (spawnTimer >= interval) {
      spawnTimer = 0;
      spawn();
    }
    const baseScale = 0.04 * settings.scale;
    const peakOpacity = THREE.MathUtils.clamp(settings.opacity, 0, 1);
    const sideBase = settings.sideSpread;
    for (const slot of slots) {
      if (slot.age >= slot.life) {
        slot.sprite.visible = false;
        continue;
      }
      slot.age += dt;
      const t = slot.age / slot.life;
      const grow = 0.5 + t * 1.05;
      slot.sprite.scale.set(baseScale * grow, baseScale * 0.75 * grow, 1);
      slot.material.opacity = Math.sin(Math.PI * t) * peakOpacity;
      back.copy(flowAlongTube).multiplyScalar(-(slot.trail + t * (settings.trail * 2.3 + 0.02)));
      lateral.copy(finLateral).multiplyScalar(slot.side * (sideBase + t * sideBase * 0.88));
      lift.copy(surfaceNormal).multiplyScalar(0.0025 + Math.sin(t * Math.PI) * 0.0015);
      pos.copy(finPos).add(back).add(lateral).add(lift);
      slot.sprite.position.copy(pos);
    }
  }

  return { update, applyColor, group };
}

function createSharkFinRider(parent: THREE.Object3D, settings: SharkFinSettings): Rider {
  const random = createRandom(9042);
  const angle = random() * Math.PI * 2;
  const mesh = new THREE.Mesh(sharedSharkFinGeometry(settings.depth), sharedSharkFinMaterial());
  const center = new THREE.Vector3(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS);
  mesh.position.copy(center);
  parent.add(mesh);
  return {
    mesh,
    kind: 'sharkFin',
    center,
    progress: THREE.MathUtils.euclideanModulo(angle, Math.PI * 2) / (Math.PI * 2),
    reach: 0.044, // 鰭放大 1.3 倍後，碰到食物的範圍也跟著變大
    drift: settings.drift,
    driftPhase: random() * Math.PI * 2,
    yawSpeed: 0,
    climb: 0,
    climbSpeed: 0,
    climbRate: 0,
    lift: settings.lift,
    yaw: 0,
    tilt: 0,
    phase: random() * Math.PI * 2,
    swimRate1: 0.55 + random() * 0.85,
    swimRate2: 0.4 + random() * 0.75,
    swimRate3: 0.25 + random() * 0.5,
    swimPhase1: random() * Math.PI * 2,
    swimPhase2: random() * Math.PI * 2,
    swimPhase3: random() * Math.PI * 2,
    ringKnock: 0,
    revealed: false,
    sharkYieldUntil: 0,
    yieldClimbDir: 1,
    freeSectionAfterShark: false,
    crustColor: '',
  };
}

function oneSpec(kind: FoodKind, angle: number, random: () => number) {
  // 只有薯條會斜斜地插在醬裡；其他食物平放
  const nugget = kind !== 'fry';
  return {
    kind,
    angle,
    drift: 0.006 + random() * 0.04,
    driftPhase: random() * Math.PI * 2,
    yawSpeed: (random() - 0.5) * 0.4,
    climb: (random() - 0.5) * 0.9,
    climbSpeed: 0.12 + random() * 0.16,
    climbRate: 0.28 + random() * 0.4,
    yaw: random() * Math.PI * 2,
    tilt: nugget ? 0 : 0.12 + random() * 0.18,
    phase: random() * Math.PI * 2,
  };
}

function createRider(parent: THREE.Object3D, index: number): Rider {
  const spec = riderSpec(index);
  const { kind, angle } = spec;
  const crustColor = kind === 'nugget' ? pickChickenCrustColor(index) : '';
  // 載入完成前先用方塊占位；原型就緒後會 upgradeRiderMesh 換成 GLB
  const mesh = createFoodMesh(kind);
  if (kind === 'nugget') applyChickenAppearance(mesh, crustColor);
  addFoodRimToObject(mesh);

  // 一開始的位置。之後每幀會沿著圈圈改這個點
  const center = new THREE.Vector3(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS);
  mesh.position.copy(center);
  parent.add(mesh);

  return {
    mesh,
    crustColor,
    center,
    progress: THREE.MathUtils.euclideanModulo(angle, Math.PI * 2) / (Math.PI * 2),
    // 有的幾乎停在醬裡，有的漂得比較快，才不會永遠保持同樣的間距
    // 薯條較長，轉到順著圈時比較容易碰到旁邊那塊
    reach: foodReach(kind),
    drift: spec.drift,
    driftPhase: spec.driftPhase,
    yawSpeed: spec.yawSpeed,
    // 一開始就有的在上緣、有的在下緣，之後各自慢慢換邊
    climb: spec.climb,
    climbSpeed: spec.climbSpeed,
    climbRate: spec.climbRate,
    // 負得比半高少一點：大部分埋在醬的外側，只留一截露出來
    lift: foodLift(kind),
    kind,
    yaw: spec.yaw,
    // 薯條只微微傾斜。斜太多時兩端會翹出醬面，整根看起來浮在空中
    tilt: spec.tilt,
    phase: spec.phase,
    swimRate1: 0,
    swimRate2: 0,
    swimRate3: 0,
    swimPhase1: 0,
    swimPhase2: 0,
    swimPhase3: 0,
    ringKnock: 0,
    revealed: false,
    sharkYieldUntil: 0,
    yieldClimbDir: 1,
    freeSectionAfterShark: false,
  };
}

export function formatKetchupSauceSettingsForPaste(s: KetchupSauceSettings) {
  return (
    `// 貼回 src/world/objects/ketchup.ts 的 KETCHUP_SAUCE_DEFAULT\n` +
    `export const KETCHUP_SAUCE_DEFAULT: KetchupSauceSettings = {\n` +
    `  color: '${s.color}',\n` +
    `  emissiveColor: '${s.emissiveColor}',\n` +
    `  emissiveStrength: ${s.emissiveStrength.toFixed(2)},\n` +
    `  roughness: ${s.roughness.toFixed(2)},\n` +
    `  clearcoat: ${s.clearcoat.toFixed(2)},\n` +
    `  clearcoatRoughness: ${s.clearcoatRoughness.toFixed(2)},\n` +
    `  envIntensity: ${s.envIntensity.toFixed(2)},\n` +
    `  rimStrength: ${s.rimStrength.toFixed(2)},\n` +
    `  rimColor: '${s.rimColor}',\n` +
    `  rimPower: ${s.rimPower.toFixed(1)},\n` +
    `  contactDark: ${s.contactDark.toFixed(2)},\n` +
    `  streakStrength: ${s.streakStrength.toFixed(2)},\n` +
    `  streakSpeed: ${s.streakSpeed.toFixed(2)},\n` +
    `  bubbleStrength: ${s.bubbleStrength.toFixed(2)},\n` +
    `  rippleStrength: ${s.rippleStrength.toFixed(2)},\n` +
    `  rippleDistance: ${s.rippleDistance.toFixed(3)},\n` +
    `};`
  );
}
