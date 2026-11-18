import * as THREE from 'three';

/**
 * 龍兔的家（mainHall 香菇屋）三樓 → 小水潭邊的溜滑梯。
 *
 * 全部用程式產生：起點在香菇屋三樓外牆、終點在水潭岸邊，
 * 兩端都會動（水潭可以拖曳），所以滑道的曲線每次都要重新算，不能是固定的模型。
 *
 * 組成：
 *   1. 三樓外牆的拱門（洞，大小可調、貼著弧形牆面）＋往外延伸的平台（長、寬可調）＋兩側欄杆
 *   2. 滑道：U 形槽沿著曲線掃出來；一開始平、中段陡、最後平平地滑進水潭
 *
 * 座標：全部在 ground 的本地座標（球心在原點、半徑 groundRadius），group 掛在 ground 底下。
 * 長度單位用「香菇屋模型的 1 單位」換算（unit），房子縮放改了，滑梯的粗細也跟著變。
 */
export type MainHallSlideSettings = {
  enabled: boolean;
  /**
   * 出口平台高度（香菇屋模型座標的 y；三樓地板約 5.75，菇傘從 6.87 開始、外緣垂到 6.18）。
   * 太高會讓平台、欄杆、滑道邊緣頂進菇傘：程式會量菇傘底面，自動降到「最高可行高度」並改回這個值。
   */
  startHeight: number;
  /** 出口位置繞房子轉多少度（0 = 正對水潭）；用來避開香菇串、窗戶 */
  exitAngleDegrees: number;
  /** 頂端平台從外牆往外延伸多長（香菇屋模型單位）；滑道從平台末端接出去 */
  platformLength: number;
  /**
   * 頂端平台寬度（香菇屋模型單位，最窄 0.1）。
   * 比「滑道外緣＋兩側欄杆的空間」窄時不放欄杆（欄杆會插進滑道），變成一塊窄木板
   */
  platformWidth: number;
  /** 牆上出口（洞）的寬度（香菇屋模型單位） */
  doorWidth: number;
  /** 牆上出口（洞）的高度（香菇屋模型單位）；頂到菇傘的話會自動縮到菇傘下面並改回這個值 */
  doorHeight: number;
  /**
   * 滑道平台長度（香菇屋模型單位，最短 0.1）：滑道最上面那段「平的」U 形槽，接在頂端平台後面，平平一段之後才開始往下滑。
   * 和 platformLength 是兩個東西：platformLength 是房子外牆伸出去的木平台（有欄杆），這個是滑道本身的平段。
   */
  chuteFlatLength: number;
  /**
   * 側面弧度（−1～1）：從側面看滑道的高度曲線。
   * 0 = 平均往下；正 = 一開始陡、接近水面變平（往下凹的弧線）；負 = 一開始平緩、後段才陡（往上鼓的弧線）
   */
  heightArc: number;
  /** 側面平滑（0～1）：起滑和落水兩端的緩衝區有多長；越大兩端越平順，中段會稍微陡一點 */
  heightSmooth: number;
  /** 滑道往側邊彎的程度（正負 = 往左／右彎） */
  curve: number;
  /** 滑道寬度（香菇屋模型單位） */
  width: number;
  /** 終點伸進水潭多少（0 = 剛好在岸邊，1 = 到水潭中心） */
  endInset: number;
  chuteColor: string;
  supportColor: string;
};

export const MAIN_HALL_SLIDE_DEFAULT: MainHallSlideSettings = {
  enabled: true,
  // 使用者在面板上調好的值
  startHeight: 6.72,
  exitAngleDegrees: 19,
  platformLength: 0.6,
  platformWidth: 0.8,
  doorWidth: 0.65,
  doorHeight: 0.6,
  chuteFlatLength: 0.45,
  heightArc: -0.8,
  heightSmooth: 0.5,
  curve: 0,
  width: 0.9,
  endInset: 0.15,
  chuteColor: '#ff674d',
  supportColor: '#f08a4b',
};

type PondInfo = { normal: THREE.Vector3; size: number };

/**
 * 給小豬溜滑梯用的路線（全部是 ground 座標）：
 * 從三樓洞口出來 → 走過木平台 → 沿滑道曲線滑進水潭
 */
export type SlideRide = {
  /** 洞口底部中央（平台頂面、貼著外牆）：小豬從這裡冒出來 */
  door: THREE.Vector3;
  /** 往外的方向（離開房子） */
  outward: THREE.Vector3;
  /** 房子的「上」 */
  houseUp: THREE.Vector3;
  /** 滑道曲線：起點是平台末端，終點在水潭裡；曲線上的點是「槽底」 */
  curve: THREE.CatmullRomCurve3;
};

type CreateMainHallSlideOptions = {
  ground: THREE.Object3D;
  groundRadius: number;
  /** 香菇屋的屋身 mesh（模型還沒載入時回傳 null） */
  getHouseBody: () => THREE.Mesh | null;
  /** 水潭的地表方向和半徑（水潭關掉時回傳 null） */
  getPond: () => PondInfo | null;
  /** 某些設定被自動修正（高度、平台寬度、洞高）時呼叫，面板用來更新顯示 */
  onAdjusted?: () => void;
  layout?: MainHallSlideSettings;
};

const SAMPLES = 90;
const PROFILE_STEPS = 10;

export function createMainHallSlide({
  ground,
  groundRadius,
  getHouseBody,
  getPond,
  onAdjusted,
  layout = MAIN_HALL_SLIDE_DEFAULT,
}: CreateMainHallSlideOptions) {
  const settings: MainHallSlideSettings = { ...layout };
  const group = new THREE.Group();
  group.name = 'main_hall_slide';

  const chuteMaterial = new THREE.MeshStandardMaterial({ color: settings.chuteColor, roughness: 0.45, side: THREE.DoubleSide });
  const supportMaterial = new THREE.MeshStandardMaterial({ color: settings.supportColor, roughness: 0.6 });
  const deckMaterial = new THREE.MeshStandardMaterial({ color: '#B9825A', roughness: 0.8 });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: '#4A2E22', roughness: 0.9 });
  /** 只用來對菇傘打射線（雙面才能從菇傘裡面打到表面），不會畫出來 */
  const capProbeMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

  let chute: THREE.Mesh | null = null;
  /** 最近一次建好的滑行路線（小豬溜滑梯用）；還沒建好、或被清掉時是 null */
  let ride: SlideRide | null = null;
  let chuteIndexCount = 0;
  let builtKey = '';
  let introGrow = 1;
  let checkTimer = 0;

  // 計算用的暫存
  const bodyCenter = new THREE.Vector3();
  const pondWorld = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const groundInverse = new THREE.Matrix4();

  function disposeGroup() {
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    group.clear();
    chute = null;
    ride = null;
  }

  /** 把 ground 本地座標的點，沿著球心方向調到離地 height 的高度 */
  function atHeight(point: THREE.Vector3, height: number, target = new THREE.Vector3()) {
    return target.copy(point).normalize().multiplyScalar(groundRadius + height);
  }

  /**
   * 重新算出整座溜滑梯。
   * 回傳 false 代表條件還沒到（模型沒載入、水潭關掉），先不畫。
   */
  function build(body: THREE.Mesh, pond: PondInfo) {
    disposeGroup();
    ground.updateMatrixWorld(true);
    body.updateWorldMatrix(true, false);
    groundInverse.copy(ground.matrixWorld).invert();

    // ── 單位換算：香菇屋模型 1 單位 = ground 座標多長 ──
    const bodyScale = new THREE.Vector3();
    body.getWorldScale(bodyScale);
    const groundScale = new THREE.Vector3();
    ground.getWorldScale(groundScale);
    const unit = bodyScale.y / groundScale.y;

    const bodyInverse = new THREE.Matrix4().copy(body.matrixWorld).invert();
    // 屋身座標 → ground 座標的小工具
    const toGround = (pBody: THREE.Vector3) => pBody.clone().applyMatrix4(body.matrixWorld).applyMatrix4(groundInverse);

    // 出口方向（屋身座標的水平方向）：朝水潭，再依 exitAngleDegrees 繞房子轉
    pondWorld.copy(pond.normal).multiplyScalar(groundRadius).applyMatrix4(ground.matrixWorld);
    const pondInBody = pondWorld.clone().applyMatrix4(bodyInverse);
    dir.set(pondInBody.x, 0, pondInBody.z).normalize();
    dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(settings.exitAngleDegrees));

    /**
     * 從屋身外面、某個高度、某個方向往中心軸打射線，找外牆上的點（屋身座標）。
     * 材質是單面，所以要從外面往裡打（從裡面往外打不到外牆）。
     */
    const wallPointAt = (height: number, direction: THREE.Vector3) => {
      const originWorld = new THREE.Vector3(0, height, 0).addScaledVector(direction, 6).applyMatrix4(body.matrixWorld);
      bodyCenter.set(0, height, 0).applyMatrix4(body.matrixWorld);
      raycaster.set(originWorld, bodyCenter.clone().sub(originWorld).normalize());
      const hit = raycaster.intersectObject(body, false)[0];
      // 打不到（理論上不會）就假設牆在半徑 1.4 的地方
      const p = hit ? hit.point.clone().applyMatrix4(bodyInverse) : new THREE.Vector3(0, height, 0).addScaledVector(direction, 1.4);
      p.y = height;
      return p;
    };

    // 菇傘：平台、欄杆、滑道邊緣、洞都不能頂進去
    // 用「雙面材質的代理物件」打射線：菇傘材質是單面，點如果已經在菇傘的實心範圍裡，
    // 從裡面往上打會打不到東西（被當成「上面沒有菇傘」），就漏掉了
    const cap = body.parent?.getObjectByName('mushroom_house_cap') as THREE.Mesh | undefined;
    let capProxy: THREE.Mesh | null = null;
    if (cap) {
      cap.updateWorldMatrix(true, false);
      capProxy = new THREE.Mesh(cap.geometry, capProbeMaterial);
      capProxy.matrixAutoUpdate = false;
      capProxy.matrixWorld.copy(cap.matrixWorld);
    }
    const capRay = new THREE.Raycaster();
    const bodyUpWorld = new THREE.Vector3(0, 1, 0).transformDirection(body.matrixWorld);
    const bodyDownWorld = bodyUpWorld.clone().negate();
    /**
     * ground 座標的 base 點，沿房子的「上」到菇傘還有多少空間：
     *   在菇傘外、上方有菇傘 → 正的距離；上方沒有菇傘 → Infinity；
     *   已經在菇傘裡面（往上穿過菇傘表面奇數次）→ 負的（往下要退多少才會出來）
     */
    const capClearanceAbove = (base: THREE.Vector3) => {
      if (!capProxy) return Infinity;
      const originWorld = base.clone().applyMatrix4(ground.matrixWorld);
      capRay.set(originWorld, bodyUpWorld);
      const upHits = capRay.intersectObject(capProxy, false);
      if (upHits.length === 0) return Infinity;
      capRay.set(originWorld, bodyDownWorld);
      const downHits = capRay.intersectObject(capProxy, false);
      // 在菇傘「實心」裡面：往上、往下都會穿過奇數次表面。
      // 只看往上的話會誤判：傘殼底下貼近屋身的地方是空的（空腔），那裡往上也只穿過一層殼
      if (upHits.length % 2 === 1 && downHits.length % 2 === 1) {
        return -downHits[0].point.applyMatrix4(groundInverse).distanceTo(base);
      }
      return upHits[0].point.applyMatrix4(groundInverse).distanceTo(base);
    };

    /**
     * 同上，但在 base 周圍（中心＋前後左右各偏 0.1）都量一次取最小值：
     * 欄杆柱、扶手有粗細，菇傘邊緣又很陡；只量中心的話，中心剛好在傘緣外、偏 0.05 的那一側卻在傘緣下面
     */
    const capRoom = (base: THREE.Vector3, axisA: THREE.Vector3, axisB: THREE.Vector3) => {
      const r = 0.1 * unit;
      return Math.min(
        capClearanceAbove(base),
        capClearanceAbove(base.clone().addScaledVector(axisA, r)),
        capClearanceAbove(base.clone().addScaledVector(axisA, -r)),
        capClearanceAbove(base.clone().addScaledVector(axisB, r)),
        capClearanceAbove(base.clone().addScaledVector(axisB, -r)),
      );
    };

    // ── 尺寸（香菇屋模型單位 → ground 座標）──
    const chuteHalfOuter = (settings.width / 2 + 0.1) * unit;
    const chuteDepth = (settings.width / 2) * 0.75 * unit;
    const fullRailHeight = 0.55 * unit;
    const minRailHeight = 0.18 * unit;
    // 平台半寬：最窄 0.1（半寬 0.05）。
    // 要放欄杆至少要「滑道外緣＋0.25」（欄杆柱在邊緣內 0.06、柱半徑 0.05 → 和滑道唇邊還有約 0.14 的空隙）；
    // 比這個窄就不放欄杆（變成一塊窄木板），不然欄杆會插進滑道
    const railHalfWidth = chuteHalfOuter + 0.25 * unit;
    let adjusted = false;
    const platformHalfWidth = Math.max((settings.platformWidth / 2) * unit, 0.05 * unit);
    const platformLength = Math.max(0.3, settings.platformLength) * unit;
    const platformThickness = 0.16 * unit;
    const leadIn = Math.max(0.1, settings.chuteFlatLength) * unit;
    const straightRun = chuteHalfOuter + 0.4 * unit;

    /** 某個高度下的出口座標系：外牆點、房子的上、往外、側邊、外牆半徑 */
    const frameAt = (height: number) => {
      const wallBody = wallPointAt(height, dir);
      const wall = toGround(wallBody);
      const houseUp = toGround(new THREE.Vector3(0, height + 1, 0)).sub(toGround(new THREE.Vector3(0, height, 0))).normalize();
      const outward = toGround(wallBody.clone().add(dir)).sub(wall).normalize();
      const sideAxis = new THREE.Vector3().crossVectors(houseUp, outward).normalize();
      const wallRadius = Math.hypot(wallBody.x, wallBody.z); // 屋身座標（模型單位）
      return { wallBody, wall, houseUp, outward, sideAxis, wallRadius };
    };

    /**
     * 這個高度下，平台、欄杆、滑道平段＋起滑段離菇傘最緊的地方還剩多少空間（負的 = 會頂進菇傘）。
     * 逐點往上打射線量菇傘底面：菇傘底面從貼牆處（約 6.87）往外斜到外緣（約 6.18），每個位置能用的高度都不一樣。
     */
    const capSlack = (f: ReturnType<typeof frameAt>) => {
      let slack = Infinity;
      const probe = (alongOut: number, lateral: number, need: number) => {
        const base = f.wall.clone().addScaledVector(f.outward, alongOut).addScaledVector(f.sideAxis, lateral);
        slack = Math.min(slack, capRoom(base, f.outward, f.sideAxis) - need);
      };
      const step = 0.25 * unit;
      // 平台頂面（留 0.05）與兩側欄杆（最矮 0.18＋扶手 0.045＋留 0.05）
      // 平台頂面：整個寬度密集取樣（之後平台可能因為香菇串收窄，欄杆會移到裡面，所以每個位置都要量）。
      // 欄杆不算在這裡：菇傘底下空間不夠放欄杆的地方，那幾根欄杆就不放（見下面），不必為了欄杆把整個出口壓低
      for (let along = 0.05 * unit; along <= platformLength; along += step) {
        for (let k = -1; k <= 1.0001; k += 0.125) probe(along, k * platformHalfWidth, 0.05 * unit);
      }
      // 滑道平段＋起滑段：槽壁高度（槽深＋留 0.08）
      for (let along = platformLength; along <= platformLength + leadIn + straightRun; along += step) {
        for (const k of [-1, 0, 1]) probe(along, k * chuteHalfOuter, chuteDepth + 0.08 * unit);
      }
      return slack;
    };

    // ── 1. 出口高度：太高就自動降到最高可行高度（降一次外牆位置會變，所以多算幾次）──
    // 每次最多降 0.3：在菇傘裡面時量到的「要退多少」不一定準，一次降太多會降過頭
    let height = settings.startHeight;
    for (let iteration = 0; iteration < 16; iteration++) {
      const slack = capSlack(frameAt(height));
      if (slack >= 0) break;
      height += Math.max(slack / unit - 0.01, -0.3);
    }
    if (height < settings.startHeight - 1e-3) {
      settings.startHeight = Math.floor(height * 100) / 100;
      adjusted = true;
    }
    const { wallBody, wall, houseUp, outward, sideAxis, wallRadius } = frameAt(settings.startHeight);

    // ── 香菇串：平台很寬時會撞到菇傘邊垂下來的香菇串，平台寬度收到香菇串前面 ──
    let halfWidth = platformHalfWidth;
    body.parent?.children.forEach((child) => {
      if (!/_hanger_\d+$/.test(child.name)) return;
      const box = new THREE.Box3().setFromObject(child);
      let minLateral = Infinity;
      let maxLateral = -Infinity;
      let minAlong = Infinity;
      let maxAlong = -Infinity;
      let minUp = Infinity;
      let maxUp = -Infinity;
      for (let k = 0; k < 8; k++) {
        const corner = new THREE.Vector3(
          k & 1 ? box.max.x : box.min.x,
          k & 2 ? box.max.y : box.min.y,
          k & 4 ? box.max.z : box.min.z,
        ).applyMatrix4(groundInverse).sub(wall);
        const lateral = corner.dot(sideAxis);
        const along = corner.dot(outward);
        const up = corner.dot(houseUp);
        minLateral = Math.min(minLateral, lateral);
        maxLateral = Math.max(maxLateral, lateral);
        minAlong = Math.min(minAlong, along);
        maxAlong = Math.max(maxAlong, along);
        minUp = Math.min(minUp, up);
        maxUp = Math.max(maxUp, up);
      }
      // 不在平台的前後範圍、或不在平台到欄杆頂的高度範圍 → 碰不到（平台往牆裡埋的部分在屋身裡，不算）
      if (maxAlong < 0 || minAlong > platformLength) return;
      if (maxUp < -platformThickness || minUp > fullRailHeight + 0.1 * unit) return;
      // 香菇串跨過中線（正擋在出口前面）→ 改寬度也避不開，交給「出口繞房子」去轉開
      if (minLateral < 0 && maxLateral > 0) return;
      const nearest = minLateral > 0 ? minLateral : -maxLateral;
      // 欄杆柱在邊緣內 0.06、柱半徑 0.05，再留 0.08
      halfWidth = Math.min(halfWidth, nearest - 0.08 * unit);
    });
    halfWidth = Math.max(halfWidth, 0.05 * unit);
    const hasRails = halfWidth >= railHalfWidth - 1e-6;
    if (halfWidth < platformHalfWidth - 1e-6) {
      settings.platformWidth = Math.floor(((halfWidth / unit) * 2) * 100) / 100;
      adjusted = true;
    }

    // ── 拱門（洞）：網格建出拱形，每個頂點用射線貼到弧形外牆上 ──
    // 不用平面：牆是圓弧，洞一寬，平面的兩側就會浮在牆外
    {
      // 洞高不能伸到菇傘底下：在牆外 0.3～0.8 處、平台高度往上量到菇傘底面，洞頂要低於最低的那個 0.06。
      // 不量牆邊本身：菇傘底面中間是空的（屋身直接伸進傘裡），貼著牆往上打會穿過去、量不到傘的下緣；
      // 也不能量洞頂那一點：伸進傘殼底下的洞頂不算「在菇傘裡」
      let doorRoom = Infinity;
      for (const offset of [0.3, 0.5, 0.8]) {
        doorRoom = Math.min(doorRoom, capRoom(wall.clone().addScaledVector(outward, offset * unit), outward, sideAxis) / unit - 0.06);
      }
      if (settings.doorHeight > doorRoom) {
        settings.doorHeight = Math.max(0.3, Math.floor(doorRoom * 100) / 100);
        adjusted = true;
      }
      const halfDoor = Math.max(0.15, settings.doorWidth / 2);
      const doorHeight = Math.max(0.3, settings.doorHeight);
      // 上面是半圓（洞比寬還矮時變成半橢圓）
      const archRadiusY = Math.min(halfDoor, doorHeight);
      const archBase = doorHeight - archRadiusY;
      const halfWidthAt = (y: number) =>
        y <= archBase ? halfDoor : halfDoor * Math.sqrt(Math.max(0, 1 - ((y - archBase) / archRadiusY) ** 2));
      const COLS = 12;
      const ROWS = 12;
      const positions: number[] = [];
      const indices: number[] = [];
      const yAxis = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i <= ROWS; i++) {
        const y = (doorHeight * i) / ROWS;
        const half = halfWidthAt(y);
        for (let j = 0; j <= COLS; j++) {
          const x = (j / COLS) * 2 * half - half;
          // 沿著牆面的弧長 x → 繞房子轉的角度
          const around = dir.clone().applyAxisAngle(yAxis, -x / Math.max(wallRadius, 0.3));
          const onWall = wallPointAt(settings.startHeight + y, around);
          // 往外推 0.03：剛好貼在牆面上，不會跟牆 z-fighting
          onWall.addScaledVector(around, 0.03);
          const g = toGround(onWall);
          positions.push(g.x, g.y, g.z);
        }
      }
      for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j < COLS; j++) {
          const a0 = i * (COLS + 1) + j;
          const b0 = a0 + COLS + 1;
          // 順序要讓正面朝外（材質是單面）：寫反的話三角形全部朝向牆裡，從外面看會被剔除，洞整個消失
          indices.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const door = new THREE.Mesh(geometry, doorMaterial);
      door.name = 'main_hall_slide_door';
      group.add(door);
    }

    // ── 門口延伸平台＋兩側欄杆 ──
    // 從三樓外牆往外伸出一塊長方形平台（長、寬可調），滑道從平台末端接出去
    // 平台要往牆裡埋多深：外牆是圓弧，平台越寬、兩側離牆越遠；
    // 埋的深度 = 圓弧在平台兩側的「退後量」＋0.2，兩側才不會和牆之間露縫（比房子還寬時埋到中心軸）
    const halfWidthModel = halfWidth / unit;
    const insetModel =
      (halfWidthModel < wallRadius ? wallRadius - Math.sqrt(wallRadius * wallRadius - halfWidthModel * halfWidthModel) : wallRadius) + 0.2;
    const platformInset = insetModel * unit;
    const platformEnd = wall.clone().addScaledVector(outward, platformLength);
    {
      const total = platformLength + platformInset;
      const platform = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2, platformThickness, total), deckMaterial);
      platform.name = 'main_hall_slide_platform';
      // Box 的 x = 側邊、y = 房子的上、z = 往外
      platform.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sideAxis, houseUp, outward));
      platform.position
        .copy(wall)
        .addScaledVector(outward, (platformLength - platformInset) / 2)
        .addScaledVector(houseUp, -platformThickness / 2);
      platform.castShadow = true;
      platform.receiveShadow = true;
      group.add(platform);

      // 兩側欄杆：沿平台邊緣一排柱子＋扶手，從牆邊到平台末端（末端不封口，留給滑道）
      // 欄杆所在那一側，牆面比出口中心退後多少（圓弧）；比房子寬的話就從平台最裡面開始
      const railSide = halfWidth - 0.06 * unit;
      const railLateral = railSide / unit;
      const wallSetback =
        railLateral < wallRadius ? Math.sqrt(wallRadius * wallRadius - railLateral * railLateral) - wallRadius : -insetModel;
      const railStart = Math.max(wallSetback + 0.12, -insetModel + 0.1) * unit;
      const postCount = Math.max(2, Math.round((platformLength - railStart) / (0.35 * unit)) + 1);
      /** 扶手沿著一段連續的柱頂連起來（高度可能不一樣，用折線而不是一條直線） */
      const addRail = (railPoints: THREE.Vector3[]) => {
        if (railPoints.length < 2) return;
        const railPath = new THREE.CurvePath<THREE.Vector3>();
        for (let k = 0; k < railPoints.length - 1; k++) railPath.add(new THREE.LineCurve3(railPoints[k], railPoints[k + 1]));
        const rail = new THREE.Mesh(
          new THREE.TubeGeometry(railPath, (railPoints.length - 1) * 2, 0.045 * unit, 5, false),
          supportMaterial,
        );
        rail.name = 'main_hall_slide_rail';
        group.add(rail);
      };
      for (const sign of hasRails ? [-1, 1] : []) {
        let railPoints: THREE.Vector3[] = [];
        for (let k = 0; k < postCount; k++) {
          const along = THREE.MathUtils.lerp(railStart, platformLength - 0.06 * unit, k / (postCount - 1));
          const base = wall.clone().addScaledVector(outward, along).addScaledVector(sideAxis, sign * railSide);
          // 欄杆高度：正常 0.55；上方有菇傘時壓到菇傘底面下 0.15（扶手粗 0.045 也算進去）
          const room = capRoom(base, outward, sideAxis) - 0.15 * unit;
          // 菇傘底下連最矮的欄杆（0.18）都放不下：這根不放、扶手在這裡斷開（出口拉高時，貼近菇傘那段會沒有欄杆）
          if (room < minRailHeight) {
            addRail(railPoints);
            railPoints = [];
            continue;
          }
          const railHeight = Math.min(room, fullRailHeight);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * unit, 0.05 * unit, railHeight, 6), supportMaterial);
          post.name = 'main_hall_slide_rail_post';
          post.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), houseUp);
          post.position.copy(base).addScaledVector(houseUp, railHeight / 2);
          group.add(post);
          railPoints.push(base.clone().addScaledVector(houseUp, railHeight));
        }
        addRail(railPoints);
      }
    }
    void wallBody;
    if (adjusted) onAdjusted?.();

    // ── 2. 滑道曲線 ──
    // 滑道從平台末端外一點點、平台頂面的高度開始，先沿平台方向直直伸出一小段（導引段），再轉往水潭。
    // 少了導引段：平台很長時，滑道一開始就斜向水潭，起點那幾圈會壓回平台裡
    const chuteBegin = platformEnd.clone().addScaledVector(outward, 0.02 * unit);
    const startHeightAboveGround = chuteBegin.length() - groundRadius;
    // 滑道平台（平段）長度：最短 0.1。
    // 不用再限制最短長度：下面的水平路徑改成貝茲曲線，離開平段時一定先順著平台方向往外，不會轉回去壓到木平台
    const start = atHeight(chuteBegin.clone().addScaledVector(outward, leadIn), startHeightAboveGround);
    // 終點：水潭中心往房子方向退到岸邊，再依 endInset 往水裡伸
    const pondCenter = pond.normal.clone().normalize().multiplyScalar(groundRadius);
    const towardHouse = start.clone().normalize().sub(pond.normal.clone().normalize().multiplyScalar(start.clone().normalize().dot(pond.normal)));
    towardHouse.normalize();
    const endRadial = pond.size * (1 - THREE.MathUtils.clamp(settings.endInset, 0, 0.9));
    const endGround = pondCenter.clone().addScaledVector(towardHouse, endRadial);
    // 終點離水面一點點（水面比地表高 0.0016），滑下來就落進水裡
    const endHeight = 0.006;

    // ── 水平路徑：① 平段（滑道平台）→ ② 直線下坡段 → ③ 貝茲曲線轉向水潭（＋側彎）──
    // ② 為什麼要有：寬滑道急轉彎時，內側槽緣會往後掃。
    //   轉彎如果一離開平段就開始（平段只有 0.1、側彎 ±0.5、或出口要轉 90° 才接得到水潭），
    //   往後掃的槽緣會回到木平台和欄杆上（實測寬 1.6 時有十幾到三十幾點壓進平台）。
    //   所以不管平段多短，先直直往外滑「滑道外緣半寬＋0.4」，內側槽緣也離開平台了才開始轉。
    //   這段是下坡的一部分（不算平段），滑道平台長度仍然可以短到 0.1。
    const turnStart = start.clone().addScaledVector(outward, straightRun);
    const travel = turnStart.clone().normalize().angleTo(endGround.clone().normalize()) * groundRadius;
    // 側向彎曲的方向：沿途「前進方向 × 地表朝上」
    const lateralAxis = new THREE.Vector3()
      .crossVectors(turnStart.clone().normalize(), endGround.clone().normalize())
      .normalize();
    // 貝茲曲線的控制點在轉彎起點正前方：曲線起點方向 = 平台往外的方向，和直線段接得很順
    const control = turnStart.clone().addScaledVector(outward, travel * 0.35);

    // 先只算「水平位置」（球面上的方向），之後依實際走過的水平距離分配高度：
    // 直線段和轉彎段的取樣間距不同，用參數 t 分配高度的話，兩段交界的坡度會跳一下
    const horizontal: THREE.Vector3[] = [];
    const straightSteps = Math.max(2, Math.ceil(straightRun / (0.25 * unit)));
    for (let k = 0; k < straightSteps; k++) {
      horizontal.push(start.clone().addScaledVector(outward, (straightRun * k) / straightSteps).normalize());
    }
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const u = 1 - t;
      const h = turnStart
        .clone()
        .multiplyScalar(u * u)
        .addScaledVector(control, 2 * u * t)
        .addScaledVector(endGround, t * t)
        .normalize();
      // 側彎：用 sin²，頭尾的「值」和「斜率」都是 0 → 不改變轉彎起點的方向，也不改變終點位置
      const bend = Math.sin(Math.PI * t);
      h.addScaledVector(lateralAxis, bend * bend * settings.curve * travel).normalize();
      horizontal.push(h);
    }
    // 每個點沿路走過的水平距離（球面上的弧長）
    const along = [0];
    for (let i = 1; i < horizontal.length; i++) along.push(along[i - 1] + horizontal[i].angleTo(horizontal[i - 1]) * groundRadius);
    const total = along[along.length - 1] || 1;

    // 平段每 0.25 單位放一個點：只放頭尾兩點的話，曲線（CatmullRom）在長平段上會彎起來、不再是平的
    const points: THREE.Vector3[] = [];
    const flatSteps = Math.max(1, Math.ceil(leadIn / (0.25 * unit)));
    for (let k = 0; k < flatSteps; k++) {
      points.push(atHeight(chuteBegin.clone().addScaledVector(outward, (leadIn * k) / flatSteps), startHeightAboveGround));
    }
    // ── 高度（側面看的曲線）──
    // ① 平滑：起滑、落水兩端各有長度 ease 的緩衝區（二次曲線，坡度從 0 慢慢變陡／變平），中間等速下降。
    //    起點坡度一定是 0：斜面上的斷面會跟著傾斜、槽壁往後倒，一開始就下坡的話槽壁會伸回木平台底下。
    // ② 弧度：再把曲線往下凹（正）或往上鼓（負）：e + 0.3·arc·sin(πe)。
    //    係數 0.3 → 斜率倍率最小 1 − 0.3π ≈ 0.06 > 0，弧度拉到 ±1 也一路往下、不會往上翹；
    //    e 在頭尾的斜率是 0，乘上去還是 0 → 起點、終點的平順度不受弧度影響
    const ease = 0.05 + 0.4 * THREE.MathUtils.clamp(settings.heightSmooth, 0, 1);
    const arc = THREE.MathUtils.clamp(settings.heightArc, -1, 1);
    const profile = (t: number) => {
      let e: number;
      if (t < ease) e = (t * t) / (2 * ease * (1 - ease));
      else if (t > 1 - ease) e = 1 - ((1 - t) * (1 - t)) / (2 * ease * (1 - ease));
      else e = (t - ease / 2) / (1 - ease);
      return e + 0.3 * arc * Math.sin(Math.PI * e);
    };
    horizontal.forEach((h, i) => {
      const e = profile(along[i] / total);
      points.push(atHeight(h, THREE.MathUtils.lerp(startHeightAboveGround, endHeight, e)));
    });
    const curve = new THREE.CatmullRomCurve3(points);
    ride = {
      door: wall.clone().addScaledVector(outward, 0.05 * unit),
      outward: outward.clone(),
      houseUp: houseUp.clone(),
      curve,
    };

    // ── 滑道：U 形斷面沿曲線掃出來 ──
    {
      const w = (settings.width / 2) * unit;
      const depth = w * 0.75;
      const thickness = 0.1 * unit;
      // 斷面：內弧（左唇 → 槽底 → 右唇）＋外弧（右 → 左），首尾接起來是一個封閉的 U
      const profile: [number, number][] = [];
      for (let k = 0; k <= PROFILE_STEPS; k++) {
        const a = Math.PI + (k / PROFILE_STEPS) * Math.PI;
        profile.push([Math.cos(a) * w, depth + Math.sin(a) * depth]);
      }
      for (let k = PROFILE_STEPS; k >= 0; k--) {
        const a = Math.PI + (k / PROFILE_STEPS) * Math.PI;
        profile.push([Math.cos(a) * (w + thickness), depth + Math.sin(a) * (depth + thickness)]);
      }
      const ring = profile.length;
      const rings = SAMPLES * 2;
      const positions = new Float32Array((rings + 1) * ring * 3);
      const tangent = new THREE.Vector3();
      const up = new THREE.Vector3();
      const sideV = new THREE.Vector3();
      const p = new THREE.Vector3();
      for (let i = 0; i <= rings; i++) {
        const t = i / rings;
        curve.getPointAt(t, p);
        curve.getTangentAt(t, tangent);
        // 「上」= 球心往外的方向；側邊 = 前進方向 × 上
        up.copy(p).normalize();
        sideV.crossVectors(tangent, up).normalize();
        up.crossVectors(sideV, tangent).normalize();
        for (let k = 0; k < ring; k++) {
          const [s, u] = profile[k];
          const o = (i * ring + k) * 3;
          positions[o] = p.x + sideV.x * s + up.x * u;
          positions[o + 1] = p.y + sideV.y * s + up.y * u;
          positions[o + 2] = p.z + sideV.z * s + up.z * u;
        }
      }
      const indices: number[] = [];
      for (let i = 0; i < rings; i++) {
        for (let k = 0; k < ring; k++) {
          const k1 = (k + 1) % ring;
          const a = i * ring + k;
          const b = i * ring + k1;
          const c = (i + 1) * ring + k;
          const d = (i + 1) * ring + k1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      chute = new THREE.Mesh(geometry, chuteMaterial);
      chute.name = 'main_hall_slide_chute';
      chute.castShadow = true;
      chute.receiveShadow = true;
      chuteIndexCount = indices.length;
      group.add(chute);
    }

    // 滑梯不參與點擊、拖曳判定：不然點到滑道會擋住後面的房子、食物
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) mesh.raycast = () => {};
    });
    applyIntro();
  }

  /** 開場：房子長完後，滑道從三樓一路「伸」到水潭（只畫前面一段三角形） */
  function applyIntro() {
    group.visible = settings.enabled && introGrow > 0.001 && group.children.length > 0;
    if (chute) {
      const visible = Math.floor((chuteIndexCount / 3) * THREE.MathUtils.clamp(introGrow, 0, 1)) * 3;
      chute.geometry.setDrawRange(0, visible);
    }
    // 平台、欄杆、門：滑道開始伸出來就一起出現
    for (const child of group.children) {
      if (child !== chute) child.visible = introGrow > 0.02;
    }
  }

  function applySettings() {
    chuteMaterial.color.set(settings.chuteColor);
    supportMaterial.color.set(settings.supportColor);
    builtKey = ''; // 形狀相關的設定可能改了，下一格重建
    checkTimer = 0;
    update(0);
  }

  /** 每 0.25 秒檢查一次水潭有沒有移動、模型有沒有載入，有變才重建 */
  function update(deltaTime: number) {
    checkTimer -= deltaTime;
    if (checkTimer > 0) return;
    checkTimer = 0.25;
    if (!settings.enabled) {
      group.visible = false;
      return;
    }
    const body = getHouseBody();
    const pond = getPond();
    if (!body || !pond) {
      if (group.children.length) disposeGroup();
      group.visible = false;
      builtKey = 'none';
      return;
    }
    body.updateWorldMatrix(true, false);
    const e = body.matrixWorld.elements;
    const key = [
      pond.normal.x.toFixed(4),
      pond.normal.y.toFixed(4),
      pond.normal.z.toFixed(4),
      pond.size.toFixed(4),
      e[12].toFixed(4),
      e[13].toFixed(4),
      e[14].toFixed(4),
      e[5].toFixed(5),
      settings.startHeight,
      settings.exitAngleDegrees,
      settings.platformLength,
      settings.platformWidth,
      settings.doorWidth,
      settings.doorHeight,
      settings.chuteFlatLength,
      settings.curve,
      settings.heightArc,
      settings.heightSmooth,
      settings.width,
      settings.endInset,
    ].join('|');
    if (key === builtKey) return;
    builtKey = key;
    build(body, pond);
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1);
    applyIntro();
  }

  return {
    object: group,
    settings,
    applySettings,
    update,
    setIntroGrow,
    /** 小豬溜滑梯的路線；溜滑梯關掉、還沒建好、開場還沒伸出來時回傳 null */
    getRide: (): SlideRide | null => (settings.enabled && group.visible && introGrow >= 0.999 ? ride : null),
  };
}

export function formatMainHallSlideSettingsForPaste(s: MainHallSlideSettings) {
  return (
    `// 貼回 src/world/objects/mainHallSlide.ts 的 MAIN_HALL_SLIDE_DEFAULT\n` +
    `export const MAIN_HALL_SLIDE_DEFAULT: MainHallSlideSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  startHeight: ${s.startHeight.toFixed(2)},\n` +
    `  exitAngleDegrees: ${s.exitAngleDegrees},\n` +
    `  platformLength: ${s.platformLength.toFixed(2)},\n` +
    `  platformWidth: ${s.platformWidth.toFixed(2)},\n` +
    `  doorWidth: ${s.doorWidth.toFixed(2)},\n` +
    `  doorHeight: ${s.doorHeight.toFixed(2)},\n` +
    `  chuteFlatLength: ${s.chuteFlatLength.toFixed(2)},\n` +
    `  heightArc: ${s.heightArc.toFixed(2)},\n` +
    `  heightSmooth: ${s.heightSmooth.toFixed(2)},\n` +
    `  curve: ${s.curve.toFixed(2)},\n` +
    `  width: ${s.width.toFixed(2)},\n` +
    `  endInset: ${s.endInset.toFixed(2)},\n` +
    `  chuteColor: '${s.chuteColor}',\n` +
    `  supportColor: '${s.supportColor}',\n` +
    `};`
  );
}
