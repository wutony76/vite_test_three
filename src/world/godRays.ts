import * as THREE from 'three';

/**
 * 畫面上方的「森林光束」（god rays）：像陽光從樹縫灑下來，一道一道平行的光，全部從左上往右下斜。
 *
 * 做法：最後一步在整個畫面上再畫一張全螢幕的四邊形（疊加發光，只會讓畫面變亮、不會遮住東西）。
 *   - 光束方向固定（angleDegrees：從「直直往下」往右轉幾度），所有光束互相平行（不是從一點放射出去）
 *   - 每個像素算「橫跨光束的座標」（跟光束方向垂直），用兩層 1D 雜訊決定哪裡有光：寬窄不一、慢慢飄移
 *   - 只有從上緣 originX 往右 width 那一段射進來的光（入射窗口），沿著光的方向往右下慢慢淡出（reach）
 * 跟場景、鏡頭無關（貼在畫面上），所以綠球怎麼轉，光束都在同一個地方；位置以畫面中心、畫面高度為準，視窗拉寬也不會整片移動。
 */
export type GodRaySettings = {
  enabled: boolean;
  /** 光的顏色 */
  color: string;
  /** 整體亮度（疊加，0～1） */
  intensity: number;
  /** 光束的斜度（°）：0 = 直直往下，45 = 左上到右下的對角線 */
  angleDegrees: number;
  /** 光從畫面上緣的哪裡開始射進來：離畫面中心多遠（畫面高度的倍數，負 = 左邊）；比它更左邊不會有光。視窗寬窄改變也不會移動 */
  originX: number;
  /** 光束範圍有多寬（從最亮處往右，畫面高度的倍數）：只有從這段上緣射進來的光 */
  width: number;
  /** 光束的密度（畫面高度內大約幾條；越大越多、越細） */
  density: number;
  /** 光束的銳利度（越大光束越細、邊緣越清楚，光束之間越暗） */
  sharpness: number;
  /** 光束沿著方向延伸多遠才淡掉（畫面高度的倍數） */
  reach: number;
  /** 飄移速度 */
  speed: number;
};

export const GOD_RAY_DEFAULT: GodRaySettings = {
  enabled: true,
  color: '#fff3d1',
  intensity: 0.15,
  angleDegrees: 38,
  originX: -1.2,
  width: 2.41,
  density: 9,
  sharpness: 2.6,
  reach: 1.1,
  speed: 0.12,
};

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uAspect;
  uniform float uAngle;
  uniform float uOriginX;
  uniform float uWidth;
  uniform float uDensity;
  uniform float uSharpness;
  uniform float uReach;
  uniform float uTime;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  // 1D 平滑雜訊：整數點各一個亂數，中間用 smoothstep 曲線內插（不會一格一格）
  float noise(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }

  void main() {
    // 畫面座標：以「畫面中心」為 x 的原點、以「畫面高度」為單位（x 乘上寬高比，斜度才不會被拉扁）。
    // 綠球永遠在畫面中間：視窗拉寬時只是兩側多出空間，光束相對綠球不動。
    // （用「畫面寬度的比例」的話，視窗一拉寬，起點和整片光紋都會跟著滑動）
    vec2 p = vec2((vUv.x - 0.5) * uAspect, vUv.y);
    // 光的方向：往下（-y）再往右轉 uAngle → 左上往右下；across 跟它垂直，用來分出一條一條的光束
    vec2 dir = vec2(sin(uAngle), -cos(uAngle));
    vec2 across = vec2(-dir.y, dir.x);
    // 兩層雜訊：粗的決定哪裡有一大束光，細的讓光束裡有一條條細紋；各自慢慢往不同方向飄（像樹葉在晃）
    float a = dot(p, across) * uDensity;
    float rays = noise(a + uTime * 0.9) * 0.65 + noise(a * 2.7 - uTime * 1.6 + 13.0) * 0.35;
    // 雜訊大多落在 0.3～0.7：先拉開對比（光束處接近 1、縫隙接近 0），再用銳利度決定光束粗細
    rays = pow(smoothstep(0.28, 0.85, rays), uSharpness * 0.5);
    // 整體慢慢呼吸（亮暗起伏），像雲飄過去
    float breathe = 0.8 + 0.2 * sin(uTime * 2.3) * sin(uTime * 1.1 + 1.7);
    // 入射窗口：沿著光束往回推，這個像素的光是從畫面上緣哪裡射進來的（entryX）。
    // 只有從 originX 往右一段（uWidth）射進來的才有光 —— 光束是平行的，只看「離最亮點多遠」的話，
    // 最亮點左上方（光的上游，例如彩虹那一帶）也會被照到
    float originX = uOriginX;
    float entryX = p.x - (1.0 - p.y) * (dir.x / -dir.y);
    float window = smoothstep(originX - 0.12, originX + 0.08, entryX)
                 * (1.0 - smoothstep(originX + uWidth * 0.55, originX + uWidth, entryX));
    // 從上緣射進來之後，沿著光的方向走越遠越淡
    float alongDist = (1.0 - p.y) / -dir.y;
    float fall = 1.0 - smoothstep(0.0, uReach, alongDist);
    fall *= fall * window;
    float light = rays * fall * breathe * uIntensity;
    gl_FragColor = vec4(uColor * light, 1.0);
  }
`;

export function createGodRays(settings: GodRaySettings = { ...GOD_RAY_DEFAULT }) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color() },
      uIntensity: { value: 0 },
      uAspect: { value: 1 },
      uAngle: { value: 0 },
      uOriginX: { value: 0 },
      uWidth: { value: 1 },
      uDensity: { value: 10 },
      uSharpness: { value: 2 },
      uReach: { value: 1 },
      uTime: { value: 0 },
    },
    // 疊加：輸出的顏色直接加到畫面上，只會變亮；不測深度、不寫深度，蓋在所有東西上面
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quad.frustumCulled = false;
  scene.add(quad);

  /** 每幀最後呼叫（主場景、前景模糊都畫完之後） */
  function render(renderer: THREE.WebGLRenderer, time: number) {
    if (!settings.enabled || settings.intensity <= 0) return;
    const size = renderer.getSize(new THREE.Vector2());
    const u = material.uniforms;
    u.uColor.value.set(settings.color);
    u.uIntensity.value = settings.intensity;
    u.uAspect.value = size.x / Math.max(size.y, 1);
    u.uAngle.value = THREE.MathUtils.degToRad(settings.angleDegrees);
    u.uOriginX.value = settings.originX;
    u.uWidth.value = settings.width;
    u.uDensity.value = settings.density;
    u.uSharpness.value = settings.sharpness;
    u.uReach.value = settings.reach;
    u.uTime.value = time * settings.speed;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(scene, camera);
    renderer.autoClear = autoClear;
  }

  return { settings, render };
}

export function formatGodRaySettingsForPaste(s: GodRaySettings) {
  return (
    `// 貼回 src/world/godRays.ts 的 GOD_RAY_DEFAULT\n` +
    `export const GOD_RAY_DEFAULT: GodRaySettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  color: '${s.color}',\n` +
    `  intensity: ${s.intensity.toFixed(2)},\n` +
    `  angleDegrees: ${Math.round(s.angleDegrees)},\n` +
    `  originX: ${s.originX.toFixed(2)},\n` +
    `  width: ${s.width.toFixed(2)},\n` +
    `  density: ${s.density.toFixed(1)},\n` +
    `  sharpness: ${s.sharpness.toFixed(2)},\n` +
    `  reach: ${s.reach.toFixed(2)},\n` +
    `  speed: ${s.speed.toFixed(2)},\n` +
    `};`
  );
}
