import * as THREE from 'three';

// ── 渲染器：畫布大小 = 視窗大小，放進網頁 ──
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ── 攝影機：從正上方往下看太陽系 ──
const fov = 40;
// 寬高比要跟畫布一致，不然畫面會被壓扁或拉長
const aspect = window.innerWidth / window.innerHeight;
const near = 0.1;
const far = 1000;
const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
camera.position.set(0, 50, 0);
// 從正上方往下看時，「畫面的上方」要指定成 +z（預設的 +y 剛好是視線方向，會算不出朝向）
camera.up.set(0, 0, 1);
// ⚠️ lookAt 只在呼叫當下算一次朝向：之後再移動攝影機，它不會自動重新對準
camera.lookAt(0, 0, 0);

const scene = new THREE.Scene();

// ── 光源：放在太陽中心，之後加入的地球、月亮會被它照亮 ──
const color = 0xFFFFFF;
const intensity = 500;
const light = new THREE.PointLight(color, intensity);
scene.add(light);

// ── 太陽 ──
// 要一起旋轉的物體都放進這個陣列，animate 裡統一處理
const objs: THREE.Object3D[] = [];
const radius = 1;
// 只切 6 段：低多邊形，看得出球在轉（改成 32、16 就是圓滑的球）
const widthSegments = 6;
const heightSegments = 6;
const sphereGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
// emissive：自發光，不需要被照亮也是亮的（太陽本身就是光源）
const sunMaterial = new THREE.MeshPhongMaterial({ emissive: 0xFFFF00 });
const sunMesh = new THREE.Mesh(sphereGeometry, sunMaterial);
sunMesh.scale.set(5, 5, 5); // 把太陽放大

const earthMaterial = new THREE.MeshPhongMaterial({ color: 0x2233FF, emissive: 0x112244 });
const earthMesh = new THREE.Mesh(sphereGeometry, earthMaterial);
earthMesh.position.x = 10;

scene.add(sunMesh);
scene.add(earthMesh);
objs.push(sunMesh);
objs.push(earthMesh);



// ── 視窗縮放：更新攝影機比例與畫布大小 ──
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── 動畫：放在最後，所有東西都建立好了才開始跑 ──
// （如果在 camera、scene 建立之前就開始，animate 每秒會報錯 60 次）
function animate(time: number) {
  // time 是毫秒 → 換成秒，每秒轉 1 弧度（約 57°）
  const seconds = time / 1000;
  objs.forEach((obj) => {
    obj.rotation.y = seconds;
  });
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
