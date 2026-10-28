import * as THREE from 'three';
// GLTFLoader：讀取 .glb / .gltf，網路上下載的 3D 模型最常見的格式
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// 有些模型會用 meshopt 壓縮幾何資料，少了解碼器就讀不出來；沒壓縮的模型掛著也不影響
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createKetchup } from './ketchup';

// 模型放在 public/ 底下，Vite 會原封不動地提供，網址從 BASE_URL 開始算
// 想換模型只要改這裡：雞塊檔案還沒下載，先用雞腿看效果
// const MODEL_URL = `${import.meta.env.BASE_URL}models/nugget/nugget.glb`;
const MODEL_URL = `${import.meta.env.BASE_URL}models/chicken_leg/chicken_leg.glb`;

// true = 載入網路下載的模型；false = 顯示原本的綠色球
const USE_MODEL = false;

// 模型縮放後「最長邊」的長度：2 = 跟原本半徑 1 的球一樣大，鏡頭和燈光都不用重調
const MODEL_SIZE = 2;

type CreateObjsOptions = {
  // 環境貼圖：給番茄醬這類光滑材質反射用
  envMap: THREE.Texture;
};

export function createObjs({ envMap }: CreateObjsOptions) {
  const all = new THREE.Object3D();

  if (USE_MODEL) {
    loadModel(all);
  } else {
    all.add(createBall());
  }

  // 番茄醬緞帶：繞著中間的物件流動
  const ketchup = createKetchup(envMap);
  all.add(ketchup.object);

  /** 每幀呼叫：time 單位是秒，讓會動的物件更新動畫 */
  function update(time: number) {
    ketchup.update(time);
  }

  return { all, update };
}

// 綠色球：用來觀察燈光效果
function createBall() {
  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshPhongMaterial({
    // 光的顏色會跟材質顏色「相乘」：純綠 0x00ff00 的紅、藍都是 0，
    // 打黃光、紫光上去都只剩綠色（或全黑），所以這裡刻意混一點紅、藍，
    // 讓 main.ts 的黃色主光、紫色補光都有通道可以反射出來
    color: 0x66ff99,
    // 光澤度：數值越大高光點越小越亮（像塑膠、瓷器），預設 30 偏霧面
    shininess: 80,
  });
  return new THREE.Mesh(geometry, material);
}

// 炸雞模型：載入是非同步的，先把空的 all 交給場景，載完再把模型塞進去
// 這樣 main.ts 不用改成 await，畫面也不會因為等模型而整個卡住
function loadModel(all: THREE.Object3D) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      fitToSize(model, MODEL_SIZE);
      all.add(model);
    },
    undefined,
    (error) => {
      console.error(`[obj] 模型載入失敗，請確認檔案存在：${MODEL_URL}`, error);
    },
  );
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
