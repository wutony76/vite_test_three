import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { conformChildrenToSphere } from './conformToSphere';
import {
  SALMON_STEAK_LAYOUT_DEFAULT,
  type SalmonSteakLayout,
} from './salmonSteakLayout';

const SALMON_STEAK_URL = `${import.meta.env.BASE_URL}models/salmon_steak/salmon_steak.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const tilt = new THREE.Quaternion();
const tintColor = new THREE.Color();
const tinted = new THREE.Color();

export type SalmonSteakSettings = SalmonSteakLayout;

type CreateSalmonSteakOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: SalmonSteakLayout;
};

/** 綠球上的鮭魚排：平貼地表，厚度朝外。 */
export function createSalmonSteak({
  groundRadius,
  up,
  front,
  envMap,
  layout = SALMON_STEAK_LAYOUT_DEFAULT,
}: CreateSalmonSteakOptions) {
  const settings: SalmonSteakSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'salmon_steak';
  const baseColors = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  let model: THREE.Object3D | null = null;
  let modelBaseScale = 1;
  let introGrow = 1;
  let builtModelSize = settings.modelSize;
  let builtHeight = settings.heightScale;
  let fittedCenter: THREE.Vector3 | null = null;
  let fittedSize: THREE.Vector3 | null = null;
  let fittedMinY = 0;

  function applyPlacement() {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));

    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.quaternion.multiply(tilt.setFromAxisAngle(X_AXIS, THREE.MathUtils.degToRad(settings.tiltXDegrees)));
    anchor.quaternion.multiply(tilt.setFromAxisAngle(Z_AXIS, THREE.MathUtils.degToRad(settings.tiltZDegrees)));
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));

    if (model) {
      const seated =
        Math.abs(settings.tiltXDegrees) < 0.5 &&
        Math.abs(settings.tiltZDegrees) < 0.5 &&
        settings.sink > -0.01;
      conformChildrenToSphere(anchor, {
        groundRadius,
        sink: settings.sink,
        normal,
        groundY: 0,
        // 傾斜或上浮時把頂點還原，避免底面仍被壓到球上
        groundBand: seated ? 0.006 : -1,
      });
    }
  }

  function fitModel(root: THREE.Object3D) {
    if (!fittedSize || !fittedCenter) {
      root.scale.set(1, 1, 1);
      root.position.set(0, 0, 0);
      root.updateMatrixWorld(true);
      const box = new THREE.Box3();
      const point = new THREE.Vector3();
      root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const position = mesh.geometry.attributes.position;
        if (!position) return;
        for (let i = 0; i < position.count; i++) {
          point.fromBufferAttribute(position, i);
          root.worldToLocal(mesh.localToWorld(point));
          box.expandByPoint(point);
        }
      });
      fittedCenter = box.getCenter(new THREE.Vector3());
      fittedSize = box.getSize(new THREE.Vector3());
      fittedMinY = box.min.y;
    }
    const heightScale = Math.max(0.05, settings.heightScale);
    modelBaseScale = settings.modelSize / Math.max(fittedSize.x, fittedSize.y, fittedSize.z, 1e-6);
    root.scale.set(modelBaseScale, modelBaseScale * heightScale, modelBaseScale);
    root.position.set(
      -fittedCenter.x * modelBaseScale,
      -fittedMinY * modelBaseScale * heightScale,
      -fittedCenter.z * modelBaseScale,
    );
    builtModelSize = settings.modelSize;
    builtHeight = settings.heightScale;
  }

  function applyVisuals() {
    if (!model) return;
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('color' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        const base = baseColors.get(m);
        if (!base) continue;
        m.color.copy(base).multiplyScalar(settings.colorBoost);
        const mix = THREE.MathUtils.clamp(settings.tintMix, 0, 1);
        if (mix > 0.001) {
          tintColor.set(settings.tintColor);
          tinted.copy(m.color).lerp(tintColor, mix);
          m.color.copy(tinted);
        }
        m.emissive.setHex(0x000000);
        m.emissiveIntensity = 0;
      }
    });
  }

  function prepareMaterials(root: THREE.Object3D) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('roughness' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.metalness = 0;
        if (envMap) {
          m.envMap = envMap;
          m.envMapIntensity = 0.18;
        }
        if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
        if (!baseColors.has(m)) baseColors.set(m, m.color.clone());
      }
    });
    applyVisuals();
  }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    SALMON_STEAK_URL,
    (gltf) => {
      model = gltf.scene;
      model.name = 'salmon_steak_model';
      fitModel(model);
      prepareMaterials(model);
      anchor.add(model);
      applyPlacement();
    },
    undefined,
    (error) => console.error(`[salmonSteak] 載入失敗：${SALMON_STEAK_URL}`, error),
  );

  applyPlacement();

  function applySettings() {
    if (model && (builtModelSize !== settings.modelSize || builtHeight !== settings.heightScale)) fitModel(model);
    applyPlacement();
  }

  function dispose() {
    anchor.removeFromParent();
    if (!model) return;
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    baseColors.clear();
    model = null;
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

  return {
    object: anchor,
    settings,
    applySettings,
    applyVisuals,
    setIntroGrow,
    update: () => {},
    dispose,
    getNormal: () => normal.clone(),
    setNormal,
  };
}

export function formatSalmonSteakPlacementsForPaste(
  entries: Array<{ id: string; settings: SalmonSteakLayout }>,
) {
  const lines = entries.map((entry, index) => {
    const s = entry.settings;
    const comma = index < entries.length - 1 ? ',' : '';
    return (
      `  {\n` +
      `    id: '${entry.id}',\n` +
      `    angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
      `    azimuthDegrees: ${s.azimuthDegrees},\n` +
      `    spinDegrees: ${s.spinDegrees},\n` +
      `    tiltXDegrees: ${s.tiltXDegrees},\n` +
      `    tiltZDegrees: ${s.tiltZDegrees},\n` +
      `    sink: ${s.sink.toFixed(3)},\n` +
      `    placementScale: ${s.placementScale.toFixed(2)},\n` +
      `    modelSize: ${s.modelSize.toFixed(3)},\n` +
      `    heightScale: ${s.heightScale.toFixed(2)},\n` +
      `    colorBoost: ${s.colorBoost.toFixed(2)},\n` +
      `    tintColor: '${s.tintColor}',\n` +
      `    tintMix: ${s.tintMix.toFixed(2)},\n` +
      `  }${comma}`
    );
  });
  return (
    `// 貼回 src/world/objects/salmonSteakLayout.ts\n` +
    `export const SALMON_STEAK_PLACEMENTS = [\n` +
    lines.join('\n') +
    `\n];\n`
  );
}
