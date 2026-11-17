import * as THREE from 'three';
import { loadGltfOnce, scheduleGltfMount } from './sharedGltf';
import { makeGlowTexture, makeStarTexture } from './pigCoinShine';

const CHEST_URL = `${import.meta.env.BASE_URL}models/treasure_chest/treasure_chest.glb`;
const BURGER_URL = `${import.meta.env.BASE_URL}models/burger/burger.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();

/**
 * 綠球上的寶箱，裡面裝滿漢堡、滿到掉出來，上方有金色閃光。
 *
 * 寶箱（treasure_chest.glb）是 Blender 建的：中空木箱、內底墊高、箱蓋往後打開。
 * 漢堡沿用既有的 burger.glb，在這裡複製好幾個堆進去：數量、大小調整方便，不用回 Blender 重建。
 */
export type TreasureChestSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 寶箱（含打開的箱蓋）最長邊，世界單位 */
  size: number;
  sink: number;
  /** 漢堡數量（依 BURGER_PILE 的順序放：先填箱內、再堆小山、最後掉到外面） */
  burgerCount: number;
  /** 漢堡大小倍率 */
  burgerScale: number;
  /** 金色閃光 */
  sparkle: boolean;
};

export const TREASURE_CHEST_DEFAULT: TreasureChestSettings = {
  enabled: true,
  angleFromTopDegrees: 41,
  azimuthDegrees: 149,
  spinDegrees: -141,
  size: 0.08,
  sink: 0.004,
  burgerCount: 13,
  burgerScale: 1,
  sparkle: true,
};

/**
 * 漢堡怎麼堆：寶箱模型座標（glTF：+Y 朝上、+Z 是寶箱正面），單位跟模型一樣（箱寬 0.5）。
 * 內底高 0.13、箱口高 0.22；箱內可用範圍 x ±0.22、z ±0.14。
 *   x, y, z：漢堡底部中心的位置；tx, tz：往前後／左右歪幾度；ry：自己轉幾度
 * 順序很重要：burgerCount 變少時從後面拿掉 → 先拿掉掉在外面的，箱子裡永遠是滿的。
 */
const BURGER_PILE: Array<{ x: number; y: number; z: number; tx: number; tz: number; ry: number }> = [
  // 第一層：鋪滿箱底（6 個），頂端已經高過箱口
  { x: -0.15, y: 0.13, z: -0.07, tx: 0, tz: 4, ry: 10 },
  { x: 0, y: 0.13, z: -0.07, tx: -3, tz: 0, ry: 70 },
  { x: 0.15, y: 0.13, z: -0.07, tx: 0, tz: -5, ry: 140 },
  { x: -0.15, y: 0.13, z: 0.07, tx: 5, tz: 3, ry: 200 },
  { x: 0, y: 0.13, z: 0.07, tx: 4, tz: 0, ry: 30 },
  { x: 0.15, y: 0.13, z: 0.07, tx: 6, tz: -4, ry: 300 },
  // 第二層：疊成小山（3 個），歪一點才像隨手塞進去的
  { x: -0.08, y: 0.245, z: 0.0, tx: 8, tz: 12, ry: 50 },
  { x: 0.09, y: 0.25, z: 0.02, tx: -6, tz: -14, ry: 170 },
  { x: 0.0, y: 0.245, z: -0.07, tx: -10, tz: 3, ry: 260 },
  // 山頂（1 個）
  { x: 0.01, y: 0.36, z: -0.01, tx: 6, tz: -10, ry: 120 },
  // 掉出來的：一個卡在箱口前緣往外倒、兩個滾到地上
  { x: 0.12, y: 0.17, z: 0.2, tx: 42, tz: -6, ry: 20 },
  { x: -0.22, y: 0.0, z: 0.33, tx: 6, tz: 8, ry: 80 },
  { x: 0.34, y: 0.0, z: 0.14, tx: -4, tz: 70, ry: 230 },
];
/** burger.glb 原始寬度約 2.52（麵包最寬處）；一個漢堡在箱子裡寬 0.15 */
const BURGER_WIDTH = 0.15;
const SPARKLE_STARS = 6;

type CreateTreasureChestOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: TreasureChestSettings;
};

export function createTreasureChest({
  groundRadius,
  up,
  front,
  envMap,
  layout = TREASURE_CHEST_DEFAULT,
}: CreateTreasureChestOptions) {
  const settings: TreasureChestSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'treasure_chest';
  // content：寶箱模型的座標系（箱寬 0.5 那一套）；整體縮放只改這一層，漢堡、閃光的位置都跟著
  const content = new THREE.Group();
  anchor.add(content);
  const burgerGroup = new THREE.Group();
  burgerGroup.name = 'treasure_burgers';
  content.add(burgerGroup);
  let introGrow = 1;
  let chestSize = 0.7; // 模型（含打開的箱蓋）原始最長邊；載入後重量
  let burgerSource: THREE.Object3D | null = null;
  let burgerBaseScale = 1;

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
    content.scale.setScalar(settings.size / chestSize);
  }

  function prepareMaterials(root: THREE.Object3D, envIntensity: number) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('envMap' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        if (envMap) {
          m.envMap = envMap;
          m.envMapIntensity = envIntensity;
        }
      }
    });
  }

  /** 依 burgerCount、burgerScale 重新擺漢堡（共用同一份幾何和材質，只是複製節點） */
  function rebuildBurgers() {
    burgerGroup.clear();
    if (!burgerSource) return;
    const count = THREE.MathUtils.clamp(Math.round(settings.burgerCount), 0, BURGER_PILE.length);
    const scale = burgerBaseScale * Math.max(0.1, settings.burgerScale);
    for (let i = 0; i < count; i++) {
      const spot = BURGER_PILE[i];
      // 兩層：外層放位置和歪斜，內層轉自己的方向（ry）。少了分層，歪斜會跟著自轉一起轉、方向亂掉
      const holder = new THREE.Group();
      holder.position.set(spot.x, spot.y, spot.z);
      holder.rotation.set(THREE.MathUtils.degToRad(spot.tx), 0, THREE.MathUtils.degToRad(spot.tz));
      const burger = burgerSource.clone(true);
      burger.scale.setScalar(scale);
      burger.rotation.y = THREE.MathUtils.degToRad(spot.ry);
      holder.add(burger);
      burgerGroup.add(holder);
    }
  }

  // ── 金色閃光：箱口上方一團光暈＋幾顆輪流閃的四角星 ──
  const sparkle = new THREE.Group();
  sparkle.name = 'treasure_sparkle';
  content.add(sparkle);
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
      opacity: 0.5,
    }),
  );
  glow.position.set(0, 0.3, 0);
  glow.scale.setScalar(0.6);
  sparkle.add(glow);
  const starTexture = makeStarTexture();
  const stars = Array.from({ length: SPARKLE_STARS }, (_, i) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: starTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    sparkle.add(sprite);
    return { sprite, phase: i * 1.37, speed: 1.6 + (i % 3) * 0.5, slot: i };
  });

  /** 每顆星星閃完一次就換到漢堡堆上另一個隨機位置，看起來是整堆漢堡在發亮，而不是固定幾個點 */
  function moveStar(star: (typeof stars)[number]) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.06 + Math.random() * 0.2;
    star.sprite.position.set(Math.cos(a) * r, 0.22 + Math.random() * 0.25, Math.sin(a) * r * 0.7);
  }
  stars.forEach(moveStar);

  let time = 0;
  function update(deltaTime: number) {
    time += deltaTime;
    sparkle.visible = settings.sparkle && settings.enabled;
    if (!sparkle.visible) return;
    glow.material.opacity = 0.32 + 0.12 * Math.sin(time * 1.8);
    for (const star of stars) {
      const cycle = time * star.speed + star.phase;
      // 每個週期 2π 換一次位置；亮度 max(0, sin)^3：大部分時間暗、偶爾「叮」一下
      const index = Math.floor(cycle / (Math.PI * 2));
      if (index !== star.slot) {
        star.slot = index;
        moveStar(star);
      }
      const t = Math.max(0, Math.sin(cycle));
      const flash = t * t * t;
      star.sprite.material.opacity = flash;
      star.sprite.scale.setScalar(0.05 + 0.09 * flash);
      star.sprite.material.rotation = cycle * 0.3;
    }
  }

  Promise.all([loadGltfOnce(CHEST_URL), loadGltfOnce(BURGER_URL)])
    .then(([chestGltf, burgerGltf]) => {
      scheduleGltfMount(() => {
        const chest = chestGltf.scene.clone(true);
        chest.name = 'treasure_chest_model';
        prepareMaterials(chest, 0.35);
        // 量寶箱原始大小（還沒掛到場景上，量到的就是模型自己的座標）
        const box = new THREE.Box3().setFromObject(chest);
        const size = box.getSize(new THREE.Vector3());
        chestSize = Math.max(size.x, size.y, size.z, 1e-6);
        content.add(chest);

        const burger = burgerGltf.scene.clone(true);
        prepareMaterials(burger, 0.2);
        const burgerBox = new THREE.Box3().setFromObject(burger);
        const burgerSize = burgerBox.getSize(new THREE.Vector3());
        burgerBaseScale = BURGER_WIDTH / Math.max(burgerSize.x, burgerSize.z, 1e-6);
        // 把漢堡「底部中心」移到原點：BURGER_PILE 的 y 是漢堡底部的高度。
        // x、z 也要置中：模型原點不在漢堡中心時，每個漢堡自轉（ry）會把偏移轉到不同方向，漢堡就散落在箱子外面
        const burgerCenter = burgerBox.getCenter(new THREE.Vector3());
        burger.position.x -= burgerCenter.x;
        burger.position.y -= burgerBox.min.y;
        burger.position.z -= burgerCenter.z;
        const wrapper = new THREE.Group();
        wrapper.add(burger);
        burgerSource = wrapper;
        rebuildBurgers();
        applyPlacement();
      });
    })
    .catch((error) => console.error('[treasureChest] 載入失敗', error));

  applyPlacement();

  function applySettings() {
    rebuildBurgers();
    applyPlacement();
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
    applySettings,
    setIntroGrow,
    update,
    setNormal,
    getNormal: () => currentNormal(new THREE.Vector3()),
  };
}

export function formatTreasureChestSettingsForPaste(s: TreasureChestSettings) {
  return (
    `// 貼回 src/world/objects/treasureChest.ts 的 TREASURE_CHEST_DEFAULT\n` +
    `export const TREASURE_CHEST_DEFAULT: TreasureChestSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
    `  azimuthDegrees: ${s.azimuthDegrees},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  sink: ${s.sink.toFixed(3)},\n` +
    `  burgerCount: ${Math.round(s.burgerCount)},\n` +
    `  burgerScale: ${s.burgerScale.toFixed(2)},\n` +
    `  sparkle: ${s.sparkle},\n` +
    `};`
  );
}
