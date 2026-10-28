console.log('world');

import * as THREE from 'three';
import gradientVertexShader from './shader/gradient.vert.glsl?raw';
import gradientFragmentShader from './shader/gradient.frag.glsl?raw';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createObjs } from './objects/obj';

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
// scene.background = new THREE.Color(0xDCE0E6);
// scene.background = new THREE.Color(0xff00ff);


// CAMERA
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// 從球的上方偏側邊往下看：上半部吃黃色主光、下緣露出紫色補光
// 數值是用 OrbitControls 轉到滿意角度後，從 console 印出來抄回來的
camera.position.set(1.85, 4.06, -0.56);
camera.lookAt(0, 0, 0);


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
const { all } = createObjs();
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


function render(time: number) {
  // setAnimationLoop 給的 time 是毫秒，shader 裡用秒比較好讀
  backgroundMaterial.uniforms.uTime.value = time * 0.001;
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
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});