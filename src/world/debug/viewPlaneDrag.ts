import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 在「目前看到的畫面」上直接拖曳物件：物件只會在跟螢幕平行的平面上移動，滑鼠往哪拖它就往哪跑
//
// 原理：
//   ① 按下時用射線（raycaster）檢查滑鼠有沒有點到物件
//   ② 點到了，就建立一個「面向攝影機、穿過物件中心」的平面
//   ③ 拖曳時把滑鼠射線和這個平面的交點當作新位置 → 物件永遠在跟螢幕平行的平面上移動
//
// 為什麼不用 three.js 內建的 DragControls？
//   它在「整組移動」模式會一路往上找到最外層的 Group，會搬到外層的容器而不是我們要的那一圈；
//   而且按著 Ctrl 會切成旋轉模式，調位置時容易誤觸

type ViewPlaneDragOptions = {
  // 要被搬動的物件（例如整圈緞帶的 pivot）
  target: THREE.Object3D;
  // 哪些東西可以「被點到」：通常就是 target 自己（會連同底下的子物件一起檢查）
  pickable: THREE.Object3D;
  camera: THREE.Camera;
  domElement: HTMLElement;
  // 拖曳時要暫停 OrbitControls，不然拖物件的同時畫面也會跟著轉
  controls: OrbitControls;
  onDrag?: () => void;
  onDragEnd?: () => void;
};

export function enableViewPlaneDrag({ target, pickable, camera, domElement, controls, onDrag, onDragEnd }: ViewPlaneDragOptions) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hitPoint = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  // 按下的位置和物件中心的差距：拖曳時維持這個差距，物件才不會「跳」到滑鼠正下方
  const grabOffset = new THREE.Vector3();
  const cameraDirection = new THREE.Vector3();
  let dragging = false;

  /** 把滑鼠的像素座標換成 -1 ~ 1 的標準化座標，射線要用這種座標 */
  function updatePointer(event: PointerEvent) {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function isOverTarget() {
    return raycaster.intersectObject(pickable, true).length > 0;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    updatePointer(event);
    const hit = raycaster.intersectObject(pickable, true)[0];
    if (!hit) return;

    // 平面：法線 = 攝影機看的方向，並穿過物件中心 → 跟螢幕平行
    target.getWorldPosition(targetWorld);
    plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(cameraDirection), targetWorld);
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
    grabOffset.subVectors(hitPoint, targetWorld);

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
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
    // 新的世界座標 = 滑鼠在平面上的點 - 按下時的差距
    targetWorld.subVectors(hitPoint, grabOffset);
    // position 是「相對於父物件」的座標，要把世界座標換回父物件的座標系才能直接寫入
    target.position.copy(target.parent ? target.parent.worldToLocal(targetWorld) : targetWorld);
    onDrag?.();
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
