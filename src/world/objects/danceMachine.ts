import * as THREE from 'three';
import { cloneGltfMaterialsOnly, loadGltfOnce, scheduleGltfMount } from './sharedGltf';

const DANCE_MACHINE_URL = `${import.meta.env.BASE_URL}models/dance_machine/dance_machine.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();

/**
 * 綠球上的跳舞機「電波 STEP!」（dance_machine.glb，plan 在 tools/blender/plans/dance_machine.plan.json）：
 * 後面深紫色高機台（大螢幕、頂上招牌、兩側喇叭塔），前面舞台兩組踏板、上下左右箭頭會發光，舞台前緣 U 形扶手。
 *
 * - 擺放方式跟復古街機一樣：離頂端角度＋方位角，面板可調、可拖曳、可以複製很多台
 * - 箭頭會跟著節拍一起閃（拍點最亮、再慢慢暗回去），亮度、BPM 面板可調
 * - 匯出時材質合併成貼圖集（atlas）：8 個箭頭共用同一個發光材質，所以沒辦法照顏色分開閃，用網格名稱 dance_machine_arrows 找箭頭
 */
export type DanceMachineSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 整台最長邊（世界單位；綠球半徑 1）。小豬身長約 0.057 */
  size: number;
  sink: number;
  /** 螢幕、招牌、燈管的發光強度 */
  glow: number;
  /** 箭頭的發光強度 */
  arrowGlow: number;
  /** 每分鐘幾拍：箭頭跟著節拍閃（0 = 不閃，一直亮） */
  bpm: number;
};

export const DANCE_MACHINE_DEFAULT: DanceMachineSettings = {
  enabled: true,
  // 在頁面上試出來的：GameHall 右下方、復古街機左邊的空地，螢幕和舞台朝鏡頭
  angleFromTopDegrees: 35,
  azimuthDegrees: 36,
  spinDegrees: 145,
  size: 0.09,
  sink: 0.002,
  glow: 1.2,
  arrowGlow: 1.6,
  bpm: 128,
};

export type DanceMachinePlacement = DanceMachineSettings & { id: string };

/** 綠球上每一台跳舞機。面板按「印出全部佈局」後貼回這裡 */
export const DANCE_MACHINE_PLACEMENTS: DanceMachinePlacement[] = [
  {
    id: 'dance_machine_1',
    enabled: true,
    angleFromTopDegrees: 21,
    azimuthDegrees: 71,
    spinDegrees: -86,
    size: 0.09,
    sink: 0.002,
    glow: 1.2,
    arrowGlow: 1.6,
    bpm: 128,
  },
];

/** 選中時整台發光的強度（跟烤玉米、復古街機一樣） */
const HIGHLIGHT_INTENSITY = 0.35;
/** 箭頭那個網格的名稱（plan 的元件 id = arrows） */
const ARROW_MESH = /_arrows(?:\.\d+)?$/;

type CreateDanceMachineOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: DanceMachineSettings;
};

type GlowMaterial = { material: THREE.MeshStandardMaterial; base: number };

export function createDanceMachine({ groundRadius, up, front, envMap, layout = DANCE_MACHINE_DEFAULT }: CreateDanceMachineOptions) {
  const settings: DanceMachineSettings = { ...layout };
  const anchor = new THREE.Object3D();
  anchor.name = 'dance_machine';
  const content = new THREE.Group();
  anchor.add(content);
  let introGrow = 1;
  let modelSize = 2.9;
  /** 螢幕、招牌貼圖、燈管：跟著 glow 調亮度 */
  const glowMaterials: GlowMaterial[] = [];
  /** 箭頭的發光材質：跟著節拍閃 */
  const arrowMaterials: THREE.MeshStandardMaterial[] = [];
  /** 其他材質原本的發光：選取發光後要還原成這個 */
  const bodyMaterials: Array<{ material: THREE.MeshStandardMaterial; emissive: THREE.Color; intensity: number }> = [];
  let highlighted = false;
  /** 模型還沒載入就被移除（剛複製就按移除）：載入完成時不要再掛上去 */
  let disposed = false;

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
    content.scale.setScalar(settings.size / modelSize);
    for (const { material, base } of glowMaterials) material.emissiveIntensity = base * Math.max(0, settings.glow);
  }

  function applyHighlight() {
    for (const { material, emissive, intensity } of bodyMaterials) {
      if (highlighted) {
        material.emissive.copy(material.color);
        material.emissiveIntensity = HIGHLIGHT_INTENSITY;
      } else {
        material.emissive.copy(emissive);
        material.emissiveIntensity = intensity;
      }
    }
  }

  loadGltfOnce(DANCE_MACHINE_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        if (disposed) return;
        // 材質各自一份：每台的亮度、選取發光、箭頭節拍互不影響（幾何、貼圖共用）
        const model = cloneGltfMaterialsOnly(gltf.scene);
        model.name = 'dance_machine_model';
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const isGlowDecal = /_glow(?:\.\d+)?$|_glow_\d+$/.test(mesh.name);
          const isArrow = ARROW_MESH.test(mesh.name);
          for (const material of materials) {
            const m = material as THREE.MeshStandardMaterial;
            if (envMap && 'envMap' in m) {
              m.envMap = envMap;
              m.envMapIntensity = 0.3;
            }
            if (!m.emissive) continue;
            // 招牌字、螢幕畫面（decal，名稱結尾 _glow）：貼圖本身當發光圖，暗處也看得清楚
            if (isGlowDecal && m.map) {
              m.emissive.set(0xffffff);
              m.emissiveMap = m.map;
              m.emissiveIntensity = 0.9;
              m.toneMapped = false;
              m.needsUpdate = true;
              glowMaterials.push({ material: m, base: 0.9 });
              continue;
            }
            if (isArrow && m.emissive.getHex() !== 0) {
              arrowMaterials.push(m);
              continue;
            }
            if (m.emissive.getHex() !== 0) {
              // 燈管、螢幕底板：本來就會發光的材質
              glowMaterials.push({ material: m, base: m.emissiveIntensity || 1 });
              continue;
            }
            bodyMaterials.push({ material: m, emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
          }
        });
        // 量模型原始大小（還沒掛上場景，量到的是模型自己的座標）
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        modelSize = Math.max(size.x, size.y, size.z, 1e-6);
        // 模型原點在底面中心，但舞台往前伸比較多：水平置中，轉的時候才不會繞著機台背面甩
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);
        content.add(model);
        applyPlacement();
        applyHighlight();
      });
    })
    .catch((error) => console.error(`[danceMachine] 載入失敗：${DANCE_MACHINE_URL}`, error));

  applyPlacement();

  /** 每一格呼叫：箭頭跟著節拍閃（像有人在上面跳） */
  function update(time: number) {
    if (!settings.enabled || arrowMaterials.length === 0) return;
    const beat = settings.bpm > 0 ? (time * settings.bpm) / 60 : 0;
    // 拍點剛到時最亮、接著慢慢暗回去（平方讓「啪」的那一下更明顯）；BPM 0 = 一直全亮
    const fade = settings.bpm > 0 ? (1 - (beat - Math.floor(beat))) ** 2 : 1;
    // 暗的時候壓到 12%：太亮的話箭頭本身的顏色就很飽和，看不出有在閃
    const level = 0.12 + 0.88 * fade;
    for (const material of arrowMaterials) {
      material.emissiveIntensity = Math.max(0, settings.arrowGlow) * level;
      // 箭頭看起來的顏色大多來自「底色貼圖被燈照亮」，只調發光幾乎看不出在閃：底色也一起調暗調亮
      material.color.setScalar(0.25 + 0.75 * fade);
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

  function setHighlighted(value: boolean) {
    highlighted = value;
    applyHighlight();
  }

  /** 移除這台：從場景拿掉、釋放各自的材質（幾何和貼圖是共用的，不能釋放） */
  function dispose() {
    disposed = true;
    anchor.removeFromParent();
    for (const { material } of bodyMaterials) material.dispose();
    for (const { material } of glowMaterials) material.dispose();
    for (const material of arrowMaterials) material.dispose();
  }

  return {
    object: anchor,
    settings,
    applySettings: applyPlacement,
    update,
    setIntroGrow,
    setNormal,
    getNormal: () => currentNormal(new THREE.Vector3()),
    setHighlighted,
    dispose,
  };
}

export function formatDanceMachinePlacementsForPaste(items: Array<{ id: string; settings: DanceMachineSettings }>) {
  const blocks = items.map(({ id, settings: s }) =>
    [
      '  {',
      `    id: '${id}',`,
      `    enabled: ${s.enabled},`,
      `    angleFromTopDegrees: ${s.angleFromTopDegrees},`,
      `    azimuthDegrees: ${s.azimuthDegrees},`,
      `    spinDegrees: ${s.spinDegrees},`,
      `    size: ${s.size.toFixed(3)},`,
      `    sink: ${s.sink.toFixed(3)},`,
      `    glow: ${s.glow.toFixed(2)},`,
      `    arrowGlow: ${s.arrowGlow.toFixed(2)},`,
      `    bpm: ${s.bpm},`,
      '  },',
    ].join('\n'),
  );
  return (
    `// 貼回 src/world/objects/danceMachine.ts 的 DANCE_MACHINE_PLACEMENTS\n` +
    `export const DANCE_MACHINE_PLACEMENTS: DanceMachinePlacement[] = [\n${blocks.join('\n')}\n];`
  );
}
