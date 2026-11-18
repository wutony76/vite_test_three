import * as THREE from 'three';

/**
 * 程式產生的荷包蛋蛋白，取代 glb 裡 150 個頂點的低面數蛋白。
 *
 * glb 的蛋白輪廓是一圈直線折角，也沒有參考圖那種「焦脆的金黃波浪邊」；
 * 它的貼圖只有正中心是白的，外圍一大片焦褐色，貼上去整顆蛋偏土黃。
 * 這裡改成自己長一片：
 *   - 輪廓：幾道不同頻率的 sin 疊起來，做出不規則的波浪邊，最外圈再加細碎的高頻，像煎得起泡的蕾絲邊
 *   - 高度：中間平、靠近蛋黃微微鼓起，外圈變薄、最邊緣往上翹一點（煎脆的邊會捲起來）
 *   - 顏色（頂點色）：中心暖白、蛋黃周圍一圈半熟的微透藍灰、外圈金黃到焦褐，焦褐部分帶斑點
 *   - 氣泡：蛋白上幾顆小小的透明氣泡（參考圖左上角那種）
 *
 * 數值可在控制面板「蛋形太陽 → 蛋白外觀」即時調整，調好後按「印出蛋白外觀」貼回這裡。
 */
export const EGG_WHITE_LOOK = {
  /** 繞一圈的切分數：越多波浪邊越細緻 */
  segments: 160,
  /** 從中心到邊緣的圈數 */
  rings: 28,
  /** 亂數種子：換一個數字就換一種輪廓、氣泡位置 */
  seed: 7,
  /** 大波浪的起伏（佔半徑比例） */
  wobble: 0.12,
  /** 邊緣細碎鋸齒（佔半徑比例） */
  lace: 0.022,
  /** 焦脆邊的寬度（佔半徑比例，從邊緣往內量） */
  crispWidth: 0.3,
  /** 最邊緣往上翹的高度（佔蛋白厚度比例） */
  rimCurl: 0.55,
  /** 靠近蛋黃那圈鼓起的高度（佔蛋白厚度比例） */
  domeBulge: 0.35,
  /** 蛋黃周圍微透藍灰圈的寬度（蛋黃半徑的倍數） */
  translucentRing: 1.75,
  /** 氣泡顆數 */
  bubbles: 4,
  /** 氣泡大小倍率 */
  bubbleSize: 1,
};

export type EggWhiteLook = typeof EGG_WHITE_LOOK;

const COLOR_CENTER = new THREE.Color(1.0, 0.985, 0.955);
const COLOR_TRANSLUCENT = new THREE.Color(0.86, 0.91, 0.93);
const COLOR_GOLD = new THREE.Color(0.95, 0.7, 0.32);
const COLOR_BROWN = new THREE.Color(0.72, 0.4, 0.14);
const COLOR_BURNT = new THREE.Color(0.5, 0.26, 0.08);

/** 固定種子的亂數：每次重新整理形狀都一樣，不會一直跳 */
function seededRandom(seed: number) {
  let s = Math.floor(seed) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/** 沿著角度繞一圈會首尾相接的平滑雜訊（幾道整數頻率的 sin 疊加） */
function makeLoopNoise(rand: () => number, freqs: number[]) {
  const waves = freqs.map((f) => ({ f, phase: rand() * Math.PI * 2, amp: 0.6 + rand() * 0.8 }));
  const total = waves.reduce((sum, w) => sum + w.amp, 0);
  return (theta: number) => waves.reduce((sum, w) => sum + w.amp * Math.sin(w.f * theta + w.phase), 0) / total;
}

type EggWhiteFit = {
  /** 原本蛋白在自己幾何座標裡的包圍盒：新蛋白要長在同一個範圍，位置、大小才不會跑掉 */
  box: THREE.Box3;
  /** 蛋黃中心（同一個座標系），半透明圈和鼓起都以它為中心 */
  yolkCenter: THREE.Vector3;
  yolkRadius: number;
};

/**
 * 蛋白表面：給極座標（theta 角度、t 0 = 中心 1 = 邊緣）回傳表面上的點和顏色。
 * 網格頂點和氣泡位置都用它算，氣泡才會剛好貼在蛋白上。
 */
function createEggWhiteSurface({ box, yolkCenter, yolkRadius }: EggWhiteFit, look: EggWhiteLook) {
  const rand = seededRandom(look.seed);
  const outline = makeLoopNoise(rand, [2, 3, 5]);
  const lace = makeLoopNoise(rand, [17, 23, 31, 41]);
  const crispNoise = makeLoopNoise(rand, [4, 7, 11]);
  const speckle = makeLoopNoise(rand, [29, 37, 53, 67]);

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const rx = size.x * 0.5;
  const rz = size.z * 0.5;
  const thickness = Math.max(size.y, 1e-4);
  const baseY = box.min.y;
  const tmp = new THREE.Color();

  // 波浪會讓輪廓比原本的蛋白大一點；先繞最外圈量出實際寬、深，之後縮回原本的大小，整顆蛋在畫面上才不會變大
  const edgeR = (theta: number, t: number) => 1 + look.wobble * outline(theta) + look.lace * lace(theta) * t ** 6;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < 720; i++) {
    const theta = (i / 720) * Math.PI * 2;
    const r = edgeR(theta, 1);
    const x = Math.cos(theta) * rx * r;
    const z = Math.sin(theta) * rz * r;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const fitX = size.x / Math.max(maxX - minX, 1e-6);
  const fitZ = size.z / Math.max(maxZ - minZ, 1e-6);
  const offsetX = -(minX + maxX) * 0.5 * fitX;
  const offsetZ = -(minZ + maxZ) * 0.5 * fitZ;

  function point(theta: number, t: number, out: THREE.Vector3) {
    const r = t * edgeR(theta, t);
    const x = center.x + offsetX + Math.cos(theta) * rx * r * fitX;
    const z = center.z + offsetZ + Math.sin(theta) * rz * r * fitZ;
    // 高度：外圈變薄，最邊緣再翹起來
    const thin = 1 - 0.65 * THREE.MathUtils.smoothstep(t, 0.6, 0.97);
    const curl = look.rimCurl * THREE.MathUtils.smoothstep(t, 0.88, 1) * (0.7 + 0.3 * crispNoise(theta * 2));
    // 靠近蛋黃的鼓起
    const dYolk = yolkDistance(x, z);
    const bulge = look.domeBulge * Math.exp(-((dYolk - 1.1) ** 2) * 1.6);
    return out.set(x, baseY + thickness * (0.75 * thin + curl + bulge), z);
  }

  /** 到蛋黃中心的距離，以蛋黃半徑為單位（1 = 剛好在蛋黃邊上） */
  function yolkDistance(x: number, z: number) {
    return Math.hypot(x - yolkCenter.x, z - yolkCenter.z) / Math.max(yolkRadius, 1e-6);
  }

  function color(theta: number, t: number, p: THREE.Vector3, ringSeed: number, out: THREE.Color) {
    // 先決定這一點離邊緣多近（焦脆寬度本身也沿著一圈有寬有窄）
    const crispStart = 1 - look.crispWidth * (0.75 + 0.45 * crispNoise(theta));
    const crisp = THREE.MathUtils.smoothstep(t, crispStart, 1);
    out.copy(COLOR_CENTER);
    // 蛋黃周圍：半熟、微透，帶一點藍灰
    const translucent = 1 - THREE.MathUtils.smoothstep(yolkDistance(p.x, p.z), 1, look.translucentRing);
    out.lerp(COLOR_TRANSLUCENT, translucent * 0.85);
    // 外圈：先轉金黃，越外越焦褐；斑點讓焦色深淺不一
    const spot = 0.5 + 0.5 * speckle(theta + ringSeed * 0.37);
    tmp.copy(COLOR_GOLD).lerp(COLOR_BROWN, THREE.MathUtils.smoothstep(crisp, 0.35, 0.9) * (0.55 + 0.45 * spot));
    if (t > 0.97) tmp.lerp(COLOR_BURNT, 0.35 + 0.35 * spot);
    return out.lerp(tmp, THREE.MathUtils.smoothstep(crisp, 0.02, 0.45));
  }

  return { point, color, yolkDistance, thickness, yolkRadius };
}

type EggWhiteSurface = ReturnType<typeof createEggWhiteSurface>;

function createEggWhiteGeometry(surface: EggWhiteSurface, look: EggWhiteLook) {
  const segs = Math.max(16, Math.round(look.segments));
  const rings = Math.max(4, Math.round(look.rings));
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();
  const c = new THREE.Color();

  // 第 0 個頂點：正中心
  surface.point(0, 0, p);
  surface.color(0, 0, p, 0, c);
  positions.push(p.x, p.y, p.z);
  colors.push(c.r, c.g, c.b);
  uvs.push(0.5, 0.5);

  for (let ring = 1; ring <= rings; ring++) {
    // t：0 = 中心、1 = 邊緣。開根號讓外圈切得比較密，焦脆邊和波浪才有足夠的頂點
    const t = Math.sqrt(ring / rings);
    for (let seg = 0; seg < segs; seg++) {
      const theta = (seg / segs) * Math.PI * 2;
      surface.point(theta, t, p);
      surface.color(theta, t, p, ring, c);
      positions.push(p.x, p.y, p.z);
      colors.push(c.r, c.g, c.b);
      uvs.push(0.5 + Math.cos(theta) * t * 0.5, 0.5 + Math.sin(theta) * t * 0.5);
    }
  }

  // 中心扇形
  for (let seg = 0; seg < segs; seg++) {
    indices.push(0, 1 + ((seg + 1) % segs), 1 + seg);
  }
  // 一圈一圈的四邊形
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * segs;
    const outer = 1 + ring * segs;
    for (let seg = 0; seg < segs; seg++) {
      const next = (seg + 1) % segs;
      indices.push(inner + seg, inner + next, outer + seg);
      indices.push(inner + next, outer + next, outer + seg);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // 法線朝 +Y 才對（蛋頂朝上）；繞序如果反了就整個翻過來
  if (geometry.getAttribute('normal').getY(0) < 0) {
    const idx = geometry.getIndex()!;
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    geometry.computeVertexNormals();
  }
  return geometry;
}

/**
 * 蛋形太陽的「鏡頭固定光」。
 * 蛋會跟著鏡頭走、永遠正對鏡頭，但場景的平行光、半球光、環境反射都固定在世界裡；
 * 轉動島嶼時蛋等於從不同方向被照，明暗、反光都會跟著跑。
 * 所以蛋白、蛋黃都不吃場景燈光，改用一盞「綁在鏡頭上」的光：
 *   - key：主光強度、ambient：背光面最暗保留多少（0～1）、dir：光的方向（鏡頭座標，x 右、y 上、z 朝鏡頭）
 *   - 環境反射也改在鏡頭座標取樣，反光的位置固定在畫面上
 * 這三個值是 uniform，改了立刻生效。
 */
export const eggViewLight = {
  key: { value: 2.8 },
  ambient: { value: 0.45 },
  dir: { value: new THREE.Vector3(-0.4, 0.6, 0.7).normalize() },
  /** 蛋黃的主光倍率（乘在 key 上） */
  yolkKeyScale: { value: 0.4 },
};

/** 在蛋的材質 onBeforeCompile 裡呼叫：把燈光、環境反射改成跟著鏡頭（見 eggViewLight） */
export function lockEggLightingToCamera(
  shader: THREE.WebGLProgramParametersWithUniforms,
  /** 這個材質的主光倍率：蛋黃是飽和的橘色，同樣的光會被洗成檸檬黃，要給低一點 */
  keyScale: { value: number } = { value: 1 },
) {
  shader.uniforms.uEggKey = eggViewLight.key;
  shader.uniforms.uEggKeyScale = keyScale;
  shader.uniforms.uEggAmbient = eggViewLight.ambient;
  shader.uniforms.uEggLightDir = eggViewLight.dir;
  // 環境貼圖：原本會把方向從鏡頭座標轉回世界座標再取樣；拿掉這一步，就是用鏡頭座標取樣
  const envChunk = THREE.ShaderChunk.envmap_physical_pars_fragment
    .replaceAll('transformNormalByInverseViewMatrix( normal, viewMatrix )', 'normal')
    .replaceAll('transformDirectionByInverseViewMatrix( reflectVec, viewMatrix )', 'reflectVec')
    .replaceAll('transformDirectionByInverseViewMatrix( retroVec, viewMatrix )', 'retroVec');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uEggKey;\nuniform float uEggKeyScale;\nuniform float uEggAmbient;\nuniform vec3 uEggLightDir;')
    .replace('#include <envmap_physical_pars_fragment>', envChunk)
    // 場景燈光都算完之後，把它們對蛋的影響換掉（環境反射 indirectSpecular 保留，它已經改成跟著鏡頭）
    .replace(
      '#include <aomap_fragment>',
      `#include <aomap_fragment>
      {
        float eggNdotL = saturate(dot(normal, uEggLightDir));
        reflectedLight.directDiffuse = diffuseColor.rgb * uEggKey * uEggKeyScale * (uEggAmbient + (1.0 - uEggAmbient) * eggNdotL);
        reflectedLight.indirectDiffuse = vec3(0.0);
        reflectedLight.directSpecular = vec3(0.0);
        #ifdef USE_CLEARCOAT
          clearcoatSpecularDirect = vec3(0.0);
        #endif
      }`,
    );
}

/**
 * 蛋白曝光曲線：x = 曲線斜率（越大越快變亮，暗部越少）、y = 最亮能到多少（> 1 會讓中心稍微過曝成純白）。
 * 所有程式蛋白共用，改 value 不用重新編譯。
 */
export const eggWhiteExposure = { value: new THREE.Vector2(0.9, 1.12) };

/**
 * 蛋白材質：頂點色當底色；自發光也乘上頂點色。
 * 少了後者，太陽模式的白色自發光會把焦褐邊整個洗成淺米色。
 */
function createEggWhiteMaterial(name: string) {
  const material = new THREE.MeshStandardMaterial({
    name,
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEggWhiteExposure = eggWhiteExposure;
    lockEggLightingToCamera(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uEggWhiteExposure;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #if defined( USE_COLOR )
          totalEmissiveRadiance *= vColor.rgb;
        #endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          // 場景沒開 tone mapping，太陽模式下蛋白被照到約 3 倍亮，超過 1 的部分直接截掉，焦褐邊會被洗成白。
          // 這裡把「被照多亮」抽成一個數字（除掉頂點色本身的亮度），用柔和曲線壓回 0～1，再乘回頂點色：
          // 顏色永遠是頂點色的色相，燈光只決定明暗。
          const vec3 eggLuma = vec3(0.2126, 0.7152, 0.0722);
          float eggLit = dot(outgoingLight, eggLuma) / max(dot(vColor.rgb, eggLuma), 0.05);
          float eggShade = uEggWhiteExposure.y * (1.0 - exp(-eggLit * uEggWhiteExposure.x));
          outgoingLight = vColor.rgb * eggShade;
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => 'fried-egg-white-procedural';
  return material;
}

/**
 * 氣泡：一片貼在蛋白上的小圓片，用 shader 畫出「透明的泡泡」：
 *   - 中間幾乎透明，邊緣一圈淡淡的灰藍
 *   - 右下邊緣稍暗（泡泡的陰影面）
 *   - 左上一個白色亮點：位置用「鏡頭座標」算，蛋怎麼轉，亮點都在畫面左上，跟蛋黃的高光同一邊
 * 不吃場景燈光，所以不會像蛋白一樣被照到過曝。
 */
const BUBBLE_GEOMETRY = new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2);
const BUBBLE_MATERIAL = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec2 vOff;
    void main() {
      vUv = uv;
      vec4 centerView = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec4 posView = modelViewMatrix * vec4(position, 1.0);
      // 幾何半徑是 1：換算成鏡頭座標裡的半徑，vOff 就是「離泡泡中心幾個半徑」（-1～1）
      float radiusView = length((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
      vOff = (posView.xy - centerView.xy) / max(radiusView, 1e-6);
      gl_Position = projectionMatrix * posView;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    varying vec2 vOff;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      if (d > 1.0) discard;
      float ring = smoothstep(0.55, 0.85, d) * (1.0 - smoothstep(0.92, 1.0, d));
      float shade = smoothstep(0.2, 0.9, dot(normalize(vOff + 1e-4), vec2(0.6, -0.6))) * smoothstep(0.6, 0.95, d);
      float highlight = 1.0 - smoothstep(0.08, 0.26, length(vOff - vec2(-0.34, 0.34)));
      vec3 col = mix(vec3(0.98, 0.99, 1.0), vec3(0.8, 0.85, 0.88), ring * 0.7 + shade * 0.25);
      col = mix(col, vec3(1.0), highlight);
      // 整體壓淡：氣泡只是點綴，若隱若現就好
      float alpha = clamp(0.06 + ring * 0.28 + shade * 0.08 + highlight * 0.65, 0.0, 1.0);
      gl_FragColor = vec4(col, alpha);
    }
  `,
});

const BUBBLES_NAME = 'egg_bubbles';
const UP = new THREE.Vector3(0, 1, 0);

function createBubbles(surface: EggWhiteSurface, look: EggWhiteLook) {
  const group = new THREE.Group();
  // 名字刻意不含 white / yolk：找蛋白、蛋黃是比對名字，含 white 會被誤認成蛋白
  group.name = BUBBLES_NAME;
  const rand = seededRandom(look.seed * 31 + 101);
  const p = new THREE.Vector3();
  const pTheta = new THREE.Vector3();
  const pT = new THREE.Vector3();
  const surfaceNormal = new THREE.Vector3();
  const placed: Array<{ x: number; z: number; r: number }> = [];
  const count = Math.max(0, Math.round(look.bubbles));
  // 試很多次、挑不重疊又不壓到蛋黃和焦脆邊的位置
  for (let attempt = 0; attempt < count * 40 && placed.length < count; attempt++) {
    const theta = rand() * Math.PI * 2;
    const t = 0.32 + rand() * 0.42;
    surface.point(theta, t, p);
    const radius = surface.yolkRadius * (0.12 + rand() * 0.22) * look.bubbleSize;
    if (surface.yolkDistance(p.x, p.z) < 1.35 + radius / surface.yolkRadius) continue;
    if (placed.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < (b.r + radius) * 1.6)) continue;
    placed.push({ x: p.x, z: p.z, r: radius });
    const bubble = new THREE.Mesh(BUBBLE_GEOMETRY, BUBBLE_MATERIAL);
    bubble.name = 'egg_bubble';
    // 蛋白表面有起伏：圓片要順著表面傾斜，否則一半會埋進蛋白裡，只看得到半圈（像 C 字）
    surface.point(theta + 0.02, t, pTheta);
    surface.point(theta, Math.min(t + 0.02, 1), pT);
    surfaceNormal.crossVectors(pT.sub(p), pTheta.sub(p)).normalize();
    if (surfaceNormal.y < 0) surfaceNormal.negate();
    bubble.quaternion.setFromUnitVectors(UP, surfaceNormal);
    // 再沿法線浮起一點，避免跟表面搶深度而閃爍
    bubble.position.copy(p).addScaledVector(surfaceNormal, surface.thickness * 0.2);
    bubble.scale.setScalar(radius);
    bubble.renderOrder = 2;
    bubble.frustumCulled = false;
    group.add(bubble);
  }
  return group;
}

type EggWhiteState = { fit: EggWhiteFit; materialName: string };
const STATE_KEY = 'friedEggWhite';

function findEggParts(root: THREE.Object3D) {
  let white: THREE.Mesh | null = null;
  let yolk: THREE.Mesh | null = null;
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || mesh.parent?.name === BUBBLES_NAME) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const name = `${material?.name ?? ''} ${mesh.name}`.toLowerCase();
    if (!white && name.includes('white')) white = mesh;
    else if (!yolk && name.includes('yolk')) yolk = mesh;
  });
  return { white: white as THREE.Mesh | null, yolk: yolk as THREE.Mesh | null };
}

/** 依目前的 EGG_WHITE_LOOK 重新長出蛋白形狀和氣泡 */
function buildInto(whiteMesh: THREE.Mesh, state: EggWhiteState) {
  const surface = createEggWhiteSurface(state.fit, EGG_WHITE_LOOK);
  const oldGeometry = whiteMesh.geometry;
  whiteMesh.geometry = createEggWhiteGeometry(surface, EGG_WHITE_LOOK);
  oldGeometry.dispose();
  whiteMesh.getObjectByName(BUBBLES_NAME)?.removeFromParent();
  whiteMesh.add(createBubbles(surface, EGG_WHITE_LOOK));
}

/**
 * 在 glb 裡找到蛋白、蛋黃，把蛋白的幾何和材質換成程式產生的版本。
 * 只換 mesh 的內容，不動它的節點，所以後面的縮放、擺放、貼球邏輯都不用改。
 */
export function replaceEggWhite(root: THREE.Object3D) {
  const { white: whiteMesh, yolk: yolkMesh } = findEggParts(root);
  if (!whiteMesh) return false;

  root.updateMatrixWorld(true);
  whiteMesh.geometry.computeBoundingBox();
  const box = whiteMesh.geometry.boundingBox!.clone();
  const yolkCenter = box.getCenter(new THREE.Vector3());
  let yolkRadius = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.18;

  if (yolkMesh) {
    // 蛋黃的中心和半徑換算到蛋白自己的座標系
    yolkMesh.geometry.computeBoundingBox();
    const yBox = yolkMesh.geometry.boundingBox!;
    const toWhite = new THREE.Matrix4().copy(whiteMesh.matrixWorld).invert().multiply(yolkMesh.matrixWorld);
    yolkCenter.copy(yBox.getCenter(new THREE.Vector3())).applyMatrix4(toWhite);
    const midZ = (yBox.min.z + yBox.max.z) * 0.5;
    const edge = new THREE.Vector3(yBox.max.x, yBox.min.y, midZ).applyMatrix4(toWhite);
    const base = new THREE.Vector3((yBox.min.x + yBox.max.x) * 0.5, yBox.min.y, midZ).applyMatrix4(toWhite);
    yolkRadius = edge.distanceTo(base);
  }

  const oldMaterial = whiteMesh.material;
  const materialName = (Array.isArray(oldMaterial) ? oldMaterial[0] : oldMaterial)?.name || 'egg_white';
  (Array.isArray(oldMaterial) ? oldMaterial : [oldMaterial]).forEach((m) => m.dispose());
  whiteMesh.material = createEggWhiteMaterial(materialName);

  const state: EggWhiteState = { fit: { box, yolkCenter, yolkRadius }, materialName };
  whiteMesh.userData[STATE_KEY] = state;
  buildInto(whiteMesh, state);
  return true;
}

/**
 * 蛋黃也換成程式產生的平滑圓頂。
 * glb 的蛋黃只有 93 個頂點、每個面各自一個法線（平面著色），晃動傾斜時會看到一塊一塊的寶石切面。
 * 這裡用一段球冠（球的頂端切下來的一片）取代：寬、高、位置都跟原本的蛋黃包圍盒一樣，
 * 材質沿用，但拿掉 glb 的貼圖（原因見下面）。
 */
export function replaceEggYolk(root: THREE.Object3D) {
  const { yolk } = findEggParts(root);
  if (!yolk) return false;
  const old = yolk.geometry;
  old.computeBoundingBox();
  const box = old.boundingBox!.clone();
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const rx = size.x * 0.5;
  const rz = size.z * 0.5;
  const r = Math.max(rx, rz, 1e-6);
  const h = Math.max(size.y, r * 0.2);
  // 底面半徑 r、高 h 的球冠：球半徑 R = (r² + h²) / 2h，球冠張角 = acos((R − h) / R)
  const R = (r * r + h * h) / (2 * h);
  const capAngle = Math.acos(THREE.MathUtils.clamp((R - h) / R, -1, 1));
  const geometry = new THREE.SphereGeometry(R, 72, 24, 0, Math.PI * 2, 0, capAngle);
  // 球心往下移，讓球冠底部落在原本蛋黃的底面；再壓成原本的寬、深（蛋黃不一定是正圓）
  geometry.translate(0, -(R - h), 0);
  geometry.scale(rx / r, 1, rz / r);
  geometry.translate(center.x, box.min.y, center.z);

  // UV：從正上方投影，0～1 剛好蓋住整顆蛋黃
  const pos = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, 0.5 + (pos.getX(i) - center.x) / (2 * rx), 0.5 + (pos.getZ(i) - center.z) / (2 * rz));
  }
  uv.needsUpdate = true;
  // glb 的 AO 貼圖用第二組 UV（uv1），沒有的話 shader 會讀不到；直接沿用同一組
  geometry.setAttribute('uv1', uv.clone());

  yolk.geometry = geometry;
  old.dispose();

  // glb 的蛋黃貼圖帶著畫死的亮斑和一大塊淺色區，原本只用到其中一小塊；攤平蓋滿整顆圓頂後會變成斑駁的黃塊。
  // 平滑圓頂不需要貼圖：拿掉貼圖、法線凹凸、AO，底色交給 friedEgg.ts 的 EGG_YOLK_BASE_COLOR，
  // 明暗由邊緣壓橘、固定高光和燈光負責。
  const materials = Array.isArray(yolk.material) ? yolk.material : [yolk.material];
  for (const material of materials) {
    const m = material as THREE.MeshStandardMaterial;
    if (!('roughness' in m)) continue;
    m.map = null;
    m.normalMap = null;
    m.aoMap = null;
    m.roughnessMap = null;
    m.metalnessMap = null;
    m.needsUpdate = true;
  }
  return true;
}

/** 控制面板改了 EGG_WHITE_LOOK 之後呼叫：用同一個擺放範圍重新長一次 */
export function rebuildEggWhite(root: THREE.Object3D) {
  const { white } = findEggParts(root);
  const state = white?.userData[STATE_KEY] as EggWhiteState | undefined;
  if (!white || !state) return false;
  buildInto(white, state);
  return true;
}

/** 調好後貼回 friedEggWhite.ts 的 EGG_WHITE_LOOK */
export function formatEggWhiteLookForPaste() {
  const L = EGG_WHITE_LOOK;
  const e = eggWhiteExposure.value;
  return (
    `// 貼到 src/world/objects/friedEggWhite.ts\n` +
    `export const EGG_WHITE_LOOK = {\n` +
    `  segments: ${L.segments},\n` +
    `  rings: ${L.rings},\n` +
    `  seed: ${L.seed},\n` +
    `  wobble: ${L.wobble.toFixed(3)},\n` +
    `  lace: ${L.lace.toFixed(3)},\n` +
    `  crispWidth: ${L.crispWidth.toFixed(2)},\n` +
    `  rimCurl: ${L.rimCurl.toFixed(2)},\n` +
    `  domeBulge: ${L.domeBulge.toFixed(2)},\n` +
    `  translucentRing: ${L.translucentRing.toFixed(2)},\n` +
    `  bubbles: ${L.bubbles},\n` +
    `  bubbleSize: ${L.bubbleSize.toFixed(2)},\n` +
    `};\n` +
    `export const eggWhiteExposure = { value: new THREE.Vector2(${e.x.toFixed(2)}, ${e.y.toFixed(2)}) };\n` +
    `// eggViewLight：key ${eggViewLight.key.value.toFixed(2)}, ambient ${eggViewLight.ambient.value.toFixed(2)}, yolkKeyScale ${eggViewLight.yolkKeyScale.value.toFixed(2)}`
  );
}
