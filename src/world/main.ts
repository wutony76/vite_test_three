console.log('world');

/** 模組載入階段若拋錯，否則 #scene-cover 會一直擋住畫面 */
function dismissSceneCoverOnFatalError() {
  const removeCover = () => document.getElementById('scene-cover')?.remove();
  window.addEventListener('error', removeCover);
  window.addEventListener('unhandledrejection', removeCover);
}
dismissSceneCoverOnFatalError();

import * as THREE from 'three';
import gradientVertexShader from './shader/gradient.vert.glsl?raw';
import gradientFragmentShader from './shader/gradient.frag.glsl?raw';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// RoomEnvironment：three.js 內建的「虛擬攝影棚」，拿來當反射用的環境，不用另外下載 HDR 圖
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createObjs,
  INTRO_BALL_EASE_OPTIONS,
  WORLD_GLTF_URLS,
  type WorldFriedEgg,
  type WorldGrilledCorn,
  type WorldHouse,
  type WorldPudding,
  type WorldLemonSlice,
  type WorldCampfire,
  type WorldShiitake,
  type WorldTreasureChest,
  type WorldHappyFatShop,
  type WorldPond,
  type WorldFrenchFries,
  type WorldFrenchFryStick,
  type WorldSalmonSteak,
} from './objects/obj';
import { whenGltfMountsIdle, whenGltfsReady } from './objects/sharedGltf';
import { formatGrilledCornPlacementsForPaste } from './objects/grilledCorn';
import { formatLemonSlicePlacementsForPaste } from './objects/lemonSlice';
import { CAMPFIRE_CHICKEN_SPIN_AXES, formatCampfireSettingsForPaste } from './objects/campfire';
import { formatShiitakePlacementsForPaste } from './objects/shiitake';
import { formatTreasureChestSettingsForPaste } from './objects/treasureChest';
import { formatPondSettingsForPaste } from './objects/pond';
import { formatMainHallSlideSettingsForPaste } from './objects/mainHallSlide';
import { formatPigAdventureSettingsForPaste } from './objects/pigAdventure';
import { formatHappyFatShopSettingsForPaste, HAPPY_FAT_SHOP_DEFAULT } from './objects/happyFatShop';
import { formatFloatingIslandSettingsForPaste } from './objects/floatingIsland';
import { formatFrenchFriesPlacementsForPaste } from './objects/frenchFries';
import { formatFrenchFryStickPlacementsForPaste } from './objects/frenchFryStick';
import { formatPuddingPlacementsForPaste } from './objects/pudding';
import { formatSalmonSteakPlacementsForPaste } from './objects/salmonSteak';
import { formatFriedEggPlacementsForPaste } from './objects/friedEgg';
import { EGG_WHITE_LOOK, eggViewLight, eggWhiteExposure, formatEggWhiteLookForPaste } from './objects/friedEggWhite';
import { formatPigSettingsForPaste } from './objects/pig';
import { formatPigCloudSettingsForPaste, PIG_CLOUD_STATES } from './objects/pigCloud';
import type { FriedEggSunLayout } from './objects/friedEggLayout';
// lil-gui：three.js 內建的小型控制面板，拖拉滑桿就能即時調整數值，不用改程式碼重新整理
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { enableViewPlaneDrag } from './debug/viewPlaneDrag';
import { enableSurfaceDrag } from './debug/surfaceDrag';
import { enableCameraPlaneDrag } from './debug/cameraPlaneDrag';
import { createStyleGrade, formatStyleGradeSettingsForPaste } from './styleGrade';
import { createSoftLayerPass, formatSoftLayerSettingsForPaste } from './softLayerPass';
import { createForegroundBlur, formatForegroundBlurSettingsForPaste } from './foregroundBlur';
import { formatKetchupSauceSettingsForPaste } from './objects/ketchup';
import { FLOATING_ISLAND_LAYER } from './objects/floatingIsland';
import { GROUND_PATH_MODES, formatGroundDetailSettingsForPaste, formatGroundPathsForPaste } from './objects/groundDetail';
import { enableGroundPathEditor } from './debug/groundPathEditor';
import { flyCameraTo, isCameraFlying, type CameraPose } from './cameraFlight';
import { isHouseTransitionPlaying, playHouseTransition, playSceneLoad, transitionSettings } from './houseTransition';

// RENDERER
/**
 * // ── 影子 ①：渲染器總開關（預設關閉，因為陰影很吃效能）──
 * 
 */
const renderer = new THREE.WebGLRenderer();
// 第一次畫到新材質時，預設會同步讀著色器日誌，主執行緒會停到編譯結束。
// 這裡的材質都是已知能畫的，關掉檢查，重新載入才不會卡在那一下。
renderer.debug.checkShaderErrors = false;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// r186 起移除 PCFSoftShadowMap；柔邊改調各光源 shadow.radius
renderer.shadowMap.type = THREE.PCFShadowMap;
// 關掉自動清畫面：一幀要畫兩個場景（背景 + 主場景），
// 少了這行，第二次 render 前會把畫面清空，背景漸層就被擦成黑色
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);


// SCENE
const scene = new THREE.Scene();

// 環境貼圖：給光滑的材質「有東西可以反射」
// 番茄醬用了 clearcoat（清漆層），越側面越像鏡子；少了環境，鏡子照到一片虛空 → 邊緣和凹折處變成死黑
// PMREMGenerator 把環境預先處理成不同粗糙度的模糊版本，粗糙的表面才會反射出柔和的光
// 為什麼不用 scene.environment？它會套用到場景裡「所有」材質，連綠球（Phong）都會被照亮一大截，
// 所以只產生貼圖，交給需要的物件自己掛上
const pmremGenerator = new THREE.PMREMGenerator(renderer);
// RoomEnvironment 是中性的灰白色攝影棚，醬汁的側面反射出灰白，跟粉紅、紫色背景混在一起會看起來灰綠
// 所以把攝影棚裡每個物件的顏色乘上紅色：反射出來的就是紅色，暗部才會像醬汁
// 反射會蓋滿整條醬汁、決定整體色調，所以這裡維持紅色；想要的橙色交給 ketchup.ts 的 emissive，只在暗部透出來
const ENV_TINT = new THREE.Color(0x9a2010);
const roomEnvironment = new RoomEnvironment();
roomEnvironment.traverse((object) => {
  const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial>;
  if (!mesh.isMesh) return;
  // 攝影棚裡的物件共用材質，先 clone 再改色，避免改到別的地方
  mesh.material = mesh.material.clone();
  mesh.material.color.multiply(ENV_TINT);
  // 攝影棚的「燈」是靠 emissive 發光的面板，也要一起染色，不然反射裡還是會有白光
  if ('emissive' in mesh.material) mesh.material.emissive.multiply(ENV_TINT);
});
const envMap = pmremGenerator.fromScene(roomEnvironment, 0.04).texture;
// 荷包蛋用的中性環境：上面那張染紅的會讓蛋白反射出紅／灰綠色，蛋黃的高光也會變成暗紅
// 另外產一張不染色的，蛋白才是乾淨的白、蛋黃上才有白色的濕亮反光
const eggEnvMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
// scene.background = new THREE.Color(0xDCE0E6);
// scene.background = new THREE.Color(0xff00ff);


// CAMERA
// 第一個參數是 FOV（垂直視角，單位度）：數字越小越像望遠鏡頭，物體在畫面上越大
// 75 偏廣角，球顯得小、邊緣還會被拉長變形；改 20 像望遠鏡頭，不用移動鏡頭就能讓球放大到塞滿畫面
const camera = new THREE.PerspectiveCamera(14.5, window.innerWidth / window.innerHeight, 0.1, 1000);
// 從球的上方偏側邊往下看：上半部吃黃色主光、下緣露出紫色補光
// 數值是用 OrbitControls 轉到滿意角度後，從 console 印出來抄回來的
camera.position.set(1.85, 4.06, -0.56);
camera.lookAt(0, 0, 0);

// 平移畫面：把取景框往上挪，畫面內容整體就往下移，不改鏡頭角度和透視
// 和移動 controls.target 不同，OrbitControls 旋轉時球還是繞著球心轉
// 0.5 = 往下移 50% 的畫面高度，越大球越往下
// 0.9 底部會留一大條醬汁；再往上抬，主廳又會被畫面切掉。0.84 讓醬汁留在下緣，房子還看得到頭
const VIEW_SHIFT_Y = 0.84;
// const VIEW_SHIFT_Y = 0.5;
function applyViewOffset() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  // 參數：完整畫面寬高、取景框的 x / y 偏移、取景框寬高
  // y 偏移給負數 = 取景框往上 → 內容往下
  camera.setViewOffset(w, h, 0, -h * VIEW_SHIFT_Y, w, h);
}
applyViewOffset();


// WORLD...SHADER.RENDER
const backgroundScene = new THREE.Scene();
const backgroundCamera = new THREE.OrthographicCamera(
  -1, 1, 1, -1, 0.1, 10
);
backgroundCamera.position.z = 1;
const backgroundGeometry = new THREE.PlaneGeometry(2, 2);
const backgroundMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
  },
  vertexShader: gradientVertexShader,
  fragmentShader: gradientFragmentShader,
  depthTest: false,
  depthWrite: false,
});
const backgroundMesh = new THREE.Mesh(
  backgroundGeometry,
  backgroundMaterial
);
backgroundScene.add(backgroundMesh);


// LIGHTS
// MeshPhongMaterial 等材質要靠光源算顏色，場景沒有光的話物件會整個變黑

// 平行光：這一盞就是太陽，有方向，Phong 的明暗和高光主要靠它
// 不再加第二盞平行光當「另一個太陽」：
//   ① 兩盞各照一半，交界那一圈兩邊都照不到，會切出一條暗帶
//   ② 每盞都會打出自己的高光，房子上會多一顆刺眼的亮點
// 想要溫暖就把它調成蜂蜜色，不要另開一盞。太黃（接近橘色）會把青、綠乘成橄欖色
const directionalLight = new THREE.DirectionalLight(0xffd98a, 0.7);
directionalLight.position.set(-5, 8, 2);
// 太陽也投影：手電筒光錐只罩一部分，房子在球面上的影主要靠這盞才看得見
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 24;
const sunShadowSpan = 5;
directionalLight.shadow.camera.left = -sunShadowSpan;
directionalLight.shadow.camera.right = sunShadowSpan;
directionalLight.shadow.camera.top = sunShadowSpan;
directionalLight.shadow.camera.bottom = -sunShadowSpan;
directionalLight.shadow.bias = -0.00012;
directionalLight.shadow.normalBias = 0.022;
directionalLight.shadow.radius = 4;
directionalLight.shadow.camera.updateProjectionMatrix();
scene.add(directionalLight);
scene.add(directionalLight.target);

// 補光：用半球光（HemisphereLight）把暗部托起來，不負責當第二個太陽
// 半球光依表面朝向混色：朝上的面拿天空色、朝下的面拿地面色，中間平滑過渡
// 為什麼不用平行光當補光？理由跟上面一樣：暗帶、第二顆高光
// 天空、地面都用淺的暖色，暗部才會是暖的，不會被青色補光把太陽的暖意抵銷
// 強度壓在 1 以下，亮面仍然是太陽在主導
const hemisphereLight = new THREE.HemisphereLight(0xfff3d4, 0xffc9a8, 1.5);
scene.add(hemisphereLight);

// 手電筒：聚光燈跟著鏡頭；只有這盞負責打影子，太陽仍管整體明暗
const flashlight = new THREE.SpotLight(0xe2de79, 21.5, 40, THREE.MathUtils.degToRad(26), 0.42, 2);
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(2048, 2048);
flashlight.shadow.camera.near = 0.4;
flashlight.shadow.camera.far = 40;
flashlight.shadow.bias = -0.00015;
flashlight.shadow.normalBias = 0.025;
flashlight.shadow.radius = 5;
scene.add(flashlight);
scene.add(flashlight.target);

const flashlightAim = new THREE.Vector3();
const flashlightDir = new THREE.Vector3();


// WORLD...OBJECTS
const {
  all,
  update: updateObjs,
  ketchupRing,
  ketchupVisual,
  ketchupSauce,
  ketchupFood,
  ketchupChicken,
  ketchupFry,
  ketchupExtraFood,
  ketchupShark,
  ketchupSharkWaves,
  rainbow,
  houses,
  ground,
  groundSurface,
  groundFlowers,
  groundRadius,
  isHouseGrown,
  isIntroHousesComplete,
  isIntroComplete,
  introSettings,
  replayIntro,
  gameHallLights,
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
  treasureChest,
  happyFatShop,
  pond,
  mainHallSlide,
  mainHallDoor,
  projectRoomStyle,
  floatingIsland,
  groundDetail,
} = createObjs({ envMap, eggEnvMap, camera });

/** 一次關掉整類食物（仍保留佈局，取消勾選即再顯示） */
const foodVisibility = {
  showCorn: true,
  showLemon: true,
  showSalmon: true,
  showFrenchFries: true,
  showFrenchFryStick: true,
};

scene.add(all);
enableMeshShadows(all);

/** 手電筒照到的物件要投影、被照到的面要接影 */
function enableMeshShadows(root: THREE.Object3D) {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
}

// 讓鏡頭沿著番茄醬流動的方向轉：把旋轉軸換成「緞帶圈圈的中心軸」
// OrbitControls 是繞著 camera.up 轉的（預設是世界的 +Y，也就是正上方）
// 緞帶整圈被翻起來、轉了方位，醬汁是繞著緞帶自己的軸在流，不是繞世界的 +Y
// 少了這段，鏡頭從上往下看時，左右拖動會變成整個畫面原地打轉，看起來像座標系歪掉
// 注意：OrbitControls 只在「建立時」讀一次 camera.up，所以一定要在 new OrbitControls 之前設定
const ORBIT_ALONG_KETCHUP = true;

if (ORBIT_ALONG_KETCHUP) {
  const ringObject = ketchupRing.object;
  ringObject.updateMatrixWorld(true);
  // 緞帶是繞著自己的 y 軸自轉（流動），把這個軸換算成世界座標
  const ringAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(ringObject.getWorldQuaternion(new THREE.Quaternion()));
  // 同一條軸有兩個方向，挑「偏向上方」的那個；選到朝下的，畫面會上下顛倒
  if (ringAxis.y < 0) ringAxis.negate();
  camera.up.copy(ringAxis);
  // up 變了要重新 lookAt，畫面的「上」才會跟著新的軸
  camera.lookAt(0, 0, 0);
}

const controls = new OrbitControls(camera, renderer.domElement);
// 旋轉中心對準球心，球才會固定在畫面正中間
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.minDistance = 4;
// controls.maxDistance = 30;
controls.maxDistance = 100;
// controls.maxPolarAngle = Math.PI / 2;
controls.update();

// 鎖住目前的畫面：拖動時只能左右繞著球轉，俯視的高度、距離、中心點都固定
// 想恢復自由轉動（例如要重新找角度），改成 false
const LOCK_CAMERA_VIEW = true;

if (LOCK_CAMERA_VIEW) {
  // 極角（polar angle）= 攝影機和正上方的夾角，決定「從多高往下看」
  // 把最小、最大都設成目前的值 → 上下拖動沒有空間可以轉，只剩左右（方位角）能轉
  const currentPolarAngle = controls.getPolarAngle();
  controls.minPolarAngle = currentPolarAngle;
  controls.maxPolarAngle = currentPolarAngle;
  // 關掉滾輪縮放：距離固定，球在畫面上的大小不會變
  controls.enableZoom = false;
  // 關掉右鍵平移：旋轉中心固定在球心，構圖不會被拖歪
  controls.enablePan = false;
}

// 入場動畫開始時的鏡頭：緞帶軸、Orbit 鎖定都套用後再存，按「初視」就 tween 回這裡
const introViewPose: CameraPose = {
  position: camera.position.clone(),
  target: controls.target.clone(),
  up: camera.up.clone(),
};

const worldUiActions = document.getElementById('world-ui-actions');
const viewIntroButton = document.getElementById('view-intro') as HTMLButtonElement | null;
const houseEnterSlot = document.getElementById('house-enter-slot');
const houseEnterButton = document.getElementById('house-enter') as HTMLButtonElement | null;

/** 已選房子（或開場預設 mainHall） */
let houseEnterReady = false;
/** 入場動畫：最後一棟房子長完後才允許顯示「進入」 */
let introEnterUnlocked = false;

function syncWorldActionButtons() {
  const busy = isCameraFlying() || isHouseTransitionPlaying();
  const showEnter = houseEnterReady && introEnterUnlocked;
  if (viewIntroButton) viewIntroButton.disabled = busy;
  if (houseEnterSlot) houseEnterSlot.hidden = !showEnter;
  if (houseEnterButton) houseEnterButton.disabled = busy || !showEnter;
}

function resetIntroEnterButton() {
  introEnterUnlocked = false;
  houseEnterReady = false;
  syncWorldActionButtons();
}

function tryUnlockEnterAfterHouses() {
  if (introEnterUnlocked || !isIntroHousesComplete()) return;
  introEnterUnlocked = true;
  if (!houseEnterReady) markHouseSelected();
  else syncWorldActionButtons();
}

function markHouseSelected() {
  houseEnterReady = true;
  syncWorldActionButtons();
}

viewIntroButton?.addEventListener('click', () => {
  if (isCameraFlying() || isHouseTransitionPlaying()) return;
  syncWorldActionButtons();
  void flyCameraTo(camera, controls, introViewPose).finally(() => {
    syncWorldActionButtons();
  });
});

houseEnterButton?.addEventListener('click', () => {
  if (!houseEnterReady || isCameraFlying() || isHouseTransitionPlaying()) return;
  syncWorldActionButtons();
  void playHouseTransition().finally(() => {
    syncWorldActionButtons();
  });
});

// 放開滑鼠（旋轉、縮放、平移結束）時印出鏡頭位置，方便把喜歡的角度抄回程式碼
// 用 'end' 而不是 'change'：change 拖曳中每幀都會觸發，console 會被洗版
controls.addEventListener('end', () => {
  const { x, y, z } = camera.position;
  const t = controls.target;
  console.log(
    `camera.position.set(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)});\n` +
    `controls.target.set(${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)});`
  );
});


// DEBUG...番茄醬緞帶的控制面板
// 調整到滿意後，把 console 印出來的那幾行貼回 ketchup.ts 最上面的常數
const gui = new GUI({ title: '控制面板' });
// 整體、緞帶、房子各自一個分組，面板才分得出哪個滑桿調哪個物件
// 整體放最上面：太陽和補光會乘上每一棟、地表的顏色，先調這組才看得出整體暖不暖
const lightFolder = gui.addFolder('整體');
const groundMaterial =
  groundSurface && !Array.isArray(groundSurface.material)
    ? (groundSurface.material as THREE.MeshPhongMaterial)
    : null;
const lightSettings = {
  sunColor: `#${directionalLight.color.getHexString()}`,
  sunIntensity: directionalLight.intensity,
  skyColor: `#${hemisphereLight.color.getHexString()}`,
  groundLightColor: `#${hemisphereLight.groundColor.getHexString()}`,
  fillIntensity: hemisphereLight.intensity,
  // 沒有綠球（改載模型）時不提供這一格
  surfaceColor: groundMaterial ? `#${groundMaterial.color.getHexString()}` : '',
};
const flashSettings = {
  enabled: true,
  color: `#${flashlight.color.getHexString()}`,
  intensity: flashlight.intensity,
  angleDegrees: THREE.MathUtils.radToDeg(flashlight.angle),
  penumbra: flashlight.penumbra,
  distance: flashlight.distance,
  aimAtTarget: true,
};
lightFolder.add(flashSettings, 'enabled').name('手電筒').onChange(applyFlashlight);
lightFolder.addColor(flashSettings, 'color').name('手電筒顏色').onChange(applyFlashlight).onFinishChange(logFlashlight);
lightFolder.add(flashSettings, 'intensity', 0, 40, 0.5).name('手電筒強度').onChange(applyFlashlight).onFinishChange(logFlashlight);
lightFolder.add(flashSettings, 'angleDegrees', 8, 60, 1).name('光錐角度 (°)').onChange(applyFlashlight).onFinishChange(logFlashlight);
lightFolder.add(flashSettings, 'penumbra', 0, 1, 0.02).name('光錐柔邊').onChange(applyFlashlight).onFinishChange(logFlashlight);
lightFolder.add(flashSettings, 'distance', 5, 80, 1).name('照射距離').onChange(applyFlashlight).onFinishChange(logFlashlight);
lightFolder.add(flashSettings, 'aimAtTarget').name('對準旋轉中心').onChange(applyFlashlight);
lightFolder.addColor(lightSettings, 'sunColor').name('太陽顏色').onChange(applyLights).onFinishChange(logLights);
lightFolder.add(lightSettings, 'sunIntensity', 0, 4, 0.05).name('太陽強度').onChange(applyLights).onFinishChange(logLights);
lightFolder.addColor(lightSettings, 'skyColor').name('朝上補光').onChange(applyLights).onFinishChange(logLights);
lightFolder.addColor(lightSettings, 'groundLightColor').name('朝下補光').onChange(applyLights).onFinishChange(logLights);
lightFolder.add(lightSettings, 'fillIntensity', 0, 3, 0.05).name('補光強度').onChange(applyLights).onFinishChange(logLights);
if (groundMaterial) {
  lightFolder.addColor(lightSettings, 'surfaceColor').name('地表顏色').onChange(applyLights).onFinishChange(logLights);
}

/** 把面板上的顏色、強度寫回三盞光和地表。拖拉中每一格都會跑 */
function applyLights() {
  directionalLight.color.set(lightSettings.sunColor);
  directionalLight.intensity = lightSettings.sunIntensity;
  hemisphereLight.color.set(lightSettings.skyColor);
  hemisphereLight.groundColor.set(lightSettings.groundLightColor);
  hemisphereLight.intensity = lightSettings.fillIntensity;
  if (groundMaterial && lightSettings.surfaceColor) groundMaterial.color.set(lightSettings.surfaceColor);
}

function logLights() {
  const hex = (color: string) => `0x${color.replace('#', '')}`;
  console.log(
    `const directionalLight = new THREE.DirectionalLight(${hex(lightSettings.sunColor)}, ${lightSettings.sunIntensity});\n` +
    `const hemisphereLight = new THREE.HemisphereLight(${hex(lightSettings.skyColor)}, ${hex(lightSettings.groundLightColor)}, ${lightSettings.fillIntensity});` +
    (lightSettings.surfaceColor ? `\ncolor: ${hex(lightSettings.surfaceColor)},` : '')
  );
}

function isFlashlightActive() {
  return flashSettings.enabled && isIntroComplete();
}

function applyFlashlight() {
  const on = isFlashlightActive();
  flashlight.visible = on;
  flashlight.castShadow = on;
  if (!on) {
    flashlight.intensity = 0;
    return;
  }
  flashlight.color.set(flashSettings.color);
  flashlight.intensity = flashSettings.intensity;
  flashlight.angle = THREE.MathUtils.degToRad(flashSettings.angleDegrees);
  flashlight.penumbra = flashSettings.penumbra;
  flashlight.distance = flashSettings.distance;
  flashlight.shadow.camera.far = flashSettings.distance;
}

function updateFlashlight() {
  applyFlashlight();
  if (!isFlashlightActive()) return;
  flashlight.position.copy(camera.position);
  if (flashSettings.aimAtTarget) {
    flashlightAim.copy(controls.target);
  } else {
    camera.getWorldDirection(flashlightDir);
    flashlightAim.copy(camera.position).addScaledVector(flashlightDir, 6);
  }
  flashlight.target.position.copy(flashlightAim);
}

function logFlashlight() {
  const hex = (color: string) => `0x${color.replace('#', '')}`;
  console.log(
    `// 手電筒\n` +
      `enabled: ${flashSettings.enabled},\n` +
      `color: ${hex(flashSettings.color)},\n` +
      `intensity: ${flashSettings.intensity.toFixed(1)},\n` +
      `angleDegrees: ${flashSettings.angleDegrees.toFixed(0)},\n` +
      `penumbra: ${flashSettings.penumbra.toFixed(2)},\n` +
      `distance: ${flashSettings.distance.toFixed(0)},\n` +
      `aimAtTarget: ${flashSettings.aimAtTarget}`,
  );
}

applyFlashlight();

const introFolder = gui.addFolder('入場動畫');
introFolder.add(introSettings, 'emptyHold', 0, 2, 0.05).name('空景等待 (秒)').onFinishChange(logIntro);
introFolder.add(introSettings, 'ballSeconds', 0.3, 8, 0.05).name('綠球跑進 (秒)').onFinishChange(logIntro);
introFolder.add(introSettings, 'ballMoveEase', [...INTRO_BALL_EASE_OPTIONS]).name('綠球位移 tween').onFinishChange(logIntro);
introFolder.add(introSettings, 'ballScaleEase', [...INTRO_BALL_EASE_OPTIONS]).name('綠球縮放 tween').onFinishChange(logIntro);
introFolder.add(introSettings, 'ballScaleLag', 0, 1.5, 0.02).name('綠球縮放延遲 (秒)').onFinishChange(logIntro);
introFolder.add(introSettings, 'ballStartScale', 0.05, 0.5, 0.01).name('綠球起始縮放').onFinishChange(logIntro);
introFolder.add(introSettings, 'ballOvershoot', 0, 5, 0.1).name('綠球回彈 (outBack)').onFinishChange(logIntro);
introFolder.add(introSettings, 'houseSeconds', 0.3, 3, 0.05).name('房子長出 (秒)').onFinishChange(logIntro);
introFolder.add(introSettings, 'houseStagger', 0, 0.4, 0.01).name('房子間隔 (秒)').onFinishChange(logIntro);
introFolder.add(introSettings, 'houseOvershoot', 0, 5, 0.1).name('房子回彈').onFinishChange(logIntro);
introFolder.add(introSettings, 'ketchupSeconds', 0.5, 4, 0.05).name('番茄醬繞環 (秒)').onFinishChange(logIntro);
introFolder.add(introSettings, 'ketchupAfterHouse', 0, 1, 0.05).name('醬在末棟比例').onFinishChange(logIntro);
introFolder.add(introSettings, 'rainbowSeconds', 0.2, 3, 0.05).name('彩虹入場 (秒)').onFinishChange(logIntro);
const introControls = {
  replayIntro() {
    resetIntroEnterButton();
    replayIntro();
  },
};
introFolder.add(introControls, 'replayIntro').name('重播入場');

function logIntro() {
  console.log(
    `const INTRO_EMPTY_HOLD = ${introSettings.emptyHold.toFixed(2)};\n` +
      `const BALL_SECONDS = ${introSettings.ballSeconds.toFixed(2)};\n` +
      `const BALL_SCALE_LAG = ${introSettings.ballScaleLag.toFixed(2)};\n` +
      `const BALL_START_SCALE = ${introSettings.ballStartScale.toFixed(2)};\n` +
      `const BALL_OVERSHOOT = ${introSettings.ballOvershoot.toFixed(2)};\n` +
      `const BALL_MOVE_EASE = '${introSettings.ballMoveEase}';\n` +
      `const BALL_SCALE_EASE = '${introSettings.ballScaleEase}';\n` +
      `const HOUSE_SECONDS = ${introSettings.houseSeconds.toFixed(2)};\n` +
      `const HOUSE_STAGGER = ${introSettings.houseStagger.toFixed(2)};\n` +
      `const HOUSE_OVERSHOOT = ${introSettings.houseOvershoot.toFixed(2)};\n` +
      `const KETCHUP_SECONDS = ${introSettings.ketchupSeconds.toFixed(2)};\n` +
      `const KETCHUP_AFTER_HOUSE = ${introSettings.ketchupAfterHouse.toFixed(2)};\n` +
      `const RAINBOW_SECONDS = ${introSettings.rainbowSeconds.toFixed(2)};`,
  );
}

const rainbowFolder = gui.addFolder('彩虹');
const rainbowSettings = rainbow.settings;
rainbowFolder.add(rainbowSettings, 'enabled').name('顯示').onChange(rainbow.apply);
rainbowFolder.add(rainbowSettings, 'camX', -6, 2, 0.05).name('左右 camX').onFinishChange(logRainbow);
rainbowFolder.add(rainbowSettings, 'camY', 0, 5, 0.02).name('上下 camY').onFinishChange(logRainbow);
rainbowFolder
  .add(rainbowSettings, 'camZ', -28, -6, 0.1)
  .name('前後 camZ')
  .onFinishChange(logRainbow);
rainbowFolder.add(rainbowSettings, 'scale', 0.1, 1.2, 0.02).name('大小 scale').onChange(rainbow.apply).onFinishChange(logRainbow);
rainbowFolder.add(rainbowSettings, 'bob', 0, 0.2, 0.005).name('漂浮 bob').onFinishChange(logRainbow);
rainbowFolder
  .add(rainbowSettings, 'bandThickness', 0.4, 1.8, 0.02)
  .name('色帶寬度 bandThickness')
  .onChange(rainbow.apply)
  .onFinishChange(logRainbow);
rainbowFolder
  .add(rainbowSettings, 'arcRadius', 1.8, 3.4, 0.02)
  .name('弧半徑 arcRadius')
  .onChange(rainbow.apply)
  .onFinishChange(logRainbow);
rainbowFolder
  .add(rainbowSettings, 'opacity', 0.2, 1, 0.02)
  .name('透明度 opacity')
  .onChange(rainbow.apply)
  .onFinishChange(logRainbow);
const rainbowColorFolder = rainbowFolder.addFolder('漸層色（內→外）');
const rainbowColorLabels = ['內 color0', 'color1', 'color2', 'color3', 'color4', 'color5', '外 color6'];
for (let i = 0; i < 7; i++) {
  const key = `color${i}` as keyof typeof rainbowSettings;
  rainbowColorFolder
    .addColor(rainbowSettings, key)
    .name(rainbowColorLabels[i])
    .onChange(rainbow.apply)
    .onFinishChange(logRainbow);
}

const flowerFolder = groundFlowers ? gui.addFolder('地表小花') : null;
if (flowerFolder && groundFlowers) {
  const flowerSettings = groundFlowers.settings;
  const applyFlowerLayout = () => groundFlowers.applyLayout();
  const applyFlowerVisual = () => groundFlowers.applyVisuals();
  flowerFolder.add(flowerSettings, 'count', 0, 512, 1).name('數量').onFinishChange(applyFlowerLayout);
  flowerFolder.add(flowerSettings, 'seed', 1, 999_999, 1).name('種子 seed').onFinishChange(applyFlowerLayout);
  flowerFolder
    .add(flowerSettings, 'sizeVariation', 0, 1, 0.02)
    .name('大小變化')
    .onFinishChange(applyFlowerLayout);
  flowerFolder.add(flowerSettings, 'lift', 0, 0.01, 0.0001).name('浮起 lift').onFinishChange(applyFlowerLayout);
  flowerFolder
    .add(flowerSettings, 'frontShare', 0, 1, 0.02)
    .name('鏡頭前比例')
    .onFinishChange(applyFlowerLayout);
  flowerFolder
    .add(flowerSettings, 'viewFocus', 0, 1, 0.02)
    .name('視線集中')
    .onFinishChange(applyFlowerLayout);
  flowerFolder
    .add(flowerSettings, 'viewConeDegrees', 10, 120, 1)
    .name('視錐角度 °')
    .onFinishChange(applyFlowerLayout);
  flowerFolder
    .add(flowerSettings, 'styleBRatio', 0, 1, 0.02)
    .name('B 款比例')
    .onFinishChange(applyFlowerLayout);
  const styleAFolder = flowerFolder.addFolder('款式 A');
  styleAFolder.add(flowerSettings.styleA, 'size', 0.1, 1.2, 0.01).name('大小').onChange(applyFlowerVisual);
  styleAFolder.addColor(flowerSettings.styleA, 'petalColor').name('花瓣色').onChange(applyFlowerVisual);
  styleAFolder.addColor(flowerSettings.styleA, 'centerColor').name('花心色').onChange(applyFlowerVisual);
  const styleBFolder = flowerFolder.addFolder('款式 B');
  styleBFolder.add(flowerSettings.styleB, 'size', 0.1, 1.2, 0.01).name('大小').onChange(applyFlowerVisual);
  styleBFolder.addColor(flowerSettings.styleB, 'petalColor').name('花瓣色').onChange(applyFlowerVisual);
  styleBFolder.addColor(flowerSettings.styleB, 'centerColor').name('花心色').onChange(applyFlowerVisual);
  const flowerActions = {
    layoutFromView() {
      groundFlowers.layoutFromView();
    },
    reroll() {
      groundFlowers.rerollDistribution();
    },
    exportBaked() {
      groundFlowers.exportBakedJsonToConsole();
    },
    clearSaved() {
      groundFlowers.clearPersistedLayout();
    },
  };
  flowerFolder.add(flowerActions, 'layoutFromView').name('依目前鏡頭重排');
  flowerFolder.add(flowerActions, 'reroll').name('重骰分佈');
  flowerFolder.add(flowerActions, 'exportBaked').name('印出烘焙 JSON');
  flowerFolder.add(flowerActions, 'clearSaved').name('還原 repo 烘焙');
}

function logRainbow() {
  const r = rainbowSettings;
  const hex = (color: string) => `0x${color.replace('#', '')}`;
  console.log(
    `const RAINBOW_CAM_X = ${r.camX.toFixed(2)};\n` +
      `const RAINBOW_CAM_Y = ${r.camY.toFixed(2)};\n` +
      `const RAINBOW_CAM_Z = ${r.camZ.toFixed(2)};\n` +
      `const RAINBOW_SCALE = ${r.scale.toFixed(2)};\n` +
      `const RAINBOW_BOB = ${r.bob.toFixed(3)};\n` +
      `const RAINBOW_ARC_RADIUS = ${r.arcRadius.toFixed(2)};\n` +
      `const RAINBOW_BAND_THICKNESS = ${r.bandThickness.toFixed(2)};\n` +
      `const RAINBOW_MESH_OPACITY = ${r.opacity.toFixed(2)};\n` +
      `const RAINBOW_COLORS = [${[0, 1, 2, 3, 4, 5, 6].map((i) => hex(r[`color${i}` as keyof typeof r] as string)).join(', ')}];`,
  );
}

// 番茄醬質感：顏色、光澤、亮邊、接觸陰影、流動高光、氣泡、漣漪
const sauceFolder = gui.addFolder('番茄醬質感');
{
  const sauce = ketchupSauce.settings;
  const apply = ketchupSauce.apply;
  const log = () => console.log(formatKetchupSauceSettingsForPaste(sauce));
  sauceFolder.addColor(sauce, 'color').name('醬的顏色').onChange(apply).onFinishChange(log);
  sauceFolder.addColor(sauce, 'emissiveColor').name('暗部透色').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'emissiveStrength', 0, 2, 0.05).name('暗部透色強度').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'roughness', 0, 1, 0.01).name('粗糙度（低=亮滑）').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'clearcoat', 0, 1, 0.01).name('清漆光澤').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'clearcoatRoughness', 0, 1, 0.01).name('清漆粗糙度').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'envIntensity', 0, 2, 0.05).name('環境反射').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'rimStrength', 0, 1.5, 0.01).name('邊緣亮光').onChange(apply).onFinishChange(log);
  sauceFolder.addColor(sauce, 'rimColor').name('邊緣亮光顏色').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'rimPower', 0.5, 8, 0.1).name('邊緣亮光寬窄（大=窄）').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'contactDark', 0, 1, 0.01).name('貼地陰影').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'streakStrength', 0, 1, 0.01).name('流動高光').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'streakSpeed', 0, 4, 0.05).name('流動速度').onFinishChange(log);
  sauceFolder.add(sauce, 'bubbleStrength', 0, 1.5, 0.01).name('小氣泡').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'rippleStrength', 0, 2, 0.05).name('小豬漣漪強度').onChange(apply).onFinishChange(log);
  sauceFolder.add(sauce, 'rippleDistance', 0, 0.2, 0.005).name('多近起漣漪').onFinishChange(log);
  sauceFolder.add({ log }, 'log').name('印出設定');
}

const ringFolder = gui.addFolder('番茄醬緞帶');
const ring = ketchupRing.settings;
// onChange：拖拉中每一格都即時套用，馬上看到效果
// onFinishChange：放開滑鼠才印 console，拖拉過程不會洗版
ringFolder.add(ring, 'radius', 0.8, 2, 0.01).name('半徑 ORBIT_RADIUS').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
ringFolder.add(ring, 'tiltDegrees', -180, 180, 1).name('傾斜 RING_TILT (°)').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
ringFolder.add(ring, 'yawDegrees', -180, 180, 1).name('方位 RING_YAW (°)').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
ringFolder.add(ring, 'offsetX', -2, 2, 0.01).name('位置 X RING_OFFSET_X').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
ringFolder.add(ring, 'offsetY', -2, 2, 0.01).name('高度 RING_OFFSET_Y').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
ringFolder.add(ring, 'offsetZ', -2, 2, 0.01).name('位置 Z RING_OFFSET_Z').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
// 食物數量：0 就是醬上什麼都不放。拖拉時立刻增減，放開才把數字印到 console
ringFolder.add(ketchupFood.settings, 'count', 0, 150, 1).name('食物數量').onChange(ketchupFood.apply).onFinishChange(() => {
  console.log(`const FOOD_COUNT = ${ketchupFood.settings.count};`);
});

const chickenFood = ketchupChicken.settings;
ringFolder
  .add(chickenFood, 'size', 0.015, 0.12, 0.001)
  .name('烤雞大小 (m)')
  .onChange(ketchupChicken.apply)
  .onFinishChange(logKetchupChicken);
ringFolder
  .addColor(chickenFood, 'boneColor')
  .name('烤雞骨頭色')
  .onChange(ketchupChicken.apply)
  .onFinishChange(logKetchupChicken);
ringFolder.add({ 重新隨機表皮色: () => ketchupChicken.rerollColors() }, '重新隨機表皮色').name('重新隨機表皮色');

const fryFood = ketchupFry.settings;
ringFolder
  .add(fryFood, 'size', 0.02, 0.1, 0.001)
  .name('薯條長邊 (m)')
  .onChange(ketchupFry.apply)
  .onFinishChange(logKetchupFry);

// 醬上其他食物（香菇）＋所有食物的亮邊
const extraFood = ketchupExtraFood.settings;
const logExtraFood = () =>
  console.log(
    `// 貼回 src/world/objects/ketchup.ts 的 extraFoodSettings\n` +
      `mushroomSize: ${extraFood.mushroomSize.toFixed(3)}, mushroomFloat: ${extraFood.mushroomFloat.toFixed(2)}, rim: ${extraFood.rim.toFixed(2)}`,
  );
ringFolder.add(extraFood, 'mushroomSize', 0.02, 0.15, 0.001).name('香菇大小 (m)').onChange(ketchupExtraFood.apply).onFinishChange(logExtraFood);
ringFolder.add(extraFood, 'mushroomFloat', -0.3, 0.5, 0.01).name('香菇浮起高度（小=沉）').onChange(ketchupExtraFood.apply).onFinishChange(logExtraFood);
ringFolder.add(extraFood, 'rim', 0, 1.5, 0.01).name('食物邊緣亮光').onChange(ketchupExtraFood.apply).onFinishChange(logExtraFood);

const sharkFolder = gui.addFolder('番茄醬海・鯊魚');
const shark = ketchupShark.settings;
sharkFolder.add(shark, 'enabled').name('顯示魚鰭').onChange(ketchupShark.apply);
sharkFolder.add(shark, 'drift', 0, 2, 0.02).name('游動速度 SHARK_FIN_DRIFT').onChange(ketchupShark.apply).onFinishChange(logSharkFin);
sharkFolder.add(shark, 'forward').name('順環游（關＝逆環）');
sharkFolder.addColor(shark, 'color').name('顏色 SHARK_FIN_COLOR').onChange(ketchupShark.apply).onFinishChange(logSharkFin);
sharkFolder.add(shark, 'lift', -0.05, 0.04, 0.001).name('埋入醬面 lift').onChange(ketchupShark.apply).onFinishChange(logSharkFin);
sharkFolder.add(shark, 'depth', 0.003, 0.025, 0.001).name('厚度 depth').onChange(ketchupShark.apply).onFinishChange(logSharkFin);
sharkFolder.add(shark, 'curveAmp', 0, 0.85, 0.02).name('曲線幅度 curveAmp').onFinishChange(logSharkFin);
sharkFolder.add(shark, 'curveRate', 0.1, 2.5, 0.05).name('曲線速度 curveRate').onFinishChange(logSharkFin);
sharkFolder.add(shark, 'jumpEvery', 0, 30, 0.5).name('平均幾秒跳一次（0=不跳）').onFinishChange(logSharkFin);
sharkFolder.add(shark, 'jumpHeight', 0, 0.2, 0.005).name('跳躍高度').onFinishChange(logSharkFin);
sharkFolder
  .add(ketchupVisual.settings, 'opacity', 0, 1, 0.02)
  .name('醬透明（看魚鰭）')
  .onChange(ketchupVisual.apply);

const waveFolder = sharkFolder.addFolder('魚鰭水波');
const finWave = ketchupSharkWaves.settings;
waveFolder.add(finWave, 'enabled').name('顯示水波');
waveFolder.add(finWave, 'interval', 0.05, 0.55, 0.01).name('間隔 interval').onFinishChange(logSharkFinWaves);
waveFolder.add(finWave, 'life', 0.15, 1.4, 0.02).name('持續 life').onFinishChange(logSharkFinWaves);
waveFolder.add(finWave, 'scale', 0.25, 2.2, 0.05).name('大小 scale').onFinishChange(logSharkFinWaves);
waveFolder.add(finWave, 'opacity', 0, 1, 0.02).name('透明度 opacity').onFinishChange(logSharkFinWaves);
waveFolder.add(finWave, 'sideSpread', 0, 0.055, 0.001).name('左右偏移 sideSpread').onFinishChange(logSharkFinWaves);
waveFolder.add(finWave, 'trail', 0.005, 0.09, 0.001).name('落後距離 trail').onFinishChange(logSharkFinWaves);
waveFolder
  .addColor(finWave, 'color')
  .name('色調 color')
  .onChange(ketchupSharkWaves.apply)
  .onFinishChange(logSharkFinWaves);

function logSharkFinWaves() {
  const hex = (color: string) => `0x${color.replace('#', '')}`;
  console.log(
    `const SHARK_FIN_WAVE_ENABLED = ${finWave.enabled};\n` +
      `const SHARK_FIN_WAVE_INTERVAL = ${finWave.interval.toFixed(2)};\n` +
      `const SHARK_FIN_WAVE_LIFE = ${finWave.life.toFixed(2)};\n` +
      `const SHARK_FIN_WAVE_SCALE = ${finWave.scale.toFixed(2)};\n` +
      `const SHARK_FIN_WAVE_OPACITY = ${finWave.opacity.toFixed(2)};\n` +
      `const SHARK_FIN_WAVE_SIDE = ${finWave.sideSpread.toFixed(3)};\n` +
      `const SHARK_FIN_WAVE_TRAIL = ${finWave.trail.toFixed(3)};\n` +
      `const SHARK_FIN_WAVE_COLOR = ${hex(finWave.color)};`,
  );
}

function logSharkFin() {
  const hex = (color: string) => `0x${color.replace('#', '')}`;
  console.log(
    `const SHARK_FIN_ENABLED = ${shark.enabled};\n` +
      `const SHARK_FIN_DRIFT = ${shark.drift.toFixed(2)};\n` +
      `const SHARK_FIN_COLOR = ${hex(shark.color)};\n` +
      `// forward ${shark.forward}, lift ${shark.lift.toFixed(3)}, depth ${shark.depth.toFixed(3)}\n` +
      `const SHARK_FIN_CURVE_AMP = ${shark.curveAmp.toFixed(2)};\n` +
      `const SHARK_FIN_CURVE_RATE = ${shark.curveRate.toFixed(2)};\n` +
      `// jumpEvery ${shark.jumpEvery.toFixed(1)}, jumpHeight ${shark.jumpHeight.toFixed(3)}`,
  );
}

// 點房子時旋進來的方塊。放開顏色才播一次，拖拉過程不要連著重播
const transitionFolder = gui.addFolder('轉場');
transitionFolder.addColor(transitionSettings, 'color').name('黑幕顏色').onFinishChange(() => {
  console.log(`const CURTAIN_COLOR = '${transitionSettings.color}';`);
  void playHouseTransition();
});

// DEBUG...房子的控制面板
// 調整到滿意後，把 console 印出來的那幾行貼回對應房子的設定
// 點到哪一棟，這個分組（番茄醬緞帶的下方）就改顯示那一棟的滑桿
const houseFolder = gui.addFolder('房子');
// 一開始先顯示第一棟，還沒點過房子時面板也有東西可調
let selectedHouse: WorldHouse | null = houses[0];

/**
 * 鎖定的房子：不能在畫面上拖動、面板也不顯示調整滑桿（避免不小心改到已經定案的擺放）。
 * 點選、顯示標籤、按「進入」都照常。要解鎖就從這裡拿掉名字。
 */
const LOCKED_HOUSES = new Set(['mainHall', 'projectRoom']);
const isHouseLocked = (target: { object: THREE.Object3D }) =>
  houses.some((house) => house.object === target.object && LOCKED_HOUSES.has(house.label));

function bindHousePanel(entry: WorldHouse) {
  // 已經是這一棟就不要拆掉滑桿重建：拖曳中每一格都會碰面板，重建會讓數字閃一下
  const alreadyShowing = entry === selectedHouse && houseFolder.controllers.length > 0;
  selectedHouse = entry;
  highlightHouse(entry);
  if (alreadyShowing) return;

  houseFolder.title(`房子 · ${entry.label}`);
  for (const controller of [...houseFolder.controllers]) controller.destroy();
  for (const folder of [...houseFolder.folders]) folder.destroy();
  if (LOCKED_HOUSES.has(entry.label)) {
    houseFolder.title(`房子 · ${entry.label}（已鎖定）`);
    return;
  }

  const settings = entry.settings;
  const apply = () => entry.apply();
  houseFolder.add(settings, 'angleFromTopDegrees', 0, 180, 1).name('離頂端 HOUSE_ANGLE_FROM_TOP (°)').onChange(apply).onFinishChange(logHouse);
  houseFolder.add(settings, 'azimuthDegrees', -180, 180, 1).name('方位 HOUSE_AZIMUTH (°)').onChange(apply).onFinishChange(logHouse);
  houseFolder.add(settings, 'spinDegrees', -180, 180, 1).name('自轉 HOUSE_SPIN (°)').onChange(apply).onFinishChange(logHouse);
  houseFolder.add(settings, 'sink', -0.1, 0.3, 0.005).name('下沉 HOUSE_SINK').onChange(apply).onFinishChange(logHouse);
  houseFolder.add(settings, 'scale', 0.01, 0.5, 0.01).name('縮放 HOUSE_SCALE').onChange(apply).onFinishChange(logHouse);
  houseFolder.add(settings, 'width', 0.1, 5, 0.1).name('寬 HOUSE_WIDTH').onChange(apply).onFinishChange(logHouse);
  houseFolder.add(settings, 'height', 0.1, 5, 0.1).name('高 HOUSE_HEIGHT').onChange(apply).onFinishChange(logHouse);
  houseFolder.add(settings, 'depth', 0.1, 5, 0.1).name('深 HOUSE_DEPTH').onChange(apply).onFinishChange(logHouse);
  houseFolder.addColor(settings, 'color').name('顏色 HOUSE_COLOR').onChange(apply).onFinishChange(logHouse);

  if (entry.label === 'Gamehall') {
    const lights = gameHallLights.settings;
    // 點房子才動態建立的子分組，也跟其他分組一樣預設收合
    const lightFolder = houseFolder.addFolder('招牌與燈').close();
    lightFolder.add(lights, 'neonMaster', 0, 1, 0.01).name('霓虹總亮度');
    lightFolder.add(lights, 'neonEmissive', 0, 1.5, 0.01).name('霓虹發光');
    lightFolder.add(lights, 'neonPoint', 0, 1.2, 0.01).name('霓虹點光');
    lightFolder.add(lights, 'lampMaster', 0, 1, 0.01).name('店燈總亮度');
    lightFolder.add(lights, 'lampEmissive', 0, 1, 0.01).name('店燈發光');
    lightFolder.add(lights, 'lampPoint', 0, 1, 0.01).name('店燈點光');
    lightFolder
      .add(lights, 'mode', { 恆亮: 'steady', 呼吸: 'breathe', 追逐: 'chase', 閃爍: 'flicker' })
      .name('霓虹變化');
    lightFolder.add(lights, 'speed', 0.1, 3, 0.05).name('變化速度').onFinishChange(logGameHallLights);
    lightFolder.controllers.forEach((c) => {
      if (c.property !== 'speed') c.onFinishChange(logGameHallLights);
    });
  }
}

function logGameHallLights() {
  const lights = gameHallLights.settings;
  console.log(
    `// Gamehall 燈光\n` +
      `neonMaster: ${lights.neonMaster.toFixed(2)},\n` +
      `neonEmissive: ${lights.neonEmissive.toFixed(2)},\n` +
      `neonPoint: ${lights.neonPoint.toFixed(2)},\n` +
      `lampMaster: ${lights.lampMaster.toFixed(2)},\n` +
      `lampEmissive: ${lights.lampEmissive.toFixed(2)},\n` +
      `lampPoint: ${lights.lampPoint.toFixed(2)},\n` +
      `mode: '${lights.mode}',\n` +
      `speed: ${lights.speed.toFixed(2)},`,
  );
}

function clearHouseSelection() {
  selectedHouse = null;
  highlightHouse(null);
  houseEnterReady = false;
  houseLabel.style.visibility = 'hidden';
  houseFolder.title('房子');
  for (const controller of [...houseFolder.controllers]) controller.destroy();
  syncWorldActionButtons();
}

/** 選中的那一棟自己發光，才分得出面板上的數字是哪一棟的 */
function highlightHouse(entry: WorldHouse | null) {
  for (const house of houses) {
    const material = house.object.material;
    const active = entry !== null && house === entry;
    material.emissive.set(active ? house.settings.color : 0x000000);
    // 只要能認出選中的是哪一棟；太亮會把那一棟洗白，其他棟看起來更暗
    material.emissiveIntensity = active ? 0.16 : 1;
  }
}

bindHousePanel(houses[0]);

/** false = 場景上不可點選、拖曳，也不顯示調整面板 */
const PUDDING_SCENE_EDIT = false;

// DEBUG...布丁（綠球上，可多顆）
const puddingFolder =
  PUDDING_SCENE_EDIT && puddings.length > 0 ? gui.addFolder('布丁') : null;
let selectedPudding: WorldPudding | null = null;

function highlightPudding(entry: WorldPudding | null) {
  for (const pudding of puddings) {
    const active = pudding === entry;
    pudding.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('emissive' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        if (!active) {
          if (m.userData.puddingEmissiveIntensity !== undefined) {
            m.emissiveIntensity = m.userData.puddingEmissiveIntensity;
          }
          continue;
        }
        if (m.userData.puddingEmissiveIntensity === undefined) {
          m.userData.puddingEmissiveIntensity = m.emissiveIntensity;
        }
        m.emissiveIntensity = Math.max(m.emissiveIntensity, 0.85);
      }
    });
  }
}

const PUDDING_PANEL_ACTIONS = new Set(['add', 'remove', 'log']);

function clearPuddingPanelSliders() {
  if (!puddingFolder) return;
  puddingFolder.title('布丁');
  for (const controller of [...puddingFolder.controllers]) {
    if (PUDDING_PANEL_ACTIONS.has(String(controller.property))) continue;
    controller.destroy();
  }
}

function bindPuddingPanel(entry: WorldPudding) {
  if (!puddingFolder) return;
  const alreadyShowing = entry === selectedPudding && puddingFolder.controllers.length > PUDDING_PANEL_ACTIONS.size;
  selectedPudding = entry;
  highlightPudding(entry);
  if (alreadyShowing) return;

  puddingFolder.title(`布丁 · ${entry.label}`);
  clearPuddingPanelSliders();

  const settings = entry.settings;
  const apply = () => entry.apply();
  puddingFolder
    .add(settings, 'angleFromTopDegrees', 0, 90, 1)
    .name('離頂端 PUDDING_ANGLE (°)')
    .onChange(apply)
    .onFinishChange(logPuddingPlacements);
  puddingFolder
    .add(settings, 'azimuthDegrees', -180, 180, 1)
    .name('方位 PUDDING_AZIMUTH (°)')
    .onChange(apply)
    .onFinishChange(logPuddingPlacements);
  puddingFolder
    .add(settings, 'spinDegrees', -180, 180, 1)
    .name('自轉 PUDDING_SPIN (°)')
    .onChange(apply)
    .onFinishChange(logPuddingPlacements);
  puddingFolder
    .add(settings, 'sink', -0.05, 0.08, 0.001)
    .name('下沉 PUDDING_SINK')
    .onChange(apply)
    .onFinishChange(logPuddingPlacements);
  puddingFolder
    .add(settings, 'placementScale', 0.05, 2, 0.01)
    .name('縮放 PUDDING_SCALE')
    .onChange(apply)
    .onFinishChange(logPuddingPlacements);
  puddingFolder
    .add(settings, 'modelSize', 0.03, 0.35, 0.005)
    .name('大小 modelSize (m)')
    .onChange(apply)
    .onFinishChange(logPuddingPlacements);
  puddingFolder
    .add(settings, 'jiggleStrength', 0, 2.5, 0.02)
    .name('Q彈強度')
    .onFinishChange(logPuddingPlacements);
  puddingFolder
    .add(settings, 'jiggleSpeed', 0.2, 3, 0.05)
    .name('Q彈速度')
    .onFinishChange(logPuddingPlacements);
}

function logPuddingPlacements() {
  if (puddings.length === 0) return;
  console.log(
    formatPuddingPlacementsForPaste(puddings.map((p) => ({ id: p.id, settings: p.settings }))),
  );
}

// 蛋形太陽（位置／大小／發光）
const eggSunEntry = friedEggs.find((e) => e.settings.mode === 'sun') ?? null;
const eggSunFolder = eggSunEntry ? gui.addFolder('蛋形太陽') : null;

function logEggSun() {
  if (!eggSunEntry || eggSunEntry.settings.mode !== 'sun') return;
  console.log(formatFriedEggPlacementsForPaste([{ id: eggSunEntry.id, settings: eggSunEntry.settings }]));
}

if (eggSunFolder && eggSunEntry && eggSunEntry.settings.mode === 'sun') {
  const sun = eggSunEntry.settings as FriedEggSunLayout;
  const apply = () => eggSunEntry.apply();
  const applyVisuals = () => eggSunEntry.applyVisuals();
  eggSunFolder
    .add(sun, 'camX', -8, 8, 0.02)
    .name('鏡頭 X（右＋）')
    .onChange(apply)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'camY', -2, 6, 0.02)
    .name('鏡頭 Y（上＋）')
    .onChange(apply)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'camZ', -40, -2, 0.05)
    .name('鏡頭 Z（愈負愈遠）')
    .onChange(apply)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'modelSize', 0.02, 0.45, 0.005)
    .name('大小 (m)')
    .onChange(apply)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'placementScale', 0.05, 3, 0.01)
    .name('整體縮放')
    .onChange(apply)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'spinDegrees', -180, 180, 1)
    .name('自轉 (°)')
    .onChange(apply)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'lightIntensity', 0, 3, 0.02)
    .name('光照強度')
    .onChange(apply)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'emissiveBoost', 0.2, 3, 0.02)
    .name('發光倍率')
    .onChange(applyVisuals)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'jiggleStrength', 0, 2.5, 0.02)
    .name('抖動幅度')
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'jiggleSpeed', 0.08, 1.2, 0.02)
    .name('抖動速度')
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'whiteMetalness', 0, 0.35, 0.01)
    .name('蛋白金屬度')
    .onChange(applyVisuals)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'whiteRoughness', 0.2, 0.95, 0.01)
    .name('蛋白粗糙度')
    .onChange(applyVisuals)
    .onFinishChange(logEggSun);
  eggSunFolder
    .add(sun, 'whiteEnvIntensity', 0, 0.8, 0.02)
    .name('蛋白環境反射')
    .onChange(applyVisuals)
    .onFinishChange(logEggSun);
  const eggSliders: Array<['whiteGlow' | 'yolkGlow' | 'yolkClearcoat' | 'yolkClearcoatRoughness' | 'yolkRimStrength', number, number, number, string]> = [
    ['whiteGlow', 0, 0.6, 0.01, '蛋白自發光'],
    ['yolkGlow', 0, 0.8, 0.01, '蛋黃自發光'],
    ['yolkClearcoat', 0, 1, 0.01, '蛋黃油亮清漆'],
    ['yolkClearcoatRoughness', 0, 0.5, 0.01, '清漆粗糙度'],
    ['yolkRimStrength', 0, 1, 0.01, '蛋黃邊緣橘'],
  ];
  for (const [key, min, max, step, name] of eggSliders) {
    eggSunFolder.add(sun, key, min, max, step).name(name).onChange(applyVisuals).onFinishChange(logEggSun);
  }
  eggSunFolder.add({ log: logEggSun }, 'log').name('印出設定 (console)');

  // 蛋白外觀（程式產生的蛋白，見 friedEggWhite.ts）：形狀類的數值改了要重新長一次
  const eggWhiteFolder = eggSunFolder.addFolder('蛋白外觀');
  const logEggWhite = () => console.log(formatEggWhiteLookForPaste());
  const rebuildWhite = () => eggSunEntry.rebuildWhite();
  const eggWhiteSliders: Array<[keyof typeof EGG_WHITE_LOOK, number, number, number, string]> = [
    ['seed', 1, 60, 1, '亂數種子（換輪廓）'],
    ['wobble', 0, 0.25, 0.005, '波浪起伏'],
    ['lace', 0, 0.06, 0.002, '邊緣鋸齒'],
    ['crispWidth', 0.05, 0.5, 0.01, '焦脆邊寬度'],
    ['rimCurl', 0, 1.2, 0.02, '邊緣上翹'],
    ['domeBulge', 0, 0.8, 0.02, '蛋黃旁鼓起'],
    ['translucentRing', 1, 3, 0.05, '半熟透明圈'],
    ['bubbles', 0, 12, 1, '氣泡數'],
    ['bubbleSize', 0.3, 2, 0.05, '氣泡大小'],
  ];
  for (const [key, min, max, step, name] of eggWhiteSliders) {
    eggWhiteFolder.add(EGG_WHITE_LOOK, key, min, max, step).name(name).onChange(rebuildWhite).onFinishChange(logEggWhite);
  }
  // 曝光是 shader 直接讀的 uniform，改了立刻生效，不用重新長
  eggWhiteFolder.add(eggWhiteExposure.value, 'x', 0.3, 2, 0.01).name('蛋白曝光斜率').onFinishChange(logEggWhite);
  eggWhiteFolder.add(eggWhiteExposure.value, 'y', 0.8, 1.4, 0.01).name('蛋白最亮').onFinishChange(logEggWhite);
  // 鏡頭固定光（蛋白、蛋黃共用）：轉島嶼時蛋的明暗不變，亮度從這裡調
  eggWhiteFolder.add(eggViewLight.key, 'value', 0.5, 5, 0.05).name('蛋主光強度').onFinishChange(logEggWhite);
  eggWhiteFolder.add(eggViewLight.ambient, 'value', 0, 1, 0.01).name('蛋背光面亮度').onFinishChange(logEggWhite);
  eggWhiteFolder.add(eggViewLight.yolkKeyScale, 'value', 0.1, 1.5, 0.01).name('蛋黃主光倍率').onFinishChange(logEggWhite);
  eggWhiteFolder.add({ log: logEggWhite }, 'log').name('印出蛋白外觀 (console)');
  eggWhiteFolder.close();
}

if (puddingFolder) {
  const puddingControls = {
    add() {
      const created = addPudding();
      if (!created) return;
      bindPuddingPanel(created);
      refreshPuddingDragTargets();
    },
    remove() {
      if (!selectedPudding || puddings.length <= 1) return;
      const removed = selectedPudding;
      if (!removePudding(removed)) return;
      selectedPudding = null;
      clearPuddingPanelSliders();
      highlightPudding(null);
      refreshPuddingDragTargets();
    },
    log() {
      logPuddingPlacements();
    },
  };
  puddingFolder.add(puddingControls, 'add').name('新增布丁');
  puddingFolder.add(puddingControls, 'remove').name('移除選中布丁');
  puddingFolder.add(puddingControls, 'log').name('印出全部佈局 (console)');
  highlightPudding(null);
}

// 烤玉米（綠球上；拖曳選取後調整，可複製）——選取、編輯方式跟檸檬片一樣
// 已擺好（佈局寫在 grilledCornLayout.ts）：關閉編輯 → 不顯示面板、場景上不能點選或拖曳。
// 要再調整時改成 true：面板、點選、拖曳都會回來
const CORN_SCENE_EDIT = false;
const cornFolder = gui.addFolder('烤玉米');
if (!CORN_SCENE_EDIT) cornFolder.hide();
let selectedCorn: WorldGrilledCorn | null = null;

/**
 * 發光前每個材質原本的發光顏色、強度。取消選取時要還原：
 * 玉米的 applyVisuals 只會重設玉米粒、本體的材質，葉子等其他材質的發光不會被清掉，
 * 少了這個，換選另一根後前一根還在發光，越點越多根亮著
 */
const cornGlowSaved = new WeakMap<THREE.Material, { emissive: THREE.Color; intensity: number }>();

function forEachCornMaterial(corn: WorldGrilledCorn, fn: (material: THREE.MeshStandardMaterial) => void) {
  corn.object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if ('emissive' in material) fn(material as THREE.MeshStandardMaterial);
    }
  });
}

/** 選中的那根整根發光（用自己的顏色），跟檸檬片一樣一眼看得出選了哪根；其他根還原 */
function highlightCorn(entry: WorldGrilledCorn | null) {
  for (const corn of grilledCorns) {
    // 先還原上次發光前的值，再套一次外觀（玉米粒、本體的發光由外觀設定決定）
    forEachCornMaterial(corn, (m) => {
      const saved = cornGlowSaved.get(m);
      if (!saved) return;
      m.emissive.copy(saved.emissive);
      m.emissiveIntensity = saved.intensity;
      cornGlowSaved.delete(m);
    });
    corn.applyVisuals();
    if (corn !== entry) continue;
    forEachCornMaterial(corn, (m) => {
      cornGlowSaved.set(m, { emissive: m.emissive.clone(), intensity: m.emissiveIntensity });
      m.emissive.copy(m.color);
      m.emissiveIntensity = 0.35;
    });
  }
}

/**
 * 選中時玉米模型可能還沒載入完（剛開頁面、剛複製出來）：那時沒有 mesh 可以發光；
 * 載入完成時玉米會重新套一次外觀，也會把發光蓋掉。所以選中後每 0.25 秒檢查一次，
 * 模型出現了、但沒在發光，就再補一次，最多等 60 秒（剛開頁面時模型可能要等好一陣子才掛上）。
 */
let cornHighlightTimer = 0;
function ensureCornHighlight(entry: WorldGrilledCorn, tries = 240) {
  window.clearTimeout(cornHighlightTimer);
  if (selectedCorn !== entry || tries <= 0) return;
  let hasMesh = false;
  let glowing = false;
  entry.object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    hasMesh = true;
    const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    if (material && material.emissiveIntensity === 0.35) glowing = true;
  });
  if (hasMesh && !glowing) highlightCorn(entry);
  if (hasMesh && glowing) return;
  cornHighlightTimer = window.setTimeout(() => ensureCornHighlight(entry, tries - 1), 250);
}

const CORN_PANEL_ACTIONS = new Set(['add', 'remove', 'log']);

/** 清掉上一根的滑桿（按鈕保留）。滑桿都放在同一層、不用子資料夾：子資料夾不會被清掉，每換一根就多疊一個 */
function clearCornPanelSliders() {
  cornFolder.title('烤玉米');
  for (const controller of [...cornFolder.controllers]) {
    if (CORN_PANEL_ACTIONS.has(String(controller.property))) continue;
    controller.destroy();
  }
}

function bindCornPanel(entry: WorldGrilledCorn) {
  const alreadyShowing = entry === selectedCorn && cornFolder.controllers.length > CORN_PANEL_ACTIONS.size;
  selectedCorn = entry;
  highlightCorn(entry);
  ensureCornHighlight(entry);
  if (alreadyShowing) return;

  // 先清再設標題：反過來的話清除時會把標題改回「烤玉米」，看不出選了哪根
  clearCornPanelSliders();
  cornFolder.title(`烤玉米 · ${entry.label}`);

  const settings = entry.settings;
  const visual = entry.visualSettings;
  const apply = () => entry.apply();
  // 外觀改完要再套一次選中發光，不然調外觀時選中標示會消失
  const applyVisuals = () => {
    entry.applyVisuals();
    highlightCorn(entry);
  };

  cornFolder
    .add(settings, 'angleFromTopDegrees', 0, 90, 1)
    .name('離頂端 (°)')
    .onChange(apply)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(settings, 'azimuthDegrees', -180, 180, 1)
    .name('方位 (°)')
    .onChange(apply)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(settings, 'spinDegrees', -180, 180, 1)
    .name('自轉 (°)')
    .onChange(apply)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(settings, 'sink', -0.05, 0.08, 0.001)
    .name('下沉（負值上浮）')
    .onChange(apply)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(settings, 'placementScale', 0.05, 2, 0.01)
    .name('縮放')
    .onChange(apply)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(settings, 'modelSize', 0.03, 0.35, 0.005)
    .name('大小 (m)')
    .onChange(apply)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(visual, 'colorBoost', 0.7, 1.4, 0.01)
    .name('亮度')
    .onChange(applyVisuals)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(visual, 'emissiveIntensity', 0, 1.2, 0.01)
    .name('發光')
    .onChange(applyVisuals)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(visual, 'orangeBias', 0, 0.25, 0.005)
    .name('偏橘')
    .onChange(applyVisuals)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(visual, 'normalScale', 0.5, 2.5, 0.05)
    .name('顆粒立體')
    .onChange(applyVisuals)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(visual, 'steamDensity', 0, 1.8, 0.05)
    .name('熱氣濃度')
    .onChange(applyVisuals)
    .onFinishChange(logCornPlacements);
  cornFolder
    .addColor(visual, 'tintColor')
    .name('顏色')
    .onChange(applyVisuals)
    .onFinishChange(logCornPlacements);
  cornFolder
    .add(visual, 'tintMix', 0, 1, 0.01)
    .name('顏色強度')
    .onChange(applyVisuals)
    .onFinishChange(logCornPlacements);
}

function logCornPlacements() {
  if (grilledCorns.length === 0) return;
  const text = formatGrilledCornPlacementsForPaste(
    grilledCorns.map((c) => ({ id: c.id, settings: c.settings, visualSettings: c.visualSettings })),
  );
  console.log(text);
  return text;
}

{
  const cornControls = {
    add() {
      const created = addGrilledCorn(
        selectedCorn ? { ...selectedCorn.settings, ...selectedCorn.visualSettings } : undefined,
      );
      if (!created) return;
      bindCornPanel(created);
      applyFoodGroupVisibility();
    },
    remove() {
      if (!selectedCorn || grilledCorns.length === 0) return;
      if (!removeGrilledCorn(selectedCorn)) return;
      selectedCorn = null;
      clearCornPanelSliders();
      // 移除後自動選最後一根（跟檸檬片一樣），不用再去場景上點
      const next = grilledCorns[grilledCorns.length - 1];
      if (next) bindCornPanel(next);
      else highlightCorn(null);
      refreshPuddingDragTargets();
    },
    log() {
      logCornPlacements();
    },
  };
  cornFolder.add(cornControls, 'add').name('複製玉米');
  cornFolder.add(cornControls, 'remove').name('移除選中玉米');
  cornFolder.add(cornControls, 'log').name('印出全部佈局 (console)');
  // 關閉編輯時不要預先選第一根：選中會整根發光
  if (CORN_SCENE_EDIT && grilledCorns[0]) bindCornPanel(grilledCorns[0]);
}

// 魚排（綠球上；拖曳選取後調整，可複製）
const salmonFolder = salmonSteaks.length > 0 ? gui.addFolder('魚排') : null;
let selectedSalmon: WorldSalmonSteak | null = null;

function highlightSalmon(entry: WorldSalmonSteak | null) {
  for (const steak of salmonSteaks) {
    steak.applyVisuals();
    if (steak !== entry) continue;
    steak.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('emissive' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.emissive.copy(m.color);
        m.emissiveIntensity = 0.35;
      }
    });
  }
}

const SALMON_PANEL_ACTIONS = new Set(['add', 'remove', 'log']);

function clearSalmonPanelSliders() {
  if (!salmonFolder) return;
  salmonFolder.title('魚排');
  for (const controller of [...salmonFolder.controllers]) {
    if (SALMON_PANEL_ACTIONS.has(String(controller.property))) continue;
    controller.destroy();
  }
}

function bindSalmonPanel(entry: WorldSalmonSteak) {
  if (!salmonFolder) return;
  const alreadyShowing = entry === selectedSalmon && salmonFolder.controllers.length > SALMON_PANEL_ACTIONS.size;
  selectedSalmon = entry;
  highlightSalmon(entry);
  if (alreadyShowing) return;

  clearSalmonPanelSliders();
  salmonFolder.title(`魚排 · ${entry.label}`);

  const settings = entry.settings;
  const apply = () => entry.apply();
  const applyVisuals = () => {
    entry.applyVisuals();
    highlightSalmon(entry);
  };

  salmonFolder
    .add(settings, 'angleFromTopDegrees', 0, 90, 1)
    .name('離頂端 (°)')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'azimuthDegrees', -180, 180, 1)
    .name('方位 (°)')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'spinDegrees', -180, 180, 1)
    .name('自轉 (°)')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'tiltXDegrees', -180, 180, 1)
    .name('前傾 (°)')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'tiltZDegrees', -180, 180, 1)
    .name('側傾 (°)')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'sink', -0.6, 0.12, 0.001)
    .name('下沉（負值上浮）')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'placementScale', 0.15, 2.5, 0.01)
    .name('縮放')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'modelSize', 0.04, 0.4, 0.005)
    .name('大小 (m)')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'heightScale', 0.4, 3, 0.05)
    .name('增高')
    .onChange(apply)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'colorBoost', 0.6, 1.5, 0.01)
    .name('亮度')
    .onChange(applyVisuals)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .addColor(settings, 'tintColor')
    .name('顏色')
    .onChange(applyVisuals)
    .onFinishChange(logSalmonPlacements);
  salmonFolder
    .add(settings, 'tintMix', 0, 1, 0.01)
    .name('顏色強度')
    .onChange(applyVisuals)
    .onFinishChange(logSalmonPlacements);
}

function logSalmonPlacements() {
  if (salmonSteaks.length === 0) return;
  const text = formatSalmonSteakPlacementsForPaste(
    salmonSteaks.map((steak) => ({ id: steak.id, settings: steak.settings })),
  );
  console.log(text);
  return text;
}

if (salmonFolder) {
  const salmonControls = {
    add() {
      const created = addSalmonSteak(selectedSalmon ? { ...selectedSalmon.settings } : undefined);
      if (!created) return;
      bindSalmonPanel(created);
      applyFoodGroupVisibility();
    },
    remove() {
      if (!selectedSalmon || salmonSteaks.length <= 1) return;
      if (!removeSalmonSteak(selectedSalmon)) return;
      selectedSalmon = null;
      clearSalmonPanelSliders();
      const next = salmonSteaks[salmonSteaks.length - 1];
      if (next) bindSalmonPanel(next);
      else highlightSalmon(null);
      refreshPuddingDragTargets();
    },
    log() {
      logSalmonPlacements();
    },
  };
  salmonFolder.add(salmonControls, 'add').name('複製魚排');
  salmonFolder.add(salmonControls, 'remove').name('移除選中魚排');
  salmonFolder.add(salmonControls, 'log').name('印出全部佈局 (console)');
  if (salmonSteaks[0]) bindSalmonPanel(salmonSteaks[0]);
}

// 小豬（綠球上亂跑）
const pigFolder = pig ? gui.addFolder('小豬') : null;

function logPigSettings() {
  if (!pig) return;
  console.log(formatPigSettingsForPaste(pig.settings));
}

if (pigFolder && pig) {
  const apply = () => pig.apply();
  // 顏色只重畫貼圖，不呼叫 apply（apply 會讓小豬重生到鏡頭前）
  pigFolder.addColor(pig.settings, 'bodyColor').name('小豬顏色').onChange(() => pig.applyColor()).onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'modelSize', 0.05, 0.45, 0.005).name('大小 (m)').onChange(apply).onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'placementScale', 0.1, 2.5, 0.01).name('整體縮放').onChange(apply).onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'angleFromTopDegrees', 8, 88, 1).name('重生離頂端 (°)').onChange(apply).onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'azimuthDegrees', -180, 180, 1).name('重生方位 (°)').onChange(apply).onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'roamColatitudeMin', 5, 88, 1).name('跑動上界 (離頂端 °)').onChange(apply).onFinishChange(logPigSettings);
  pigFolder
    .add(pig.settings, 'roamColatitudeMax', 25, 75, 1)
    .name('跑動下界 (勿進醬汁區)')
    .onChange(apply)
    .onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'stayInViewHemisphere').name('偏好走向鏡頭').onChange(apply).onFinishChange(logPigSettings);
  pigFolder
    .add(pig.settings, 'viewHemisphereDotMin', 0, 0.45, 0.02)
    .name('重生可見餘量 (dot)')
    .onChange(apply)
    .onFinishChange(logPigSettings);
  pigFolder.add({ respawn: () => pig.apply() }, 'respawn').name('重生到鏡頭前');
  pigFolder.add(pig.settings, 'roamSpeedDegrees', 0.5, 60, 0.5).name('跑速 (°/s)').onChange(apply).onFinishChange(logPigSettings);
  pigFolder
    .add(pig.settings, 'turnDegreesPerSecond', 20, 360, 5)
    .name('轉向速度 (°/s)')
    .onFinishChange(logPigSettings);
  pigFolder
    .add(pig.settings, 'modelYawOffsetDegrees', -180, 180, 5)
    .name('鼻向校正 (°)')
    .onChange(apply)
    .onFinishChange(logPigSettings);
  pigFolder
    .add(pig.settings, 'obstacleMarginDegrees', 0.5, 12, 0.25)
    .name('避障加寬 (°)')
    .onChange(apply)
    .onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'wanderSeconds', 0.5, 12, 0.1).name('轉向間隔 (秒)').onChange(apply).onFinishChange(logPigSettings);
  pigFolder
    .add(pig.settings, 'ribbonMarginDegrees', 0, 15, 0.5)
    .name('離番茄醬餘量 (°)')
    .onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'lookAheadDegrees', 1, 20, 0.5).name('提前轉彎距離 (°)').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'pauseChance', 0, 1, 0.05).name('經過物件停下機率').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'pauseMinSeconds', 0.1, 5, 0.1).name('停下最短 (秒)').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'pauseMaxSeconds', 0.1, 6, 0.1).name('停下最長 (秒)').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'pauseNearDegrees', 0, 10, 0.5).name('算「經過」的距離 (°)').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'visitChance', 0, 1, 0.05).name('跑去看烤雞機率').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'visitWatchMinSeconds', 0.5, 15, 0.5).name('看烤雞最短 (秒)').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'visitWatchMaxSeconds', 0.5, 20, 0.5).name('看烤雞最長 (秒)').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'visitCooldownSeconds', 0, 120, 1).name('看完多久才會再去 (秒)').onFinishChange(logPigSettings);
  pigFolder.add({ visit: () => { if (!pig.visitNow()) console.warn('[pig] 篝火關閉、沒有烤雞，或位置去不了'); } }, 'visit').name('現在去看烤雞');
  // 跟「現在去看烤雞」放在一起，不用打開「溜滑梯冒險」子資料夾就能按
  if (pig.adventure) {
    const adventure = pig.adventure;
    pigFolder
      .add({ slide: () => { if (!adventure.startNow()) console.warn(`[pig] 現在去不了溜滑梯：${adventure.getLastFailReason()}`); } }, 'slide')
      .name('現在去溜滑梯');
  }
  pigFolder.add(pig.settings, 'smokeEnabled').name('走動冒煙').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'smokeRate', 0, 30, 0.5).name('煙量 (團/秒)').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'smokeSize', 0.2, 3, 0.05).name('煙團大小').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'smokeLifeSeconds', 0.2, 2.5, 0.05).name('煙存活 (秒)').onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'waddleStrength', 0, 0.35, 0.01).name('搖晃幅度').onChange(apply).onFinishChange(logPigSettings);
  pigFolder.add(pig.settings, 'sink', -0.15, 0.08, 0.001).name('下沉（負=浮起）').onChange(apply).onFinishChange(logPigSettings);
  pigFolder.add({ log: logPigSettings }, 'log').name('印出設定 (console)');

  // 頭上的烏雲：沒有／下雨／打雷／暴雨 隨機切換；「固定狀態」可以停在某一種方便調整
  // 溜滑梯冒險：走進龍兔的家大門 → 從三樓溜滑梯滑進水潭（濺水花、有機率噴出魚排，小豬有機率去撿）
  if (pig.adventure) {
    const adventure = pig.adventure;
    const a = adventure.settings;
    const logAdventure = () => console.log(formatPigAdventureSettingsForPaste(a));
    const adventureFolder = pigFolder.addFolder('溜滑梯冒險');
    adventureFolder.add(a, 'enabled').name('開啟').onFinishChange(logAdventure);
    adventureFolder.add(a, 'chance', 0, 1, 0.05).name('冷卻到時去的機率').onFinishChange(logAdventure);
    adventureFolder.add(a, 'cooldownMinSeconds', 5, 120, 1).name('冷卻最短 (秒)').onFinishChange(logAdventure);
    adventureFolder.add(a, 'cooldownMaxSeconds', 5, 180, 1).name('冷卻最長 (秒)').onFinishChange(logAdventure);
    adventureFolder.add(a, 'insideSeconds', 0.2, 5, 0.1).name('屋裡待幾秒').onFinishChange(logAdventure);
    adventureFolder.add(a, 'slideSpeed', 0.1, 1, 0.01).name('滑行速度').onFinishChange(logAdventure);
    adventureFolder.add(a, 'fishChance', 0, 1, 0.05).name('噴出魚排機率').onFinishChange(logAdventure);
    adventureFolder.add(a, 'fetchChance', 0, 1, 0.05).name('小豬去撿機率').onFinishChange(logAdventure);
    adventureFolder.add(a, 'fishLifetimeSeconds', 2, 60, 1).name('魚排至少留幾秒').onFinishChange(logAdventure);
    adventureFolder.add(a, 'fishSize', 0.02, 0.12, 0.005).name('魚排大小').onFinishChange(logAdventure);
    adventureFolder
      .add({ go: () => { if (!adventure.startNow()) console.warn(`[pig] 現在去不了溜滑梯：${adventure.getLastFailReason()}`); } }, 'go')
      .name('立刻去溜滑梯');
    adventureFolder
      .add({ walk: () => { if (!adventure.startWalk()) console.warn(`[pig] 現在去不了溜滑梯：${adventure.getLastFailReason()}`); } }, 'walk')
      .name('走去大門再溜（完整流程）');
    adventureFolder.add({ fish: () => adventure.testSplashFish() }, 'fish').name('測試：水潭噴魚排');
    adventureFolder.add({ log: logAdventure }, 'log').name('印出設定 (console)');
  }
  const cloudFolder = pigFolder.addFolder('頭上烏雲');
  const logCloud = () => console.log(formatPigCloudSettingsForPaste(pig.cloud));
  const cloudStatus = { state: pig.getCloudState() };
  cloudFolder.add(pig.cloud, 'enabled').name('啟用').onFinishChange(logCloud);
  cloudFolder
    .add(pig.cloud, 'forceState', PIG_CLOUD_STATES)
    .name('固定狀態')
    .onFinishChange(logCloud);
  cloudFolder.add(cloudStatus, 'state').name('目前狀態').disable().listen();
  // listen() 只會刷新顯示，值要自己更新
  setInterval(() => {
    cloudStatus.state = pig.getCloudState();
  }, 250);
  cloudFolder.add(pig.cloud, 'height', 0.4, 3, 0.05).name('烏雲高度 (身長倍)').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'size', 0.3, 2.5, 0.05).name('烏雲大小 (身長倍)').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'rotationDegrees', -180, 180, 1).name('烏雲旋轉 (°)').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'spinDegreesPerSecond', -180, 180, 5).name('烏雲自轉 (°/秒)').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'minSeconds', 1, 30, 0.5).name('狀態最短 (秒)').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'maxSeconds', 1, 40, 0.5).name('狀態最長 (秒)').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'weightNone', 0, 10, 0.5).name('權重：沒有').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'weightRain', 0, 10, 0.5).name('權重：下雨').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'weightThunder', 0, 10, 0.5).name('權重：打雷').onFinishChange(logCloud);
  cloudFolder.add(pig.cloud, 'weightStorm', 0, 10, 0.5).name('權重：暴雨').onFinishChange(logCloud);
}

// 畫面風格統一：全場色調統一（陰影偏淡紫、整體往粉色靠）＋寫實貼圖降對比
// 模型是陸續載入的，每 0.5 秒掃一次新材質；已處理過的不會重複處理
const styleGrade = createStyleGrade({ root: scene });
setInterval(() => styleGrade.scan(), 500);
{
  const gradeFolder = gui.addFolder('畫面風格統一');
  const s = styleGrade.settings;
  const apply = () => styleGrade.apply();
  const log = () => console.log(formatStyleGradeSettingsForPaste(s));
  const status = { text: '' };
  gradeFolder.add(s, 'enabled').name('啟用（取消 = 看原貌）').onChange(apply).onFinishChange(log);
  gradeFolder.add(s, 'tintAmount', 0, 0.5, 0.005).name('整體色調強度').onChange(apply).onFinishChange(log);
  gradeFolder.addColor(s, 'tintColor').name('整體色調顏色').onChange(apply).onFinishChange(log);
  gradeFolder.add(s, 'shadowLift', 0, 0.6, 0.005).name('陰影抬亮').onChange(apply).onFinishChange(log);
  gradeFolder.addColor(s, 'shadowColor').name('陰影顏色').onChange(apply).onFinishChange(log);
  gradeFolder.add(s, 'textureSaturation', 0, 1.5, 0.01).name('寫實貼圖飽和度').onChange(apply).onFinishChange(log);
  gradeFolder.add(s, 'textureContrast', 0, 1.5, 0.01).name('寫實貼圖對比').onChange(apply).onFinishChange(log);
  gradeFolder.add(s, 'texturePivot', 0, 1, 0.01).name('降對比中間亮度').onChange(apply).onFinishChange(log);
  gradeFolder.add(status, 'text').name('已調色材質').disable().listen();
  setInterval(() => {
    status.text = `${styleGrade.stats.graded}（寫實貼圖 ${styleGrade.stats.softened}）`;
  }, 1000);
  gradeFolder.add({ log }, 'log').name('印出設定 (console)');
}

/** 小徑編輯器（編輯中時，點綠球是「加路點」，不應該順便取消房子的選取） */
let groundPathEditorState: { editing: boolean } | null = null;

// 綠球細節：色彩斑塊、番茄醬陰影帶、草叢、泥土小徑、小道具
if (groundDetail) {
  const detailFolder = gui.addFolder('綠球細節');
  const s = groundDetail.settings;
  const apply = () => groundDetail.apply();
  const log = () => console.log(formatGroundDetailSettingsForPaste(s));
  // 數量、寬度這類會影響「撒在哪」的參數，改完要重新撒
  const rescatter = () => {
    groundDetail.rescatter();
    log();
  };

  const patch = detailFolder.addFolder('1. 色彩斑塊與漸層');
  patch.add(s, 'patchEnabled').name('啟用').onChange(apply).onFinishChange(log);
  patch.add(s, 'patchAmount', 0, 1, 0.01).name('斑塊強度').onChange(apply).onFinishChange(log);
  patch.add(s, 'patchScale', 0.5, 10, 0.1).name('斑塊細碎度').onChange(apply).onFinishChange(log);
  patch.addColor(s, 'patchLight').name('亮斑顏色').onChange(apply).onFinishChange(log);
  patch.addColor(s, 'patchDark').name('暗斑顏色').onChange(apply).onFinishChange(log);
  patch.add(s, 'gradientAmount', 0, 1, 0.01).name('上下漸層強度').onChange(apply).onFinishChange(log);
  patch.addColor(s, 'topTint').name('頂端色').onChange(apply).onFinishChange(log);
  patch.addColor(s, 'bottomTint').name('下緣色').onChange(apply).onFinishChange(log);

  const ao = detailFolder.addFolder('2. 番茄醬陰影帶');
  ao.add(s, 'aoEnabled').name('啟用').onChange(apply).onFinishChange(log);
  ao.add(s, 'aoAmount', 0, 1, 0.01).name('深淺').onChange(apply).onFinishChange(log);
  ao.add(s, 'aoWidth', 0.005, 0.3, 0.005).name('寬度').onChange(apply).onFinishChange(log);
  ao.addColor(s, 'aoColor').name('陰影色').onChange(apply).onFinishChange(log);

  const tuft = detailFolder.addFolder('3. 草叢');
  tuft.add(s, 'tuftsEnabled').name('顯示').onChange(apply).onFinishChange(log);
  tuft.add(s, 'tuftCount', 0, 6000, 50).name('數量').onFinishChange(rescatter);
  tuft.add(s, 'tuftHeight', 0.3, 2.5, 0.05).name('高度').onChange(apply).onFinishChange(log);
  tuft.add(s, 'windStrength', 0, 4, 0.05).name('風力').onChange(apply).onFinishChange(log);
  tuft.add(s, 'windSpeed', 0, 4, 0.05).name('風速').onChange(apply).onFinishChange(log);

  const path = detailFolder.addFolder('4. 泥土小徑');
  path.add(s, 'pathEnabled').name('顯示').onChange(apply).onFinishChange(log);
  path.add(s, 'pathWidthDegrees', 0.3, 4, 0.05).name('寬度 (°)').onChange(apply).onFinishChange(rescatter);
  path.add(s, 'pathCurve', 0, 3, 0.05).name('彎曲程度').onFinishChange(rescatter);
  path.addColor(s, 'pathColor').name('土色').onChange(apply).onFinishChange(log);
  path.addColor(s, 'pathEdgeColor').name('路邊色').onChange(apply).onFinishChange(log);

  // 自訂小徑：在綠球上直接點、拖、右鍵刪
  // 要在 enableSurfaceDrag 之前註冊：都用 capture 監聽按下，先註冊的先收到（拖路點時才不會拖到房子）
  const logPaths = () =>
    console.log(formatGroundPathsForPaste(groundDetail.customPaths.map((p) => p.map(groundDetail.anglesFromNormal))));
  const pathEditor = groundSurface
    ? enableGroundPathEditor({
        ground,
        ballMesh: groundSurface,
        groundRadius,
        camera,
        domElement: renderer.domElement,
        controls,
        detail: groundDetail,
        onChange: logPaths,
      })
    : null;
  groundPathEditorState = pathEditor?.state ?? null;
  const pathEdit = {
    editing: false,
    get active() {
      if (!pathEditor) return '-';
      const count = groundDetail.customPaths.length;
      return count === 0 ? '（還沒有路）' : `第 ${pathEditor.state.activePath + 1} 條／共 ${count} 條`;
    },
  };
  const refreshPathPanel = () => path.controllersRecursive().forEach((c) => c.updateDisplay());
  path
    .add(s, 'pathMode', GROUND_PATH_MODES)
    .name('路線來源 (auto/custom)')
    .onChange(() => {
      groundDetail.refreshPaths();
      groundDetail.rescatter();
    })
    .onFinishChange(log);
  if (pathEditor) {
    path
      .add(pathEdit, 'editing')
      .name('編輯小徑（點綠球加點／拖點／右鍵刪點）')
      .onChange((on: boolean) => {
        if (on && s.pathMode !== 'custom') {
          // 第一次編輯：沒有自訂路線就先從目前的自動路線複製，直接在上面修改
          if (groundDetail.customPaths.length === 0) groundDetail.copyAutoToCustom();
          s.pathMode = 'custom';
          groundDetail.refreshPaths();
        }
        groundDetail.forcePathVisible(on);
        pathEditor.setEditing(on);
        refreshPathPanel();
      });
    path.add(pathEdit, 'active').name('目前編輯').disable().listen();
    path.add({ add: () => { pathEditor.addPath(); refreshPathPanel(); } }, 'add').name('新增一條路（接著點綠球）');
    path.add({ del: () => { pathEditor.deleteActivePath(); refreshPathPanel(); } }, 'del').name('刪除目前這條路');
    path
      .add(
        {
          copy: () => {
            groundDetail.copyAutoToCustom();
            s.pathMode = 'custom';
            groundDetail.refreshPaths();
            pathEditor.rebuildHandles();
            groundDetail.rescatter();
            refreshPathPanel();
            logPaths();
          },
        },
        'copy',
      )
      .name('從自動路線複製（覆蓋自訂）');
    path.add({ clear: () => { pathEditor.clearAll(); refreshPathPanel(); } }, 'clear').name('清除全部自訂路');
    path.add({ logPaths }, 'logPaths').name('印出小徑佈局 (console)');
  }

  const props = detailFolder.addFolder('5. 小道具');
  props.add(s, 'propsEnabled').name('顯示').onChange(apply).onFinishChange(log);
  props.add(s, 'rockCount', 0, 200, 1).name('小石頭數量').onFinishChange(rescatter);
  props.add(s, 'mushroomCount', 0, 200, 1).name('蘑菇數量').onFinishChange(rescatter);
  props.add(s, 'bushCount', 0, 200, 1).name('小樹叢數量').onFinishChange(rescatter);
  props.add(s, 'propScale', 0.3, 3, 0.05).name('大小').onFinishChange(rescatter);

  detailFolder.add({ rescatter }, 'rescatter').name('重新撒（房子移動後用）');
  detailFolder.add({ log }, 'log').name('印出設定 (console)');
}

// 浮空小星球的柔邊圖層：在天空背景之後、主場景之前畫（見 render()）
const islandSoftPass = createSoftLayerPass({ renderer, scene, camera, layer: FLOATING_ISLAND_LAYER });
// 前景模糊（移軸）：畫面底部那條（主要是靠近鏡頭的番茄醬）往下越來越糊
const foregroundBlur = createForegroundBlur({ renderer });
{
  const fb = foregroundBlur.settings;
  const folder = gui.addFolder('前景模糊（移軸）');
  const log = () => console.log(formatForegroundBlurSettingsForPaste(fb));
  folder.add(fb, 'enabled').name('啟用').onFinishChange(log);
  folder.add(fb, 'band', 0, 0.8, 0.01).name('模糊範圍（底部往上）').onFinishChange(log);
  folder.add(fb, 'feather', 0.05, 1, 0.01).name('過渡柔和度').onFinishChange(log);
  folder.add(fb, 'blurRadius', 0.5, 8, 0.1).name('模糊程度').onFinishChange(log);
  folder.add(fb, 'strength', 0, 1, 0.01).name('最底部強度').onFinishChange(log);
}
let lastRenderTime: number | null = null;

// 浮空小星球（右後方天空，位置跟著鏡頭）
{
  const islandFolder = gui.addFolder('浮空小星球');
  const s = floatingIsland.settings;
  const apply = () => floatingIsland.apply();
  const log = () => console.log(formatFloatingIslandSettingsForPaste(s));
  islandFolder.add(s, 'enabled').name('顯示').onChange(apply).onFinishChange(log);
  islandFolder.add(s, 'camX', -6, 6, 0.01).name('畫面位置：左右').onChange(apply).onFinishChange(log);
  islandFolder.add(s, 'camY', -4, 8, 0.01).name('畫面位置：上下').onChange(apply).onFinishChange(log);
  islandFolder.add(s, 'camZ', -40, -4, 0.1).name('距離（越負越遠）').onChange(apply).onFinishChange(log);
  islandFolder.add(s, 'scale', 0.02, 1.5, 0.005).name('大小').onChange(apply).onFinishChange(log);
  islandFolder.add(s, 'spinDegrees', -180, 180, 1).name('轉向 (°)').onChange(apply).onFinishChange(log);
  islandFolder.add(s, 'tiltDegrees', -30, 60, 1).name('前傾 (°)').onChange(apply).onFinishChange(log);
  islandFolder.add(s, 'autoSpinDegreesPerSecond', -30, 30, 0.5).name('自轉 (°/秒)').onFinishChange(log);
  islandFolder.add(s, 'bobAmount', 0, 3, 0.05).name('漂浮幅度').onFinishChange(log);
  islandFolder.add(s, 'swingSpeed', 0, 3, 0.05).name('鞦韆擺盪速度').onFinishChange(log);
  islandFolder.add(s, 'hazeAmount', 0, 1, 0.01).name('遠景霧化（朦朧感）').onChange(apply).onFinishChange(log);
  islandFolder.addColor(s, 'hazeColor').name('霧的顏色').onChange(apply).onFinishChange(log);
  islandFolder.add(s, 'mistAmount', 0, 1.5, 0.01).name('霧氣濃度').onFinishChange(log);
  islandFolder.add(s, 'mistSize', 0.2, 3, 0.05).name('霧氣大小').onFinishChange(log);
  islandFolder.add(s, 'mistSpeed', 0, 4, 0.05).name('霧氣飄動速度').onFinishChange(log);
  islandFolder.add({ log }, 'log').name('印出設定 (console)');

  // 邊緣高斯模糊：島單獨畫成一張圖層、模糊輪廓後再貼回畫面
  const blurFolder = islandFolder.addFolder('邊緣高斯模糊');
  const b = islandSoftPass.settings;
  const logBlur = () => console.log(formatSoftLayerSettingsForPaste(b));
  blurFolder.add(b, 'enabled').name('啟用').onFinishChange(logBlur);
  blurFolder.add(b, 'blurRadius', 0, 8, 0.1).name('模糊半徑').onFinishChange(logBlur);
  blurFolder.add(b, 'wholeBlur', 0, 1, 0.01).name('整體也模糊（0 = 只糊邊緣）').onFinishChange(logBlur);

  // 直接在畫面上按住小星球拖曳，就能移動它的位置（面板的左右／上下會同步更新）
  // 要在 enableSurfaceDrag 之前註冊：兩個都用 capture 監聽按下，先註冊的先收到
  enableCameraPlaneDrag({
    object: floatingIsland.object,
    position: s,
    camera,
    domElement: renderer.domElement,
    controls,
    onDrag: () => {
      apply();
      islandFolder.controllersRecursive().forEach((controller) => controller.updateDisplay());
    },
    onDragEnd: log,
  });
}

// 篝火（綠球上；可直接拖曳換位置）
// 香菇屋（mainHall）大門大小
{
  const door = mainHallDoor.settings;
  const folder = gui.addFolder('香菇屋大門（mainHall）');
  const log = () =>
    console.log(
      `// 貼回 src/world/objects/obj.ts 的 MAIN_HALL_DOOR_DEFAULT\n` +
        `export const MAIN_HALL_DOOR_DEFAULT: MainHallDoorSettings = { scale: ${door.scale.toFixed(2)}, width: ${door.width.toFixed(2)}, height: ${door.height.toFixed(2)} };`,
    );
  folder.add(door, 'scale', 0.4, 2, 0.01).name('門整體大小').onChange(mainHallDoor.apply).onFinishChange(log);
  folder.add(door, 'width', 0.5, 2, 0.01).name('門寬').onChange(mainHallDoor.apply).onFinishChange(log);
  folder.add(door, 'height', 0.5, 2, 0.01).name('門高').onChange(mainHallDoor.apply).onFinishChange(log);
  folder.add({ log }, 'log').name('印出設定');
}

// projectRoom 的香菇屋風格（參考 mainHall；關掉 = 原本的配色）
gui
  .addFolder('projectRoom 香菇屋風格')
  .add(projectRoomStyle.settings, 'enabled')
  .name('套用香菇屋風格')
  .onChange(projectRoomStyle.apply);

// 街角小店「Happy Fat」（綠球上；半弧面屋頂的香菇屋風格）
const happyFatFolder = happyFatShop ? gui.addFolder('Happy Fat 小店') : null;
function logHappyFat() {
  if (happyFatShop) console.log(formatHappyFatShopSettingsForPaste(happyFatShop.settings));
}
if (happyFatFolder && happyFatShop) {
  const h = happyFatShop.settings;
  const apply = () => happyFatShop.apply();
  happyFatFolder.add(h, 'enabled').name('顯示').onChange(apply).onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'size', 0.05, 0.6, 0.005).name('整體大小').onChange(apply).onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'depth', 0.5, 3, 0.05).name('建築厚度（前後）').onChange(apply).onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'angleFromTopDegrees', 0, 88, 1).name('離頂端 (°)').onChange(apply).onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'azimuthDegrees', -180, 180, 1).name('方位 (°)').onChange(apply).onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'spinDegrees', -180, 180, 1).name('自身旋轉 (°)').onChange(apply).onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'sink', -0.05, 0.12, 0.001).name('下沉（負=浮起）').onChange(apply).onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'smokeEnabled').name('煙囪冒煙').onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'smokeOpacity', 0, 1, 0.05).name('煙濃度').onFinishChange(logHappyFat);
  happyFatFolder.add(h, 'smokeRise', 0.3, 3, 0.05).name('煙飄高度').onFinishChange(logHappyFat);
  const happyFatColorFolder = happyFatFolder.addFolder('顏色');
  const colorNames: [keyof typeof h.colors, string][] = [
    ['groundWall', '一樓磚牆'],
    ['upperWall', '二樓牆'],
    ['cornice', '腰線'],
    ['roof', '屋頂'],
    ['chimney', '煙囪'],
  ];
  for (const [key, label] of colorNames) {
    happyFatColorFolder.addColor(h.colors, key).name(label).onChange(apply).onFinishChange(logHappyFat);
  }
  happyFatColorFolder
    .add(
      {
        reset: () => {
          Object.assign(h.colors, HAPPY_FAT_SHOP_DEFAULT.colors);
          happyFatColorFolder.controllers.forEach((controller) => controller.updateDisplay());
          apply();
          logHappyFat();
        },
      },
      'reset',
    )
    .name('還原預設顏色');
  happyFatFolder.add({ log: logHappyFat }, 'log').name('印出設定');
}

// 寶箱（綠球上；裝滿漢堡、金色閃光）
// 小水潭（綠球上；拖曳或改大小後只更新水潭範圍的草，其他地方不動）
const pondFolder = pond ? gui.addFolder('小水潭') : null;
function logPond() {
  if (pond) console.log(formatPondSettingsForPaste(pond.settings));
}
/** 只更新水潭範圍的遮罩，不重新撒：整顆球其他地方的草、小道具佈局保持不變 */
function rescatterAroundPond() {
  groundDetail?.refreshMasks();
}
if (pondFolder && pond) {
  const p = pond.settings;
  const apply = () => pond.apply();
  const applyAndRescatter = () => {
    apply();
    rescatterAroundPond();
    logPond();
  };
  pondFolder.add(p, 'enabled').name('顯示').onChange(apply).onFinishChange(applyAndRescatter);
  pondFolder.add(p, 'size', 0.03, 0.2, 0.005).name('大小（半徑）').onChange(apply).onFinishChange(applyAndRescatter);
  pondFolder.add(p, 'angleFromTopDegrees', 0, 88, 1).name('離頂端 (°)').onChange(apply).onFinishChange(applyAndRescatter);
  pondFolder.add(p, 'azimuthDegrees', -180, 180, 1).name('方位 (°)').onChange(apply).onFinishChange(applyAndRescatter);
  pondFolder.add(p, 'spinDegrees', -180, 180, 1).name('自身旋轉 (°)').onChange(apply).onFinishChange(logPond);
  pondFolder.add(p, 'sink', -0.01, 0.02, 0.0005).name('下沉（負=浮起）').onChange(apply).onFinishChange(logPond);
  pondFolder.addColor(p, 'waterDeep').name('深處顏色').onChange(apply).onFinishChange(logPond);
  pondFolder.addColor(p, 'waterShallow').name('岸邊顏色').onChange(apply).onFinishChange(logPond);
  pondFolder.add(p, 'ripple', 0, 2, 0.05).name('漣漪').onChange(apply).onFinishChange(logPond);
  pondFolder.add(p, 'lilyPads').name('荷葉').onChange(apply).onFinishChange(logPond);
  pondFolder.add(p, 'reeds').name('香蒲').onChange(apply).onFinishChange(logPond);
  pondFolder.add({ log: logPond }, 'log').name('印出設定');
}

// 龍兔的家三樓 → 水潭的溜滑梯（終點跟著水潭走）
const slideFolder = gui.addFolder('溜滑梯（龍兔的家 → 水潭）');
function logSlide() {
  console.log(formatMainHallSlideSettingsForPaste(mainHallSlide.settings));
}
{
  const sl = mainHallSlide.settings;
  const apply = () => mainHallSlide.apply();
  // 放開滑桿時：出口高度、平台寬度、洞高可能被自動修正（頂到菇傘、比滑道還窄），重新顯示實際的值再印出
  const finish = () => {
    mainHallSlide.apply();
    slideFolder.controllersRecursive().forEach((controller) => controller.updateDisplay());
    logSlide();
  };
  slideFolder.add(sl, 'enabled').name('顯示').onChange(apply).onFinishChange(finish);
  // 上限 7.2：實際能多高由程式量菇傘底面決定，超過會自動降到最高可行高度
  slideFolder.add(sl, 'startHeight', 4.5, 7.2, 0.05).name('出口高度（模型 y）').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'exitAngleDegrees', -120, 120, 1).name('出口繞房子 (°)').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'platformLength', 0.3, 4, 0.05).name('頂端平台長度（木平台）').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'platformWidth', 0.1, 5, 0.05).name('頂端平台寬度（木平台）').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'doorWidth', 0.3, 2.5, 0.05).name('平台洞寬').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'doorHeight', 0.3, 2, 0.05).name('平台洞高').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'chuteFlatLength', 0.1, 5, 0.05).name('滑道平台長度（平段）').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'heightArc', -1, 1, 0.05).name('側面弧度（+凹 / −鼓）').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'heightSmooth', 0, 1, 0.05).name('側面平滑（兩端緩衝）').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'curve', -0.5, 0.5, 0.01).name('側彎').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'width', 0.4, 1.6, 0.05).name('寬度').onChange(apply).onFinishChange(finish);
  slideFolder.add(sl, 'endInset', 0, 0.8, 0.01).name('終點伸進水潭').onChange(apply).onFinishChange(finish);
  slideFolder.addColor(sl, 'chuteColor').name('滑道顏色').onChange(apply).onFinishChange(finish);
  slideFolder.addColor(sl, 'supportColor').name('平台欄杆顏色').onChange(apply).onFinishChange(finish);
  slideFolder.add({ log: logSlide }, 'log').name('印出設定');
}

const treasureFolder = treasureChest ? gui.addFolder('寶箱') : null;
function logTreasure() {
  if (treasureChest) console.log(formatTreasureChestSettingsForPaste(treasureChest.settings));
}
if (treasureFolder && treasureChest) {
  const t = treasureChest.settings;
  const apply = () => treasureChest.apply();
  treasureFolder.add(t, 'enabled').name('顯示').onChange(apply).onFinishChange(logTreasure);
  treasureFolder.add(t, 'burgerCount', 0, 13, 1).name('漢堡數量').onChange(apply).onFinishChange(logTreasure);
  treasureFolder.add(t, 'burgerScale', 0.5, 1.6, 0.05).name('漢堡大小').onChange(apply).onFinishChange(logTreasure);
  treasureFolder.add(t, 'sparkle').name('金色閃光').onFinishChange(logTreasure);
  treasureFolder.add(t, 'size', 0.05, 0.4, 0.005).name('整體大小').onChange(apply).onFinishChange(logTreasure);
  treasureFolder.add(t, 'angleFromTopDegrees', 0, 88, 1).name('離頂端 (°)').onChange(apply).onFinishChange(logTreasure);
  treasureFolder.add(t, 'azimuthDegrees', -180, 180, 1).name('方位 (°)').onChange(apply).onFinishChange(logTreasure);
  treasureFolder.add(t, 'spinDegrees', -180, 180, 1).name('自身旋轉 (°)').onChange(apply).onFinishChange(logTreasure);
  treasureFolder.add(t, 'sink', -0.03, 0.03, 0.001).name('下沉（負=浮起）').onChange(apply).onFinishChange(logTreasure);
  treasureFolder.add({ log: logTreasure }, 'log').name('印出設定');
}

// 香菇（綠球上；可複製多顆，點選或拖曳哪顆，面板就調哪顆）
const shiitakeFolder = gui.addFolder('香菇');
let selectedShiitake: WorldShiitake | null = null;
const SHIITAKE_PANEL_ACTIONS = new Set(['add', 'remove', 'log']);

function logShiitakePlacements() {
  if (shiitakes.length === 0) return;
  console.log(formatShiitakePlacementsForPaste(shiitakes.map((item) => ({ id: item.id, settings: item.settings }))));
}

function clearShiitakePanelSliders() {
  shiitakeFolder.title('香菇');
  for (const controller of [...shiitakeFolder.controllers]) {
    if (SHIITAKE_PANEL_ACTIONS.has(String(controller.property))) continue;
    controller.destroy();
  }
}

/** 面板改成調 entry 這一顆：先拆掉舊的滑桿，再為這顆重建（滑桿綁的是各自的 settings 物件） */
function bindShiitakePanel(entry: WorldShiitake) {
  const alreadyShowing = entry === selectedShiitake && shiitakeFolder.controllers.length > SHIITAKE_PANEL_ACTIONS.size;
  for (const item of shiitakes) item.setHighlight(item === entry);
  selectedShiitake = entry;
  if (alreadyShowing) return;
  clearShiitakePanelSliders();
  shiitakeFolder.title(`香菇 · ${entry.label}`);
  const settings = entry.settings;
  const apply = () => entry.apply();
  const log = logShiitakePlacements;
  shiitakeFolder.add(settings, 'enabled').name('顯示').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'capScale', 0.5, 6, 0.05).name('菇傘大小').onChange(apply).onFinishChange(log);
  shiitakeFolder.addColor(settings, 'capColor').name('菇傘顏色').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'stemHeight', 0.2, 8, 0.05).name('菇柄高度').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'capThickness', 0.3, 2, 0.05).name('菇傘厚度').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'size', 0.02, 0.25, 0.005).name('整體大小').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'angleFromTopDegrees', 0, 88, 1).name('離頂端 (°)').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'azimuthDegrees', -180, 180, 1).name('方位 (°)').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'spinDegrees', -180, 180, 1).name('自身旋轉 (°)').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'tiltDegrees', -45, 45, 1).name('傾斜 (°)').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'sink', -0.03, 0.03, 0.001).name('下沉（負=浮起）').onChange(apply).onFinishChange(log);
  shiitakeFolder.add(settings, 'swayDegrees', 0, 15, 0.5).name('晃動幅度 (°)').onFinishChange(log);
  shiitakeFolder.add(settings, 'swaySpeed', 0, 4, 0.05).name('晃動速度').onFinishChange(log);
}

const shiitakeControls = {
  add() {
    // 複製目前選中的那顆（大小、菇傘、菇柄都一樣），放在它旁邊
    const created = addShiitake(selectedShiitake ? { ...selectedShiitake.settings } : undefined);
    if (!created) return;
    bindShiitakePanel(created);
    refreshPuddingDragTargets();
    logShiitakePlacements();
  },
  remove() {
    if (!selectedShiitake) return;
    if (!removeShiitake(selectedShiitake)) return;
    selectedShiitake = null;
    clearShiitakePanelSliders();
    const next = shiitakes[shiitakes.length - 1];
    if (next) bindShiitakePanel(next);
    refreshPuddingDragTargets();
    logShiitakePlacements();
  },
  log() {
    logShiitakePlacements();
  },
};
shiitakeFolder.add(shiitakeControls, 'add').name('複製香菇');
shiitakeFolder.add(shiitakeControls, 'remove').name('移除選中香菇');
shiitakeFolder.add(shiitakeControls, 'log').name('印出全部擺設 (console)');
if (shiitakes[0]) bindShiitakePanel(shiitakes[0]);

const campfireFolder = campfire ? gui.addFolder('篝火') : null;
function logCampfire() {
  if (!campfire) return;
  console.log(formatCampfireSettingsForPaste(campfire.settings));
}
if (campfireFolder && campfire) {
  const apply = () => campfire.apply();
  campfireFolder.add(campfire.settings, 'enabled').name('顯示').onChange(apply).onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'angleFromTopDegrees', 0, 88, 1).name('離頂端 (°)').onChange(apply).onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'azimuthDegrees', -180, 180, 1).name('方位 (°)').onChange(apply).onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'spinDegrees', -180, 180, 1).name('自身旋轉 (°)').onChange(apply).onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'size', 0.03, 0.3, 0.005).name('大小 (直徑)').onChange(apply).onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'sink', -0.05, 0.05, 0.001).name('下沉（負=浮起）').onChange(apply).onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'flameHeight', 0.2, 2.5, 0.05).name('火焰高度').onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'flameSpeed', 0, 3, 0.05).name('火焰跳動速度').onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'sparkRate', 0, 30, 0.5).name('火星量 (顆/秒)').onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'smokeEnabled').name('冒煙').onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'lightIntensity', 0, 0.5, 0.005).name('火光亮度').onFinishChange(logCampfire);
  campfireFolder.add(campfire.settings, 'lightRange', 1, 15, 0.5).name('火光範圍 (直徑倍)').onChange(apply).onFinishChange(logCampfire);
  campfireFolder.addColor(campfire.settings, 'lightColor').name('火光顏色').onChange(apply).onFinishChange(logCampfire);
  const chickenFolder = campfireFolder.addFolder('火上烤雞');
  chickenFolder.add(campfire.settings, 'chickenEnabled').name('顯示').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'chickenSpinAxis', CAMPFIRE_CHICKEN_SPIN_AXES).name('轉法 (spit=烤肉架)').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'chickenSpinDegreesPerSecond', -180, 180, 1).name('轉速 (°/秒)').onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'chickenSize', 0.1, 1.5, 0.01).name('大小 (直徑倍)').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'chickenHeight', 0.3, 2, 0.01).name('高度 (直徑倍)').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'rackOffsetX', -1, 1, 0.01).name('烤架位置：左右').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'rackOffsetZ', -1, 1, 0.01).name('烤架位置：前後').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'rackYawDegrees', -180, 180, 1).name('烤架方向 (°)').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'rackHalfWidth', 0.15, 1.2, 0.01).name('烤架寬度 (半寬)').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'chickenYawDegrees', -180, 180, 1).name('模型擺正：水平 (°)').onChange(apply).onFinishChange(logCampfire);
  chickenFolder.add(campfire.settings, 'chickenPitchDegrees', -180, 180, 1).name('模型擺正：俯仰 (°)').onChange(apply).onFinishChange(logCampfire);
  campfireFolder.add({ log: logCampfire }, 'log').name('印出設定 (console)');
}

// 檸檬片（綠球上；拖曳選取後調整，可複製）
const lemonFolder = gui.addFolder('檸檬片');
let selectedLemon: WorldLemonSlice | null = null;

function highlightLemon(entry: WorldLemonSlice | null) {
  for (const slice of lemonSlices) {
    slice.applyVisuals();
    if (slice !== entry) continue;
    slice.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('emissive' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.emissive.copy(m.color);
        m.emissiveIntensity = 0.35;
      }
    });
  }
}

const LEMON_PANEL_ACTIONS = new Set(['add', 'remove', 'log']);

function clearLemonPanelSliders() {
  if (!lemonFolder) return;
  lemonFolder.title('檸檬片');
  for (const controller of [...lemonFolder.controllers]) {
    if (LEMON_PANEL_ACTIONS.has(String(controller.property))) continue;
    controller.destroy();
  }
}

function bindLemonPanel(entry: WorldLemonSlice) {
  if (!lemonFolder) return;
  const alreadyShowing = entry === selectedLemon && lemonFolder.controllers.length > LEMON_PANEL_ACTIONS.size;
  selectedLemon = entry;
  highlightLemon(entry);
  if (alreadyShowing) return;

  clearLemonPanelSliders();
  lemonFolder.title(`檸檬片 · ${entry.label}`);

  const settings = entry.settings;
  const apply = () => entry.apply();
  const applyVisuals = () => {
    entry.applyVisuals();
    highlightLemon(entry);
  };

  lemonFolder
    .add(settings, 'angleFromTopDegrees', 0, 90, 1)
    .name('離頂端 (°)')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'azimuthDegrees', -180, 180, 1)
    .name('方位 (°)')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'spinDegrees', -180, 180, 1)
    .name('自轉 (°)')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'tiltXDegrees', -180, 180, 1)
    .name('前傾 (°)')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'tiltZDegrees', -180, 180, 1)
    .name('側傾 (°)')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'sink', -0.6, 0.12, 0.001)
    .name('下沉（負值上浮）')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'placementScale', 0.15, 2.5, 0.01)
    .name('縮放')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'modelSize', 0.04, 0.45, 0.005)
    .name('大小 (m)')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'heightScale', 0.4, 3, 0.05)
    .name('增高')
    .onChange(apply)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'colorBoost', 0.6, 1.5, 0.01)
    .name('亮度')
    .onChange(applyVisuals)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .addColor(settings, 'tintColor')
    .name('顏色')
    .onChange(applyVisuals)
    .onFinishChange(logLemonPlacements);
  lemonFolder
    .add(settings, 'tintMix', 0, 1, 0.01)
    .name('顏色強度')
    .onChange(applyVisuals)
    .onFinishChange(logLemonPlacements);
}

function logLemonPlacements() {
  if (lemonSlices.length === 0) return;
  const text = formatLemonSlicePlacementsForPaste(
    lemonSlices.map((slice) => ({ id: slice.id, settings: slice.settings })),
  );
  console.log(text);
  return text;
}

if (lemonFolder) {
  const lemonControls = {
    add() {
      const created = addLemonSlice(selectedLemon ? { ...selectedLemon.settings } : undefined);
      if (!created) return;
      bindLemonPanel(created);
      applyFoodGroupVisibility();
    },
    remove() {
      if (!selectedLemon || lemonSlices.length === 0) return;
      if (!removeLemonSlice(selectedLemon)) return;
      selectedLemon = null;
      clearLemonPanelSliders();
      const next = lemonSlices[lemonSlices.length - 1];
      if (next) bindLemonPanel(next);
      else highlightLemon(null);
      refreshPuddingDragTargets();
    },
    log() {
      logLemonPlacements();
    },
  };
  lemonFolder.add(lemonControls, 'add').name('複製檸檬片');
  lemonFolder.add(lemonControls, 'remove').name('移除選中檸檬片');
  lemonFolder.add(lemonControls, 'log').name('印出全部佈局 (console)');
  if (lemonSlices[0]) bindLemonPanel(lemonSlices[0]);
}

// 薯條（綠球上；拖曳、複製、躺下）
const friesFolder = gui.addFolder('薯條');
let selectedFries: WorldFrenchFries | null = null;

function highlightFries(entry: WorldFrenchFries | null) {
  for (const fries of frenchFries) {
    fries.applyVisuals();
    if (fries !== entry) continue;
    fries.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('emissive' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.emissive.copy(m.color);
        m.emissiveIntensity = 0.32;
      }
    });
  }
}

const FRIES_PANEL_ACTIONS = new Set(['add', 'remove', 'log', 'layFlat', 'standUp']);

function clearFriesPanelSliders() {
  if (!friesFolder) return;
  friesFolder.title('薯條');
  for (const controller of [...friesFolder.controllers]) {
    if (FRIES_PANEL_ACTIONS.has(String(controller.property))) continue;
    controller.destroy();
  }
}

function bindFriesPanel(entry: WorldFrenchFries) {
  if (!friesFolder) return;
  const alreadyShowing = entry === selectedFries && friesFolder.controllers.length > FRIES_PANEL_ACTIONS.size;
  selectedFries = entry;
  highlightFries(entry);
  if (alreadyShowing) return;

  clearFriesPanelSliders();
  friesFolder.title(`薯條 · ${entry.label}`);

  const settings = entry.settings;
  const apply = () => entry.apply();
  const applyVisuals = () => {
    entry.applyVisuals();
    highlightFries(entry);
  };

  friesFolder
    .add(settings, 'angleFromTopDegrees', 0, 90, 1)
    .name('離頂端 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'azimuthDegrees', -180, 180, 1)
    .name('方位 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'spinDegrees', -180, 180, 1)
    .name('自轉 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'tiltXDegrees', -180, 180, 1)
    .name('前傾 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'tiltZDegrees', -180, 180, 1)
    .name('側傾 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'sink', -0.3, 0.12, 0.001)
    .name('下沉')
    .onChange(apply)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'placementScale', 0.2, 2.5, 0.01)
    .name('縮放')
    .onChange(apply)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'modelSize', 0.04, 0.35, 0.005)
    .name('大小 (m)')
    .onChange(apply)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'colorBoost', 0.7, 1.4, 0.01)
    .name('亮度')
    .onChange(applyVisuals)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .addColor(settings, 'tintColor')
    .name('染色')
    .onChange(applyVisuals)
    .onFinishChange(logFrenchFriesPlacements);
  friesFolder
    .add(settings, 'tintMix', 0, 1, 0.01)
    .name('染色強度')
    .onChange(applyVisuals)
    .onFinishChange(logFrenchFriesPlacements);
}

function logFrenchFriesPlacements() {
  if (frenchFries.length === 0) return;
  const text = formatFrenchFriesPlacementsForPaste(
    frenchFries.map((f) => ({ id: f.id, settings: f.settings })),
  );
  console.log(text);
  return text;
}

if (friesFolder) {
  const friesControls = {
    add() {
      const created = addFrenchFries(selectedFries ? { ...selectedFries.settings } : undefined);
      if (!created) return;
      bindFriesPanel(created);
      applyFoodGroupVisibility();
    },
    remove() {
      if (!selectedFries || frenchFries.length === 0) return;
      if (!removeFrenchFries(selectedFries)) return;
      selectedFries = null;
      clearFriesPanelSliders();
      const next = frenchFries[frenchFries.length - 1];
      if (next) bindFriesPanel(next);
      else highlightFries(null);
      refreshPuddingDragTargets();
    },
    layFlat() {
      if (!selectedFries) return;
      selectedFries.settings.tiltXDegrees = 90;
      selectedFries.settings.tiltZDegrees = 0;
      selectedFries.apply();
      friesFolder.controllersRecursive().forEach((c) => c.updateDisplay());
      logFrenchFriesPlacements();
    },
    standUp() {
      if (!selectedFries) return;
      selectedFries.settings.tiltXDegrees = 0;
      selectedFries.settings.tiltZDegrees = 0;
      selectedFries.apply();
      friesFolder.controllersRecursive().forEach((c) => c.updateDisplay());
      logFrenchFriesPlacements();
    },
    log() {
      logFrenchFriesPlacements();
    },
  };
  friesFolder.add(friesControls, 'add').name('複製薯條');
  friesFolder.add(friesControls, 'remove').name('移除選中薯條');
  friesFolder.add(friesControls, 'layFlat').name('躺下');
  friesFolder.add(friesControls, 'standUp').name('立起');
  friesFolder.add(friesControls, 'log').name('印出全部佈局 (console)');
  if (frenchFries[0]) bindFriesPanel(frenchFries[0]);
}

// 單根薯條（綠球上；拖曳、複製、躺下）
const fryStickFolder = gui.addFolder('單根薯條');
let selectedFryStick: WorldFrenchFryStick | null = null;

const FRY_STICK_PANEL_ACTIONS = new Set(['add', 'remove', 'log', 'layFlat', 'standUp']);

function highlightFryStick(entry: WorldFrenchFryStick | null) {
  for (const stick of frenchFrySticks) {
    stick.applyVisuals();
    if (stick !== entry) continue;
    stick.object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('emissive' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.emissive.copy(m.color);
        m.emissiveIntensity = 0.35;
      }
    });
  }
}

function clearFryStickPanelSliders() {
  if (!fryStickFolder) return;
  fryStickFolder.title('單根薯條');
  for (const controller of [...fryStickFolder.controllers]) {
    if (FRY_STICK_PANEL_ACTIONS.has(String(controller.property))) continue;
    controller.destroy();
  }
}

function bindFryStickPanel(entry: WorldFrenchFryStick) {
  if (!fryStickFolder) return;
  const alreadyShowing =
    entry === selectedFryStick && fryStickFolder.controllers.length > FRY_STICK_PANEL_ACTIONS.size;
  selectedFryStick = entry;
  highlightFryStick(entry);
  if (alreadyShowing) return;

  clearFryStickPanelSliders();
  fryStickFolder.title(`單根薯條 · ${entry.label}`);

  const settings = entry.settings;
  const apply = () => entry.apply();
  const applyVisuals = () => {
    entry.applyVisuals();
    highlightFryStick(entry);
  };

  fryStickFolder
    .add(settings, 'angleFromTopDegrees', 0, 90, 1)
    .name('離頂端 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'azimuthDegrees', -180, 180, 1)
    .name('方位 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'spinDegrees', -180, 180, 1)
    .name('自轉 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'tiltXDegrees', -180, 180, 1)
    .name('前傾 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'tiltZDegrees', -180, 180, 1)
    .name('側傾 (°)')
    .onChange(apply)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'sink', -0.3, 0.12, 0.001)
    .name('下沉')
    .onChange(apply)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'placementScale', 0.2, 2.5, 0.01)
    .name('縮放')
    .onChange(apply)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'modelSize', 0.02, 0.2, 0.005)
    .name('大小 (m)')
    .onChange(apply)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'colorBoost', 0.7, 1.4, 0.01)
    .name('亮度')
    .onChange(applyVisuals)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .addColor(settings, 'tintColor')
    .name('染色')
    .onChange(applyVisuals)
    .onFinishChange(logFrenchFryStickPlacements);
  fryStickFolder
    .add(settings, 'tintMix', 0, 1, 0.01)
    .name('染色強度')
    .onChange(applyVisuals)
    .onFinishChange(logFrenchFryStickPlacements);
}

function logFrenchFryStickPlacements() {
  if (frenchFrySticks.length === 0) return;
  const text = formatFrenchFryStickPlacementsForPaste(
    frenchFrySticks.map((f) => ({ id: f.id, settings: f.settings })),
  );
  console.log(text);
  return text;
}

if (fryStickFolder) {
  const fryStickControls = {
    add() {
      const created = addFrenchFryStick(selectedFryStick ? { ...selectedFryStick.settings } : undefined);
      if (!created) return;
      bindFryStickPanel(created);
      applyFoodGroupVisibility();
    },
    remove() {
      if (!selectedFryStick || frenchFrySticks.length === 0) return;
      if (!removeFrenchFryStick(selectedFryStick)) return;
      selectedFryStick = null;
      clearFryStickPanelSliders();
      const next = frenchFrySticks[frenchFrySticks.length - 1];
      if (next) bindFryStickPanel(next);
      else highlightFryStick(null);
      refreshPuddingDragTargets();
    },
    layFlat() {
      if (!selectedFryStick) return;
      selectedFryStick.settings.tiltXDegrees = 90;
      selectedFryStick.settings.tiltZDegrees = 0;
      selectedFryStick.apply();
      fryStickFolder.controllersRecursive().forEach((c) => c.updateDisplay());
      logFrenchFryStickPlacements();
    },
    standUp() {
      if (!selectedFryStick) return;
      selectedFryStick.settings.tiltXDegrees = 12;
      selectedFryStick.settings.tiltZDegrees = 0;
      selectedFryStick.apply();
      fryStickFolder.controllersRecursive().forEach((c) => c.updateDisplay());
      logFrenchFryStickPlacements();
    },
    log() {
      logFrenchFryStickPlacements();
    },
  };
  fryStickFolder.add(fryStickControls, 'add').name('複製薯條');
  fryStickFolder.add(fryStickControls, 'remove').name('移除選中');
  fryStickFolder.add(fryStickControls, 'layFlat').name('躺下');
  fryStickFolder.add(fryStickControls, 'standUp').name('立起');
  fryStickFolder.add(fryStickControls, 'log').name('印出全部佈局 (console)');
  if (frenchFrySticks[0]) bindFryStickPanel(frenchFrySticks[0]);
}

function applyFoodGroupVisibility() {
  for (const corn of grilledCorns) corn.object.visible = foodVisibility.showCorn;
  for (const lemon of lemonSlices) lemon.object.visible = foodVisibility.showLemon;
  for (const steak of salmonSteaks) steak.object.visible = foodVisibility.showSalmon;
  for (const fries of frenchFries) fries.object.visible = foodVisibility.showFrenchFries;
  for (const stick of frenchFrySticks) stick.object.visible = foodVisibility.showFrenchFryStick;
  refreshPuddingDragTargets();
}

const foodVisibilityFolder = gui.addFolder('食物顯示');
foodVisibilityFolder.add(foodVisibility, 'showCorn').name('玉米').onChange(applyFoodGroupVisibility);
foodVisibilityFolder.add(foodVisibility, 'showLemon').name('檸檬片').onChange(applyFoodGroupVisibility);
foodVisibilityFolder.add(foodVisibility, 'showSalmon').name('魚排').onChange(applyFoodGroupVisibility);
foodVisibilityFolder.add(foodVisibility, 'showFrenchFries').name('薯條（盒）').onChange(applyFoodGroupVisibility);
foodVisibilityFolder.add(foodVisibility, 'showFrenchFryStick').name('單根薯條').onChange(applyFoodGroupVisibility);

// 進場時所有分組（含子分組）與根面板都收合，需要時再手動展開。
// 用 foldersRecursive() 抓全部，不手動列清單：之前列清單會漏掉新加的分組（Happy Fat、寶箱、香菇…），
// 它們就預設是展開的。
gui.foldersRecursive().forEach((folder) => folder.close());
gui.close();

// 選中那棟的名字：用 HTML 畫在畫面上，而不是貼在 3D 房子上
// 房子會跟著地球傾斜，3D 文字也會跟著歪、變小；HTML 永遠正對螢幕、大小固定，才是「2D 的名字」
const houseLabel = document.createElement('div');
houseLabel.className = 'world-ui-chip';
document.body.appendChild(houseLabel);
// 屋頂的位置：每幀拿來投影到螢幕，重複利用避免一直 new
const labelAnchor = new THREE.Vector3();
const labelAnchorOther = new THREE.Vector3();
const labelHousePos = new THREE.Vector3();
const labelFront = new THREE.Vector3();
const labelToCamera = new THREE.Vector3();

/** 把選中房子的屋頂中心投影到螢幕，名字就浮在它正上方 */
/**
 * 標籤上顯示的文字：房子的內部名稱（面板上看到的 mainHall 等）不一定適合給訪客看，
 * 這裡可以換成好讀的名字，並在下面加一行小字備註。沒列出來的房子照舊顯示內部名稱。
 */
const HOUSE_LABEL_DISPLAY: Record<string, { title: string; note?: string }> = {
  mainHall: { title: '龍兔的家', note: '（點擊進入會看到詳細資訊）' },
  projectRoom: { title: '工作間' },
};
let renderedHouseLabel = '';

function renderHouseLabelText(label: string) {
  // 每幀都會呼叫：內容沒變就不要重建 DOM（重建會讓瀏覽器每幀重新排版）
  if (renderedHouseLabel === label) return;
  renderedHouseLabel = label;
  const display = HOUSE_LABEL_DISPLAY[label];
  houseLabel.replaceChildren();
  const title = document.createElement('span');
  title.className = 'world-ui-chip-title';
  title.textContent = display?.title ?? label;
  houseLabel.append(title);
  if (display?.note) {
    const note = document.createElement('span');
    note.className = 'world-ui-chip-note';
    note.textContent = display.note;
    houseLabel.append(note);
  }
}

function updateHouseLabel() {
  if (!selectedHouse) {
    houseLabel.style.visibility = 'hidden';
    return;
  }
  // 房子還埋在地裡時，名字會貼在球面上跟著跑。等它長出來再顯示
  if (!isHouseGrown(selectedHouse.object)) {
    houseLabel.style.visibility = 'hidden';
    return;
  }
  renderHouseLabelText(selectedHouse.label);
  // 幾何的原點在底部，屋頂在自己的 +Y、還沒乘縮放的高度；localToWorld 會把縮放和地球的旋轉算進去
  labelAnchor.set(0, selectedHouse.settings.height, 0);
  // 父層（綠球）的矩陣可能還沒更新，少了這行拖曳當下名字會晚一幀
  selectedHouse.object.updateWorldMatrix(true, false);
  selectedHouse.object.localToWorld(labelAnchor);
  // project 用的是含 setViewOffset 的投影矩陣，算出來的位置才跟畫面上的房子對得齊
  labelAnchor.project(camera);
  // z 超出 -1 ~ 1：在鏡頭後面，或被近／遠裁切切掉
  if (labelAnchor.z < -1 || labelAnchor.z > 1) {
    houseLabel.style.visibility = 'hidden';
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  const x = rect.left + (labelAnchor.x * 0.5 + 0.5) * rect.width;
  const y = rect.top + (-labelAnchor.y * 0.5 + 0.5) * rect.height;
  houseLabel.style.visibility = 'visible';
  // 屋頂上方放得下：照舊放在屋頂正上方（往上移一個標籤的高度，多留一點給指向房子的小尾巴）
  const labelHeight = houseLabel.offsetHeight || 28;
  if (y - labelHeight - 14 > rect.top + 8) {
    houseLabel.classList.remove('is-side', 'is-side-right');
    houseLabel.style.transform = `translate(${x}px, ${y}px) translate(-50%, calc(-100% - 14px))`;
    return;
  }
  // 放不下（房子在畫面最上緣，例如 mainHall 的香菇屋）：改放在房子旁邊、大約一半高的地方。
  //   看得到正面：放在畫面上的左邊，小尾巴在標籤右邊指向房子（.is-side）
  //   轉到背面：放在右邊，小尾巴在左邊（.is-side-right）
  // 正面朝房子自己的 +Z（模型的正面）；跟「房子 → 鏡頭」同向就是看得到正面
  selectedHouse.object.getWorldPosition(labelHousePos);
  labelFront.set(0, 0, 1).transformDirection(selectedHouse.object.matrixWorld);
  labelToCamera.copy(camera.position).sub(labelHousePos);
  const seeingBack = labelFront.dot(labelToCamera) < 0;
  // 房子左右兩個角都投影到畫面上，取畫面上比較左（或比較右）的那個，房子轉了方向也放得對
  labelAnchor.set(-selectedHouse.settings.width * 0.5, selectedHouse.settings.height * 0.55, 0);
  selectedHouse.object.localToWorld(labelAnchor);
  labelAnchor.project(camera);
  labelAnchorOther.set(selectedHouse.settings.width * 0.5, selectedHouse.settings.height * 0.55, 0);
  selectedHouse.object.localToWorld(labelAnchorOther);
  labelAnchorOther.project(camera);
  const leftIsFirst = labelAnchor.x < labelAnchorOther.x;
  const edge = seeingBack === leftIsFirst ? labelAnchorOther : labelAnchor;
  const sideX = rect.left + (edge.x * 0.5 + 0.5) * rect.width;
  const sideY = rect.top + (-edge.y * 0.5 + 0.5) * rect.height;
  houseLabel.classList.toggle('is-side', !seeingBack);
  houseLabel.classList.toggle('is-side-right', seeingBack);
  houseLabel.style.transform = seeingBack
    ? `translate(${sideX}px, ${sideY}px) translate(14px, -50%)`
    : `translate(${sideX}px, ${sideY}px) translate(calc(-100% - 14px), -50%)`;
}

// 直接在畫面上拖曳房子：沿著綠球表面滑動
// 開關：false = 關閉，點到房子也只會旋轉鏡頭
const HOUSE_DRAG_ENABLED = true;

const friedEggsOnSphere = () => friedEggs.filter((egg) => egg.settings.mode === 'sphere');

let surfaceDragTargets: Array<
  | WorldHouse
  | WorldPudding
  | WorldGrilledCorn
  | WorldFriedEgg
  | WorldSalmonSteak
  | WorldLemonSlice
  | WorldFrenchFries
  | WorldFrenchFryStick
  | WorldCampfire
  | WorldShiitake
  | WorldTreasureChest
  | WorldHappyFatShop
  | WorldPond
> = [
  ...houses,
  ...(campfire ? [campfire] : []),
  ...shiitakes,
  ...(treasureChest ? [treasureChest] : []),
  ...(happyFatShop ? [happyFatShop] : []),
  ...(pond ? [pond] : []),
  ...(PUDDING_SCENE_EDIT ? puddings : []),
  ...(CORN_SCENE_EDIT && foodVisibility.showCorn ? grilledCorns : []),
  ...friedEggsOnSphere(),
  ...salmonSteaks,
  ...lemonSlices,
  ...(foodVisibility.showFrenchFries ? frenchFries : []),
  ...(foodVisibility.showFrenchFryStick ? frenchFrySticks : []),
];

function refreshPuddingDragTargets() {
  surfaceDragTargets.length = 0;
  surfaceDragTargets.push(...houses, ...friedEggsOnSphere());
  if (campfire) surfaceDragTargets.push(campfire);
  surfaceDragTargets.push(...shiitakes);
  if (treasureChest) surfaceDragTargets.push(treasureChest);
  if (happyFatShop) surfaceDragTargets.push(happyFatShop);
  if (pond) surfaceDragTargets.push(pond);
  if (PUDDING_SCENE_EDIT) surfaceDragTargets.push(...puddings);
  if (CORN_SCENE_EDIT && foodVisibility.showCorn) surfaceDragTargets.push(...grilledCorns);
  if (foodVisibility.showSalmon) surfaceDragTargets.push(...salmonSteaks);
  if (foodVisibility.showLemon) surfaceDragTargets.push(...lemonSlices);
  if (foodVisibility.showFrenchFries) surfaceDragTargets.push(...frenchFries);
  if (foodVisibility.showFrenchFryStick) surfaceDragTargets.push(...frenchFrySticks);
}

if (HOUSE_DRAG_ENABLED) {
  enableSurfaceDrag({
    targets: surfaceDragTargets,
    isLocked: isHouseLocked,
    ground,
    groundRadius,
    camera,
    domElement: renderer.domElement,
    controls,
    onDragStart: (target) => {
      const houseEntry = houses.find((house) => house.object === target.object);
      if (houseEntry) {
        bindHousePanel(houseEntry);
        markHouseSelected();
        return;
      }
      if (PUDDING_SCENE_EDIT) {
        const puddingEntry = puddings.find((item) => item.object === target.object);
        if (puddingEntry) bindPuddingPanel(puddingEntry);
      }
      if (CORN_SCENE_EDIT) {
        const cornEntry = grilledCorns.find((item) => item.object === target.object);
        if (cornEntry) bindCornPanel(cornEntry);
      }
      const salmonEntry = salmonSteaks.find((item) => item.object === target.object);
      if (salmonEntry) bindSalmonPanel(salmonEntry);
      const shiitakeEntry = shiitakes.find((item) => item.object === target.object);
      if (shiitakeEntry) bindShiitakePanel(shiitakeEntry);
      const lemonEntry = lemonSlices.find((item) => item.object === target.object);
      if (lemonEntry) bindLemonPanel(lemonEntry);
      const friesEntry = frenchFries.find((item) => item.object === target.object);
      if (friesEntry) bindFriesPanel(friesEntry);
      const fryStickEntry = frenchFrySticks.find((item) => item.object === target.object);
      if (fryStickEntry) bindFryStickPanel(fryStickEntry);
    },
    onDrag: (normal, target) => {
      target.setNormal(normal);
      houseFolder.controllersRecursive().forEach((controller) => controller.updateDisplay());
      puddingFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      cornFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      salmonFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      lemonFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      friesFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      fryStickFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      campfireFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      shiitakeFolder.controllersRecursive().forEach((controller) => controller.updateDisplay());
      treasureFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      happyFatFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
      pondFolder?.controllersRecursive().forEach((controller) => controller.updateDisplay());
    },
    onDragEnd: (target) => {
      if (campfire && target.object === campfire.object) logCampfire();
      else if (shiitakes.some((item) => item.object === target.object)) logShiitakePlacements();
      else if (treasureChest && target.object === treasureChest.object) logTreasure();
      else if (happyFatShop && target.object === happyFatShop.object) logHappyFat();
      else if (pond && target.object === pond.object) {
        // 水潭搬家後：舊位置的草原樣長回來、新位置的草藏起來（不重撒，其他地方不動）
        rescatterAroundPond();
        logPond();
      }
      else if (houses.some((house) => house.object === target.object)) logHouse();
      else if (PUDDING_SCENE_EDIT && puddings.some((item) => item.object === target.object)) logPuddingPlacements();
      else if (CORN_SCENE_EDIT && grilledCorns.some((item) => item.object === target.object)) logCornPlacements();
      else if (salmonSteaks.some((item) => item.object === target.object)) logSalmonPlacements();
      else if (lemonSlices.some((item) => item.object === target.object)) logLemonPlacements();
      else if (frenchFries.some((item) => item.object === target.object)) logFrenchFriesPlacements();
      else if (frenchFrySticks.some((item) => item.object === target.object)) logFrenchFryStickPlacements();
    },
    onClick: (target) => {
      if (houses.some((house) => house.object === target.object)) markHouseSelected();
      if (PUDDING_SCENE_EDIT) {
        const puddingEntry = puddings.find((item) => item.object === target.object);
        if (puddingEntry) bindPuddingPanel(puddingEntry);
      }
      if (CORN_SCENE_EDIT) {
        const cornEntry = grilledCorns.find((item) => item.object === target.object);
        if (cornEntry) bindCornPanel(cornEntry);
      }
      const salmonEntry = salmonSteaks.find((item) => item.object === target.object);
      if (salmonEntry) bindSalmonPanel(salmonEntry);
      const shiitakeEntry = shiitakes.find((item) => item.object === target.object);
      if (shiitakeEntry) bindShiitakePanel(shiitakeEntry);
      const lemonEntry = lemonSlices.find((item) => item.object === target.object);
      if (lemonEntry) bindLemonPanel(lemonEntry);
      const friesEntry = frenchFries.find((item) => item.object === target.object);
      if (friesEntry) bindFriesPanel(friesEntry);
      const fryStickEntry = frenchFrySticks.find((item) => item.object === target.object);
      if (fryStickEntry) bindFryStickPanel(fryStickEntry);
    },
    // 編輯小徑時點綠球是在加路點，不要把「進入」按鈕跟著藏起來
    onBackgroundClick: () => {
      if (groundPathEditorState?.editing) return;
      clearHouseSelection();
    },
  });
}

function logHouse() {
  if (!selectedHouse) return;
  const houseSettings = selectedHouse.settings;
  console.log(
    `// ${selectedHouse.label}\n` +
    `const HOUSE_WIDTH = ${houseSettings.width.toFixed(2)};\n` +
    `const HOUSE_HEIGHT = ${houseSettings.height.toFixed(2)};\n` +
    `const HOUSE_DEPTH = ${houseSettings.depth.toFixed(2)};\n` +
    `const HOUSE_SCALE = ${houseSettings.scale.toFixed(2)};\n` +
    `const HOUSE_COLOR = '${houseSettings.color}';\n` +
    `const HOUSE_ANGLE_FROM_TOP = THREE.MathUtils.degToRad(${houseSettings.angleFromTopDegrees});\n` +
    `const HOUSE_AZIMUTH = THREE.MathUtils.degToRad(${houseSettings.azimuthDegrees});\n` +
    `const HOUSE_SPIN = THREE.MathUtils.degToRad(${houseSettings.spinDegrees});\n` +
    `const HOUSE_SINK = ${houseSettings.sink.toFixed(3)};`
  );
}

// 直接在畫面上拖曳緞帶：沿著跟螢幕平行的平面移動
// 拖曳時把新位置寫回 ring，面板上的數字才會跟著變，放開時一樣印 console
// 開關：false = 關閉，滑鼠只會旋轉鏡頭；之後要再調位置改成 true 就好
const KETCHUP_DRAG_ENABLED = false;

if (KETCHUP_DRAG_ENABLED) {
  enableViewPlaneDrag({
    target: ketchupRing.object,
    pickable: ketchupRing.object,
    camera,
    domElement: renderer.domElement,
    controls,
    onDrag: () => {
      // 取到小數第 2 位再套回去：面板、畫面、console 印出來的數字才會完全一致
      const round = (value: number) => Math.round(value * 100) / 100;
      const { x, y, z } = ketchupRing.object.position;
      ring.offsetX = round(x);
      ring.offsetY = round(y);
      ring.offsetZ = round(z);
      ketchupRing.apply();
      // 數值是程式改的、不是在面板上改的，面板不會自己重畫，要手動叫它更新顯示
      gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
    },
    onDragEnd: logKetchupRing,
  });
}

function logKetchupRing() {
  console.log(
    `const ORBIT_RADIUS = ${ring.radius.toFixed(2)};\n` +
    `const RING_TILT = THREE.MathUtils.degToRad(${ring.tiltDegrees});\n` +
    `const RING_YAW = THREE.MathUtils.degToRad(${ring.yawDegrees});\n` +
    `const RING_OFFSET_X = ${ring.offsetX.toFixed(2)};\n` +
    `const RING_OFFSET_Y = ${ring.offsetY.toFixed(2)};\n` +
    `const RING_OFFSET_Z = ${ring.offsetZ.toFixed(2)};`
  );
}

function logKetchupChicken() {
  const c = ketchupChicken.settings;
  console.log(
    `chickenFoodSettings: { size: ${c.size.toFixed(3)}, boneColor: '${c.boneColor}' };\n` +
    `CHICKEN_CRUST_PALETTE = ['#a35205', '#d27219', '#7e4120'];`,
  );
}

function logKetchupFry() {
  const f = ketchupFry.settings;
  console.log(`fryFoodSettings: { size: ${f.size.toFixed(3)} };`);
}


function render(time: number) {
  // setAnimationLoop 給的 time 是毫秒，shader 裡用秒比較好讀
  backgroundMaterial.uniforms.uTime.value = time * 0.001;
  // enableDamping 開啟時每幀都要 update，否則放開滑鼠後不會有慣性滑動
  controls.update();
  // 彩虹等跟鏡頭對齊的物件要在 controls 之後更新
  updateObjs(time * 0.001);
  tryUnlockEnterAfterHouses();
  updateFlashlight();
  // 入場會動 ground pivot，陰影貼圖要用最新的世界矩陣
  all.updateMatrixWorld(true);
  // 拖曳、旋轉鏡頭時房子在畫面上的位置每幀都在變，名字要跟著重算
  updateHouseLabel();
  // autoClear 關掉後要自己在每幀開頭清一次，否則上一幀的殘影會疊上來
  renderer.clear();
  renderer.render(backgroundScene, backgroundCamera);
  // 浮空小星球：單獨畫、邊緣高斯模糊後貼上，當作天空背景的一部分（綠球、房子會蓋在它前面）
  const renderDelta = lastRenderTime === null ? 0 : (time - lastRenderTime) * 0.001;
  lastRenderTime = time;
  islandSoftPass.render(renderDelta);
  // 背景不寫深度，但仍清一次深度緩衝，確保主場景物件不會被背景擋住
  renderer.clearDepth();
  renderer.render(scene, camera);
  foregroundBlur.render();
}
renderer.setAnimationLoop(render);
// 蓋板後先等 glb、分幀掛載、著色器預熱，再旋開，避免重整時畫面頓一下
async function warmSceneShaders() {
  const compileMs = 10_000;
  // 浮空小星球在自己的 layer（主鏡頭平常看不到），預熱時要把那一層也打開，
  // 不然它的 shader 會拖到第一次畫的時候才編譯，畫面會卡一下
  islandSoftPass.prepareForCompile();
  camera.layers.enable(FLOATING_ISLAND_LAYER);
  const work = (async () => {
    if (typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(scene, camera);
      return;
    }
    renderer.compile(scene, camera);
  })().finally(() => camera.layers.disable(FLOATING_ISLAND_LAYER));
  await Promise.race([
    work,
    new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('shader precompile timeout')), compileMs);
    }),
  ]).catch((err) => {
    console.warn('[world] shader precompile skipped:', err);
  });
}

void playSceneLoad(async () => {
  await Promise.race([
    (async () => {
      await whenGltfsReady(WORLD_GLTF_URLS);
      await Promise.race([
        whenGltfMountsIdle(),
        new Promise<void>((resolve) => setTimeout(resolve, 12_000)),
      ]);
      all.updateMatrixWorld(true);
      await warmSceneShaders();
    })(),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('world load timeout')), 22_000)),
  ]);
})
  .then(() => {
    worldUiActions?.removeAttribute('hidden');
    syncWorldActionButtons();
  })
  .catch((err) => {
    console.error('[world] playSceneLoad failed:', err);
    worldUiActions?.removeAttribute('hidden');
    syncWorldActionButtons();
  });


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  // 偏移量是用像素算的，視窗尺寸變了要重算，否則下移的比例會跑掉
  // setViewOffset 內部會自己呼叫 updateProjectionMatrix
  applyViewOffset();
  renderer.setSize(window.innerWidth, window.innerHeight);
});