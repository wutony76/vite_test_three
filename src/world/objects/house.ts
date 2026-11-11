import * as THREE from 'three';
import { conformChildrenToSphere, conformGeometryToSphere } from './conformToSphere';

// ===== 房子的預設值：用控制面板調到滿意後，把 console 印出來的那幾行貼回這裡 =====

// 形狀：長、寬、高（寬 = x、高 = y、深 = z），實際大小還會再乘上 HOUSE_SCALE
const HOUSE_WIDTH = 1.3;
const HOUSE_HEIGHT = 2.2;
const HOUSE_DEPTH = 1.1;
// 整體縮放：原尺寸約 2 單位寬，跟整顆地球一樣大；縮小才像是蓋在地表上的房子
const HOUSE_SCALE = 0.17;
const HOUSE_COLOR = '#80e3ea';

// 位置：用「地球上的經緯度」概念描述種在哪
// 離頂端多遠（像緯度）：0 = 種在旋轉軸正上方，拖動時只會原地自轉，看不出跟著地球轉；
// 太大會繞到看不到的下半球
const HOUSE_ANGLE_FROM_TOP = THREE.MathUtils.degToRad(4);
// 繞著軸的方位（像經度）：0 = 一開始正對鏡頭那側，正負值往左右繞
const HOUSE_AZIMUTH = THREE.MathUtils.degToRad(-151);
// 房子繞著自己的屋頂方向轉多少：位置不變，只改變正面朝哪
const HOUSE_SPIN = THREE.MathUtils.degToRad(69);
// 往地裡沉多少（世界單位，地球半徑 = 1）：0 = 底部中心剛好碰到球面
// 為什麼要沉？房子底部是平的、球面是彎的，底部四個角會懸空；
// 而且綠球只有 16×16 段，表面是一片片平面，兩個頂點中間會比真正的半徑還低，
// 沉一點才看起來「種」在地上；給負數則會浮起來
const HOUSE_SINK = 0.03;

export type HouseSettings = {
  width: number;
  height: number;
  depth: number;
  scale: number;
  color: string;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  sink: number;
};

type CreateHouseOptions = {
  // 地表（球）的半徑：房子要種在球面上，得知道表面離球心多遠
  groundRadius: number;
  // 地球的「頂端」方向（單位向量）：經緯度從這裡開始算
  up: THREE.Vector3;
  // 方位 0° 指向哪：要跟 up 垂直的單位向量
  front: THREE.Vector3;
};

/**
 * 建立房子，並種在球面上
 * 回傳的 settings 改完之後呼叫 applySettings() 就會套用，給控制面板用
 * 前提：房子要加成 ground pivot 的子物件（與綠球 mesh 同層），且球心在 pivot 原點，位置才會落在球面上
 */
export function createHouse({ groundRadius, up, front }: CreateHouseOptions) {
  const settings: HouseSettings = {
    width: HOUSE_WIDTH,
    height: HOUSE_HEIGHT,
    depth: HOUSE_DEPTH,
    scale: HOUSE_SCALE,
    color: HOUSE_COLOR,
    angleFromTopDegrees: THREE.MathUtils.radToDeg(HOUSE_ANGLE_FROM_TOP),
    azimuthDegrees: THREE.MathUtils.radToDeg(HOUSE_AZIMUTH),
    spinDegrees: THREE.MathUtils.radToDeg(HOUSE_SPIN),
    sink: HOUSE_SINK,
  };

  const material = new THREE.MeshPhongMaterial({
    // 光的顏色會跟材質顏色「相乘」：純綠 0x00ff00 的紅、藍都是 0，
    // 打黃光、紫光上去都只剩綠色（或全黑），所以預設色刻意混一點紅、藍，
    // 讓 main.ts 的黃色主光、紫色補光都有通道可以反射出來
    color: settings.color,
    // 光澤度：數值越大高光點越小越亮（像塑膠、瓷器），預設 30 偏霧面
    // 80 的高光很小，高光以外的牆面會顯得發暗；降一點，房子的顏色才出得來
    shininess: 36,
  });
  const mesh = new THREE.Mesh(createBoxGeometry(settings), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  // 暫存的向量、旋轉：applySettings 拖滑桿時每一格都會跑，重複利用避免一直 new
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const spin = new THREE.Quaternion();
  // 上一次的長寬高：沒變就不重建幾何
  let builtSize = `${settings.width},${settings.height},${settings.depth}`;

  /** 依照 settings 更新形狀、顏色、位置；長寬高有變才重建幾何（重建比較花時間） */
  function applySettings() {
    const size = `${settings.width},${settings.height},${settings.depth}`;
    if (size !== builtSize) {
      builtSize = size;
      // 舊的形狀要 dispose 釋放 GPU 記憶體，少了這步，拖拉滑桿時每一格都會殘留一份在顯示卡裡
      mesh.geometry.dispose();
      mesh.geometry = createBoxGeometry(settings);
    }
    mesh.scale.setScalar(settings.scale);
    material.color.set(settings.color);

    // 方位（經度）：把「正前方」繞著 up 轉 azimuth，得到水平方向
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    // 離頂端的角度（緯度）：從 up 往水平方向轉，cos / sin 就是在這兩個方向上各佔多少
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));

    // 球面上的點 = 球心（原點）沿著法線走一個半徑；球的法線就是「球心 → 該點」的方向
    // 再扣掉 sink：沿著同一條法線往球心退，房子就是「垂直」往地裡沉，不會歪掉或滑動
    mesh.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    // 站直：把房子自己的 +Y（屋頂方向）轉到跟法線同方向，牆壁就會垂直於地表
    // setFromUnitVectors(a, b)：算出「把 a 轉到 b」的旋轉，兩個都要是單位向量
    mesh.quaternion.setFromUnitVectors(Y_AXIS, normal);
    // 再繞著自己的屋頂方向轉 spin：乘在右邊 = 在「房子自己的座標」裡轉，不會把房子轉倒
    mesh.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));

    const conformOptions = {
      groundRadius,
      sink: settings.sink,
      normal,
      groundY: 0,
      groundBand: settings.height * 0.06,
    };
    conformGeometryToSphere(mesh.geometry, conformOptions);
    conformChildrenToSphere(mesh, conformOptions);
  }
  applySettings();

  // 暫存：setNormal 拖曳時每一格都會跑
  const horizontal = new THREE.Vector3();
  const side = new THREE.Vector3();

  /**
   * 反過來：給一個地表法線，換算回「離頂端角度 / 方位」寫進 settings 再套用
   * 給滑鼠拖曳用；寫回 settings 而不是直接改 position，控制面板的數字才會跟著變，放開時也能印出常數
   */
  function setNormal(target: THREE.Vector3) {
    // 離頂端角度：法線和 up 的夾角；clamp 避免浮點誤差讓 dot 超過 1，acos 會變成 NaN
    const angle = Math.acos(THREE.MathUtils.clamp(target.dot(up), -1, 1));
    // 方位：法線的「水平部分」相對於 front 轉了多少
    // side = up × front，是 front 繞著 up 轉 +90° 的方向，跟 applyAxisAngle 的正方向一致
    horizontal.copy(target).addScaledVector(up, -target.dot(up));
    side.crossVectors(up, front);
    // atan2(sin 分量, cos 分量)：能分出左右兩側，acos 只會給 0 ~ 180°
    const azimuth = Math.atan2(horizontal.dot(side), horizontal.dot(front));

    // 取整數度：跟控制面板的步進一致，印出來的常數也比較好讀
    settings.angleFromTopDegrees = Math.round(THREE.MathUtils.radToDeg(angle));
    settings.azimuthDegrees = Math.round(THREE.MathUtils.radToDeg(azimuth));
    applySettings();
  }

  return { object: mesh, settings, applySettings, getNormal: () => normal.clone(), setNormal };
}

function createBoxGeometry({ width, height, depth }: HouseSettings) {
  // BoxGeometry：長方體，三個參數依序是 x / y / z 方向的長度
  // 底面多加分段，貼球時弧面才光滑（平面四點會像折紙）
  const geometry = new THREE.BoxGeometry(width, height, depth, 10, 1, 10);
  // 把原點挪到底部中央：整個幾何往上移半個高度，範圍變成 0 ~ 高
  // 這樣「擺在地面上的某一點」就是貼地；少了這步，房子會有一半陷進地裡
  geometry.translate(0, height / 2, 0);
  return geometry;
}
