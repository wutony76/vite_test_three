import * as THREE from 'three';
import { conformChildrenToSphere } from './conformToSphere';
import { cloneGltfInstance, loadGltfOnce, scheduleGltfMount } from './sharedGltf';
import {
  FRIED_EGG_SUN_DEFAULT,
  type FriedEggAttachLayout,
  type FriedEggLayout,
  type FriedEggPlacement,
  type FriedEggSphereLayout,
  type FriedEggSunLayout,
} from './friedEggLayout';

const FRIED_EGG_URL = `${import.meta.env.BASE_URL}models/fried_egg/fried_egg.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const jellyScale = new THREE.Vector3(1, 1, 1);
const attachPos = new THREE.Vector3();
const viewOffset = new THREE.Vector3();
const anchorWorld = new THREE.Vector3();
/** +Y 為蛋頂（蛋黃穹頂）；繞 Y 轉 180° 避免看到蛋白底面（會發褐） */
const EGG_FACE_CAMERA = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(Math.PI / 2, Math.PI, 0),
);

const EGG_YOLK_EMISSIVE = new THREE.Color(0xffa41c);

export type FriedEggSettings = FriedEggLayout;

function isAttachLayout(layout: FriedEggLayout): layout is FriedEggAttachLayout {
  return layout.mode === 'attach';
}

function isSunLayout(layout: FriedEggLayout): layout is FriedEggSunLayout {
  return layout.mode === 'sun';
}

type CreateFriedEggOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  camera: THREE.Camera;
  envMap?: THREE.Texture;
  layout?: FriedEggLayout;
  attachParent?: THREE.Object3D | null;
  sceneParent?: THREE.Object3D | null;
};

/** 荷包蛋：球面／掛屋／蛋形太陽（鏡頭跟隨＋發光）。 */
export function createFriedEgg({
  groundRadius,
  up,
  front,
  camera,
  envMap,
  layout = FRIED_EGG_SUN_DEFAULT,
  attachParent = null,
  sceneParent = null,
}: CreateFriedEggOptions) {
  const settings: FriedEggSettings =
    layout.mode === 'sun' ? { ...FRIED_EGG_SUN_DEFAULT, ...layout } : { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'egg_sun_anchor';
  anchor.frustumCulled = false;
  let model: THREE.Object3D | null = null;
  let modelBaseScale = 1;
  let introGrow = 1;
  let builtModelSize = settings.modelSize;
  let jigglePhase = 0;

  const sunLight = new THREE.PointLight(0xfff4e0, 0, Math.max(groundRadius * 6, 12), 1.6);
  sunLight.castShadow = false;
  anchor.add(sunLight);
  const sunFill = new THREE.PointLight(0xffffff, 0, Math.max(groundRadius * 5, 10), 1.2);
  sunFill.castShadow = false;
  anchor.add(sunFill);

  function placeSunInView() {
    if (!isSunLayout(settings)) return;
    camera.updateMatrixWorld(true);
    viewOffset.set(settings.camX, settings.camY, settings.camZ);
    anchorWorld.copy(viewOffset).applyMatrix4(camera.matrixWorld);
    anchor.position.copy(anchorWorld);
    anchor.quaternion.copy(camera.quaternion).multiply(EGG_FACE_CAMERA);
    const lit = settings.lightIntensity;
    sunLight.intensity = lit * 1.15;
    const reach = settings.modelSize * settings.placementScale;
    sunLight.distance = Math.max(reach * 28, 5);
    sunFill.intensity = lit * 0.55;
    sunFill.distance = Math.max(reach * 22, 4);
  }

  function applyPlacement() {
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));

    if (isSunLayout(settings)) {
      placeSunInView();
      return;
    }

    if (isAttachLayout(settings)) {
      if (!attachParent) return;
      attachPos.set(settings.localX, settings.localY, settings.localZ);
      anchor.position.copy(attachPos);
      anchor.quaternion.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees));
      return;
    }

    const sphere = settings as FriedEggSphereLayout;
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(sphere.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(sphere.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));

    anchor.position.copy(normal).multiplyScalar(groundRadius - sphere.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(sphere.spinDegrees)));

    const conform = {
      groundRadius,
      sink: sphere.sink,
      normal,
      groundY: 0,
      groundBand: 0.014,
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
  }

  function eggPartName(mesh: THREE.Mesh, m: THREE.MeshStandardMaterial) {
    return `${m.name || ''} ${mesh.name || ''}`.toLowerCase();
  }

  function isEggYolk(mesh: THREE.Mesh, m: THREE.MeshStandardMaterial) {
    return eggPartName(mesh, m).includes('yolk');
  }

  function isEggWhite(mesh: THREE.Mesh, m: THREE.MeshStandardMaterial) {
    return eggPartName(mesh, m).includes('white');
  }

  const mapsTuned = new WeakSet<THREE.MeshStandardMaterial>();

  function configureEggMaps(m: THREE.MeshStandardMaterial, isWhite: boolean, sun: boolean) {
    if (m.map) {
      m.map.colorSpace = THREE.SRGBColorSpace;
      m.vertexColors = false;
    }
    if (sun && !mapsTuned.has(m)) {
      m.metalnessMap = null;
      m.roughnessMap = null;
      mapsTuned.add(m);
    }
    if (m.aoMap) {
      m.aoMapIntensity = sun ? (isWhite ? 0.1 : 0.14) : isWhite ? 0.35 : 0.5;
    }
    m.side = THREE.DoubleSide;
  }

  function applyVisuals() {
    if (!model) return;
    const boost = isSunLayout(settings) ? settings.emissiveBoost : 1;
    const sun = isSunLayout(settings);
    model.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('roughness' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        const white = isEggWhite(mesh, m);
        const yolk = isEggYolk(mesh, m);
        if (!white && !yolk) continue;

        configureEggMaps(m, white, sun);

        if (white) {
          if (sun) {
            m.metalness = settings.whiteMetalness;
            m.roughness = settings.whiteRoughness;
            m.envMapIntensity = settings.whiteEnvIntensity;
          } else {
            m.metalness = 0;
            m.roughness = 0.48;
            m.envMapIntensity = 0.22;
          }
          m.color.setRGB(1, 1, 1);
          m.emissive.setHex(0xffffff);
          m.emissiveIntensity = sun ? 0.38 * boost : 0.08;
        } else {
          m.metalness = 0;
          m.roughness = sun ? 0.18 : 0.28;
          m.envMapIntensity = sun ? 0.52 : 0.4;
          m.color.setRGB(1, 1, 1);
          m.emissive.copy(EGG_YOLK_EMISSIVE);
          m.emissiveIntensity = sun ? 0.52 * boost : 0.22;
        }
      }
    });
  }

  function enhanceEggMaterials(root: THREE.Object3D) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('roughness' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        const white = isEggWhite(mesh, m);
        if (envMap) m.envMap = envMap;
        configureEggMaps(m, white, isSunLayout(settings));
      }
    });
    applyVisuals();
  }

  loadGltfOnce(FRIED_EGG_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        model = cloneGltfInstance(gltf.scene);
        model.name = 'fried_egg_model';
        model.traverse((child) => {
          child.frustumCulled = false;
        });
        fitModel(model);
        enhanceEggMaterials(model);
        anchor.add(model);
        applyPlacement();
        setIntroGrow(introGrow);
        console.info('[friedEgg] 已載入', settings.mode);
      });
    })
    .catch((error) => console.error(`[friedEgg] 載入失敗：${FRIED_EGG_URL}`, error));

  if (isSunLayout(settings) && sceneParent) sceneParent.add(anchor);
  else if (isAttachLayout(settings) && attachParent) attachParent.add(anchor);
  else if (!isSunLayout(settings) && !isAttachLayout(settings)) sceneParent?.add(anchor);
  applyPlacement();

  function applySettings() {
    if (model && builtModelSize !== settings.modelSize) fitModel(model);
    applyPlacement();
    applyVisuals();
  }

  function setNormal(target: THREE.Vector3) {
    if (!isSunLayout(settings) && !isAttachLayout(settings)) {
      const sphere = settings as FriedEggSphereLayout;
      const angle = Math.acos(THREE.MathUtils.clamp(target.dot(up), -1, 1));
      horizontal.copy(target).addScaledVector(up, -target.dot(up));
      side.crossVectors(up, front);
      const azimuth = Math.atan2(horizontal.dot(side), horizontal.dot(front));
      sphere.angleFromTopDegrees = Math.round(THREE.MathUtils.radToDeg(angle));
      sphere.azimuthDegrees = Math.round(THREE.MathUtils.radToDeg(azimuth));
      applySettings();
    }
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1);
    applyPlacement();
  }

  function update(deltaTime: number, introDone: boolean) {
    if (isSunLayout(settings) && (introDone || introGrow > 0.001)) {
      placeSunInView();
    }

    if (!model) return;

    if (!isSunLayout(settings)) {
      model.scale.setScalar(modelBaseScale);
      model.rotation.set(0, 0, 0);
      return;
    }

    const sun = settings;
    model.rotation.set(0, 0, 0);

    if (!introDone || introGrow < 0.999) {
      model.scale.setScalar(modelBaseScale);
      return;
    }

    const dt = Number.isFinite(deltaTime) ? deltaTime : 0;
    const jiggleSpeed = sun.jiggleSpeed ?? FRIED_EGG_SUN_DEFAULT.jiggleSpeed;
    const jiggleStrength = sun.jiggleStrength ?? FRIED_EGG_SUN_DEFAULT.jiggleStrength;
    jigglePhase += dt * jiggleSpeed;

    const wobble =
      jiggleStrength *
      (0.045 * Math.sin(jigglePhase * 5.1) +
        0.028 * Math.sin(jigglePhase * 8.7 + 0.6) +
        0.015 * Math.sin(jigglePhase * 2.3));
    const squash = THREE.MathUtils.clamp(1 - wobble * 0.55, 0.55, 1.45);
    const bulge = THREE.MathUtils.clamp(1 + wobble, 0.55, 1.45);
    jellyScale.set(squash, bulge, squash);
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
    applyVisuals,
    setIntroGrow,
    update,
    getNormal: () => (isSunLayout(settings) || isAttachLayout(settings) ? up.clone() : normal.clone()),
    setNormal,
  };
}

function formatSunBlock(id: string, settings: FriedEggSunLayout, trailingComma: boolean) {
  return (
    `  {\n` +
    `    id: '${id}',\n` +
    `    mode: 'sun',\n` +
    `    camX: ${settings.camX.toFixed(2)},\n` +
    `    camY: ${settings.camY.toFixed(2)},\n` +
    `    camZ: ${settings.camZ.toFixed(2)},\n` +
    `    spinDegrees: ${settings.spinDegrees},\n` +
    `    placementScale: ${settings.placementScale.toFixed(2)},\n` +
    `    modelSize: ${settings.modelSize.toFixed(3)},\n` +
    `    lightIntensity: ${settings.lightIntensity.toFixed(2)},\n` +
    `    emissiveBoost: ${settings.emissiveBoost.toFixed(2)},\n` +
    `    jiggleStrength: ${settings.jiggleStrength.toFixed(2)},\n` +
    `    jiggleSpeed: ${settings.jiggleSpeed.toFixed(2)},\n` +
    `    whiteMetalness: ${settings.whiteMetalness.toFixed(2)},\n` +
    `    whiteRoughness: ${settings.whiteRoughness.toFixed(2)},\n` +
    `    whiteEnvIntensity: ${settings.whiteEnvIntensity.toFixed(2)},\n` +
    `  }${trailingComma ? ',' : ''}`
  );
}

/** 調好後貼回 friedEggLayout.ts */
export function formatFriedEggPlacementsForPaste(entries: Array<{ id: string; settings: FriedEggSettings }>) {
  const suns = entries.filter((e) => e.settings.mode === 'sun') as Array<{ id: string; settings: FriedEggSunLayout }>;
  if (suns.length === 0) return '// 目前沒有 mode: sun 的荷包蛋';
  const lines = suns.map((entry, i) => formatSunBlock(entry.id, entry.settings, i < suns.length - 1));
  return (
    `// 貼到 src/world/objects/friedEggLayout.ts\n` +
    `export const FRIED_EGG_PLACEMENTS = [\n` +
    lines.join('\n') +
    `\n] satisfies FriedEggPlacement[];`
  );
}

export type { FriedEggPlacement };
