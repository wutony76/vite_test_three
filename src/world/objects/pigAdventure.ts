import * as THREE from 'three';
import type { createPig } from './pig';
import type { SlideRide } from './mainHallSlide';
import { SALMON_STEAK_LAYOUT_DEFAULT, type SalmonSteakLayout } from './salmonSteakLayout';
import type { createSalmonSteak } from './salmonSteak';

/**
 * 小豬的溜滑梯冒險（串在小豬平常的遊走之間）：
 *
 *   1. 走到龍兔的家（mainHall）前方大門
 *   2. 直接從大門走進去（不縮小，走進房子裡就被擋住了）
 *   3. 在屋裡待 1 秒
 *   4. 從三樓洞口冒出來，走過木平台，沿溜滑梯滑下去
 *   5. 滑進水潭：濺起水花；有機率濺出一塊魚排，拋物線飛到岸邊草地
 *   6. 小豬沉進水裡待 3 秒，再從靠岸那側慢慢浮出水面、爬上岸，回到平常的遊走
 *   7. 有魚排時，小豬有機率跑去撿（撿到時魚排縮小消失）
 *   8. 沒被撿的魚排：超過 10 秒、而且不在畫面裡時才消失（在畫面裡就先留著，不會當著你的面突然不見）
 *
 * 小豬的走路、避障都交給 pig.ts（goTo 指令）；進門、溜滑梯、跳上岸這些「不是走路」的動作，
 * 用 pig.ts 的操偶模式（setPuppetPose）每格指定位置與方向。
 * 座標：全部是 ground（綠球）座標，跟小豬、溜滑梯、水潭同一個座標系。
 */
export type PigAdventureSettings = {
  enabled: boolean;
  /** 冷卻時間到時，決定「去溜滑梯」的機率 */
  chance: number;
  /** 兩次冒險之間的冷卻（秒，最短～最長隨機） */
  cooldownMinSeconds: number;
  cooldownMaxSeconds: number;
  /** 在屋裡待幾秒 */
  insideSeconds: number;
  /** 滑下去的平均速度（ground 單位／秒；綠球半徑 1）。一開始慢、越滑越快 */
  slideSpeed: number;
  /** 濺水時噴出魚排的機率 */
  fishChance: number;
  /** 有魚排時，小豬跑去撿的機率 */
  fetchChance: number;
  /** 魚排沒被撿走時，至少留幾秒（之後一離開畫面就消失） */
  fishLifetimeSeconds: number;
  /** 噴出來的魚排大小（最長邊，ground 單位）；小豬身長約 0.057 */
  fishSize: number;
  /** 噴出來的魚排厚度倍率（1 = 模型原本的厚度；只加厚、不改長寬） */
  fishThickness: number;
};

export const PIG_ADVENTURE_DEFAULT: PigAdventureSettings = {
  enabled: true,
  chance: 0.6,
  cooldownMinSeconds: 20,
  cooldownMaxSeconds: 45,
  insideSeconds: 1,
  slideSpeed: 0.3,
  fishChance: 0.5,
  fetchChance: 0.6,
  fishLifetimeSeconds: 10,
  fishSize: 0.05,
  // 原本的厚度在這麼小的尺寸下看起來像一片薄紙，加厚一點才像一塊魚排
  fishThickness: 1.8,
};

type PigRuntime = ReturnType<typeof createPig>;
type FishRuntime = ReturnType<typeof createSalmonSteak>;

type PondHandle = {
  object: THREE.Object3D;
  settings: { enabled: boolean; size: number };
  getNormal: () => THREE.Vector3;
  splash: (point: THREE.Vector3, strength?: number) => void;
};

type CreatePigAdventureOptions = {
  ground: THREE.Object3D;
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  camera: THREE.Camera;
  pig: PigRuntime;
  /** 龍兔的家：房子本體（小豬避障清單裡的那一個）＋大門節點（模型還沒載入時 door 是 null） */
  getHouse: () => { object: THREE.Object3D; door: THREE.Object3D | null } | null;
  getRide: () => SlideRide | null;
  getPond: () => PondHandle | null;
  createFish: (layout: SalmonSteakLayout) => FishRuntime;
  layout?: PigAdventureSettings;
};

type Phase =
  | 'idle'
  | 'toDoor'
  | 'vanish'
  | 'entering'
  | 'inside'
  | 'exiting'
  | 'walkPlatform'
  | 'sliding'
  | 'plunge'
  | 'underwater'
  | 'climbOut';

type Fish = {
  runtime: FishRuntime;
  phase: 'flying' | 'landed' | 'eaten';
  time: number;
  /** 起飛點（水面）與落地點（地表方向） */
  from: THREE.Vector3;
  landNormal: THREE.Vector3;
  /** 落地後的正常姿勢（飛行中在這個姿勢上加翻滾） */
  landQuaternion: THREE.Quaternion;
  tumbleAxis: THREE.Vector3;
  /** 落地後經過幾秒 */
  age: number;
  /** 這塊要不要讓小豬去撿（落地時擲一次骰子） */
  wantFetch: boolean;
  /** 小豬正在跑過來撿：這段期間不會因為「離開畫面」被收掉 */
  chased: boolean;
};

const DEG = Math.PI / 180;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function createPigAdventure({
  ground,
  groundRadius,
  up,
  front,
  camera,
  pig,
  getHouse,
  getRide,
  getPond,
  createFish,
  layout = PIG_ADVENTURE_DEFAULT,
}: CreatePigAdventureOptions) {
  const settings: PigAdventureSettings = { ...layout };
  const side = new THREE.Vector3().crossVectors(up, front).normalize();

  let phase: Phase = 'idle';
  let phaseTime = 0;
  let cooldown = randomCooldown() * 0.5;
  const fishes: Fish[] = [];

  // 這一趟用到的位置（ground 座標）
  const doorFront = new THREE.Vector3();
  const doorPoint = new THREE.Vector3();
  const enterFrom = new THREE.Vector3();
  const slideEnd = new THREE.Vector3();
  const slideEndTangent = new THREE.Vector3();
  /** 爬出水面：水裡的起點、浮到水面的點 */
  const emergeUnder = new THREE.Vector3();
  const emergeSurface = new THREE.Vector3();
  const shoreNormal = new THREE.Vector3();
  let ride: SlideRide | null = null;
  let slideDuration = 1;
  let platformDuration = 0.3;

  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const upDir = new THREE.Vector3();

  function randomCooldown() {
    const min = Math.min(settings.cooldownMinSeconds, settings.cooldownMaxSeconds);
    const max = Math.max(settings.cooldownMinSeconds, settings.cooldownMaxSeconds);
    return min + Math.random() * (max - min);
  }

  function setPhase(next: Phase) {
    phase = next;
    phaseTime = 0;
  }

  /** 世界座標 → ground 座標 */
  function toGround(world: THREE.Vector3) {
    ground.updateMatrixWorld(true);
    return ground.worldToLocal(world.clone());
  }

  /** v 在 normal 切平面上的分量（單位向量） */
  function tangentOf(v: THREE.Vector3, normal: THREE.Vector3, target = new THREE.Vector3()) {
    target.copy(v).addScaledVector(normal, -v.dot(normal));
    return target.lengthSq() > 1e-12 ? target.normalize() : target.set(0, 0, 0);
  }

  /** 從 normal 沿 tangent 方向在球面上轉 angle（弧度） */
  function rotateOnSphere(normal: THREE.Vector3, tangent: THREE.Vector3, angle: number) {
    const axis = new THREE.Vector3().crossVectors(normal, tangent).normalize();
    return normal.clone().applyAxisAngle(axis, angle).normalize();
  }

  // ─────────────────────────── 1. 走到大門 ───────────────────────────

  /**
   * 大門正前方、剛好在房子避障範圍外的位置：
   * 從房子中心往大門的方向，走出「房子的避障半徑＋小豬半徑＋一點點」。
   * 那個位置被別的東西擋住的話，再往外推一點試試。
   */
  function computeDoorFront(): boolean {
    const house = getHouse();
    if (!house?.door) return false;
    const houseNormal = house.object.position.clone().normalize();
    doorPoint.copy(toGround(house.door.getWorldPosition(tmp)));
    const toDoor = tangentOf(doorPoint, houseNormal);
    if (toDoor.lengthSq() < 0.5) return false;
    const clearance = pig.getObstacleClearance(house.object) ?? 8 * DEG;
    const body = pig.getBodyRadiusRad();
    for (const extra of [0.5, 1, 1.5, 2, 3, 4, 5]) {
      const candidate = rotateOnSphere(houseNormal, toDoor, clearance + body + extra * DEG);
      if (pig.isWalkable(candidate, true)) {
        doorFront.copy(candidate);
        return true;
      }
    }
    return false;
  }

  /** 開始一趟冒險；force = 面板「立刻去溜滑梯」（不擲骰子、會打斷小豬正在做的事） */
  /** 上一次「去不了」的原因（面板警告用） */
  let lastFailReason = '';
  function fail(reason: string) {
    lastFailReason = reason;
    return false;
  }

  /** 每個階段的說明（「去不了」的訊息用，讓人知道小豬現在在哪） */
  const PHASE_LABEL: Record<Phase, string> = {
    idle: '沒有在冒險',
    toDoor: '正在走去龍兔的家大門',
    vanish: '正在原地消失（馬上去溜滑梯）',
    entering: '正在走進大門',
    inside: '在屋裡',
    exiting: '正從三樓洞口出來',
    walkPlatform: '正走過頂端平台',
    sliding: '正在溜滑梯',
    plunge: '正掉進水潭',
    underwater: '在水裡（3 秒後爬出來）',
    climbOut: '正慢慢爬出水面',
  };

  function start(force = false) {
    // 還在走去大門的路上又按一次：重新出發（重新規劃路線），不用等它走不到、放棄
    if (force && phase === 'toDoor') pig.cancelGoTo();
    if (phase !== 'idle') return fail(`小豬已經在冒險中：${PHASE_LABEL[phase]}`);
    if (!force && pig.isBusy()) return fail('小豬正在忙（去篝火、停下來看東西…）');
    if (pig.isPuppet()) return fail('小豬正在被操作');
    if (!getRide()) return fail('溜滑梯還沒準備好（關閉、還沒建好或開場還沒伸出來）');
    if (!getPond()?.settings.enabled) return fail('水潭關閉');
    if (!getHouse()?.door) return fail('龍兔的家大門還沒載入');
    if (!computeDoorFront()) return fail('大門前找不到小豬站得下的位置');
    lastFailReason = '';
    setPhase('toDoor');
    pig.goTo({
      getTarget: () => (phase === 'toDoor' ? doorFront : null),
      arriveRad: 1 * DEG,
      ignoreRoot: getHouse()?.object ?? null,
      allowNearTop: true,
      // 走多久放棄：依距離估（直線秒數 ×3 ＋ 8），但限制在 20～75 秒。
      // 不設上限的話，遠的時候要等兩分多鐘，走不到時這段期間一直「冒險中」；
      // 固定 40 秒又太短（實測從綠球另一側要繞過好幾棟房子，40 秒走不到就放棄了）
      timeoutSeconds: THREE.MathUtils.clamp(
        (pig.object.position.clone().normalize().angleTo(doorFront) / DEG / Math.max(pig.settings.roamSpeedDegrees, 0.5)) * 3 + 8,
        20,
        75,
      ),
      onDone: (arrived) => {
        if (phase !== 'toDoor') return;
        if (!arrived) {
          finish();
          return;
        }
        enterFrom.copy(pig.object.position);
        pig.setPuppet(true);
        // 烏雲（連雨、閃電）先收起來：進門、溜滑梯、泡在水裡都不該有雲跟著，爬上岸才回來
        pig.cloud.setSuppressed(true);
        setPhase('entering');
      },
    });
    return true;
  }

  /** 按鈕「馬上去溜滑梯」：在屋裡只待這麼久（自動冒險還是照 insideSeconds） */
  const QUICK_INSIDE_SECONDS = 0.3;
  let quickTrip = false;

  /**
   * 面板按鈕：馬上去溜滑梯——不走去大門，原地一跳縮小消失，0.3 秒後直接從三樓洞口出來滑下去。
   * 正在走去大門的路上按也一樣（直接改成馬上去）；已經進門／正在滑就不打斷。
   */
  function startImmediate() {
    if (phase !== 'idle' && phase !== 'toDoor') return fail(`小豬已經在冒險中：${PHASE_LABEL[phase]}`);
    if (pig.isPuppet()) return fail('小豬正在被操作');
    if (!getRide()) return fail('溜滑梯還沒準備好（關閉、還沒建好或開場還沒伸出來）');
    if (!getPond()?.settings.enabled) return fail('水潭關閉');
    if (phase === 'toDoor') pig.cancelGoTo();
    // 中途出狀況時要回到的位置：有大門前就用大門前，沒有就回到原地
    if (!computeDoorFront()) doorFront.copy(pig.object.position).normalize();
    lastFailReason = '';
    enterFrom.copy(pig.object.position);
    doorPoint.copy(pig.object.position);
    upDir.copy(enterFrom).normalize();
    // 鼻頭方向：小豬 anchor 的 local +Z（見 pig.ts applyPlacement）
    tangentOf(new THREE.Vector3(0, 0, 1).applyQuaternion(pig.object.quaternion), upDir, forward);
    pig.setPuppet(true);
    pig.cloud.setSuppressed(true);
    quickTrip = true;
    setPhase('vanish');
    return true;
  }

  /** 一趟結束（或中途放棄）：回到等待冷卻 */
  function finish() {
    quickTrip = false;
    // 回到岸上（或中途放棄回到大門前）：烏雲恢復成去溜滑梯前的天氣
    pig.cloud.setSuppressed(false);
    setPhase('idle');
    cooldown = randomCooldown();
    ride = null;
  }

  /** 中途出狀況（溜滑梯、水潭被關掉）：小豬回到大門前，正常遊走 */
  function abortToDoorFront() {
    const house = getHouse();
    const away = house ? tangentOf(doorFront.clone().sub(house.object.position.clone().normalize()), doorFront) : forward;
    pig.resumeAt(doorFront, away.lengthSq() > 0.5 ? away : forward);
    finish();
  }

  // ─────────────────────────── 魚排 ───────────────────────────

  /** 魚排落地點：水潭岸邊外 1.5～4.5° 的草地上，要是小豬站得到的地方（不在房子、食物裡） */
  function findFishLanding(pondNormal: THREE.Vector3, pondClearance: number) {
    const tangentA = tangentOf(Math.abs(pondNormal.y) < 0.9 ? Y_AXIS : new THREE.Vector3(1, 0, 0), pondNormal);
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const direction = tangentA.clone().applyAxisAngle(pondNormal, angle);
      const distance = pondClearance + (1.5 + Math.random() * 3) * DEG;
      const candidate = rotateOnSphere(pondNormal, direction, distance);
      if (pig.isWalkable(candidate)) return candidate;
    }
    return null;
  }

  /** 魚排落地後的姿勢（跟 salmonSteak.ts 的擺法一樣）：用精確角度寫進設定，不經過 setNormal（它會四捨五入到整數度，落地會跳一下） */
  function placeFishAt(fish: Fish) {
    const n = fish.landNormal;
    const settingsRef = fish.runtime.settings;
    settingsRef.angleFromTopDegrees = Math.acos(THREE.MathUtils.clamp(n.dot(up), -1, 1)) / DEG;
    tmp.copy(n).addScaledVector(up, -n.dot(up));
    settingsRef.azimuthDegrees = Math.atan2(tmp.dot(side), tmp.dot(front)) / DEG;
    fish.runtime.applySettings();
  }

  /** 從水面某點噴出一塊魚排（拋物線飛到岸邊） */
  function spawnFish(from: THREE.Vector3) {
    const pond = getPond();
    if (!pond) return;
    const pondNormal = pond.getNormal().normalize();
    const pondClearance = pig.getObstacleClearance(pond.object) ?? Math.atan(pond.settings.size * 1.4);
    const landNormal = findFishLanding(pondNormal, pondClearance);
    if (!landNormal) return;
    const runtime = createFish({
      ...SALMON_STEAK_LAYOUT_DEFAULT,
      modelSize: settings.fishSize,
      heightScale: settings.fishThickness,
      spinDegrees: Math.random() * 360 - 180,
    });
    ground.add(runtime.object);
    // 魚排不參與點擊／拖曳判定
    runtime.object.traverse((child) => {
      (child as THREE.Mesh).raycast = () => {};
    });
    const fish: Fish = {
      runtime,
      phase: 'flying',
      time: 0,
      from: from.clone(),
      landNormal,
      landQuaternion: new THREE.Quaternion(),
      tumbleAxis: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      age: 0,
      wantFetch: false,
      chased: false,
    };
    placeFishAt(fish);
    fish.landQuaternion.copy(runtime.object.quaternion);
    fishes.push(fish);
  }

  /** 魚排在不在畫面裡：在鏡頭的視錐內，而且在綠球朝向鏡頭的那一面（背面會被球擋住） */
  const frustum = new THREE.Frustum();
  const projScreen = new THREE.Matrix4();
  function isFishVisible(fish: Fish) {
    camera.updateMatrixWorld();
    projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreen);
    const world = fish.runtime.object.getWorldPosition(tmp);
    if (!frustum.containsPoint(world)) return false;
    const ballCenter = ground.getWorldPosition(tmp2);
    const outward = world.clone().sub(ballCenter).normalize();
    const toCamera = camera.getWorldPosition(new THREE.Vector3()).sub(world).normalize();
    return outward.dot(toCamera) > 0.05;
  }

  function removeFish(fish: Fish) {
    fish.runtime.dispose();
    const index = fishes.indexOf(fish);
    if (index >= 0) fishes.splice(index, 1);
  }

  /** 叫小豬去撿這塊魚排（小豬有空、冒險沒在進行時） */
  function sendPigToFish(fish: Fish) {
    fish.chased = true;
    fish.wantFetch = false;
    pig.goTo({
      getTarget: () => (fish.phase === 'landed' && fishes.includes(fish) ? fish.landNormal : null),
      arriveRad: pig.getBodyRadiusRad() * 1.3,
      onDone: (arrived) => {
        fish.chased = false;
        if (!arrived || fish.phase !== 'landed') return;
        // 撿到了：魚排縮小消失，小豬停下來吃一下
        fish.phase = 'eaten';
        fish.time = 0;
        pig.pauseFor(1.2, fish.landNormal);
      },
    });
  }

  function updateFishes(deltaTime: number) {
    for (const fish of [...fishes]) {
      fish.time += deltaTime;
      const object = fish.runtime.object;
      if (fish.phase === 'flying') {
        // 拋物線：從水面飛到岸邊，最高離地約 0.07，邊飛邊翻滾
        const duration = 1;
        const k = Math.min(1, fish.time / duration);
        const land = fish.landNormal.clone().multiplyScalar(groundRadius);
        object.position.lerpVectors(fish.from, land, k).addScaledVector(fish.landNormal, Math.sin(Math.PI * k) * 0.07);
        object.quaternion
          .copy(fish.landQuaternion)
          .multiply(new THREE.Quaternion().setFromAxisAngle(fish.tumbleAxis, (1 - k) * Math.PI * 4));
        if (k >= 1) {
          fish.phase = 'landed';
          fish.time = 0;
          fish.age = 0;
          placeFishAt(fish);
          fish.wantFetch = Math.random() < settings.fetchChance;
        }
        continue;
      }
      if (fish.phase === 'eaten') {
        // 被吃掉：0.35 秒縮小消失
        const k = Math.min(1, fish.time / 0.35);
        object.scale.setScalar(Math.max(0.0001, fish.runtime.settings.placementScale * (1 - k)));
        if (k >= 1) removeFish(fish);
        continue;
      }
      // 落地了
      fish.age += deltaTime;
      if (fish.wantFetch && phase === 'idle' && !pig.isBusy()) sendPigToFish(fish);
      // 沒人撿：超過時間、而且不在畫面裡 → 消失（在畫面裡就先留著，不當著你的面突然不見）
      if (!fish.chased && fish.age > settings.fishLifetimeSeconds && !isFishVisible(fish)) {
        if (fish.wantFetch) fish.wantFetch = false;
        removeFish(fish);
      }
    }
  }

  // ─────────────────────────── 每格更新 ───────────────────────────

  function pose(position: THREE.Vector3, forwardDir: THREE.Vector3, up: THREE.Vector3, scale: number, waddle: number) {
    pig.setPuppetPose(position, forwardDir, up, scale, waddle);
  }

  function update(deltaTime: number, introDone: boolean) {
    updateFishes(deltaTime);
    phaseTime += deltaTime;

    if (phase === 'idle') {
      if (!settings.enabled || !introDone) return;
      cooldown -= deltaTime;
      if (cooldown > 0) return;
      cooldown = randomCooldown();
      if (Math.random() < settings.chance) start(false);
      return;
    }

    if (phase === 'toDoor') return; // 走路交給 pig.ts 的 goTo，走到時 onDone 會切到 entering

    // 下面都是操偶階段：溜滑梯或水潭被關掉就放棄，小豬回到大門前
    if (!getPond()?.settings.enabled || (phase !== 'vanish' && phase !== 'entering' && phase !== 'inside' && !ride && !getRide())) {
      abortToDoorFront();
      return;
    }

    if (phase === 'vanish') {
      // 原地輕輕一跳、縮小消失
      const k = Math.min(1, phaseTime / 0.35);
      tmp.copy(enterFrom).addScaledVector(upDir, Math.sin(Math.PI * k) * 0.012);
      pose(tmp, forward, upDir, 1 - k, 0);
      if (k >= 1) setPhase('inside');
      return;
    }

    if (phase === 'entering') {
      // 從大門前直接走進門裡，不縮小：先走到門口，再往門裡多走 0.035，被房子擋住後才藏起來
      tmp2.copy(doorPoint).sub(enterFrom);
      const walkIn = tmp2.length() + 0.035;
      const duration = Math.max(0.8, walkIn / 0.07);
      const k = Math.min(1, phaseTime / duration);
      upDir.copy(doorPoint).normalize();
      tangentOf(tmp2, upDir, forward);
      const inside = doorPoint.clone().addScaledVector(forward, 0.035);
      tmp.lerpVectors(enterFrom, inside, k);
      upDir.copy(tmp).normalize();
      pose(tmp, forward, upDir, 1, 1);
      if (k >= 1) setPhase('inside');
      return;
    }

    if (phase === 'inside') {
      pose(doorPoint, forward, upDir, 0, 0);
      if (phaseTime >= (quickTrip ? QUICK_INSIDE_SECONDS : settings.insideSeconds)) {
        ride = getRide();
        if (!ride) {
          abortToDoorFront();
          return;
        }
        // 走過木平台要多久：照小豬平常的走路速度
        const platformLength = ride.door.distanceTo(ride.curve.getPointAt(0));
        platformDuration = Math.max(0.25, platformLength / 0.07);
        const length = ride.curve.getLength();
        slideDuration = THREE.MathUtils.clamp(length / Math.max(settings.slideSpeed, 0.05), 0.8, 4);
        setPhase('exiting');
      }
      return;
    }

    if (!ride) return;

    if (phase === 'exiting') {
      // 從三樓洞口冒出來：0.35 秒從 0 長回原本大小
      const k = Math.min(1, phaseTime / 0.35);
      pose(ride.door, ride.outward, ride.houseUp, k, 0.5);
      if (k >= 1) setPhase('walkPlatform');
      return;
    }

    if (phase === 'walkPlatform') {
      // 走過木平台到滑道起點
      const k = Math.min(1, phaseTime / platformDuration);
      tmp.lerpVectors(ride.door, ride.curve.getPointAt(0), k);
      pose(tmp, ride.outward, ride.houseUp, 1, 1);
      if (k >= 1) setPhase('sliding');
      return;
    }

    if (phase === 'sliding') {
      // 沿滑道滑下：一開始慢、越滑越快（u = k^1.6）
      const k = Math.min(1, phaseTime / slideDuration);
      const u = Math.pow(k, 1.6);
      const point = ride.curve.getPointAt(u);
      const tangent = ride.curve.getTangentAt(u);
      // 頭頂方向：垂直於前進方向、盡量朝外（跟滑道斷面同一套座標）
      const radial = point.clone().normalize();
      const sideVector = new THREE.Vector3().crossVectors(tangent, radial).normalize();
      upDir.crossVectors(sideVector, tangent).normalize();
      pose(point, tangent, upDir, 1, 0);
      if (k >= 1) {
        slideEnd.copy(point);
        slideEndTangent.copy(tangentOf(tangent, radial));
        // 水花在小豬衝進水裡的地方（滑道終點再往前一點）：滑道終點貼近岸邊，直接在終點濺的話一半落在泥岸上
        const splashPoint = slideEnd.clone().addScaledVector(slideEndTangent, 0.015);
        const pond = getPond();
        pond?.splash(splashPoint, 1);
        if (Math.random() < settings.fishChance) spawnFish(splashPoint);
        setPhase('plunge');
      }
      return;
    }

    if (phase === 'plunge') {
      // 衝進水裡：往前一點、往下沉 0.05（整隻沒入水面，被水擋住），大小不變
      const k = Math.min(1, phaseTime / 0.35);
      upDir.copy(slideEnd).normalize();
      tmp.copy(slideEnd).addScaledVector(slideEndTangent, 0.015 * k).addScaledVector(upDir, -0.05 * k);
      pose(tmp, slideEndTangent, upDir, 1, 0);
      if (k >= 1) setPhase('underwater');
      return;
    }

    if (phase === 'underwater') {
      // 在水裡待 3 秒（水面擋住看不到，頭上的烏雲還在水面上飄）
      if (phaseTime < 3) return;
      if (!findShore()) {
        abortToDoorFront();
        return;
      }
      // 浮出的位置：水潭裡、靠岸那一側（水潭半徑的 75%），從水下 0.05 開始
      const pond = getPond()!;
      const pondNormal = pond.getNormal().normalize();
      const towardShore = tangentOf(shoreNormal, pondNormal);
      const emergeNormal = rotateOnSphere(pondNormal, towardShore, Math.atan(pond.settings.size * 0.75));
      emergeUnder.copy(emergeNormal).multiplyScalar(groundRadius - 0.05);
      emergeSurface.copy(emergeNormal).multiplyScalar(groundRadius);
      // 浮出水面時泛起一點小波紋
      pond.splash(emergeSurface, 0.3);
      setPhase('climbOut');
      return;
    }

    if (phase === 'climbOut') {
      // 慢慢爬出水面：前 45% 從水裡浮到水面，後 55% 慢慢走上岸
      const duration = 2.4;
      const k = Math.min(1, phaseTime / duration);
      const land = shoreNormal.clone().multiplyScalar(groundRadius);
      if (k < 0.45) {
        const rise = k / 0.45;
        tmp.lerpVectors(emergeUnder, emergeSurface, 1 - (1 - rise) * (1 - rise));
      } else {
        tmp.lerpVectors(emergeSurface, land, (k - 0.45) / 0.55);
      }
      upDir.copy(tmp).normalize();
      tangentOf(land.clone().sub(emergeSurface), upDir, forward);
      // 整個身體往後仰（鼻頭朝上），像在爬岸邊的斜坡：
      //   從水裡浮上來時慢慢仰到 28°；浮出水面後再維持 0.5 秒，就直接回正（不慢慢轉回來），之後正常走上岸
      const tiltMax = 28 * DEG;
      const riseSeconds = duration * 0.45;
      let tilt = 0;
      if (phaseTime < riseSeconds) tilt = tiltMax * Math.sin((phaseTime / riseSeconds) * Math.PI * 0.5);
      else if (phaseTime < riseSeconds + 0.5) tilt = tiltMax;
      // 繞「鼻頭 × 頭頂」轉：鼻頭往頭頂的方向轉上去、頭頂往後倒
      const pitchAxis = new THREE.Vector3().crossVectors(forward, upDir).normalize();
      const tiltedForward = forward.clone().applyAxisAngle(pitchAxis, tilt);
      const tiltedUp = upDir.clone().applyAxisAngle(pitchAxis, tilt);
      pose(tmp, tiltedForward, tiltedUp, 1, k < 0.45 ? 0.3 : 1);
      if (k >= 1) {
        pig.resumeAt(shoreNormal, forward);
        finish();
      }
    }
  }

  /** 爬上岸的位置：水潭避障範圍外，優先朝落水點那一側；站不下就左右轉著找 */
  function findShore() {
    const pond = getPond();
    if (!pond) return false;
    const pondNormal = pond.getNormal().normalize();
    const clearance = pig.getObstacleClearance(pond.object) ?? Math.atan(pond.settings.size * 1.4);
    const body = pig.getBodyRadiusRad();
    const base = tangentOf(slideEnd.clone().normalize(), pondNormal);
    if (base.lengthSq() < 0.5) base.copy(tangentOf(Y_AXIS, pondNormal));
    for (const turn of [0, 25, -25, 50, -50, 80, -80, 120, -120, 180]) {
      const direction = base.clone().applyAxisAngle(pondNormal, turn * DEG);
      const candidate = rotateOnSphere(pondNormal, direction, clearance + body + 0.6 * DEG);
      if (pig.isWalkable(candidate)) {
        shoreNormal.copy(candidate);
        return true;
      }
    }
    return false;
  }

  /** 面板測試用：在水潭中央濺一下，必定噴出魚排 */
  function testSplashFish() {
    const pond = getPond();
    if (!pond) return false;
    const center = pond.getNormal().normalize().multiplyScalar(groundRadius + 0.002);
    pond.splash(center, 1);
    spawnFish(center);
    return true;
  }

  return {
    settings,
    update,
    /** 面板「現在去溜滑梯」：馬上去（不走去大門，原地消失後直接從三樓滑下） */
    startNow: () => startImmediate(),
    /** 面板「走去大門再溜」：完整流程（走到龍兔的家大門、走進去、屋裡待一下、溜滑梯） */
    startWalk: () => start(true),
    testSplashFish,
    getPhase: () => phase,
    getLastFailReason: () => lastFailReason,
    getFishCount: () => fishes.length,
  };
}

export function formatPigAdventureSettingsForPaste(s: PigAdventureSettings) {
  return (
    `// 貼回 src/world/objects/pigAdventure.ts 的 PIG_ADVENTURE_DEFAULT\n` +
    `export const PIG_ADVENTURE_DEFAULT: PigAdventureSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  chance: ${s.chance.toFixed(2)},\n` +
    `  cooldownMinSeconds: ${s.cooldownMinSeconds},\n` +
    `  cooldownMaxSeconds: ${s.cooldownMaxSeconds},\n` +
    `  insideSeconds: ${s.insideSeconds.toFixed(2)},\n` +
    `  slideSpeed: ${s.slideSpeed.toFixed(2)},\n` +
    `  fishChance: ${s.fishChance.toFixed(2)},\n` +
    `  fetchChance: ${s.fetchChance.toFixed(2)},\n` +
    `  fishLifetimeSeconds: ${s.fishLifetimeSeconds},\n` +
    `  fishSize: ${s.fishSize.toFixed(3)},\n` +
    `  fishThickness: ${s.fishThickness.toFixed(2)},\n` +
    `};`
  );
}
