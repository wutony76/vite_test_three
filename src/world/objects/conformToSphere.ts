import * as THREE from 'three';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const ANCHOR = new THREE.Vector3();
const WORLD = new THREE.Vector3();
const TANGENT = new THREE.Vector3();
const LOCAL = new THREE.Vector3();
const ORIENT = new THREE.Quaternion();
const INVERSE = new THREE.Quaternion();

export type SphereConformOptions = {
  groundRadius: number;
  sink: number;
  /** 球心到地表的方向（單位向量） */
  normal: THREE.Vector3;
  /** 房子局部座標：哪一層算「地表」（createHouse 底在 y = 0） */
  groundY?: number;
  /** 還有多高以內的頂點一起貼球（給 glb 底座一點厚度） */
  groundBand?: number;
};

/**
 * 把幾何底部從切平面「貼」到半徑 groundRadius - sink 的球面上。
 * 房子 +Y 對齊 normal，球心在世界原點。
 */
export function conformGeometryToSphere(geometry: THREE.BufferGeometry, options: SphereConformOptions) {
  const groundY = options.groundY ?? 0;
  const band = options.groundBand ?? 1e-4;
  const surfaceR = options.groundRadius - options.sink;

  ANCHOR.copy(options.normal).multiplyScalar(surfaceR);
  ORIENT.setFromUnitVectors(Y_AXIS, options.normal);
  INVERSE.copy(ORIENT).invert();

  const positions = geometry.attributes.position;
  if (!positions) return;

  for (let i = 0; i < positions.count; i++) {
    LOCAL.fromBufferAttribute(positions, i);
    if (LOCAL.y > groundY + band) continue;

    TANGENT.copy(LOCAL).applyQuaternion(ORIENT);
    WORLD.copy(ANCHOR).add(TANGENT).normalize().multiplyScalar(surfaceR);
    LOCAL.copy(WORLD).sub(ANCHOR).applyQuaternion(INVERSE);
    positions.setXYZ(i, LOCAL.x, LOCAL.y, LOCAL.z);
  }

  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}

const ORIGINAL = 'sphereConformOriginal';

/** 子物件（glb）依原始頂點重算貼球；不處理 root 本體，避免和長方體重複變形 */
export function conformChildrenToSphere(root: THREE.Object3D, options: SphereConformOptions) {
  root.traverse((node) => {
    if (node === root) return;
    if (!(node instanceof THREE.Mesh)) return;
    const geometry = node.geometry;
    const position = geometry.attributes.position;
    if (!position) return;

    let original = geometry.userData[ORIGINAL] as Float32Array | undefined;
    if (!original) {
      original = position.array.slice() as Float32Array;
      geometry.userData[ORIGINAL] = original;
    }
    position.array.set(original);

    conformGeometryToSphere(geometry, options);
  });
}
