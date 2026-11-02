import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 在球面上拖曳物件：物件會沿著地表滑動，像在地球儀上推著一棟房子走
//
// 原理：
//   ① 按下時用射線檢查滑鼠有沒有點到物件
//   ② 拖曳時把滑鼠射線和「球」求交點，交點的方向（球心 → 交點）就是新的地表法線
//   ③ 把法線交給 onDrag，由呼叫端換算成自己的設定（例如經緯度）再擺放
//
// 為什麼不用 viewPlaneDrag？那個是在「跟螢幕平行的平面」上移動，
// 拿來拖房子會離開球面、飄在空中或陷進地裡；這裡要的是貼著球面走

type SurfaceDragOptions = {
  // 可以「被點到」的物件（例如房子）
  pickable: THREE.Object3D;
  // 地表：球心在它的原點，算出來的法線也是它的座標系
  ground: THREE.Object3D;
  groundRadius: number;
  // 按下時物件目前的地表法線（ground 座標系的單位向量）
  getNormal: () => THREE.Vector3;
  camera: THREE.Camera;
  domElement: HTMLElement;
  // 拖曳時要暫停 OrbitControls，不然拖物件的同時畫面也會跟著轉
  controls: OrbitControls;
  onDrag: (normal: THREE.Vector3) => void;
  onDragEnd?: () => void;
};

export function enableSurfaceDrag({ pickable, ground, groundRadius, getNormal, camera, domElement, controls, onDrag, onDragEnd }: SurfaceDragOptions) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  // 射線換到 ground 的座標系：球心就是原點，算球面交點比較單純
  const localRay = new THREE.Ray();
  const inverseGroundMatrix = new THREE.Matrix4();
  const sphere = new THREE.Sphere(new THREE.Vector3(), groundRadius);
  const pointerNormal = new THREE.Vector3();
  const newNormal = new THREE.Vector3();
  // 按下時「滑鼠所在的地表點」→「物件所在的地表點」的旋轉
  // 拖曳時一直套用它，物件才不會「跳」到滑鼠正下方，而是維持按下時的相對位置
  const grabOffset = new THREE.Quaternion();
  let dragging = false;

  /** 把滑鼠的像素座標換成 -1 ~ 1 的標準化座標，射線要用這種座標 */
  function updatePointer(event: PointerEvent) {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  /** 滑鼠指到的地表法線；滑出球外時，改用「射線上離球心最近的點」的方向，房子會停在球的邊緣而不是卡住不動 */
  function getPointerNormal(target: THREE.Vector3) {
    inverseGroundMatrix.copy(ground.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverseGroundMatrix);
    // 射線打到球會有兩個交點，intersectSphere 回傳靠近鏡頭的那個 → 正面，不會拖到地球背面
    if (!localRay.intersectSphere(sphere, target)) {
      localRay.closestPointToPoint(sphere.center, target);
    }
    return target.normalize();
  }

  function isOverTarget() {
    return raycaster.intersectObject(pickable, true).length > 0;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    updatePointer(event);
    if (!isOverTarget()) return;

    getPointerNormal(pointerNormal);
    grabOffset.setFromUnitVectors(pointerNormal, getNormal());

    dragging = true;
    controls.enabled = false;
    // 指標捕捉：拖到畫面外、或滑過其他元素，放開時還是會收到 pointerup
    domElement.setPointerCapture(event.pointerId);
    domElement.style.cursor = 'grabbing';
  }

  function onPointerMove(event: PointerEvent) {
    updatePointer(event);
    if (!dragging) {
      // 沒在拖曳時，滑過物件就把游標變成手掌，提示「這個可以拖」
      domElement.style.cursor = isOverTarget() ? 'grab' : '';
      return;
    }
    getPointerNormal(pointerNormal);
    onDrag(newNormal.copy(pointerNormal).applyQuaternion(grabOffset));
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    controls.enabled = true;
    domElement.releasePointerCapture(event.pointerId);
    domElement.style.cursor = '';
    onDragEnd?.();
  }

  // capture: true → 比 OrbitControls 先收到按下事件
  // 點到物件時先把 OrbitControls 停掉，它就不會在同一次按下時開始轉動畫面
  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
}
