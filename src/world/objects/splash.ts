import * as THREE from 'three';
// mergeVertices：把位置相同的頂點合併成同一個，變形後表面才會連續平滑（見 createBlobGeometry）
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// 番茄醬噴濺：偶爾從緞帶甩出一坨醬，先牽著一條跟醬團一樣粗的醬柱、時間到直接斷開，醬團像果凍一樣晃幾下，慢慢往下掉
//
// 「像水」和「像醬」差在哪？
//   水：完美圓珠、亮得像玻璃、一離開就乾淨分離、飛得又快又遠
//   醬：形狀不規則、表面比較霧、離開時會牽絲、斷開後會晃、被黏性拖著飛不快

// 醬滴總數（同時在空中的會比這少，因為有些在休息）
const DROP_COUNT = 40;
// 醬滴消失後要休息多久才再噴出（秒）：這是控制「噴濺頻率」的主要旋鈕，越長越少噴
const REST_MIN = 1.5;
const REST_MAX = 4;
// 醬團的基本半徑：每顆會再隨機乘上 0.6 ~ 1.4 倍，大小才不會整齊劃一
// 黏稠的醬不容易被甩成細小的霧珠，所以比一般水滴大
const DROP_SIZE = 0.05;
// 醬團表面凹凸的程度：0 = 完美圓球（像水珠），越大越像一坨不規則的醬
const BLOB_LUMP = 0.25;
// 噴出去的速度範圍（單位 / 秒）：黏稠的醬甩不快、飛不遠
const SPEED_MIN = 0.3;
const SPEED_MAX = 0.8;
// 黏滯阻力：每秒損失多少比例的速度，越大醬團越快「停在空中」再往下掉
const DRAG = 1.5;
// 每顆醬團在空中待多久（秒）
const LIFE_MIN = 1.2;
const LIFE_MAX = 2;
// 重力加速度：比真實世界小，醬團下墜得慢，有「沉甸甸、慢慢滴」的感覺
const GRAVITY = 1.2;
// 醬絲：剛噴出時，醬團和緞帶之間會牽著一條醬絲，維持 STRING_TIME 秒後直接斷開
const STRING_TIME = 0.6;
// 醬絲的粗細（相對於醬團的粗細）：1 = 跟醬團一樣粗，整條像從緞帶擠出來的醬柱
const STRING_WIDTH = 1;
// 醬絲斷掉後醬團晃動的幅度：像果凍彈一下，越大晃越明顯
const JIGGLE = 0.35;
// 往外噴的方向散開多少：0 = 全部筆直往外，越大越亂；黏稠的醬噴得比較集中
const SPREAD = 0.4;
// 往畫面上方噴的比例：0.25 = 每 4 次噴濺約有 1 次刻意噴到上方
// 緞帶大半在畫面外或球後面，完全隨機的話上方幾乎看不到噴濺
const TOP_RATIO = 0.25;
// 往上噴時，在緞帶上試幾個候選點、挑畫面上最高的：越多越集中在最上緣
const TOP_SAMPLES = 8;
// 往上噴的速度倍率：要比一般噴濺快一點，醬團才飛得上去
const TOP_SPEED_SCALE = 1.6;
// 從「前方」（離攝影機最近、畫面內那段緞帶）噴起來的比例
// 前方緞帶的「往外」幾乎正對鏡頭，完全隨機噴的話醬團是往鏡頭飛，畫面上看不出噴起來
const FRONT_RATIO = 0.35;
// 從前方噴時最多試幾個隨機點，找一個「在球前面、畫面下半部」的點
const FRONT_SAMPLES = 20;
// 前方噴起的速度倍率
const FRONT_SPEED_SCALE = 1.4;
// 起點離管子表面再往外多少：緞帶表面會鼓起（最多約 0.07），少了這段，醬團剛噴出時會藏在鼓起的醬汁裡
const SURFACE_OFFSET = 0.07;

type Drop = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  // 噴出的起點：醬絲的另一端黏在這裡
  anchor: THREE.Vector3;
  // 醬團自己繞拉長軸（y 軸）的隨機角度：每顆凹凸的位置不同，才不會看出是同一個形狀複製出來的
  spin: THREE.Quaternion;
  age: number;
  life: number;
  size: number;
  // 還要休息幾秒才噴出；大於 0 時醬團是隱藏的
  rest: number;
};

type SplashOptions = {
  // 緞帶的路徑：醬團從路徑上隨機一點噴出
  curve: THREE.Curve<THREE.Vector3>;
  // 緞帶的 mesh：用它的世界矩陣，把路徑上的點換算成場景裡的實際位置
  ribbon: THREE.Object3D;
  // 緞帶管子的半徑：醬團從管子表面噴出，而不是從管子中心
  tubeRadius: number;
  material: THREE.Material;
  // 攝影機：用來判斷哪個點在畫面上方、畫面的「上」是哪個方向
  camera: THREE.Camera;
};

/**
 * 凹凸不平的醬團形狀：從圓球出發，每個頂點沿著自己的方向推進推出一點
 * 用幾個 sin 疊加當作「平滑的雜訊」：相鄰頂點的推動量接近，表面是圓潤的鼓包，不會變成刺刺的
 */
function createBlobGeometry() {
  const sphere = new THREE.IcosahedronGeometry(1, 3);
  // Icosahedron 的每個三角形各自擁有頂點，同一個位置會有好幾個重複頂點
  // 不合併的話，重算法線時每個三角形各算各的 → 表面一格一格；合併後才會平滑
  // uv、normal 不同的頂點不會被合併，所以先刪掉，只依位置合併
  sphere.deleteAttribute('uv');
  sphere.deleteAttribute('normal');
  const geometry = mergeVertices(sphere);

  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    const lump =
      Math.sin(vertex.x * 3.1 + 1.7) * Math.sin(vertex.y * 2.7 + 0.4) +
      Math.sin(vertex.y * 4.3 + 2.1) * Math.sin(vertex.z * 3.9 + 1.2) * 0.6 +
      Math.sin(vertex.z * 2.3 + 0.8) * Math.sin(vertex.x * 4.7 + 2.6) * 0.4;
    vertex.multiplyScalar(1 + lump * BLOB_LUMP * 0.5);
    position.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }
  // 形狀變了，法線（表面朝向）要重算，光影才會照著新的凹凸走
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 醬絲的形狀：上下一樣粗的圓柱（粗細交給每幀的縮放控制，跟醬團同步）
 * 兩端要封口：醬絲變粗後，從斜角看得到端點，不封口會看到中空的管子
 * 先把圓柱往上平移半個高度，讓它從 y = 0 長到 y = 1：
 * 之後只要把它放在起點、轉向醬團、y 方向縮放成兩者距離，就剛好連起來
 */
function createStringGeometry() {
  const geometry = new THREE.CylinderGeometry(1, 1, 1, 16, 1, false);
  geometry.translate(0, 0.5, 0);
  return geometry;
}

export function createSplash({ curve, ribbon, tubeRadius, material, camera }: SplashOptions) {
  // InstancedMesh：同一個形狀畫很多份，每份只差在位置、旋轉、縮放
  // 所有醬團只需要一次 draw call；換成一顆一個 Mesh，有幾顆就要畫幾次，GPU 負擔差很多
  const blobs = new THREE.InstancedMesh(createBlobGeometry(), material, DROP_COUNT);
  const strings = new THREE.InstancedMesh(createStringGeometry(), material, DROP_COUNT);
  for (const mesh of [blobs, strings]) {
    // 告訴 GPU 這些矩陣每幀都會變，讓它用適合頻繁更新的方式存放
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // 視錐剔除是用「原始形狀」的包圍球判斷，醬團飛遠後可能被誤判在畫面外而整批消失，所以關掉
    mesh.frustumCulled = false;
  }

  const group = new THREE.Group();
  group.add(blobs, strings);

  const drops: Drop[] = Array.from({ length: DROP_COUNT }, () => ({
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    anchor: new THREE.Vector3(),
    spin: new THREE.Quaternion(),
    age: 0,
    life: 0,
    size: 0,
    rest: 0,
  }));

  // 每幀都會用到的暫存物件：先建好重複使用，避免每幀 new 一堆物件讓垃圾回收卡頓
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);
  const candidate = new THREE.Vector3();
  const screen = new THREE.Vector3();
  const screenUp = new THREE.Vector3();
  const toCamera = new THREE.Vector3();

  // 這裡用 Math.random()：噴濺本來就該每次都不一樣，不需要像緞帶起伏那樣固定
  const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

  /**
   * 在緞帶上試幾個隨機點，留下「分數最高」的那個
   * project() 會把場景座標換成螢幕座標（-1 ~ 1，y 越大越上面），已經包含 setViewOffset 的平移
   * 超出畫面的點直接略過，免得挑到畫面外的位置
   * @param score 根據「場景座標」和「螢幕座標」打分數，越高越好
   */
  function pickPoint(samples: number, score: (world: THREE.Vector3, screen: THREE.Vector3) => number) {
    let bestT = Math.random();
    let bestScore = -Infinity;
    for (let i = 0; i < samples; i++) {
      const t = Math.random();
      curve.getPoint(t, candidate);
      ribbon.localToWorld(candidate);
      screen.copy(candidate).project(camera);
      if (Math.abs(screen.x) > 0.9 || Math.abs(screen.y) > 0.95) continue;
      const value = score(candidate, screen);
      if (value > bestScore) {
        bestScore = value;
        bestT = t;
      }
    }
    return bestT;
  }

  // 上方：畫面上最高的點
  const scoreTop = (_world: THREE.Vector3, screenPosition: THREE.Vector3) => screenPosition.y;

  /**
   * 前方：隨機挑一個「在球前面、畫面下半部、在畫面內」的點
   * 為什麼不挑「離攝影機最近」的？最近的永遠是同一小段，醬團會全擠在一個角落；
   * 改成在符合條件的範圍內隨機挑，整段前方緞帶都有機會噴
   * 「在球前面」= 比球心更靠近攝影機，才不會被球擋住
   */
  function pickFrontPoint() {
    const ballDistance = camera.position.length();
    for (let i = 0; i < FRONT_SAMPLES; i++) {
      const t = Math.random();
      curve.getPoint(t, candidate);
      ribbon.localToWorld(candidate);
      screen.copy(candidate).project(camera);
      const onScreen = Math.abs(screen.x) < 0.9 && screen.y > -0.95;
      const lowerHalf = screen.y < 0;
      const inFrontOfBall = candidate.distanceTo(camera.position) < ballDistance;
      if (onScreen && lowerHalf && inFrontOfBall) return t;
    }
    // 試了這麼多次都沒找到（例如攝影機轉到看不到前方緞帶），就退回隨機
    return Math.random();
  }

  /** 讓一顆醬團從緞帶上重新噴出 */
  function respawn(drop: Drop) {
    // 決定這次從哪裡噴：上方、前方，或整圈隨機
    const roll = Math.random();
    const mode = roll < TOP_RATIO ? 'top' : roll < TOP_RATIO + FRONT_RATIO ? 'front' : 'random';
    const t =
      mode === 'top' ? pickPoint(TOP_SAMPLES, scoreTop)
      : mode === 'front' ? pickFrontPoint()
      : Math.random();
    curve.getPoint(t, point);

    // 往外的方向：從圈圈中心指向這個點（路徑繞的是 xz 平面，所以 y 先歸零）
    // 再加上隨機偏移，醬團才會往四面八方散開
    direction.set(point.x, 0, point.z).normalize();
    direction.x += randomBetween(-SPREAD, SPREAD) * 0.5;
    direction.y += randomBetween(-SPREAD, SPREAD);
    direction.z += randomBetween(-SPREAD, SPREAD) * 0.5;
    direction.normalize();

    // 從管子表面出發，換算成場景座標；起點同時也是醬絲黏住的位置
    drop.position.copy(point).addScaledVector(direction, tubeRadius + SURFACE_OFFSET);
    ribbon.localToWorld(drop.position);
    drop.anchor.copy(drop.position);
    // 方向也要換算：緞帶整圈是翻起來又在自轉的，路徑上的「往外」不等於場景裡的「往外」
    drop.velocity.copy(direction).transformDirection(ribbon.matrixWorld);

    // 畫面的「上」在場景裡是哪個方向：把攝影機自己的 y 軸轉成場景座標
    // 攝影機是從上往下看的，所以畫面上方 ≠ 場景的 +y，不能直接用 (0, 1, 0)
    screenUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

    if (mode === 'top') {
      // 原本往外的方向和畫面上方各半，噴出去才會往上又帶點散開，不會整齊地直直往上
      drop.velocity.add(screenUp).normalize().multiplyScalar(randomBetween(SPEED_MIN, SPEED_MAX) * TOP_SPEED_SCALE);
    } else if (mode === 'front') {
      // 前方：以「畫面上方」為主、往外為輔，再帶一點往鏡頭的方向
      // 少了畫面上方的成分，醬團只是往鏡頭衝，在畫面上幾乎不動，看不出噴起來
      toCamera.subVectors(camera.position, drop.position).normalize();
      drop.velocity
        .multiplyScalar(0.5)
        .add(screenUp)
        .addScaledVector(toCamera, 0.3)
        .normalize()
        .multiplyScalar(randomBetween(SPEED_MIN, SPEED_MAX) * FRONT_SPEED_SCALE);
    } else {
      drop.velocity.multiplyScalar(randomBetween(SPEED_MIN, SPEED_MAX));
    }

    // 只繞 y 軸轉：縮放會在旋轉之前套用，如果三個軸都亂轉，「沿飛行方向拉長」的那個軸也會被轉歪
    drop.spin.setFromAxisAngle(UP, Math.random() * Math.PI * 2);
    drop.age = 0;
    drop.life = randomBetween(LIFE_MIN, LIFE_MAX);
    drop.size = DROP_SIZE * randomBetween(0.6, 1.4);
  }

  // 縮放成 0 的矩陣：休息中的醬團、斷掉的醬絲用它藏起來（InstancedMesh 沒辦法單獨隱藏某一顆）
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

  function hide(index: number) {
    blobs.setMatrixAt(index, hidden);
    strings.setMatrixAt(index, hidden);
  }

  let started = false;

  /** 每幀呼叫：deltaTime 是距離上一幀過了幾秒 */
  function update(deltaTime: number) {
    // 第一幀才噴：要等緞帶被畫過一次、世界矩陣算好，醬團的位置才會對
    if (!started) {
      started = true;
      for (const drop of drops) {
        // 一開始全部先休息、休息時間錯開，才不會一打開畫面就全部同時噴出
        drop.rest = randomBetween(0, REST_MAX);
      }
    }

    // 黏滯阻力：每幀把速度乘上一個略小於 1 的數
    // 用 exp 而不是固定的 0.98 之類：不管畫面每秒幾幀，一秒內損失的速度都一樣
    const drag = Math.exp(-DRAG * deltaTime);

    drops.forEach((drop, index) => {
      // 休息中：倒數計時，時間到就從緞帶上噴出；還沒到就維持隱藏
      if (drop.rest > 0) {
        drop.rest -= deltaTime;
        if (drop.rest <= 0) {
          respawn(drop);
        } else {
          hide(index);
          return;
        }
      }

      drop.age += deltaTime;
      if (drop.age >= drop.life) {
        // 壽命到了：進入休息，這一幀先藏起來
        drop.rest = randomBetween(REST_MIN, REST_MAX);
        hide(index);
        return;
      }

      // 先被黏性拖慢，再加上重力 → 醬團噴出去很快就「失速」，接著慢慢往下垂
      drop.velocity.multiplyScalar(drag);
      drop.velocity.y -= GRAVITY * deltaTime;
      drop.position.addScaledVector(drop.velocity, deltaTime);

      // 大小：剛噴出時從小長大（像從緞帶裡被拉出來），最後 25% 的壽命才縮小消失
      const grow = Math.min(drop.age / (STRING_TIME * 0.5), 1);
      const fade = Math.min((1 - drop.age / drop.life) / 0.25, 1);
      const radius = drop.size * grow * Math.sqrt(fade);

      const stringProgress = drop.age / STRING_TIME;

      // ── 醬團：還牽著絲時被拉成水滴狀；斷掉後像果凍一樣上下彈幾下再停住 ──
      let stretch: number;
      if (stringProgress < 1) {
        // 被醬絲往回拉，沿飛行方向拉長一點
        stretch = 1 + 0.4 * (1 - stringProgress);
      } else {
        // 衰減的 sin 波：一開始晃得大，之後越晃越小（exp 負責衰減，sin 負責來回）
        const sinceSnap = drop.age - STRING_TIME;
        stretch = 1 + JIGGLE * Math.exp(-4 * sinceSnap) * Math.sin(sinceSnap * 18);
      }
      // 沿飛行方向拉長、另外兩軸變細，體積看起來差不多，才像同一坨醬在變形
      // side = 醬團在「垂直飛行方向」的半徑，也就是看起來的粗細
      const side = radius / Math.sqrt(stretch);
      quaternion.setFromUnitVectors(UP, direction.copy(drop.velocity).normalize());
      // 先套用醬團自己的隨機朝向，再轉到飛行方向：凹凸的位置每顆都不一樣
      quaternion.multiply(drop.spin);
      scale.set(side, radius * stretch, side);
      matrix.compose(drop.position, quaternion, scale);
      blobs.setMatrixAt(index, matrix);

      // ── 醬絲：從起點連到醬團，粗細跟醬團一樣，時間到直接斷開 ──
      // 粗細直接用醬團的 side：醬團剛噴出時從小長大，醬絲也會跟著一起變粗，兩者永遠接得剛好
      // 不做「越拉越細」：濃稠的醬是一整條被扯斷，而不是像糖絲那樣拉到細細的才斷
      if (stringProgress < 1) {
        direction.subVectors(drop.position, drop.anchor);
        const length = direction.length();
        quaternion.setFromUnitVectors(UP, direction.normalize());
        const width = side * STRING_WIDTH;
        scale.set(width, length, width);
        matrix.compose(drop.anchor, quaternion, scale);
        strings.setMatrixAt(index, matrix);
      } else {
        strings.setMatrixAt(index, hidden);
      }
    });

    // 改完矩陣要通知 three.js 重新上傳到 GPU，少了這行畫面不會動
    blobs.instanceMatrix.needsUpdate = true;
    strings.instanceMatrix.needsUpdate = true;
  }

  return { object: group, update };
}
