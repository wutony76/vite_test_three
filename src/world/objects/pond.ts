import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();

/**
 * 綠球上的小水潭：全部用程式產生（不是 GLB），因為它是「貼在地上的一片」，
 * 重點在水面 shader（深淺漸層、漣漪、岸邊水花），而不是模型的形狀。
 *
 * 組成：
 *   1. 水面：不規則圓形，頂點依球面彎曲（不然邊緣會浮在空中）
 *   2. 岸邊泥土：一圈往外淡出的泥色，和草地自然接起來
 *   3. 岸邊石頭：一圈扁扁的 low-poly 小石頭（一個 InstancedMesh）
 *   4. 荷葉、小粉花、一叢香蒲（香蒲會隨風擺）
 *
 * 注意：綠球是實心的，水面「挖不下去」——挖到球面以下就被綠球擋住看不到。
 * 所以水面其實比草地高一點點，靠岸邊石頭和泥土把邊緣蓋住，看起來才像凹下去的水潭。
 */
export type PondSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 水面半徑（世界單位；綠球半徑 1） */
  size: number;
  sink: number;
  /** 水潭中央（深處）的顏色 */
  waterDeep: string;
  /** 靠岸（淺處）的顏色 */
  waterShallow: string;
  /** 漣漪明顯程度（0 = 平靜無波） */
  ripple: number;
  /** 彩虹色的濃度（0 = 原本的藍色水面，1 = 整片彩虹） */
  rainbow: number;
  /** 彩虹流動的速度（每秒繞幾圈色環；0 = 不動） */
  rainbowSpeed: number;
  lilyPads: boolean;
  reeds: boolean;
};

export const POND_DEFAULT: PondSettings = {
  enabled: true,
  // 使用者在面板上調好的位置（龍兔的家附近，溜滑梯滑下來的終點）
  angleFromTopDegrees: 16,
  azimuthDegrees: 171,
  spinDegrees: -72,
  size: 0.095,
  sink: 0,
  waterDeep: '#2F8FBF',
  waterShallow: '#8FE3E6',
  ripple: 1,
  rainbow: 0.75,
  rainbowSpeed: 0.08,
  lilyPads: true,
  reeds: true,
};

type CreatePondOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: PondSettings;
};

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 水潭輪廓：圓再加兩層低頻波動，看起來像自然形成的水坑，不是完美的圓 */
function shoreRadius(theta: number) {
  return 1 + 0.13 * Math.sin(2 * theta + 0.7) + 0.07 * Math.sin(3 * theta + 2.1) + 0.04 * Math.sin(5 * theta + 0.3);
}

const RINGS = 7;
const SEGMENTS = 56;

export function createPond({ groundRadius, up, front, envMap, layout = POND_DEFAULT }: CreatePondOptions) {
  const settings: PondSettings = { ...layout };
  const anchor = new THREE.Object3D();
  anchor.name = 'pond';
  const content = new THREE.Group();
  anchor.add(content);
  let introGrow = 1;
  let builtKey = '';
  let time = 0;

  /**
   * anchor 座標裡「地表」的高度：anchor 放在半徑 (R - sink) 的球面上、+Y 朝外，
   * 離中心水平距離 d 的地表會往下彎 —— 少了這個，水面是平的，邊緣會翹起來浮在草地上。
   */
  function groundY(x: number, z: number) {
    const anchorRadius = groundRadius - settings.sink;
    return Math.sqrt(Math.max(groundRadius * groundRadius - x * x - z * z, 0)) - anchorRadius;
  }

  // ── 材質（重建幾何時沿用，不重建）──
  const waterUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(settings.waterDeep) },
    uShallow: { value: new THREE.Color(settings.waterShallow) },
    uRipple: { value: settings.ripple },
    uRainbow: { value: settings.rainbow ?? POND_DEFAULT.rainbow },
    uRainbowSpeed: { value: settings.rainbowSpeed ?? POND_DEFAULT.rainbowSpeed },
  };
  const waterMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    // 粗糙度太低（像鏡子）時，斜著看環境反射會把整片水面洗成白灰色，看不出是水
    roughness: 0.32,
    metalness: 0,
    envMap: envMap ?? null,
    envMapIntensity: 0.35,
    // 比岸邊泥土「後畫」：深度幾乎一樣時，讓泥土蓋在水面邊緣上
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  waterMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 aPond;\nattribute float aEdge;\nvarying vec2 vPond;\nvarying float vEdge;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPond = aPond;\nvEdge = aEdge;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform float uRipple;
        uniform float uRainbow;
        uniform float uRainbowSpeed;
        varying vec2 vPond;
        // 色相（0～1 繞一圈）→ RGB：飽和度、亮度固定，讓彩虹偏粉嫩、不刺眼
        vec3 pondHue(float h) {
          vec3 k = clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
          return mix(vec3(1.0), k, 0.62);
        }
        varying float vEdge;
        // 一圈一圈往外擴散的漣漪：中心點 c、波長、速度；離中心越遠越淡
        float pondRing(vec2 p, vec2 c, float phase) {
          float r = length(p - c);
          float wave = fract(r * 2.6 - uTime * 0.32 + phase);
          // 只有 wave 接近 0.5 的那一小段是亮線（寬約 0.04）；其他地方 = 0，維持原本水色
          float line = 1.0 - smoothstep(0.015, 0.05, abs(wave - 0.5));
          return line * (1.0 - smoothstep(0.15, 0.85, r));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // 深淺：中央深、靠岸淺（vEdge：中心 0 → 岸邊 1）
        vec3 pondColor = mix(uDeep, uShallow, smoothstep(0.45, 1.0, vEdge));
        // 漣漪：兩個錯開的中心，亮線疊在水色上
        float ripples = max(pondRing(vPond, vec2(0.28, -0.12), 0.0), pondRing(vPond, vec2(-0.30, 0.22), 0.45));
        // 彩虹：色相沿著繞水潭一圈的角度變化，再加上離中心的距離、時間，變成慢慢旋轉的漩渦色帶
        // 中央深處淡一點（保留水的深度感），往岸邊越來越明顯
        float pondAngle = atan(vPond.y, vPond.x) / 6.2831853;
        float pondHueValue = pondAngle + length(vPond) * 0.55 - uTime * uRainbowSpeed;
        vec3 rainbowColor = pondHue(pondHueValue);
        pondColor = mix(pondColor, rainbowColor, uRainbow * mix(0.55, 1.0, smoothstep(0.1, 0.8, vEdge)));
        // 漣漪亮線也帶一點彩虹色（色相比水面錯開半圈，看得出來）
        vec3 rippleColor = mix(vec3(0.93, 0.99, 1.0), pondHue(pondHueValue + 0.5), uRainbow * 0.6);
        pondColor = mix(pondColor, rippleColor, ripples * 0.55 * uRipple);
        // 岸邊一圈淡淡的白色水花，跟泥土交界比較柔和
        pondColor = mix(pondColor, vec3(0.95, 0.98, 0.97), smoothstep(0.86, 1.0, vEdge) * 0.45);
        diffuseColor.rgb = pondColor;
        // 一點點自發光：背光那一側的水也保持清透的藍，不會暗成灰色
        totalEmissiveRadiance += pondColor * 0.18;`,
      );
  };
  waterMaterial.customProgramCacheKey = () => 'world-pond-water';

  // 岸邊泥土：vertex color 帶 alpha，外圈完全透明 → 和綠球的草地顏色自然接起來
  const bankMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    roughness: 0.95,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const padMaterial = new THREE.MeshStandardMaterial({ color: '#5FAA4C', roughness: 0.6, side: THREE.DoubleSide });
  const padDarkMaterial = new THREE.MeshStandardMaterial({ color: '#4A8F3C', roughness: 0.6, side: THREE.DoubleSide });
  const petalMaterial = new THREE.MeshStandardMaterial({ color: '#F7A8C4', roughness: 0.5, flatShading: true });
  const flowerCenterMaterial = new THREE.MeshStandardMaterial({ color: '#FFD65A', roughness: 0.5 });
  const reedMaterial = new THREE.MeshStandardMaterial({ color: '#6E9A3E', roughness: 0.8, flatShading: true });
  const cattailMaterial = new THREE.MeshStandardMaterial({ color: '#7A4A2A', roughness: 0.8 });

  const pads: { mesh: THREE.Object3D; phase: number }[] = [];
  const reeds: { mesh: THREE.Object3D; phase: number }[] = [];
  let padGroup: THREE.Group | null = null;
  let reedGroup: THREE.Group | null = null;

  function disposeContent() {
    content.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    content.clear();
    pads.length = 0;
    reeds.length = 0;
  }

  /** 水面高度（比地表高一點點，原因見檔案開頭） */
  const WATER_LIFT = 0.0016;

  function build() {
    disposeContent();
    const r = settings.size;
    const random = seededRandom(20261117);

    // ── 1. 水面：極座標網格（一圈一圈），頂點貼著球面 ──
    {
      const positions: number[] = [];
      const pondCoords: number[] = [];
      const edges: number[] = [];
      const indices: number[] = [];
      // 中心點
      positions.push(0, groundY(0, 0) + WATER_LIFT, 0);
      pondCoords.push(0, 0);
      edges.push(0);
      for (let i = 1; i <= RINGS; i++) {
        // 最外圈稍微伸進泥土底下（1.04 倍），交界不會露縫
        const t = (i / RINGS) * 1.04;
        for (let j = 0; j < SEGMENTS; j++) {
          const theta = (j / SEGMENTS) * Math.PI * 2;
          const radius = t * r * shoreRadius(theta);
          const x = Math.cos(theta) * radius;
          const z = Math.sin(theta) * radius;
          positions.push(x, groundY(x, z) + WATER_LIFT, z);
          pondCoords.push(x / r, z / r);
          edges.push(Math.min(t, 1));
        }
      }
      for (let j = 0; j < SEGMENTS; j++) indices.push(0, 1 + ((j + 1) % SEGMENTS), 1 + j);
      for (let i = 1; i < RINGS; i++) {
        const a = 1 + (i - 1) * SEGMENTS;
        const b = 1 + i * SEGMENTS;
        for (let j = 0; j < SEGMENTS; j++) {
          const j1 = (j + 1) % SEGMENTS;
          indices.push(a + j, a + j1, b + j, a + j1, b + j1, b + j);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('aPond', new THREE.Float32BufferAttribute(pondCoords, 2));
      geometry.setAttribute('aEdge', new THREE.Float32BufferAttribute(edges, 1));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const water = new THREE.Mesh(geometry, waterMaterial);
      water.name = 'pond_water';
      water.receiveShadow = true;
      content.add(water);
    }

    // ── 2. 岸邊泥土：從水邊（1.0）到 1.35 倍，顏色由泥色淡出成透明 ──
    {
      const BANK_RINGS = 4;
      const positions: number[] = [];
      const colors: number[] = [];
      const indices: number[] = [];
      const mud = new THREE.Color('#8C6B4A');
      const wetMud = new THREE.Color('#6B4E36');
      const c = new THREE.Color();
      for (let i = 0; i <= BANK_RINGS; i++) {
        const k = i / BANK_RINGS;
        for (let j = 0; j < SEGMENTS; j++) {
          const theta = (j / SEGMENTS) * Math.PI * 2;
          const radius = r * shoreRadius(theta) * (0.97 + k * 0.38);
          const x = Math.cos(theta) * radius;
          const z = Math.sin(theta) * radius;
          // 內圈略高（蓋住水面邊緣），往外慢慢貼回草地
          positions.push(x, groundY(x, z) + THREE.MathUtils.lerp(0.0026, 0.0006, k), z);
          c.copy(wetMud).lerp(mud, Math.min(1, k * 2));
          colors.push(c.r, c.g, c.b, 1 - k * k);
        }
      }
      for (let i = 0; i < BANK_RINGS; i++) {
        const a = i * SEGMENTS;
        const b = (i + 1) * SEGMENTS;
        for (let j = 0; j < SEGMENTS; j++) {
          const j1 = (j + 1) % SEGMENTS;
          indices.push(a + j, a + j1, b + j, a + j1, b + j1, b + j);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const bank = new THREE.Mesh(geometry, bankMaterial);
      bank.name = 'pond_bank';
      bank.receiveShadow = true;
      // 先畫水、再畫半透明的泥土
      bank.renderOrder = 1;
      content.add(bank);
    }

    // ── 3. 岸邊石頭：沿著水邊排一圈，大小、顏色、間隔都隨機 ──
    {
      const STONES = 16;
      const geometry = new THREE.IcosahedronGeometry(1, 0);
      const stones = new THREE.InstancedMesh(geometry, stoneMaterial, STONES);
      stones.name = 'pond_stones';
      stones.castShadow = true;
      stones.receiveShadow = true;
      const palette = ['#B9B3A8', '#9D978E', '#D0C9BB', '#8F8A84', '#C2B9A6'].map((hex) => new THREE.Color(hex));
      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      const euler = new THREE.Euler();
      let count = 0;
      for (let k = 0; k < STONES; k++) {
        // 留一段空缺（香蒲那一側），石頭圈才不會整齊得像花壇
        const theta = (k / STONES) * Math.PI * 2 + (random() - 0.5) * 0.25;
        if (settings.reeds && Math.abs(Math.atan2(Math.sin(theta - 2.4), Math.cos(theta - 2.4))) < 0.45) continue;
        const radius = r * shoreRadius(theta) * (1.04 + random() * 0.14);
        const x = Math.cos(theta) * radius;
        const z = Math.sin(theta) * radius;
        const size = r * (0.1 + random() * 0.09);
        scale.set(size * (1 + random() * 0.5), size * (0.45 + random() * 0.2), size);
        position.set(x, groundY(x, z) + scale.y * 0.35, z);
        quaternion.setFromEuler(euler.set((random() - 0.5) * 0.4, random() * Math.PI * 2, (random() - 0.5) * 0.4));
        matrix.compose(position, quaternion, scale);
        stones.setMatrixAt(count, matrix);
        stones.setColorAt(count, palette[Math.floor(random() * palette.length)]);
        count++;
      }
      stones.count = count;
      stones.instanceMatrix.needsUpdate = true;
      if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
      content.add(stones);
    }

    // ── 4a. 荷葉＋一朵小粉花：浮在水面上，會慢慢轉 ──
    padGroup = new THREE.Group();
    padGroup.name = 'pond_lily_pads';
    {
      // 一片圓葉缺一角（荷葉的招牌缺口）
      const padGeometry = new THREE.CircleGeometry(1, 18, 0.35, Math.PI * 2 - 0.7);
      padGeometry.rotateX(-Math.PI / 2);
      const spots: [number, number, number, boolean][] = [
        [0.36, 0.18, 0.2, true],
        [-0.32, -0.26, 0.16, false],
        [0.04, -0.5, 0.13, false],
        [0.5, -0.12, 0.1, false],
      ];
      spots.forEach(([u, v, s, flower], index) => {
        const x = u * r;
        const z = v * r;
        const holder = new THREE.Group();
        holder.position.set(x, groundY(x, z) + WATER_LIFT + 0.0007, z);
        const pad = new THREE.Mesh(padGeometry, index % 2 ? padDarkMaterial : padMaterial);
        pad.scale.setScalar(s * r);
        pad.receiveShadow = true;
        holder.add(pad);
        if (flower) {
          // 五片小花瓣圍一圈＋黃色花心
          const petalGeometry = new THREE.IcosahedronGeometry(1, 0);
          for (let p = 0; p < 5; p++) {
            const angle = (p / 5) * Math.PI * 2;
            const petal = new THREE.Mesh(petalGeometry, petalMaterial);
            const ps = s * r * 0.32;
            petal.scale.set(ps, ps * 0.55, ps * 0.6);
            petal.position.set(Math.cos(angle) * ps * 0.8, ps * 0.45, Math.sin(angle) * ps * 0.8);
            petal.rotation.y = -angle;
            petal.rotation.z = 0.5;
            petal.castShadow = true;
            holder.add(petal);
          }
          const center = new THREE.Mesh(new THREE.SphereGeometry(s * r * 0.14, 8, 6), flowerCenterMaterial);
          center.position.y = s * r * 0.22;
          holder.add(center);
        }
        holder.rotation.y = random() * Math.PI * 2;
        padGroup!.add(holder);
        pads.push({ mesh: holder, phase: random() * Math.PI * 2 });
      });
    }
    padGroup.visible = settings.lilyPads;
    content.add(padGroup);

    // ── 4b. 一叢香蒲：細長葉子＋幾根咖啡色的「熱狗」穗，在岸邊隨風擺 ──
    reedGroup = new THREE.Group();
    reedGroup.name = 'pond_reeds';
    {
      const theta = 2.4;
      const baseRadius = r * shoreRadius(theta) * 1.02;
      const bladeGeometry = new THREE.ConeGeometry(1, 1, 4);
      bladeGeometry.translate(0, 0.5, 0); // 底部當支點，擺動才是「從根部彎」
      const stalkGeometry = new THREE.CylinderGeometry(1, 1, 1, 5);
      stalkGeometry.translate(0, 0.5, 0);
      const headGeometry = new THREE.CapsuleGeometry(1, 2.2, 3, 6);
      for (let k = 0; k < 7; k++) {
        const offset = (random() - 0.5) * 0.5;
        const radius = baseRadius + (random() - 0.3) * r * 0.18;
        const x = Math.cos(theta + offset) * radius;
        const z = Math.sin(theta + offset) * radius;
        const pivot = new THREE.Group();
        pivot.position.set(x, groundY(x, z), z);
        pivot.rotation.y = random() * Math.PI * 2;
        const height = r * (0.55 + random() * 0.45);
        const hasHead = k % 2 === 0;
        if (hasHead) {
          const stalk = new THREE.Mesh(stalkGeometry, reedMaterial);
          stalk.scale.set(r * 0.012, height, r * 0.012);
          pivot.add(stalk);
          const head = new THREE.Mesh(headGeometry, cattailMaterial);
          head.scale.setScalar(r * 0.035);
          head.position.y = height * 0.88;
          head.castShadow = true;
          pivot.add(head);
        } else {
          const blade = new THREE.Mesh(bladeGeometry, reedMaterial);
          blade.scale.set(r * 0.03, height * 1.1, r * 0.012);
          blade.rotation.z = (random() - 0.5) * 0.35;
          blade.castShadow = true;
          pivot.add(blade);
        }
        reedGroup!.add(pivot);
        reeds.push({ mesh: pivot, phase: random() * Math.PI * 2 });
      }
    }
    reedGroup.visible = settings.reeds;
    content.add(reedGroup);
  }

  function currentNormal(target: THREE.Vector3) {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    return target.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));
  }

  function applyPlacement() {
    anchor.visible = settings.enabled;
    // 大小、下沉、香蒲開關會改到幾何（貼球面、石頭留空缺），變了才重建
    const key = `${settings.size.toFixed(4)}|${settings.sink.toFixed(4)}|${settings.reeds}`;
    if (key !== builtKey) {
      builtKey = key;
      build();
    }
    currentNormal(normal);
    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.scale.setScalar(Math.max(0.0001, introGrow));
    waterUniforms.uDeep.value.set(settings.waterDeep);
    waterUniforms.uShallow.value.set(settings.waterShallow);
    waterUniforms.uRipple.value = settings.ripple;
    waterUniforms.uRainbow.value = settings.rainbow;
    waterUniforms.uRainbowSpeed.value = settings.rainbowSpeed;
    if (padGroup) padGroup.visible = settings.lilyPads;
    if (reedGroup) reedGroup.visible = settings.reeds;
  }

  applyPlacement();

  // ── 水花：東西掉進水裡時（小豬溜滑梯滑下來）往上噴的水珠＋水面擴散的波紋 ──
  // 水珠、波紋都預先做好一池重複用，不會每次濺水都 new 一堆東西
  const SPLASH_DROPS = 30;
  const SPLASH_RINGS = 3;
  /** 水珠的重力（ground 單位／秒²）：比真實小，水珠在空中停留久一點，看得清楚 */
  const SPLASH_GRAVITY = 1.6;
  type SplashDrop = { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number; life: number; size: number };
  type SplashRing = { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; age: number; life: number; maxRadius: number; delay: number };
  let splashGroup: THREE.Group | null = null;
  const splashDrops: SplashDrop[] = [];
  const splashRings: SplashRing[] = [];
  const dropGeometry = new THREE.IcosahedronGeometry(1, 1);
  /** 彩色水珠：每顆一份材質，濺水時依序配上彩虹色（色相從隨機起點均勻繞一圈，每次濺出來的配色都不太一樣） */
  function createDropMaterial() {
    return new THREE.MeshStandardMaterial({
      color: '#dff6ff',
      emissive: '#9fdcef',
      // 自發光高一點：小小的水珠背光時也要看得出顏色，不會暗成灰點
      emissiveIntensity: 0.55,
      roughness: 0.15,
      transparent: true,
      opacity: 0.92,
    });
  }
  const dropHue = new THREE.Color();
  // 波紋是一圈細環，平躺在水面上（RingGeometry 原本在 XY 平面，轉成 XZ 平面）
  const ringGeometry = new THREE.RingGeometry(0.78, 1, 40);
  ringGeometry.rotateX(-Math.PI / 2);

  /** 第一次濺水時才建：要掛在 ground（水潭的父節點）底下，水珠才是 ground 座標，不會跟著水潭自轉 */
  function ensureSplash() {
    if (splashGroup || !anchor.parent) return splashGroup;
    splashGroup = new THREE.Group();
    splashGroup.name = 'pond_splash';
    for (let i = 0; i < SPLASH_DROPS; i++) {
      const mesh = new THREE.Mesh(dropGeometry, createDropMaterial());
      mesh.visible = false;
      mesh.raycast = () => {};
      splashGroup.add(mesh);
      splashDrops.push({ mesh, velocity: new THREE.Vector3(), age: 0, life: 0, size: 0 });
    }
    for (let i = 0; i < SPLASH_RINGS; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.visible = false;
      mesh.raycast = () => {};
      mesh.renderOrder = 3;
      splashGroup.add(mesh);
      splashRings.push({ mesh, material, age: 0, life: 0, maxRadius: 0, delay: 0 });
    }
    anchor.parent.add(splashGroup);
    return splashGroup;
  }

  /**
   * 在 point（ground 座標，水面上的點）濺起水花。strength 1 = 小豬滑下來那種大小。
   * 水珠往上、往四周噴，受重力落回水面；水面上一圈一圈往外擴散的白色波紋。
   */
  function splash(point: THREE.Vector3, strength = 1) {
    if (!ensureSplash()) return;
    const radial = point.clone().normalize();
    // 水面高度：跟水面 mesh 一樣，比地表高 0.0016
    const surfacePoint = radial.clone().multiplyScalar(groundRadius - settings.sink + 0.0016);
    // 切平面上的兩個方向，用來把水珠往四周撒
    const tangentA = new THREE.Vector3().crossVectors(radial, Math.abs(radial.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)).normalize();
    const tangentB = new THREE.Vector3().crossVectors(radial, tangentA).normalize();
    const hueStart = Math.random();
    splashDrops.forEach((drop, index) => {
      // 彩虹色：飽和、偏亮，跟水潭的彩虹同一個調性
      dropHue.setHSL((hueStart + index / splashDrops.length) % 1, 0.9, 0.62);
      const material = drop.mesh.material as THREE.MeshStandardMaterial;
      material.color.copy(dropHue);
      material.emissive.copy(dropHue);
      const angle = Math.random() * Math.PI * 2;
      // 實測原本的大小（水珠 0.0035～0.0075、往上 0.22～0.48）在預設鏡頭下只看得到幾個小白點，放大約一倍
      const outward = (0.07 + Math.random() * 0.16) * strength;
      const upward = (0.3 + Math.random() * 0.32) * strength;
      drop.velocity
        .copy(tangentA)
        .multiplyScalar(Math.cos(angle) * outward)
        .addScaledVector(tangentB, Math.sin(angle) * outward)
        .addScaledVector(radial, upward);
      drop.mesh.position.copy(surfacePoint).addScaledVector(radial, 0.002);
      drop.size = (0.006 + Math.random() * 0.006) * Math.sqrt(strength);
      drop.mesh.scale.setScalar(drop.size);
      drop.age = 0;
      drop.life = 1.4;
      drop.mesh.visible = true;
    });
    splashRings.forEach((ring, index) => {
      ring.mesh.position.copy(surfacePoint);
      ring.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
      ring.age = 0;
      ring.delay = index * 0.18;
      ring.life = 0.9 + index * 0.15;
      ring.maxRadius = (0.05 + index * 0.018) * strength;
      ring.mesh.visible = false;
    });
  }

  function updateSplash(deltaTime: number) {
    if (!splashGroup) return;
    const dt = Math.min(deltaTime, 0.05);
    const radial = new THREE.Vector3();
    const waterRadius = groundRadius - settings.sink + 0.0016;
    for (const drop of splashDrops) {
      if (!drop.mesh.visible) continue;
      drop.age += dt;
      radial.copy(drop.mesh.position).normalize();
      drop.velocity.addScaledVector(radial, -SPLASH_GRAVITY * dt);
      drop.mesh.position.addScaledVector(drop.velocity, dt);
      // 落回水面（往下掉、而且已經低於水面）或時間到 → 收起來
      const falling = drop.velocity.dot(radial) < 0;
      if ((falling && drop.mesh.position.length() < waterRadius) || drop.age > drop.life) {
        drop.mesh.visible = false;
        continue;
      }
      // 在空中慢慢變小一點
      drop.mesh.scale.setScalar(drop.size * (1 - 0.4 * (drop.age / drop.life)));
    }
    for (const ring of splashRings) {
      if (ring.life <= 0) continue;
      ring.age += dt;
      const t = (ring.age - ring.delay) / ring.life;
      if (t < 0) continue;
      if (t >= 1) {
        ring.mesh.visible = false;
        ring.life = 0;
        continue;
      }
      ring.mesh.visible = true;
      // 先快後慢地擴散、越大越淡
      const grow = 1 - (1 - t) * (1 - t);
      ring.mesh.scale.setScalar(Math.max(0.0005, ring.maxRadius * grow));
      ring.material.opacity = 0.75 * (1 - t);
    }
  }

  function update(deltaTime: number) {
    updateSplash(deltaTime);
    if (!settings.enabled) return;
    time += deltaTime;
    waterUniforms.uTime.value = time;
    // 荷葉在水上慢慢轉、香蒲從根部隨風擺（各自錯開節奏）
    for (const { mesh, phase } of pads) mesh.rotation.y += Math.sin(time * 0.4 + phase) * deltaTime * 0.08;
    for (const { mesh, phase } of reeds) {
      mesh.rotation.x = Math.sin(time * 1.3 + phase) * 0.08;
      mesh.rotation.z = Math.sin(time * 1.1 + phase * 1.7) * 0.06;
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
    /** 在水面某點（ground 座標）濺起水花（小豬溜滑梯滑進來時用） */
    splash,
  };
}

export function formatPondSettingsForPaste(s: PondSettings) {
  return (
    `// 貼回 src/world/objects/pond.ts 的 POND_DEFAULT\n` +
    `export const POND_DEFAULT: PondSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
    `  azimuthDegrees: ${s.azimuthDegrees},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  sink: ${s.sink.toFixed(3)},\n` +
    `  waterDeep: '${s.waterDeep}',\n` +
    `  waterShallow: '${s.waterShallow}',\n` +
    `  ripple: ${s.ripple.toFixed(2)},\n` +
    `  rainbow: ${s.rainbow.toFixed(2)},\n` +
    `  rainbowSpeed: ${s.rainbowSpeed.toFixed(2)},\n` +
    `  lilyPads: ${s.lilyPads},\n` +
    `  reeds: ${s.reeds},\n` +
    `};`
  );
}
