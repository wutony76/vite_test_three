/**
 * 依 world 初視鏡頭 + 緞帶預設朝向，烘焙地表小花座標到 repo。
 * 執行：npx tsx tools/bakeGroundFlowers.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { generateFlowerLayout } from '../src/world/objects/groundFlowersLayoutCore.ts';
import { DEFAULT_GROUND_FLOWER_SETTINGS } from '../src/world/objects/groundFlowersTypes.ts';

const CAMERA_POSITION = new THREE.Vector3(1.85, 4.06, -0.56);
const RING_TILT_DEG = 131;
const RING_YAW_DEG = 107;
const RING_OFFSET = new THREE.Vector3(-0.44, 0.38, 0.13);

const pivot = new THREE.Object3D();
pivot.rotation.set(
  THREE.MathUtils.degToRad(RING_TILT_DEG),
  THREE.MathUtils.degToRad(RING_YAW_DEG),
  0,
  'YXZ',
);
pivot.position.copy(RING_OFFSET);
pivot.updateMatrixWorld(true);

const spinAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(pivot.getWorldQuaternion(new THREE.Quaternion()));
if (spinAxis.y < 0) spinAxis.negate();
spinAxis.normalize();

const ballCenter = new THREE.Vector3(0, 0, 0);
const toCam = CAMERA_POSITION.clone().sub(ballCenter);
const camDir = toCam
  .clone()
  .addScaledVector(spinAxis, -toCam.dot(spinAxis));
if (camDir.lengthSq() < 1e-8) {
  camDir.set(1, 0, 0).addScaledVector(spinAxis, -spinAxis.x).normalize();
} else {
  camDir.normalize();
}

const settings = structuredClone(DEFAULT_GROUND_FLOWER_SETTINGS);
const { slotsA, slotsB } = generateFlowerLayout(settings, { spinAxis, camDir });

const payload = {
  settings,
  frame: {
    spinAxis: spinAxis.toArray() as [number, number, number],
    camDir: camDir.toArray() as [number, number, number],
  },
  slotsA,
  slotsB,
};

const outPath = join(dirname(fileURLToPath(import.meta.url)), '../src/world/objects/groundFlowers.baked.json');
writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${slotsA.length} A + ${slotsB.length} B slots → ${outPath}`);
