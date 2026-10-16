// 建場景用的小工具：讓「放一個方塊在某個位置」只要一行
import * as THREE from 'three'

/** 建立一個會投射、接收陰影的 Mesh 並放到指定位置 */
export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  x = 0,
  y = 0,
  z = 0,
) {
  const object = new THREE.Mesh(geometry, material)
  object.position.set(x, y, z)
  object.castShadow = true
  object.receiveShadow = true
  return object
}

/** 方塊：最常用，參數順序 = 寬、高、深、材質、位置 */
export function box(w: number, h: number, d: number, material: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z)
}

/** 圓柱：上半徑、下半徑、高 */
export function cylinder(rTop: number, rBottom: number, h: number, material: THREE.Material, x = 0, y = 0, z = 0, segments = 16) {
  return mesh(new THREE.CylinderGeometry(rTop, rBottom, h, segments), material, x, y, z)
}

/** 把多個物體包成一組，並放到指定位置 */
export function group(x: number, y: number, z: number, ...children: THREE.Object3D[]) {
  const result = new THREE.Group()
  result.position.set(x, y, z)
  // add() 不帶參數時 Three.js 會當成加入 undefined 而報錯，所以有子物件才加
  if (children.length) result.add(...children)
  return result
}

/** 標記為可點擊的熱點：滑鼠射線打到它（或它的子物件）時，往上找到這個 id */
export function hotspot<T extends THREE.Object3D>(object: T, id: string) {
  object.userData.hotspot = id
  return object
}
