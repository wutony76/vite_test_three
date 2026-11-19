import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { cloneGltfInstance, loadGltfOnce, scheduleGltfMount } from './sharedGltf';
import { createPigCloud } from './pigCloud';
import { createPigRig } from './pigRig';
import { createPigTint } from './pigTint';
import { createPigCoinShine } from './pigCoinShine';

/**
 * 小豬模型。第二版（pig_v2）的腳、耳朵、尾巴是獨立節點，會走路擺腿、尾巴上的小花跟著搖。
 * 想換回第一版：改成 `models/pig/pig.glb`（沒有獨立節點，rig 會自動略過，只剩整隻搖晃）。
 */
const PIG_URL = `${import.meta.env.BASE_URL}models/pig_v2/pig_v2.glb`;

const direction = new THREE.Vector3();
const probe = new THREE.Vector3();
const probe2 = new THREE.Vector3();
const east = new THREE.Vector3();
const north = new THREE.Vector3();
const moveDir = new THREE.Vector3();
const axis = new THREE.Vector3();
const stepQuat = new THREE.Quaternion();
const wobbleScale = new THREE.Vector3(1, 1, 1);
const obstacleCenter = new THREE.Vector3();
const obstacleCorner = new THREE.Vector3();
const groundInverse = new THREE.Matrix4();
const meshToGround = new THREE.Matrix4();
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
  /** 和番茄醬緞帶上緣保持的距離（度）；緞帶以下會被醬擋住、甚至看不到綠球 */
  ribbonMarginDegrees: number;
  /** 走動時屁股後面冒煙 */
  smokeEnabled: boolean;
  /** 每秒冒幾團煙 */
  smokeRate: number;
  /** 煙團大小倍率（以小豬身長為基準） */
  smokeSize: number;
  /** 每團煙存活秒數 */
  smokeLifeSeconds: number;
  /** 往前「看」多遠（度）：前方會撞到東西／醬就提早邊走邊轉，不用停下來原地轉 */
  lookAheadDegrees: number;
  /** 經過物件時停下來的機率（0～1），每經過一個物件擲一次 */
  pauseChance: number;
  pauseMinSeconds: number;
  pauseMaxSeconds: number;
  /** 離物件避障邊界多近（度）算「經過」 */
  pauseNearDegrees: number;
  /** 每次隨機換方向時，決定「跑去篝火看烤雞」的機率（0～1） */
  visitChance: number;
  /** 走到篝火旁後，停下來看烤雞幾秒（最短～最長） */
  visitWatchMinSeconds: number;
  visitWatchMaxSeconds: number;
  /** 看完之後至少隔幾秒才會再想去 */
  visitCooldownSeconds: number;
  /** 小豬身體顏色（只換粉紅色系的部位；金幣、櫻花、黃花不變），見 pigTint.ts */
  bodyColor: string;
};

export const PIG_LAYOUT_DEFAULT: PigSettings = {
  angleFromTopDegrees: 38,
  azimuthDegrees: 0,
  sink: 0.004,
  placementScale: 0.3,
  modelSize: 0.19,
  roamSpeedDegrees: 4,
  roamColatitudeMin: 12,
  /** 超過會滑到綠球下緣以下；背面／側面仍可跑 */
  roamColatitudeMax: 62,
  wanderSeconds: 3.5,
  waddleStrength: 0.11,
  obstacleMarginDegrees: 1,
  stayInViewHemisphere: false,
  viewHemisphereDotMin: 0.1,
  turnDegreesPerSecond: 140,
  modelYawOffsetDegrees: 0,
  ribbonMarginDegrees: 2,
  smokeEnabled: true,
  smokeRate: 4,
  smokeSize: 0.85,
  smokeLifeSeconds: 0.6,
  lookAheadDegrees: 7,
  pauseChance: 0.35,
  pauseMinSeconds: 0.8,
  pauseMaxSeconds: 2,
  pauseNearDegrees: 3,
  visitChance: 0.2,
  visitWatchMinSeconds: 3,
  visitWatchMaxSeconds: 6,
  visitCooldownSeconds: 15,
  // 原本是 '#efbdc9'，但舊版換色把顏色算深了；'#dc8295' 是修正後畫面上看起來一樣的值
  bodyColor: '#dc8295',
};

/**
 * 煙團共用一份幾何（20 面體、無細分 = low poly 小石頭感），
 * 每團各自一份材質，因為要各自淡出（opacity 是材質屬性，共用的話會一起變透明）。
 */
const SMOKE_POOL_SIZE = 24;
const smokeGeometry = new THREE.IcosahedronGeometry(1, 0);
const smokeSpawn = new THREE.Vector3();
const smokeDrift = new THREE.Vector3();

type SmokePuff = {
  mesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshStandardMaterial>;
  age: number;
  life: number;
  baseSize: number;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
};

type PigObstacle = { root: THREE.Object3D; normal: THREE.Vector3; clearanceRad: number };

/**
 * 外部下的「走到某處」指令（例如走到龍兔的家大門、跑去撿魚排）。
 * 走路、避障沿用平常那套；只是目標由外部給、走到了／放棄了會回呼。
 */
export type PigGoToOptions = {
  /** 目標的地表方向（綠球座標）；回傳 null = 目標不見了（例如魚排被收走），指令失敗 */
  getTarget: () => THREE.Vector3 | null;
  /** 離目標多近（弧度）算走到 */
  arriveRad: number;
  /** 快走到時，探路不把這個物件當障礙（例如目標就在房子門口，不然永遠覺得前面被房子擋住、一直繞） */
  ignoreRoot?: THREE.Object3D | null;
  /** 允許走到「離頂端太近」的地方（平常小豬不會走進頂端 roamColatitudeMin 以內，龍兔的家門口就在那裡） */
  allowNearTop?: boolean;
  /** 最多走幾秒；不給就依距離估（直線所需秒數 ×3 ＋ 8） */
  timeoutSeconds?: number;
  onDone: (arrived: boolean) => void;
};

type CreatePigOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  camera?: THREE.Camera;
  envMap?: THREE.Texture;
  layout?: PigSettings;
  getObstacleRoots: () => readonly THREE.Object3D[];
  /**
   * 番茄醬緞帶「上緣」離頂端（up）幾度；null = 沒有緞帶。
   * 每幀重算，所以在畫面上拖動緞帶後，小豬的活動範圍也會跟著變。
   */
  getRibbonTopColatitude?: () => number | null;
  /**
   * 小豬偶爾會想去的地方（綠球座標的地表法線，例如篝火）；null = 目前沒有（篝火關掉、沒烤雞）。
   * 每次要用時才問，所以篝火被拖到別的位置，小豬會跑去新位置。
   */
  getVisitTarget?: () => THREE.Vector3 | null;
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
  getRibbonTopColatitude,
  getVisitTarget,
}: CreatePigOptions) {
  const settings: PigSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'world_pig';
  let model: THREE.Object3D | null = null;
  let rig: ReturnType<typeof createPigRig> = null;
  let tint: ReturnType<typeof createPigTint> = null;
  let coinShine: ReturnType<typeof createPigCoinShine> = null;
  let modelBaseScale = 1;
  let introGrow = 1;
  let waddlePhase = 0;
  let wanderTimer = settings.wanderSeconds * 0.4;
  let builtModelSize = settings.modelSize;
  /** 想去的方向（球面 bearing）；身體會先轉頭再只沿鼻頭走 */
  let bearing = Math.random() * Math.PI * 2;
  let surfaceNormal = new THREE.Vector3();
  let stuckSeconds = 0;
  let smokeTimer = 0;
  /** 停下來看東西還剩幾秒；> 0 時不走、不冒煙、不搖晃 */
  let pauseRemaining = 0;
  /** 停完之後至少要走幾秒才能再停，避免一直停停走走 */
  let pauseCooldown = 0;
  /** 停下時要看的物件方向（球面法線） */
  const pauseLookAt = new THREE.Vector3();
  /** 上一幀「在旁邊」的物件：只有剛靠近的那一刻擲骰子，不然每幀擲一次幾乎必停 */
  let nearObstacles = new Set<THREE.Object3D>();
  /** 搖晃幅度（0～1）：停下時漸漸收掉，起步再漸漸回來，不會突然定格 */
  let waddleAmount = 1;
  /** 原地轉不過去時暫時加快轉身（倍率），走路中轉彎維持 1 */
  let turnBoost = 1;
  const lookTangent = new THREE.Vector3();
  const lookPoint = new THREE.Vector3();
  /** 實際可跑到的最大離頂端角度（度）：取面板上限與「緞帶上緣 − 身長 − 餘量」較小者 */
  let effectiveColatMax = settings.roamColatitudeMax;
  /** 正在「前往篝火」：遊走亂數暫停，改成每隔一下重新瞄準目標 */
  let visiting = false;
  /** 前往途中最多走幾秒，超過就放棄（例如被房子擋住繞不過去），避免永遠卡在半路 */
  let visitGiveUp = 0;
  /** 多久重新瞄準一次：每幀都瞄準的話，避障剛轉開又被拉回來，會一直在障礙物前抖 */
  let visitAimTimer = 0;
  let visitCooldown = 0;
  const visitTarget = new THREE.Vector3();

  /** 外部下的「走到某處」指令；進行中時不會自己去篝火、不會路邊停下 */
  let command: (PigGoToOptions & { giveUp: number; aimTimer: number }) | null = null;
  const commandTarget = new THREE.Vector3();
  /**
   * 操偶模式：小豬不自己走，位置、方向、大小每格由外部指定（進門、溜滑梯、跳上岸）。
   * puppetScale 乘在原本的大小上（0 = 藏起來）；puppetWaddle = 腳步擺動（0 = 坐著不動）
   */
  /** isWalkable 檢查「頂端附近的點」時暫時放寬頂端限制（例如龍兔的家大門口） */
  let allowNearTopCheck = false;

  /**
   * 測試用：原地繞圈圈。開啟時以「小豬右手邊 radius 度」為圓心，沿圓周一直繞；
   * 走路速度、腳步、搖晃都跟平常一樣，只是不避障、不會自己去篝火或停下來看東西（測試時才好觀察雲、點心雨）。
   */
  let circling = false;
  const circle = { radiusDegrees: 3, clockwise: false };
  const circleCenter = new THREE.Vector3();
  /** 圓心看出去，小豬在哪個方向（圓心當地 east/north 的 bearing） */
  let circleAngle = 0;
  const circleNext = new THREE.Vector3();

  let puppet = false;
  let puppetScale = 1;
  let puppetWaddle = 0;

  /**
   * 煙不能掛在 anchor 底下：anchor 會跟著小豬移動，煙就會黏在屁股上一起跑。
   * 改掛在 anchor 的父節點（綠球 ground）→ 煙留在原地、小豬跑走，才有「拖尾」感。
   */
  // 頭上的烏雲掛在 anchor 底下（跟煙相反）：雲要跟著小豬走，而不是留在原地
  // body 長度用 modelSize：fitModel 會把模型最長邊縮成 modelSize（anchor 的 local 單位）
  const cloud = createPigCloud({ getBodyLength: () => settings.modelSize });
  anchor.add(cloud.object);

  const smokeGroup = new THREE.Group();
  smokeGroup.name = 'world_pig_smoke';
  const smokePuffs: SmokePuff[] = [];
  for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xf4ece4,
      emissiveIntensity: 0.35,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      transparent: true,
      // 半透明物體不寫深度，避免煙團互相「挖洞」
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(smokeGeometry, material);
    mesh.visible = false;
    mesh.renderOrder = 7;
    smokeGroup.add(mesh);
    smokePuffs.push({ mesh, age: 0, life: 1, baseSize: 0, velocity: new THREE.Vector3(), spin: new THREE.Vector3() });
  }
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

  /**
   * 避障用的小豬「半徑」（球面角度）：約半個身長。
   * 以前直接用整個身長當半徑，等於小豬胖了一倍，房子之間的縫就鑽不過去。
   */
  function pigBodyRadiusRad() {
    return pigFootprintRad() * 0.55;
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
    // tangentBasis 內部會借用 probe 暫存，一定要先呼叫，再算 probe；順序反了 probe 會被蓋掉、方向亂掉
    tangentBasis(n);
    probe2.copy(camera.position).normalize();
    probe.copy(probe2).addScaledVector(n, -probe2.dot(n));
    if (probe.lengthSq() < 1e-8) return bearing;
    probe.normalize();
    return Math.atan2(probe.dot(north), probe.dot(east));
  }

  /**
   * checkView 只在挑出生點時開：跑動中若把「鏡頭背面」也當障礙，
   * 一轉動場景小豬就會整片被擋住 → 卡住 → 觸發重生，看起來就是一直閃現回畫面。
   */
  function isBlocked(n: THREE.Vector3, checkView = false, from?: THREE.Vector3) {
    if (checkView && !isVisibleHemisphere(n)) return true;
    const col = colatitudeFromNormal(n);
    // 走去龍兔的家大門時，門口在頂端附近：暫時不限制「離頂端至少幾度」
    const minCol = command?.allowNearTop || allowNearTopCheck ? 0 : settings.roamColatitudeMin;
    if (col < minCol) return true;
    if (col > effectiveColatMax) {
      // 已經在界外（例如剛把緞帶拖高）：允許「往頂端走」的步伐，不然會被困在醬底下動不了
      if (!from || col >= colatitudeFromNormal(from)) return true;
    }
    const footprint = pigBodyRadiusRad();
    for (const obstacle of obstacleScratch) {
      if (obstacle === ignoredObstacle) continue;
      if (angularDistance(n, obstacle.normal) < footprint + obstacle.clearanceRad) return true;
    }
    return false;
  }

  /**
   * 「往前看」時暫時不把某個障礙算進去（例如正要走去的篝火）。
   * 只用在探路；真正走下一步時不忽略，所以小豬還是不會撞進篝火裡。
   */
  let ignoredObstacle: PigObstacle | null = null;
  function isPathFreeIgnoring(obstacle: PigObstacle | null, bearingRad: number, lookRad: number) {
    ignoredObstacle = obstacle;
    try {
      return isPathFree(bearingRad, lookRad);
    } finally {
      ignoredObstacle = null;
    }
  }

  function rotateAlong(n: THREE.Vector3, tangent: THREE.Vector3, stepRad: number, target = probe) {
    axis.crossVectors(n, tangent);
    if (axis.lengthSq() < 1e-10) return n.clone();
    axis.normalize();
    stepQuat.setFromAxisAngle(axis, stepRad);
    return target.copy(n).applyQuaternion(stepQuat).normalize();
  }

  function refreshRoamLimit() {
    effectiveColatMax = settings.roamColatitudeMax;
    const ribbonTop = getRibbonTopColatitude?.();
    if (ribbonTop == null || !Number.isFinite(ribbonTop)) return;
    // 小豬的中心要再往上退「半個身長」，屁股／鼻子才不會伸進醬裡
    const halfBodyDeg = THREE.MathUtils.radToDeg(pigFootprintRad()) * 0.5;
    const limit = ribbonTop - halfBodyDeg - settings.ribbonMarginDegrees;
    effectiveColatMax = Math.min(effectiveColatMax, Math.max(settings.roamColatitudeMin + 1, limit));
  }

  /** 沿球面切線朝向某個方向（例如頂端、某個物件）的 bearing */
  function bearingTowardDirection(n: THREE.Vector3, dir: THREE.Vector3) {
    tangentBasis(n); // 先算座標系（會借用 probe），再算方向
    probe.copy(dir).addScaledVector(n, -dir.dot(n));
    if (probe.lengthSq() < 1e-8) return bearing;
    probe.normalize();
    return Math.atan2(probe.dot(north), probe.dot(east));
  }

  function bearingTowardTop(n: THREE.Vector3) {
    return bearingTowardDirection(n, up);
  }

  /**
   * 物件「貼在地上」佔多大：把每個 mesh 包圍盒的 8 個角投影到物件所在的地表切平面，取離中心最遠的距離。
   * 以前用整個包圍盒最長邊（連房子的「高度」也算進去），高樓會被當成超大圓，房子之間全被堵死。
   * 投影掉高度後，只剩真正的佔地範圍，小豬就能從房子之間的縫穿過去。
   */
  function groundFootprintRadius(root: THREE.Object3D, center: THREE.Vector3, normal: THREE.Vector3) {
    let maxTangent = 0;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
      const geometry = mesh.geometry;
      // InstancedMesh（例如水潭的岸邊石頭）：要用「所有 instance 合起來」的包圍盒。
      // 只看 geometry 的話是單一顆的原始大小（半徑 1 的 20 面體），沒套上每顆的縮放，
      // 水潭會被當成半徑 1 的大圓（實測避障範圍 51°，小豬幾乎半顆球都走不過去）
      const instanced = mesh as THREE.InstancedMesh;
      let bb: THREE.Box3 | null;
      if (instanced.isInstancedMesh) {
        instanced.computeBoundingBox();
        bb = instanced.boundingBox;
      } else {
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        bb = geometry.boundingBox;
      }
      if (!bb || bb.isEmpty()) return;
      meshToGround.multiplyMatrices(groundInverse, mesh.matrixWorld);
      for (let k = 0; k < 8; k++) {
        obstacleCorner
          .set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z)
          .applyMatrix4(meshToGround)
          .sub(center);
        // 去掉沿法線（高度）的分量，只留貼地面的水平距離
        obstacleCorner.addScaledVector(normal, -obstacleCorner.dot(normal));
        maxTangent = Math.max(maxTangent, obstacleCorner.length());
      }
    });
    return maxTangent;
  }

  function refreshObstacles() {
    refreshRoamLimit();
    obstacleScratch.length = 0;
    const margin = THREE.MathUtils.degToRad(settings.obstacleMarginDegrees);
    const roots = getObstacleRoots();
    // 全部換到「綠球座標」算：小豬的 surfaceNormal 就是這個座標系，球如果有位移也不會對不上
    const ground = anchor.parent;
    if (ground) {
      ground.updateMatrixWorld(true);
      groundInverse.copy(ground.matrixWorld).invert();
    } else {
      groundInverse.identity();
    }
    for (const root of roots) {
      if (!root || root === anchor) continue;
      root.updateMatrixWorld(true);
      root.getWorldPosition(obstacleCenter).applyMatrix4(groundInverse);
      const centerDist = obstacleCenter.length();
      if (centerDist < 0.2) continue;
      const normal = obstacleCenter.clone().divideScalar(centerDist);
      const radius = groundFootprintRadius(root, obstacleCenter, normal);
      const clearance = Math.atan(radius / centerDist) + margin;
      obstacleScratch.push({ root, normal, clearanceRad: clearance });
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
    const maxStep = THREE.MathUtils.degToRad(settings.turnDegreesPerSecond * turnBoost) * deltaTime;
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

  /**
   * 平滑著色：Low Poly 匯出時每個面各自一組頂點（法線、vertex color 每面固定），所以看起來一格一格。
   * 存錢筒要「上釉陶瓷」的滑順感：把同位置的頂點合併、重算法線，光影就會在面與面之間連續漸變。
   *   - 先拿掉 normal 和 color：它們每面不同，不拿掉 mergeVertices 會認為頂點不一樣而不合併
   *   - uv 保留：身體和豬鼻、腿和蹄的 uv 不同，那條交界不會被合併，正好留下清楚的折邊
   *   - 材質要複製一份並關掉 vertexColors：沒有 color 屬性卻開著 vertexColors，WebGL 會讀到 (0,0,0) → 全黑
   */
  function smoothShade(root: THREE.Object3D) {
    const smoothMaterials = new Map<THREE.Material, THREE.Material>();
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !/_(body|leg_\w+|tail)$/.test(mesh.name)) return;
      const geometry = mesh.geometry.clone();
      geometry.deleteAttribute('normal');
      geometry.deleteAttribute('color');
      const merged = mergeVertices(geometry, 1e-4);
      merged.computeVertexNormals();
      mesh.geometry = merged;
      const source = mesh.material as THREE.MeshStandardMaterial;
      let smooth = smoothMaterials.get(source);
      if (!smooth) {
        const copy = source.clone();
        copy.vertexColors = false;
        copy.flatShading = false;
        smoothMaterials.set(source, copy);
        smooth = copy;
      }
      mesh.material = smooth;
    });
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
        // 不再把顏色蓋成粉紅：pig_v2 的鼻子、蹄、金幣、櫻花、黃色小花都在貼圖裡，蓋掉就全變同一色了。
        // 也不加白色自發光：emissive 白 × 貼圖會把紅色洗成粉白，存錢筒就沒有「亮紅陶瓷」的感覺。
        if ('emissive' in m) m.emissiveIntensity = 0;
        if ('metalness' in m) m.metalness = Math.min(m.metalness, 0.6);
        if (envMap && 'envMap' in m) {
          m.envMap = envMap;
          // 亮面反光：存錢筒是上釉的陶瓷，環境反射強一點才有光澤；半透明的肚子窗再更亮，像玻璃
          m.envMapIntensity = m.transparent ? 0.9 : 0.55;
        }
        // 半透明窗不寫深度：不然窗後面的金幣會被窗「擋掉」畫不出來
        if (m.transparent) {
          m.depthWrite = false;
          mesh.castShadow = false; // 玻璃不該投出實心的影子
        }
        m.needsUpdate = true;
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
    refreshRoamLimit();
    // 出生點也不能在醬底下
    const colat = Math.min(settings.angleFromTopDegrees, effectiveColatMax - 2);
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

  /** 小豬目前在世界中的身長（含整體縮放與入場縮放） */
  function pigBodyLength() {
    return settings.modelSize * settings.placementScale * Math.max(0.0001, introGrow);
  }

  function emitSmokePuff() {
    const puff = smokePuffs.find((p) => !p.mesh.visible);
    if (!puff) return;
    const length = pigBodyLength();
    tangentFromFacing(probe2);
    // 出生點：屁股後方一點、貼近地面，左右隨機偏一點才不會排成一直線
    placeEast.crossVectors(surfaceNormal, probe2).normalize();
    smokeSpawn
      .copy(anchor.position)
      .addScaledVector(probe2, -length * 0.55)
      .addScaledVector(surfaceNormal, length * 0.12)
      .addScaledVector(placeEast, (Math.random() - 0.5) * length * 0.3);
    puff.mesh.position.copy(smokeSpawn);
    puff.mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    // 往上飄、往後退、左右散開
    puff.velocity
      .copy(surfaceNormal)
      .multiplyScalar(length * (0.55 + Math.random() * 0.35))
      .addScaledVector(probe2, -length * 0.35)
      .addScaledVector(placeEast, (Math.random() - 0.5) * length * 0.5);
    puff.spin.set((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);
    puff.age = 0;
    puff.life = settings.smokeLifeSeconds * (0.8 + Math.random() * 0.4);
    puff.baseSize = length * 0.11 * settings.smokeSize * (0.8 + Math.random() * 0.4);
    puff.mesh.scale.setScalar(puff.baseSize * 0.4);
    puff.mesh.material.opacity = 0.85;
    puff.mesh.visible = true;
  }

  function updateSmoke(deltaTime: number, moving: boolean) {
    if (!smokeGroup.parent && anchor.parent) anchor.parent.add(smokeGroup);

    if (moving && settings.smokeEnabled && settings.smokeRate > 0) {
      smokeTimer -= deltaTime;
      const interval = 1 / settings.smokeRate;
      while (smokeTimer <= 0) {
        emitSmokePuff();
        smokeTimer += interval * (0.7 + Math.random() * 0.6);
      }
    } else {
      // 停下來時歸零，下次一起步就馬上冒第一團
      smokeTimer = 0;
    }

    for (const puff of smokePuffs) {
      if (!puff.mesh.visible) continue;
      puff.age += deltaTime;
      const t = puff.age / puff.life;
      if (t >= 1) {
        puff.mesh.visible = false;
        continue;
      }
      // 越飄越慢（阻力），先快速膨脹再緩慢變大，最後淡出
      smokeDrift.copy(puff.velocity).multiplyScalar(deltaTime * (1 - t * 0.7));
      puff.mesh.position.add(smokeDrift);
      puff.mesh.rotation.x += puff.spin.x * deltaTime;
      puff.mesh.rotation.y += puff.spin.y * deltaTime;
      puff.mesh.rotation.z += puff.spin.z * deltaTime;
      const grow = 0.4 + 0.9 * (1 - (1 - t) * (1 - t));
      puff.mesh.scale.setScalar(puff.baseSize * grow);
      puff.mesh.material.opacity = 0.85 * (1 - t * t);
    }
  }

  /** 從目前位置往 bearingRad 方向看 lookRad 遠，路上（中點＋終點）有沒有被擋 */
  function isPathFree(bearingRad: number, lookRad: number) {
    tangentFromBearing(surfaceNormal, bearingRad, lookTangent);
    for (const k of [0.5, 1]) {
      rotateAlong(surfaceNormal, lookTangent, lookRad * k, lookPoint);
      if (isBlocked(lookPoint, false, surfaceNormal)) return false;
    }
    return true;
  }

  /**
   * 挑一個「前方走得通」的方向：從鼻頭目前方向開始，左右交替越轉越大，
   * 先試哪一邊每次隨機，不然小豬永遠只往同一邊繞。找不到就回傳 null。
   */
  function findFreeBearing(lookRad: number) {
    const base = facingBearing();
    const col = colatitudeFromNormal(surfaceNormal);
    // 靠近醬邊界時，優先往頂端轉（往上一定走得回來）
    if (col >= effectiveColatMax - 3) {
      const top = bearingTowardTop(surfaceNormal) + (Math.random() - 0.5) * 0.9;
      if (isPathFree(top, lookRad)) return top;
    }
    const side = Math.random() < 0.5 ? 1 : -1;
    for (const delta of [0.35, 0.7, 1.05, 1.4, 1.8, 2.3, 2.8]) {
      for (const sign of [side, -side]) {
        const candidate = base + delta * sign;
        if (isPathFree(candidate, lookRad)) return candidate;
      }
    }
    return null;
  }

  /**
   * 只沿目前鼻頭方向在球面上走一步。
   * 走得動時順便往前看：前方快撞到就先把目標轉開 → 邊走邊轉彎，不用停下來原地轉。
   */
  function tryAdvance(stepRad: number) {
    turnBoost = 1;
    if (facingForward.lengthSq() < 1e-8) return false;
    // 記住「還沒轉完的角度」：bearing 是相對當地 east/north 的角度，移動後座標系會變，
    // 只能以鼻頭為基準重算；若直接 bearing = 鼻向，轉向目標每幀都被清掉，小豬就只會直走。
    // （要在 rotateAlong 之前算：兩者共用 probe 暫存向量）
    const pendingTurn = wrapAngle(bearing - facingBearing());

    tangentFromFacing(probe2);
    if (probe2.lengthSq() < 1e-8) return false;

    const lookRad = THREE.MathUtils.degToRad(settings.lookAheadDegrees);
    const next = rotateAlong(surfaceNormal, probe2, stepRad);
    if (!isBlocked(next, false, surfaceNormal)) {
      surfaceNormal.copy(next);
      syncBearingFromFacing();
      bearing += pendingTurn;
      // 目前想去的方向前面被擋 → 換一個走得通的方向（只有被擋才換，避免每幀亂抖）
      // 快走到篝火時：前面只被篝火本身擋住不算擋（不然永遠走不到），被其他東西擋住才繞
      const ignore = isApproachingVisitTarget()
        ? visitTargetObstacle()
        : isApproachingCommandTarget()
          ? commandIgnoreObstacle()
          : null;
      if (!isPathFreeIgnoring(ignore, bearing, lookRad)) {
        const free = findFreeBearing(lookRad);
        if (free !== null) bearing = free;
      }
      return true;
    }

    // 連下一步都走不動（已經貼著障礙）：挑方向後加快轉身，盡快轉開繼續走
    const free = findFreeBearing(Math.max(stepRad * 2, lookRad * 0.5));
    bearing = free ?? facingBearing() + Math.PI + (Math.random() - 0.5) * 0.8;
    turnBoost = 2.5;
    return false;
  }

  /** 開始繞圈：圓心放在小豬右手邊 radius 度的地方，小豬一開始就站在圓周上、鼻頭剛好沿著圓周 */
  function startCircle() {
    const rRad = THREE.MathUtils.degToRad(Math.max(0.3, circle.radiusDegrees));
    tangentFromFacing(probe2);
    if (probe2.lengthSq() < 1e-8) tangentFromBearing(surfaceNormal, bearing, probe2);
    // 右手邊 = 鼻頭方向 × 頭頂方向；逆時針繞（從上面看）時圓心在左手邊
    probe.crossVectors(probe2, surfaceNormal).normalize();
    if (!circle.clockwise) probe.negate();
    circleCenter.copy(rotateAlong(surfaceNormal, probe, rRad, circleNext));
    circleAngle = bearingTowardDirection(circleCenter, surfaceNormal);
    circling = true;
    pauseRemaining = 0;
    visiting = false;
  }

  /** 繞圈的一格：沿圓周往前走「跑速」那麼遠，鼻頭朝著前進方向 */
  function updateCircle(deltaTime: number) {
    const rRad = THREE.MathUtils.degToRad(Math.max(0.3, circle.radiusDegrees));
    // 角速度 = 線速度 ÷ 半徑：半徑越小繞得越快，但腳步的速度跟平常走路一樣
    const omega = settings.roamSpeedDegrees / Math.max(0.3, circle.radiusDegrees);
    circleAngle += (circle.clockwise ? -1 : 1) * omega * deltaTime;
    tangentFromBearing(circleCenter, circleAngle, probe);
    rotateAlong(circleCenter, probe, rRad, circleNext);
    // 鼻頭方向 = 這一格移動的方向（投影到地表切平面）
    facingForward.subVectors(circleNext, surfaceNormal);
    surfaceNormal.copy(circleNext);
    facingForward.addScaledVector(surfaceNormal, -facingForward.dot(surfaceNormal));
    if (facingForward.lengthSq() > 1e-12) facingForward.normalize();
    syncBearingFromFacing();
    return true;
  }

  /** 障礙清單裡代表篝火的那一個（離目標最近、2° 以內）；沒有就 null */
  function visitTargetObstacle() {
    let best: PigObstacle | null = null;
    let bestDist = THREE.MathUtils.degToRad(2);
    for (const obstacle of obstacleScratch) {
      const d = angularDistance(visitTarget, obstacle.normal);
      if (d < bestDist) {
        bestDist = d;
        best = obstacle;
      }
    }
    return best;
  }

  /** 篝火的避障半徑；找不到對應障礙就給 6° */
  function visitTargetClearance() {
    return visitTargetObstacle()?.clearanceRad ?? THREE.MathUtils.degToRad(6);
  }

  /** 離篝火邊界還有幾度（< 0 代表已經貼在旁邊） */
  function visitTargetGap() {
    return angularDistance(surfaceNormal, visitTarget) - pigBodyRadiusRad() - visitTargetClearance();
  }

  function isApproachingVisitTarget() {
    if (!visiting) return false;
    return visitTargetGap() < THREE.MathUtils.degToRad(settings.lookAheadDegrees + 2);
  }

  /** 換方向的時機到了：擲骰子決定要不要跑去看烤雞 */
  function maybeStartVisit() {
    if (visiting || visitCooldown > 0 || Math.random() >= settings.visitChance) return false;
    return startVisit();
  }

  function startVisit() {
    const target = getVisitTarget?.();
    if (!target) return false;
    visitTarget.copy(target).normalize();
    // 篝火被拖到醬底下或頂端禁區：去不了就別去
    const col = colatitudeFromNormal(visitTarget);
    if (col < settings.roamColatitudeMin || col > effectiveColatMax + 8) return false;
    visiting = true;
    // 依距離給時間：直線距離所需秒數 ×3，留餘裕繞過房子
    const distanceDeg = THREE.MathUtils.radToDeg(angularDistance(surfaceNormal, visitTarget));
    visitGiveUp = (distanceDeg / Math.max(settings.roamSpeedDegrees, 0.5)) * 3 + 8;
    visitAimTimer = 0;
    pauseRemaining = 0;
    return true;
  }

  /** 前往途中：每隔一下重新瞄準；走到旁邊就停下來看 */
  function updateVisit(deltaTime: number) {
    const target = getVisitTarget?.();
    if (!target) {
      visiting = false;
      return;
    }
    visitTarget.copy(target).normalize();
    visitGiveUp -= deltaTime;
    const nearRad = THREE.MathUtils.degToRad(Math.max(settings.pauseNearDegrees, 1.5));
    if (visitTargetGap() < nearRad) {
      visiting = false;
      const min = Math.min(settings.visitWatchMinSeconds, settings.visitWatchMaxSeconds);
      const max = Math.max(settings.visitWatchMinSeconds, settings.visitWatchMaxSeconds);
      pauseRemaining = min + Math.random() * (max - min);
      pauseCooldown = pauseRemaining + 3;
      visitCooldown = pauseRemaining + settings.visitCooldownSeconds;
      pauseLookAt.copy(visitTarget);
      return;
    }
    if (visitGiveUp <= 0) {
      visiting = false;
      visitCooldown = settings.visitCooldownSeconds * 0.5;
      return;
    }
    visitAimTimer -= deltaTime;
    // 遠的時候每 0.6 秒瞄一次，讓避障有時間繞開房子；
    // 接近時只要「直走過去只會碰到篝火」就每幀瞄準，貼得更準
    const aim = bearingTowardDirection(surfaceNormal, visitTarget);
    const lookRad = THREE.MathUtils.degToRad(settings.lookAheadDegrees);
    const directShot =
      isApproachingVisitTarget() && isPathFreeIgnoring(visitTargetObstacle(), aim, lookRad);
    if (visitAimTimer <= 0 || directShot) {
      visitAimTimer = 0.6;
      bearing = aim;
    }
    wanderTimer = settings.wanderSeconds;
  }

  /** 指令要忽略的那個障礙（例如龍兔的家本身） */
  function commandIgnoreObstacle() {
    if (!command?.ignoreRoot) return null;
    return obstacleScratch.find((obstacle) => obstacle.root === command!.ignoreRoot) ?? null;
  }

  function isApproachingCommandTarget() {
    if (!command) return false;
    return angularDistance(surfaceNormal, commandTarget) < THREE.MathUtils.degToRad(settings.lookAheadDegrees + 2);
  }

  function finishCommand(arrived: boolean) {
    const done = command;
    command = null;
    done?.onDone(arrived);
  }

  /** 下指令：走到某處。原本的指令（如果有）當作失敗結束；篝火、路邊停下都取消 */
  function startGoTo(options: PigGoToOptions) {
    if (command) finishCommand(false);
    const target = options.getTarget();
    if (!target) {
      options.onDone(false);
      return;
    }
    commandTarget.copy(target).normalize();
    visiting = false;
    pauseRemaining = 0;
    const distanceDeg = THREE.MathUtils.radToDeg(angularDistance(surfaceNormal, commandTarget));
    const giveUp = options.timeoutSeconds ?? (distanceDeg / Math.max(settings.roamSpeedDegrees, 0.5)) * 3 + 8;
    command = { ...options, giveUp, aimTimer: 0 };
  }

  /** 指令進行中：跟去篝火一樣，每隔一下重新瞄準；走到了／超時就回呼 */
  function updateCommand(deltaTime: number) {
    if (!command) return;
    const target = command.getTarget();
    if (!target) {
      finishCommand(false);
      return;
    }
    commandTarget.copy(target).normalize();
    if (angularDistance(surfaceNormal, commandTarget) < command.arriveRad) {
      finishCommand(true);
      return;
    }
    command.giveUp -= deltaTime;
    if (command.giveUp <= 0) {
      finishCommand(false);
      return;
    }
    command.aimTimer -= deltaTime;
    const aim = bearingTowardDirection(surfaceNormal, commandTarget);
    const lookRad = Math.min(
      THREE.MathUtils.degToRad(settings.lookAheadDegrees),
      angularDistance(surfaceNormal, commandTarget),
    );
    const directShot = isApproachingCommandTarget() && isPathFreeIgnoring(commandIgnoreObstacle(), aim, lookRad);
    if (command.aimTimer <= 0 || directShot) {
      command.aimTimer = 0.6;
      bearing = aim;
    }
    wanderTimer = settings.wanderSeconds;
  }

  /** 剛走到某個物件旁邊時擲骰子，中了就停下來轉頭看它一下 */
  function maybePauseNearObstacles() {
    const footprint = pigBodyRadiusRad();
    const near = THREE.MathUtils.degToRad(settings.pauseNearDegrees);
    const nowNear = new Set<THREE.Object3D>();
    let entered: PigObstacle | null = null;
    for (const obstacle of obstacleScratch) {
      if (angularDistance(surfaceNormal, obstacle.normal) < footprint + obstacle.clearanceRad + near) {
        nowNear.add(obstacle.root);
        if (!nearObstacles.has(obstacle.root)) entered = obstacle;
      }
    }
    nearObstacles = nowNear;
    // 前往篝火途中不被路邊的東西分心
    if (!entered || visiting || command || pauseCooldown > 0 || Math.random() >= settings.pauseChance) return;
    const min = Math.min(settings.pauseMinSeconds, settings.pauseMaxSeconds);
    const max = Math.max(settings.pauseMinSeconds, settings.pauseMaxSeconds);
    pauseRemaining = min + Math.random() * (max - min);
    pauseCooldown = pauseRemaining + 3;
    pauseLookAt.copy(entered.normal);
  }

  resetSurfaceFromSettings();

  loadGltfOnce(PIG_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        model = cloneGltfInstance(gltf.scene);
        smoothShade(model);
        fitModel(model);
        enhanceMaterials(model);
        rig = createPigRig(model);
        tint = createPigTint(model);
        tint?.setColor(settings.bodyColor);
        // 要在 enhanceMaterials 之後：它會把 emissive 歸零、統一 envMap 強度，金幣的發光設定得蓋在它後面
        coinShine = createPigCoinShine(model);
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

  /** 只換顏色：不像 applySettings 會讓小豬重生到鏡頭前 */
  function applyColor() {
    tint?.setColor(settings.bodyColor);
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1);
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
  }

  function update(deltaTime: number, introDone: boolean) {
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow) * (puppet ? Math.max(0.0001, puppetScale) : 1));
    if (!model) return;
    coinShine?.update(deltaTime);

    // 操偶模式：位置、方向由外部（setPuppetPose）決定，這裡只動腳、雲、煙
    if (puppet) {
      cloud.update(deltaTime, true);
      updateSmoke(deltaTime, false);
      waddlePhase += deltaTime * 11.5 * puppetWaddle;
      rig?.update(deltaTime, waddlePhase, puppetWaddle);
      model.scale.setScalar(modelBaseScale);
      return;
    }

    const roaming = introDone && introGrow >= 0.999;
    cloud.update(deltaTime, roaming);
    if (!roaming) {
      updateSmoke(deltaTime, false);
      model.scale.setScalar(modelBaseScale);
      rig?.update(deltaTime, waddlePhase, 0);
      syncFaceTargetFromBearing();
      facingForward.copy(faceTarget);
      applyPlacement();
      return;
    }

    refreshObstacles();
    pauseCooldown = Math.max(0, pauseCooldown - deltaTime);
    visitCooldown = Math.max(0, visitCooldown - deltaTime);

    let movedThisFrame = false;
    if (circling) {
      movedThisFrame = updateCircle(deltaTime);
    } else if (pauseRemaining > 0) {
      // 停下來看東西：轉頭面向物件，不走、不冒煙
      pauseRemaining -= deltaTime;
      bearing = bearingTowardDirection(surfaceNormal, pauseLookAt);
      turnBoost = 1;
      blendFacingForward(deltaTime);
      if (pauseRemaining <= 0) {
        // 看完了：轉向側邊離開（正前方就是物件，直走會撞）
        bearing = facingBearing() + (Math.random() < 0.5 ? 1 : -1) * (1.3 + Math.random() * 0.7);
        wanderTimer = settings.wanderSeconds * (0.55 + Math.random() * 0.9);
      }
    } else {
      if (command) updateCommand(deltaTime);
      if (visiting) updateVisit(deltaTime);
      wanderTimer -= deltaTime;
      if (wanderTimer <= 0 && !visiting && !command && maybeStartVisit()) updateVisit(0);
      if (wanderTimer <= 0 && !visiting && !command) {
        wanderTimer = settings.wanderSeconds * (0.55 + Math.random() * 0.9);
        bearing = settings.stayInViewHemisphere && camera ?
          bearingTowardCamera(surfaceNormal) + (Math.random() - 0.5) * 1.1 :
          facingBearing() + (Math.random() - 0.5) * 2.4;
      }

      // 人在界外（醬底下）時，遊走亂數先暫停，一律朝頂端走回來
      if (colatitudeFromNormal(surfaceNormal) > effectiveColatMax) {
        bearing = bearingTowardTop(surfaceNormal);
      }

      blendFacingForward(deltaTime);

      const stepRad = THREE.MathUtils.degToRad(settings.roamSpeedDegrees) * deltaTime;
      if (stepRad > 0) {
        movedThisFrame = tryAdvance(stepRad);
        if (!movedThisFrame) {
          stuckSeconds += deltaTime;
          if (stuckSeconds > 2.2) {
            // 卡太久就原地掉頭（身體會照轉向速度慢慢轉），不再瞬移
            bearing = facingBearing() + Math.PI + (Math.random() - 0.5) * 0.8;
            wanderTimer = settings.wanderSeconds;
            stuckSeconds = 0;
          }
        } else {
          stuckSeconds = 0;
          maybePauseNearObstacles();
        }
      }
    }

    applyPlacement();
    updateSmoke(deltaTime, movedThisFrame);

    // 停下時搖晃慢慢收掉（約 0.2 秒），起步再慢慢回來
    const waddleTarget = pauseRemaining > 0 ? 0 : 1;
    waddleAmount += (waddleTarget - waddleAmount) * Math.min(1, deltaTime * 8);
    waddlePhase += deltaTime * 11.5 * waddleAmount;
    const strength = settings.waddleStrength * waddleAmount;
    const wobble = strength * Math.sin(waddlePhase);
    const sway = strength * 0.65 * Math.sin(waddlePhase * 0.5 + 0.8);
    wobbleScale.set(1 + sway * 0.35, 1 + wobble, 1 - sway * 0.25);
    // 腳步跟整隻搖晃用同一個相位；停下來看東西時 waddleAmount → 0，腳慢慢回正
    rig?.update(deltaTime, waddlePhase, movedThisFrame ? waddleAmount : waddleAmount * 0.5);
    model.scale.set(
      modelBaseScale * wobbleScale.x,
      modelBaseScale * wobbleScale.y,
      modelBaseScale * wobbleScale.z,
    );
  }

  return {
    object: anchor,
    settings,
    cloud,
    applySettings,
    applyColor,
    setIntroGrow,
    update,
    getNormal: () => surfaceNormal.clone(),
    /** 立刻出發去篝火（面板測試用）；目標不存在或去不了回傳 false */
    visitNow: () => {
      visitCooldown = 0;
      return startVisit();
    },
    isVisiting: () => visiting,
    /** 下指令：走到某處（走到／放棄會呼叫 onDone） */
    goTo: (options: PigGoToOptions) => {
      // 被派任務（例如去溜滑梯）：先停止繞圈
      circling = false;
      return startGoTo(options);
    },
    cancelGoTo: () => {
      if (command) finishCommand(false);
    },
    /** 正在忙（去篝火、走指令、停下來看東西、被操偶）：外部想派任務前先問 */
    isBusy: () => visiting || command !== null || puppet || pauseRemaining > 0 || circling,
    /** 測試：原地繞圈圈的設定（半徑、方向）；改了之後呼叫 setCircling(true) 重新開始 */
    circle,
    /** 測試：開始／停止原地繞圈圈 */
    setCircling: (on: boolean) => {
      if (on) startCircle();
      else {
        circling = false;
        wanderTimer = settings.wanderSeconds * (0.55 + Math.random() * 0.9);
      }
    },
    isCircling: () => circling,
    /** 小豬避障用的半徑（弧度） */
    getBodyRadiusRad: () => pigBodyRadiusRad(),
    /** 某個物件的避障範圍（弧度，含餘量）；不在障礙清單裡回傳 null */
    getObstacleClearance: (root: THREE.Object3D) => {
      refreshObstacles();
      return obstacleScratch.find((obstacle) => obstacle.root === root)?.clearanceRad ?? null;
    },
    /** 這個地表位置小豬站得下嗎（不在障礙裡、在活動範圍內） */
    isWalkable: (normal: THREE.Vector3, allowNearTop = false) => {
      refreshObstacles();
      allowNearTopCheck = allowNearTop;
      try {
        return !isBlocked(normal.clone().normalize());
      } finally {
        allowNearTopCheck = false;
      }
    },
    /**
     * 給島上的小生物（蝴蝶、蚱蜢……）用：這個地表位置是空地嗎（不在房子、食物等障礙裡、在小豬的活動範圍內）。
     * 跟 isWalkable 不同：不重算障礙清單，直接用小豬這一格算好的（小豬每格都會更新），
     * 二十幾隻生物每格各問幾次也不會拖慢。radiusRad = 生物自己的佔地（弧度）
     */
    isOpenGround: (normal: THREE.Vector3, radiusRad = 0) => {
      const col = colatitudeFromNormal(normal);
      if (col < settings.roamColatitudeMin || col > effectiveColatMax) return false;
      for (const obstacle of obstacleScratch) {
        if (angularDistance(normal, obstacle.normal) < radiusRad + obstacle.clearanceRad) return false;
      }
      return true;
    },
    /** 停下來看某處幾秒（例如吃魚排） */
    pauseFor: (seconds: number, lookAt: THREE.Vector3) => {
      pauseRemaining = seconds;
      pauseCooldown = seconds + 2;
      pauseLookAt.copy(lookAt).normalize();
    },
    /** 進入／離開操偶模式。進入時會取消指令、篝火、停下 */
    setPuppet: (on: boolean) => {
      if (on) {
        if (command) finishCommand(false);
        visiting = false;
        pauseRemaining = 0;
        circling = false;
      }
      puppet = on;
      puppetScale = 1;
      puppetWaddle = 0;
    },
    /**
     * 操偶時每格指定姿勢（綠球座標）：position 是腳底、forward 是鼻頭方向、upDir 是頭頂方向。
     * scale 乘在原本大小上（0 = 藏起來）；waddle = 腳步擺動 0～1
     */
    setPuppetPose: (position: THREE.Vector3, forward: THREE.Vector3, upDir: THREE.Vector3, scale = 1, waddle = 0) => {
      anchor.position.copy(position);
      placeEast.crossVectors(upDir, forward);
      if (placeEast.lengthSq() > 1e-10) {
        placeEast.normalize();
        const upOrtho = upDir.clone().normalize();
        placeForward.crossVectors(placeEast, upOrtho).normalize();
        basis.makeBasis(placeEast, upOrtho, placeForward);
        anchor.quaternion.setFromRotationMatrix(basis);
      }
      puppetScale = scale;
      puppetWaddle = waddle;
      anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow) * Math.max(0.0001, scale));
    },
    /** 離開操偶、從某處恢復自由遊走（normal = 地表方向；forward = 鼻頭方向） */
    resumeAt: (normal: THREE.Vector3, forward: THREE.Vector3) => {
      puppet = false;
      puppetScale = 1;
      puppetWaddle = 0;
      surfaceNormal.copy(normal).normalize();
      facingForward.copy(forward).addScaledVector(surfaceNormal, -forward.dot(surfaceNormal));
      if (facingForward.lengthSq() < 1e-8) facingForward.copy(tangentFromBearing(surfaceNormal, bearing, probe2));
      facingForward.normalize();
      syncBearingFromFacing();
      wanderTimer = settings.wanderSeconds * (0.55 + Math.random() * 0.9);
      stuckSeconds = 0;
      applyPlacement();
    },
    isPuppet: () => puppet,
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
    `  ribbonMarginDegrees: ${settings.ribbonMarginDegrees.toFixed(1)},\n` +
    `  smokeEnabled: ${settings.smokeEnabled},\n` +
    `  smokeRate: ${settings.smokeRate.toFixed(1)},\n` +
    `  smokeSize: ${settings.smokeSize.toFixed(2)},\n` +
    `  smokeLifeSeconds: ${settings.smokeLifeSeconds.toFixed(2)},\n` +
    `  lookAheadDegrees: ${settings.lookAheadDegrees.toFixed(1)},\n` +
    `  pauseChance: ${settings.pauseChance.toFixed(2)},\n` +
    `  pauseMinSeconds: ${settings.pauseMinSeconds.toFixed(1)},\n` +
    `  pauseMaxSeconds: ${settings.pauseMaxSeconds.toFixed(1)},\n` +
    `  pauseNearDegrees: ${settings.pauseNearDegrees.toFixed(1)},\n` +
    `  visitChance: ${settings.visitChance.toFixed(2)},\n` +
    `  visitWatchMinSeconds: ${settings.visitWatchMinSeconds.toFixed(1)},\n` +
    `  visitWatchMaxSeconds: ${settings.visitWatchMaxSeconds.toFixed(1)},\n` +
    `  visitCooldownSeconds: ${settings.visitCooldownSeconds.toFixed(1)},\n` +
    `  bodyColor: '${settings.bodyColor}',\n` +
    `};`
  );
}