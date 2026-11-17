import * as THREE from 'three';

/**
 * projectRoom 的「香菇屋風格」：參考 mainHall（龍兔的家）的風格元素，不改建築的佈局結構；配色自成一組、和 mainHall 區分。
 *
 * 做法是「換材質顏色＋加小裝飾」，不改模型幾何，所以可以隨時開關比較：
 *   - 牆：藍／黃／紅三面 → 奶油黃色系（各留一點點色差，看得出是不同面）
 *   - 屋頂 → 薰衣草紫；磚（煙囪）→ 深紫
 *   - 窗框（窗戶零件裡的 Wood）→ 湖水綠，窗格（Wood_Dark）維持木色；玻璃 → 深色
 *   - 葉子 → 草綠；石頭底座、台階 → 霧藍
 *   - 加上：屋簷四角垂下的紫色香菇串、牆上幾朵橘色小菇、煙囪頂一頂紫色小菇傘
 *
 * project_room.glb 的材質都是有名字的純色（沒有貼圖），換 color 就能換風格。
 * cloneGltfInstance 會幫每個 mesh 複製一份材質，所以「只改窗戶的 Wood」不會影響陽台的 Wood。
 */

/**
 * 材質名稱 → 這棟自己的配色。
 * 風格元素跟 mainHall 一樣（粉嫩的牆、香菇串、小菇、菇傘），但顏色刻意不同（使用者要求做出區別）：
 *   mainHall：奶白牆＋粉紅屋頂＋綠窗框＋藍色小菇
 *   這棟：    奶油黃牆＋薰衣草紫屋頂＋湖水綠窗框＋橘色小菇、紫色香菇串、霧藍石座
 */
const MATERIAL_COLORS: Record<string, string> = {
  Wall_Blue: '#F7EBC5',
  Wall_Yellow: '#F3E4BD',
  Wall_Red: '#EFDDB2',
  Roof_Rust: '#A98BD9',
  Brick: '#7C5CB8',
  Wood: '#9A5A34',
  Wood_Dark: '#6A3A20',
  Door_Wood: '#9A5A34',
  Glass: '#2A2638',
  Leaf: '#6E9A4A',
  Flower_Red: '#FFB347',
  Stone_Grey: '#93A8C2',
  Stone_Light: '#C9D6E3',
  Step_Stone: '#B7C6D6',
  Stone_Dark: '#3E4656',
};

/** 窗戶零件（Win_*、Balcony_Door）裡的 Wood 是窗框 → 湖水綠窗框（mainHall 是草綠） */
const WINDOW_FRAME_COLOR = '#4FA3A0';

/** 第三層（約 5.45 m 以上）換成淡紫色，和第二層的奶油黃分開；交界一條湖水綠細腰帶 */
const TOP_FLOOR_SPLIT_Y = 5.45;
const TOP_FLOOR_COLOR = '#E4D7F3';
const FLOOR_BAND_COLOR = '#4FA3A0';
/** 第二層右邊的圓塔（取代原本的紅色方盒）：薄荷綠，跟主體的黃／紫區分 */
const TOWER_COLOR = '#CDE8DC';

const TOP_FLOOR = new THREE.MeshStandardMaterial({ color: TOP_FLOOR_COLOR, roughness: 0.85 });
const TOWER_WALL = new THREE.MeshStandardMaterial({ color: TOWER_COLOR, roughness: 0.85 });
const BAND = new THREE.MeshStandardMaterial({ color: FLOOR_BAND_COLOR, roughness: 0.7 });
const SHROOM_CAP = new THREE.MeshStandardMaterial({ color: '#8E6CC9', roughness: 0.5 });
const SHROOM_STEM = new THREE.MeshStandardMaterial({ color: '#F3E6CC', roughness: 0.6 });
const STRING = new THREE.MeshStandardMaterial({ color: '#5A4A44', roughness: 0.9 });
const FUNGUS_ORANGE = new THREE.MeshStandardMaterial({ color: '#E8873A', roughness: 0.6 });
const CHIMNEY_CAP = new THREE.MeshStandardMaterial({ color: '#A98BD9', roughness: 0.6 });
const CHIMNEY_RIM = new THREE.MeshStandardMaterial({ color: '#7C5CB8', roughness: 0.7 });

/** 菇傘剖面（半徑, 高度），單位半徑 1：底面 → 傘緣 → 圓頂 */
function capGeometry(radius: number, height: number) {
  const points = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius * 0.95, 0.02 * height),
    new THREE.Vector2(radius, 0.25 * height),
    new THREE.Vector2(radius * 0.85, 0.6 * height),
    new THREE.Vector2(radius * 0.45, 0.92 * height),
    new THREE.Vector2(0, height),
  ];
  const geometry = new THREE.LatheGeometry(points, 12);
  geometry.computeVertexNormals();
  return geometry;
}

/** 模型裡某個零件在「模型根節點座標」下的範圍（模型掛在會旋轉的房子上，不能直接用世界座標的 Box3） */
function localBox(node: THREE.Object3D, root: THREE.Object3D) {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  const toRoot = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  node.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    toRoot.multiplyMatrices(rootInverse, mesh.matrixWorld);
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      box.expandByPoint(point.fromBufferAttribute(position, i).applyMatrix4(toRoot));
    }
  });
  return box;
}

export function createProjectRoomStyle(model: THREE.Object3D) {
  // 記住每個材質原本的顏色：關掉風格時要還原
  const original = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  const targets: Array<{ material: THREE.MeshStandardMaterial; color: THREE.Color }> = [];
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    // 窗戶零件：往上找到 Win_* 或 Balcony_Door
    let part: THREE.Object3D | null = mesh;
    while (part && !/^(Win_|Balcony_Door)/.test(part.name) && part !== model) part = part.parent;
    const isWindow = !!part && part !== model;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const m = material as THREE.MeshStandardMaterial;
      if (!m.color) continue;
      const name = m.name.replace(/\.\d+$/, '');
      const hex = isWindow && name === 'Wood' ? WINDOW_FRAME_COLOR : MATERIAL_COLORS[name];
      if (!hex) continue;
      if (!original.has(m)) original.set(m, m.color.clone());
      targets.push({ material: m, color: new THREE.Color(hex) });
    }
  });

  // ── 裝飾：掛在模型根節點下（跟著房子一起縮放、旋轉）──
  const decorations = new THREE.Group();
  decorations.name = 'project_room_shroom_style';
  model.add(decorations);
  const hangers: THREE.Object3D[] = [];

  const roof = model.getObjectByName('Roof');
  const walls = model.getObjectByName('Walls_Main');
  const chimney = model.getObjectByName('Chimney');
  const wallBox = walls ? localBox(walls, model) : new THREE.Box3(new THREE.Vector3(-2, 0, -1), new THREE.Vector3(2, 6, 1));
  const unit = wallBox.getSize(new THREE.Vector3()).x * 0.05; // 裝飾大小以牆寬為基準

  // 1. 屋簷四角的香菇串（每串 3～4 朵）
  if (roof) {
    const roofBox = localBox(roof, model);
    const eaveY = roofBox.min.y;
    const inset = unit * 0.6;
    const corners = [
      [roofBox.min.x + inset, roofBox.max.z - inset, 4],
      [roofBox.max.x - inset, roofBox.max.z - inset, 3],
      [roofBox.min.x + inset, roofBox.min.z + inset, 3],
      [roofBox.max.x - inset, roofBox.min.z + inset, 4],
    ] as const;
    const capGeo = capGeometry(unit * 0.55, unit * 0.45);
    const stemGeo = new THREE.CylinderGeometry(unit * 0.14, unit * 0.16, unit * 0.45, 8);
    corners.forEach(([x, z, count], index) => {
      const hanger = new THREE.Group();
      hanger.position.set(x, eaveY, z);
      const length = unit * (3.4 + index * 0.4);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(unit * 0.04, unit * 0.04, length, 5), STRING);
      cord.position.y = -length / 2;
      hanger.add(cord);
      for (let k = 0; k < count; k++) {
        const scale = 1 - 0.1 * k + 0.05 * Math.sin(k * 2.1 + index);
        const shroom = new THREE.Group();
        const stem = new THREE.Mesh(stemGeo, SHROOM_STEM);
        stem.position.y = unit * 0.22;
        const cap = new THREE.Mesh(capGeo, SHROOM_CAP);
        cap.position.y = unit * 0.4;
        shroom.add(stem, cap);
        shroom.scale.setScalar(scale);
        shroom.position.y = -length + unit * 0.3 + k * (length - unit * 0.8) / count;
        hanger.add(shroom);
      }
      decorations.add(hanger);
      hangers.push(hanger);
    });
  }

  // 2. 牆上的橘色小菇：正面牆的右下角一串、左邊幾朵（像從牆裡長出來的）
  {
    const shelfGeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const front = wallBox.max.z;
    const spots = [
      [0.86, 0.18, 1.0],
      [0.9, 0.24, 0.8],
      [0.84, 0.3, 0.9],
      [0.12, 0.42, 0.85],
      [0.08, 0.48, 0.7],
    ];
    for (const [fx, fy, size] of spots) {
      const shelf = new THREE.Mesh(shelfGeo, FUNGUS_ORANGE);
      shelf.scale.set(unit * 0.9 * size, unit * 0.25 * size, unit * 0.6 * size);
      shelf.position.set(
        THREE.MathUtils.lerp(wallBox.min.x, wallBox.max.x, fx),
        THREE.MathUtils.lerp(wallBox.min.y, wallBox.max.y, fy),
        front,
      );
      decorations.add(shelf);
    }
  }

  // 3. 煙囪頂的粉紅小菇傘
  if (chimney) {
    const box = localBox(chimney, model);
    const size = box.getSize(new THREE.Vector3());
    const cap = new THREE.Mesh(capGeometry(Math.max(size.x, size.z) * 0.95, size.y * 0.32), CHIMNEY_CAP);
    cap.position.set((box.min.x + box.max.x) / 2, box.max.y - size.y * 0.04, (box.min.z + box.max.z) / 2);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(size.x, size.z) * 0.92, size.y * 0.03, 6, 20),
      CHIMNEY_RIM,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(cap.position).add(new THREE.Vector3(0, size.y * 0.02, 0));
    decorations.add(cap, rim);
  }

  // 4. 第三層換色：牆的材質依「高度」上色（同一片牆、同一個材質，不用改模型）
  const wallUniforms = {
    uStyleOn: { value: 0 },
    uSplitY: { value: TOP_FLOOR_SPLIT_Y },
    uTopColor: { value: new THREE.Color(TOP_FLOOR_COLOR) },
    uBandColor: { value: new THREE.Color(FLOOR_BAND_COLOR) },
  };
  if (walls) {
    walls.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const previous = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
          previous.call(material, shader, renderer);
          Object.assign(shader.uniforms, wallUniforms);
          shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying float vWallY;')
            // Walls_Main 沒有平移、縮放，頂點的 position.y 就是模型座標的高度
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallY = position.y;');
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying float vWallY;\nuniform float uStyleOn;\nuniform float uSplitY;\nuniform vec3 uTopColor;\nuniform vec3 uBandColor;',
            )
            .replace(
              '#include <color_fragment>',
              `#include <color_fragment>
              if (uStyleOn > 0.5) {
                if (vWallY > uSplitY) diffuseColor.rgb = uTopColor;
                // 交界的細腰帶（上下各 0.07）
                if (abs(vWallY - uSplitY) < 0.07) diffuseColor.rgb = uBandColor;
              }`,
            );
        };
        material.needsUpdate = true;
      }
    });
  }

  // 5. 第二層右邊的紅色方盒 → 圓塔（薄荷綠）＋菇傘屋頂；方盒上的三扇窗移到圓塔弧面上
  const redBox = model.getObjectByName('Red_Box');
  const towerWindows = ['Win_RedL', 'Win_RedR', 'Win_RedSide']
    .map((name) => model.getObjectByName(name))
    .filter((node): node is THREE.Object3D => !!node);
  const windowOriginal = towerWindows.map((node) => ({
    node,
    position: node.position.clone(),
    quaternion: node.quaternion.clone(),
  }));
  const towerGroup = new THREE.Group();
  towerGroup.name = 'project_room_round_tower';
  decorations.add(towerGroup);
  let towerWindowPlacement: Array<{ node: THREE.Object3D; position: THREE.Vector3; quaternion: THREE.Quaternion }> = [];
  if (redBox) {
    const box = localBox(redBox, model);
    // 圓心在方盒「凸出牆外那一段」的中間偏內，半徑蓋住原本方盒的寬
    const radius = (box.max.z - box.min.z) / 2;
    const center = new THREE.Vector3((box.min.x + box.max.x) / 2 + radius * 0.05, 0, (box.min.z + box.max.z) / 2);
    const bodyTop = box.max.y - 0.3;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, bodyTop - box.min.y, 28), TOWER_WALL);
    body.position.set(center.x, (bodyTop + box.min.y) / 2, center.z);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, 0.14, 28), BAND);
    band.position.set(center.x, bodyTop - 0.07, center.z);
    const roofCap = new THREE.Mesh(capGeometry(radius * 1.22, radius * 0.75), CHIMNEY_CAP);
    roofCap.position.set(center.x, bodyTop - 0.02, center.z);
    const roofRim = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.18, 0.07, 6, 32), CHIMNEY_RIM);
    roofRim.rotation.x = Math.PI / 2;
    roofRim.position.set(center.x, bodyTop + 0.06, center.z);
    towerGroup.add(body, band, roofCap, roofRim);
    // 窗戶：保留各自的高度，沿著「圓心 → 原本窗戶」的方向搬到圓塔表面，再轉成面向外
    towerWindowPlacement = windowOriginal.map(({ node, position }) => {
      const dir = new THREE.Vector3(position.x - center.x, 0, position.z - center.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const placed = new THREE.Vector3(center.x + dir.x * (radius + 0.02), position.y, center.z + dir.z * (radius + 0.02));
      // 窗戶模型本身朝 +Z：繞 Y 轉到 dir 的方向
      const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dir.x, dir.z));
      return { node, position: placed, quaternion: facing };
    });
  }

  // 6. 側面的變化（第三層）：左側半圓凸窗＋右後角穿出屋頂的圓塔，都戴小菇傘
  {
    const capGeo = (r: number) => capGeometry(r, r * 0.7);
    // 左側：半圓凸窗（貼在左牆前段）
    const leftX = wallBox.min.x;
    const bay = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.5, 20, 1, false, Math.PI, Math.PI),
      TOP_FLOOR,
    );
    bay.position.set(leftX, 6.25, 0.55);
    const bayCap = new THREE.Mesh(capGeo(0.62), CHIMNEY_CAP);
    bayCap.position.set(leftX - 0.05, 6.98, 0.55);
    const bayWindow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), new THREE.MeshStandardMaterial({ color: '#2A2638' }));
    bayWindow.position.set(leftX - 0.51, 6.3, 0.55);
    bayWindow.rotation.y = -Math.PI / 2;
    const bayRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.045, 6, 18), BAND);
    bayRing.position.copy(bayWindow.position).add(new THREE.Vector3(-0.01, 0, 0));
    bayRing.rotation.y = -Math.PI / 2;
    // 右後角：圓塔從第三層往上穿出屋頂，頂端一頂菇傘
    const corner = new THREE.Vector3(wallBox.max.x, 0, wallBox.min.z);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 2.7, 20), TOP_FLOOR);
    turret.position.set(corner.x, 5.45 + 1.35, corner.z);
    const turretBand = new THREE.Mesh(new THREE.CylinderGeometry(0.57, 0.57, 0.12, 20), BAND);
    turretBand.position.set(corner.x, 5.5, corner.z);
    const turretCap = new THREE.Mesh(capGeo(0.72), CHIMNEY_CAP);
    turretCap.position.set(corner.x, 8.12, corner.z);
    const turretRim = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.05, 6, 24), CHIMNEY_RIM);
    turretRim.rotation.x = Math.PI / 2;
    turretRim.position.set(corner.x, 8.17, corner.z);
    decorations.add(bay, bayCap, bayWindow, bayRing, turret, turretBand, turretCap, turretRim);
  }

  // 7. 背面補細節：原本是一整片光禿的平牆 → 兩層各兩扇圓窗（湖水綠框＋木十字＋窗台）、幾道木樑、一片爬藤
  {
    const backZ = wallBox.min.z;
    const glassMat = new THREE.MeshStandardMaterial({ color: '#2A2638', roughness: 0.4 });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#6A3A20', roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#6E9A4A', roughness: 0.9 });
    const addBackWindow = (x: number, y: number, r: number) => {
      const group = new THREE.Group();
      group.position.set(x, y, backZ - 0.02);
      group.rotation.y = Math.PI; // 面向 -Z（背面）
      const glass = new THREE.Mesh(new THREE.CircleGeometry(r, 18), glassMat);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.04, 0.07, 6, 20), BAND);
      const barH = new THREE.Mesh(new THREE.BoxGeometry(r * 2, 0.07, 0.06), woodMat);
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.07, r * 2, 0.06), woodMat);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(r * 2.4, 0.1, 0.28), woodMat);
      sill.position.set(0, -r - 0.1, 0.1);
      group.add(glass, ring, barH, barV, sill);
      decorations.add(group);
    };
    addBackWindow(-1.15, 4.05, 0.38);
    addBackWindow(0.55, 4.05, 0.38);
    addBackWindow(-0.9, 6.35, 0.34);
    addBackWindow(0.6, 6.35, 0.34);
    // 木樑：沿著第二、三層交界和第二層頂、牆的兩端各一道（半木造的感覺）
    for (const [x0, x1, y] of [[wallBox.min.x, wallBox.max.x, TOP_FLOOR_SPLIT_Y - 0.12], [wallBox.min.x, wallBox.max.x, 2.75]] as const) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.14, 0.12), woodMat);
      beam.position.set((x0 + x1) / 2, y, backZ - 0.05);
      decorations.add(beam);
    }
    for (const x of [wallBox.min.x + 0.08, -0.25]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, TOP_FLOOR_SPLIT_Y - 2.75, 0.12), woodMat);
      post.position.set(x, (TOP_FLOOR_SPLIT_Y + 2.75) / 2, backZ - 0.05);
      decorations.add(post);
    }
    // 爬藤：背牆左下一片葉團（幾顆扁球疊成一叢）
    const leafGeo = new THREE.SphereGeometry(1, 8, 6);
    for (const [x, y, r] of [[-1.7, 3.2, 0.42], [-1.4, 3.7, 0.36], [-1.85, 4.2, 0.32], [-1.55, 4.7, 0.28], [-1.9, 5.1, 0.24]]) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.scale.set(r, r, r * 0.45);
      leaf.position.set(x, y, backZ - 0.05);
      decorations.add(leaf);
    }
  }

  // 8. 底部補厚：整棟底下一圈比牆更寬的圓角石台（霧藍），把原本較窄的石頭底座包起來；邊緣長小菇和灌木
  {
    const minX = wallBox.min.x - 0.45;
    const maxX = (redBox ? localBox(redBox, model).max.x : wallBox.max.x) + 0.3;
    const minZ = wallBox.min.z - 0.45;
    const maxZ = wallBox.max.z + 0.75;
    const radius = 0.6;
    const shape = new THREE.Shape();
    shape.moveTo(minX + radius, minZ);
    shape.lineTo(maxX - radius, minZ);
    shape.quadraticCurveTo(maxX, minZ, maxX, minZ + radius);
    shape.lineTo(maxX, maxZ - radius);
    shape.quadraticCurveTo(maxX, maxZ, maxX - radius, maxZ);
    shape.lineTo(minX + radius, maxZ);
    shape.quadraticCurveTo(minX, maxZ, minX, maxZ - radius);
    shape.lineTo(minX, minZ + radius);
    shape.quadraticCurveTo(minX, minZ, minX + radius, minZ);
    const plinthGeo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.42,
      bevelEnabled: true,
      bevelThickness: 0.08,
      bevelSize: 0.1,
      bevelSegments: 2,
      curveSegments: 8,
    });
    // Shape 在 XY 平面、往 +Z 擠出 → 轉成躺平（XZ 平面、往 +Y 長高）
    plinthGeo.rotateX(Math.PI / 2);
    plinthGeo.translate(0, 0.42, 0);
    const plinth = new THREE.Mesh(plinthGeo, new THREE.MeshStandardMaterial({ color: '#B7C6D6', roughness: 0.9 }));
    plinth.position.y = -0.05;
    decorations.add(plinth);
    // 邊緣的小菇（紫傘）和灌木
    const shroomCap = capGeometry(0.22, 0.18);
    const shroomStem = new THREE.CylinderGeometry(0.06, 0.07, 0.22, 8);
    const bushGeo = new THREE.SphereGeometry(1, 8, 6);
    const bushMat = new THREE.MeshStandardMaterial({ color: '#6E9A4A', roughness: 0.9 });
    const spots: Array<[number, number, 'shroom' | 'bush', number]> = [
      [minX + 0.3, minZ + 0.35, 'bush', 0.38],
      [minX + 0.15, (minZ + maxZ) / 2, 'shroom', 1.1],
      [minX + 0.25, (minZ + maxZ) / 2 + 0.35, 'shroom', 0.8],
      [(minX + maxX) / 2 - 0.6, minZ + 0.2, 'shroom', 1],
      [(minX + maxX) / 2 + 0.2, minZ + 0.25, 'bush', 0.32],
      [maxX - 0.4, minZ + 0.4, 'shroom', 1.2],
      [maxX - 0.2, minZ + 0.75, 'shroom', 0.85],
      [maxX - 0.3, maxZ - 0.3, 'bush', 0.36],
    ];
    for (const [x, z, kind, size] of spots) {
      if (kind === 'bush') {
        const bush = new THREE.Mesh(bushGeo, bushMat);
        bush.scale.set(size, size * 0.75, size);
        bush.position.set(x, 0.42 + size * 0.4, z);
        decorations.add(bush);
      } else {
        const stem = new THREE.Mesh(shroomStem, SHROOM_STEM);
        stem.position.set(x, 0.42 + 0.11 * size, z);
        stem.scale.setScalar(size);
        const cap = new THREE.Mesh(shroomCap, SHROOM_CAP);
        cap.position.set(x, 0.42 + 0.2 * size, z);
        cap.scale.setScalar(size);
        decorations.add(stem, cap);
      }
    }
  }

  decorations.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  let enabled = false;
  function setEnabled(on: boolean) {
    enabled = on;
    for (const { material, color } of targets) {
      material.color.copy(on ? color : original.get(material)!);
    }
    decorations.visible = on;
    wallUniforms.uStyleOn.value = on ? 1 : 0;
    // 紅色方盒 ↔ 圓塔：方盒藏起來，窗戶搬到圓塔弧面上；關掉時全部還原
    const redBoxNode = model.getObjectByName('Red_Box');
    if (redBoxNode) redBoxNode.visible = !on;
    const placements = on ? towerWindowPlacement : windowOriginal;
    for (const { node, position, quaternion } of placements) {
      node.position.copy(position);
      node.quaternion.copy(quaternion);
    }
  }

  let time = 0;
  function update(deltaTime: number) {
    if (!enabled) return;
    time += deltaTime;
    hangers.forEach((hanger, index) => {
      hanger.rotation.y = Math.sin(time * 0.9 + index * 1.3) * THREE.MathUtils.degToRad(20);
    });
  }

  return { setEnabled, update, isEnabled: () => enabled };
}
