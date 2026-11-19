import * as THREE from 'three';

/**
 * 畫面上方的「森林光束」（god rays）：像陽光從樹縫灑下來，一道一道平行的光，全部從左上往右下斜。
 *
 * 做法：最後一步在整個畫面上再畫一張全螢幕的四邊形（疊加發光，只會讓畫面變亮、不會遮住東西）。
 *   - 光束方向固定（angleDegrees：從「直直往下」往右轉幾度），所有光束互相平行（不是從一點放射出去）
 *   - 每個像素算「橫跨光束的座標」（跟光束方向垂直），用兩層 1D 雜訊決定哪裡有光：寬窄不一、慢慢飄移
 *   - 左上角（光進來的地方）最亮，沿著光的方向往右下慢慢淡出（reach）
 * 跟場景、鏡頭無關（貼在畫面上），所以綠球怎麼轉、視窗多寬，光束都在同一個地方。
 */
export type GodRaySettings = {
  enabled: boolean;
  /** 光的顏色 */
  color: string;
  /** 整體亮度（疊加，0～1） */
  intensity: number;
  /** 光束的斜度（°）：0 = 直直往下，45 = 左上到右下的對角線 */
  angleDegrees: number;
  /** 最亮的位置在畫面上緣的哪裡（0 = 最左、1 = 最右）：光從這附近進來 */
  originX: number;
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
  intensity: 0.45,
  angleDegrees: 38,
  originX: 0.15,
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
    // 畫面座標換成「寬高等比」的空間：x 乘上寬高比，斜度才不會被拉扁
    vec2 p = vec2(vUv.x * uAspect, vUv.y);
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
    // 光從左上角附近進來：離那一點越遠越淡（沿著光的方向走得越遠越淡，橫向也稍微淡一點）
    vec2 origin = vec2(uOriginX * uAspect, 1.0);
    vec2 d = p - origin;
    float alongDist = max(dot(d, dir), 0.0);
    float sideDist = abs(dot(d, across));
    float fall = 1.0 - smoothstep(0.0, uReach, alongDist + sideDist * 0.35);
    fall *= fall;
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
    `  density: ${s.density.toFixed(1)},\n` +
    `  sharpness: ${s.sharpness.toFixed(2)},\n` +
    `  reach: ${s.reach.toFixed(2)},\n` +
    `  speed: ${s.speed.toFixed(2)},\n` +
    `};`
  );
}
