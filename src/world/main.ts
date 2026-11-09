console.log('world');

import * as THREE from 'three';
import gradientVertexShader from './shader/gradient.vert.glsl?raw';
import gradientFragmentShader from './shader/gradient.frag.glsl?raw';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// RoomEnvironment：three.js 內建的「虛擬攝影棚」，拿來當反射用的環境，不用另外下載 HDR 圖
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createObjs, INTRO_BALL_EASE_OPTIONS, type WorldHouse } from './objects/obj';
// lil-gui：three.js 內建的小型控制面板，拖拉滑桿就能即時調整數值，不用改程式碼重新整理
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { enableViewPlaneDrag } from './debug/viewPlaneDrag';
import { enableSurfaceDrag } from './debug/surfaceDrag';
import { flyCameraTo, isCameraFlying, type CameraPose } from './cameraFlight';
import { playHouseTransition, playSceneLoad, transitionSettings } from './houseTransition';

// RENDERER
/**
 * // ── 影子 ①：渲染器總開關（預設關閉，因為陰影很吃效能）──
 * 
 */
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
  ketchupFood,
  ketchupShark,
  ketchupSharkWaves,
  houses,
  ground,
  groundSurface,
  groundRadius,
  isHouseGrown,
  isIntroComplete,
  introSettings,
  replayIntro,
} = createObjs({ envMap, camera });

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

const viewIntroButton = document.getElementById('view-intro') as HTMLButtonElement | null;
viewIntroButton?.addEventListener('click', () => {
  if (isCameraFlying()) return;
  viewIntroButton.disabled = true;
  void flyCameraTo(camera, controls, introViewPose).finally(() => {
    if (viewIntroButton) viewIntroButton.disabled = false;
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
const introControls = {
  replayIntro() {
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
      `const KETCHUP_AFTER_HOUSE = ${introSettings.ketchupAfterHouse.toFixed(2)};`,
  );
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

const sharkFolder = gui.addFolder('番茄醬海・鯊魚');
const shark = ketchupShark.settings;
sharkFolder.add(shark, 'enabled').name('顯示魚鰭').onChange(ketchupShark.apply);
sharkFolder.add(shark, 'drift', 0, 2, 0.02).name('游動速度 SHARK_FIN_DRIFT').onChange(ketchupShark.apply).onFinishChange(logSharkFin);
sharkFolder.add(shark, 'forward').name('順環游（關＝逆環）');
sharkFolder.addColor(shark, 'color').name('顏色 SHARK_FIN_COLOR').onChange(ketchupShark.apply).onFinishChange(logSharkFin);
sharkFolder.add(shark, 'lift', -0.05, 0.04, 0.001).name('埋入醬面 lift').onChange(ketchupShark.apply).onFinishChange(logSharkFin);
sharkFolder.add(shark, 'depth', 0.003, 0.025, 0.001).name('厚度 depth').onChange(ketchupShark.apply).onFinishChange(logSharkFin);
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
      `// forward ${shark.forward}, lift ${shark.lift.toFixed(3)}, depth ${shark.depth.toFixed(3)}`,
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
let selectedHouse = houses[0];

function bindHousePanel(entry: WorldHouse) {
  // 已經是這一棟就不要拆掉滑桿重建：拖曳中每一格都會碰面板，重建會讓數字閃一下
  const alreadyShowing = entry === selectedHouse && houseFolder.controllers.length > 0;
  selectedHouse = entry;
  highlightHouse(entry);
  if (alreadyShowing) return;

  houseFolder.title(`房子 · ${entry.label}`);
  // 打開分組，點完房子就看得到下方這排滑桿
  houseFolder.open();
  for (const controller of [...houseFolder.controllers]) controller.destroy();

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
}

/** 選中的那一棟自己發光，才分得出面板上的數字是哪一棟的 */
function highlightHouse(entry: WorldHouse) {
  for (const house of houses) {
    const material = house.object.material;
    const active = house === entry;
    material.emissive.set(active ? house.settings.color : 0x000000);
    // 只要能認出選中的是哪一棟；太亮會把那一棟洗白，其他棟看起來更暗
    material.emissiveIntensity = active ? 0.16 : 1;
  }
}

bindHousePanel(houses[0]);

// 選中那棟的名字：用 HTML 畫在畫面上，而不是貼在 3D 房子上
// 房子會跟著地球傾斜，3D 文字也會跟著歪、變小；HTML 永遠正對螢幕、大小固定，才是「2D 的名字」
const houseLabel = document.createElement('div');
houseLabel.className = 'world-ui-chip';
document.body.appendChild(houseLabel);
// 屋頂的位置：每幀拿來投影到螢幕，重複利用避免一直 new
const labelAnchor = new THREE.Vector3();

/** 把選中房子的屋頂中心投影到螢幕，名字就浮在它正上方 */
function updateHouseLabel() {
  // 房子還埋在地裡時，名字會貼在球面上跟著跑。等它長出來再顯示
  if (!isHouseGrown(selectedHouse.object)) {
    houseLabel.style.visibility = 'hidden';
    return;
  }
  houseLabel.textContent = selectedHouse.label;
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
  // 先移到屋頂的螢幕座標，再往上移一個標籤的高度，名字才不會壓在屋頂上
  // 多留一點給 .world-ui-chip 指向房子的小尾巴
  houseLabel.style.transform = `translate(${x}px, ${y}px) translate(-50%, calc(-100% - 14px))`;
}

// 直接在畫面上拖曳房子：沿著綠球表面滑動
// 開關：false = 關閉，點到房子也只會旋轉鏡頭
const HOUSE_DRAG_ENABLED = true;

if (HOUSE_DRAG_ENABLED) {
  enableSurfaceDrag({
    targets: houses,
    ground,
    groundRadius,
    camera,
    domElement: renderer.domElement,
    controls,
    onDragStart: (target) => {
      const entry = houses.find((house) => house.object === target.object);
      if (entry) bindHousePanel(entry);
    },
    onDrag: (normal, target) => {
      target.setNormal(normal);
      // 數值是程式改的、不是在面板上改的，面板不會自己重畫，要手動叫它更新顯示
      houseFolder.controllersRecursive().forEach((controller) => controller.updateDisplay());
    },
    onDragEnd: logHouse,
    // 點一下才播轉場。拖曳仍然只是沿著球面移動房子
    onClick: () => {
      void playHouseTransition();
    },
  });
}

function logHouse() {
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


function render(time: number) {
  // setAnimationLoop 給的 time 是毫秒，shader 裡用秒比較好讀
  backgroundMaterial.uniforms.uTime.value = time * 0.001;
  // 番茄醬等會動的物件
  updateObjs(time * 0.001);
  // enableDamping 開啟時每幀都要 update，否則放開滑鼠後不會有慣性滑動
  controls.update();
  updateFlashlight();
  // 入場會動 ground pivot，陰影貼圖要用最新的世界矩陣
  all.updateMatrixWorld(true);
  // 拖曳、旋轉鏡頭時房子在畫面上的位置每幀都在變，名字要跟著重算
  updateHouseLabel();
  // autoClear 關掉後要自己在每幀開頭清一次，否則上一幀的殘影會疊上來
  renderer.clear();
  renderer.render(backgroundScene, backgroundCamera);
  // 背景不寫深度，但仍清一次深度緩衝，確保主場景物件不會被背景擋住
  renderer.clearDepth();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(render);
// 場景迴圈開始後才掀開：黑幕底下已經有畫好的畫面，不會旋開到一片空白
void playSceneLoad().then(() => {
  viewIntroButton?.removeAttribute('hidden');
});


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  // 偏移量是用像素算的，視窗尺寸變了要重算，否則下移的比例會跑掉
  // setViewOffset 內部會自己呼叫 updateProjectionMatrix
  applyViewOffset();
  renderer.setSize(window.innerWidth, window.innerHeight);
});