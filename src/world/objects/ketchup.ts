import * as THREE from 'three';
import { createSplash } from './splash';

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
// 雞塊加薯條的總數。控制面板可以改，這裡是一打開畫面時的數量
const FOOD_COUNT = 7;
// 滑桿上限。形狀和材質是共用的，不會每一塊都做一份新的
const FOOD_COUNT_MAX = 150;
// 番茄醬海：三角魚鰭（鯊魚），沿環較快游動
const SHARK_FIN_ENABLED = true;
const SHARK_FIN_COLOR = 0xc07ab8;
// 整圈進度 / 秒；雞塊薯條約 0.006~0.046，鰭快很多才有「掠過醬海」的感覺
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
const SHARK_FIN_WAVE_COLOR = 0xfd0808;

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
  const geometry = new THREE.TubeGeometry(curve, 25, TUBE_RADIUS, 8, true);

  // aProgress：每個頂點在管子上走到哪裡（0 ~ 1），shader 用它算「哪一段該鼓起來」
  // TubeGeometry 的 uv.x 剛好就是沿管子的進度，複製一份成自訂屬性
  // 為什麼不直接用 uv？內建材質只有在用到貼圖時才會宣告 uv，沒貼圖時 shader 裡讀不到
  const uv = geometry.getAttribute('uv');
  const progress = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) progress[i] = uv.getX(i);
  geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));
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
  };

  // onBeforeCompile：在 three.js 編譯內建材質的 shader 前插入自己的程式碼
  // 好處是保留 MeshPhysicalMaterial 的光照、清漆效果，只加上我們要的變形
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uWrap = uniforms.uWrap;
    shader.uniforms.uWrapOrigin = uniforms.uWrapOrigin;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uWrap;
        uniform float uWrapOrigin;
        varying float vWrapProgress;`,
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
        varying float vWrapProgress;`,
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
        vWrapProgress = aProgress;`,
      );
  };

  const mesh = new THREE.Mesh(geometry, material);
  // 雞塊、薯條掛在緞帶自己身上：mesh 繞 y 軸轉的時候，它們會跟著醬一起繞，不用另外算位置
  // 用 let：控制面板改數量時會換掉這份清單，update 每幀讀到的才是新的
  let riders = createRiders(mesh, FOOD_COUNT);
  const sharkFinSettings: SharkFinSettings = {
    enabled: SHARK_FIN_ENABLED,
    drift: SHARK_FIN_DRIFT,
    color: `#${SHARK_FIN_COLOR.toString(16).padStart(6, '0')}`,
    forward: true,
    lift: -0.035,
    depth: 0.008,
    curveAmp: SHARK_FIN_CURVE_AMP,
    curveRate: SHARK_FIN_CURVE_RATE,
  };
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
  const foodSettings = { count: FOOD_COUNT };
  const visualSettings: KetchupVisualSettings = { opacity: 1 };

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
    sharkFin.mesh.geometry = sharedSharkFinGeometry(sharkFinSettings.depth);
    setWrap(uniforms.uWrap.value);
  }

  /** 把食物數量改成 count。多的從尾巴拿掉，少的只補新的，已經在漂的不會被重新洗牌 */
  function setFoodCount(count: number) {
    const next = THREE.MathUtils.clamp(Math.round(count), 0, FOOD_COUNT_MAX);
    while (riders.length > next) {
      const removed = riders.pop();
      if (removed) disposeRider(removed);
    }
    while (riders.length < next) riders.push(createRider(mesh, riders.length));
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
    // 整條緞帶繞自己的軸（翻起來之後的 y 軸）慢慢轉，看起來像醬汁在繞著球跑
    mesh.rotation.y = time * SPIN_SPEED;
    // 配料貼在醬的外側，沿著醬慢慢漂。不看鏡頭，旋轉畫面時才不會跟著滑
    const deltaTime = lastTime === null ? 0 : Math.min(time - lastTime, 0.1);
    lastTime = time;
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
      rider.mesh.position.copy(riderWorld).addScaledVector(riderDir, TUBE_RADIUS + swell + rider.lift + bob);
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
        finWaves.update(
          deltaTime,
          sharkFinWaveSettings.enabled && sharkFinSettings.enabled && rider.mesh.visible,
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
    foodSettings,
    setFoodCount,
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

type RiderKind = 'nugget' | 'fry' | 'sharkFin';

type Rider = {
  mesh: THREE.Mesh;
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
  // 形狀和材質是所有同類食物共用的，拿掉一塊時不能一起丟掉
  rider.mesh.removeFromParent();
}

let nuggetGeometry: THREE.BoxGeometry | null = null;
let fryGeometry: THREE.BoxGeometry | null = null;
let sharkFinGeometry: THREE.BufferGeometry | null = null;
let sharkFinGeometryDepth = NaN;
let nuggetMaterial: THREE.MeshPhongMaterial | null = null;
let fryMaterial: THREE.MeshPhongMaterial | null = null;
let sharkFinMaterial: THREE.MeshPhongMaterial | null = null;

function sharedSharkFinGeometry(depth = 0.008) {
  if (sharkFinGeometry && sharkFinGeometryDepth === depth) return sharkFinGeometry;
  if (sharkFinGeometry) sharkFinGeometry.dispose();
  // ◺ 直角三角：左下直角、左上尖、右下與底邊相接（不是等腰三稜錐）
  const baseW = 0.056;
  const height = 0.062;
  const tipFlat = 0.011;
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.lineTo(baseW, 0);
  outline.lineTo(tipFlat, height);
  outline.lineTo(0, height - tipFlat);
  outline.closePath();
  const geom = new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: false });
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
  if (!fryGeometry) {
    fryGeometry = new THREE.BoxGeometry(0.014, 0.06, 0.014);
    darkenSunkSide(fryGeometry);
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
 * 少量雞塊（正方體）和薯條（細長方體），散在緞帶外緣
 * 每一塊用自己的編號當種子：加數量時只多出新的，原來那幾塊位置不變
 */
function createRiders(parent: THREE.Object3D, count: number) {
  const riders: Rider[] = [];
  for (let index = 0; index < count; index++) riders.push(createRider(parent, index));
  return riders;
}

/**
 * 前 7 塊沿用原來的亂數順序，畫面才不會因為加了滑桿而整批換位置
 * 第 8 塊以後各自用編號當種子，加數量時不會牽動前面那些
 */
function riderSpec(index: number) {
  if (index < FOOD_COUNT) {
    const random = createRandom(11);
    const kinds = ['nugget', 'nugget', 'nugget', 'fry', 'fry', 'fry', 'fry'];
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
  const kind = index % 7 < 3 ? 'nugget' : 'fry';
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
      { w: 3.2, rgba: 'rgba(190,235,255,0.75)' },
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
    reach: 0.034,
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
  };
}

function oneSpec(kind: 'nugget' | 'fry', angle: number, random: () => number) {
  const nugget = kind === 'nugget';
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
  // 正方體 = 雞塊；細長的長方體 = 薯條。形狀共用，數量很大時才不會每一塊都做一份
  const mesh = new THREE.Mesh(sharedFoodGeometry(kind), sharedFoodMaterial(kind));

  // 一開始的位置。之後每幀會沿著圈圈改這個點
  const center = new THREE.Vector3(Math.cos(angle) * ORBIT_RADIUS, 0, Math.sin(angle) * ORBIT_RADIUS);
  mesh.position.copy(center);
  parent.add(mesh);

  return {
    mesh,
    center,
    progress: THREE.MathUtils.euclideanModulo(angle, Math.PI * 2) / (Math.PI * 2),
    // 有的幾乎停在醬裡，有的漂得比較快，才不會永遠保持同樣的間距
    // 薯條較長，轉到順著圈時比較容易碰到旁邊那塊
    reach: kind === 'nugget' ? 0.032 : 0.038,
    drift: spec.drift,
    driftPhase: spec.driftPhase,
    yawSpeed: spec.yawSpeed,
    // 一開始就有的在上緣、有的在下緣，之後各自慢慢換邊
    climb: spec.climb,
    climbSpeed: spec.climbSpeed,
    climbRate: spec.climbRate,
    // 負得比半高少一點：大部分埋在醬的外側，只留一截露出來
    lift: kind === 'nugget' ? -0.016 : -0.026,
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
