console.log('world');

import * as THREE from 'three';
import gradientVertexShader from './shader/gradient.vert.glsl?raw';
import gradientFragmentShader from './shader/gradient.frag.glsl?raw';


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



const backgroundScene = new THREE.Scene();
const backgroundCamera = new THREE.OrthographicCamera(
  -1, 1, 1, -1, 0.1, 10
);
backgroundCamera.position.z = 1;
const backgroundGeometry = new THREE.PlaneGeometry(2, 2);
const backgroundMaterial = new THREE.ShaderMaterial({
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




function render(_time: number) {
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