import * as THREE from 'three';
// GLTFLoader：讀取 .glb / .gltf，網路上下載的 3D 模型最常見的格式
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// 有些模型會用 meshopt 壓縮幾何資料，少了解碼器就讀不出來；沒壓縮的模型掛著也不影響
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createKetchup } from './ketchup';
import { createHouse, type HouseSettings } from './house';
import { createCartoonRainbow } from './rainbow';
import { createGameHallLights, type GameHallLights } from './gameHallLights';
import { createGroundFlowers, type GroundFlowers } from './groundFlowers';

// 模型放在 public/ 底下，Vite 會原封不動地提供，網址從 BASE_URL 開始算
// 想換模型只要改這裡：雞塊檔案還沒下載，先用雞腿看效果
// const MODEL_URL = `${import.meta.env.BASE_URL}models/nugget/nugget.glb`;
const MODEL_URL = `${import.meta.env.BASE_URL}models/chicken_leg/chicken_leg.glb`;

// projectRoom 的外觀：用 Blender 做的 low poly 房子（匯出時已拿掉底下那塊平的地面，才能種在球面上）
const PROJECT_ROOM_MODEL_URL = `${import.meta.env.BASE_URL}models/project_room/project_room.glb`;
const GAME_HALL_MODEL_URL = `${import.meta.env.BASE_URL}models/game_hall/gameHall.glb`;

// true = 載入網路下載的模型；false = 顯示原本的綠色球
const USE_MODEL = false;

// 綠球（地表）的半徑：房子要種在球面上，得知道表面離球心多遠
const GROUND_RADIUS = 1;

// 模型縮放後「最長邊」的長度：2 = 跟原本半徑 1 的球一樣大，鏡頭和燈光都不用重調
const MODEL_SIZE = 2;

type CreateObjsOptions = {
  // 環境貼圖：給番茄醬這類光滑材質反射用
  envMap: THREE.Texture;
  // 攝影機：噴濺要知道「畫面上方」在哪個方向
  camera: THREE.Camera;
};

/** 入場動畫：面板可調，調完用重播看效果 */
export type WorldIntroSettings = {
  emptyHold: number;
  ballStartScale: number;
  ballSeconds: number;
  ballScaleLag: number;
  ballOvershoot: number;
  houseSeconds: number;
  houseStagger: number;
  houseOvershoot: number;
  ketchupSeconds: number;
  ketchupAfterHouse: number;
  rainbowSeconds: number;
  ballMoveEase: IntroBallEase;
  ballScaleEase: IntroBallEase;
};

/** 綠球入場可選的 tween，面板下拉選單用這份清單 */
export const INTRO_BALL_EASE_OPTIONS = [
  'linear',
  'inCubic',
  'outCubic',
  'inOutCubic',
  'inOutSine',
  'inOutQuad',
  'outQuad',
  'outBack',
] as const;

export type IntroBallEase = (typeof INTRO_BALL_EASE_OPTIONS)[number];

export function createObjs({ envMap, camera }: CreateObjsOptions) {
  const all = new THREE.Object3D();

  // 地表：綠球 + 房子共用同一個 pivot（球心在原點），入場時整組移動、縮放
  // 房子不能掛在球 mesh 底下當子物件：Three.js 很難把子 mesh 的影子投到父 mesh（球面接不到影）
  // 用模型時沒有綠球，就退回種在 all 上
  let ground: THREE.Object3D = all;
  let groundSurface: THREE.Mesh | null = null;
  let groundFlowers: GroundFlowers | null = null;
  if (USE_MODEL) {
    loadModel(all);
  } else {
    ground = new THREE.Object3D();
    groundSurface = createBall();
    ground.add(groundSurface);
    all.add(ground);
  }

  // 番茄醬緞帶：繞著中間的物件流動
  const ketchup = createKetchup({ envMap, camera });
  all.add(ketchup.object);

  if (ground !== all) {
    // 花的正／背面依緞帶軸（球繞軸轉時朝鏡頭／背鏡頭），需在緞帶建立後才算軸
    groundFlowers = createGroundFlowers(GROUND_RADIUS, camera, ground, ketchup.ringObject);
    ground.add(groundFlowers.mesh);
  }

  const rainbow = createCartoonRainbow(camera);
  all.add(rainbow.object);

  // 房子：house.ts 裡的長方體，種在綠球（地表）上
  // 要用緞帶的軸來決定種在哪，所以放在緞帶建立之後
  // 加成 ground pivot 的子物件（跟綠球同層）：球怎麼移動、縮放，房子都會跟著走，且影子能落在球面上
  const mainHall = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  ground.add(mainHall.object);

  // Rroject
  const projectRoom = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  // 第二棟用面板調過的數值，跟第一棟分開，不改 house.ts 的預設
  Object.assign(projectRoom.settings, {
    angleFromTopDegrees: 7,
    azimuthDegrees: 68,
    spinDegrees: 89,
    sink: 0.015,
    scale: 0.25,
    width: 0.9,
    height: 1.3,
    depth: 1.1,
    color: '#eab380',
  });
  projectRoom.applySettings();
  ground.add(projectRoom.object);
  attachHouseModel(projectRoom, PROJECT_ROOM_MODEL_URL);

  // BG
  const bgRoom = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  Object.assign(bgRoom.settings, {
    // 離頂端拉近一點，才會坐在看得見的坡上，不會滑到地平線外面
    angleFromTopDegrees: 28,
    azimuthDegrees: -84,
    spinDegrees: 84,
    sink: 0.02,
    scale: 0.14,
    width: 1.2,
    height: 0.9,
    depth: 1.05,
    color: '#1cab5a',
  });
  bgRoom.applySettings();
  ground.add(bgRoom.object);

  // TW
  const twRoom = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  Object.assign(twRoom.settings, {
    angleFromTopDegrees: 22,
    azimuthDegrees: -80,
    spinDegrees: 29,
    sink: 0.03,
    scale: 0.15,
    // 不要正方體：正方體種在斜坡上會像骰子倒著，拉高一點才像一棟小房子
    width: 0.75,
    height: 1.15,
    depth: 0.75,
    color: '#8280ea',
  });
  twRoom.applySettings();
  ground.add(twRoom.object);


  const Gamehall = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  Object.assign(Gamehall.settings, {
    angleFromTopDegrees: 24,
    azimuthDegrees: 49,
    spinDegrees: 99,
    sink: 0,
    scale: 0.15,
    width: 1.25,
    height: 0.95,
    depth: 1.15,
    color: '#9fe571',
  });
  Gamehall.applySettings();
  ground.add(Gamehall.object);
  const gameHallLights = createGameHallLights();

  attachHouseModel(Gamehall, GAME_HALL_MODEL_URL, (model) => {
    gameHallLights.bind(model);
  });


  const introHouses = [mainHall, projectRoom, bgRoom, twRoom, Gamehall];
  // 鏡頭看的方向。小球的起點會落在這個方向和畫面上方之間
  const approachDir = new THREE.Vector3();
  if (camera.position.lengthSq() > 1e-8) approachDir.copy(camera.position).normalize();
  else approachDir.set(0, 0, 1);
  const introSettings = {
    emptyHold: 0.45,
    ballStartScale: 0.22,
    ballSeconds: 0.9,
    ballScaleLag: 0.08,
    ballOvershoot: 2.8,
    ballMoveEase: 'outCubic' as IntroBallEase,
    ballScaleEase: 'outBack' as IntroBallEase,
    houseSeconds: 1.15,
    houseStagger: 0.1,
    houseOvershoot: 2.5,
    ketchupSeconds: 1.35,
    // 最後一棟長到這個比例，番茄醬才開始流
    ketchupAfterHouse: 0.45,
    rainbowSeconds: 1.1,
  };

  let introStarted: number | null = null;
  let introElapsed = 0;
  let introDone = false;
  let lastUpdateTime: number | null = null;
  let startReady = false;
  const startPos = new THREE.Vector3();
  const restPos = new THREE.Vector3();
  const probe = new THREE.Vector3();

  /**
   * 畫面把球心裁到下緣外面，小球若放在原點會整個看不到
   * 改從畫面上方、還在鏡頭前面的位置跑進來，才看得出從遠處變大
   */
  function ensureStart() {
    if (startReady || ground === all) return;
    startReady = true;
    camera.updateMatrixWorld();
    const halfFov = Math.tan(THREE.MathUtils.degToRad(14.5 / 2));
    let bestScore = Infinity;
    // 球心要落在畫面偏上，而且離鏡頭夠遠，縮小之後才是遠處的一顆小球
    for (let along = 8; along <= 16; along += 0.4) {
      for (let lift = -2; lift <= 3; lift += 0.2) {
        probe.copy(camera.position).addScaledVector(approachDir, -along).addScaledVector(camera.up, lift);
        const dist = probe.distanceTo(camera.position);
        const ndcRadius = (introSettings.ballStartScale / dist) / halfFov;
        if (ndcRadius > 0.16 || ndcRadius < 0.07) continue;
        const ndc = probe.clone().project(camera);
        if (ndc.z < -1 || ndc.z > 1) continue;
        if (Math.abs(ndc.x) > 0.55 || ndc.y < -0.15 || ndc.y > 0.75) continue;
        const score = Math.abs(ndc.x) + Math.abs(ndc.y - 0.35);
        if (score < bestScore) {
          bestScore = score;
          startPos.copy(probe);
        }
      }
    }
    // 沒有同時又小又在畫面裡的點時，放在視線前方遠處再往上抬，至少不會貼在鏡頭上
    if (bestScore === Infinity) {
      startPos.copy(camera.position).addScaledVector(approachDir, -12).addScaledVector(camera.up, 1.4);
    }
  }

  function placeBall(elapsed: number) {
    if (ground === all) return;
    const ballTime = elapsed - introSettings.emptyHold;
    if (ballTime < 0) {
      ground.visible = false;
      return;
    }
    ground.visible = true;
    ensureStart();
    const moveRaw = THREE.MathUtils.clamp(ballTime / introSettings.ballSeconds, 0, 1);
    const scaleSpan = Math.max(introSettings.ballSeconds - introSettings.ballScaleLag, 0.001);
    const scaleRaw = THREE.MathUtils.clamp((ballTime - introSettings.ballScaleLag) / scaleSpan, 0, 1);
    const moveT = sampleIntroBallEase(introSettings.ballMoveEase, moveRaw, introSettings.ballOvershoot);
    const scaleT = sampleIntroBallEase(introSettings.ballScaleEase, scaleRaw, introSettings.ballOvershoot);
    ground.position.lerpVectors(startPos, restPos, moveT);
    ground.scale.setScalar(THREE.MathUtils.lerp(introSettings.ballStartScale, 1, scaleT));
  }

  function placeHouses(elapsed: number) {
    const houseStart = introSettings.emptyHold + introSettings.ballSeconds;
    introHouses.forEach((house, index) => {
      const t = THREE.MathUtils.clamp(
        (elapsed - houseStart - index * introSettings.houseStagger) / introSettings.houseSeconds,
        0,
        1,
      );
      // 原點在屋腳，從 0 放大；略衝過再收回，一次回彈就停穩
      const grown = Math.max(0.0001, easeOutBack(t, introSettings.houseOvershoot));
      house.object.scale.setScalar(house.settings.scale * grown);
    });
  }

  function placeFlowers(elapsed: number) {
    if (!groundFlowers) return;
    const houseStart = introSettings.emptyHold + introSettings.ballSeconds;
    const grows = introHouses.map((_, index) => {
      const t = THREE.MathUtils.clamp(
        (elapsed - houseStart - index * introSettings.houseStagger) / introSettings.houseSeconds,
        0,
        1,
      );
      return Math.max(0.0001, easeOutBack(t, introSettings.houseOvershoot));
    });
    groundFlowers.setIntroHouseGrows(grows);
  }

  // 房子先收成 0。開場先不要綠球，等空景一段再從遠處跑進來
  placeHouses(0);
  groundFlowers?.resetIntro(introHouses.length);
  placeFlowers(0);
  if (ground !== all) ground.visible = false;

  /** 每幀呼叫：time 單位是秒，讓會動的物件更新動畫 */
  function update(time: number) {
    const deltaTime = lastUpdateTime === null ? 0 : Math.min(time - lastUpdateTime, 0.1);
    lastUpdateTime = time;
    ketchup.update(time);
    if (introStarted === null) introStarted = time;
    introElapsed = time - introStarted;

    if (introDone) {
      rainbow.finishIntro();
      groundFlowers?.finishIntro();
    } else {
      placeBall(introElapsed);
      placeHouses(introElapsed);
      placeFlowers(introElapsed);
      // 最後一棟長到一半，醬才從球後方沿環流出來
      const ketchupStart =
        introSettings.emptyHold +
        introSettings.ballSeconds +
        (introHouses.length - 1) * introSettings.houseStagger +
        introSettings.houseSeconds * introSettings.ketchupAfterHouse;
      const ketchupEnd = ketchupStart + introSettings.ketchupSeconds;
      const wrap = easeInOutCubic(
        THREE.MathUtils.clamp((introElapsed - ketchupStart) / introSettings.ketchupSeconds, 0, 1),
      );
      ketchup.setWrap(wrap);

      let rainbowReveal = 0;
      if (introElapsed >= ketchupEnd) {
        rainbowReveal = easeOutCubic(
          THREE.MathUtils.clamp((introElapsed - ketchupEnd) / introSettings.rainbowSeconds, 0, 1),
        );
      }
      rainbow.setIntroReveal(rainbowReveal);

      if (introElapsed >= ketchupEnd + introSettings.rainbowSeconds) {
        if (ground !== all) {
          ground.visible = true;
          ground.position.copy(restPos);
          ground.scale.setScalar(1);
        }
        introHouses.forEach((house) => house.object.scale.setScalar(house.settings.scale));
        groundFlowers?.finishIntro();
        ketchup.setWrap(1);
        rainbow.finishIntro();
        introDone = true;
      }
    }

    rainbow.update(deltaTime);
    gameHallLights?.update(time);
  }

  function isHouseGrown(object: THREE.Object3D) {
    if (introDone) return true;
    const index = introHouses.findIndex((house) => house.object === object);
    if (index < 0) return true;
    return (
      introElapsed >=
      introSettings.emptyHold + introSettings.ballSeconds + index * introSettings.houseStagger + introSettings.houseSeconds
    );
  }

  /** 從空景重新跑入場，方便在面板調完秒數立刻看效果 */
  function replayIntro() {
    introDone = false;
    introStarted = null;
    introElapsed = 0;
    startReady = false;
    placeHouses(0);
    groundFlowers?.resetIntro(introHouses.length);
    placeFlowers(0);
    if (ground !== all) {
      ground.visible = false;
      ground.position.copy(restPos);
      ground.scale.setScalar(introSettings.ballStartScale);
    }
    ketchup.resetIntro();
    rainbow.resetIntro();
  }

  // 緞帶擺放參數也往外交出去，讓 main.ts 的控制面板可以調整
  // houses：畫面上每一棟。點到哪一棟，面板就顯示那一棟的設定
  return {
    all,
    update,
    ketchupRing: { object: ketchup.ringObject, settings: ketchup.ringSettings, apply: ketchup.applyRingSettings },
    ketchupVisual: { settings: ketchup.visualSettings, apply: ketchup.applyVisualSettings },
    // 食物數量：面板上的滑桿改這個，再叫 apply 把多出來或少掉的塊數補上
    ketchupFood: { settings: ketchup.foodSettings, apply: () => ketchup.setFoodCount(ketchup.foodSettings.count) },
    ketchupChicken: {
      settings: ketchup.chickenFoodSettings,
      apply: ketchup.applyChickenFoodSettings,
      rerollColors: ketchup.rerollChickenCrustColors,
    },
    ketchupFry: { settings: ketchup.fryFoodSettings, apply: ketchup.applyFryFoodSettings },
    ketchupShark: { settings: ketchup.sharkFinSettings, apply: ketchup.applySharkFinSettings },
    ketchupSharkWaves: { settings: ketchup.sharkFinWaveSettings, apply: ketchup.applySharkFinWaveSettings },
    rainbow: { settings: rainbow.settings, apply: rainbow.applyRainbowSettings },
    // ground、groundSurface、groundRadius：拖曳與地表材質；ground 是 pivot，groundSurface 才是綠球 mesh
    ground,
    groundSurface,
    groundFlowers,
    groundRadius: GROUND_RADIUS,
    isHouseGrown,
    isIntroComplete: () => introDone,
    introSettings,
    replayIntro,
    gameHallLights,
    houses: [
      exposeHouse('mainHall', mainHall),
      exposeHouse('projectRoom', projectRoom),
      exposeHouse('bgRoom', bgRoom),
      exposeHouse('twRoom', twRoom),
      exposeHouse('Gamehall', Gamehall),
    ],
  };
}

export type WorldHouse = {
  label: string;
  object: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhongMaterial>;
  settings: HouseSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

/** 把 createHouse 的回傳整理成面板、射線選取都能用的同一種形狀 */
/** 開始快、結束慢 */
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** 兩頭慢、中間快：番茄醬沿環長出來 */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** 略衝過終點再彈回。overshoot 越大，跳動越明顯 */
function easeOutBack(t: number, overshoot = 1.70158) {
  return 1 + (overshoot + 1) * Math.pow(t - 1, 3) + overshoot * Math.pow(t - 1, 2);
}

function easeInOutSine(t: number) {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}

function easeInCubic(t: number) {
  return t * t * t;
}

function sampleIntroBallEase(kind: IntroBallEase, t: number, overshoot: number) {
  switch (kind) {
    case 'linear':
      return t;
    case 'inCubic':
      return easeInCubic(t);
    case 'outCubic':
      return easeOutCubic(t);
    case 'inOutCubic':
      return easeInOutCubic(t);
    case 'inOutSine':
      return easeInOutSine(t);
    case 'inOutQuad':
      return easeInOutQuad(t);
    case 'outQuad':
      return easeOutQuad(t);
    case 'outBack':
      return easeOutBack(t, overshoot);
    default:
      return easeOutCubic(t);
  }
}

function exposeHouse(label: string, house: ReturnType<typeof createHouse>): WorldHouse {
  return {
    label,
    object: house.object,
    settings: house.settings,
    apply: house.applySettings,
    getNormal: house.getNormal,
    setNormal: house.setNormal,
  };
}

/**
 * 算出地球的「頂端」和「正前方」，房子的經緯度就從這兩個方向開始算
 *   頂端 up = 番茄醬緞帶圈圈的中心軸
 *     main.ts 的 ORBIT_ALONG_KETCHUP 讓鏡頭繞著這條軸轉，拖動畫面看起來就像地球在自轉
 *     房子不在軸上，拖動時就會像地表上的東西一樣，被「轉」到側邊、背面再繞回來
 *   正前方 front = 一開始鏡頭所在的那一側
 *     方位 0° 的房子就會正對著我們、在畫面中間；往反方向放會躲在地球後面
 * 注意：只在建立時算一次，之後在面板調整緞帶的傾斜、方位，地球的軸不會跟著變（camera.up 也是）
 */
function getGroundAxes(ringObject: THREE.Object3D, camera: THREE.Camera) {
  // 緞帶的位置、角度是剛剛才設定的，矩陣還沒算；少了這行會拿到沒轉過的預設軸
  ringObject.updateMatrixWorld(true);
  // 緞帶繞著自己的 y 軸流動，換算成世界座標（跟 main.ts 設定 camera.up 的算法一樣）
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ringObject.getWorldQuaternion(new THREE.Quaternion()));
  // 同一條軸有兩頭，挑偏向上方那頭，跟 main.ts 一致；選錯會種到地球背面去
  if (up.y < 0) up.negate();

  // 鏡頭在「水平方向」上的位置：把鏡頭位置沿著軸的那段扣掉，只留垂直於軸的部分
  const front = camera.position.clone().addScaledVector(up, -camera.position.dot(up)).normalize();
  return { up, front };
}

// 綠色球：用來觀察燈光效果
function createBall() {
  // 鏡頭很近，16×16 的地平線會變成一截截折線，跟柔的天空對起來特別硬
  // 64×48 在這個距離看起來是圓的；只這一顆球，段數高一點還負擔得起
  const geometry = new THREE.SphereGeometry(GROUND_RADIUS, 64, 48);
  const material = new THREE.MeshPhongMaterial({
    // 光的顏色會跟材質顏色「相乘」：純綠的紅、藍都是 0，打黃光、紫光上去會變橄欖或全黑
    // 所以混進青和一點紅，顏色才跟背景、房子的粉彩同一掛，不會搶成一塊螢光綠
    color: 0x7ee8b8,
    // 光澤度：數值越大高光點越小越亮（像塑膠、瓷器），預設 30 偏霧面
    // 高光收小一點：球的正面以前會亮成一顆白點，壓在底部的紅上面很搶
    shininess: 14,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

// 炸雞模型：載入是非同步的，先把空的 all 交給場景，載完再把模型塞進去
// 這樣 main.ts 不用改成 await，畫面也不會因為等模型而整個卡住
function loadModel(all: THREE.Object3D) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      fitToSize(model, MODEL_SIZE);
      all.add(model);
    },
    undefined,
    (error) => {
      console.error(`[obj] 模型載入失敗，請確認檔案存在：${MODEL_URL}`, error);
    },
  );
}

/**
 * 把 glb 模型套到某一棟房子上，取代原本的長方體外觀
 * 長方體不刪：種在球面上的位置、拖曳點選、控制面板、入場長大，全都是靠它算的
 * 所以只把它「藏起來」，模型當成它的子物件，長方體怎麼移動、縮放，模型都會跟著走
 */
function attachHouseModel(
  house: ReturnType<typeof createHouse>,
  url: string,
  onLoaded?: (model: THREE.Object3D) => void,
) {
  // material.visible = false：畫面上不畫、也不投影子（不然會多一塊方形的影子）
  // 但射線（Raycaster）不看材質可不可見，所以滑鼠還是點得到、拖得動這一棟
  // 不能用 object.visible = false：那會連子物件（模型）一起藏起來
  house.object.material.visible = false;

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    url,
    (gltf) => {
      const model = gltf.scene;
      fitIntoHouseBox(model, house.settings);
      model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        // 跟原本的長方體一樣會投影、也接得到影子；少了這兩行，房子在手電筒光下會像貼紙一樣沒有影子
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      house.object.add(model);
      house.applySettings();
      onLoaded?.(model);
    },
    undefined,
    (error) => {
      console.error(`[obj] 房子模型載入失敗，請確認檔案存在：${url}`, error);
    },
  );
}

/**
 * 把模型等比例縮放，塞進房子長方體的範圍裡（寬 × 高 × 深，原點在底部中央）
 * 為什麼是長方體的範圍、不是直接用 HOUSE_SCALE？
 *   模型是長方體的子物件，長方體的 scale 會再乘上去；這裡只要對齊「長方體還沒縮放前」的大小
 *   這樣面板調 scale、入場動畫從 0 長大，模型都會跟長方體一模一樣
 * 注意：只在載入時算一次，之後在面板改寬高深，模型不會重新塞
 */
function fitIntoHouseBox(model: THREE.Object3D, { width, height, depth }: HouseSettings) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  // 取三個方向裡最緊的那個比例：等比例縮放才不會把房子壓扁，又保證三邊都不會超出長方體
  const scale = Math.min(width / size.x, height / size.y, depth / size.z);
  model.scale.setScalar(scale);
  // 水平置中、底部貼齊 y = 0（長方體的原點在底部中央）；少了這步，房子會一半陷進地裡或偏到一邊
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
}

/**
 * 把模型縮放到指定大小，並把中心移到原點
 * 網路下載的模型單位五花八門（公分、公尺、甚至隨便畫），
 * 少了這步，模型可能大到塞爆畫面、小到看不見，或偏離 OrbitControls 的旋轉中心
 */
function fitToSize(object: THREE.Object3D, size: number) {
  // Box3：包住整個模型的最小長方體，用來量模型實際的長寬高與中心
  const box = new THREE.Box3().setFromObject(object);
  const dimensions = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const scale = size / Math.max(dimensions.x, dimensions.y, dimensions.z);
  object.scale.setScalar(scale);
  // 先縮放再平移：中心點也要乘上同樣的比例，才會剛好移回原點
  object.position.copy(center).multiplyScalar(-scale);
}
