console.log('world');

import * as THREE from 'three';
import gradientVertexShader from './shader/gradient.vert.glsl?raw';
import gradientFragmentShader from './shader/gradient.frag.glsl?raw';

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
camera.position.set(7, 5, 5.5);
camera.lookAt(0, 1, 0);


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
// 環境光：從四面八方均勻照亮，少了它，背光面會整片死黑
const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambientLight);

// 平行光：模擬太陽，有方向，Phong 的明暗和高光主要靠它
// 用暖黃色當主光，亮面會偏暖、比較通透，不像白光那麼平
const directionalLight = new THREE.DirectionalLight(0xffdd55, 1.2);
directionalLight.position.set(-5, 8, 2);
scene.add(directionalLight);

// 補光（rim / fill light）：從主光的反方向打紫光，只照亮背光面
// 少了它，暗面只剩極弱的環境光，看起來會是死黑
// 綠色通道給 0，乘上材質後才會是乾淨的紫，不會混成灰藍
const fillLight = new THREE.DirectionalLight(0xff00dd, 2.5);
fillLight.position.set(6, -4, 3);
scene.add(fillLight);


// WORLD...OBJECTS
const { all } = createObjs();
scene.add(all);


function render(time: number) {
  // setAnimationLoop 給的 time 是毫秒，shader 裡用秒比較好讀
  backgroundMaterial.uniforms.uTime.value = time * 0.001;
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