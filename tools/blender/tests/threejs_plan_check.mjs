// 依 plan 檢查匯出的 GLB 能不能在 Three.js 正常使用（在 Node 裡用專案的 three，不需要瀏覽器）。
//
//   node tools/blender/tests/threejs_plan_check.mjs <plan.json> [GLB 路徑]
//
// 檢查：單一根節點、clickable 元件是獨立節點、userData 帶有 profile 與元件資訊、
// 正面射線打得到門、移動門不影響牆、draw call 不超過 plan 的 primitive 預算。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { existsSync } from 'node:fs';

const planPath = resolve(process.argv[2] ?? 'tools/blender/plans/test01_shop.plan.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const file = resolve(process.argv[3] ?? plan.export.path);
const bytes = readFileSync(file);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
// Node 沒有瀏覽器的圖片解碼（self、Image、createImageBitmap），GLTFLoader 載入貼圖時會直接崩潰。
// 用 plugin 接手 loadTexture：不解碼圖片，只建立空的 Texture 並套用 glTF 的 sampler 設定，
// 這樣仍然可以檢查「有沒有貼圖」「是不是 NEAREST」，只是不驗證圖片內容（圖片由 Blender 端測試）。
const GL_TO_THREE = { 9728: THREE.NearestFilter, 9729: THREE.LinearFilter, 9984: THREE.NearestMipmapNearestFilter,
  9985: THREE.LinearMipmapNearestFilter, 9986: THREE.NearestMipmapLinearFilter, 9987: THREE.LinearMipmapLinearFilter };
const stubTextures = (parser) => ({
  name: 'node_stub_textures',
  loadTexture(index) {
    const def = parser.json.textures[index];
    const sampler = parser.json.samplers?.[def.sampler] ?? {};
    const texture = new THREE.Texture();
    texture.flipY = false;
    texture.magFilter = GL_TO_THREE[sampler.magFilter] ?? THREE.LinearFilter;
    texture.minFilter = GL_TO_THREE[sampler.minFilter] ?? THREE.LinearMipmapLinearFilter;
    return Promise.resolve(texture);
  },
});
// meshopt 壓縮的 GLB（EXT_meshopt_compression）要先設定 decoder，否則讀不到頂點
const loader = new GLTFLoader().register(stubTextures).setMeshoptDecoder(MeshoptDecoder);
const gltf = await new Promise((done, fail) => loader.parse(arrayBuffer, '', done, fail));

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures.push(message);
};

const scene = new THREE.Scene();
scene.add(gltf.scene);
scene.updateMatrixWorld(true);

const rootName = `${plan.id}_Root`;
const root = gltf.scene.getObjectByName(rootName);
check(gltf.scene.children.length === 1 && root, `只有一個根節點 ${rootName}`);

// 多材質的 Object 在 Three.js 會變成 Group + 多個 Mesh；往上找到帶有元件資訊的節點
const componentOf = (object) => {
  let current = object;
  while (current && current.userData?.lpk_component === undefined) current = current.parent;
  return current;
};

for (const id of plan.export.clickable ?? []) {
  const node = root?.getObjectByName(`${plan.id}_${id}`);
  check(node && node.userData.clickable === true, `${id} 是獨立節點且 userData.clickable = true`);
}

const door = plan.components.find((c) => c.kind === 'door');
if (door) {
  const doorNode = root.getObjectByName(`${plan.id}_${door.id}`);
  check(doorNode?.userData.lowpoly_profile === 'opening', '門的 userData 帶有 lowpoly_profile');
  // Blender (x, y, z) → glTF (x, z, -y)：正面朝 Blender -Y，也就是 Three.js 的 +Z
  const [[x0, , z0], [x1, , z1]] = door.bounds;
  const origin = new THREE.Vector3((x0 + x1) / 2, (z0 + z1) * 0.35, 30);
  const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, 0, -1)).intersectObject(gltf.scene, true)[0];
  check(componentOf(hit?.object)?.userData.lpk_component === door.id,
    `正面射線第一個打到門（實際：${componentOf(hit?.object)?.userData.lpk_component}）`);

  const wall = root.getObjectByName(`${plan.id}_${plan.components.find((c) => c.kind === 'wall_block')?.id}`);
  const before = wall.getWorldPosition(new THREE.Vector3());
  doorNode.position.z += 1;
  scene.updateMatrixWorld(true);
  check(wall.getWorldPosition(new THREE.Vector3()).equals(before), '移動門不影響牆（可以各自做動畫）');
}

let drawCalls = 0;
let transparent = 0;
let textured = 0;
let nearest = 0;
let vertexColored = 0;
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  drawCalls += 1;
  if (o.material.transparent) transparent += 1;
  if (o.material.map) {
    textured += 1;
    // palette atlas 的色格很小，放大時要用 NEAREST，否則格子邊緣會和相鄰顏色混在一起
    if (o.material.map.magFilter === THREE.NearestFilter) nearest += 1;
  }
  if (o.material.vertexColors && o.geometry.attributes.color) vertexColored += 1;
});
check(drawCalls <= plan.budget.max_primitives, `draw call ${drawCalls} ≤ 預算 ${plan.budget.max_primitives}`);
const glassCount = plan.components.filter((c) => c.profile === 'glass').length;
// 必須剛好相等：多出來的半透明 mesh 代表有不該透明的面（例如牆上的凹槽底面），會看穿牆體內部
check(transparent === glassCount, `只有玻璃是半透明（transparent mesh ${transparent} 個，玻璃元件 ${glassCount} 個）`);

const usesAtlas = (plan.detail?.preset ?? 'game_default') !== 'preview';
if (usesAtlas) {
  const opaque = drawCalls - transparent;
  check(textured === opaque && nearest === textured, `不透明 mesh 都使用 atlas 貼圖且為 NEAREST（${textured}/${opaque}）`);
  check(vertexColored === drawCalls, `所有 mesh 都帶 vertex color（${vertexColored}/${drawCalls}）`);
}


// manifest：列出的節點名稱都必須真的存在於 GLB（頁面靠這份清單找可點擊的物件、燈光）
const manifestPath = file.replace(/\.glb$/, '.manifest.json');
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const names = [manifest.root, ...(manifest.clickable ?? []), ...Object.values(manifest.anim_groups ?? {}).flat(),
    ...(manifest.groups ?? []), ...(manifest.placements ?? []).flatMap((p) => [p.root, ...p.clickable])];
  const missing = names.filter((name) => !gltf.scene.getObjectByName(name));
  check(missing.length === 0, `manifest 的 ${names.length} 個節點名稱都存在於 GLB（缺少：${missing.slice(0, 3).join(', ') || '無'}）`);
  const compressed = manifest.requires.includes('EXT_meshopt_compression');
  check(compressed, `GLB 使用 meshopt 壓縮（requires：${manifest.requires.join(', ')}）`);
  if (manifest.kind === 'scene') {
    const types = new Set(manifest.lights.map((l) => l.type));
    check(types.has('sun') && (types.has('hemisphere') || types.has('ambient')), `manifest 有日光與環境光（${[...types].join(', ')}）`);
  }
} else {
  check(false, `找不到 manifest：${manifestPath}`);
}

console.log(`\n${failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILED`}`);
process.exit(failures.length === 0 ? 0 : 1);
