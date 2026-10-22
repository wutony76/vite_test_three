import * as THREE from 'three';
// 坦克的建立方式放在 tank.ts（同一個資料夾用 ./ 開頭）
import { createTank } from './tank';
// 砲彈系統
import { Shells } from './shells';
// 滑鼠控制視角：附加功能，要另外引入
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';


const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
// ── 影子 ①：渲染器總開關（預設關閉，因為陰影很吃效能）──
renderer.shadowMap.enabled = true;
// PCF：陰影邊緣稍微柔和，不會一格一格的
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);


const scene = new THREE.Scene();
scene.background = new THREE.Color(0xDCE0E6);

// LIGHT
const light_color = 0xFFFFFF;
const light_intensity = 3;
const light = new THREE.DirectionalLight(light_color, light_intensity);
// 影子會落在光的「反方向」：光從左前上方照 → 影子往右後方拉長
// 攝影機在右前方 (7, 5, 5.5)，這樣影子剛好落在畫面看得到的一側，不會被戰車擋住
// （原本 (0, 20, 10) 幾乎從正上方照，影子會縮在戰車正下方）
light.position.set(-6, 14, 10);
// ── 影子 ②：這盞燈會投射陰影（環境光沒有方向，不能產生陰影）──
light.castShadow = true;
// 平行光的陰影只在一個方形範圍內計算（預設約 ±5 公尺）
// 戰車會沿著路徑在 x -10 ~ 10、z -5 ~ 10 之間移動 → 範圍要包住整條路
light.shadow.camera.left = -15;
light.shadow.camera.right = 15;
light.shadow.camera.top = 15;
light.shadow.camera.bottom = -15;
light.shadow.camera.near = 1;
light.shadow.camera.far = 50;
// 陰影貼圖解析度：越大邊緣越清楚（但越吃效能）；範圍越大需要的解析度越高
light.shadow.mapSize.set(2048, 2048);
// 避免物體表面出現條紋狀的「自己遮自己」（shadow acne）
light.shadow.bias = -0.0005;
// 陰影邊緣的柔和程度：數字越大邊緣越模糊（像陰天、柔光箱的影子）
// 只有 PCFShadowMap 有效；1 = 預設（很銳利），常用 3 ~ 8
light.shadow.radius = 6;
// 影子的透明度（濃淡）：0 = 完全看不到、1 = 最深（預設）
// 只影響影子本身，不會讓整個場景變亮或變暗
light.shadow.intensity = 0.6;
scene.add(light);
// 環境光：從四面八方均勻照亮，「連影子裡面也會被照亮」
// 太亮（原本 1）影子會被沖淡看不出來 → 調暗一點，影子才明顯
// 環境光：從四面八方均勻照亮，決定場景整體的基本亮度
// （影子的濃淡改用上面的 light.shadow.intensity 控制，不用靠調暗環境光）
scene.add(new THREE.AmbientLight(light_color, 0.6));
console.log('scene', scene);

// CAMERA
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// camera.position.set(0, 30, 30);
// camera.lookAt(0, 0, 0);

// 斜上方看戰車：方向和原本 (20, 15, 15) 差不多，距離從約 29 公尺拉近到約 10 公尺
// 想再近就把三個數字一起等比例縮小（例如 × 0.8），角度不變、只改距離
camera.position.set(7, 5, 5.5);
// camera.up.set(0, 1, 0);           // 不是正上方往下看了，「上方」改回預設的 +y
// 看向戰車的中心高度（約 1 公尺），而不是地面，戰車才會在畫面正中間
camera.lookAt(0, 1, 0);


//  floor
const floorGeometry = new THREE.PlaneGeometry(100, 100);
// MeshBasicMaterial 不受光影響、也接收不到陰影 → 改用會受光影響的 MeshPhongMaterial
const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x888888 });
const floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
// 履帶最底部在 y ≈ -0.13（輪子下緣 0 - 履帶間隙 0.08 - 履帶板一半厚度 0.05）
// 地板放在這裡，戰車才是「壓在地上」；原本 -0.5 會讓戰車浮空，影子會和戰車分開
floorMesh.position.y = -0.13;
floorMesh.rotation.x = -Math.PI / 2;
// ── 影子 ④：地板接收陰影 ──
floorMesh.receiveShadow = true;
scene.add(floorMesh);


//  road path
const curve = new THREE.SplineCurve([
  new THREE.Vector2(-10, 0),
  new THREE.Vector2(-5, 5),
  new THREE.Vector2(0, 0),
  new THREE.Vector2(5, -5),
  new THREE.Vector2(10, 0),
  new THREE.Vector2(5, 10),
  new THREE.Vector2(-10, 0),
]);



// ── 滑鼠控制 ──
// 左鍵拖曳：旋轉　滾輪：縮放　右鍵拖曳：平移
// 原理：不是轉動模型，而是讓「攝影機繞著 target 轉」，看起來就像模型在轉
const controls = new OrbitControls(camera, renderer.domElement);
// 繞著戰車中心轉（取代上面的 lookAt：有 OrbitControls 時，攝影機朝向由它決定）
controls.target.set(0, 1, 0);
// 阻尼：放開滑鼠後會慢慢停下，手感比較順（開啟後每一幀都要呼叫 controls.update()）
controls.enableDamping = true;
// 縮放範圍：不能鑽進戰車，也不能拉得太遠
controls.minDistance = 4;
controls.maxDistance = 30;
// 不能轉到地面以下（π/2 = 90° = 水平）
controls.maxPolarAngle = Math.PI / 2;
controls.update();

// TANK
const { tank, drive, cannon } = createTank();
// ── 影子 ③：戰車投射陰影 ──
// traverse 會走過 tank 底下的每一個物件（車身、輪子、履帶板、砲塔、砲管…）
// tank.ts 裡砲塔、砲管沒有設定 castShadow，這裡一次全部打開
tank.traverse((child) => {
  child.castShadow = true;
});
scene.add(tank);

// 每秒前進幾公尺（輪子和履帶都會依這個速度一起動）
const SPEED = 0.8;


// ACTIONS
const tankPosition = new THREE.Vector2();
const tankTarget = new THREE.Vector2();
// const trackPos = new THREE.Vector3();
// const trackTangent = new THREE.Vector3();

// ── 砲彈：按空白鍵發射 ──
// 落地高度 = 地板的高度
const shells = new Shells(scene, floorMesh.position.y);
// 後座力：發射時砲管往後縮，再慢慢彈回原位
const CANNON_REST_Z = cannon.position.z; // 砲管原本的位置
let recoil = 0;

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;
  // 空白鍵預設會捲動網頁 → 擋掉
  event.preventDefault();
  if (shells.fire(cannon)) recoil = 0.5;
});

// 記錄上一幀的時間，用來算 dt（兩幀之間經過幾秒）
let lastTime = 0;

function animate(time: number) {
  // dt：距離上一幀的秒數；切換分頁回來時可能很大 → 上限 0.1 秒，避免砲彈瞬間飛走
  const dt = Math.min((time - lastTime) / 1000, 0.1);
  lastTime = time;

  drive((time / 1000) * SPEED);
  shells.update(dt);
  // 後座力每秒恢復，砲管彈回原位
  recoil = Math.max(0, recoil - dt * 2);
  cannon.position.z = CANNON_REST_Z - recoil;
  // 開啟阻尼時，每一幀都要更新，慣性效果才會運作
  controls.update();

  // MOVE
  const tankTime = (time / 1000) * 0.02;
  curve.getPointAt(tankTime % 1, tankPosition);
  curve.getPointAt((tankTime + 0.01) % 1, tankTarget);
  tank.position.set(tankPosition.x, 0, tankPosition.y);
  tank.lookAt(tankTarget.x, 0, tankTarget.y);


  // turret.rotation.y = Math.sin(time / 1000) * 0.5;

  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

