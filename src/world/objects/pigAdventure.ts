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
    // 大門前都被別的東西佔住（例如食物擺得太近）：還是用大門正前方那一點，小豬擠過去就好，不放棄
    doorFront.copy(rotateOnSphere(houseNormal, toDoor, clearance + body + 1 * DEG));
    return true;
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
    // 還在走去大門的路上又按一次：重新出發（重新規劃路線），不用等它走不到、放棄。
    // 先回到 idle 再取消走路：取消會呼叫 onDone(false)，phase 已經不是 toDoor 就直接略過（不會觸發重新規劃）
    if (force && phase === 'toDoor') {
      setPhase('idle');
      pig.cancelGoTo();
    }
    if (phase !== 'idle') return fail(`小豬已經在冒險中：${PHASE_LABEL[phase]}`);
    if (!force && pig.isBusy()) return fail('小豬正在忙（去篝火、停下來看東西…）');
    if (pig.isPuppet()) return fail('小豬正在被操作');
    if (!getRide()) return fail('溜滑梯還沒準備好（關閉、還沒建好或開場還沒伸出來）');
    if (!getPond()?.settings.enabled) return fail('水潭關閉');
    if (!getHouse()?.door) return fail('龍兔的家大門還沒載入');
    if (!computeDoorFront()) return fail('大門前找不到小豬站得下的位置');
    lastFailReason = '';
    setPhase('toDoor');
    level = 0;
    lastLevelRetries = 0;
    // 先規劃一條繞過房子、水潭、溜滑梯的路線，再一段一段走過去（只朝大門直走的話，
    // 從水潭邊出發時會被擋住、一直繞）；找不到就放寬避障，從房子中間擠過去
    route = planRouteEscalating(pig.object.position.clone().normalize());
    routeIndex = 0;
    walkLeg();
    return true;
  }

  // ─────────────────────────── 走去大門的路線 ───────────────────────────

  /**
   * 規劃好的路線：大門之前的轉折點（綠球座標的地表方向）＋走這一段要放寬到多少避障（scale）；
   * 最後一段走到 doorFront，用 finalScale
   */
  type RoutePoint = { point: THREE.Vector3; scale: number };
  let route: RoutePoint[] = [];
  let finalScale = 1;
  let routeIndex = 0;
  /**
   * 窄縫（例如 projectRoom 和 GameHall 中間）：正常避障距離下過不去，但縮小一點就過得去。
   * 這種格子不當成牆，而是「走起來比較貴」：TIGHT_SCALE = 那一格要放寬到多少才過得去，
   * TIGHT_COST = 走那一格的距離算幾倍。繞外圍明顯比較遠時，就會選擇從中間穿過去
   */
  const TIGHT_SCALE = [1, 0.7, 0.45];
  const TIGHT_COST = [1, 1.25, 1.6];
  /**
   * 避障放寬的等級：找不到路、或某一段卡住，就往下一級放寬重新規劃。
   * 1 = 正常；0.7／0.45／0.2 = 越來越能貼著、擦過房子走（從兩棟房子中間擠過去，模型穿插一點沒關係）；
   * 0 = 完全不避障，直直走到大門。所以一定走得到，小豬不會原地縮小直接去
   */
  const OBSTACLE_LEVELS = [1, 0.7, 0.45, 0.2, 0];
  let level = 0;
  /** 最後一級（完全不避障）也失敗時，最多再重試幾次（避免無限重來） */
  let lastLevelRetries = 0;
  /** 這一段離目標最近到過多近、多久沒有更近（判斷卡住） */
  let legBest = Infinity;
  let legStall = 0;
  /** 走這麼久都沒有更接近這一段的目標 → 算卡住，重新規劃 */
  const LEG_STALL_SECONDS = 4;

  const ROUTE_STEP = 2 * DEG;
  const ROUTE_ROWS = 41; // 離頂端 0～80°
  const ROUTE_COLS = 180; // 方位每 2°
  const routeNormal = (i: number, j: number, target = new THREE.Vector3()) => {
    const colat = i * ROUTE_STEP;
    const az = (j / ROUTE_COLS) * Math.PI * 2;
    return target
      .copy(up)
      .multiplyScalar(Math.cos(colat))
      .addScaledVector(front, Math.sin(colat) * Math.cos(az))
      .addScaledVector(side, Math.sin(colat) * Math.sin(az));
  };
  const routeCell = (n: THREE.Vector3) => {
    const colat = Math.acos(THREE.MathUtils.clamp(n.dot(up), -1, 1));
    tmp.copy(n).addScaledVector(up, -n.dot(up));
    let az = Math.atan2(tmp.dot(side), tmp.dot(front));
    if (az < 0) az += Math.PI * 2;
    const i = THREE.MathUtils.clamp(Math.round(colat / ROUTE_STEP), 0, ROUTE_ROWS - 1);
    const j = Math.round((az / (Math.PI * 2)) * ROUTE_COLS) % ROUTE_COLS;
    return i * ROUTE_COLS + j;
  };

  /**
   * 這個位置在 scale 倍的避障距離下走得過去嗎（scale 再乘上目前的放寬等級）。
   * 靠近大門（5° 內）時房子本身不算障礙，才走得進門
   */
  function routeClear(n: THREE.Vector3, scale = 1) {
    const house = getHouse()?.object ?? null;
    return pig.isClearForPath(n, n.angleTo(doorFront) < 5 * DEG ? house : null, OBSTACLE_LEVELS[level] * scale);
  }

  /** 這一格要放寬到第幾級才過得去（TIGHT_SCALE 的索引）；-1 = 再放寬也過不去 */
  function tightness(n: THREE.Vector3) {
    for (let t = 0; t < TIGHT_SCALE.length; t++) if (routeClear(n, TIGHT_SCALE[t])) return t;
    return -1;
  }

  /** 兩點之間的大圓弧上，每 1° 檢查一次都走得過去（scale 倍的避障距離） */
  function segmentClear(a: THREE.Vector3, b: THREE.Vector3, scale = 1) {
    const angle = a.angleTo(b);
    const steps = Math.max(1, Math.ceil(angle / DEG));
    const p = new THREE.Vector3();
    for (let k = 1; k < steps; k++) {
      // 球面線性插值（slerp）：兩個單位向量之間沿大圓走
      const t = k / steps;
      const sinA = Math.sin(angle) || 1;
      p.copy(a).multiplyScalar(Math.sin((1 - t) * angle) / sinA).addScaledVector(b, Math.sin(t * angle) / sinA).normalize();
      if (!routeClear(p, scale)) return false;
    }
    return true;
  }

  /**
   * A* 找路：在綠球上鋪一張「離頂端 × 方位」的格子（每格 2°），障礙（房子、水潭、溜滑梯、食物）佔的格子不能走，
   * 從小豬現在的位置找到大門前。找不到回傳 null。
   * 回傳的是「轉折點」：把格子路線拉直（看得到的就直接連過去），小豬才不會一格一格鋸齒狀地走
   */
  function planRoute(from: THREE.Vector3): RoutePoint[] | null {
    const total = ROUTE_ROWS * ROUTE_COLS;
    const startCell = routeCell(from);
    const goalCell = routeCell(doorFront);
    const normals: THREE.Vector3[] = new Array(total);
    // 每一格的「窄度」：0 = 正常走得過、1／2 = 要放寬才過得去（走起來比較貴）、-1 = 擋住；-2 = 還沒算
    const tight = new Int8Array(total).fill(-2);
    const nodeNormal = (k: number) => (normals[k] ??= routeNormal(Math.floor(k / ROUTE_COLS), k % ROUTE_COLS));
    const cellTight = (k: number) => {
      if (k === startCell || k === goalCell) return 0;
      if (tight[k] === -2) tight[k] = tightness(nodeNormal(k));
      return tight[k];
    };
    // 隨機路線（一）：球面上鋪一層隨機的「起伏」（幾個方向、頻率隨機的 sin 疊起來），有的地方走起來比較貴（1～2.5 倍）。
    // 用平滑的起伏而不是每格獨立亂數：每格亂數只會讓路線歪七扭八，不會換一條「走廊」
    const waves = Array.from({ length: 4 }, () => ({
      dir: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
      freq: 3 + Math.random() * 6,
      phase: Math.random() * Math.PI * 2,
    }));
    const bumpCache = new Float32Array(total).fill(-1);
    const bump = (k: number) => {
      if (bumpCache[k] < 0) {
        const n = nodeNormal(k);
        let v = 0;
        for (const w of waves) v += Math.sin(n.dot(w.dir) * w.freq + w.phase);
        bumpCache[k] = 1 + 1.5 * ((v / waves.length + 1) / 2);
      }
      return bumpCache[k];
    };

    const g = new Float32Array(total);
    const came = new Int32Array(total);
    const closed = new Uint8Array(total);
    // 簡單的二元堆積（最小堆）：[f, cell]
    let heap: Array<[number, number]> = [];
    const push = (f: number, k: number) => {
      heap.push([f, k]);
      let c = heap.length - 1;
      while (c > 0) {
        const parent = (c - 1) >> 1;
        if (heap[parent][0] <= heap[c][0]) break;
        [heap[parent], heap[c]] = [heap[c], heap[parent]];
        c = parent;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1;
          const r = l + 1;
          let m = c;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };

    /** A*：從 src 格走到 dst 格，回傳經過的格子（含頭尾）；走不到回傳 null */
    const search = (src: number, dst: number): number[] | null => {
      g.fill(Infinity);
      came.fill(-1);
      closed.fill(0);
      heap = [];
      const dstN = nodeNormal(dst);
      g[src] = 0;
      push(nodeNormal(src).angleTo(dstN), src);
      while (heap.length) {
        const [, k] = pop();
        if (closed[k]) continue;
        closed[k] = 1;
        if (k === dst) {
          const keys: number[] = [];
          for (let c = dst; c !== -1; c = came[c]) keys.push(c);
          return keys.reverse();
        }
        const i = Math.floor(k / ROUTE_COLS);
        const j = k % ROUTE_COLS;
        for (let di = -1; di <= 1; di++) {
          const ni = i + di;
          if (ni < 0 || ni >= ROUTE_ROWS) continue;
          for (let dj = -1; dj <= 1; dj++) {
            if (!di && !dj) continue;
            const nk = ni * ROUTE_COLS + ((j + dj + ROUTE_COLS) % ROUTE_COLS);
            if (closed[nk]) continue;
            const t = cellTight(nk);
            if (t < 0) continue;
            const cost = g[k] + nodeNormal(k).angleTo(nodeNormal(nk)) * TIGHT_COST[t] * bump(nk);
            if (cost < g[nk]) {
              g[nk] = cost;
              came[nk] = k;
              push(cost + nodeNormal(nk).angleTo(dstN), nk);
            }
          }
        }
      }
      return null;
    };

    // 隨機路線（二）：先隨機挑一個「途經點」——在起點和大門之間、往左或往右偏一段（偏多少也隨機），
    // 路線變成「起點 → 途經點 → 大門」。每次的途經點不同，就會走不同的路：有時穿過房子中間、有時從旁邊繞
    let cellKeys: number[] | null = null;
    /** 途經點在 cellKeys 裡的位置：拉直時要分兩段拉，不然途經點會被拉掉 */
    let viaIndex = -1;
    const distance = from.angleTo(doorFront);
    /** 這一格不能走的話，往外一圈一圈找最近的可走格子（最多 4 圈）；都不行回傳 -1 */
    const nearestWalkable = (cell: number) => {
      const ci = Math.floor(cell / ROUTE_COLS);
      const cj = cell % ROUTE_COLS;
      for (let ring = 0; ring <= 4; ring++) {
        for (let di = -ring; di <= ring; di++) {
          for (let dj = -ring; dj <= ring; dj++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
            const ni = ci + di;
            if (ni < 0 || ni >= ROUTE_ROWS) continue;
            const nk = ni * ROUTE_COLS + ((cj + dj + ROUTE_COLS) % ROUTE_COLS);
            if (cellTight(nk) >= 0) return nk;
          }
        }
      }
      return -1;
    };
    for (let attempt = 0; attempt < 10 && !cellKeys; attempt++) {
      const along = 0.2 + Math.random() * 0.6;
      // 起點往大門方向的切線，再隨機往左或往右轉 20～110°
      const toward = tangentOf(doorFront.clone().sub(from), from);
      if (toward.lengthSq() < 0.5) break;
      const turnSide = (Math.random() < 0.5 ? -1 : 1) * (20 + Math.random() * 90) * DEG;
      const dir = toward.applyAxisAngle(from, turnSide);
      const via = rotateOnSphere(from, dir, distance * along);
      // 挑到房子、水潭上：往旁邊找最近走得過去的格子（窄縫也可以，只是比較貴）
      const viaCell = nearestWalkable(routeCell(via));
      if (viaCell < 0 || viaCell === startCell || viaCell === goalCell) continue;
      const first = search(startCell, viaCell);
      if (!first) continue;
      const second = search(viaCell, goalCell);
      if (!second) continue;
      cellKeys = [...first, ...second.slice(1)];
      viaIndex = first.length - 1;
    }
    // 途經點都不好挑（太近、挑到障礙）：直接從起點找到大門
    if (!cellKeys) cellKeys = search(startCell, goalCell);
    if (!cellKeys) return null;
    const cells = cellKeys.map((k) => nodeNormal(k).clone());
    const cellTights = cellKeys.map((k) => Math.max(0, cellTight(k)));
    // 起點用小豬真正的位置、終點用大門前（格子點只是近似）
    cells[0] = from.clone();
    cells[cells.length - 1] = doorFront.clone();
    // 拉直：從目前的點，往後找「直線走得過去」的最遠那一點當下一個轉折點。
    // 直線檢查用「這兩點之間格子最窄的那一級」：原本就要擠過窄縫的那段才放寬，其他段照正常距離。
    // 有途經點時分兩段拉直（起點 → 途經點、途經點 → 大門）：一起拉的話，放寬後障礙變小，
    // 常常一條直線就從起點拉到大門，途經點被拉掉，每次又變成同一條路
    const points: RoutePoint[] = [];
    const stops = viaIndex > 0 ? [viaIndex, cells.length - 1] : [cells.length - 1];
    let a = 0;
    for (const stop of stops) {
      while (a < stop) {
        let b = stop;
        const needed = (to: number) => {
          let t = 0;
          for (let m = a + 1; m <= to; m++) t = Math.max(t, cellTights[m]);
          return TIGHT_SCALE[t];
        };
        while (b > a + 1 && !segmentClear(cells[a], cells[b], needed(b))) b--;
        points.push({ point: cells[b], scale: OBSTACLE_LEVELS[level] * needed(b) });
        a = b;
      }
    }
    // 最後一點就是大門前，那一段由 walkLeg 的最後一段負責
    finalScale = points.pop()?.scale ?? OBSTACLE_LEVELS[level];
    return points;
  }

  /** 從目前等級開始規劃路線；找不到就一級一級放寬，直到找到為止（最後一級不避障，一定找得到） */
  function planRouteEscalating(from: THREE.Vector3): RoutePoint[] {
    for (;;) {
      const found = planRoute(from);
      if (found) return found;
      if (level >= OBSTACLE_LEVELS.length - 1) return [];
      level++;
    }
  }

  /** 走路線上的下一段；路線走完就走最後一段到大門前 */
  function walkLeg() {
    legBest = Infinity;
    legStall = 0;
    if (routeIndex < route.length) {
      const { point: target, scale } = route[routeIndex];
      pig.goTo({
        getTarget: () => (phase === 'toDoor' ? target : null),
        arriveRad: 1.5 * DEG,
        allowNearTop: true,
        // 這一段要擠過窄縫的話，小豬自己的避障也跟著放寬（不然走到縫前又自己轉開）
        obstacleScale: scale,
        timeoutSeconds: THREE.MathUtils.clamp(
          (pig.object.position.clone().normalize().angleTo(target) / DEG / Math.max(pig.settings.roamSpeedDegrees, 0.5)) * 3 + 5,
          6,
          30,
        ),
        onDone: (arrived) => {
          if (phase !== 'toDoor') return;
          if (!arrived) {
            walkFailed();
            return;
          }
          routeIndex++;
          walkLeg();
        },
      });
      return;
    }
    pig.goTo({
      getTarget: () => (phase === 'toDoor' ? doorFront : null),
      arriveRad: 1 * DEG,
      ignoreRoot: getHouse()?.object ?? null,
      allowNearTop: true,
      obstacleScale: finalScale,
      timeoutSeconds: THREE.MathUtils.clamp(
        (pig.object.position.clone().normalize().angleTo(doorFront) / DEG / Math.max(pig.settings.roamSpeedDegrees, 0.5)) * 3 + 8,
        10,
        40,
      ),
      onDone: (arrived) => {
        if (phase !== 'toDoor') return;
        if (!arrived) {
          walkFailed();
          return;
        }
        mustPlay = false;
        enterFrom.copy(pig.object.position);
        pig.setPuppet(true);
        // 烏雲（連雨、閃電）先收起來：進門、溜滑梯、泡在水裡都不該有雲跟著，爬上岸才回來
        pig.cloud.setSuppressed(true);
        setPhase('entering');
      },
    });
  }

  /**
   * 這一段走不到（逾時、卡住）：放寬一級避障，從現在的位置重新規劃路線再走。
   * 最後一級是完全不避障（直直走過去），所以一定走得到；小豬不會原地縮小直接去。
   * 自動冒險在最後一級也失敗才放棄；「去看看」會再重試幾次
   */
  function walkFailed() {
    if (level < OBSTACLE_LEVELS.length - 1) level++;
    else lastLevelRetries++;
    if (lastLevelRetries > (mustPlay ? 5 : 1)) {
      mustPlay = false;
      finish();
      return;
    }
    route = planRouteEscalating(pig.object.position.clone().normalize());
    routeIndex = 0;
    walkLeg();
  }

  /** 「去看看」按鈕發起的這一趟：一定要走進龍兔的家玩到溜滑梯（放寬避障重試，不會原地縮小直接去） */
  let mustPlay = false;

  /**
   * 畫面上的「去看看」按鈕：不管小豬在哪裡、正在做什麼，都去龍兔的家玩溜滑梯。
   * 先規劃一條繞過障礙的路線走去大門、走進去（一定看得到小豬跑進龍兔的家）；
   * 找不到路、卡住就放寬避障，從房子中間擠過去（模型穿插一點沒關係），不會原地縮小直接去。
   * 已經在冒險中回傳 false（按鈕這時是反灰的）
   */
  function playNow() {
    if (phase !== 'idle') return fail(`小豬已經在冒險中：${PHASE_LABEL[phase]}`);
    mustPlay = true;
    if (start(true)) return true;
    // 出發不了只有「溜滑梯、水潭、大門還沒準備好」這種情況（按鈕那時是反灰的）；不會改成原地縮小直接去
    mustPlay = false;
    return false;
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
    if (phase === 'toDoor') {
      // 先切到下一個階段再取消走路：取消會呼叫 goTo 的 onDone(false)，
      // 那時 phase 已經不是 toDoor，onDone 直接略過，不會先把這一趟「結束」掉再重來
      setPhase('vanish');
      pig.cancelGoTo();
    }
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

    if (phase === 'toDoor') {
      // 走路交給 pig.ts 的 goTo，走到時 onDone 會切到 entering
      // 這一段一直沒有更接近目標（被擋住、在原地繞）→ 取消這一段，goTo 的 onDone(false) 會重新規劃路線
      const legTarget = routeIndex < route.length ? route[routeIndex].point : doorFront;
      const distance = pig.object.position.clone().normalize().angleTo(legTarget);
      if (distance < legBest - 0.3 * DEG) {
        legBest = distance;
        legStall = 0;
      } else {
        legStall += deltaTime;
      }
      if (legStall > LEG_STALL_SECONDS) {
        legStall = 0;
        legBest = Infinity;
        pig.cancelGoTo();
      }
      return;
    }

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
    /** 畫面上的「去看看」：規劃路線走去大門、走進去再溜（一定會玩到溜滑梯） */
    playNow,
    /** 現在能不能去玩：溜滑梯建好了（開場時要等它伸出來）、水潭開著、龍兔的家大門載入了 */
    canPlay: () => !!getRide() && !!getPond()?.settings.enabled && !!getHouse()?.door,
    testSplashFish,
    getPhase: () => phase,
    /**
     * 取消「還在走去大門」的冒險（例如小豬被叫去逗弄蜜蜂）：先回到 idle 再取消走路，
     * goTo 的 onDone(false) 看到 phase 已經不是 toDoor 就會略過（不會重新規劃路線把別人的指令蓋掉）。
     * 已經進屋、溜滑梯（操偶中）就不能中途取消 → 回傳 false
     */
    cancelWalk: () => {
      if (phase === 'idle') return true;
      if (phase !== 'toDoor') return false;
      setPhase('idle');
      pig.cancelGoTo();
      cooldown = randomCooldown();
      return true;
    },
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
