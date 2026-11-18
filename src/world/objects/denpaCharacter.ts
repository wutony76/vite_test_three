import * as THREE from 'three';
import { loadGltfOnce, scheduleGltfMount } from './sharedGltf';

/**
 * 「電」字霓虹：從舊遊戲廳的「電 • 波 • 町」招牌（denpa_sign.glb）取出「電」那一個字，立在 GameHall 的屋頂上。
 *
 * - 不另外做模型：直接拿招牌 GLB 裡的兩個 mesh
 *   - Denpa_Neon_Den：發光燈管（橘色霓虹）
 *   - Denpa_Metal_Den：燈管後面的金屬字座
 * - 掛在 GameHall 的長方體底下（座標用長方體自己的單位：寬 1.25、高 1.4、深 0.91，原點在底部中央、正面 +Z），
 *   所以 GameHall 拖曳、縮放、入場長大，字都跟著走；GameHall 自己的設定完全不用動
 * - 屋頂左半邊有香菇，預設放在右半邊（屋頂從左往右彎下來，右半邊比較低）
 */
const DENPA_SIGN_URL = `${import.meta.env.BASE_URL}models/denpa_sign/denpa_sign.glb`;
const PART_NAMES = ['Denpa_Neon_Den', 'Denpa_Metal_Den'] as const;

export type DenpaCharacterSettings = {
  enabled: boolean;
  /** 左右（GameHall 長方體單位，寬 1.25；正值往右） */
  x: number;
  /** 字底部的高度（GameHall 高 1.4；屋頂右半邊大約在 0.95～1.05） */
  y: number;
  /** 前後（深 0.91；正值往前） */
  z: number;
  /** 字高（GameHall 長方體單位） */
  size: number;
  /** 自身旋轉：0 = 跟 GameHall 正面同一個方向 */
  spinDegrees: number;
  /** 前後傾斜（正值往後仰） */
  tiltDegrees: number;
  /** 左右傾斜（正值往左歪） */
  rollDegrees: number;
  /** 燈管發光強度 */
  glow: number;
  /** 燈管顏色 */
  neonColor: string;
  /** 顯示後面的金屬字座 */
  showMetal: boolean;
  /**
   * 燈管效果：
   * - steady：恆亮
   * - breathe：慢慢呼吸（亮暗起伏）
   * - flicker：霓虹接觸不良，平常微微起伏、偶爾「啪啪」閃一下
   * - blink：一亮一滅
   */
  effect: DenpaCharacterEffect;
  /** 效果速度 */
  effectSpeed: number;
  /** 背後光暈強度（0 = 不要光暈） */
  halo: number;
  /** 光暈大小（字高的幾倍） */
  haloSize: number;
  /** 照亮附近屋頂的點光強度（0 = 不照） */
  light: number;
  /** 點選 GameHall 時改用的發光強度、燈管顏色、照亮屋頂（取消選取就變回上面那組） */
  selectedGlow: number;
  selectedNeonColor: string;
  selectedLight: number;
};

export type DenpaCharacterEffect = 'steady' | 'breathe' | 'flicker' | 'blink';

export const DENPA_CHARACTER_DEFAULT: DenpaCharacterSettings = {
  enabled: true,
  x: 0.33,
  y: 0.93,
  z: -0.225,
  size: 0.66,
  spinDegrees: 0,
  tiltDegrees: 0,
  rollDegrees: -22,
  // 太亮（≥3）時橘色會被衝成黃白色、字的筆畫糊在一起；1.6 還是橘色、筆畫看得清楚
  glow: 1.6,
  // 招牌原本的橘色霓虹
  neonColor: '#ff610f',
  showMetal: true,
  effect: 'flicker',
  effectSpeed: 1,
  halo: 0.55,
  haloSize: 1.7,
  // 0.6 會把整片屋頂、香菇染成橘色；0.05 只在字附近透一點暖光
  light: 0.05,
  // 點選 GameHall 時：換成綠色、燈管轉暗一點，但照亮屋頂變強 → 整個屋頂透出綠光，一看就知道選到它了
  selectedGlow: 0.5,
  selectedNeonColor: '#7ec841',
  selectedLight: 0.35,
};

/** 0～1 的固定亂數：同一個整數永遠得到同一個值，閃爍的節奏才不會每一格都在亂跳 */
function hash01(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 依效果算出這一刻的亮度倍率（1 = 設定的發光強度） */
function effectLevel(effect: DenpaCharacterEffect, time: number, speed: number) {
  const t = time * Math.max(0, speed);
  switch (effect) {
    case 'steady':
      return 1;
    case 'breathe':
      return 0.7 + 0.3 * Math.sin(t * Math.PI * 0.8);
    case 'blink':
      // 亮 0.8 秒、滅 0.4 秒（速度 1 時）
      return t % 1.2 < 0.8 ? 1 : 0.08;
    case 'flicker': {
      // 平常：輕微的電流起伏
      let level = 0.9 + 0.1 * Math.sin(t * 9.0) * Math.sin(t * 2.3);
      // 偶爾一小格熄掉：把時間切成每 1/12 秒一格，每格有 4% 機率暗下去
      const slot = Math.floor(t * 12);
      if (hash01(slot) < 0.04) level = 0.15 + 0.2 * hash01(slot + 0.5);
      // 每 7 秒一次「啪、啪」連閃兩下：像燈管快壞了又撐住
      const cycle = t % 7;
      if (cycle > 6.0 && cycle < 6.5) level = Math.floor(cycle * 16) % 2 === 0 ? 0.1 : 1;
      return level;
    }
  }
}

/** 光暈貼圖：中間亮、往外淡掉的圓（白色，顏色由材質給）。只做一次，所有地方共用 */
let haloTexture: THREE.CanvasTexture | null = null;
function getHaloTexture() {
  if (haloTexture) return haloTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  haloTexture = new THREE.CanvasTexture(canvas);
  haloTexture.colorSpace = THREE.SRGBColorSpace;
  return haloTexture;
}

export function createDenpaCharacter(layout: DenpaCharacterSettings = DENPA_CHARACTER_DEFAULT) {
  const settings: DenpaCharacterSettings = { ...layout };
  const anchor = new THREE.Group();
  anchor.name = 'denpa_character_den';
  const content = new THREE.Group();
  anchor.add(content);
  /** 字原本的高度（招牌座標）：用來把 size 換算成縮放 */
  let modelHeight = 1.3;
  let neonMaterial: THREE.MeshStandardMaterial | null = null;
  let metalMesh: THREE.Mesh | null = null;

  // 背後光暈：一張永遠面向鏡頭的圓形漸層（Sprite），加法混合 → 疊在背景上變亮，像燈管周圍的光
  // depthWrite 關掉：不然光暈的透明邊緣會把後面的燈環、屋頂「挖洞」
  const haloMaterial = new THREE.SpriteMaterial({
    map: getHaloTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const halo = new THREE.Sprite(haloMaterial);
  halo.name = 'denpa_den_halo';
  // 光暈不要擋住滑鼠點 GameHall
  halo.raycast = () => {};
  anchor.add(halo);

  // 照亮附近屋頂的橘色點光：讓字「真的在發光」，屋頂、香菇會被染一點橘
  const pointLight = new THREE.PointLight(0xffffff, 0, 1, 2);
  pointLight.name = 'denpa_den_light';
  anchor.add(pointLight);

  /** 套完效果的亮度倍率：update 每一格算一次 */
  let level = 1;
  /** GameHall 是否被點選：選中時改用 selected* 那組設定 */
  let selected = false;
  const activeGlow = () => (selected ? settings.selectedGlow : settings.glow);
  const activeColor = () => (selected ? settings.selectedNeonColor : settings.neonColor);
  const activeLight = () => (selected ? settings.selectedLight : settings.light);
  const worldScale = new THREE.Vector3();

  function applySettings() {
    anchor.visible = settings.enabled;
    anchor.position.set(settings.x, settings.y, settings.z);
    anchor.rotation.set(
      THREE.MathUtils.degToRad(-settings.tiltDegrees),
      THREE.MathUtils.degToRad(settings.spinDegrees),
      THREE.MathUtils.degToRad(settings.rollDegrees),
      // 先自轉（Y）、再前後傾（X）、最後左右歪（Z）：三個滑桿各管各的，不會互相牽動
      'YXZ',
    );
    content.scale.setScalar(settings.size / modelHeight);
    if (neonMaterial) {
      neonMaterial.color.set(activeColor());
      neonMaterial.emissive.set(activeColor());
    }
    if (metalMesh) metalMesh.visible = settings.showMetal;
    // 光暈、點光放在字的中心，稍微往後一點（光從字後面透出來）
    halo.position.set(0, settings.size * 0.5, -settings.size * 0.05);
    halo.scale.setScalar(settings.size * settings.haloSize);
    pointLight.position.set(0, settings.size * 0.5, settings.size * 0.25);
    pointLight.color.set(activeColor());
    haloMaterial.color.set(activeColor());
    applyLevel();
  }

  /** 把目前的亮度倍率套到燈管、光暈、點光 */
  function applyLevel() {
    if (neonMaterial) neonMaterial.emissiveIntensity = Math.max(0, activeGlow()) * level;
    halo.visible = settings.halo > 0;
    haloMaterial.opacity = Math.min(1, settings.halo * level);
    pointLight.visible = activeLight() > 0;
    pointLight.intensity = activeLight() * level;
  }

  /** 每一格呼叫：依效果改亮度 */
  function update(time: number) {
    if (!settings.enabled) return;
    level = effectLevel(settings.effect, time, settings.effectSpeed);
    // 點光的照射距離是「世界單位」，不吃父物件的縮放：GameHall 長方體縮小 0.15 倍，字也跟著小，
    // 照射距離要自己乘回去，不然會照到半顆綠球。範圍取字高的 3 倍（字放大，照到的屋頂也變大）
    anchor.getWorldScale(worldScale);
    pointLight.distance = Math.max(1e-4, settings.size * 3 * worldScale.x);
    applyLevel();
  }

  loadGltfOnce(DENPA_SIGN_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        const letter = new THREE.Group();
        letter.name = 'denpa_den_letter';
        for (const name of PART_NAMES) {
          const source = gltf.scene.getObjectByName(name) as THREE.Mesh | undefined;
          if (!source?.isMesh) {
            console.warn(`[denpaCharacter] 招牌裡找不到 ${name}`);
            continue;
          }
          // 幾何、材質都各自一份：
          // - GameHall 的子物件每次套設定都會「貼球面」，會重算幾何法線；共用的話會改到別處的招牌
          // - 調顏色、亮度不會影響其他地方
          const mesh = new THREE.Mesh(source.geometry.clone(), (source.material as THREE.Material).clone());
          mesh.name = name;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          if (name === 'Denpa_Neon_Den') {
            neonMaterial = mesh.material as THREE.MeshStandardMaterial;
            // 霓虹不要被色調映射壓暗；燈管本身也不投影子（發光的東西有影子很怪）
            neonMaterial.toneMapped = false;
            mesh.castShadow = false;
          } else {
            metalMesh = mesh;
          }
          letter.add(mesh);
        }
        // 招牌裡的字底部在 y≈3.9：挪到原點，底部對齊 anchor、左右前後置中
        const box = new THREE.Box3().setFromObject(letter);
        const center = box.getCenter(new THREE.Vector3());
        letter.position.set(-center.x, -box.min.y, -center.z);
        modelHeight = Math.max(box.max.y - box.min.y, 1e-6);
        content.add(letter);
        applySettings();
      });
    })
    .catch((error) => console.error(`[denpaCharacter] 載入失敗：${DENPA_SIGN_URL}`, error));

  applySettings();

  /** GameHall 被點選／取消選取時呼叫：切換成 selected* 那組設定 */
  function setSelected(value: boolean) {
    if (selected === value) return;
    selected = value;
    applySettings();
  }

  return { object: anchor, settings, applySettings, update, setSelected };
}

export function formatDenpaCharacterSettingsForPaste(s: DenpaCharacterSettings) {
  return (
    `// 貼回 src/world/objects/denpaCharacter.ts 的 DENPA_CHARACTER_DEFAULT\n` +
    `export const DENPA_CHARACTER_DEFAULT: DenpaCharacterSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  x: ${s.x.toFixed(3)},\n` +
    `  y: ${s.y.toFixed(3)},\n` +
    `  z: ${s.z.toFixed(3)},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  tiltDegrees: ${s.tiltDegrees},\n` +
    `  rollDegrees: ${s.rollDegrees},\n` +
    `  glow: ${s.glow.toFixed(2)},\n` +
    `  neonColor: '${s.neonColor}',\n` +
    `  showMetal: ${s.showMetal},\n` +
    `  effect: '${s.effect}',\n` +
    `  effectSpeed: ${s.effectSpeed.toFixed(2)},\n` +
    `  halo: ${s.halo.toFixed(2)},\n` +
    `  haloSize: ${s.haloSize.toFixed(2)},\n` +
    `  light: ${s.light.toFixed(2)},\n` +
    `  selectedGlow: ${s.selectedGlow.toFixed(2)},\n` +
    `  selectedNeonColor: '${s.selectedNeonColor}',\n` +
    `  selectedLight: ${s.selectedLight.toFixed(2)},\n` +
    `};`
  );
}
