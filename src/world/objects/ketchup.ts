import * as THREE from 'three';

// 番茄醬緞帶：沿著「繞球、上下起伏」的曲線長出一條管子，再用 shader 讓它流動

// 繞行半徑：比球（半徑 1）大一點，醬汁才會貼著球外圍繞，而不是陷進球裡
const ORBIT_RADIUS = 1.05;
// 管子粗細（半徑）
const TUBE_RADIUS = 0.12;
// 上下起伏的「最大」高度：隨機起伏再怎麼疊加都不會超過這個值
const WAVE_HEIGHT = 0.15;
// 隨機種子：換一個數字就會得到一條不同的起伏曲線；同一個數字每次重新整理都長一樣
const WAVE_SEED = 7;
// 整條緞帶繞球自轉的速度（弧度 / 秒）
const SPIN_SPEED = 0.15;
// 醬汁表面流動、蠕動的速度倍率：1 = 原速，0.5 = 慢一半，0 = 完全靜止
const FLOW_SPEED = 0.5;
// 環境反射強度（見材質的 envMapIntensity）
const ENV_INTENSITY = 0.4;
// 緞帶整圈的擺放角度：
// RING_TILT = 從水平往上翻幾度（0 = 水平繞球、π/2 = 垂直繞球，從球頂翻過去）
// RING_YAW  = 翻起來之後，整圈面向哪個方位（繞 y 軸轉）
const RING_TILT = Math.PI / 2 + Math.PI / 4;
// const RING_YAW = 0;
const RING_YAW = Math.PI / 2 + Math.PI / 10;
// 整圈往上抬多高（世界座標的 y）：0 = 圈圈中心對準球心
const RING_OFFSET_Y = 0.75;

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
  // @types/three 把 Curve 的建構子標成 protected（只准子類別呼叫），
  // 少了這個公開的建構子，外面 new KetchupCurve() 會被 TypeScript 擋下
  constructor() {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()) {
    const angle = t * Math.PI * 2;
    // wave 回傳 -1 ~ 1 的隨機起伏，乘上 WAVE_HEIGHT 就是實際高度
    const y = wave(angle) * WAVE_HEIGHT;
    return target.set(Math.cos(angle) * ORBIT_RADIUS, y, Math.sin(angle) * ORBIT_RADIUS);
  }
}

export function createKetchup(envMap: THREE.Texture) {
  // 參數：路徑、沿路徑切幾段、管子半徑、管子圓周切幾段、頭尾是否接起來
  // 段數切細一點，下面 shader 推動頂點時表面才會平滑，不會一格一格
  const geometry = new THREE.TubeGeometry(new KetchupCurve(), 400, TUBE_RADIUS, 24, true);

  // aProgress：每個頂點在管子上走到哪裡（0 ~ 1），shader 用它算「哪一段該鼓起來」
  // TubeGeometry 的 uv.x 剛好就是沿管子的進度，複製一份成自訂屬性
  // 為什麼不直接用 uv？內建材質只有在用到貼圖時才會宣告 uv，沒貼圖時 shader 裡讀不到
  const uv = geometry.getAttribute('uv');
  const progress = new Float32Array(uv.count);
  for (let i = 0; i < uv.count; i++) progress[i] = uv.getX(i);
  geometry.setAttribute('aProgress', new THREE.BufferAttribute(progress, 1));

  const material = new THREE.MeshPhysicalMaterial({
    color: 0xe83055,
    // 粗糙度低 = 表面滑順、高光集中，像濕潤的醬汁
    roughness: 0.15,
    // 清漆層：在表面再疊一層透明的亮面，醬汁「油亮」的感覺主要靠它
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    // 環境貼圖：讓側面、凹折處反射出柔和的環境光，不會變成死黑
    envMap,
    // 環境反射的強度：越大暗部越亮，但太大醬汁會泛白、黃光紫光的氣氛也會被沖淡
    envMapIntensity: ENV_INTENSITY,
    // 一點橙紅色的自發光：不受燈光影響，凹折處就算照不到光、反射也很弱，最暗也只會是橙紅，不會死黑
    // 亮面的燈光比它強很多會蓋過去，所以橙色只在暗部看得出來，整體還是紅的
    emissive: 0x5a1800,
  });

  // 所有 shader 共用同一個 uniform 物件：每幀改 value，shader 就會讀到新的時間
  const uniforms = { uTime: { value: 0 } };

  // onBeforeCompile：在 three.js 編譯內建材質的 shader 前插入自己的程式碼
  // 好處是保留 MeshPhysicalMaterial 的光照、清漆效果，只加上我們要的變形
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute float aProgress;`,
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
        // 管子半徑 ${TUBE_RADIUS}，推動量控制在半徑的一半以內，才不會細到斷掉
        transformed += objectNormal * (blob * 0.05 + wobble * 0.02);`,
      );
  };

  const mesh = new THREE.Mesh(geometry, material);

  // 為什麼要多包一層 pivot？
  // 「擺放角度」和「自轉」要分開：pivot 負責把整圈翻起來、轉到想要的方位，
  // 裡面的 mesh 只管繞自己的 y 軸自轉。少了這層，兩種旋轉寫在同一個物件上會互相干擾，
  // 自轉軸會跟著歪掉，醬汁就不會沿著圈圈流
  const pivot = new THREE.Group();
  // 'YXZ'：先轉方位（y），再往上翻（x），翻的方向才會跟著方位走
  pivot.rotation.set(RING_TILT, RING_YAW, 0, 'YXZ');
  // 位置也放在 pivot 上：只搬動整圈，不影響裡面 mesh 的自轉
  pivot.position.y = RING_OFFSET_Y;
  pivot.add(mesh);

  /** 每幀呼叫：time 單位是秒 */
  function update(time: number) {
    // 傳進 shader 的時間先乘上倍率：shader 裡所有用到 uTime 的動畫會一起變快或變慢
    uniforms.uTime.value = time * FLOW_SPEED;
    // 整條緞帶繞自己的軸（翻起來之後的 y 軸）慢慢轉，看起來像醬汁在繞著球跑
    mesh.rotation.y = time * SPIN_SPEED;
  }

  return { object: pivot, update };
}
