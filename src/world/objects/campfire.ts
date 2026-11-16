import * as THREE from 'three';
import { cloneGltfInstance, loadGltfOnce, scheduleGltfMount } from './sharedGltf';

const ROAST_CHICKEN_URL = `${import.meta.env.BASE_URL}models/roast_chicken/roast_chicken.glb`;

/**
 * 綠球上的篝火：石圈 + 木柴 + 會跳動的火焰 + 往上飄的火星 + 一點點煙 + 會閃的火光。
 * 全部用程式產生的 low-poly 幾何體（不載 GLB），所以一建立就看得到、也不用等模型下載。
 *
 * 座標約定：model 內部用「直徑 ≈ 1」的單位來擺，最後整組乘上 settings.size（世界單位）。
 * 這樣調大小只要改一個 scale，火星、煙的飛行距離也會跟著等比例縮放。
 */
export type CampfireSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  sink: number;
  /** 石圈直徑（世界單位；綠球半徑是 1） */
  size: number;
  /** 火焰高度倍率 */
  flameHeight: number;
  /** 火焰跳動速度倍率 */
  flameSpeed: number;
  /** 每秒冒出幾顆火星 */
  sparkRate: number;
  smokeEnabled: boolean;
  /** 火光亮度（PointLight intensity）；0 = 不照亮周圍 */
  lightIntensity: number;
  /** 火光照多遠（石圈直徑的倍數） */
  lightRange: number;
  lightColor: string;
  /** 火上烤雞 */
  chickenEnabled: boolean;
  /** 烤雞最長邊（石圈直徑的倍數） */
  chickenSize: number;
  /** 烤雞（烤肉棒）離地高度（石圈直徑的倍數） */
  chickenHeight: number;
  /** 旋轉速度（度/秒）；負數反轉 */
  chickenSpinDegreesPerSecond: number;
  /** spit = 串在橫桿上翻轉（烤肉架）；vertical = 原地水平自轉 */
  chickenSpinAxis: CampfireChickenSpinAxis;
  /** 模型本身擺正用的轉角（度），模型方向不對時調這個 */
  chickenYawDegrees: number;
  chickenPitchDegrees: number;
  /** 烤架（叉架＋橫桿＋雞）整組的水平位移，單位是石圈直徑；0 = 正中央 */
  rackOffsetX: number;
  rackOffsetZ: number;
  /** 烤架整組繞垂直軸轉幾度（決定橫桿朝哪個方向） */
  rackYawDegrees: number;
  /** 叉架離中心多遠（石圈直徑倍）；橫桿長度會跟著變 */
  rackHalfWidth: number;
};

export const CAMPFIRE_CHICKEN_SPIN_AXES = ['spit', 'vertical'] as const;
export type CampfireChickenSpinAxis = (typeof CAMPFIRE_CHICKEN_SPIN_AXES)[number];

export const CAMPFIRE_DEFAULT: CampfireSettings = {
  enabled: true,
  angleFromTopDegrees: 42,
  azimuthDegrees: 139,
  spinDegrees: 47,
  sink: 0.002,
  size: 0.085,
  flameHeight: 1,
  flameSpeed: 1,
  sparkRate: 6,
  smokeEnabled: true,
  lightIntensity: 0.06,
  lightRange: 5,
  lightColor: '#ff8a3d',
  chickenEnabled: true,
  chickenSize: 0.78,
  chickenHeight: 0.95,
  chickenSpinDegreesPerSecond: 87,
  chickenSpinAxis: 'spit',
  chickenYawDegrees: 0,
  chickenPitchDegrees: 0,
  rackOffsetX: 0,
  rackOffsetZ: 0,
  rackYawDegrees: 0,
  rackHalfWidth: 0.52,
};

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const MAX_SPARKS = 24;
const SMOKE_COUNT = 6;

const direction = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spinQuat = new THREE.Quaternion();
const sparkMatrix = new THREE.Matrix4();
const sparkQuat = new THREE.Quaternion();
const sparkScale = new THREE.Vector3();
const sparkEuler = new THREE.Euler();

/**
 * 固定種子的亂數：每次重新整理石頭的形狀、角度都一樣。
 * 少了它，每次重整篝火長相都不同，調好的畫面無法重現。
 */
function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 火焰舌頭：底部在原點、尖端朝 +Y 的低面數圓錐 */
function makeFlameGeometry(radius: number, height: number) {
  const geometry = new THREE.ConeGeometry(radius, height, 5, 1);
  // ConeGeometry 預設以中心為原點；往上移半個高度，讓 scale.y 拉長時底部不會穿進地面
  geometry.translate(0, height / 2, 0);
  return geometry;
}

type FlameTongue = {
  mesh: THREE.Mesh;
  baseHeight: number;
  phase: number;
  freq: number;
  lean: THREE.Vector2;
};

type Spark = {
  alive: boolean;
  age: number;
  life: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: number;
};

type SmokePuff = {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  age: number;
  life: number;
  drift: THREE.Vector2;
};

type CreateCampfireOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  settings?: CampfireSettings;
};

export function createCampfire({ groundRadius, up, front, settings: initial = CAMPFIRE_DEFAULT }: CreateCampfireOptions) {
  const settings: CampfireSettings = { ...initial };
  const random = seededRandom(20261116);
  const normal = new THREE.Vector3();

  const anchor = new THREE.Object3D();
  anchor.name = 'campfire';
  const model = new THREE.Group();
  anchor.add(model);

  // ── 石圈 + 木柴：靜態部分，也拿來當小豬的避障範圍（footprint）──
  // 為什麼不直接拿整個 anchor 給小豬算？火星、煙會飛很高，Box3 會被撐大，小豬就會繞超遠
  const footprint = new THREE.Group();
  footprint.name = 'campfire_footprint';
  model.add(footprint);

  const stoneGeometry = new THREE.DodecahedronGeometry(0.085, 0);
  const stoneMaterials = [0x8b8f96, 0x777c84, 0x9a9890].map(
    (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }),
  );
  const STONE_COUNT = 9;
  for (let i = 0; i < STONE_COUNT; i++) {
    const angle = (i / STONE_COUNT) * Math.PI * 2 + random() * 0.2;
    const stone = new THREE.Mesh(stoneGeometry, stoneMaterials[i % stoneMaterials.length]);
    stone.position.set(Math.cos(angle) * 0.42, 0.03, Math.sin(angle) * 0.42);
    // 壓扁成石塊；每顆隨機轉一下，避免看起來像複製貼上
    stone.scale.set(0.9 + random() * 0.35, 0.55 + random() * 0.25, 0.9 + random() * 0.3);
    stone.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    stone.castShadow = true;
    stone.receiveShadow = true;
    footprint.add(stone);
  }

  // 木柴：5 根斜靠成三角錐（teepee），底部散開、頂端靠在火堆中心
  const logGeometry = new THREE.CylinderGeometry(0.04, 0.05, 0.5, 6, 1);
  const logMaterial = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.9, flatShading: true });
  const charMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 1, flatShading: true });
  const LOG_COUNT = 5;
  for (let i = 0; i < LOG_COUNT; i++) {
    const angle = (i / LOG_COUNT) * Math.PI * 2 + 0.3;
    const log = new THREE.Mesh(logGeometry, i % 2 === 0 ? logMaterial : charMaterial);
    const baseRadius = 0.24;
    log.position.set(Math.cos(angle) * baseRadius * 0.55, 0.16, Math.sin(angle) * baseRadius * 0.55);
    // 繞「水平切線」傾斜，讓底部往外、頂端往內
    const tiltAxis = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    log.quaternion.setFromAxisAngle(tiltAxis, 0.75);
    log.castShadow = true;
    footprint.add(log);
  }

  // 炭床：火堆底下發亮的一塊，讓火焰不像飄在空中
  const emberMaterial = new THREE.MeshBasicMaterial({ color: 0xff6a2a, toneMapped: false });
  const emberBed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), emberMaterial);
  emberBed.scale.set(1, 0.28, 1);
  emberBed.position.y = 0.02;
  model.add(emberBed);

  // ── 火焰：三層舌頭，外圈紅、中圈橘、中心黃且最高 ──
  // 用 MeshBasicMaterial（不吃光）+ toneMapped:false：火本身會發光，不該被場景光變暗或被色調映射洗灰
  const flameGroup = new THREE.Group();
  flameGroup.position.y = 0.04;
  model.add(flameGroup);
  const flames: FlameTongue[] = [];
  const flameLayers = [
    { color: 0xff4a1c, count: 5, ringRadius: 0.11, radius: 0.075, height: 0.32 },
    { color: 0xff9226, count: 3, ringRadius: 0.05, radius: 0.09, height: 0.46 },
    { color: 0xffe066, count: 1, ringRadius: 0, radius: 0.08, height: 0.56 },
  ];
  for (const layer of flameLayers) {
    const material = new THREE.MeshBasicMaterial({ color: layer.color, toneMapped: false });
    const geometry = makeFlameGeometry(layer.radius, 1);
    for (let i = 0; i < layer.count; i++) {
      const angle = (i / layer.count) * Math.PI * 2 + random() * 0.6;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(Math.cos(angle) * layer.ringRadius, 0, Math.sin(angle) * layer.ringRadius);
      mesh.rotation.y = random() * Math.PI;
      flameGroup.add(mesh);
      flames.push({
        mesh,
        baseHeight: layer.height * (0.85 + random() * 0.3),
        phase: random() * Math.PI * 2,
        freq: 7 + random() * 5,
        // 外圈舌頭往外微傾，火堆輪廓才會像「開花」而不是一根柱子
        lean: new THREE.Vector2(Math.cos(angle), Math.sin(angle)).multiplyScalar(layer.ringRadius > 0 ? 0.18 : 0),
      });
    }
  }

  // ── 火光：放在火焰中段，intensity 隨時間抖動 ──
  // 開關用 intensity=0，不用 visible=false：光源數量一變，場景裡所有材質都得重新編譯 shader，會卡一下
  const light = new THREE.PointLight(settings.lightColor, settings.lightIntensity, 0, 2);
  light.position.y = 0.3;
  light.castShadow = false;
  model.add(light);

  // ── 烤雞：兩根 Y 形叉架 + 一根橫桿，雞串在桿子中間慢慢轉 ──
  // 叉架是靜態的，放進 footprint，小豬避障時會一起算進去
  const spitMaterial = new THREE.MeshStandardMaterial({ color: 0x5c3a22, roughness: 0.9, flatShading: true });
  const postGeometry = new THREE.CylinderGeometry(0.022, 0.028, 1, 6, 1);
  postGeometry.translate(0, 0.5, 0);
  const prongGeometry = new THREE.CylinderGeometry(0.016, 0.02, 0.14, 5, 1);
  prongGeometry.translate(0, 0.07, 0);
  // rack 是整組烤架的外框：移動、旋轉它，叉架、橫桿、雞就一起跟著走
  // 不放進 footprint：footprint 只代表石圈＋木柴，烤架移出去也不會讓小豬的避障範圍亂跳
  const rack = new THREE.Group();
  rack.name = 'campfire_rack';
  model.add(rack);
  const posts: THREE.Group[] = [];
  for (const sideSign of [-1, 1]) {
    const post = new THREE.Group();
    post.position.set(sideSign * 0.52, 0, 0);
    const pole = new THREE.Mesh(postGeometry, spitMaterial);
    pole.castShadow = true;
    post.add(pole);
    // 叉子的兩根分岔：往前、往後各斜一點，橫桿就卡在中間
    for (const prongSign of [-1, 1]) {
      const prong = new THREE.Mesh(prongGeometry, spitMaterial);
      prong.rotation.x = prongSign * 0.5;
      prong.castShadow = true;
      post.add(prong);
    }
    posts.push(post);
    rack.add(post);
  }
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.2, 6, 1), spitMaterial);
  rod.rotation.z = Math.PI / 2;
  rod.castShadow = true;
  // 橫桿跟著雞一起轉：外層 chickenPivot 決定高度，內層 chickenSpin 負責旋轉
  const chickenPivot = new THREE.Group();
  chickenPivot.name = 'campfire_chicken';
  rack.add(chickenPivot);
  chickenPivot.add(rod);
  const chickenSpin = new THREE.Group();
  chickenPivot.add(chickenSpin);
  // 模型擺正用的那一層：先把模型轉成「長邊沿著橫桿」，旋轉才會像串燒在翻面
  const chickenOrient = new THREE.Group();
  chickenSpin.add(chickenOrient);
  let chickenModel: THREE.Object3D | null = null;
  let chickenFitted: { center: THREE.Vector3; size: THREE.Vector3 } | null = null;
  let chickenAngle = 0;

  function fitChicken() {
    if (!chickenModel) return;
    if (!chickenFitted) {
      // 量尺寸時先把模型拿下來單獨量：Box3.setFromObject 用的是「世界座標」，
      // 掛在篝火底下時會連父層縮放一起算（開場時篝火縮到 0.0001），量出來超小 → 放大倍率爆掉、雞變巨大
      const parent = chickenModel.parent;
      parent?.remove(chickenModel);
      chickenModel.position.set(0, 0, 0);
      chickenModel.rotation.set(0, 0, 0);
      chickenModel.scale.setScalar(1);
      chickenModel.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(chickenModel);
      chickenFitted = { center: box.getCenter(new THREE.Vector3()), size: box.getSize(new THREE.Vector3()) };
      parent?.add(chickenModel);
    }
    const { center, size } = chickenFitted;
    const scale = settings.chickenSize / Math.max(size.x, size.y, size.z, 1e-6);
    chickenModel.scale.setScalar(scale);
    // 把模型中心移到原點：旋轉軸才會穿過雞的正中間，不然會像甩出去一樣繞大圈
    chickenModel.position.copy(center).multiplyScalar(-scale);
  }

  function applyChicken() {
    rack.position.set(settings.rackOffsetX, 0, settings.rackOffsetZ);
    rack.rotation.y = THREE.MathUtils.degToRad(settings.rackYawDegrees);
    const halfWidth = Math.max(0.05, settings.rackHalfWidth);
    posts.forEach((post, index) => post.position.set((index === 0 ? -1 : 1) * halfWidth, 0, 0));
    // 橫桿原始長度 1.2；兩端各多伸出 0.08，看起來才像卡在叉子上而不是剛好斷在那
    rod.scale.y = (halfWidth * 2 + 0.16) / 1.2;
    chickenPivot.visible = settings.chickenEnabled;
    chickenPivot.position.y = settings.chickenHeight;
    const spitMode = settings.chickenSpinAxis === 'spit';
    // 原地自轉模式不需要橫桿和叉架
    rod.visible = spitMode;
    for (const post of posts) {
      post.visible = settings.chickenEnabled && spitMode;
      post.scale.y = settings.chickenHeight;
      // 叉子分岔不要跟著柱子一起被拉長
      post.children.forEach((child, index) => {
        if (index === 0) return;
        child.position.y = 1;
        child.scale.y = 1 / Math.max(settings.chickenHeight, 0.01);
      });
    }
    chickenOrient.rotation.set(
      THREE.MathUtils.degToRad(settings.chickenPitchDegrees),
      THREE.MathUtils.degToRad(settings.chickenYawDegrees),
      0,
    );
    fitChicken();
  }

  loadGltfOnce(ROAST_CHICKEN_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        // cloneGltfInstance 會複製材質：番茄醬上的烤雞也用同一個檔，共用材質的話一邊調色另一邊也會變
        chickenModel = cloneGltfInstance(gltf.scene);
        chickenModel.name = 'campfire_chicken_model';
        chickenModel.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        });
        chickenOrient.add(chickenModel);
        chickenFitted = null;
        applyChicken();
      });
    })
    .catch((error) => console.error(`[campfire] 烤雞載入失敗：${ROAST_CHICKEN_URL}`, error));

  // ── 火星：一個 InstancedMesh 畫全部，沒用到的縮成 0 ──
  const sparkMaterial = new THREE.MeshBasicMaterial({ color: 0xffc94a, toneMapped: false });
  const sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.022, 0), sparkMaterial, MAX_SPARKS);
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // 火星會飛出原本的包圍球；不關 frustumCulled，鏡頭偏一點整批就會一起消失
  sparkMesh.frustumCulled = false;
  model.add(sparkMesh);
  const sparks: Spark[] = Array.from({ length: MAX_SPARKS }, () => ({
    alive: false,
    age: 0,
    life: 1,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    spin: 0,
  }));
  sparkMatrix.makeScale(0, 0, 0);
  for (let i = 0; i < MAX_SPARKS; i++) sparkMesh.setMatrixAt(i, sparkMatrix);
  let sparkAccumulator = 0;

  // ── 煙：幾團半透明灰球，從火焰頂端往上飄、變大、變淡 ──
  const smokeGeometry = new THREE.IcosahedronGeometry(0.12, 0);
  const smoke: SmokePuff[] = [];
  for (let i = 0; i < SMOKE_COUNT; i++) {
    const material = new THREE.MeshStandardMaterial({
      color: 0x9a9a9a,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0,
      // 半透明物體不寫深度：不然後面的煙團會被前面的「透明殼」擋掉
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(smokeGeometry, material);
    mesh.visible = false;
    model.add(mesh);
    smoke.push({
      mesh,
      material,
      // 錯開起始年齡，煙才會一團接一團，不會同時噴出
      age: (i / SMOKE_COUNT) * 2.4,
      life: 2.4,
      drift: new THREE.Vector2(random() - 0.5, random() - 0.5).multiplyScalar(0.25),
    });
  }

  let introGrow = 1;
  let time = random() * 10;

  function applyPlacement() {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle)).normalize();
    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spinQuat.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    const grow = Math.max(0.0001, introGrow);
    anchor.scale.setScalar(settings.size * grow);
    anchor.visible = settings.enabled;
    light.color.set(settings.lightColor);
    // PointLight 的 distance 是世界單位，不會跟著父物件縮放，所以要自己乘上 size
    light.distance = settings.size * settings.lightRange * grow;
    applyChicken();
  }

  function spawnSpark(spark: Spark) {
    spark.alive = true;
    spark.age = 0;
    spark.life = 0.7 + Math.random() * 0.7;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.1;
    spark.position.set(Math.cos(a) * r, 0.25 + Math.random() * 0.15, Math.sin(a) * r);
    spark.velocity.set((Math.random() - 0.5) * 0.35, 0.55 + Math.random() * 0.45, (Math.random() - 0.5) * 0.35);
    spark.spin = Math.random() * Math.PI * 2;
  }

  function updateFlames(dt: number) {
    const heightScale = Math.max(0.05, settings.flameHeight);
    for (const flame of flames) {
      const t = time * flame.freq * 0.25 + flame.phase;
      // 兩個不同頻率的 sin 疊起來，比單一 sin 更不規律，看起來比較像真的火在竄
      const flicker = 1 + Math.sin(t) * 0.16 + Math.sin(t * 2.3 + 1.7) * 0.09;
      const h = flame.baseHeight * heightScale * flicker;
      const w = 1 - Math.sin(t * 1.3) * 0.08;
      flame.mesh.scale.set(w, h, w);
      flame.mesh.rotation.x = flame.lean.y + Math.sin(t * 0.9 + 0.5) * 0.12;
      flame.mesh.rotation.z = -flame.lean.x + Math.sin(t * 1.1) * 0.12;
    }
    const pulse = 1 + Math.sin(time * 9) * 0.06 + Math.sin(time * 23.7) * 0.04;
    emberBed.scale.set(pulse, 0.28, pulse);
    // 火光亮度跟火焰同步抖動；隨機一點點，避免太規律像呼吸燈
    const lightFlicker = 0.82 + Math.sin(time * 11) * 0.08 + Math.sin(time * 27.3) * 0.06 + Math.random() * 0.04;
    light.intensity = settings.enabled ? settings.lightIntensity * lightFlicker * introGrow : 0;
    void dt;
  }

  function updateSparks(dt: number) {
    sparkAccumulator += dt * Math.max(0, settings.sparkRate);
    while (sparkAccumulator >= 1) {
      sparkAccumulator -= 1;
      const free = sparks.find((spark) => !spark.alive);
      if (free) spawnSpark(free);
    }
    for (let i = 0; i < MAX_SPARKS; i++) {
      const spark = sparks[i];
      if (spark.alive) {
        spark.age += dt;
        if (spark.age >= spark.life) spark.alive = false;
      }
      if (!spark.alive) {
        sparkMatrix.makeScale(0, 0, 0);
      } else {
        // 左右亂飄 + 往上減速，像被熱氣托著的火星
        spark.velocity.x += (Math.random() - 0.5) * 2.2 * dt;
        spark.velocity.z += (Math.random() - 0.5) * 2.2 * dt;
        spark.velocity.y *= 1 - 0.6 * dt;
        spark.position.addScaledVector(spark.velocity, dt);
        spark.spin += dt * 6;
        const k = 1 - spark.age / spark.life;
        sparkScale.setScalar(Math.max(0.001, k));
        sparkQuat.setFromEuler(sparkEuler.set(spark.spin, spark.spin * 0.7, 0));
        sparkMatrix.compose(spark.position, sparkQuat, sparkScale);
      }
      sparkMesh.setMatrixAt(i, sparkMatrix);
    }
    sparkMesh.instanceMatrix.needsUpdate = true;
  }

  function updateSmoke(dt: number) {
    for (const puff of smoke) {
      puff.age += dt;
      if (puff.age >= puff.life) {
        puff.age -= puff.life;
        puff.drift.set(Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25);
      }
      const k = puff.age / puff.life;
      puff.mesh.visible = settings.smokeEnabled;
      if (!settings.smokeEnabled) continue;
      // 有烤雞時煙從雞的上方才開始冒：不然半透明煙團會罩在雞前面，雞看起來像半透明
      const smokeBase = settings.chickenEnabled
        ? Math.max(0.55, settings.chickenHeight + settings.chickenSize * 0.5)
        : 0.55;
      puff.mesh.position.set(
        settings.rackOffsetX * (settings.chickenEnabled ? 1 : 0) + puff.drift.x * k,
        smokeBase + k * 1.1,
        settings.rackOffsetZ * (settings.chickenEnabled ? 1 : 0) + puff.drift.y * k,
      );
      puff.mesh.scale.setScalar(0.6 + k * 1.4);
      puff.mesh.rotation.y = k * 2;
      // 先淡入再淡出：sin(πk) 在頭尾都是 0，不會突然冒出或突然消失
      puff.material.opacity = Math.sin(Math.PI * k) * 0.35;
    }
  }

  function update(deltaTime: number) {
    if (!settings.enabled || introGrow <= 0.001) {
      light.intensity = 0;
      return;
    }
    const dt = Math.min(deltaTime, 0.1) * Math.max(0, settings.flameSpeed);
    time += dt;
    updateFlames(dt);
    updateSparks(dt);
    updateSmoke(dt);
    updateChicken(deltaTime);
  }

  function updateChicken(deltaTime: number) {
    if (!settings.chickenEnabled) return;
    // 用真實時間，不乘 flameSpeed：調火焰跳動速度時，烤雞轉速不該跟著變
    chickenAngle += THREE.MathUtils.degToRad(settings.chickenSpinDegreesPerSecond) * Math.min(deltaTime, 0.1);
    if (settings.chickenSpinAxis === 'spit') {
      chickenSpin.rotation.set(chickenAngle, 0, 0);
    } else {
      chickenSpin.rotation.set(0, chickenAngle, 0);
    }
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1.4);
    applyPlacement();
  }

  function setNormal(target: THREE.Vector3) {
    const angle = Math.acos(THREE.MathUtils.clamp(target.dot(up), -1, 1));
    horizontal.copy(target).addScaledVector(up, -target.dot(up));
    side.crossVectors(up, front);
    const azimuth = Math.atan2(horizontal.dot(side), horizontal.dot(front));
    settings.angleFromTopDegrees = Math.round(THREE.MathUtils.radToDeg(angle));
    settings.azimuthDegrees = Math.round(THREE.MathUtils.radToDeg(azimuth));
    applyPlacement();
  }

  applyPlacement();
  updateFlames(0);

  return {
    object: anchor,
    /** 給小豬避障用：只含石圈與木柴 */
    footprint,
    settings,
    applySettings: applyPlacement,
    setIntroGrow,
    update,
    getNormal: () => normal.clone(),
    setNormal,
  };
}

export function formatCampfireSettingsForPaste(s: CampfireSettings) {
  return (
    `// 貼回 src/world/objects/campfire.ts 的 CAMPFIRE_DEFAULT\n` +
    `export const CAMPFIRE_DEFAULT: CampfireSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
    `  azimuthDegrees: ${s.azimuthDegrees},\n` +
    `  spinDegrees: ${s.spinDegrees},\n` +
    `  sink: ${s.sink.toFixed(3)},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  flameHeight: ${s.flameHeight.toFixed(2)},\n` +
    `  flameSpeed: ${s.flameSpeed.toFixed(2)},\n` +
    `  sparkRate: ${s.sparkRate},\n` +
    `  smokeEnabled: ${s.smokeEnabled},\n` +
    `  lightIntensity: ${s.lightIntensity.toFixed(3)},\n` +
    `  lightRange: ${s.lightRange},\n` +
    `  lightColor: '${s.lightColor}',\n` +
    `  chickenEnabled: ${s.chickenEnabled},\n` +
    `  chickenSize: ${s.chickenSize.toFixed(2)},\n` +
    `  chickenHeight: ${s.chickenHeight.toFixed(2)},\n` +
    `  chickenSpinDegreesPerSecond: ${s.chickenSpinDegreesPerSecond},\n` +
    `  chickenSpinAxis: '${s.chickenSpinAxis}',\n` +
    `  chickenYawDegrees: ${s.chickenYawDegrees},\n` +
    `  chickenPitchDegrees: ${s.chickenPitchDegrees},\n` +
    `  rackOffsetX: ${s.rackOffsetX.toFixed(2)},\n` +
    `  rackOffsetZ: ${s.rackOffsetZ.toFixed(2)},\n` +
    `  rackYawDegrees: ${s.rackYawDegrees},\n` +
    `  rackHalfWidth: ${s.rackHalfWidth.toFixed(2)},\n` +
    `};\n`
  );
}
