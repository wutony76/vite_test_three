import * as THREE from 'three';
// GLTFLoader：讀取 .glb / .gltf，網路上下載的 3D 模型最常見的格式
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// 有些模型會用 meshopt 壓縮幾何資料，少了解碼器就讀不出來；沒壓縮的模型掛著也不影響
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { createKetchup } from './ketchup';
import { createHouse } from './house';

// 模型放在 public/ 底下，Vite 會原封不動地提供，網址從 BASE_URL 開始算
// 想換模型只要改這裡：雞塊檔案還沒下載，先用雞腿看效果
// const MODEL_URL = `${import.meta.env.BASE_URL}models/nugget/nugget.glb`;
const MODEL_URL = `${import.meta.env.BASE_URL}models/chicken_leg/chicken_leg.glb`;

// true = 載入網路下載的模型；false = 顯示原本的綠色球
const USE_MODEL = false;

// 綠球（地表）的半徑：房子要種在球面上，得知道表面離球心多遠
const GROUND_RADIUS = 1;

// 模型縮放後「最長邊」的長度：2 = 跟原本半徑 1 的球一樣大，鏡頭和燈光都不用重調
const MODEL_SIZE = 2;

type CreateObjsOptions = {
  // 環境貼圖：給番茄醬這類光滑材質反射用
  envMap: THREE.Texture;
  // 攝影機：噴濺要知道「畫面上方」在哪個方向
  camera: THREE.Camera;
};

export function createObjs({ envMap, camera }: CreateObjsOptions) {
  const all = new THREE.Object3D();

  // 地表：房子要種在它上面，所以先留著參照
  // 用模型時沒有綠球，就退回種在 all 上
  let ground: THREE.Object3D = all;
  if (USE_MODEL) {
    loadModel(all);
  } else {
    ground = createBall();
    all.add(ground);
  }

  // 番茄醬緞帶：繞著中間的物件流動
  const ketchup = createKetchup({ envMap, camera });
  all.add(ketchup.object);

  // 房子：house.ts 裡的長方體，種在綠球（地表）上
  // 要用緞帶的軸來決定種在哪，所以放在緞帶建立之後
  // 加成綠球的「子物件」而不是 all 的：兩者綁成一體，之後綠球怎麼移動、旋轉，房子都會跟著走
  const house = createHouse({ groundRadius: GROUND_RADIUS, ...getGroundAxes(ketchup.ringObject, camera) });
  ground.add(house.object);

  /** 每幀呼叫：time 單位是秒，讓會動的物件更新動畫 */
  function update(time: number) {
    ketchup.update(time);
  }

  // 緞帶擺放參數也往外交出去，讓 main.ts 的控制面板可以調整
  return {
    all,
    update,
    ketchupRing: { object: ketchup.ringObject, settings: ketchup.ringSettings, apply: ketchup.applyRingSettings },
    // ground、groundRadius：滑鼠拖曳房子時，要知道是在哪顆球的表面上滑
    house: {
      object: house.object,
      settings: house.settings,
      apply: house.applySettings,
      getNormal: house.getNormal,
      setNormal: house.setNormal,
      ground,
      groundRadius: GROUND_RADIUS,
    },
  };
}

/**
 * 算出地球的「頂端」和「正前方」，房子的經緯度就從這兩個方向開始算
 *   頂端 up = 番茄醬緞帶圈圈的中心軸
 *     main.ts 的 ORBIT_ALONG_KETCHUP 讓鏡頭繞著這條軸轉，拖動畫面看起來就像地球在自轉
 *     房子不在軸上，拖動時就會像地表上的東西一樣，被「轉」到側邊、背面再繞回來
 *   正前方 front = 一開始鏡頭所在的那一側
 *     方位 0° 的房子就會正對著我們、在畫面中間；往反方向放會躲在地球後面
 * 注意：只在建立時算一次，之後在面板調整緞帶的傾斜、方位，地球的軸不會跟著變（camera.up 也是）
 */
function getGroundAxes(ringObject: THREE.Object3D, camera: THREE.Camera) {
  // 緞帶的位置、角度是剛剛才設定的，矩陣還沒算；少了這行會拿到沒轉過的預設軸
  ringObject.updateMatrixWorld(true);
  // 緞帶繞著自己的 y 軸流動，換算成世界座標（跟 main.ts 設定 camera.up 的算法一樣）
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ringObject.getWorldQuaternion(new THREE.Quaternion()));
  // 同一條軸有兩頭，挑偏向上方那頭，跟 main.ts 一致；選錯會種到地球背面去
  if (up.y < 0) up.negate();

  // 鏡頭在「水平方向」上的位置：把鏡頭位置沿著軸的那段扣掉，只留垂直於軸的部分
  const front = camera.position.clone().addScaledVector(up, -camera.position.dot(up)).normalize();
  return { up, front };
}

// 綠色球：用來觀察燈光效果
function createBall() {
  const geometry = new THREE.SphereGeometry(GROUND_RADIUS, 16, 16);
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
