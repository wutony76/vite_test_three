import * as THREE from 'three';
import { cloneGltfInstance, loadGltfOnce, scheduleGltfMount } from './sharedGltf';

const SHIITAKE_URL = `${import.meta.env.BASE_URL}models/shiitake/shiitake.glb`;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
const tilt = new THREE.Quaternion();

/**
 * 綠球上的香菇。調完可用面板「印出設定」，再貼回 SHIITAKE_DEFAULT。
 *
 * shiitake.glb 的菇傘（含十字花刀）和菇柄是兩個獨立節點，所以：
 *   - capScale：只縮放菇傘（以菇傘底緣為中心）
 *   - stemHeight：只拉長／縮短菇柄（沿高度方向），菇傘會自動跟著落在菇柄頂端
 *   - capThickness：只改菇傘厚度（高度方向），直徑不變
 */
export type ShiitakeSettings = {
  enabled: boolean;
  angleFromTopDegrees: number;
  azimuthDegrees: number;
  spinDegrees: number;
  /** 往側邊歪一點，比較生動；0 = 垂直立在地表 */
  tiltDegrees: number;
  /** 整顆香菇（原始比例時）最長邊的長度，世界單位 */
  size: number;
  sink: number;
  /** 菇傘大小倍率：1 = 模型原始大小 */
  capScale: number;
  /** 菇柄高度倍率：1 = 模型原始高度 */
  stemHeight: number;
  /** 菇傘厚度倍率：只壓扁／拉高菇傘，不改直徑。< 1 更扁 */
  capThickness: number;
  /** 微微晃動的幅度（度）；0 = 不動 */
  swayDegrees: number;
  /** 晃動速度倍率 */
  swaySpeed: number;
  /** 菇傘顏色（傘面的主色；捲邊、菌褶會照原本的深淺比例跟著變） */
  capColor: string;
  /** 菇傘下掛一個蜜蜂巢（小豬經過時可能會飛出一群蜜蜂追牠） */
  beehive?: boolean;
  /** 蜂巢在菇柄的哪一邊（°，繞菇柄轉；洞口一直朝外） */
  hiveAngle?: number;
  /** 蜂巢離菇柄多遠：0 = 菇柄正下方，1 = 傘緣 */
  hiveRadius?: number;
  /** 蜂巢上下：0 = 預設高度；正值往上縮進菌褶，負值往下垂（以菇傘厚度為單位） */
  hiveLift?: number;
  /** 蜂巢大小倍率 */
  hiveSize?: number;
};

export const SHIITAKE_DEFAULT: ShiitakeSettings = {
  enabled: true,
  angleFromTopDegrees: 36,
  azimuthDegrees: -35,
  spinDegrees: 0,
  tiltDegrees: 6,
  size: 0.05,
  sink: 0.002,
  capScale: 1.25,
  stemHeight: 1.2,
  capThickness: 1,
  swayDegrees: 3,
  swaySpeed: 1,
  capColor: '#8a4b22',
};

/**
 * 綠球上所有香菇的擺設。面板「複製香菇」可以加好幾顆、各自調整；
 * 調完按「印出全部擺設」，把 console 的內容貼回這裡就會變成預設。
 */
export type ShiitakePlacement = ShiitakeSettings & { id: string };

export const SHIITAKE_PLACEMENTS: ShiitakePlacement[] = [
  {
    id: 'shiitake_1',
    enabled: true,
    angleFromTopDegrees: 36,
    azimuthDegrees: -35,
    spinDegrees: 0,
    tiltDegrees: 6,
    size: 0.05,
    sink: 0.002,
    capScale: 1.25,
    stemHeight: 1.2,
    capThickness: 1.0,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#8a4b22',
  },
  {
    id: 'shiitake_2',
    enabled: true,
    angleFromTopDegrees: 34,
    azimuthDegrees: 79,
    spinDegrees: 0,
    tiltDegrees: 6,
    size: 0.05,
    sink: 0.002,
    capScale: 2.25,
    stemHeight: 2.3,
    capThickness: 0.6,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#8a4b22',
  },
  {
    id: 'shiitake_3',
    enabled: true,
    angleFromTopDegrees: 33,
    azimuthDegrees: 85,
    spinDegrees: 0,
    tiltDegrees: 6,
    size: 0.05,
    sink: 0.002,
    capScale: 2.5,
    stemHeight: 4.25,
    capThickness: 0.6,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#6d433c',
    beehive: true,
    hiveAngle: -145,
    hiveRadius: 0.57,
    hiveLift: -0.37,
    hiveSize: 1,
  },
  {
    id: 'shiitake_4',
    enabled: true,
    angleFromTopDegrees: 39,
    azimuthDegrees: 138,
    spinDegrees: 0,
    tiltDegrees: 6,
    size: 0.05,
    sink: 0.002,
    capScale: 0.8,
    stemHeight: 1.05,
    capThickness: 0.6,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#9d4d4d',
  },
  {
    id: 'shiitake_5',
    enabled: true,
    angleFromTopDegrees: 41,
    azimuthDegrees: 133,
    spinDegrees: 0,
    tiltDegrees: 6,
    size: 0.05,
    sink: 0.002,
    capScale: 0.55,
    stemHeight: 1.05,
    capThickness: 0.6,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#7b5942',
  },
  {
    id: 'shiitake_6',
    enabled: true,
    angleFromTopDegrees: 44,
    azimuthDegrees: -115,
    spinDegrees: 0,
    tiltDegrees: 6,
    size: 0.05,
    sink: 0.002,
    capScale: 0.95,
    stemHeight: 1.85,
    capThickness: 0.6,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#a0615a',
  },
  {
    id: 'shiitake_7',
    enabled: true,
    angleFromTopDegrees: 21,
    azimuthDegrees: -125,
    spinDegrees: 0,
    tiltDegrees: 6,
    size: 0.05,
    sink: 0.002,
    capScale: 0.7,
    stemHeight: 1.05,
    capThickness: 0.6,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#a0615a',
  },
  {
    id: 'shiitake_8',
    enabled: true,
    angleFromTopDegrees: 11,
    azimuthDegrees: 55,
    spinDegrees: 116,
    tiltDegrees: 21,
    size: 0.04,
    sink: 0.002,
    capScale: 1.25,
    stemHeight: 2.05,
    capThickness: 0.7,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#65496f',
  },
  {
    id: 'shiitake_9',
    enabled: true,
    angleFromTopDegrees: 14,
    azimuthDegrees: 50,
    spinDegrees: 116,
    tiltDegrees: 11,
    size: 0.04,
    sink: 0.002,
    capScale: 2.45,
    stemHeight: 4.05,
    capThickness: 0.7,
    swayDegrees: 3,
    swaySpeed: 1,
    capColor: '#6e4545',
  },
];

type CreateShiitakeOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: ShiitakeSettings;
};

/**
 * 卡通蜜蜂巢：胖胖的水滴形（上窄下寬），一圈一圈橫向的鼓起（深淺金黃相間），
 * 下半部正面一個深色圓洞（蜜蜂進出口），底部一滴蜂蜜；頂端一小段細枝綁在菇傘底下。
 * 原點 = 吊掛點（頂端），往 -y 垂下來；height 是蜂巢本體高度（世界單位）。
 */
function buildBeehive(height: number) {
  const group = new THREE.Group();
  group.name = 'shiitake_beehive';
  const W = height * 0.46; // 最寬處的半徑
  const RINGS = 5;
  const profile: THREE.Vector2[] = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40; // 0 = 頂端，1 = 底部
    // 水滴形：頂端窄、偏下最胖、底部收圓；再加一圈圈鼓起（cos 讓每一圈中間最鼓）
    const base = Math.sin(Math.PI * Math.pow(t, 0.75));
    const ridge = 1 + 0.07 * Math.cos(t * RINGS * Math.PI * 2);
    profile.push(new THREE.Vector2(Math.max(0.0005, W * base * ridge), -t * height));
  }
  const body = new THREE.LatheGeometry(profile, 28);
  // 一圈深、一圈淺的金黃色（頂點色）
  const pos = body.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Color('#ffc94a');
  const dark = new THREE.Color('#e59a2a');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = -pos.getY(i) / height;
    const band = 0.5 + 0.5 * Math.cos(t * RINGS * Math.PI * 2);
    c.copy(dark).lerp(light, band);
    c.toArray(colors, i * 3);
  }
  body.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const bodyMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0,
    emissive: 0xffa21f,
    emissiveIntensity: 0.12, // 一點暖暖的自發光，在菇傘陰影下也看得到
  });
  const hive = new THREE.Mesh(body, bodyMaterial);
  hive.castShadow = true;
  group.add(hive);
  // 進出口：下半部正面一個深色扁圓
  const holeY = -height * 0.62;
  const holeR = W * 0.95; // 洞口那一圈的大概半徑
  const hole = new THREE.Mesh(new THREE.SphereGeometry(W * 0.26, 16, 10), new THREE.MeshStandardMaterial({ color: 0x4a2a14, roughness: 0.9 }));
  hole.scale.set(1, 0.8, 0.35);
  hole.position.set(0, holeY, holeR);
  group.add(hole);
  // 蜜蜂飛出來的位置（洞口正前方一點）
  const mouth = new THREE.Object3D();
  mouth.name = 'shiitake_beehive_mouth';
  mouth.position.set(0, holeY, holeR + W * 0.3);
  group.add(mouth);
  // 底部一滴蜂蜜
  const drip = new THREE.Mesh(
    new THREE.SphereGeometry(W * 0.16, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffa31a, roughness: 0.2, emissive: 0xff8a00, emissiveIntensity: 0.25 }),
  );
  drip.scale.set(1, 1.4, 1);
  drip.position.set(W * 0.15, -height * 1.02, 0);
  group.add(drip);
  // 頂端的細枝（往上伸進菇傘底下）
  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.07, W * 0.09, height * 0.35, 8), new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.8 }));
  stalk.position.y = height * 0.12;
  group.add(stalk);
  return { group, mouth };
}

export function createShiitake({ groundRadius, up, front, envMap, layout = SHIITAKE_DEFAULT }: CreateShiitakeOptions) {
  const settings: ShiitakeSettings = { ...layout };

  const anchor = new THREE.Object3D();
  anchor.name = 'shiitake';
  let model: THREE.Object3D | null = null;
  let cap: THREE.Object3D | null = null;
  let stem: THREE.Object3D | null = null;
  let introGrow = 1;
  /** 模型還沒載入就被選中時，載入後要補上高亮 */
  let highlighted = false;
  /**
   * 晃動用的中間層：anchor（決定位置、朝向）→ sway（晃動）→ model。
   * 模型的原點在菇柄底部，所以轉 sway 就是「以菇柄底部為支點」左右擺，菇柄不會離開地面。
   */
  const sway = new THREE.Group();
  sway.name = 'shiitake_sway';
  anchor.add(sway);
  // 每顆香菇的晃動節奏都不一樣（隨機相位、速度差一點），整排一起晃才不會像機器
  const swayPhase = Math.random() * Math.PI * 2;
  const swayRate = 0.85 + Math.random() * 0.3;
  let swayTime = 0;
  /** 菇柄、菇傘在原始比例下的尺寸（菇傘／菇柄節點自己的局部單位） */
  const measure = { stemTop: 0, capUnderside: 0, bury: 0, capBaseY: 0, measured: false };
  /**
   * 節點原本的縮放：meshopt 壓縮會把頂點存成整數、再用節點縮放還原，所以節點縮放不一定是 1。
   * 套用倍率時要「原本 × 倍率」，直接設成倍率會把模型縮成一團。
   */
  const baseStemScale = new THREE.Vector3(1, 1, 1);
  const baseCapScale = new THREE.Vector3(1, 1, 1);
  /** 菇傘下的蜜蜂巢（settings.beehive 開著才有） */
  let beehive: ReturnType<typeof buildBeehive> | null = null;
  let beehiveKey = '';
  /** 量到的菇傘範圍（sway 座標）：擺蜂巢位置用 */
  const capMeasure = { radius: 0, bottom: 0, height: 0 };
  // 蜂巢位置的預設值（舊的擺設沒有這幾個欄位）
  settings.beehive ??= false;
  settings.hiveAngle ??= 0;
  settings.hiveRadius ??= 0.5;
  settings.hiveLift ??= 0;
  settings.hiveSize ??= 1;

  /** 只擺位置（拖滑桿時不用重建蜂巢） */
  function positionBeehive() {
    if (!beehive) return;
    const angle = THREE.MathUtils.degToRad(settings.hiveAngle ?? 0);
    const r = capMeasure.radius * (settings.hiveRadius ?? 0.5);
    const y = capMeasure.bottom + capMeasure.height * (0.18 + (settings.hiveLift ?? 0));
    beehive.group.position.set(Math.cos(angle) * r, y, -Math.sin(angle) * r);
    // 洞口在蜂巢模型的 +z；轉 angle + 90° 讓洞口朝外（背對菇柄）
    beehive.group.rotation.y = angle + Math.PI / 2;
  }

  /**
   * 掛蜜蜂巢：量出菇傘在 sway 座標裡的範圍（傘緣多低、多寬），掛在傘緣往內一點的底下。
   * 掛在 sway 上（不是菇傘節點上）：菇傘被壓扁／拉寬時蜂巢才不會跟著變形；整顆香菇晃，蜂巢也跟著晃。
   */
  function placeBeehive() {
    const want = !!settings.beehive && !!cap;
    const key = want ? [settings.size, settings.capScale, settings.stemHeight, settings.capThickness, settings.hiveSize].join('|') : 'none';
    if (key === beehiveKey) {
      positionBeehive();
      return;
    }
    beehiveKey = key;
    if (beehive) {
      sway.remove(beehive.group);
      beehive.group.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      beehive = null;
    }
    if (!want || !cap) return;
    // 量菇傘在 sway 座標裡的包圍盒：從菇傘節點往上一層層乘「局部矩陣」乘到 sway 為止
    // （不經過世界座標：開場時 anchor 縮到 0.0001，用世界座標再換回來會算錯，蜂巢會被埋進地裡）
    // 晃動的旋轉暫時不算（用歸零的矩陣），量的是香菇站直時的樣子
    const capNode = cap as THREE.Object3D;
    const capMesh = capNode as THREE.Mesh;
    capMesh.geometry.computeBoundingBox();
    const toSway = new THREE.Matrix4();
    const local = new THREE.Matrix4();
    const still = new THREE.Quaternion();
    for (let node: THREE.Object3D | null = capNode; node && node !== sway; node = node.parent) {
      // 菇傘自己有晃動的旋轉：量的時候當作沒轉
      local.compose(node.position, node === capNode ? still : node.quaternion, node.scale);
      toSway.premultiply(local);
    }
    const box = capMesh.geometry.boundingBox!.clone().applyMatrix4(toSway);
    const capRadius = (box.max.x - box.min.x) / 2;
    const capHeight = box.max.y - box.min.y;
    capMeasure.radius = capRadius;
    capMeasure.bottom = box.min.y;
    capMeasure.height = capHeight;
    beehive = buildBeehive(capRadius * 0.72 * Math.max(0.2, settings.hiveSize ?? 1));
    sway.add(beehive.group);
    // 預設掛在傘緣往內一半、略高於傘緣最低點（看起來是從菌褶裡垂下來）
    positionBeehive();
  }

  function currentNormal(target: THREE.Vector3) {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    return target.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));
  }

  function applyPlacement() {
    anchor.visible = settings.enabled;
    currentNormal(normal);
    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.quaternion.multiply(tilt.setFromAxisAngle(X_AXIS, THREE.MathUtils.degToRad(settings.tiltDegrees)));
    anchor.scale.setScalar(Math.max(0.0001, introGrow));
  }

  /**
   * 量出「菇傘要放多高」需要的數字（只在載入時量一次）：
   *   stemTop：菇柄頂端高度
   *   capUnderside：菇傘底面「正中央」離菇傘原點多高（菇柄插進去的地方）
   *   bury：原始模型裡菇柄插進菇傘多深 → 調整後維持一樣深，才不會露縫或穿出菇傘頂
   */
  function measureParts() {
    if (!cap || !stem) return;
    const stemMesh = stem as THREE.Mesh;
    stemMesh.geometry.computeBoundingBox();
    const stemBox = stemMesh.geometry.boundingBox!;
    const stemRadius = Math.max(stemBox.max.x, stemBox.max.z);
    measure.stemTop = stemBox.max.y * stem.scale.y;

    const capMesh = cap as THREE.Mesh;
    const position = capMesh.geometry.getAttribute('position');
    let underside = Infinity;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const z = position.getZ(i);
      // 菇柄正上方那一圈（半徑比菇柄小）的最低點 = 菌褶中央
      if (x * x + z * z < stemRadius * stemRadius * 0.64) underside = Math.min(underside, position.getY(i));
    }
    measure.capUnderside = Number.isFinite(underside) ? underside * cap.scale.y : 0;
    measure.capBaseY = cap.position.y;
    measure.bury = measure.stemTop - (cap.position.y + measure.capUnderside);
    measure.measured = true;
  }

  /** 套用菇傘大小、菇柄高度 */
  function applyShape() {
    if (!cap || !stem) return;
    const stemScale = Math.max(0.05, settings.stemHeight);
    const capScale = Math.max(0.05, settings.capScale);
    stem.scale.set(baseStemScale.x, baseStemScale.y * stemScale, baseStemScale.z);
    const thickness = Math.max(0.1, settings.capThickness);
    cap.scale.set(baseCapScale.x * capScale, baseCapScale.y * capScale * thickness, baseCapScale.z * capScale);
    // 菇傘底面中央 = 菇柄頂端往下 bury；菇柄太短時菇傘最低只到貼地（傘緣不鑽進土裡）
    // 菇傘變薄時，插入深度也跟著變淺（不然菇柄頂端會從薄薄的菇傘頂穿出來）
    const y = measure.stemTop * stemScale - measure.bury * Math.min(1, thickness) - measure.capUnderside * capScale * thickness;
    cap.position.y = Math.max(0, y);
  }

  function fitModel(root: THREE.Object3D) {
    // 以原始比例量大小：不受目前的菇傘／菇柄倍率影響，調倍率時整體大小才不會跟著跳
    root.scale.setScalar(1);
    root.position.set(0, 0, 0);
    if (cap && stem && measure.measured) {
      stem.scale.copy(baseStemScale);
      cap.scale.copy(baseCapScale);
      cap.position.y = measure.capBaseY;
    }
    // 暫時從場景拿下來再量：setFromObject 量的是世界座標，掛在綠球上時會把綠球的位置、旋轉一起算進去，
    // 算出來的置中位移就錯了（香菇會飛走）。
    const parent = root.parent;
    parent?.remove(root);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    parent?.add(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = settings.size / Math.max(size.x, size.y, size.z, 1e-6);
    root.scale.setScalar(scale);
    root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  }

  function prepareMaterials(root: THREE.Object3D) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('roughness' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.metalness = 0;
        if (envMap) {
          m.envMap = envMap;
          // 菇傘表面有一點油亮感（參考圖的醬油光澤）
          m.envMapIntensity = 0.35;
        }
      }
    });
  }

  loadGltfOnce(SHIITAKE_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        model = cloneGltfInstance(gltf.scene);
        model.name = 'shiitake_model';
        model.traverse((child) => {
          if (child.name.endsWith('_cap')) cap = child;
          else if (child.name.endsWith('_stem')) stem = child;
        });
        if (cap) baseCapScale.copy((cap as THREE.Object3D).scale);
        if (stem) baseStemScale.copy((stem as THREE.Object3D).scale);
        fitModel(model);
        measureParts();
        applyShape();
        prepareMaterials(model);
        prepareCapPaint();
        applyCapColor();
        sway.add(model);
        if (highlighted) setHighlight(true);
        applyPlacement();
        placeBeehive();
      });
    })
    .catch((error) => console.error(`[shiitake] 載入失敗：${SHIITAKE_URL}`, error));

  applyPlacement();

  function applySettings() {
    if (model) {
      fitModel(model);
      applyShape();
      applyCapColor();
      placeBeehive();
    }
    applyPlacement();
  }

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1.5);
    anchor.scale.setScalar(Math.max(0.0001, introGrow));
  }

  /** 每幀呼叫：整顆以菇柄底部為支點輕輕擺動，菇傘再晚一點、多擺一點（看起來軟軟的） */
  function update(deltaTime: number) {
    swayTime += deltaTime * Math.max(0, settings.swaySpeed) * swayRate;
    const amount = THREE.MathUtils.degToRad(settings.swayDegrees);
    const t = swayTime + swayPhase;
    // 兩個方向用不同頻率：軌跡是不規則的小圓，而不是只在一條線上來回
    sway.rotation.x = Math.sin(t * 1.3) * amount;
    sway.rotation.z = Math.sin(t * 0.9 + 1.1) * amount * 0.8;
    if (cap) {
      // 菇傘比菇柄慢半拍（相位往後），像有點重量在甩
      const capNode = cap as THREE.Object3D;
      capNode.rotation.x = Math.sin(t * 1.3 - 0.6) * amount * 0.6;
      capNode.rotation.z = Math.sin(t * 0.9 + 0.5) * amount * 0.5;
    }
  }

  /**
   * 換菇傘顏色：每顆香菇的菇傘各自一份「重新上色」的貼圖。
   *
   * 為什麼不直接改 material.color：顏色在 palette 貼圖裡，material.color 是「乘」上去的。
   * 原本的咖啡色幾乎沒有藍色成分，乘多少都變不成藍色（實測會變灰綠色）。
   * 所以改成：把貼圖畫到 canvas，每個像素換成「目標色 × 這格原本相對傘面的亮度」。
   *   → 傘面剛好是目標色；捲邊、菌褶原本比較暗，換色後一樣比較暗，層次還在。
   * 這張 canvas 只給菇傘用（菇傘 mesh 的 UV 只會讀到菇傘的色格），十字花刀和菇柄不受影響。
   */
  const CAP_BASE_LUMA = luma(0x8a, 0x4b, 0x22); // plan 的 cap 材質 #8A4B22
  const capColorPick = new THREE.Color();
  let capPaint: { context: CanvasRenderingContext2D; original: ImageData; output: ImageData; texture: THREE.Texture } | null =
    null;

  function prepareCapPaint() {
    if (!cap) return;
    const mesh = cap as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const image = material.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!material.map || !image?.width) return;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0);
    // 複製一份貼圖物件（沿用 NEAREST、flipY=false、sRGB 等設定），換成自己的 canvas：
    // 原本的貼圖是所有香菇共用的，直接改會讓每一顆一起變色
    // 注意：texture.clone() 會「共用」同一個 Source（圖片來源），直接設 texture.image 會改到共用的那張，
    // 所有香菇（連十字花刀、菇柄）都會一起被染色。所以要給它一個全新的 Source。
    // （新版 three.js 把 THREE.Source 改名成 THREE.TextureSource，用舊名字會跳警告）
    const texture = material.map.clone();
    texture.source = new THREE.TextureSource(canvas);
    texture.needsUpdate = true;
    material.map = texture;
    capPaint = {
      context,
      original: context.getImageData(0, 0, canvas.width, canvas.height),
      output: context.createImageData(canvas.width, canvas.height),
      texture,
    };
  }

  function applyCapColor() {
    if (!capPaint) return;
    // getHex() 是 sRGB（選色器上看到的值）；capColorPick.r 是線性空間，直接 ×255 顏色會變深
    const rgb = capColorPick.set(settings.capColor).getHex();
    const tr = (rgb >> 16) & 255;
    const tg = (rgb >> 8) & 255;
    const tb = rgb & 255;
    const src = capPaint.original.data;
    const dst = capPaint.output.data;
    for (let i = 0; i < src.length; i += 4) {
      const k = luma(src[i], src[i + 1], src[i + 2]) / CAP_BASE_LUMA;
      dst[i] = Math.min(255, tr * k);
      dst[i + 1] = Math.min(255, tg * k);
      dst[i + 2] = Math.min(255, tb * k);
      dst[i + 3] = src[i + 3];
    }
    capPaint.context.putImageData(capPaint.output, 0, 0);
    capPaint.texture.needsUpdate = true;
  }

  /** 面板選中時讓這顆微微發亮，看得出現在在調哪一顆 */
  function setHighlight(on: boolean) {
    model?.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!('emissive' in material)) continue;
        const m = material as THREE.MeshStandardMaterial;
        m.emissive.setHex(on ? 0xffe2a8 : 0x000000);
        m.emissiveIntensity = on ? 0.3 : 0;
      }
    });
    highlighted = on;
  }

  function dispose() {
    anchor.removeFromParent();
    capPaint?.texture.dispose();
    model?.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
    model = null;
  }

  function setNormal(target: THREE.Vector3) {
    const angle = Math.acos(THREE.MathUtils.clamp(target.dot(up), -1, 1));
    horizontal.copy(target).addScaledVector(up, -target.dot(up));
    side.crossVectors(up, front);
    const azimuth = Math.atan2(horizontal.dot(side), horizontal.dot(front));
    settings.angleFromTopDegrees = Math.round(THREE.MathUtils.radToDeg(angle));
    settings.azimuthDegrees = Math.round(THREE.MathUtils.radToDeg(azimuth));
    applyPlacement();
  }

  return {
    object: anchor,
    settings,
    applySettings,
    setIntroGrow,
    update,
    setNormal,
    setHighlight,
    dispose,
    getNormal: () => currentNormal(new THREE.Vector3()),
    /** 蜜蜂巢洞口的世界座標；這顆沒有蜂巢（或模型還沒載入）回傳 null */
    getBeehiveMouth: (target: THREE.Vector3) => {
      if (!beehive || !settings.enabled) return null;
      return beehive.mouth.getWorldPosition(target);
    },
  };
}

export function formatShiitakePlacementsForPaste(entries: Array<{ id: string; settings: ShiitakeSettings }>) {
  const lines = entries.map(({ id, settings: s }) =>
    `  {\n` +
    `    id: '${id}',\n` +
    `    enabled: ${s.enabled},\n` +
    `    angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
    `    azimuthDegrees: ${s.azimuthDegrees},\n` +
    `    spinDegrees: ${s.spinDegrees},\n` +
    `    tiltDegrees: ${s.tiltDegrees},\n` +
    `    size: ${s.size.toFixed(3)},\n` +
    `    sink: ${s.sink.toFixed(3)},\n` +
    `    capScale: ${s.capScale.toFixed(2)},\n` +
    `    stemHeight: ${s.stemHeight.toFixed(2)},\n` +
    `    capThickness: ${s.capThickness.toFixed(2)},\n` +
    `    swayDegrees: ${s.swayDegrees.toFixed(1)},\n` +
    `    swaySpeed: ${s.swaySpeed.toFixed(2)},\n` +
    `    capColor: '${s.capColor}',\n` +
    (s.beehive
      ? `    beehive: true,\n` +
        `    hiveAngle: ${s.hiveAngle ?? 0},\n` +
        `    hiveRadius: ${(s.hiveRadius ?? 0.5).toFixed(2)},\n` +
        `    hiveLift: ${(s.hiveLift ?? 0).toFixed(2)},\n` +
        `    hiveSize: ${(s.hiveSize ?? 1).toFixed(2)},\n`
      : '') +
    `  },`,
  );
  return (
    `// 貼回 src/world/objects/shiitake.ts 的 SHIITAKE_PLACEMENTS\n` +
    `export const SHIITAKE_PLACEMENTS: ShiitakePlacement[] = [\n` +
    lines.join('\n') +
    `\n];`
  );
}
