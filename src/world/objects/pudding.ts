import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { conformChildrenToSphere } from './conformToSphere';
import { PUDDING_LAYOUT_DEFAULT, type PuddingLayout, type PuddingPlacement } from './puddingLayout';

const PUDDING_URL = `${import.meta.env.BASE_URL}models/pudding/pudding.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const jellyScale = new THREE.Vector3(1, 1, 1);

export type PuddingSettings = PuddingLayout;

type CreatePuddingOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: PuddingLayout;
};

/**
 * 綠球上的焦糖布丁：貼地表、入場彈一下，平時輕微 Q 彈晃動。
 */
export function createPudding({ groundRadius, up, front, envMap, layout = PUDDING_LAYOUT_DEFAULT }: CreatePuddingOptions) {
  const settings: PuddingSettings = { ...layout };

  const anchor = new THREE.Object3D();
  let model: THREE.Object3D | null = null;
  let modelBaseScale = 1;
  let introGrow = 1;
  let jigglePhase = 0;
  let builtModelSize = settings.modelSize;

  function applyPlacement() {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));

    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));

    const conformOptions = {
      groundRadius,
      sink: settings.sink,
      normal,
      groundY: 0,
      groundBand: 0.012,
    };
    if (model) conformChildrenToSphere(anchor, conformOptions);
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
  }

  function enhanceJellyMaterials(root: THREE.Object3D) {
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
        const isCaramel = name.includes('caramel');
        m.metalness = 0;
        m.roughness = isCaramel ? 0.22 : 0.42;
        m.envMapIntensity = isCaramel ? 0.35 : 0.12;
        if (envMap) m.envMap = envMap;
        if (m.vertexColors) {
          m.emissive.copy(m.color);
          m.emissive.multiplyScalar(isCaramel ? 0.35 : 0.22);
          m.emissiveIntensity = isCaramel ? 0.55 : 0.4;
        }
      }
    });
  }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    PUDDING_URL,
    (gltf) => {
      model = gltf.scene;
      fitModel(model);
      enhanceJellyMaterials(model);
      anchor.add(model);
      applyPlacement();
    },
    undefined,
    (error) => console.error(`[pudding] 載入失敗：${PUDDING_URL}`, error),
  );

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
  }

  function update(deltaTime: number, introDone: boolean) {
    if (!model) return;
    jigglePhase += deltaTime * settings.jiggleSpeed;

    if (!introDone || introGrow < 0.999) {
      model.scale.setScalar(modelBaseScale);
      return;
    }

    const strength = settings.jiggleStrength;
    const wobble =
      strength *
      (0.045 * Math.sin(jigglePhase * 5.1) +
        0.028 * Math.sin(jigglePhase * 8.7 + 0.6) +
        0.015 * Math.sin(jigglePhase * 2.3));
    const squash = 1 - wobble * 0.55;
    jellyScale.set(squash, 1 + wobble, squash);
    model.scale.set(
      modelBaseScale * jellyScale.x,
      modelBaseScale * jellyScale.y,
      modelBaseScale * jellyScale.z,
    );
  }

  return {
    object: anchor,
    settings,
    applySettings,
    setIntroGrow,
    update,
    getNormal: () => normal.clone(),
    setNormal,
  };
}

function formatOnePlacement(id: string, settings: PuddingLayout, trailingComma: boolean) {
  return (
    `  {\n` +
    `    id: '${id}',\n` +
    `    angleFromTopDegrees: ${settings.angleFromTopDegrees},\n` +
    `    azimuthDegrees: ${settings.azimuthDegrees},\n` +
    `    spinDegrees: ${settings.spinDegrees},\n` +
    `    sink: ${settings.sink.toFixed(3)},\n` +
    `    placementScale: ${settings.placementScale.toFixed(2)},\n` +
    `    modelSize: ${settings.modelSize.toFixed(3)},\n` +
    `    jiggleStrength: ${settings.jiggleStrength.toFixed(2)},\n` +
    `    jiggleSpeed: ${settings.jiggleSpeed.toFixed(2)},\n` +
    `  }${trailingComma ? ',' : ''}`
  );
}

/** 把全部布丁的佈局格式化成可貼回 puddingLayout.ts 的字串 */
export function formatPuddingPlacementsForPaste(entries: Array<{ id: string; settings: PuddingLayout }>) {
  const lines = entries.map((entry, index) => formatOnePlacement(entry.id, entry.settings, index < entries.length - 1));
  return (
    `// 貼到 src/world/objects/puddingLayout.ts\n` +
    `export const PUDDING_PLACEMENTS = [\n` +
    lines.join('\n') +
    `\n] satisfies PuddingPlacement[];`
  );
}

export type { PuddingPlacement };
