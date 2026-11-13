import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loads = new Map<string, Promise<GLTF>>();

/** 同一個網址只解析一次。多顆複製品再各自複製，避免重複上傳貼圖。 */
export function loadGltfOnce(url: string): Promise<GLTF> {
  let pending = loads.get(url);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      loader.load(url, resolve, undefined, reject);
    });
    loads.set(url, pending);
  }
  return pending;
}

/**
 * 從共用模板複製一顆。
 * 幾何各自一份：貼球會改頂點。材質各自一份：亮度與選取發光互不影響。貼圖仍指向同一張。
 */
export function cloneGltfInstance(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry = mesh.geometry.clone();
    // BufferGeometry.copy 會共用 userData。貼球把原始頂點存在這裡，必須各存各的。
    mesh.geometry.userData = {};
    cloneGltfMeshMaterials(mesh);
  });
  return clone;
}

/** 共用幾何、各自材質（例如醬海大量相同的雞塊）。 */
export function cloneGltfMaterialsOnly(source: THREE.Object3D): THREE.Object3D {
  const clone = source.clone(true);
  clone.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    cloneGltfMeshMaterials(mesh);
  });
  return clone;
}

function cloneGltfMeshMaterials(mesh: THREE.Mesh) {
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((material) => material.clone());
  } else {
    mesh.material = mesh.material.clone();
  }
}

/** 平行預載 world 會用到的 glb，減少後面幾十顆一起等的時間。 */
export function preloadGltfs(urls: readonly string[]): void {
  for (const url of urls) void loadGltfOnce(url);
}

export function whenGltfsReady(urls: readonly string[]): Promise<void> {
  return Promise.all(urls.map((url) => loadGltfOnce(url))).then(() => undefined);
}

const MOUNTS_PER_FRAME = 4;
const mountQueue: Array<() => void> = [];
let mountFlushScheduled = false;
const mountWaiters: Array<() => void> = [];

function notifyMountIdle() {
  if (mountQueue.length > 0 || mountFlushScheduled) return;
  const waiters = mountWaiters.splice(0);
  for (const resolve of waiters) resolve();
}

function flushGltfMounts() {
  for (let i = 0; i < MOUNTS_PER_FRAME && mountQueue.length > 0; i++) {
    const work = mountQueue.shift();
    work?.();
  }
  if (mountQueue.length > 0) {
    requestAnimationFrame(flushGltfMounts);
    return;
  }
  mountFlushScheduled = false;
  notifyMountIdle();
}

/** 把 glb 掛進場景的工作拆到多幀，避免一次 conform + 上傳貼圖卡死主執行緒。 */
export function scheduleGltfMount(work: () => void) {
  mountQueue.push(work);
  if (mountFlushScheduled) return;
  mountFlushScheduled = true;
  requestAnimationFrame(flushGltfMounts);
}

export function whenGltfMountsIdle(): Promise<void> {
  if (mountQueue.length === 0 && !mountFlushScheduled) return Promise.resolve();
  return new Promise((resolve) => mountWaiters.push(resolve));
}
