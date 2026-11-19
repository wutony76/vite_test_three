import * as THREE from 'three';
import { cloneGltfInstance, loadGltfOnce, preloadGltfs, scheduleGltfMount } from './sharedGltf';
import { createKetchup, KETCHUP_TUBE_OUTER_RADIUS } from './ketchup';
import { createHouse, type HouseSettings } from './house';
import { createCartoonRainbow } from './rainbow';
import { createGameHallLights } from './gameHallLights';
import { createGameHallRings } from './gameHallRings';
import { createCritters } from './critters';
import {
  createDanceMachine,
  DANCE_MACHINE_DEFAULT,
  DANCE_MACHINE_PLACEMENTS,
  type DanceMachinePlacement,
  type DanceMachineSettings,
} from './danceMachine';
import { createDenpaCharacter } from './denpaCharacter';
import { createGroundFlowers, type GroundFlowers } from './groundFlowers';
import {
  createGrilledCorn,
  type GrilledCornSettings,
  type GrilledCornVisualSettings,
} from './grilledCorn';
import { createFriedEgg, type FriedEggSettings } from './friedEgg';
import { FRIED_EGG_PLACEMENTS, type FriedEggLayout } from './friedEggLayout';
import {
  GRILLED_CORN_LAYOUT_DEFAULT,
  GRILLED_CORN_PLACEMENTS,
  GRILLED_CORN_VISUAL_DEFAULT,
  splitGrilledCornPlacement,
  type GrilledCornPlacement,
} from './grilledCornLayout';
import { createPudding, type PuddingSettings } from './pudding';
import { PUDDING_LAYOUT_DEFAULT, PUDDING_PLACEMENTS, type PuddingLayout } from './puddingLayout';
import { createSalmonSteak, type SalmonSteakSettings } from './salmonSteak';
import {
  SALMON_STEAK_LAYOUT_DEFAULT,
  SALMON_STEAK_PLACEMENTS,
  type SalmonSteakLayout,
} from './salmonSteakLayout';
import { createLemonSlice, type LemonSliceSettings } from './lemonSlice';
import {
  LEMON_SLICE_LAYOUT_DEFAULT,
  LEMON_SLICE_PLACEMENTS,
  type LemonSliceLayout,
} from './lemonSliceLayout';
import { createFrenchFries, type FrenchFriesSettings } from './frenchFries';
import {
  FRENCH_FRIES_LAYOUT_DEFAULT,
  FRENCH_FRIES_PLACEMENTS,
  type FrenchFriesLayout,
} from './frenchFriesLayout';
import { createFrenchFryStick, type FrenchFryStickSettings } from './frenchFryStick';
import {
  FRENCH_FRY_STICK_LAYOUT_DEFAULT,
  FRENCH_FRY_STICK_PLACEMENTS,
  type FrenchFryStickLayout,
} from './frenchFryStickLayout';
import { createPig, type PigSettings } from './pig';
import { createPigAdventure, type PigAdventureSettings } from './pigAdventure';
import type { PigCloudSettings, PigCloudState } from './pigCloud';
import { createCampfire, type CampfireSettings } from './campfire';
import { createShiitake, SHIITAKE_DEFAULT, SHIITAKE_PLACEMENTS, type ShiitakeSettings } from './shiitake';
import { createTreasureChest, type TreasureChestSettings } from './treasureChest';
import { createProjectRoomStyle } from './projectRoomStyle';
import { createHappyFatShop, type HappyFatShopSettings } from './happyFatShop';
import { createChineseTemple, type ChineseTempleSettings } from './chineseTemple';
import { createBigBun, type BigBunSettings } from './bigBun';
import {
  createRetroArcade,
  RETRO_ARCADE_DEFAULT,
  RETRO_ARCADE_PLACEMENTS,
  type RetroArcadePlacement,
  type RetroArcadeSettings,
} from './retroArcade';
import { createPond, type PondSettings } from './pond';
import { createMainHallSlide, type MainHallSlideSettings } from './mainHallSlide';
import { createFloatingIsland } from './floatingIsland';
import { createGroundDetail, type GroundObstacle } from './groundDetail';

// 模型放在 public/ 底下，Vite 會原封不動地提供，網址從 BASE_URL 開始算
// 想換模型只要改這裡：雞塊檔案還沒下載，先用雞腿看效果
// const MODEL_URL = `${import.meta.env.BASE_URL}models/nugget/nugget.glb`;
const MODEL_URL = `${import.meta.env.BASE_URL}models/chicken_leg/chicken_leg.glb`;

// projectRoom 的外觀：用 Blender 做的 low poly 房子（匯出時已拿掉底下那塊平的地面，才能種在球面上）
const PROJECT_ROOM_MODEL_URL = `${import.meta.env.BASE_URL}models/project_room/project_room.glb`;
// GameHall 的外觀：「電 • 波 • 町」香菇電子遊樂中心（依參考圖用 mainHall 香菇屋的風格簡化），plan 在 tools/blender/plans/mushroom_arcade.plan.json
// 換回原本的遊戲廳：改成 `${import.meta.env.BASE_URL}models/game_hall/gameHall.glb`，並把下面 Gamehall 的長寬高、spinDegrees 改回註解裡的值
const GAME_HALL_MODEL_URL = `${import.meta.env.BASE_URL}models/mushroom_arcade/mushroom_arcade.glb`;
// 電波町霓虹小店（頂樓「電・波・町」霓虹招牌，plan 在 tools/blender/plans/neon_shop.plan.json）
// 想換到 Gamehall：把上一行改成下面這個網址，並把 Gamehall 的 spinDegrees 改成 189（招牌面才會朝向鏡頭）
// `${import.meta.env.BASE_URL}models/neon_shop/neon_shop.glb`
// mainHall 的外觀：奇幻香菇屋（三層白色葫蘆屋身、粉紅菇傘＋兔耳、門口陽台），plan 在 tools/blender/plans/mushroom_house.plan.json
const MAIN_HALL_MODEL_URL = `${import.meta.env.BASE_URL}models/mushroom_house/mushroom_house.glb`;

/** 香菇屋（mainHall）大門的大小：面板調完按「印出設定」，貼回這裡 */
export type MainHallDoorSettings = {
  /** 整體倍率 */
  scale: number;
  /** 寬度倍率（再乘上整體倍率） */
  width: number;
  /** 高度倍率（再乘上整體倍率） */
  height: number;
};

export const MAIN_HALL_DOOR_DEFAULT: MainHallDoorSettings = { scale: 0.8, width: 1, height: 1 };
const TW_HALL_MODEL_URL = `${import.meta.env.BASE_URL}models/twhall/twhall.glb`;
// bgRoom 的外觀：點心樓（程式拼出來的圓形中式樓閣，見 chineseTemple.ts），取代原本的日式洗衣店小樓。
// 洗衣店模型還在 public/models/laundry/laundry.glb（plan 在 tools/blender/plans/laundry.plan.json），
// 想換回來：把 attachChineseTemple 換回 attachHouseModel(bgRoom, 那個網址)，並把網址加回 WORLD_GLTF_URLS

export const WORLD_GLTF_URLS = [
  MODEL_URL,
  PROJECT_ROOM_MODEL_URL,
  GAME_HALL_MODEL_URL,
  TW_HALL_MODEL_URL,
  `${import.meta.env.BASE_URL}models/pudding/pudding.glb`,
  `${import.meta.env.BASE_URL}models/grilled_corn/grilled_corn.glb`,
  `${import.meta.env.BASE_URL}models/salmon_steak/salmon_steak.glb`,
  `${import.meta.env.BASE_URL}models/lemon_slice/lemon_slice.glb`,
  `${import.meta.env.BASE_URL}models/french_fries/french_fries.glb`,
  `${import.meta.env.BASE_URL}models/french_fry/french_fry.glb`,
  `${import.meta.env.BASE_URL}models/fried_egg/fried_egg.glb`,
  `${import.meta.env.BASE_URL}models/roast_chicken/roast_chicken.glb`,
  `${import.meta.env.BASE_URL}models/pig_v2/pig_v2.glb`,
  `${import.meta.env.BASE_URL}models/shiitake/shiitake.glb`,
  `${import.meta.env.BASE_URL}models/treasure_chest/treasure_chest.glb`,
  `${import.meta.env.BASE_URL}models/burger/burger.glb`,
  `${import.meta.env.BASE_URL}models/mushroom_house/mushroom_house.glb`,
  `${import.meta.env.BASE_URL}models/earth_mamas/earth_mamas.glb`,
] as const;

// true = 載入網路下載的模型；false = 顯示原本的綠色球
const USE_MODEL = false;

// 綠球（地表）的半徑：房子要種在球面上，得知道表面離球心多遠
const GROUND_RADIUS = 1;

// 模型縮放後「最長邊」的長度：2 = 跟原本半徑 1 的球一樣大，鏡頭和燈光都不用重調
const MODEL_SIZE = 2;

type CreateObjsOptions = {
  // 環境貼圖：給番茄醬這類光滑材質反射用
  envMap: THREE.Texture;
  // 中性（不染色）的環境貼圖：給荷包蛋用，避免蛋白反射出番茄醬的紅
  eggEnvMap?: THREE.Texture;
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

export function createObjs({ envMap, eggEnvMap, camera }: CreateObjsOptions) {
  preloadGltfs(WORLD_GLTF_URLS);
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
  // 換成香菇屋：長方體的比例改成跟模型一樣（寬 7、高 12.5、深 7.4 → 1.3 : 2.33 : 1.38），
  // fitIntoHouseBox 是「三邊都不超出」的等比縮放，比例不合會被最緊的那一邊縮小
  Object.assign(mainHall.settings, {
    width: 1.3,
    height: 2.33,
    depth: 1.38,
    // 底座水窪很薄，下沉太多會整片埋進地裡（原本長方體是 0.03）
    sink: 0.004,
    // 使用者在面板調好的擺放（門朝鏡頭、放在綠球頂端）
    angleFromTopDegrees: 2,
    azimuthDegrees: -66,
    spinDegrees: 104,
    scale: 0.195,
  });
  mainHall.applySettings();
  ground.add(mainHall.object);
  // 菇傘邊垂下的 4 條香菇串（每條是模型裡的獨立節點 mushroom_house_hanger_1～4）
  const mainHallHangers: THREE.Object3D[] = [];
  /**
   * 香菇屋的大門可以在面板調大小。門在模型裡是獨立節點，原點在門底中心（陽台平台上），
   * 所以縮放這個節點時門會「站在平台上」往上、往兩側變大，不會浮起來或沉進平台。
   */
  const mainHallDoorSettings: MainHallDoorSettings = { ...MAIN_HALL_DOOR_DEFAULT };
  let mainHallDoor: THREE.Object3D | null = null;
  // 節點原本的縮放：meshopt 壓縮可能讓節點縮放不是 1，套倍率時要「原本 × 倍率」
  const mainHallDoorBaseScale = new THREE.Vector3(1, 1, 1);
  /** 香菇屋的屋身：溜滑梯要從它的三樓外牆出發 */
  let mainHallBody: THREE.Mesh | null = null;
  function applyMainHallDoor() {
    if (!mainHallDoor) return;
    const s = Math.max(0.1, mainHallDoorSettings.scale);
    (mainHallDoor as THREE.Object3D).scale.set(
      mainHallDoorBaseScale.x * s * Math.max(0.1, mainHallDoorSettings.width),
      mainHallDoorBaseScale.y * s * Math.max(0.1, mainHallDoorSettings.height),
      mainHallDoorBaseScale.z * s,
    );
  }
  attachHouseModel(mainHall, MAIN_HALL_MODEL_URL, (model) => {
    model.traverse((child) => {
      if (/_hanger_\d+$/.test(child.name)) mainHallHangers.push(child);
      if (child.name.endsWith('_door')) mainHallDoor = child;
      if (child.name === 'mushroom_house_body' && (child as THREE.Mesh).isMesh) mainHallBody = child as THREE.Mesh;
    });
    if (mainHallDoor) mainHallDoorBaseScale.copy((mainHallDoor as THREE.Object3D).scale);
    applyMainHallDoor();
  });

  type PuddingRuntime = ReturnType<typeof createPudding>;
  const puddingEntries: Array<{ world: WorldPudding; runtime: PuddingRuntime }> = [];
  const puddings: WorldPudding[] = [];
  const puddingAxes =
    ground !== all ? { groundRadius: GROUND_RADIUS, envMap, ...getGroundAxes(ketchup.ringObject, camera) } : null;

  function nextPuddingId() {
    let n = puddingEntries.length + 1;
    let id = `pudding_${n}`;
    while (puddings.some((item) => item.id === id)) {
      n += 1;
      id = `pudding_${n}`;
    }
    return id;
  }

  function spawnPudding(id: string, layout: PuddingLayout, grown = false) {
    if (!puddingAxes) return null;
    const runtime = createPudding({ ...puddingAxes, layout: { ...layout } });
    ground.add(runtime.object);
    const world = exposePudding(id, runtime);
    puddingEntries.push({ world, runtime });
    puddings.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  if (puddingAxes) {
    for (const placement of PUDDING_PLACEMENTS) {
      const { id, ...layout } = placement;
      spawnPudding(id, layout);
    }
  }

  type GrilledCornRuntime = ReturnType<typeof createGrilledCorn>;
  const grilledCornEntries: Array<{ world: WorldGrilledCorn; runtime: GrilledCornRuntime }> = [];
  const grilledCorns: WorldGrilledCorn[] = [];

  function spawnGrilledCorn(
    id: string,
    placement: Omit<GrilledCornPlacement, 'id'>,
    grown = false,
  ) {
    if (!puddingAxes) return null;
    const { layout, visual } = splitGrilledCornPlacement({ id, ...placement });
    const runtime = createGrilledCorn({ ...puddingAxes, layout: { ...layout }, visual: { ...visual } });
    ground.add(runtime.object);
    const world = exposeGrilledCorn(id, runtime);
    grilledCornEntries.push({ world, runtime });
    grilledCorns.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  if (puddingAxes) {
    for (const placement of GRILLED_CORN_PLACEMENTS) {
      const { id, ...rest } = placement;
      spawnGrilledCorn(id, rest);
    }
  }

  type SalmonSteakRuntime = ReturnType<typeof createSalmonSteak>;
  const salmonSteakEntries: Array<{ world: WorldSalmonSteak; runtime: SalmonSteakRuntime }> = [];
  const salmonSteaks: WorldSalmonSteak[] = [];

  function spawnSalmonSteak(id: string, layout: SalmonSteakLayout, grown = false) {
    if (!puddingAxes) return null;
    const runtime = createSalmonSteak({ ...puddingAxes, layout: { ...layout } });
    ground.add(runtime.object);
    const world = exposeSalmonSteak(id, runtime);
    salmonSteakEntries.push({ world, runtime });
    salmonSteaks.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  if (puddingAxes) {
    for (const placement of SALMON_STEAK_PLACEMENTS) {
      const { id, ...layout } = placement;
      spawnSalmonSteak(id, layout);
    }
  }

  type LemonSliceRuntime = ReturnType<typeof createLemonSlice>;
  const lemonSliceEntries: Array<{ world: WorldLemonSlice; runtime: LemonSliceRuntime }> = [];
  const lemonSlices: WorldLemonSlice[] = [];

  function spawnLemonSlice(id: string, layout: LemonSliceLayout, grown = false) {
    if (!puddingAxes) return null;
    const runtime = createLemonSlice({ ...puddingAxes, layout: { ...layout } });
    ground.add(runtime.object);
    const world = exposeLemonSlice(id, runtime);
    lemonSliceEntries.push({ world, runtime });
    lemonSlices.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  if (puddingAxes) {
    for (const placement of LEMON_SLICE_PLACEMENTS) {
      const { id, ...layout } = placement;
      spawnLemonSlice(id, layout);
    }
  }

  type FrenchFriesRuntime = ReturnType<typeof createFrenchFries>;
  const frenchFriesEntries: Array<{ world: WorldFrenchFries; runtime: FrenchFriesRuntime }> = [];
  const frenchFries: WorldFrenchFries[] = [];

  function spawnFrenchFries(id: string, layout: FrenchFriesLayout, grown = false) {
    if (!puddingAxes) return null;
    const runtime = createFrenchFries({ ...puddingAxes, layout: { ...layout } });
    ground.add(runtime.object);
    const world = exposeFrenchFries(id, runtime);
    frenchFriesEntries.push({ world, runtime });
    frenchFries.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  if (puddingAxes) {
    for (const placement of FRENCH_FRIES_PLACEMENTS) {
      const { id, ...layout } = placement;
      spawnFrenchFries(id, layout);
    }
  }

  function nextFrenchFriesId() {
    let n = frenchFriesEntries.length + 1;
    let id = `french_fries_${n}`;
    while (frenchFries.some((item) => item.id === id)) {
      n += 1;
      id = `french_fries_${n}`;
    }
    return id;
  }

  function addFrenchFries(seed?: Partial<FrenchFriesLayout>): WorldFrenchFries | null {
    if (!puddingAxes) return null;
    const base: FrenchFriesLayout = { ...FRENCH_FRIES_LAYOUT_DEFAULT, ...seed };
    const azimuth = seed?.azimuthDegrees ?? FRENCH_FRIES_LAYOUT_DEFAULT.azimuthDegrees;
    base.azimuthDegrees = wrapDegrees(azimuth + 16);
    return spawnFrenchFries(nextFrenchFriesId(), base, introDone);
  }

  function removeFrenchFries(entry: WorldFrenchFries) {
    const index = frenchFriesEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    const { runtime, world } = frenchFriesEntries[index];
    runtime.dispose();
    frenchFriesEntries.splice(index, 1);
    const friesIndex = frenchFries.indexOf(world);
    if (friesIndex >= 0) frenchFries.splice(friesIndex, 1);
    return true;
  }

  type FrenchFryStickRuntime = ReturnType<typeof createFrenchFryStick>;
  const frenchFryStickEntries: Array<{ world: WorldFrenchFryStick; runtime: FrenchFryStickRuntime }> = [];
  const frenchFrySticks: WorldFrenchFryStick[] = [];

  function spawnFrenchFryStick(id: string, layout: FrenchFryStickLayout, grown = false) {
    if (!puddingAxes) return null;
    const runtime = createFrenchFryStick({ ...puddingAxes, layout: { ...layout } });
    ground.add(runtime.object);
    const world = exposeFrenchFryStick(id, runtime);
    frenchFryStickEntries.push({ world, runtime });
    frenchFrySticks.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  if (puddingAxes) {
    for (const placement of FRENCH_FRY_STICK_PLACEMENTS) {
      const { id, ...layout } = placement;
      spawnFrenchFryStick(id, layout);
    }
  }

  function nextFrenchFryStickId() {
    let n = frenchFryStickEntries.length + 1;
    let id = `french_fry_${n}`;
    while (frenchFrySticks.some((item) => item.id === id)) {
      n += 1;
      id = `french_fry_${n}`;
    }
    return id;
  }

  function addFrenchFryStick(seed?: Partial<FrenchFryStickLayout>): WorldFrenchFryStick | null {
    if (!puddingAxes) return null;
    const base: FrenchFryStickLayout = { ...FRENCH_FRY_STICK_LAYOUT_DEFAULT, ...seed };
    const azimuth = seed?.azimuthDegrees ?? FRENCH_FRY_STICK_LAYOUT_DEFAULT.azimuthDegrees;
    base.azimuthDegrees = wrapDegrees(azimuth + 12);
    return spawnFrenchFryStick(nextFrenchFryStickId(), base, introDone);
  }

  function removeFrenchFryStick(entry: WorldFrenchFryStick) {
    const index = frenchFryStickEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    const { runtime, world } = frenchFryStickEntries[index];
    runtime.dispose();
    frenchFryStickEntries.splice(index, 1);
    const stickIndex = frenchFrySticks.indexOf(world);
    if (stickIndex >= 0) frenchFrySticks.splice(stickIndex, 1);
    return true;
  }

  function nextLemonSliceId() {
    let n = lemonSliceEntries.length + 1;
    let id = `lemon_slice_${n}`;
    while (lemonSlices.some((item) => item.id === id)) {
      n += 1;
      id = `lemon_slice_${n}`;
    }
    return id;
  }

  function addLemonSlice(seed?: Partial<LemonSliceLayout>): WorldLemonSlice | null {
    if (!puddingAxes) return null;
    const base: LemonSliceLayout = { ...LEMON_SLICE_LAYOUT_DEFAULT, ...seed };
    const azimuth = seed?.azimuthDegrees ?? LEMON_SLICE_LAYOUT_DEFAULT.azimuthDegrees;
    base.azimuthDegrees = wrapDegrees(azimuth + 18);
    return spawnLemonSlice(nextLemonSliceId(), base, introDone);
  }

  function removeLemonSlice(entry: WorldLemonSlice) {
    const index = lemonSliceEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    const { runtime, world } = lemonSliceEntries[index];
    runtime.dispose();
    lemonSliceEntries.splice(index, 1);
    const sliceIndex = lemonSlices.indexOf(world);
    if (sliceIndex >= 0) lemonSlices.splice(sliceIndex, 1);
    return true;
  }

  function nextSalmonSteakId() {
    let n = salmonSteakEntries.length + 1;
    let id = `salmon_steak_${n}`;
    while (salmonSteaks.some((item) => item.id === id)) {
      n += 1;
      id = `salmon_steak_${n}`;
    }
    return id;
  }

  function addSalmonSteak(seed?: Partial<SalmonSteakLayout>): WorldSalmonSteak | null {
    if (!puddingAxes) return null;
    const base: SalmonSteakLayout = { ...SALMON_STEAK_LAYOUT_DEFAULT, ...seed };
    const azimuth = seed?.azimuthDegrees ?? SALMON_STEAK_LAYOUT_DEFAULT.azimuthDegrees;
    base.azimuthDegrees = wrapDegrees(azimuth + 14);
    return spawnSalmonSteak(nextSalmonSteakId(), base, introDone);
  }

  function removeSalmonSteak(entry: WorldSalmonSteak) {
    const index = salmonSteakEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    const { runtime, world } = salmonSteakEntries[index];
    runtime.dispose();
    salmonSteakEntries.splice(index, 1);
    const steakIndex = salmonSteaks.indexOf(world);
    if (steakIndex >= 0) salmonSteaks.splice(steakIndex, 1);
    return true;
  }

  type FriedEggRuntime = ReturnType<typeof createFriedEgg>;
  const friedEggEntries: Array<{ world: WorldFriedEgg; runtime: FriedEggRuntime }> = [];
  const friedEggs: WorldFriedEgg[] = [];

  function spawnFriedEgg(
    id: string,
    layout: FriedEggLayout,
    options?: { attachParent?: THREE.Object3D; sceneParent?: THREE.Object3D; grown?: boolean },
  ) {
    if (!puddingAxes) return null;
    const runtime = createFriedEgg({
      ...puddingAxes,
      envMap: eggEnvMap ?? puddingAxes.envMap,
      camera,
      layout: { ...layout },
      attachParent: options?.attachParent ?? null,
      sceneParent: options?.sceneParent ?? null,
    });
    const world = exposeFriedEgg(id, runtime);
    friedEggEntries.push({ world, runtime });
    friedEggs.push(world);
    runtime.setIntroGrow(options?.grown ? 1 : 0);
    return world;
  }

  function nextGrilledCornId() {
    let n = grilledCornEntries.length + 1;
    let id = `grilled_corn_${n}`;
    while (grilledCorns.some((item) => item.id === id)) {
      n += 1;
      id = `grilled_corn_${n}`;
    }
    return id;
  }

  function addGrilledCorn(seed?: Partial<GrilledCornPlacement>): WorldGrilledCorn | null {
    if (!puddingAxes) return null;
    const base: Omit<GrilledCornPlacement, 'id'> = {
      ...GRILLED_CORN_LAYOUT_DEFAULT,
      ...GRILLED_CORN_VISUAL_DEFAULT,
      ...seed,
    };
    const n = grilledCornEntries.length + 1;
    if (seed?.azimuthDegrees === undefined) {
      base.azimuthDegrees = GRILLED_CORN_LAYOUT_DEFAULT.azimuthDegrees + n * 14;
    } else {
      // 從選中的玉米複製時往旁邊錯開 12°（跟香菇一樣）：不錯開的話新玉米會和原本那根完全疊在一起，看起來像沒新增
      base.azimuthDegrees = wrapDegrees(seed.azimuthDegrees + 12);
    }
    return spawnGrilledCorn(nextGrilledCornId(), base, introDone);
  }

  function removeGrilledCorn(entry: WorldGrilledCorn) {
    const index = grilledCornEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    const { runtime, world } = grilledCornEntries[index];
    runtime.dispose();
    grilledCornEntries.splice(index, 1);
    const cornIndex = grilledCorns.indexOf(world);
    if (cornIndex >= 0) grilledCorns.splice(cornIndex, 1);
    return true;
  }

  function addPudding(layout?: Partial<PuddingLayout>): WorldPudding | null {
    if (!puddingAxes) return null;
    const base = { ...PUDDING_LAYOUT_DEFAULT, ...layout };
    const n = puddingEntries.length + 1;
    base.azimuthDegrees = layout?.azimuthDegrees ?? PUDDING_LAYOUT_DEFAULT.azimuthDegrees + n * 14;
    return spawnPudding(nextPuddingId(), base, introDone);
  }

  function removePudding(entry: WorldPudding) {
    const index = puddingEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    const { runtime, world } = puddingEntries[index];
    runtime.object.removeFromParent();
    runtime.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    puddingEntries.splice(index, 1);
    const puddingIndex = puddings.indexOf(world);
    if (puddingIndex >= 0) puddings.splice(puddingIndex, 1);
    return true;
  }

  // Rroject
  const projectRoom = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  // 第二棟用面板調過的數值，跟第一棟分開，不改 house.ts 的預設
  Object.assign(projectRoom.settings, {
    angleFromTopDegrees: 6,
    azimuthDegrees: 63,
    spinDegrees: 99,
    sink: 0.01,
    scale: 0.22,
    width: 0.9,
    height: 1.3,
    depth: 1.1,
    color: '#eab380',
  });
  projectRoom.applySettings();
  ground.add(projectRoom.object);
  // projectRoom 的「香菇屋風格」：參考 mainHall 換配色、加香菇串等小裝飾，不改建築結構；面板可開關比較
  const projectRoomStyleSettings = { enabled: true };
  let projectRoomStyle: ReturnType<typeof createProjectRoomStyle> | null = null;
  attachHouseModel(projectRoom, PROJECT_ROOM_MODEL_URL, (model) => {
    projectRoomStyle = createProjectRoomStyle(model);
    projectRoomStyle.setEnabled(projectRoomStyleSettings.enabled);
  });

  // BG
  const bgRoom = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  Object.assign(bgRoom.settings, {
    angleFromTopDegrees: 28,
    azimuthDegrees: -85,
    spinDegrees: 104,
    sink: 0.005,
    scale: 0.18,
    // 點心樓寬、高、深差不多（圓形，含屋頂上的金幣約 3.6 × 3.6 × 3.6），盒子也做成正方；
    // 少了這步，fitIntoHouseBox 等比例縮放時會被最短的那一邊卡住，整棟變很小
    width: 1.4,
    height: 1.4,
    depth: 1.4,
    color: '#1cab5a',
  });
  bgRoom.applySettings();
  ground.add(bgRoom.object);
  // 點心樓：金色用不染色的環境貼圖，才不會反射出紅色
  const chineseTempleRuntime = createChineseTemple({ envMap: eggEnvMap });
  attachChineseTemple(bgRoom, chineseTempleRuntime.object);

  // TW
  const twRoom = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  Object.assign(twRoom.settings, {
    angleFromTopDegrees: 19,
    azimuthDegrees: -107,
    spinDegrees: 135,
    sink: 0.03,
    scale: 0.15,
    // twhall 立面偏高（約 8.6×7.5 m），盒子略拉高避免 fit 時壓扁
    width: 1.25,
    height: 1.12,
    depth: 0.92,
    color: '#8280ea',
  });
  twRoom.applySettings();
  ground.add(twRoom.object);
  attachHouseModel(twRoom, TW_HALL_MODEL_URL);

  const Gamehall = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  // 換成「電 • 波 • 町」香菇電子遊樂中心：長方體比例改成跟模型一樣（寬 9.1、高 10.2、深 6.6 → 1.25 : 1.40 : 0.91；
  // 改成兩層樓（二樓弧形牆＋半弧屋頂，高度跟一樓一樣），模型變矮；比例沒跟著改的話整棟會被最緊的那一邊卡住），
  // fitIntoHouseBox 是「三邊都不超出」的等比縮放，比例不合會被最緊的那一邊縮小。
  // 原本遊戲廳模型的值：spinDegrees 99、height 0.95、depth 1.15
  Object.assign(Gamehall.settings, {
    angleFromTopDegrees: 24,
    azimuthDegrees: 56,
    // 使用者在面板上調好的角度（原本掃描出的最正面是 90°）
    spinDegrees: 88,
    sink: 0,
    scale: 0.15,
    width: 1.25,
    height: 1.4,
    depth: 0.91,
    color: '#9fe571',
  });
  Gamehall.applySettings();
  ground.add(Gamehall.object);
  const gameHallLights = createGameHallLights();
  // 背後 4 層同心霓虹燈環：掛在長方體底下，拖曳、縮放、入場長大都跟著建築走
  const gameHallRings = createGameHallRings(() => Gamehall.settings.depth);
  Gamehall.object.add(gameHallRings.object);
  // 「電」字霓虹：從舊遊戲廳的「電 • 波 • 町」招牌取出「電」一個字，立在 GameHall 屋頂上（跟著 GameHall 走）
  const denpaCharacterRuntime = createDenpaCharacter();
  Gamehall.object.add(denpaCharacterRuntime.object);

  attachHouseModel(Gamehall, GAME_HALL_MODEL_URL, (model) => {
    gameHallLights.bind(model);
    lightUpGlowDecals(model);
  });

  if (puddingAxes) {
    for (const placement of FRIED_EGG_PLACEMENTS) {
      const { id, ...layout } = placement;
      spawnFriedEgg(id, layout, {
        attachParent:
          layout.mode === 'attach' && layout.hostLabel === 'Gamehall' ? Gamehall.object : undefined,
        sceneParent: layout.mode === 'sun' ? all : layout.mode === 'sphere' ? ground : undefined,
        grown: false,
      });
    }
  }

  const introHouses = [mainHall, projectRoom, bgRoom, twRoom, Gamehall];
  const gameHallIntroIndex = introHouses.length - 1;

  // 篝火：程式產生的 low-poly 火堆，種在綠球上；房子都長完才點火
  const campfireRuntime = puddingAxes
    ? createCampfire({ groundRadius: GROUND_RADIUS, up: puddingAxes.up, front: puddingAxes.front })
    : null;
  if (campfireRuntime) {
    ground.add(campfireRuntime.object);
    campfireRuntime.setIntroGrow(0);
  }

  // 寶箱：裝滿漢堡、滿到掉出來，上方有金色閃光
  const treasureRuntime = puddingAxes
    ? createTreasureChest({ groundRadius: GROUND_RADIUS, up: puddingAxes.up, front: puddingAxes.front, envMap })
    : null;
  if (treasureRuntime) {
    ground.add(treasureRuntime.object);
    treasureRuntime.setIntroGrow(0);
  }

  // 街角小店「Happy Fat」：依參考圖改成香菇屋風格（半弧面屋頂）
  const happyFatRuntime = puddingAxes
    ? createHappyFatShop({ groundRadius: GROUND_RADIUS, up: puddingAxes.up, front: puddingAxes.front, envMap })
    : null;
  if (happyFatRuntime) {
    ground.add(happyFatRuntime.object);
    happyFatRuntime.setIntroGrow(0);
  }

  // 大包子：正面一個金色閃閃發亮的「金」字（整顆用程式拼，不用 GLB）。金字用不染色的環境貼圖，才不會反射出紅色
  const bigBunRuntime = puddingAxes
    ? createBigBun({ groundRadius: GROUND_RADIUS, up: puddingAxes.up, front: puddingAxes.front, envMap: eggEnvMap })
    : null;
  if (bigBunRuntime) {
    ground.add(bigBunRuntime.object);
    bigBunRuntime.setIntroGrow(0);
  }


  // 復古街機：第一台放在 GameHall（電 • 波 • 町 遊樂中心）左邊；可以複製很多台（跟烤玉米一樣）
  type RetroArcadeRuntime = ReturnType<typeof createRetroArcade>;
  const retroArcadeEntries: Array<{ world: WorldRetroArcade; runtime: RetroArcadeRuntime }> = [];
  const retroArcades: WorldRetroArcade[] = [];

  function spawnRetroArcade(id: string, layout: RetroArcadeSettings, grown = false) {
    if (!puddingAxes) return null;
    const runtime = createRetroArcade({
      groundRadius: GROUND_RADIUS,
      up: puddingAxes.up,
      front: puddingAxes.front,
      envMap,
      layout,
    });
    ground.add(runtime.object);
    const n = Number(id.match(/(\d+)$/)?.[1] ?? retroArcadeEntries.length + 1);
    const world: WorldRetroArcade = {
      id,
      label: `復古街機 ${n}`,
      object: runtime.object,
      settings: runtime.settings,
      apply: runtime.applySettings,
      getNormal: runtime.getNormal,
      setNormal: runtime.setNormal,
      setHighlighted: runtime.setHighlighted,
    };
    retroArcadeEntries.push({ world, runtime });
    retroArcades.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  if (puddingAxes) {
    for (const placement of RETRO_ARCADE_PLACEMENTS) {
      const { id, ...layout } = placement;
      spawnRetroArcade(id, layout);
    }
  }

  function nextRetroArcadeId() {
    let n = retroArcadeEntries.length + 1;
    let id = `retro_arcade_${n}`;
    while (retroArcades.some((item) => item.id === id)) {
      n += 1;
      id = `retro_arcade_${n}`;
    }
    return id;
  }

  function addRetroArcade(seed?: Partial<RetroArcadePlacement>): WorldRetroArcade | null {
    if (!puddingAxes) return null;
    const { id: _ignored, ...rest } = seed ?? {};
    const base: RetroArcadeSettings = { ...RETRO_ARCADE_DEFAULT, ...rest, enabled: true };
    // 往旁邊錯開 8°：不錯開的話新的一台會跟原本那台完全疊在一起，看起來像沒新增
    base.azimuthDegrees = wrapDegrees((seed?.azimuthDegrees ?? RETRO_ARCADE_DEFAULT.azimuthDegrees) + 8);
    return spawnRetroArcade(nextRetroArcadeId(), base, introDone);
  }

  // 跳舞機「電波 STEP!」：放在 GameHall 附近；可以複製很多台（跟復古街機一樣）
  type DanceMachineRuntime = ReturnType<typeof createDanceMachine>;
  const danceMachineEntries: Array<{ world: WorldDanceMachine; runtime: DanceMachineRuntime }> = [];
  const danceMachines: WorldDanceMachine[] = [];

  function spawnDanceMachine(id: string, layout: DanceMachineSettings, grown = false) {
    if (!puddingAxes) return null;
    const runtime = createDanceMachine({ groundRadius: GROUND_RADIUS, up: puddingAxes.up, front: puddingAxes.front, envMap, layout });
    ground.add(runtime.object);
    const n = Number(id.match(/(\d+)$/)?.[1] ?? danceMachineEntries.length + 1);
    const world: WorldDanceMachine = {
      id,
      label: `跳舞機 ${n}`,
      object: runtime.object,
      settings: runtime.settings,
      apply: runtime.applySettings,
      getNormal: runtime.getNormal,
      setNormal: runtime.setNormal,
      setHighlighted: runtime.setHighlighted,
    };
    danceMachineEntries.push({ world, runtime });
    danceMachines.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  if (puddingAxes) {
    for (const placement of DANCE_MACHINE_PLACEMENTS) {
      const { id, ...layout } = placement;
      spawnDanceMachine(id, layout);
    }
  }

  function addDanceMachine(seed?: Partial<DanceMachinePlacement>): WorldDanceMachine | null {
    if (!puddingAxes) return null;
    const { id: _ignored, ...rest } = seed ?? {};
    const base: DanceMachineSettings = { ...DANCE_MACHINE_DEFAULT, ...rest, enabled: true };
    // 往旁邊錯開 10°：不錯開的話新的一台會跟原本那台完全疊在一起，看起來像沒新增
    base.azimuthDegrees = wrapDegrees((seed?.azimuthDegrees ?? DANCE_MACHINE_DEFAULT.azimuthDegrees) + 10);
    let n = danceMachineEntries.length + 1;
    while (danceMachines.some((item) => item.id === `dance_machine_${n}`)) n += 1;
    return spawnDanceMachine(`dance_machine_${n}`, base, introDone);
  }

  function removeDanceMachine(entry: WorldDanceMachine) {
    const index = danceMachineEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    danceMachineEntries[index].runtime.dispose();
    danceMachineEntries.splice(index, 1);
    const machineIndex = danceMachines.indexOf(entry);
    if (machineIndex >= 0) danceMachines.splice(machineIndex, 1);
    return true;
  }

  function removeRetroArcade(entry: WorldRetroArcade) {
    const index = retroArcadeEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    retroArcadeEntries[index].runtime.dispose();
    retroArcadeEntries.splice(index, 1);
    const arcadeIndex = retroArcades.indexOf(entry);
    if (arcadeIndex >= 0) retroArcades.splice(arcadeIndex, 1);
    return true;
  }

  // 小水潭：程式產生的水面（漣漪、深淺）＋岸邊石頭、荷葉、香蒲
  const pondRuntime = puddingAxes
    ? createPond({ groundRadius: GROUND_RADIUS, up: puddingAxes.up, front: puddingAxes.front, envMap })
    : null;
  if (pondRuntime) {
    ground.add(pondRuntime.object);
    pondRuntime.setIntroGrow(0);
  }

  // 龍兔的家三樓 → 水潭邊的溜滑梯：兩端都會動（水潭可拖），每次重新算滑道曲線
  const slideRuntime = createMainHallSlide({
    ground,
    groundRadius: GROUND_RADIUS,
    getHouseBody: () => mainHallBody,
    getPond: () =>
      pondRuntime?.settings.enabled ? { normal: pondRuntime.getNormal(), size: pondRuntime.settings.size } : null,
  });
  ground.add(slideRuntime.object);
  slideRuntime.setIntroGrow(0);

  // 香菇：種在綠球上，可以複製好幾顆；菇傘大小、菇柄高低、厚度各自在面板調
  type ShiitakeRuntime = ReturnType<typeof createShiitake>;
  const shiitakeEntries: Array<{ world: WorldShiitake; runtime: ShiitakeRuntime }> = [];
  const shiitakes: WorldShiitake[] = [];

  function spawnShiitake(id: string, layout: ShiitakeSettings, grown = false) {
    if (!puddingAxes) return null;
    const runtime = createShiitake({
      groundRadius: GROUND_RADIUS,
      up: puddingAxes.up,
      front: puddingAxes.front,
      envMap,
      layout: { ...layout },
    });
    ground.add(runtime.object);
    const world: WorldShiitake = {
      id,
      label: id,
      object: runtime.object,
      settings: runtime.settings,
      apply: runtime.applySettings,
      getNormal: runtime.getNormal,
      setNormal: runtime.setNormal,
      setHighlight: runtime.setHighlight,
    };
    shiitakeEntries.push({ world, runtime });
    shiitakes.push(world);
    runtime.setIntroGrow(grown ? 1 : 0);
    return world;
  }

  for (const placement of SHIITAKE_PLACEMENTS) {
    const { id, ...layout } = placement;
    spawnShiitake(id, layout);
  }

  function nextShiitakeId() {
    let n = shiitakeEntries.length + 1;
    while (shiitakes.some((item) => item.id === `shiitake_${n}`)) n += 1;
    return `shiitake_${n}`;
  }

  /** 複製一顆：沿用 seed（通常是目前選中那顆）的所有設定，方位往旁邊挪 12°，才不會疊在同一個位置 */
  function addShiitake(seed?: Partial<ShiitakeSettings>): WorldShiitake | null {
    const base: ShiitakeSettings = { ...SHIITAKE_DEFAULT, ...seed };
    base.azimuthDegrees = wrapDegrees(base.azimuthDegrees + 12);
    return spawnShiitake(nextShiitakeId(), base, introDone);
  }

  function removeShiitake(entry: WorldShiitake) {
    const index = shiitakeEntries.findIndex((item) => item.world === entry);
    if (index < 0) return false;
    shiitakeEntries[index].runtime.dispose();
    shiitakeEntries.splice(index, 1);
    const listIndex = shiitakes.indexOf(entry);
    if (listIndex >= 0) shiitakes.splice(listIndex, 1);
    return true;
  }

  // 浮空小星球：飄在畫面右後方天空，位置跟著鏡頭（跟荷包蛋太陽一樣）
  const floatingIsland = createFloatingIsland({ camera });
  all.add(floatingIsland.object);
  floatingIsland.setIntroGrow(0);

  function getPigObstacleRoots(): THREE.Object3D[] {
    const roots: THREE.Object3D[] = introHouses.map((house) => house.object);
    // 只給石圈＋木柴（footprint），火星和煙飛很高，算進去會讓避障範圍變超大
    if (campfireRuntime?.settings.enabled) roots.push(campfireRuntime.footprint);
    // 香菇也是障礙：小豬會繞過它，草叢、小石頭也不會撒在它身上
    for (const { world } of shiitakeEntries) if (world.settings.enabled) roots.push(world.object);
    if (treasureRuntime?.settings.enabled) roots.push(treasureRuntime.object);
    if (happyFatRuntime?.settings.enabled) roots.push(happyFatRuntime.object);
    if (bigBunRuntime?.settings.enabled) roots.push(bigBunRuntime.object);
    for (const { world } of retroArcadeEntries) if (world.settings.enabled) roots.push(world.object);
    for (const { world } of danceMachineEntries) if (world.settings.enabled) roots.push(world.object);
    // 水潭也是障礙：小豬繞著走，草叢、小石頭不會長在水面上
    if (pondRuntime?.settings.enabled) roots.push(pondRuntime.object);
    for (const { world } of puddingEntries) roots.push(world.object);
    for (const { world } of grilledCornEntries) roots.push(world.object);
    for (const { world } of salmonSteakEntries) roots.push(world.object);
    for (const { world } of lemonSliceEntries) roots.push(world.object);
    for (const { world } of frenchFriesEntries) roots.push(world.object);
    for (const { world } of frenchFryStickEntries) roots.push(world.object);
    for (const { world } of friedEggEntries) {
      if (world.settings.mode === 'sphere') roots.push(world.object);
    }
    return roots;
  }

  const ribbonSample = new THREE.Vector3();
  const groundWorldScale = new THREE.Vector3();
  /**
   * 番茄醬緞帶「上緣」離綠球頂端（up）幾度。
   * 緞帶的圓心不在球心上（RING_OFFSET），所以不能用固定角度；
   * 沿整圈取樣：每個點換算到綠球座標 → 算它離頂端幾度，再扣掉管子半徑佔的角度，取最靠頂端的那個。
   */
  function getRibbonTopColatitude(): number | null {
    if (!puddingAxes) return null;
    const pivot = ketchup.ringObject;
    pivot.updateMatrixWorld(true);
    ground.updateMatrixWorld(true);
    ground.getWorldScale(groundWorldScale);
    const tubeLocal = KETCHUP_TUBE_OUTER_RADIUS / Math.max(groundWorldScale.x, 1e-4);
    const radius = ketchup.ringSettings.radius;
    let top = Infinity;
    for (let i = 0; i < 72; i++) {
      const angle = (i / 72) * Math.PI * 2;
      ribbonSample.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      pivot.localToWorld(ribbonSample);
      ground.worldToLocal(ribbonSample);
      const dist = ribbonSample.length();
      if (dist < 1e-4) continue;
      const colat = Math.acos(THREE.MathUtils.clamp(ribbonSample.dot(puddingAxes.up) / dist, -1, 1));
      top = Math.min(top, colat - Math.atan(tubeLocal / dist));
    }
    return Number.isFinite(top) ? THREE.MathUtils.radToDeg(top) : null;
  }

  let pigRuntime: ReturnType<typeof createPig> | null = null;
  if (puddingAxes) {
    try {
      pigRuntime = createPig({
        ...puddingAxes,
        camera,
        getObstacleRoots: getPigObstacleRoots,
        getRibbonTopColatitude,
        // 篝火上有烤雞時，小豬偶爾會跑去看
        getVisitTarget: () =>
          campfireRuntime?.settings.enabled && campfireRuntime.settings.chickenEnabled
            ? campfireRuntime.getNormal()
            : null,
      });
      ground.add(pigRuntime.object);
    } catch (error) {
      console.error('[pig] 建立失敗，已略過（world 其餘場景照常）', error);
    }
  }
  // 島上的小生物：蝴蝶、蜜蜂、蜻蜓、蚱蜢、小蜘蛛（避開房子、食物：問小豬的障礙清單）
  const crittersRuntime = puddingAxes
    ? createCritters({
        groundRadius: GROUND_RADIUS,
        up: puddingAxes.up,
        isOpenGround: (normal, radiusRad) => pigRuntime?.isOpenGround(normal, radiusRad) ?? true,
      })
    : null;
  if (crittersRuntime) ground.add(crittersRuntime.object);

  // 小豬的溜滑梯冒險：走進龍兔的家大門 → 從三樓溜滑梯滑進水潭（濺水花、有機率噴出魚排）
  const pigAdventure =
    pigRuntime && puddingAxes
      ? createPigAdventure({
          ground,
          groundRadius: GROUND_RADIUS,
          up: puddingAxes.up,
          front: puddingAxes.front,
          camera,
          pig: pigRuntime,
          getHouse: () => ({ object: mainHall.object, door: mainHallDoor as THREE.Object3D | null }),
          getRide: () => slideRuntime.getRide(),
          getPond: () =>
            pondRuntime
              ? {
                  object: pondRuntime.object,
                  settings: pondRuntime.settings,
                  getNormal: pondRuntime.getNormal,
                  splash: pondRuntime.splash,
                }
              : null,
          // 魚排用既有的鮭魚排模型，但不登記到使用者擺的魚排清單（不會出現在面板、不會被印進佈局）
          createFish: (layout) =>
            createSalmonSteak({ groundRadius: GROUND_RADIUS, up: puddingAxes.up, front: puddingAxes.front, envMap, layout }),
        })
      : null;
  // 綠球表面細節：色彩斑塊、番茄醬陰影帶、草叢、泥土小徑、小道具
  const groundInverseScratch = new THREE.Matrix4();
  const footprintCenter = new THREE.Vector3();
  const footprintCorner = new THREE.Vector3();
  const footprintMatrix = new THREE.Matrix4();
  /** 物件「貼在地上」的投影半徑（球面角度）：把每個 mesh 包圍盒的角投影到地表切平面（同小豬避障的算法） */
  function measureGroundFootprint(root: THREE.Object3D): GroundObstacle | null {
    root.updateMatrixWorld(true);
    root.getWorldPosition(footprintCenter).applyMatrix4(groundInverseScratch);
    const centerDist = footprintCenter.length();
    if (centerDist < 0.2) return null;
    const normal = footprintCenter.clone().divideScalar(centerDist);
    let maxTangent = 0;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      // InstancedMesh：用所有 instance 合起來的包圍盒（只看 geometry 是單一顆原始大小、沒套縮放，會算成超大一圈）
      const instanced = mesh as THREE.InstancedMesh;
      let bb: THREE.Box3 | null;
      if (instanced.isInstancedMesh) {
        instanced.computeBoundingBox();
        bb = instanced.boundingBox;
      } else {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        bb = mesh.geometry.boundingBox;
      }
      if (!bb || bb.isEmpty()) return;
      footprintMatrix.multiplyMatrices(groundInverseScratch, mesh.matrixWorld);
      for (let k = 0; k < 8; k++) {
        footprintCorner
          .set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z)
          .applyMatrix4(footprintMatrix)
          .sub(footprintCenter);
        footprintCorner.addScaledVector(normal, -footprintCorner.dot(normal));
        maxTangent = Math.max(maxTangent, footprintCorner.length());
      }
    });
    return { normal, radiusRad: Math.atan(maxTangent / centerDist) };
  }
  const groundToRingScratch = new THREE.Matrix4();
  const groundDetail =
    groundSurface && puddingAxes
      ? createGroundDetail({
          ballMesh: groundSurface,
          groundRadius: GROUND_RADIUS,
          up: puddingAxes.up,
          front: puddingAxes.front,
          // 小路串起五棟房子＋篝火
          getPathNodes: () => {
            ground.updateMatrixWorld(true);
            groundInverseScratch.copy(ground.matrixWorld).invert();
            const nodes = introHouses.map((house) =>
              house.object.getWorldPosition(new THREE.Vector3()).applyMatrix4(groundInverseScratch).normalize(),
            );
            if (campfireRuntime?.settings.enabled) nodes.push(campfireRuntime.getNormal());
            return nodes;
          },
          // 撒草、道具要避開的：小豬的障礙清單（房子、食物、篝火）；篝火再加上烤架的範圍
          getObstacles: () => {
            ground.updateMatrixWorld(true);
            groundInverseScratch.copy(ground.matrixWorld).invert();
            const list: GroundObstacle[] = [];
            for (const root of getPigObstacleRoots()) {
              // 水潭、街機不算撒點的障礙（改用下面的 getMasks）：不然它們一動，整顆球的草全部重排
              if (pondRuntime && root === pondRuntime.object) continue;
              if (retroArcades.some((item) => item.object === root)) continue;
              if (danceMachines.some((item) => item.object === root)) continue;
              const footprint = measureGroundFootprint(root);
              if (footprint) list.push(footprint);
            }
            if (campfireRuntime?.settings.enabled) {
              const s = campfireRuntime.settings;
              list.push({
                normal: campfireRuntime.getNormal(),
                radiusRad: Math.atan(s.size * (Math.max(s.rackHalfWidth, 0.5) + 0.2)),
              });
            }
            return list;
          },
          // 水潭：撒好之後才把範圍內的草藏起來（含岸邊石頭約 1.45 倍半徑）。
          // 直接用設定算範圍，不量模型：第一次撒草時水潭還在開場動畫前、縮放是 0，量到的只是一個點
          getMasks: () => {
            const masks: GroundObstacle[] = [];
            if (pondRuntime?.settings.enabled) {
              const s = pondRuntime.settings;
              masks.push({ normal: pondRuntime.getNormal(), radiusRad: Math.atan((s.size * 1.45) / GROUND_RADIUS) });
            }
            // 街機：腳下的草藏起來（佔地約是最長邊的一半）
            for (const { world } of retroArcadeEntries) {
              if (!world.settings.enabled) continue;
              masks.push({ normal: world.getNormal(), radiusRad: Math.atan((world.settings.size * 0.55) / GROUND_RADIUS) });
            }
            // 跳舞機：機台＋舞台，佔地約最長邊的一半
            for (const { world } of danceMachineEntries) {
              if (!world.settings.enabled) continue;
              masks.push({ normal: world.getNormal(), radiusRad: Math.atan((world.settings.size * 0.5) / GROUND_RADIUS) });
            }
            return masks;
          },
          getRibbon: () => {
            ground.updateMatrixWorld(true);
            ketchup.ringObject.updateMatrixWorld(true);
            groundToRingScratch.copy(ketchup.ringObject.matrixWorld).invert().multiply(ground.matrixWorld);
            return {
              groundToRing: groundToRingScratch,
              radius: ketchup.ringSettings.radius,
              tube: KETCHUP_TUBE_OUTER_RADIUS,
            };
          },
          getRibbonTopColatitude,
        })
      : null;
  if (groundDetail) ground.add(groundDetail.object);

  const pig: WorldPig | null = pigRuntime ?
    {
      label: '小豬',
      object: pigRuntime.object,
      settings: pigRuntime.settings,
      apply: pigRuntime.applySettings,
      applyColor: pigRuntime.applyColor,
      cloud: pigRuntime.cloud.settings,
      getCloudState: pigRuntime.cloud.getState,
      visitNow: pigRuntime.visitNow,
      isVisiting: pigRuntime.isVisiting,
      circle: pigRuntime.circle,
      setCircling: pigRuntime.setCircling,
      isCircling: pigRuntime.isCircling,
      adventure: pigAdventure
        ? {
            settings: pigAdventure.settings,
            startNow: pigAdventure.startNow,
            startWalk: pigAdventure.startWalk,
            playNow: pigAdventure.playNow,
            canPlay: pigAdventure.canPlay,
            testSplashFish: pigAdventure.testSplashFish,
            getPhase: pigAdventure.getPhase,
            getLastFailReason: pigAdventure.getLastFailReason,
          }
        : null,
    }
  : null;
  const campfire: WorldCampfire | null = campfireRuntime
    ? {
        id: 'campfire',
        label: '篝火',
        object: campfireRuntime.object,
        settings: campfireRuntime.settings,
        apply: campfireRuntime.applySettings,
        getNormal: campfireRuntime.getNormal,
        setNormal: campfireRuntime.setNormal,
      }
    : null;
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
  for (const { runtime } of puddingEntries) runtime.setIntroGrow(0);
  for (const { runtime } of grilledCornEntries) runtime.setIntroGrow(0);
  for (const { runtime } of friedEggEntries) runtime.setIntroGrow(0);
  for (const { runtime } of salmonSteakEntries) runtime.setIntroGrow(0);
  for (const { runtime } of lemonSliceEntries) runtime.setIntroGrow(0);
  for (const { runtime } of frenchFriesEntries) runtime.setIntroGrow(0);
  for (const { runtime } of frenchFryStickEntries) runtime.setIntroGrow(0);
  pigRuntime?.setIntroGrow(0);
  groundFlowers?.resetIntro(introHouses.length);
  placeFlowers(0);
  if (ground !== all) ground.visible = false;

  const pigTouchScratch = new THREE.Vector3();
  const ballCenterScratch = new THREE.Vector3();

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
        for (const { runtime } of friedEggEntries) runtime.setIntroGrow(1);
        for (const { runtime } of puddingEntries) runtime.setIntroGrow(1);
        for (const { runtime } of grilledCornEntries) runtime.setIntroGrow(1);
        for (const { runtime } of salmonSteakEntries) runtime.setIntroGrow(1);
        for (const { runtime } of lemonSliceEntries) runtime.setIntroGrow(1);
        for (const { runtime } of frenchFriesEntries) runtime.setIntroGrow(1);
        for (const { runtime } of frenchFryStickEntries) runtime.setIntroGrow(1);
        pigRuntime?.setIntroGrow(1);
        campfireRuntime?.setIntroGrow(1);
        for (const { runtime } of shiitakeEntries) runtime.setIntroGrow(1);
        treasureRuntime?.setIntroGrow(1);
        happyFatRuntime?.setIntroGrow(1);
        bigBunRuntime?.setIntroGrow(1);
        for (const { runtime } of retroArcadeEntries) runtime.setIntroGrow(1);
        for (const { runtime } of danceMachineEntries) runtime.setIntroGrow(1);
        pondRuntime?.setIntroGrow(1);
        slideRuntime.setIntroGrow(1);
        floatingIsland.setIntroGrow(1);
      }
    }

    rainbow.update(deltaTime);
    gameHallLights?.update(time);
    gameHallRings.update(time);
    for (const { runtime } of danceMachineEntries) runtime.update(time);
    denpaCharacterRuntime.update(time);

    puddingEntries.forEach(({ runtime }, index) => {
      const puddingStart = introSettings.emptyHold + introSettings.ballSeconds * 0.72 + index * 0.08;
      const puddingT = THREE.MathUtils.clamp((introElapsed - puddingStart) / 0.95, 0, 1);
      runtime.setIntroGrow(easeOutBack(puddingT, 2.4));
      runtime.update(deltaTime, introDone);
    });
    const houseStart = introSettings.emptyHold + introSettings.ballSeconds;
    const lastHouseIndex = Math.max(0, introHouses.length - 1);
    const housesIntroEnd =
      houseStart + lastHouseIndex * introSettings.houseStagger + introSettings.houseSeconds;
    // 綠球細節：房子都長完才撒草、道具，並讓它們長出來
    groundDetail?.update(deltaTime, introDone || introElapsed >= housesIntroEnd);

    grilledCornEntries.forEach(({ runtime }, index) => {
      const cornStart = housesIntroEnd + index * 0.1;
      const cornT = introDone
        ? 1
        : THREE.MathUtils.clamp((introElapsed - cornStart) / 0.9, 0, 1);
      runtime.setIntroGrow(easeOutBack(cornT, 2.2));
      runtime.update(deltaTime, introDone);
    });
    salmonSteakEntries.forEach(({ runtime }, index) => {
      const steakStart = housesIntroEnd + index * 0.08;
      const steakT = introDone
        ? 1
        : THREE.MathUtils.clamp((introElapsed - steakStart) / 0.9, 0, 1);
      runtime.setIntroGrow(easeOutBack(steakT, 2.1));
      runtime.update();
    });
    lemonSliceEntries.forEach(({ runtime }, index) => {
      const lemonStart = housesIntroEnd + index * 0.08;
      const lemonT = introDone
        ? 1
        : THREE.MathUtils.clamp((introElapsed - lemonStart) / 0.85, 0, 1);
      runtime.setIntroGrow(easeOutBack(lemonT, 2.0));
      runtime.update();
    });
    frenchFriesEntries.forEach(({ runtime }, index) => {
      const friesStart = housesIntroEnd + index * 0.08;
      const friesT = introDone
        ? 1
        : THREE.MathUtils.clamp((introElapsed - friesStart) / 0.85, 0, 1);
      runtime.setIntroGrow(easeOutBack(friesT, 2.0));
      runtime.update();
    });
    frenchFryStickEntries.forEach(({ runtime }, index) => {
      const stickStart = housesIntroEnd + index * 0.08;
      const stickT = introDone
        ? 1
        : THREE.MathUtils.clamp((introElapsed - stickStart) / 0.85, 0, 1);
      runtime.setIntroGrow(easeOutBack(stickT, 2.0));
      runtime.update();
    });
    {
      // 房子長完後，小星球從遠方彈出來
      const islandStart = housesIntroEnd + 0.3;
      const islandT = introDone ? 1 : THREE.MathUtils.clamp((introElapsed - islandStart) / 1.1, 0, 1);
      floatingIsland.setIntroGrow(easeOutBack(islandT, 1.6));
      floatingIsland.update(deltaTime);
    }
    if (campfireRuntime) {
      const fireStart = housesIntroEnd + 0.15;
      const fireT = introDone ? 1 : THREE.MathUtils.clamp((introElapsed - fireStart) / 0.8, 0, 1);
      campfireRuntime.setIntroGrow(easeOutBack(fireT, 2.0));
      campfireRuntime.update(deltaTime);
    }
    for (const { runtime } of shiitakeEntries) runtime.update(deltaTime);
    projectRoomStyle?.update(deltaTime);
    // 香菇屋（mainHall）的香菇串隨風輕輕打轉：每條繞自己的繩子轉，節奏錯開才不會整齊得像機器
    mainHallHangers.forEach((hanger, index) => {
      hanger.rotation.y = Math.sin(time * 0.9 + index * 1.3) * THREE.MathUtils.degToRad(20);
    });
    if (!introDone) {
      // 跟 Happy Fat 差不多時候「碰」地長出來，每台錯開 0.1 秒
      retroArcadeEntries.forEach(({ runtime }, index) => {
        const arcadeStart = housesIntroEnd + 0.4 + index * 0.1;
        const arcadeT = THREE.MathUtils.clamp((introElapsed - arcadeStart) / 0.8, 0, 1);
        runtime.setIntroGrow(easeOutBack(arcadeT, 2.2));
      });
      danceMachineEntries.forEach(({ runtime }, index) => {
        const machineStart = housesIntroEnd + 0.5 + index * 0.1;
        const machineT = THREE.MathUtils.clamp((introElapsed - machineStart) / 0.8, 0, 1);
        runtime.setIntroGrow(easeOutBack(machineT, 2.2));
      });

    }
    if (happyFatRuntime) {
      happyFatRuntime.update(deltaTime);
      if (!introDone) {
        const shopStart = housesIntroEnd + 0.25;
        const shopT = THREE.MathUtils.clamp((introElapsed - shopStart) / 0.9, 0, 1);
        happyFatRuntime.setIntroGrow(easeOutBack(shopT, 1.8));
      }
    }
    if (bigBunRuntime) {
      bigBunRuntime.update(deltaTime);
      if (!introDone) {
        // 比 Happy Fat 晚一點「啵」地彈出來，彈性大一點像軟軟的麵糰
        const bunStart = housesIntroEnd + 0.4;
        const bunT = THREE.MathUtils.clamp((introElapsed - bunStart) / 0.9, 0, 1);
        bigBunRuntime.setIntroGrow(easeOutBack(bunT, 2.4));
      }
    }
    // 點心樓（bgRoom）：金幣自轉閃光、包子晃動。長出來的動畫跟著房子一起，不用另外算
    chineseTempleRuntime.update(deltaTime);
    // 溜滑梯：房子長完才開始算（長大途中屋身一直在變，算了也白算），然後從三樓往水潭伸出去
    if (introDone || introElapsed >= housesIntroEnd) {
      slideRuntime.update(deltaTime);
      if (!introDone) {
        const slideStart = housesIntroEnd + 0.6;
        const slideT = THREE.MathUtils.clamp((introElapsed - slideStart) / 1.2, 0, 1);
        slideRuntime.setIntroGrow(1 - Math.pow(1 - slideT, 2));
      }
    }
    if (pondRuntime) {
      pondRuntime.update(deltaTime);
      if (!introDone) {
        // 水潭在房子之後「攤開」：從中心長到原本大小
        const pondStart = housesIntroEnd + 0.35;
        const pondT = THREE.MathUtils.clamp((introElapsed - pondStart) / 0.8, 0, 1);
        pondRuntime.setIntroGrow(easeOutBack(pondT, 1.6));
      }
    }
    if (treasureRuntime) {
      treasureRuntime.update(deltaTime);
      if (!introDone) {
        // 房子長完之後「碰」地冒出來
        const chestStart = housesIntroEnd + 0.45;
        const chestT = THREE.MathUtils.clamp((introElapsed - chestStart) / 0.8, 0, 1);
        treasureRuntime.setIntroGrow(easeOutBack(chestT, 2.4));
      }
    }
    if (!introDone) {
      // 跟篝火差不多時候一顆接一顆「啵」地長出來
      shiitakeEntries.forEach(({ runtime }, index) => {
        const mushroomStart = housesIntroEnd + 0.3 + index * 0.12;
        const mushroomT = THREE.MathUtils.clamp((introElapsed - mushroomStart) / 0.7, 0, 1);
        runtime.setIntroGrow(easeOutBack(mushroomT, 2.2));
      });
    }
    if (pigRuntime) {
      const pigStart = introSettings.emptyHold + introSettings.ballSeconds * 0.55;
      const pigT = introDone ? 1 : THREE.MathUtils.clamp((introElapsed - pigStart) / 0.9, 0, 1);
      pigRuntime.setIntroGrow(easeOutBack(pigT, 1.9));
      try {
        pigRuntime.update(deltaTime, introDone);
        pigAdventure?.update(deltaTime, introDone);
      } catch (error) {
        console.error('[pig] update 失敗', error);
      }
      // 小豬走到醬邊時，醬面起一圈漣漪
      if (introDone) ketchup.touch(pigRuntime.object.getWorldPosition(pigTouchScratch));
    }
    crittersRuntime?.update(deltaTime, introDone);
    // 醬的接觸陰影要知道綠球中心在哪（入場時綠球會移動）
    ketchup.setBallCenter(ground.getWorldPosition(ballCenterScratch));

    friedEggEntries.forEach(({ runtime }, index) => {
      if (introDone) {
        runtime.setIntroGrow(1);
      } else if (runtime.settings.mode === 'attach') {
        const houseStart = introSettings.emptyHold + introSettings.ballSeconds;
        const t = THREE.MathUtils.clamp(
          (introElapsed - houseStart - gameHallIntroIndex * introSettings.houseStagger) /
            introSettings.houseSeconds,
          0,
          1,
        );
        runtime.setIntroGrow(Math.max(0, easeOutBack(t, introSettings.houseOvershoot)));
      } else if (runtime.settings.mode === 'sun') {
        const sunStart = introSettings.emptyHold + introSettings.ballSeconds * 0.55;
        const t = THREE.MathUtils.clamp((introElapsed - sunStart) / 1.05, 0, 1);
        runtime.setIntroGrow(Math.max(0, easeOutBack(t, 1.85)));
      } else {
        const eggStart = introSettings.emptyHold + introSettings.ballSeconds * 0.8 + index * 0.08;
        const eggT = THREE.MathUtils.clamp((introElapsed - eggStart) / 0.85, 0, 1);
        runtime.setIntroGrow(Math.max(0, easeOutBack(eggT, 1.9)));
      }
      runtime.update(deltaTime, introDone);
    });
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

  /** 入場時最後一棟房子的長出動畫已結束（不等番茄醬／彩虹收尾） */
  function isIntroHousesComplete() {
    if (introDone) return true;
    const houseStart = introSettings.emptyHold + introSettings.ballSeconds;
    const last = Math.max(0, introHouses.length - 1);
    return (
      introElapsed >= houseStart + last * introSettings.houseStagger + introSettings.houseSeconds
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
    for (const { runtime } of puddingEntries) runtime.setIntroGrow(0);
    for (const { runtime } of grilledCornEntries) runtime.setIntroGrow(0);
    for (const { runtime } of friedEggEntries) runtime.setIntroGrow(0);
    for (const { runtime } of salmonSteakEntries) runtime.setIntroGrow(0);
    for (const { runtime } of lemonSliceEntries) runtime.setIntroGrow(0);
    for (const { runtime } of frenchFriesEntries) runtime.setIntroGrow(0);
    for (const { runtime } of frenchFryStickEntries) runtime.setIntroGrow(0);
    pigRuntime?.setIntroGrow(0);
    campfireRuntime?.setIntroGrow(0);
    for (const { runtime } of shiitakeEntries) runtime.setIntroGrow(0);
    treasureRuntime?.setIntroGrow(0);
    happyFatRuntime?.setIntroGrow(0);
    bigBunRuntime?.setIntroGrow(0);
    for (const { runtime } of retroArcadeEntries) runtime.setIntroGrow(0);
    for (const { runtime } of danceMachineEntries) runtime.setIntroGrow(0);
    pondRuntime?.setIntroGrow(0);
    slideRuntime.setIntroGrow(0);
    floatingIsland.setIntroGrow(0);
  }

  // 緞帶擺放參數也往外交出去，讓 main.ts 的控制面板可以調整
  // houses：畫面上每一棟。點到哪一棟，面板就顯示那一棟的設定
  return {
    all,
    update,
    ketchupRing: { object: ketchup.ringObject, settings: ketchup.ringSettings, apply: ketchup.applyRingSettings },
    ketchupVisual: { settings: ketchup.visualSettings, apply: ketchup.applyVisualSettings },
    ketchupSauce: { settings: ketchup.sauceSettings, apply: ketchup.applySauceSettings },
    // 食物數量：面板上的滑桿改這個，再叫 apply 把多出來或少掉的塊數補上
    ketchupFood: { settings: ketchup.foodSettings, apply: () => ketchup.setFoodCount(ketchup.foodSettings.count) },
    ketchupChicken: {
      settings: ketchup.chickenFoodSettings,
      apply: ketchup.applyChickenFoodSettings,
      rerollColors: ketchup.rerollChickenCrustColors,
    },
    ketchupFry: { settings: ketchup.fryFoodSettings, apply: ketchup.applyFryFoodSettings },
    ketchupExtraFood: { settings: ketchup.extraFoodSettings, apply: ketchup.applyExtraFoodSettings },
    ketchupShark: { settings: ketchup.sharkFinSettings, apply: ketchup.applySharkFinSettings },
    ketchupSharkWaves: { settings: ketchup.sharkFinWaveSettings, apply: ketchup.applySharkFinWaveSettings },
    rainbow: { settings: rainbow.settings, apply: rainbow.applyRainbowSettings },
    // ground、groundSurface、groundRadius：拖曳與地表材質；ground 是 pivot，groundSurface 才是綠球 mesh
    ground,
    groundSurface,
    groundFlowers,
    groundRadius: GROUND_RADIUS,
    isHouseGrown,
    isIntroHousesComplete,
    isIntroComplete: () => introDone,
    introSettings,
    replayIntro,
    gameHallLights,
    gameHallRings,
    puddings,
    addPudding,
    removePudding,
    grilledCorns,
    addGrilledCorn,
    removeGrilledCorn,
    friedEggs,
    salmonSteaks,
    addSalmonSteak,
    removeSalmonSteak,
    lemonSlices,
    addLemonSlice,
    removeLemonSlice,
    frenchFries,
    addFrenchFries,
    removeFrenchFries,
    frenchFrySticks,
    addFrenchFryStick,
    removeFrenchFryStick,
    pig,
    campfire,
    shiitakes,
    addShiitake,
    removeShiitake,
    mainHallDoor: { settings: mainHallDoorSettings, apply: applyMainHallDoor },
    projectRoomStyle: {
      settings: projectRoomStyleSettings,
      apply: () => projectRoomStyle?.setEnabled(projectRoomStyleSettings.enabled),
    },
    denpaCharacter: {
      settings: denpaCharacterRuntime.settings,
      apply: denpaCharacterRuntime.applySettings,
      setSelected: denpaCharacterRuntime.setSelected,
    },
    critters: crittersRuntime ? crittersRuntime.settings : null,
    danceMachines,
    addDanceMachine,
    removeDanceMachine,
    retroArcades,
    addRetroArcade,
    removeRetroArcade,
    happyFatShop: happyFatRuntime
      ? ({
          id: 'happy_fat_shop',
          label: 'Happy Fat',
          object: happyFatRuntime.object,
          settings: happyFatRuntime.settings,
          apply: happyFatRuntime.applySettings,
          getNormal: happyFatRuntime.getNormal,
          setNormal: happyFatRuntime.setNormal,
        } as WorldHappyFatShop)
      : null,
    bigBun: bigBunRuntime
      ? ({
          id: 'big_bun',
          label: '大包子',
          object: bigBunRuntime.object,
          settings: bigBunRuntime.settings,
          apply: bigBunRuntime.applySettings,
          getNormal: bigBunRuntime.getNormal,
          setNormal: bigBunRuntime.setNormal,
        } as WorldBigBun)
      : null,
    // 點心樓的顏色、包子擺動（位置、大小、旋轉在房子面板的 bgRoom）
    chineseTemple: {
      settings: chineseTempleRuntime.settings,
      apply: chineseTempleRuntime.applySettings,
    } as WorldChineseTemple,
    mainHallSlide: {
      object: slideRuntime.object,
      settings: slideRuntime.settings as MainHallSlideSettings,
      apply: slideRuntime.applySettings,
    },
    pond: pondRuntime
      ? ({
          id: 'pond',
          label: '小水潭',
          object: pondRuntime.object,
          settings: pondRuntime.settings,
          apply: pondRuntime.applySettings,
          getNormal: pondRuntime.getNormal,
          setNormal: pondRuntime.setNormal,
        } as WorldPond)
      : null,
    treasureChest: treasureRuntime
      ? ({
          id: 'treasure_chest',
          label: '寶箱',
          object: treasureRuntime.object,
          settings: treasureRuntime.settings,
          apply: treasureRuntime.applySettings,
          getNormal: treasureRuntime.getNormal,
          setNormal: treasureRuntime.setNormal,
        } as WorldTreasureChest)
      : null,
    groundDetail,
    floatingIsland: { object: floatingIsland.object, settings: floatingIsland.settings, apply: floatingIsland.applySettings },
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

export type WorldSalmonSteak = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: SalmonSteakSettings;
  apply: () => void;
  applyVisuals: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldLemonSlice = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: LemonSliceSettings;
  apply: () => void;
  applyVisuals: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldFrenchFries = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: FrenchFriesSettings;
  apply: () => void;
  applyVisuals: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldFrenchFryStick = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: FrenchFryStickSettings;
  apply: () => void;
  applyVisuals: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldPig = {
  label: string;
  object: THREE.Object3D;
  settings: PigSettings;
  apply: () => void;
  /** 只套用顏色（不會讓小豬重生） */
  applyColor: () => void;
  /** 頭上烏雲的設定（面板即時讀取，不用 apply） */
  cloud: PigCloudSettings;
  getCloudState: () => PigCloudState;
  /** 立刻跑去篝火看烤雞（測試用） */
  visitNow: () => boolean;
  isVisiting: () => boolean;
  /** 測試：原地繞圈圈（半徑、方向）。改了之後重新 setCircling(true) 才會用新的圓 */
  circle: { radiusDegrees: number; clockwise: boolean };
  setCircling: (on: boolean) => void;
  isCircling: () => boolean;
  /** 溜滑梯冒險（走進龍兔的家 → 溜滑梯 → 水潭濺水、噴魚排） */
  adventure: {
    settings: PigAdventureSettings;
    /** 立刻去溜滑梯（測試用；會打斷小豬正在做的事） */
    startNow: () => boolean;
    /** 完整流程：走到龍兔的家大門、走進去、屋裡待一下、溜滑梯 */
    startWalk: () => boolean;
    /** 畫面上的「去看看」：不管小豬在哪裡都規劃路線走進龍兔的家、玩溜滑梯 */
    playNow: () => boolean;
    /** 現在能不能去玩（溜滑梯、水潭、大門都準備好了） */
    canPlay: () => boolean;
    /** 在水潭中央濺一下、必定噴出魚排（測試用） */
    testSplashFish: () => boolean;
    getPhase: () => string;
    getLastFailReason: () => string;
  } | null;
};

export type WorldDanceMachine = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: DanceMachineSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
  /** 面板選中時整台發光 */
  setHighlighted: (value: boolean) => void;
};

export type WorldRetroArcade = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: RetroArcadeSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
  /** 面板選中時整台發光 */
  setHighlighted: (value: boolean) => void;
};

export type WorldHappyFatShop = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: HappyFatShopSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldBigBun = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: BigBunSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldChineseTemple = {
  settings: ChineseTempleSettings;
  apply: () => void;
};

export type WorldPond = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: PondSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldTreasureChest = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: TreasureChestSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldShiitake = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: ShiitakeSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
  setHighlight: (on: boolean) => void;
};

export type WorldCampfire = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: CampfireSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldPudding = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: PuddingSettings;
  apply: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldGrilledCorn = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: GrilledCornSettings;
  visualSettings: GrilledCornVisualSettings;
  apply: () => void;
  applyVisuals: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

export type WorldFriedEgg = {
  id: string;
  label: string;
  object: THREE.Object3D;
  settings: FriedEggSettings;
  apply: () => void;
  applyVisuals: () => void;
  /** 重新長出程式產生的蛋白（控制面板改了蛋白外觀時用） */
  rebuildWhite: () => void;
  getNormal: () => THREE.Vector3;
  setNormal: (normal: THREE.Vector3) => void;
};

function exposeFriedEgg(id: string, egg: ReturnType<typeof createFriedEgg>): WorldFriedEgg {
  return {
    id,
    label: id,
    object: egg.object,
    settings: egg.settings,
    apply: egg.applySettings,
    applyVisuals: egg.applyVisuals,
    rebuildWhite: egg.rebuildWhite,
    getNormal: egg.getNormal,
    setNormal: egg.setNormal,
  };
}

function exposeGrilledCorn(id: string, corn: ReturnType<typeof createGrilledCorn>): WorldGrilledCorn {
  return {
    id,
    label: id,
    object: corn.object,
    settings: corn.settings,
    visualSettings: corn.visualSettings,
    apply: corn.applySettings,
    applyVisuals: corn.applyVisuals,
    getNormal: corn.getNormal,
    setNormal: corn.setNormal,
  };
}

function exposeLemonSlice(id: string, slice: ReturnType<typeof createLemonSlice>): WorldLemonSlice {
  return {
    id,
    label: id,
    object: slice.object,
    settings: slice.settings,
    apply: slice.applySettings,
    applyVisuals: slice.applyVisuals,
    getNormal: slice.getNormal,
    setNormal: slice.setNormal,
  };
}

function exposeFrenchFries(id: string, fries: ReturnType<typeof createFrenchFries>): WorldFrenchFries {
  return {
    id,
    label: id,
    object: fries.object,
    settings: fries.settings,
    apply: fries.applySettings,
    applyVisuals: fries.applyVisuals,
    getNormal: fries.getNormal,
    setNormal: fries.setNormal,
  };
}

function exposeFrenchFryStick(
  id: string,
  stick: ReturnType<typeof createFrenchFryStick>,
): WorldFrenchFryStick {
  return {
    id,
    label: id,
    object: stick.object,
    settings: stick.settings,
    apply: stick.applySettings,
    applyVisuals: stick.applyVisuals,
    getNormal: stick.getNormal,
    setNormal: stick.setNormal,
  };
}

function exposeSalmonSteak(id: string, steak: ReturnType<typeof createSalmonSteak>): WorldSalmonSteak {
  return {
    id,
    label: id,
    object: steak.object,
    settings: steak.settings,
    apply: steak.applySettings,
    applyVisuals: steak.applyVisuals,
    getNormal: steak.getNormal,
    setNormal: steak.setNormal,
  };
}

function exposePudding(id: string, pudding: ReturnType<typeof createPudding>): WorldPudding {
  return {
    id,
    label: id,
    object: pudding.object,
    settings: pudding.settings,
    apply: pudding.applySettings,
    getNormal: pudding.getNormal,
    setNormal: pudding.setNormal,
  };
}

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
function wrapDegrees(degrees: number) {
  return Math.round((((degrees + 180) % 360) + 360) % 360 - 180);
}

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
  loadGltfOnce(MODEL_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        const model = cloneGltfInstance(gltf.scene);
        fitToSize(model, MODEL_SIZE);
        all.add(model);
      });
    })
    .catch((error) => {
      console.error(`[obj] 模型載入失敗，請確認檔案存在：${MODEL_URL}`, error);
    });
}

/**
 * 招牌字 decal 自發光：Blender 匯出的 decal 只有一般貼圖（不會亮），
 * 名稱以 _glow 結尾的就把貼圖同時當成自發光貼圖，夜裡的霓虹字、燈箱才會亮。
 * toneMapped = false：亮色不被色調映射壓暗，畫面風格統一（styleGrade）也會跳過它，霓虹維持鮮豔。
 */
function lightUpGlowDecals(model: THREE.Object3D) {
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !/_glow(?:\.\d+)?$|_glow_\d+$/.test(mesh.name)) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const m = material as THREE.MeshStandardMaterial;
      if (!m.map) continue;
      m.emissive.set(0xffffff);
      m.emissiveMap = m.map;
      m.emissiveIntensity = 0.9;
      m.toneMapped = false;
      m.needsUpdate = true;
    }
  });
}

/**
 * 把 glb 模型套到某一棟房子上，取代原本的長方體外觀
 * 長方體不刪：種在球面上的位置、拖曳點選、控制面板、入場長大，全都是靠它算的
 * 所以只把它「藏起來」，模型當成它的子物件，長方體怎麼移動、縮放，模型都會跟著走
 */
/**
 * 把程式拼出來的模型（點心樓）塞進房子：跟 attachHouseModel 一樣藏起長方體、把模型縮進長方體範圍，
 * 只是模型已經在手上，不用等載入
 */
function attachChineseTemple(house: ReturnType<typeof createHouse>, model: THREE.Object3D) {
  // 長方體不畫但還在：射線點得到，點選、拖曳、名牌都靠它
  house.object.material.visible = false;
  fitIntoHouseBox(model, house.settings);
  house.object.add(model);
  house.applySettings();
}

function attachHouseModel(
  house: ReturnType<typeof createHouse>,
  url: string,
  onLoaded?: (model: THREE.Object3D) => void,
) {
  // material.visible = false：畫面上不畫、也不投影子（不然會多一塊方形的影子）
  // 但射線（Raycaster）不看材質可不可見，所以滑鼠還是點得到、拖得動這一棟
  // 不能用 object.visible = false：那會連子物件（模型）一起藏起來
  house.object.material.visible = false;

  loadGltfOnce(url)
    .then((gltf) => {
      scheduleGltfMount(() => {
        const model = cloneGltfInstance(gltf.scene);
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
      });
    })
    .catch((error) => {
      console.error(`[obj] 房子模型載入失敗，請確認檔案存在：${url}`, error);
    });
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
