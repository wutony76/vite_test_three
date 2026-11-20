import * as THREE from 'three';
import { createRng, PartBucket } from './partBucket';
import {
  BANANA_LEAF_CLUSTER_DEFAULT,
  type BananaLeafClusterLayout,
  type BananaLeafLayout,
} from './bananaLeavesLayout';

/**
 * 綠球上的「芭蕉葉叢」（獨立物件，不跟豬屋綁在一起）：預設 6 片大芭蕉葉排成 A 字葉棚。
 *
 * 每片葉子的位置用「隱形參考橢球」當座標系：葉片中心掛在橢球表面某一點上方（方位、仰角、離表面距離）。
 * 這顆橢球跟原本豬屋的身體一樣大、中心埋在地面下，所以原本長在豬屋上的葉子設定可以原封不動沿用。
 *
 * 可以做的事：
 *   - 整叢：在綠球上拖曳、複製、移除（跟檸檬片一樣）；整組旋轉／前後傾／左右傾／放大／上升下降
 *   - 單片：點選、Alt 拖曳（沿橢球表面移動）、Shift 上下拖（上浮）、面板調整、複製、移除
 *
 * 模型座標：y 朝上、地面在 y = 0；size 把模型單位換成世界單位。
 */

const UP = new THREE.Vector3(0, 1, 0);
/** 隱形參考橢球：大小跟豬屋身體一樣，中心在地面下（葉棚的屋簷剛好落在地面附近） */
const BODY_CENTER = new THREE.Vector3(0, -0.25, 0);
const BODY_RADII = new THREE.Vector3(0.4, 0.4 * 0.92, 0.4 * 1.04);

/** 橢球表面某個方位、仰角的位置矩陣（局部 +z 朝外） */
type BodySurface = (azimuthDeg: number, elevationDeg: number, out?: number) => THREE.Matrix4;

const surface: BodySurface = (azimuthDeg, elevationDeg, out = 0) => {
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  const e = THREE.MathUtils.degToRad(elevationDeg);
  const dir = new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
  const point = new THREE.Vector3(dir.x * BODY_RADII.x, dir.y * BODY_RADII.y, dir.z * BODY_RADII.z).add(BODY_CENTER);
  // 橢球法線 = 方向除以半徑平方（壓扁的方向法線比較陡）
  const n = new THREE.Vector3(dir.x / BODY_RADII.x, dir.y / BODY_RADII.y, dir.z / BODY_RADII.z).normalize();
  point.addScaledVector(n, out);
  const x = new THREE.Vector3().crossVectors(UP, n);
  if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(n, x);
  return new THREE.Matrix4().makeBasis(x, y, n).setPosition(point);
};

// ── 葉片幾何 ──

/**
 * 芭蕉葉：沿著一條往下彎的葉脈長出寬寬的葉面。
 *   局部座標：y = 葉子長的方向，z = 葉面正面，x = 寬度
 *   - 寬度輪廓 sin(π t^0.8)：根部窄、中段最寬、尖端收起來
 *   - 橫向微微折成 V 形（中間葉脈高、兩邊往下），葉緣再加一點波浪
 *   - 撕裂縫：芭蕉葉被風吹會沿著側脈裂開，這裡隨機挑幾排、從葉緣挖掉一條細縫
 *   - 頂點色：葉脈淺黃綠 → 葉緣深綠
 */
function bananaLeaf(length: number, width: number, curl: number, rng: () => number, baseColor: string) {
  const ROWS = 28;
  const COLS = 10; // 必須是偶數，中間那條線就是葉脈
  const positions: number[] = [];
  const colors: number[] = [];
  const mid = new THREE.Color(baseColor);
  const rib = mid.clone().offsetHSL(0.03, -0.1, 0.17); // 葉脈：偏黃、比較亮
  const edge = mid.clone().offsetHSL(0, 0, -0.12); // 葉緣：深一點
  const c = new THREE.Color();
  for (let j = 0; j <= ROWS; j++) {
    const t = j / ROWS;
    const w = width * Math.sin(Math.PI * Math.pow(t, 0.8)) * (t < 0.04 ? t / 0.04 : 1) + width * 0.02;
    const y = length * t;
    const bend = -curl * length * t * t; // 越往尖端越往下垂
    for (let i = 0; i <= COLS; i++) {
      const u = (i / COLS) * 2 - 1;
      const x = (u * w) / 2;
      const fold = -Math.abs(u) * w * 0.18;
      const wave = Math.sin(t * 40 + u * 2) * 0.006 * Math.abs(u) * width * 4;
      positions.push(x, y, bend + fold + wave);
      const a = Math.abs(u);
      if (a < 0.1) c.copy(rib);
      else c.copy(mid).lerp(edge, (a - 0.1) / 0.9);
      c.offsetHSL(0, 0, (t - 0.5) * 0.04);
      colors.push(c.r, c.g, c.b);
    }
  }
  // 撕裂縫：每片 2 道，左右隨機，只從葉緣裂到一半
  const tears = new Set<string>();
  for (let k = 0; k < 2; k++) {
    const row = 8 + Math.floor(rng() * (ROWS - 12));
    const side = rng() < 0.5 ? -1 : 1;
    tears.add(`${row},${side}`);
  }
  const indices: number[] = [];
  const index = (i: number, j: number) => j * (COLS + 1) + i;
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const u = ((i + 0.5) / COLS) * 2 - 1;
      const side = u < 0 ? -1 : 1;
      if (Math.abs(u) > 0.45 && tears.has(`${j},${side}`)) continue;
      indices.push(index(i, j), index(i + 1, j), index(i + 1, j + 1), index(i, j), index(i + 1, j + 1), index(i, j + 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * 一片芭蕉葉，操作中心點在葉片中心：
 *   1. 中心點 C = 身體表面 (azimuth, elevation) 那一點，再沿表面法線往外 lift、往正上方浮 rise
 *   2. 葉脈方向：從垂直往外倒 tilt 度，再以法線為軸轉 yaw 度；葉面大致朝上、偏外，再繞葉脈自轉 roll 度
 *   3. 葉片沿葉脈置中擺在 C：不管怎麼轉，都是繞著 C 轉（不會像以前繞葉柄根部甩出去）
 */
function buildBananaLeaf(layout: BananaLeafLayout, surface: BodySurface, seed: number) {
  const rng = createRng(seed);
  const s = 1;
  const base = surface(layout.azimuth, layout.elevation, 0);
  const outward = new THREE.Vector3().setFromMatrixColumn(base, 2).normalize();
  const center = new THREE.Vector3()
    .setFromMatrixPosition(base)
    .addScaledVector(outward, layout.lift * s)
    .addScaledVector(UP, (layout.rise ?? 0) * s);
  const tilt = THREE.MathUtils.degToRad(layout.tilt);
  const spine = UP.clone()
    .multiplyScalar(Math.cos(tilt))
    .addScaledVector(outward, Math.sin(tilt))
    .normalize()
    .applyAxisAngle(outward, THREE.MathUtils.degToRad(layout.yaw));
  const faceHint = UP.clone().addScaledVector(outward, 0.6).normalize();
  let face = faceHint.addScaledVector(spine, -faceHint.dot(spine));
  if (face.lengthSq() < 1e-6) face = outward.clone().addScaledVector(spine, -outward.dot(spine));
  face.normalize().applyAxisAngle(spine, THREE.MathUtils.degToRad(layout.roll));
  const width = new THREE.Vector3().crossVectors(spine, face).normalize();
  // 向下旋轉（俯仰）：繞寬度軸轉，葉脈與葉面一起轉。正值讓葉尖往葉面的反方向（往下）倒
  const pitch = THREE.MathUtils.degToRad(layout.pitch ?? 0);
  spine.applyAxisAngle(width, -pitch);
  face.applyAxisAngle(width, -pitch);
  const length = Math.max(0.05, layout.length) * s;
  // 葉子會下垂（局部座標裡葉脈在 t 處往 -z 彎 droop·L·t²），中點 t = 0.5 的位置是 (0, L/2, -droop·L/4)。
  // 讓這個「彎曲後的中點」剛好落在 C，旋轉時葉子才不會繞著一個偏掉的點甩
  const midBend = -layout.droop * length * 0.25;
  const pose = new THREE.Matrix4()
    .makeBasis(width, spine, face)
    .setPosition(center.clone().addScaledVector(spine, -length / 2).addScaledVector(face, -midBend));
  const bucket = new PartBucket();
  bucket.add(bananaLeaf(length, Math.max(0.03, layout.width) * s, layout.droop, rng, layout.color), pose, null);
  return bucket.build() ?? new THREE.BufferGeometry();
}

/** 身體上 (azimuth, elevation) 對應到「單位球」上的方向（隱形身體代理的局部座標） */
function bodyDirection(azimuthDeg: number, elevationDeg: number, target = new THREE.Vector3()) {
  const a = THREE.MathUtils.degToRad(azimuthDeg);
  const e = THREE.MathUtils.degToRad(elevationDeg);
  return target.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}


// ── 擺到綠球上 ──

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const direction = new THREE.Vector3();
const normal = new THREE.Vector3();
const horizontal = new THREE.Vector3();
const side = new THREE.Vector3();
const spin = new THREE.Quaternion();
const HIGHLIGHT = new THREE.Color('#ffb36b');
const BLACK = new THREE.Color(0x000000);

/** 一片芭蕉葉對外的介面（面板、拖曳用） */
export type BananaLeaf = {
  id: string;
  label: string;
  object: THREE.Object3D;
  readonly settings: BananaLeafLayout;
  apply: () => void;
  setHighlighted: (value: boolean) => void;
  /** 拖曳開始：記下滑鼠與葉子中心的相對位置 */
  beginDrag: (ray: THREE.Ray) => boolean;
  /** 拖曳中：葉子中心沿著參考橢球表面跟著滑鼠移動 */
  moveToRay: (ray: THREE.Ray) => boolean;
  remove: () => boolean;
};

export type BananaLeafClusterSettings = BananaLeafClusterLayout;

type CreateBananaLeafClusterOptions = {
  groundRadius: number;
  up: THREE.Vector3;
  front: THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: BananaLeafClusterLayout;
};

export function createBananaLeafCluster({
  groundRadius,
  up,
  front,
  envMap,
  layout = BANANA_LEAF_CLUSTER_DEFAULT,
}: CreateBananaLeafClusterOptions) {
  // leaves 是陣列：要深複製，不然複製出來的葉叢會跟原本的共用同一組葉子設定
  const settings: BananaLeafClusterSettings = { ...layout, leaves: layout.leaves.map((leaf) => ({ ...leaf })) };

  const anchor = new THREE.Object3D();
  anchor.name = 'banana_leaf_cluster';
  const model = new THREE.Group();
  anchor.add(model);
  // 整組旋轉／縮放／上升：pivot 放在參考橢球中心上方一點（葉棚中間），inner 退回去
  const PIVOT = new THREE.Vector3(0, BODY_CENTER.y + 0.6, 0);
  const pivot = new THREE.Group();
  pivot.name = 'banana_leaf_pivot';
  const inner = new THREE.Group();
  inner.position.copy(PIVOT).negate();
  pivot.add(inner);
  model.add(pivot);
  // 拖曳單片葉子用的隱形參考橢球：放在 layer 31，一般的點選射線（layer 0）打不到它，不會誤選
  const bodyProxy = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial());
  bodyProxy.visible = false;
  bodyProxy.layers.set(31);
  bodyProxy.position.copy(BODY_CENTER);
  bodyProxy.scale.copy(BODY_RADII);
  inner.add(bodyProxy);

  type LeafRuntime = {
    id: string;
    settings: BananaLeafLayout;
    mesh: THREE.Mesh;
    material: THREE.MeshStandardMaterial;
    builtKey: string;
    highlighted: boolean;
    /** 撕裂縫等細節的亂數種子：建立時就固定，之後加減別片葉子也不會變 */
    seed: number;
    exposed: BananaLeaf;
  };
  const leaves: LeafRuntime[] = [];
  let leafSerial = 0;
  let introGrow = 1;
  let highlighted = false;

  // DoubleSide：葉子只有一層面，背面也要畫出來；再加一點跟葉色一樣的自發光當透光感，背光面不會黑掉
  const createLeafMaterial = () => {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.6,
      metalness: 0,
      envMap: envMap ?? null,
      envMapIntensity: 0.25,
    });
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.28;',
      );
    };
    material.customProgramCacheKey = () => 'banana-leaf-v1';
    return material;
  };

  function createLeaf(layoutLeaf: BananaLeafLayout) {
    leafSerial += 1;
    const material = createLeafMaterial();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.name = `banana_leaf_${leafSerial}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    inner.add(mesh);
    // exposed 要用 leaf 本身建出來，所以先放 null 佔位、下一行補上
    const leaf: LeafRuntime = {
      id: `leaf_${leafSerial}`,
      settings: layoutLeaf,
      mesh,
      material,
      builtKey: '',
      highlighted: false,
      seed: leafSerial * 31 + 7,
      exposed: null as unknown as BananaLeaf,
    };
    leaf.exposed = exposeLeaf(leaf);
    leaves.push(leaf);
    applyLeafVisuals(leaf);
    return leaf;
  }

  /** 只在這片葉子自己的設定改變時重建 */
  function rebuildLeaf(leaf: LeafRuntime) {
    const key = JSON.stringify(leaf.settings);
    if (key === leaf.builtKey) return;
    leaf.builtKey = key;
    leaf.mesh.geometry.dispose();
    leaf.mesh.geometry = buildBananaLeaf(leaf.settings, surface, leaf.seed);
  }

  function rebuildLeaves() {
    // settings.leaves 是存檔用的陣列，leaves 是畫面上的 mesh：兩邊數量對齊
    while (leaves.length < settings.leaves.length) createLeaf(settings.leaves[leaves.length]);
    for (let i = 0; i < leaves.length; i++) leaves[i].settings = settings.leaves[i];
    for (const leaf of leaves) rebuildLeaf(leaf);
  }

  function applyLeafVisuals(leaf: LeafRuntime) {
    leaf.material.color.setScalar(settings.colorBoost);
    const glow = leaf.highlighted || highlighted;
    leaf.material.emissive.copy(glow ? HIGHLIGHT : BLACK);
    leaf.material.emissiveIntensity = leaf.highlighted ? 0.35 : glow ? 0.22 : 0;
  }

  /** 複製一片葉子（沒給就用第一片當範本），往旁邊轉一點才不會疊在一起 */
  function addLeaf(seed?: Partial<BananaLeafLayout>) {
    const template = settings.leaves[0] ?? BANANA_LEAF_CLUSTER_DEFAULT.leaves[0];
    const layoutLeaf: BananaLeafLayout = { ...template, ...seed };
    layoutLeaf.yaw = ((layoutLeaf.yaw + 25 + 180) % 360) - 180;
    settings.leaves.push(layoutLeaf);
    rebuildLeaves();
    return leaves[leaves.length - 1].exposed;
  }

  function removeLeaf(id: string) {
    const index = leaves.findIndex((leaf) => leaf.id === id);
    if (index < 0) return false;
    const [leaf] = leaves.splice(index, 1);
    settings.leaves.splice(index, 1);
    leaf.mesh.removeFromParent();
    leaf.mesh.geometry.dispose();
    leaf.material.dispose();
    return true;
  }

  // ── 拖曳單片葉子：射線換到隱形橢球自己的座標（在那裡它是單位球） ──
  const localRay = new THREE.Ray();
  const inverseProxy = new THREE.Matrix4();
  const unitSphere = new THREE.Sphere(new THREE.Vector3(), 1);
  const bodyPoint = new THREE.Vector3();
  const dragStartPointer = new THREE.Vector3();
  const dragStartAnchor = new THREE.Vector3();
  const dragRotation = new THREE.Quaternion();

  /** 射線 → 參考橢球（單位球）上的方向；打不到就用射線上離球心最近的點 */
  function rayToBodyDirection(ray: THREE.Ray, target: THREE.Vector3) {
    bodyProxy.updateWorldMatrix(true, false);
    inverseProxy.copy(bodyProxy.matrixWorld).invert();
    localRay.copy(ray).applyMatrix4(inverseProxy);
    if (!localRay.intersectSphere(unitSphere, target)) localRay.closestPointToPoint(unitSphere.center, target);
    if (target.lengthSq() < 1e-8) return false;
    target.normalize();
    return true;
  }

  function beginLeafDrag(leaf: LeafRuntime, ray: THREE.Ray) {
    if (!rayToBodyDirection(ray, dragStartPointer)) return false;
    bodyDirection(leaf.settings.azimuth, leaf.settings.elevation, dragStartAnchor);
    return true;
  }

  /** 拖曳中：滑鼠方向相對開始時轉了多少，葉子中心掛的方向就轉多少（相對移動，不會跳）→ 換算回方位角、仰角 */
  function moveLeafToRay(leaf: LeafRuntime, ray: THREE.Ray) {
    if (!rayToBodyDirection(ray, bodyPoint)) return false;
    dragRotation.setFromUnitVectors(dragStartPointer, bodyPoint);
    bodyPoint.copy(dragStartAnchor).applyQuaternion(dragRotation);
    leaf.settings.azimuth = Math.round(THREE.MathUtils.radToDeg(Math.atan2(bodyPoint.x, bodyPoint.z)));
    leaf.settings.elevation = Math.round(THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(bodyPoint.y, -1, 1))));
    rebuildLeaf(leaf);
    return true;
  }

  function exposeLeaf(leaf: LeafRuntime): BananaLeaf {
    return {
      id: leaf.id,
      label: leaf.id,
      object: leaf.mesh as THREE.Object3D,
      get settings() {
        return leaf.settings;
      },
      apply: () => rebuildLeaf(leaf),
      setHighlighted: (value: boolean) => {
        leaf.highlighted = value;
        applyLeafVisuals(leaf);
      },
      beginDrag: (ray: THREE.Ray) => beginLeafDrag(leaf, ray),
      moveToRay: (ray: THREE.Ray) => moveLeafToRay(leaf, ray),
      remove: () => removeLeaf(leaf.id),
    };
  }

  function applyPlacement() {
    direction.copy(front).applyAxisAngle(up, THREE.MathUtils.degToRad(settings.azimuthDegrees));
    const angle = THREE.MathUtils.degToRad(settings.angleFromTopDegrees);
    normal.copy(up).multiplyScalar(Math.cos(angle)).addScaledVector(direction, Math.sin(angle));
    anchor.position.copy(normal).multiplyScalar(groundRadius - settings.sink);
    anchor.quaternion.setFromUnitVectors(Y_AXIS, normal);
    anchor.quaternion.multiply(spin.setFromAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(settings.spinDegrees)));
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
    model.scale.setScalar(settings.size);
    // 整組：以葉棚中間為中心縮放、上下移動，再旋轉（YXZ：先左右轉，再前後傾、左右傾）
    pivot.position.copy(PIVOT);
    pivot.position.y += settings.groupRise;
    pivot.scale.setScalar(Math.max(0.05, settings.groupScale));
    pivot.rotation.set(
      THREE.MathUtils.degToRad(settings.groupTiltX),
      THREE.MathUtils.degToRad(settings.groupYaw),
      THREE.MathUtils.degToRad(settings.groupTiltZ),
      'YXZ',
    );
  }

  function applyVisuals() {
    for (const leaf of leaves) applyLeafVisuals(leaf);
  }

  function applySettings() {
    rebuildLeaves();
    applyPlacement();
  }

  function setHighlighted(value: boolean) {
    highlighted = value;
    applyVisuals();
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

  function setIntroGrow(value: number) {
    introGrow = THREE.MathUtils.clamp(value, 0, 1);
    anchor.scale.setScalar(settings.placementScale * Math.max(0.0001, introGrow));
  }

  function dispose() {
    anchor.removeFromParent();
    for (const leaf of leaves) {
      leaf.mesh.geometry.dispose();
      leaf.material.dispose();
    }
    bodyProxy.geometry.dispose();
    (bodyProxy.material as THREE.Material).dispose();
  }

  applySettings();

  return {
    object: anchor,
    settings,
    applySettings,
    applyVisuals,
    setHighlighted,
    setIntroGrow,
    dispose,
    getNormal: () => normal.clone(),
    setNormal,
    getLeaves: () => leaves.map((leaf) => leaf.exposed),
    addLeaf,
  };
}

export function formatBananaLeafClustersForPaste(entries: Array<{ id: string; settings: BananaLeafClusterLayout }>) {
  const lines = entries.map((entry, index) => {
    const s = entry.settings;
    const comma = index < entries.length - 1 ? ',' : '';
    return (
      `  {\n` +
      `    id: '${entry.id}',\n` +
      `    angleFromTopDegrees: ${s.angleFromTopDegrees},\n` +
      `    azimuthDegrees: ${s.azimuthDegrees},\n` +
      `    spinDegrees: ${s.spinDegrees},\n` +
      `    sink: ${s.sink.toFixed(3)},\n` +
      `    placementScale: ${s.placementScale.toFixed(2)},\n` +
      `    size: ${s.size.toFixed(3)},\n` +
      `    groupYaw: ${s.groupYaw},\n` +
      `    groupTiltX: ${s.groupTiltX},\n` +
      `    groupTiltZ: ${s.groupTiltZ},\n` +
      `    groupScale: ${s.groupScale.toFixed(2)},\n` +
      `    groupRise: ${s.groupRise.toFixed(3)},\n` +
      `    colorBoost: ${s.colorBoost.toFixed(2)},\n` +
      `    leaves: [\n` +
      s.leaves
        .map(
          (leaf) =>
            `      { azimuth: ${leaf.azimuth}, elevation: ${leaf.elevation}, lift: ${leaf.lift.toFixed(3)}, rise: ${leaf.rise.toFixed(3)}, tilt: ${leaf.tilt}, yaw: ${leaf.yaw}, roll: ${leaf.roll}, pitch: ${leaf.pitch}, ` +
            `length: ${leaf.length.toFixed(2)}, width: ${leaf.width.toFixed(2)}, droop: ${leaf.droop.toFixed(2)}, color: '${leaf.color}' },\n`,
        )
        .join('') +
      `    ],\n` +
      `  }${comma}`
    );
  });
  return (
    `// 貼回 src/world/objects/bananaLeavesLayout.ts\n` +
    `export const BANANA_LEAF_CLUSTER_PLACEMENTS: BananaLeafClusterPlacement[] = [\n` +
    lines.join('\n') +
    `\n];\n`
  );
}
