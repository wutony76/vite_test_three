console.log('world');

import * as THREE from 'three';
import gradientVertexShader from './shader/gradient.vert.glsl?raw';
import gradientFragmentShader from './shader/gradient.frag.glsl?raw';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// RoomEnvironment：three.js 內建的「虛擬攝影棚」，拿來當反射用的環境，不用另外下載 HDR 圖
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createObjs } from './objects/obj';
// lil-gui：three.js 內建的小型控制面板，拖拉滑桿就能即時調整數值，不用改程式碼重新整理
import GUI from 'three/addons/libs/lil-gui.module.min.js';
import { enableViewPlaneDrag } from './debug/viewPlaneDrag';

// RENDERER
/**
 * // ── 影子 ①：渲染器總開關（預設關閉，因為陰影很吃效能）──
 * 
 */
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// 關掉自動清畫面：一幀要畫兩個場景（背景 + 主場景），
// 少了這行，第二次 render 前會把畫面清空，背景漸層就被擦成黑色
renderer.autoClear = false;
// renderer.shadowMap.type = THREE.PCFShadowMap; // PCF：陰影邊緣稍微柔和，不會一格一格的
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
const VIEW_SHIFT_Y = 0.9;
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

// 平行光：模擬太陽，有方向，Phong 的明暗和高光主要靠它
// 用暖黃色當主光，亮面會偏暖、比較通透，不像白光那麼平
const directionalLight = new THREE.DirectionalLight(0xffdd55, 1.2);
directionalLight.position.set(-5, 8, 2);
scene.add(directionalLight);

// 補光：用半球光（HemisphereLight）取代「環境光 + 紫色平行光」
// 半球光依表面朝向混色：朝上的面拿天空色、朝下的面拿地面色，中間平滑過渡
// 為什麼不用平行光當補光？
//   ① 平行光只照亮朝向它的半邊，主光和補光交界那一圈兩邊都照不到 → 出現一條死黑的暗帶
//   ② 平行光有鏡面反射，暗部會冒出一顆刺眼的粉紅亮點
// 半球光每個面都有顏色、也不產生高光，剛好解決這兩個問題
// 地面色綠色通道給 0，乘上材質後才會是乾淨的紫，不會混成灰藍
const hemisphereLight = new THREE.HemisphereLight(0x222200, 0xff00ff, 4.5);
scene.add(hemisphereLight);


// WORLD...OBJECTS
const { all, update: updateObjs, ketchupRing } = createObjs({ envMap, camera });
scene.add(all);

const controls = new OrbitControls(camera, renderer.domElement);
// 旋轉中心對準球心，球才會固定在畫面正中間
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.minDistance = 4;
// controls.maxDistance = 30;
controls.maxDistance = 100;
// controls.maxPolarAngle = Math.PI / 2;
controls.update();

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
const gui = new GUI({ title: '番茄醬緞帶' });
const ring = ketchupRing.settings;
// onChange：拖拉中每一格都即時套用，馬上看到效果
// onFinishChange：放開滑鼠才印 console，拖拉過程不會洗版
gui.add(ring, 'radius', 0.8, 2, 0.01).name('半徑 ORBIT_RADIUS').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
gui.add(ring, 'tiltDegrees', -180, 180, 1).name('傾斜 RING_TILT (°)').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
gui.add(ring, 'yawDegrees', -180, 180, 1).name('方位 RING_YAW (°)').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
gui.add(ring, 'offsetX', -2, 2, 0.01).name('位置 X RING_OFFSET_X').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
gui.add(ring, 'offsetY', -2, 2, 0.01).name('高度 RING_OFFSET_Y').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);
gui.add(ring, 'offsetZ', -2, 2, 0.01).name('位置 Z RING_OFFSET_Z').onChange(ketchupRing.apply).onFinishChange(logKetchupRing);

// 直接在畫面上拖曳緞帶：沿著跟螢幕平行的平面移動
// 拖曳時把新位置寫回 ring，面板上的數字才會跟著變，放開時一樣印 console
// 開關：false = 關閉，滑鼠只會旋轉鏡頭；之後要再調位置改成 true 就好
const KETCHUP_DRAG_ENABLED = true;

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
  // autoClear 關掉後要自己在每幀開頭清一次，否則上一幀的殘影會疊上來
  renderer.clear();
  renderer.render(backgroundScene, backgroundCamera);
  // 背景不寫深度，但仍清一次深度緩衝，確保主場景物件不會被背景擋住
  renderer.clearDepth();
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(render);


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  // 偏移量是用像素算的，視窗尺寸變了要重算，否則下移的比例會跑掉
  // setViewOffset 內部會自己呼叫 updateProjectionMatrix
  applyViewOffset();
  renderer.setSize(window.innerWidth, window.innerHeight);
});