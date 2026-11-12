import * as THREE from 'three';
import type { GroundFlowerSettings } from './groundFlowersTypes';

const MAX_INSTANCES = 512;

export type FlowerSlot = {
  nx: number;
  ny: number;
  nz: number;
  spin: number;
  scale: number;
};

export type PersistedFlowers = {
  settings: GroundFlowerSettings;
  frame: { spinAxis: [number, number, number]; camDir: [number, number, number] };
  slotsA: FlowerSlot[];
  slotsB: FlowerSlot[];
};

export type OrbitFrame = {
  spinAxis: THREE.Vector3;
  camDir: THREE.Vector3;
};

export function makeRandom(seed: number) {
  let state = Math.max(1, Math.floor(seed)) % 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

function sampleSurfaceNormal(
  random: () => number,
  side: 'front' | 'back',
  settings: GroundFlowerSettings,
  frame: OrbitFrame,
  anchorQuat: THREE.Quaternion,
  out: THREE.Vector3,
) {
  const spinAxis = frame.spinAxis;
  const camDir = frame.camDir;
  const spinEast = new THREE.Vector3().crossVectors(spinAxis, camDir).normalize();

  const frontShare = THREE.MathUtils.clamp(settings.frontShare, 0, 1);
  const lonCenter = side === 'front' ? 0 : Math.PI;

  const focus = THREE.MathUtils.clamp(settings.viewFocus, 0, 1);
  const lonHalfBase = THREE.MathUtils.lerp(Math.PI, THREE.MathUtils.degToRad(settings.viewConeDegrees), focus);
  const lonHalf =
    side === 'front' ? lonHalfBase * (0.85 + frontShare * 0.3) : lonHalfBase * (0.85 + (1 - frontShare) * 0.3);
  const lon = lonCenter + (random() * 2 - 1) * lonHalf;

  const latHalf = THREE.MathUtils.lerp(Math.PI / 2, THREE.MathUtils.degToRad(settings.viewConeDegrees), focus);
  const beta = Math.PI / 2 + (random() * 2 - 1) * latHalf;
  const sinB = Math.sin(beta);
  const cosB = Math.cos(beta);

  const worldNormal = new THREE.Vector3()
    .copy(camDir)
    .multiplyScalar(sinB * Math.cos(lon))
    .addScaledVector(spinAxis, cosB)
    .addScaledVector(spinEast, sinB * Math.sin(lon))
    .normalize();

  const inv = anchorQuat.clone().invert();
  out.copy(worldNormal).applyQuaternion(inv).normalize();
}

export function generateFlowerLayout(
  settings: GroundFlowerSettings,
  frame: OrbitFrame,
  anchorWorldQuat = new THREE.Quaternion(),
): Pick<PersistedFlowers, 'slotsA' | 'slotsB'> {
  const random = makeRandom(settings.seed);
  const placed = THREE.MathUtils.clamp(Math.round(settings.count), 0, MAX_INSTANCES);
  const ratio = THREE.MathUtils.clamp(settings.styleBRatio, 0, 1);
  const frontShare = THREE.MathUtils.clamp(settings.frontShare, 0, 1);

  const normal = new THREE.Vector3();
  const slotsA: FlowerSlot[] = [];
  const slotsB: FlowerSlot[] = [];

  for (let i = 0; i < placed; i++) {
    const side: 'front' | 'back' = random() < frontShare ? 'front' : 'back';
    sampleSurfaceNormal(random, side, settings, frame, anchorWorldQuat, normal);
    const slot: FlowerSlot = {
      nx: normal.x,
      ny: normal.y,
      nz: normal.z,
      spin: random() * Math.PI * 2,
      scale: Math.max(0.15, 1 + (random() * 2 - 1) * settings.sizeVariation),
    };
    const wantB = random() < ratio;
    if (wantB && slotsB.length < MAX_INSTANCES) slotsB.push(slot);
    else if (slotsA.length < MAX_INSTANCES) slotsA.push(slot);
    else if (slotsB.length < MAX_INSTANCES) slotsB.push(slot);
  }

  return { slotsA, slotsB };
}
