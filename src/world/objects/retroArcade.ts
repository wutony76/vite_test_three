import * as THREE from 'three';
import { cloneGltfMaterialsOnly, loadGltfOnce, scheduleGltfMount } from './sharedGltf';

const RETRO_ARCADE_URL = `${import.meta.env.BASE_URL}models/retro_arcade/retro_arcade.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();

/**
 * 綠球上的復古街機（retro_arcade.glb，plan 在 tools/blender/plans/retro_arcade.plan.json）：
 * 青綠機身、奶油色斜螢幕框、紅球搖桿，左側掛著相機、喇叭、旋鈕盒、糖果按鈕、通風箱。
 * 放在 GameHall（電 • 波 • 町 遊樂中心）左邊。擺放方式跟 Happy Fat 小店一樣：離頂端角度＋方位角，面板可調、可拖曳。
 * 可以複製很多台（跟檸檬片、烤玉米一樣）：每台的位置寫在 RETRO_ARCADE_PLACEMENTS。
 */
export type RetroArcadeSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 整台最長邊（世界單位；綠球半徑 1）。小豬身長約 0.057 */
  size: number;
  sink: number;
  /** 螢幕發光強度 */
  screenGlow: number;
};

export const RETRO_ARCADE_DEFAULT: RetroArcadeSettings = {
  enabled: true,
  // 在頁面上掃描：遊樂中心附近 6～16° 內、畫面上在它左邊、半徑 2.5° 內沒有其他東西，取最近的空地
  angleFromTopDegrees: 28,
  azimuthDegrees: 22,
  // 正面朝鏡頭為主、左側（相機、喇叭那排 kitbash）也看得到一點，跟參考圖的角度一樣
  spinDegrees: 125,
  size: 0.07,
  sink: 0.002,
  screenGlow: 1.2,
};

export type RetroArcadePlacement = RetroArcadeSettings & { id: string };

/** 綠球上每一台街機。面板按「印出全部佈局」後貼回這裡 */
export const RETRO_ARCADE_PLACEMENTS: RetroArcadePlacement[] = [
  {
    id: 'retro_arcade_1',
    enabled: true,
    angleFromTopDegrees: 31,
    azimuthDegrees: 51,
    spinDegrees: 125,
    size: 0.07,
    sink: 0.002,
    screenGlow: 1.2,
  },
];

/** 選中時整台發光的強度（跟烤玉米一樣用自己的顏色發光） */
const HIGHLIGHT_INTENSITY = 0.35;

type CreateRetroArcadeOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: RetroArcadeSettings;
};

export function createRetroArcade({ groundRadius, up, front, envMap, layout = RETRO_ARCADE_DEFAULT }: CreateRetroArcadeOptions) {
  const settings: RetroArcadeSettings = { ...layout };
  const anchor = new THREE.Object3D();
  anchor.name = 'retro_arcade';
  const content = new THREE.Group();
  anchor.add(content);
  let introGrow = 1;
  let modelSize = 1.9;
  /** 螢幕的發光材質（plan 裡 emissive 的 screen_dark）：面板調亮度時改它 */
  const screenMaterials: THREE.MeshStandardMaterial[] = [];
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
    for (const material of screenMaterials) material.emissiveIntensity = Math.max(0, settings.screenGlow);
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

  loadGltfOnce(RETRO_ARCADE_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        if (disposed) return;
        // 材質各自一份：每台的螢幕亮度、選取發光互不影響（幾何、貼圖共用）
        const model = cloneGltfMaterialsOnly(gltf.scene);
        model.name = 'retro_arcade_model';
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            const m = material as THREE.MeshStandardMaterial;
            if (envMap && 'envMap' in m) {
              m.envMap = envMap;
              m.envMapIntensity = 0.3;
            }
          }
          // 螢幕：GLB 裡帶自發光的那塊（bezel 節點）；其他材質記下原本的發光，選取發光後還原用
          for (const material of materials) {
            const m = material as THREE.MeshStandardMaterial;
            if (!m.emissive) continue;
            if (/_bezel$/.test(mesh.name) && m.emissive.getHex() !== 0) screenMaterials.push(m);
            else bodyMaterials.push({ material: m, emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
          }
        });
        // 量模型原始大小（還沒掛上場景，量到的是模型自己的座標）
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        modelSize = Math.max(size.x, size.y, size.z, 1e-6);
        content.add(model);
        applyPlacement();
        applyHighlight();
      });
    })
    .catch((error) => console.error(`[retroArcade] 載入失敗：${RETRO_ARCADE_URL}`, error));

  applyPlacement();

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
    for (const material of screenMaterials) material.dispose();
  }

  return {
    object: anchor,
    settings,
    applySettings: applyPlacement,
    setIntroGrow,
    setHighlighted,
    dispose,
    setNormal,
    getNormal: () => currentNormal(new THREE.Vector3()),
  };
}

export function formatRetroArcadePlacementsForPaste(items: Array<{ id: string; settings: RetroArcadeSettings }>) {
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
      `    screenGlow: ${s.screenGlow.toFixed(2)},`,
      '  },',
    ].join('\n'),
  );
  return (
    `// 貼回 src/world/objects/retroArcade.ts 的 RETRO_ARCADE_PLACEMENTS\n` +
    `export const RETRO_ARCADE_PLACEMENTS: RetroArcadePlacement[] = [\n${blocks.join('\n')}\n];`
  );
}
