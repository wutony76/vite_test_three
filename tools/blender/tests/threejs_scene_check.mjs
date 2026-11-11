// 依 ScenePlan 檢查場景 GLB 在 Three.js 的結構（Node 執行，不需要瀏覽器）。
//
//   node tools/blender/tests/threejs_scene_check.mjs [scene.json] [GLB 路徑]
//
// 檢查：單一根節點與 hierarchy 群組、每棟建築有自己的根節點且門可以單獨點擊與移動、
// instance 擺放（樹）變成 InstancedMesh、draw call 在預算內、從上往下的射線打得到地形。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { existsSync } from 'node:fs';

const planPath = resolve(process.argv[2] ?? 'tools/blender/plans/sample_town.scene.json');
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const file = resolve(process.argv[3] ?? plan.export.path);
const bytes = readFileSync(file);
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

// Node 沒有圖片解碼：用 plugin 接手 loadTexture，只建立空 Texture 並套用 sampler（同 threejs_plan_check.mjs）
const stubTextures = (parser) => ({
  name: 'node_stub_textures',
  loadTexture(index) {
    const sampler = parser.json.samplers?.[parser.json.textures[index].sampler] ?? {};
    const texture = new THREE.Texture();
    texture.flipY = false;
    texture.magFilter = sampler.magFilter === 9728 ? THREE.NearestFilter : THREE.LinearFilter;
    return Promise.resolve(texture);
  },
});
// meshopt 壓縮的 GLB（EXT_meshopt_compression）要先設定 decoder，否則讀不到頂點
const gltf = await new Promise((done, fail) => new GLTFLoader().register(stubTextures).setMeshoptDecoder(MeshoptDecoder).parse(arrayBuffer, '', done, fail));

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures.push(message);
};

const scene = new THREE.Scene();
scene.add(gltf.scene);
scene.updateMatrixWorld(true);

const root = gltf.scene.getObjectByName(`${plan.id}_Root`);
check(gltf.scene.children.length === 1 && root, `只有一個根節點 ${plan.id}_Root`);
for (const group of plan.hierarchy) {
  const node = root?.getObjectByName(`${plan.id}_${group}`);
  check(node && node.parent === root, `群組 ${group} 是根節點的直接子節點`);
}

// 每棟建築：自己的根節點、門是獨立且可點擊的節點、移動門不影響同一棟的牆
const assetOf = Object.fromEntries(plan.assets.map((a) => [a.asset_id, JSON.parse(readFileSync(resolve(planPath, '..', a.plan), 'utf8'))]));
// 建築 = 有牆體和門的資產（木箱堆這類非 instance 的裝飾物不檢查門）
const isBuilding = (assetId) => ['wall_block', 'door'].every((kind) => assetOf[assetId].components.some((c) => c.kind === kind));
const buildings = plan.placements.filter((p) => !p.instance && isBuilding(p.asset_id));
for (const placement of buildings) {
  const proot = root.getObjectByName(`${placement.id}_Root`);
  const asset = assetOf[placement.asset_id];
  const doorId = asset.components.find((c) => c.kind === 'door')?.id;
  const wallId = asset.components.find((c) => c.kind === 'wall_block')?.id;
  const door = proot?.getObjectByName(`${placement.id}_${doorId}`);
  const wall = proot?.getObjectByName(`${placement.id}_${wallId}`);
  check(proot && door?.userData.clickable === true, `${placement.id}：有根節點，門 ${doorId} 可點擊`);
  if (door && wall) {
    const before = wall.getWorldPosition(new THREE.Vector3());
    door.position.y += 1;
    scene.updateMatrixWorld(true);
    check(wall.getWorldPosition(new THREE.Vector3()).equals(before), `${placement.id}：移動門不影響牆`);
    door.position.y -= 1;
  }
}

// instance：樹變成 InstancedMesh，instance 數 = 擺放數
const instancedCount = {};
let drawCalls = 0;
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  drawCalls += 1;
  if (o.isInstancedMesh) instancedCount[o.geometry.uuid] = o.count;
});
const counts = Object.values(instancedCount);
const perAsset = {};
for (const p of plan.placements.filter((p) => p.instance)) perAsset[p.asset_id] = (perAsset[p.asset_id] ?? 0) + 1;
for (const [assetId, expected] of Object.entries(perAsset)) {
  check(counts.includes(expected), `${assetId} 的 ${expected} 個 instance 擺放變成 InstancedMesh（各 InstancedMesh 的數量：${counts.join(', ')}）`);
}
check(drawCalls <= plan.budget.max_draw_calls, `draw call ${drawCalls} ≤ 預算 ${plan.budget.max_draw_calls}`);

// 從空中往下打，地形要接得住（Y 朝上）
const terrain = root.getObjectByName(`${plan.id}_terrain`);
const hit = new THREE.Raycaster(new THREE.Vector3(-25, 50, 25), new THREE.Vector3(0, -1, 0)).intersectObject(terrain, true)[0];
check(Boolean(hit), `從上往下的射線打到地形（高度 ${hit?.point.y.toFixed(2)}）`);


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
