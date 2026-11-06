import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export type CameraPose = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
};

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpAngle(a: number, b: number, t: number) {
  let delta = b - a;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return a + delta * t;
}

/** 依位移與視線夾角估計秒數，避免大角度一閃到位、小調整又拖太久 */
export function estimateCameraTweenSeconds(from: CameraPose, to: CameraPose) {
  const posMove = from.position.distanceTo(to.position);
  const targetMove = from.target.distanceTo(to.target);
  const viewFrom = new THREE.Vector3().subVectors(from.position, from.target);
  const viewTo = new THREE.Vector3().subVectors(to.position, to.target);
  let angle = 0;
  if (viewFrom.lengthSq() > 1e-10 && viewTo.lengthSq() > 1e-10) {
    angle = viewFrom.normalize().angleTo(viewTo.normalize());
  }
  const seconds = 0.48 + posMove * 0.16 + targetMove * 0.22 + (angle / Math.PI) * 0.78;
  return THREE.MathUtils.clamp(seconds, 0.55, 2.15);
}

let flying: Promise<void> | null = null;

/**
 * 以 tween 把鏡頭與 OrbitControls 目標移回指定姿態（沿球面軌道插值，不穿過球心）
 */
export function flyCameraTo(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  to: CameraPose,
): Promise<void> {
  if (flying) return flying;

  const from: CameraPose = {
    position: camera.position.clone(),
    target: controls.target.clone(),
    up: camera.up.clone(),
  };

  const durationMs = estimateCameraTweenSeconds(from, to) * 1000;
  const offset0 = new THREE.Vector3().subVectors(from.position, from.target);
  const offset1 = new THREE.Vector3().subVectors(to.position, to.target);
  const s0 = new THREE.Spherical().setFromVector3(offset0);
  const s1 = new THREE.Spherical().setFromVector3(offset1);
  const tmpTarget = new THREE.Vector3();
  const tmpOffset = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();

  flying = new Promise<void>((resolve) => {
    const start = performance.now();
    const wasEnabled = controls.enabled;
    controls.enabled = false;

    function frame(now: number) {
      const raw = Math.min(1, (now - start) / durationMs);
      const t = easeInOutCubic(raw);

      tmpTarget.lerpVectors(from.target, to.target, t);
      const radius = THREE.MathUtils.lerp(s0.radius, s1.radius, t);
      const phi = THREE.MathUtils.lerp(s0.phi, s1.phi, t);
      const theta = lerpAngle(s0.theta, s1.theta, t);
      tmpOffset.setFromSpherical(new THREE.Spherical(radius, phi, theta));
      camera.position.copy(tmpTarget).add(tmpOffset);
      controls.target.copy(tmpTarget);
      tmpUp.lerpVectors(from.up, to.up, t);
      if (tmpUp.lengthSq() > 1e-10) camera.up.copy(tmpUp.normalize());
      camera.lookAt(tmpTarget);

      if (raw < 1) requestAnimationFrame(frame);
      else {
        camera.position.copy(to.position);
        controls.target.copy(to.target);
        camera.up.copy(to.up);
        camera.lookAt(to.target);
        controls.enabled = wasEnabled;
        controls.update();
        flying = null;
        resolve();
      }
    }
    requestAnimationFrame(frame);
  });

  return flying;
}

export function isCameraFlying() {
  return flying !== null;
}
