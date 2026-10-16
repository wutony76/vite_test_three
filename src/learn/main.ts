import * as THREE from 'three';
// FontLoader、TextGeometry 不在 three 核心裡，是附加功能（addons），要另外引入
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ── 在貼圖上畫文字 ──
// 做法：先在一張看不見的 Canvas 上用 2D 畫圖指令寫字，再把這張 Canvas 當成貼圖
function createTextTexture(text: string) {
  const canvas = document.createElement('canvas');
  // 貼圖尺寸用 2 的次方（256、512、1024…），顯示卡處理起來最有效率
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 背景：綠色
  ctx.fillStyle = '#00c853';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 外框：讓方塊每一面的邊緣看得出來
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  // 文字：置中，分兩行（HAPPY / FAT）
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 130px Arial, sans-serif';
  const [line1, line2] = text.split(' ');
  ctx.fillText(line1, canvas.width / 2, canvas.height / 2 - 75);
  ctx.fillText(line2, canvas.width / 2, canvas.height / 2 + 75);

  const texture = new THREE.CanvasTexture(canvas);
  // Canvas 畫的顏色是 sRGB，要告訴 Three.js，不然顏色會偏淡
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const geometry = new THREE.BoxGeometry(1, 1, 1);
// map：把貼圖貼到物體表面。BoxGeometry 的六個面都會貼上同一張圖
const material = new THREE.MeshBasicMaterial({ map: createTextTexture('HAPPY FAT') });
const cube = new THREE.Mesh(geometry, material);

// 燈光：MeshPhongMaterial 會受光影響，沒有燈就是全黑
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(3, 5, 5);
scene.add(light);

const loader = new FontLoader();
// 開頭的 / 代表 public/ 資料夾（字型檔在 public/fonts/）
loader.load('/fonts/helvetiker_bold.typeface.json', function (font) {

  // 尺寸要配合場景：方塊邊長 1、攝影機在 z = 5
  // （官方範例的 size 200 是給攝影機在 z = 700 的大場景用的）
  const textGeo = new TextGeometry('HAPPY.FAT.YOYO', {
    font: font,
    size: 0.6, // 字高
    depth: 0.15, // 厚度
    curveSegments: 12, // 曲線（例如 S、J 的弧）的細緻度

    // bevelThickness: 0.02, // 倒角深度
    bevelThickness: 0.5, // 倒角深度
    bevelSize: 0.01, // 倒角往外擴的大小
    bevelEnabled: true
  });

  // 算出文字寬度，往左移一半 → 置中
  textGeo.computeBoundingBox();
  // ! 告訴 TypeScript：上一行剛算過，boundingBox 一定有值
  const box = textGeo.boundingBox!;
  const centerOffset = - 0.5 * (box.max.x - box.min.x);

  const textMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000, specular: 0xffffff });

  const mesh = new THREE.Mesh(textGeo, textMaterial);
  // 放在方塊上方
  mesh.position.set(centerOffset, 1.2, 0);

  scene.add(mesh);
});




scene.add(cube);
camera.position.z = 5;
renderer.setAnimationLoop(animate);

function animate(time: number) {
  // console.log(time);
  cube.rotation.x = time / 1000;
  cube.rotation.y = time / 1000;
  renderer.render(scene, camera);
}
