import * as THREE from 'three';
import { cloneGltfInstance, loadGltfOnce, scheduleGltfMount } from './sharedGltf';

const PIG_URL = `${import.meta.env.BASE_URL}models/pig/pig.glb`;

const direction = new THREE.Vector3();
const probe = new THREE.Vector3();
const probe2 = new THREE.Vector3();
const east = new THREE.Vector3();
const north = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const axis = new THREE.Vector3();
const stepQuat = new THREE.Quaternion();
const wobbleScale = new THREE.Vector3(1, 1, 1);
const boxSize = new THREE.Vector3();
const basis = new THREE.Matrix4();
const placeEast = new THREE.Vector3();
const placeForward = new THREE.Vector3();

export type PigSettings = {
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  sink: number;
  placementScale: number;
  modelSize: number;
  roamSpeedDegrees: number;
  roamColatitudeMin: number;
  roamColatitudeMax: number;
  wanderSeconds: number;
  waddleStrength: number;
  obstacleMarginDegrees: number;
  /** 遊走時偏好往鏡頭方向走（只影響轉向，不會瞬移；轉動場景時小豬會自己慢慢走回來） */
  stayInViewHemisphere: boolean;
  /** 出生／重生時，位置至少要多「面向鏡頭」（dot 門檻） */
  viewHemisphereDotMin: number;
  /** 身體轉向速度（度/秒），不是瞬間甩頭 */
  turnDegreesPerSecond: number;
  /** 模型鼻向與行進切線的固定偏差 */
  modelYawOffsetDegrees: number;
};

export const PIG_LAYOUT_DEFAULT: PigSettings = {
  angleFromTopDegrees: 38,
  azimuthDegrees: 10,
  sink: 0.004,
  placementScale: 0.33,
  modelSize: 0.19,
  roamSpeedDegrees: 4,
  roamColatitudeMin: 12,
  /** 超過會滑到綠球下緣以下；背面／側面仍可跑 */
  roamColatitudeMax: 62,
  wanderSeconds: 3.5,
  waddleStrength: 0.11,
  obstacleMarginDegrees: 3.5,
  stayInViewHemisphere: true,
  viewHemisphereDotMin: 0.1,
  turnDegreesPerSecond: 140,
  modelYawOffsetDegrees: 0,
};

type PigObstacle = { normal: THREE.Vector3; clearanceRad: number };

type CreatePigOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  camera?: THREE.Camera;
  envMap?: THREE.Texture;
  layout?: PigSettings;
  getObstacleRoots: () => readonly THREE.Object3D[];
};

/**
 * 綠球上亂跑的小豬：球面測地線移動 + 簡易障礙迴避。
 */
export function createPig({
  groundRadius,
  up,
  front,
  camera,
  envMap,
  layout = PIG_LAYOUT_DEFAULT,
  getObstacleRoots,
}: CreatePigOptions) {
  const settings: PigSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'world_pig';
  let model: THREE.Object3D | null = null;
  let modelBaseScale = 1;
  let introGrow = 1;
  let waddlePhase = 0;
  let wanderTimer = settings.wanderSeconds * 0.4;
  let builtModelSize = settings.modelSize;
  /** 想去的方向（球面 bearing）；身體會先轉頭再只沿鼻頭走 */
  let bearing = Math.random() * Math.PI * 2;
  let surfaceNormal = new THREE.Vector3();
  let stuckSeconds = 0;
  const facingForward = new THREE.Vector3();
  const faceTarget = new THREE.Vector3();
  const faceTurnAxis = new THREE.Vector3();

  const side = new THREE.Vector3().crossVectors(up, front).normalize();
  const obstacleScratch: PigObstacle[] = [];

  function normalFromAngles(colatitudeDeg: number, azimuthDeg: number, target = surfaceNormal) {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(azimuthDeg));
    const angle = THREE.MathUtils.degToRad(colatitudeDeg);
    return target.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle)).normalize();
  }

  function colatitudeFromNormal(n: THREE.Vector3) {
    return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(n.dot(up), -1, 1)));
  }

  function tangentBasis(n: THREE.Vector3) {
    const colat = Math.acos(THREE.MathUtils.clamp(n.dot(up), -1, 1));
    const az = Math.atan2(n.dot(side), n.dot(front));
    normalFromAngles(THREE.MathUtils.radToDeg(colat), THREE.MathUtils.radToDeg(az) + 0.8, probe);
    east.copy(probe).sub(n).normalize();
    north.crossVectors(east, n).normalize();
  }

  function tangentFromBearing(n: THREE.Vector3, bearingRad: number, target = moveDir) {
    tangentBasis(n);
    return target.copy(east).multiplyScalar(Math.cos(bearingRad)).addScaledVector(north, Math.sin(bearingRad)).normalize();
  }

  function angularDistance(a: THREE.Vector3, b: THREE.Vector3) {
    return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  }

  function pigFootprintRad() {
    return (settings.modelSize * settings.placementScale) / Math.max(groundRadius, 0.2) * 1.15;
  }

  function cameraFacingDot(n: THREE.Vector3) {
    if (!camera) return 1;
    probe2.copy(camera.position).normalize();
    return n.dot(probe2);
  }

  function isVisibleHemisphere(n: THREE.Vector3) {
    if (!settings.stayInViewHemisphere || !camera) return true;
    return cameraFacingDot(n) >= settings.viewHemisphereDotMin;
  }

  /** 沿球面切線朝向鏡頭的那一側 */
  function bearingTowardCamera(n: THREE.Vector3) {
    if (!camera) return bearing;
    probe2.copy(camera.position).normalize();
    probe.copy(probe2).addScaledVector(n, -probe2.dot(n));
    if (probe.lengthSq() < 1e-8) return bearing;
    probe.normalize();
    tangentBasis(n);
    return Math.atan2(probe.dot(north), probe.dot(east));
  }

  /**
   * checkView 只在挑出生點時開：跑動中若把「鏡頭背面」也當障礙，
   * 一轉動場景小豬就會整片被擋住 → 卡住 → 觸發重生，看起來就是一直閃現回畫面。
   */
  function isBlocked(n: THREE.Vector3, checkView = false) {
    if (checkView && !isVisibleHemisphere(n)) return true;
    const col = colatitudeFromNormal(n);
    if (col < settings.roamColatitudeMin || col > settings.roamColatitudeMax) return true;
    const footprint = pigFootprintRad();
    for (const obstacle of obstacleScratch) {
      if (angularDistance(n, obstacle.normal) < footprint + obstacle.clearanceRad) return true;
    }
    return false;
  }

  function rotateAlong(n: THREE.Vector3, tangent: THREE.Vector3, stepRad: number, target = probe) {
    axis.crossVectors(n, tangent);
    if (axis.lengthSq() < 1e-10) return n.clone();
    axis.normalize();
    stepQuat.setFromAxisAngle(axis, stepRad);
    return target.copy(n).applyQuaternion(stepQuat).normalize();
  }

  function refreshObstacles() {
    obstacleScratch.length = 0;
    const margin = THREE.MathUtils.degToRad(settings.obstacleMarginDegrees);
    const roots = getObstacleRoots();
    for (const root of roots) {
      if (!root || root === anchor) continue;
      root.updateMatrixWorld(true);
      root.getWorldPosition(probe);
      if (probe.lengthSq() < 0.04) continue;
      probe.normalize();
      const box = new THREE.Box3().setFromObject(root);
      box.getSize(boxSize);
      const extent = Math.max(boxSize.x, boxSize.y, boxSize.z) * 0.55;
      const clearance = Math.atan(extent / Math.max(groundRadius, 0.2)) + margin;
      obstacleScratch.push({ normal: probe.clone(), clearanceRad: clearance });
    }
  }

  function syncBearingFromFacing() {
    tangentBasis(surfaceNormal);
    probe.copy(facingForward).addScaledVector(surfaceNormal, -facingForward.dot(surfaceNormal));
    if (probe.lengthSq() < 1e-8) return;
    probe.normalize();
    bearing = Math.atan2(probe.dot(north), probe.dot(east));
  }

  /** 目前鼻頭在當地 east/north 座標下的 bearing */
  function facingBearing() {
    tangentBasis(surfaceNormal);
    probe.copy(facingForward).addScaledVector(surfaceNormal, -facingForward.dot(surfaceNormal));
    if (probe.lengthSq() < 1e-8) return bearing;
    probe.normalize();
    return Math.atan2(probe.dot(north), probe.dot(east));
  }

  function wrapAngle(rad: number) {
    return Math.atan2(Math.sin(rad), Math.cos(rad));
  }

  function tangentFromFacing(target = probe2) {
    return target
      .copy(facingForward)
      .addScaledVector(surfaceNormal, -facingForward.dot(surfaceNormal))
      .normalize();
  }

  function syncFaceTargetFromBearing() {
    tangentFromBearing(surfaceNormal, bearing, faceTarget);
    faceTarget.addScaledVector(surfaceNormal, -faceTarget.dot(surfaceNormal));
    if (faceTarget.lengthSq() > 1e-8) faceTarget.normalize();
  }

  /** 在球面切平面上把鼻頭平滑轉向 wander 目標 */
  function blendFacingForward(deltaTime: number) {
    syncFaceTargetFromBearing();
    if (faceTarget.lengthSq() < 1e-8) return;
    if (facingForward.lengthSq() < 1e-8) {
      facingForward.copy(faceTarget);
      return;
    }
    facingForward.addScaledVector(surfaceNormal, -facingForward.dot(surfaceNormal)).normalize();
    const dot = THREE.MathUtils.clamp(facingForward.dot(faceTarget), -1, 1);
    const angle = Math.acos(dot);
    if (angle < 1e-5) {
      facingForward.copy(faceTarget);
      return;
    }
    faceTurnAxis.crossVectors(facingForward, faceTarget);
    if (faceTurnAxis.lengthSq() < 1e-10) {
      facingForward.copy(faceTarget);
      return;
    }
    faceTurnAxis.normalize();
    const maxStep = THREE.MathUtils.degToRad(settings.turnDegreesPerSecond) * deltaTime;
    facingForward.applyAxisAngle(faceTurnAxis, Math.min(angle, maxStep));
    facingForward.addScaledVector(surfaceNormal, -facingForward.dot(surfaceNormal)).normalize();
  }

  function applyPlacement() {
    anchor.position.copy(surfaceNormal).multiplyScalar(groundRadius - settings.sink);
    if (facingForward.lengthSq() < 1e-8) {
      syncFaceTargetFromBearing();
      facingForward.copy(faceTarget);
    }
    placeForward.copy(facingForward).addScaledVector(surfaceNormal, -facingForward.dot(surfaceNormal));
    if (placeForward.lengthSq() < 1e-8) tangentFromBearing(surfaceNormal, bearing, placeForward);
    if (placeForward.lengthSq() < 1e-8) return;
    placeForward.normalize();
    // 右手系：X = n × f、Y = n、Z = f（X × Y = Z）→ anchor 的 local +Z 就是鼻頭／前進方向。
    // 舊版用 (f × n, n, -f') 會變成 determinant = -1 的「鏡射」矩陣，
    // setFromRotationMatrix 算不出正確四元數，小豬身體會歪、鼻頭也不會對準行進方向。
    placeEast.crossVectors(surfaceNormal, placeForward);
    if (placeEast.lengthSq() < 1e-8) return;
    placeEast.normalize();
    placeForward.crossVectors(placeEast, surfaceNormal).normalize();
    basis.makeBasis(placeEast, surfaceNormal, placeForward);
    anchor.quaternion.setFromRotationMatrix(basis);
  }

  /**
   * 讓模型鼻頭對齊 anchor 的前進方向（local +Z，見 applyPlacement）。
   * pig.glb 匯出時已是 Y 朝上（export_yup），Blender 的正面 -Y 會變成 glTF 的 +Z，
   * 剛好和 anchor 前進方向一致，不需要再翻；舊版繞 X 轉 -90° 會讓小豬鼻子朝天、立起來走。
   * modelYawOffsetDegrees 只留給之後換模型時微調。
   */
  function applyModelYaw(root: THREE.Object3D) {
    root.rotation.set(0, THREE.MathUtils.degToRad(settings.modelYawOffsetDegrees), 0);
  }

  function fitModel(root: THREE.Object3D) {
    applyModelYaw(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    modelBaseScale = settings.modelSize / Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(modelBaseScale);
    root.position.set(-center.x * modelBaseScale, -box.min.y * modelBaseScale, -center.z * modelBaseScale);
    builtModelSize = settings.modelSize;
  }

  function enhanceMaterials(root: THREE.Object3D) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.renderOrder = 6;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('color' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.color.setHex(0xf5a8c8);
        if ('emissive' in m) {
          m.emissive.setHex(0xf090b0);
          m.emissiveIntensity = 0.28;
        }
        if ('metalness' in m) m.metalness = 0;
        if ('roughness' in m) m.roughness = Math.min(0.55, m.roughness || 0.42);
        if (envMap && 'envMap' in m) {
          m.envMap = envMap;
          m.envMapIntensity = 0.22;
        }
      }
    });
  }

  function azimuthTowardCamera() {
    if (!camera) return settings.azimuthDegrees;
    probe.copy(camera.position).addScaledVector(up, -probe.dot(up));
    if (probe.lengthSq() < 1e-5) return settings.azimuthDegrees;
    probe.normalize();
    return Math.round(THREE.MathUtils.radToDeg(Math.atan2(probe.dot(side), probe.dot(front))));
  }

  /** 出生在鏡頭大致朝向的半球；避開障礙 */
  function spawnFacingCamera() {
    const colat = settings.angleFromTopDegrees;
    let az = azimuthTowardCamera();
    settings.azimuthDegrees = az;
    const offsets = [0, 18, -18, 32, -32, 50, -50, 90, -90];
    for (const delta of offsets) {
      normalFromAngles(colat, az + delta);
      refreshObstacles();
      if (!isBlocked(surfaceNormal, true)) {
        settings.azimuthDegrees = az + delta;
        bearing = bearingTowardCamera(surfaceNormal) + (Math.random() - 0.5) * 0.5;
        syncFaceTargetFromBearing();
        facingForward.copy(faceTarget);
        return;
      }
    }
    normalFromAngles(colat, az);
    bearing = bearingTowardCamera(surfaceNormal) + (Math.random() - 0.5) * 0.5;
    syncFaceTargetFromBearing();
    facingForward.copy(faceTarget);
  }

  function resetSurfaceFromSettings() {
    if (camera) spawnFacingCamera();
    else {
      normalFromAngles(settings.angleFromTopDegrees, settings.azimuthDegrees);
      bearing = Math.random() * Math.PI * 2;
      syncFaceTargetFromBearing();
      facingForward.copy(faceTarget);
    }
  }

  /** 只沿目前鼻頭方向在球面上走一步 */
  function tryAdvance(stepRad: number) {
    if (facingForward.lengthSq() < 1e-8) return false;
    // 記住「還沒轉完的角度」：bearing 是相對當地 east/north 的角度，移動後座標系會變，
    // 只能以鼻頭為基準重算；若直接 bearing = 鼻向，轉向目標每幀都被清掉，小豬就只會直走。
    // （要在 rotateAlong 之前算：兩者共用 probe 暫存向量）
    const pendingTurn = wrapAngle(bearing - facingBearing());

    tangentFromFacing(probe2);
    if (probe2.lengthSq() < 1e-8) return false;

    const next = rotateAlong(surfaceNormal, probe2, stepRad);
    if (!isBlocked(next)) {
      surfaceNormal.copy(next);
      syncBearingFromFacing();
      bearing += pendingTurn;
      return true;
    }

    const steerAngles = [0.5, -0.5, 0.95, -0.95, 1.45, -1.45];
    const col = colatitudeFromNormal(surfaceNormal);
    if (col >= settings.roamColatitudeMax - 2) {
      steerAngles.unshift(-0.85, -1.25);
    }
    for (const delta of steerAngles) {
      tangentFromBearing(surfaceNormal, bearing + delta, probe2);
      const probeNext = rotateAlong(surfaceNormal, probe2, stepRad);
      if (!isBlocked(probeNext)) {
        bearing += delta;
        return false;
      }
    }
    bearing += (Math.random() - 0.5) * 1.4;
    return false;
  }

  resetSurfaceFromSettings();

  loadGltfOnce(PIG_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        model = cloneGltfInstance(gltf.scene);
        fitModel(model);
        enhanceMaterials(model);
        anchor.add(model);
        applyPlacement();
      });
    })
    .catch((error) => console.error(`[pig] 載入失敗：${PIG_URL}`, error));

  applyPlacement();

  function applySettings() {
    if (model) {
      if (builtModelSize !== settings.modelSize) fitModel(model);
      else {
        applyModelYaw(model);
      }
    }
    resetSurfaceFromSettings();
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
    applyPlacement();
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1);
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
  }

  function update(deltaTime: number, introDone: boolean) {
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
    if (!model) return;

    const roaming = introDone && introGrow >= 0.999;
    if (!roaming) {
      model.scale.setScalar(modelBaseScale);
      syncFaceTargetFromBearing();
      facingForward.copy(faceTarget);
      applyPlacement();
      return;
    }

    refreshObstacles();

    wanderTimer -= deltaTime;
    if (wanderTimer <= 0) {
      wanderTimer = settings.wanderSeconds * (0.55 + Math.random() * 0.9);
      bearing = settings.stayInViewHemisphere && camera ?
        bearingTowardCamera(surfaceNormal) + (Math.random() - 0.5) * 1.1 :
        bearing + (Math.random() - 0.5) * 2.4;
    }

    blendFacingForward(deltaTime);

    const stepRad = THREE.MathUtils.degToRad(settings.roamSpeedDegrees) * deltaTime;
    if (stepRad > 0) {
      const moved = tryAdvance(stepRad);
      if (!moved) {
        stuckSeconds += deltaTime;
        wanderTimer = Math.min(wanderTimer, 0.2);
        if (stuckSeconds > 2.2) {
          // 卡太久就原地掉頭（身體會照轉向速度慢慢轉），不再瞬移
          bearing = facingBearing() + Math.PI + (Math.random() - 0.5) * 0.8;
          wanderTimer = settings.wanderSeconds;
          stuckSeconds = 0;
        }
      } else {
        stuckSeconds = 0;
      }
    }

    applyPlacement();

    waddlePhase += deltaTime * 11.5;
    const wobble = settings.waddleStrength * Math.sin(waddlePhase);
    const sway = settings.waddleStrength * 0.65 * Math.sin(waddlePhase * 0.5 + 0.8);
    wobbleScale.set(1 + sway * 0.35, 1 + wobble, 1 - sway * 0.25);
    model.scale.set(
      modelBaseScale * wobbleScale.x,
      modelBaseScale * wobbleScale.y,
      modelBaseScale * wobbleScale.z,
    );
  }

  return {
    object: anchor,
    settings,
    applySettings,
    setIntroGrow,
    update,
    getNormal: () => surfaceNormal.clone(),
  };
}

/** 調完面板後可貼回 pig.ts 的 PIG_LAYOUT_DEFAULT */
export function formatPigSettingsForPaste(settings: PigSettings) {
  return (
    `// 貼到 src/world/objects/pig.ts\n` +
    `export const PIG_LAYOUT_DEFAULT: PigSettings = {\n` +
    `  angleFromTopDegrees: ${settings.angleFromTopDegrees},\n` +
    `  azimuthDegrees: ${settings.azimuthDegrees},\n` +
    `  sink: ${settings.sink.toFixed(4)},\n` +
    `  placementScale: ${settings.placementScale.toFixed(2)},\n` +
    `  modelSize: ${settings.modelSize.toFixed(3)},\n` +
    `  roamSpeedDegrees: ${settings.roamSpeedDegrees.toFixed(1)},\n` +
    `  roamColatitudeMin: ${settings.roamColatitudeMin},\n` +
    `  roamColatitudeMax: ${settings.roamColatitudeMax},\n` +
    `  wanderSeconds: ${settings.wanderSeconds.toFixed(1)},\n` +
    `  waddleStrength: ${settings.waddleStrength.toFixed(2)},\n` +
    `  obstacleMarginDegrees: ${settings.obstacleMarginDegrees.toFixed(1)},\n` +
    `  stayInViewHemisphere: ${settings.stayInViewHemisphere},\n` +
    `  viewHemisphereDotMin: ${settings.viewHemisphereDotMin.toFixed(2)},\n` +
    `  turnDegreesPerSecond: ${settings.turnDegreesPerSecond.toFixed(0)},\n` +
    `  modelYawOffsetDegrees: ${settings.modelYawOffsetDegrees.toFixed(0)},\n` +
    `};`
  );
}