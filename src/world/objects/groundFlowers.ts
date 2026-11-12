import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import bakedLayout from './groundFlowers.baked.json';
import {
  generateFlowerLayout,
  type FlowerSlot,
  type OrbitFrame,
  type PersistedFlowers,
} from './groundFlowersLayoutCore';
import {
  DEFAULT_GROUND_FLOWER_SETTINGS,
  type FlowerStyleSettings,
  type GroundFlowerSettings,
} from './groundFlowersTypes';

export type { FlowerStyleSettings, GroundFlowerSettings };

const MAX_INSTANCES = 512;
const STORAGE_KEY = 'world-ground-flowers-v1';

const BAKED_LAYOUT = bakedLayout as PersistedFlowers;

function paintGeometry(geometry: THREE.BufferGeometry, color: THREE.Color) {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function buildFlowerA(style: FlowerStyleSettings): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const petal = new THREE.Color(style.petalColor);
  const center = new THREE.Color(style.centerColor);
  const size = style.size;

  parts.push(paintGeometry(new THREE.CircleGeometry(0.012 * size, 12), center));

  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const piece = new THREE.CircleGeometry(0.017 * size, 12);
    const angle = (i / petals) * Math.PI * 2;
    piece.translate(Math.cos(angle) * 0.021 * size, Math.sin(angle) * 0.021 * size, 0);
    parts.push(paintGeometry(piece, petal));
  }

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('[groundFlowers] merge A failed');
  return merged;
}

function buildFlowerB(style: FlowerStyleSettings): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const petal = new THREE.Color(style.petalColor);
  const center = new THREE.Color(style.centerColor);
  const size = style.size;

  parts.push(paintGeometry(new THREE.CircleGeometry(0.009 * size, 10), center));

  const petals = 4;
  for (let i = 0; i < petals; i++) {
    const piece = new THREE.CircleGeometry(0.013 * size, 10);
    const angle = (i / petals) * Math.PI * 2 + Math.PI / 4;
    piece.translate(Math.cos(angle) * 0.016 * size, Math.sin(angle) * 0.016 * size, 0);
    parts.push(paintGeometry(piece, petal));
  }

  const merged = mergeGeometries(parts);
  if (!merged) throw new Error('[groundFlowers] merge B failed');
  return merged;
}

function createFlowerMaterial() {
  return new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shininess: 4,
    flatShading: true,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
}

function savePersisted(payload: PersistedFlowers) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* 無痕模式等 */
  }
}

export function createGroundFlowers(
  radius: number,
  camera: THREE.Camera,
  anchor: THREE.Object3D,
  orbitAxisSource: THREE.Object3D,
) {
  const settings: GroundFlowerSettings = structuredClone(DEFAULT_GROUND_FLOWER_SETTINGS);

  const root = new THREE.Group();

  const meshA = new THREE.InstancedMesh(buildFlowerA(settings.styleA), createFlowerMaterial(), MAX_INSTANCES);
  const meshB = new THREE.InstancedMesh(buildFlowerB(settings.styleB), createFlowerMaterial(), MAX_INSTANCES);
  for (const mesh of [meshA, meshB]) {
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
  }

  let slotsA: FlowerSlot[] = [];
  let slotsB: FlowerSlot[] = [];
  let lockedFrame: OrbitFrame | null = null;
  /** 入場與房子同步：每棟一個 scale，null 表示入場已結束 */
  let introHouseGrows: number[] | null = null;

  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const position = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const ballCenter = new THREE.Vector3();
  const spinAxis = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const axisQuat = new THREE.Quaternion();
  const anchorQuat = new THREE.Quaternion();

  function captureOrbitFrameFromCamera() {
    anchor.updateMatrixWorld(true);
    anchor.getWorldPosition(ballCenter);

    orbitAxisSource.updateMatrixWorld(true);
    spinAxis.set(0, 1, 0).applyQuaternion(orbitAxisSource.getWorldQuaternion(axisQuat));
    if (spinAxis.y < 0) spinAxis.negate();
    spinAxis.normalize();

    toCam.copy(camera.position).sub(ballCenter);
    camDir.copy(toCam).addScaledVector(spinAxis, -toCam.dot(spinAxis));
    if (camDir.lengthSq() < 1e-8) {
      camDir.set(1, 0, 0).addScaledVector(spinAxis, -spinAxis.x).normalize();
    } else {
      camDir.normalize();
    }

    lockedFrame = { spinAxis: spinAxis.clone(), camDir: camDir.clone() };
  }

  function introScaleForSlot(globalIndex: number) {
    if (introHouseGrows === null) return 1;
    if (introHouseGrows.length === 0) return 0.0001;
    const houseIndex = globalIndex % introHouseGrows.length;
    return Math.max(0.0001, introHouseGrows[houseIndex] ?? 0.0001);
  }

  function writeSlotToMesh(slot: FlowerSlot, mesh: THREE.InstancedMesh, index: number, globalIndex: number) {
    normal.set(slot.nx, slot.ny, slot.nz);

    ref.set(0, 1, 0);
    if (Math.abs(normal.dot(ref)) > 0.92) ref.set(1, 0, 0);
    east.crossVectors(ref, normal).normalize();
    north.crossVectors(normal, east).normalize();

    position.copy(normal).multiplyScalar(radius + settings.lift);

    matrix.makeBasis(east, north, normal);
    dummy.position.copy(position);
    dummy.quaternion.setFromRotationMatrix(matrix);
    dummy.rotateZ(slot.spin);
    dummy.scale.setScalar(slot.scale * introScaleForSlot(globalIndex));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  function writeInstancesFromSlots() {
    meshA.count = slotsA.length;
    meshB.count = slotsB.length;

    for (let i = 0; i < slotsA.length; i++) writeSlotToMesh(slotsA[i], meshA, i, i);
    for (let i = 0; i < slotsB.length; i++) writeSlotToMesh(slotsB[i], meshB, i, slotsA.length + i);

    meshA.instanceMatrix.needsUpdate = true;
    meshB.instanceMatrix.needsUpdate = true;
  }

  function persistSlots() {
    if (!lockedFrame) return;
    savePersisted({
      settings: structuredClone(settings),
      frame: {
        spinAxis: lockedFrame.spinAxis.toArray() as [number, number, number],
        camDir: lockedFrame.camDir.toArray() as [number, number, number],
      },
      slotsA,
      slotsB,
    });
  }

  function rebuildSlots() {
    if (!lockedFrame) captureOrbitFrameFromCamera();
    anchor.updateMatrixWorld(true);
    anchor.getWorldQuaternion(anchorQuat);
    const generated = generateFlowerLayout(settings, lockedFrame!, anchorQuat);
    slotsA = generated.slotsA;
    slotsB = generated.slotsB;
  }

  function applyGeometry() {
    meshA.geometry.dispose();
    meshB.geometry.dispose();
    meshA.geometry = buildFlowerA(settings.styleA);
    meshB.geometry = buildFlowerB(settings.styleB);
  }

  function refreshInstances() {
    writeInstancesFromSlots();
    persistSlots();
  }

  function applyVisuals() {
    applyGeometry();
    persistSlots();
  }

  function relayoutDistribution(captureView = false) {
    if (captureView || !lockedFrame) captureOrbitFrameFromCamera();
    rebuildSlots();
    writeInstancesFromSlots();
    persistSlots();
  }

  function rerollDistribution() {
    settings.seed = Math.floor(Math.random() * 999_999) + 1;
    relayoutDistribution(false);
  }

  function layoutFromView() {
    relayoutDistribution(true);
  }

  function loadLayoutData(data: PersistedFlowers) {
    Object.assign(settings, data.settings);
    slotsA = data.slotsA;
    slotsB = data.slotsB;
    lockedFrame = {
      spinAxis: new THREE.Vector3().fromArray(data.frame.spinAxis),
      camDir: new THREE.Vector3().fromArray(data.frame.camDir),
    };
  }

  function clearPersistedLayout() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    loadLayoutData(BAKED_LAYOUT);
    applyGeometry();
    writeInstancesFromSlots();
  }

  function setIntroHouseGrows(grows: number[]) {
    introHouseGrows = grows;
    writeInstancesFromSlots();
  }

  function resetIntro(houseCount: number) {
    introHouseGrows = new Array(houseCount).fill(0);
    writeInstancesFromSlots();
  }

  function finishIntro() {
    introHouseGrows = null;
    writeInstancesFromSlots();
  }

  function exportBakedJsonToConsole() {
    if (!lockedFrame) return;
    const payload: PersistedFlowers = {
      settings: structuredClone(settings),
      frame: {
        spinAxis: lockedFrame.spinAxis.toArray() as [number, number, number],
        camDir: lockedFrame.camDir.toArray() as [number, number, number],
      },
      slotsA,
      slotsB,
    };
    console.log('// 複製到 groundFlowers.baked.json\n' + JSON.stringify(payload, null, 2));
  }

  loadLayoutData(BAKED_LAYOUT);
  applyGeometry();
  writeInstancesFromSlots();

  return {
    root,
    mesh: root,
    meshA,
    meshB,
    settings,
    applyVisuals,
    refreshInstances,
    relayoutDistribution,
    layoutFromView,
    rerollDistribution,
    clearPersistedLayout,
    exportBakedJsonToConsole,
    setIntroHouseGrows,
    resetIntro,
    finishIntro,
    apply() {
      applyVisuals();
    },
    applyLayout() {
      relayoutDistribution(false);
    },
  };
}

export type GroundFlowers = ReturnType<typeof createGroundFlowers>;
