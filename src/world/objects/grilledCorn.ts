import * as THREE from 'three';
import { conformChildrenToSphere } from './conformToSphere';
import { cloneGltfInstance, loadGltfOnce, scheduleGltfMount } from './sharedGltf';
import {
  GRILLED_CORN_LAYOUT_DEFAULT,
  GRILLED_CORN_VISUAL_DEFAULT,
  type GrilledCornLayout,
  type GrilledCornPlacement,
  type GrilledCornVisualLayout,
} from './grilledCornLayout';

const CORN_URL = `${import.meta.env.BASE_URL}models/grilled_corn/grilled_corn.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const tintColor = new THREE.Color();
const tinted = new THREE.Color();
function makeCartoonSteamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[grilledCorn] canvas 2d unavailable');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const strokes = [
    { x: 14, phase: 0.0 },
    { x: 24, phase: 1.2 },
    { x: 34, phase: 2.1 },
  ];
  for (const { x, phase } of strokes) {
    ctx.strokeStyle = 'rgba(236, 248, 255, 0.92)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let px = x;
    ctx.moveTo(px, canvas.height - 2);
    for (let y = canvas.height; y >= 0; y -= 3) {
      px = x + Math.sin(y * 0.11 + phase) * 4.5;
      ctx.lineTo(px, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const STEAM_TEXTURE = makeCartoonSteamTexture();
/** 單股熱氣完整上升＋淡出的秒數（越大越慢） */
const STEAM_LIFE = 5.6;

type SteamParticle = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  age: number;
  seed: number;
};

function createCartoonSteam(parent: THREE.Object3D) {
  const group = new THREE.Group();
  group.name = 'grilled_corn_steam';
  parent.add(group);
  const particles: SteamParticle[] = [];
  const count = 6;
  for (let i = 0; i < count; i++) {
    const material = new THREE.SpriteMaterial({
      map: STEAM_TEXTURE,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 12;
    group.add(sprite);
    particles.push({ sprite, material, age: (i / count) * STEAM_LIFE, seed: i * 1.73 });
  }
  let localBaseY = 0.05;
  let active = 1;
  let density = 1;

  return {
    group,
    setLocalBaseY(y: number) {
      localBaseY = y;
    },
    setActive(value: number) {
      active = THREE.MathUtils.clamp(value, 0, 1);
    },
    setDensity(value: number) {
      density = Math.max(0, value);
    },
    update(dt: number) {
      for (const p of particles) {
        p.age = (p.age + dt) % STEAM_LIFE;
        const t = p.age / STEAM_LIFE;
        const wobble = 0.0036 + t * 0.0052;
        p.sprite.position.set(
          Math.sin(p.age * 0.95 + p.seed) * wobble,
          localBaseY + t * 0.048,
          Math.cos(p.age * 0.72 + p.seed) * wobble * 0.7,
        );
        const s = (0.0065 + t * 0.014) * (0.75 + density * 0.25);
        p.sprite.scale.set(s * 0.85, s * 1.35, 1);
        p.sprite.visible = density > 0.02;
        p.material.opacity = Math.sin(Math.PI * t) * 0.42 * active * Math.min(density, 1.8);
      }
    },
    dispose() {
      for (const p of particles) p.material.dispose();
    },
  };
}

export type GrilledCornSettings = GrilledCornLayout;

/** 場景內即時調（不重烘焙貼圖）；縫線寬度要改 plan 後重建 GLB。 */
export type GrilledCornVisualSettings = GrilledCornVisualLayout;

type CreateGrilledCornOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: GrilledCornLayout;
  visual?: Partial<GrilledCornVisualLayout>;
};

/** 綠球上的卡通烤玉米：貼地表、略增飽和讓黃色在場景裡更跳。 */
export function createGrilledCorn({
  groundRadius,
  up,
  front,
  envMap,
  layout = GRILLED_CORN_LAYOUT_DEFAULT,
  visual,
}: CreateGrilledCornOptions) {
  const settings: GrilledCornSettings = { ...layout };
  const visualSettings: GrilledCornVisualSettings = { ...GRILLED_CORN_VISUAL_DEFAULT, ...visual };
  const baseColors = new WeakMap<THREE.MeshStandardMaterial, THREE.Color>();

  const anchor = new THREE.Object3D();
  let model: THREE.Object3D | null = null;
  let modelBaseScale = 1;
  let introGrow = 1;
  let builtModelSize = settings.modelSize;
  const steam = createCartoonSteam(anchor);

  function applyPlacement() {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));

    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));

    const conform = {
      groundRadius,
      sink: settings.sink,
      normal,
      groundY: 0,
      groundBand: 0.018,
    };
    if (model) conformChildrenToSphere(anchor, conform);
  }

  function fitModel(root: THREE.Object3D) {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    modelBaseScale = settings.modelSize / Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(modelBaseScale);
    root.position.set(-center.x * modelBaseScale, -box.min.y * modelBaseScale, -center.z * modelBaseScale);
    builtModelSize = settings.modelSize;
    const height = (box.max.y - box.min.y) * modelBaseScale;
    steam.setLocalBaseY(height * 0.94 + 0.003);
  }

  function applyVisuals() {
    if (!model) return;
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('roughness' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        const name = (m.name || mesh.name || '').toLowerCase();
        const isKernel = name.includes('kernel') || name.includes('body');
        if (!isKernel) continue;
        const base = baseColors.get(m);
        if (!base) return;
        m.color.copy(base);
        m.color.multiplyScalar(visualSettings.colorBoost);
        m.color.r = Math.min(1, m.color.r + visualSettings.orangeBias);
        m.color.g = Math.max(0, m.color.g - visualSettings.orangeBias * 0.35);
        const mix = THREE.MathUtils.clamp(visualSettings.tintMix, 0, 1);
        if (mix > 0.001) {
          tintColor.set(visualSettings.tintColor);
          tinted.copy(m.color).multiply(tintColor);
          m.color.lerp(tinted, mix);
        }
        m.emissive.copy(m.color);
        m.emissive.multiplyScalar(0.35);
        m.emissiveIntensity = visualSettings.emissiveIntensity;
        if (m.normalMap) {
          m.normalScale.set(visualSettings.normalScale, visualSettings.normalScale);
        }
      }
    });
    steam.setDensity(visualSettings.steamDensity);
  }

  function enhanceCornMaterials(root: THREE.Object3D) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('roughness' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        const name = (m.name || mesh.name || '').toLowerCase();
        const isKernel = name.includes('kernel') || name.includes('body');
        m.metalness = 0;
        m.roughness = isKernel ? Math.min(m.roughness, 0.28) : 0.45;
        if (envMap) {
          m.envMap = envMap;
          m.envMapIntensity = isKernel ? 0.22 : 0.08;
        }
        if (m.map) {
          m.map.colorSpace = THREE.SRGBColorSpace;
        }
        if (isKernel && !baseColors.has(m)) {
          baseColors.set(m, m.color.clone());
        }
      }
    });
    applyVisuals();
  }

  loadGltfOnce(CORN_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        model = cloneGltfInstance(gltf.scene);
        fitModel(model);
        enhanceCornMaterials(model);
        anchor.add(model);
        applyPlacement();
      });
    })
    .catch((error) => console.error(`[grilledCorn] 載入失敗：${CORN_URL}`, error));

  applyPlacement();

  function applySettings() {
    if (model && builtModelSize !== settings.modelSize) fitModel(model);
    applyPlacement();
  }

  function setNormal(target: THREE.Vector3) {
    const angle = Math.acos(THREE.MathUtils.clamp(target.dot(up), -1, 1));
    horizontal.copy(target).addScaledVector(up, -target.dot(up));
    side.crossVectors(up, front);
    const azimuth = Math.atan2(horizontal.dot(side), horizontal.dot(front));
    settings.angleFromTopDegrees = Math.round(THREE.MathUtils.radToDeg(angle));
    settings.azimuthDegrees = Math.round(THREE.MathUtils.radToDeg(azimuth));
    applySettings();
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1);
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
    steam.setActive(introGrow);
  }

  function update(deltaTime: number, introDone: boolean) {
    const density = introDone && introGrow > 0.82 ? 1 : introGrow * 0.25;
    steam.setActive(density);
    steam.update(deltaTime);
  }

  function dispose() {
    steam.dispose();
    if (!model) return;
    model.removeFromParent();
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    model = null;
  }

  return {
    object: anchor,
    settings,
    visualSettings,
    applySettings,
    applyVisuals,
    setIntroGrow,
    update,
    dispose,
    getNormal: () => normal.clone(),
    setNormal,
  };
}

function formatOneCornPlacement(placement: GrilledCornPlacement, trailingComma: boolean) {
  return (
    `  {\n` +
    `    id: '${placement.id}',\n` +
    `    angleFromTopDegrees: ${placement.angleFromTopDegrees},\n` +
    `    azimuthDegrees: ${placement.azimuthDegrees},\n` +
    `    spinDegrees: ${placement.spinDegrees},\n` +
    `    sink: ${placement.sink.toFixed(3)},\n` +
    `    placementScale: ${placement.placementScale.toFixed(2)},\n` +
    `    modelSize: ${placement.modelSize.toFixed(3)},\n` +
    `    emissiveIntensity: ${placement.emissiveIntensity.toFixed(2)},\n` +
    `    colorBoost: ${placement.colorBoost.toFixed(2)},\n` +
    `    orangeBias: ${placement.orangeBias.toFixed(2)},\n` +
    `    normalScale: ${placement.normalScale.toFixed(2)},\n` +
    `    steamDensity: ${placement.steamDensity.toFixed(2)},\n` +
    `    tintColor: '${placement.tintColor}',\n` +
    `    tintMix: ${placement.tintMix.toFixed(2)},\n` +
    `  }${trailingComma ? ',' : ''}`
  );
}

export function formatGrilledCornPlacementsForPaste(
  entries: Array<{ id: string; settings: GrilledCornLayout; visualSettings: GrilledCornVisualSettings }>,
) {
  const lines = entries.map((entry, index) => {
    const placement: GrilledCornPlacement = {
      id: entry.id,
      ...entry.settings,
      ...entry.visualSettings,
    };
    return formatOneCornPlacement(placement, index < entries.length - 1);
  });
  return (
    `// 貼回 src/world/objects/grilledCornLayout.ts（或整段貼給助手寫死）\n` +
    `// 玉米數量：${entries.length} 根 ← GRILLED_CORN_PLACEMENTS.length\n\n` +
    `export const GRILLED_CORN_PLACEMENTS = [\n` +
    lines.join('\n') +
    `\n] satisfies GrilledCornPlacement[];`
  );
}
