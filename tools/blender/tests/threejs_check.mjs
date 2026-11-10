// Three.js 相容性檢查：在 Node 裡用專案安裝的 three 載入 GLB，不需要開瀏覽器。
//
//   node tools/blender/tests/threejs_check.mjs [GLB 路徑]
//
// 檢查：單一根節點、每個零件是獨立的 Object3D、userData 帶有 lowpoly_profile、
// Raycaster 從正面射向門可以打到 Door、各零件可以單獨移動（獨立動畫的前提）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const file = resolve(process.argv[2] ?? 'public/models/lowpoly_house/lowpoly_house.glb');
const bytes = readFileSync(file);
// GLTFLoader.parse 需要 ArrayBuffer；Node 的 Buffer 可能和其他資料共用底層記憶體，要切出自己那段
const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const gltf = await new Promise((done, fail) => new GLTFLoader().parse(arrayBuffer, '', done, fail));
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures.push(message);
};

const scene = new THREE.Scene();
scene.add(gltf.scene);
scene.updateMatrixWorld(true);

const root = gltf.scene.getObjectByName('House_Root');
check(gltf.scene.children.length === 1 && root, '只有一個根節點 House_Root');

const parts = ['Foundation', 'Body', 'Roof', 'Door', 'Window_FrontL', 'Window_FrontR', 'Window_SideR', 'Window_SideL'];
for (const name of parts) {
  const part = root?.getObjectByName(name);
  check(part && part.parent === root, `${name} 是 House_Root 底下的獨立物件`);
}
check(root?.getObjectByName('Door')?.userData.lowpoly_profile === 'opening', 'Door 的 userData 帶有 lowpoly_profile');

// 由多個材質組成的零件，在 Three.js 會變成 Group + 多個 Mesh；往上找到第一個有名字的零件
const partOf = (object) => {
  let current = object;
  while (current && !parts.includes(current.name)) current = current.parent;
  return current?.name;
};

// Blender (x, y, z) → glTF (x, z, -y)：門在 Blender 的 y=-1.58、z≈1.2，轉換後在 +Z 方向
const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 1.2, 10), new THREE.Vector3(0, 0, -1));
const hits = raycaster.intersectObject(gltf.scene, true);
check(partOf(hits[0]?.object) === 'Door', `正面射線第一個打到 Door（實際：${partOf(hits[0]?.object)}）`);

const sideRay = new THREE.Raycaster(new THREE.Vector3(10, 1.7, 0), new THREE.Vector3(-1, 0, 0));
const sideHit = sideRay.intersectObject(gltf.scene, true)[0];
check(partOf(sideHit?.object) === 'Window_SideR', `右側射線打到 Window_SideR（實際：${partOf(sideHit?.object)}）`);

// 只移動門，其他零件位置不變：代表可以各自做動畫
const door = root.getObjectByName('Door');
const body = root.getObjectByName('Body');
const bodyBefore = body.getWorldPosition(new THREE.Vector3());
door.position.z += 1;
scene.updateMatrixWorld(true);
check(body.getWorldPosition(new THREE.Vector3()).equals(bodyBefore), '移動 Door 不影響 Body');

let drawCalls = 0;
gltf.scene.traverse((o) => { if (o.isMesh) drawCalls += 1; });
check(drawCalls === 13, `Mesh 數（約等於 draw call）為 13（實際：${drawCalls}）`);

console.log(`\n${failures.length === 0 ? 'ALL PASS' : `${failures.length} FAILED`}`);
process.exit(failures.length === 0 ? 0 : 1);
