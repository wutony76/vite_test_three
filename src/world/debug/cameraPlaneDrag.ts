import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 拖曳「黏在鏡頭上」的物件（例如浮空小星球）：
// 物件位置是用鏡頭座標存的（camX／camY），所以拖曳就是把滑鼠移動的像素，換算成鏡頭座標的距離。
// 跟 surfaceDrag 不同：那個是貼著綠球表面走；這個是在跟螢幕平行的平面上平移。

type CameraPlaneDragOptions = {
  object: THREE.Object3D;
  /** 鏡頭座標：x 右、y 上、z 深度（負數，越負越遠） */
  position: { camX: number; camY: number; camZ: number };
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  controls: OrbitControls;
  onDrag?: () => void;
  onDragEnd?: () => void;
};

const CLICK_DISTANCE = 4;

export function enableCameraPlaneDrag({
  object,
  position,
  camera,
  domElement,
  controls,
  onDrag,
  onDragEnd,
}: CameraPlaneDragOptions) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let active = false;
  let lastX = 0;
  let lastY = 0;
  let downX = 0;
  let downY = 0;

  function updatePointer(event: PointerEvent) {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function hitsObject() {
    if (!object.visible) return false;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(object, true).length > 0;
  }

  /**
   * 一個像素等於鏡頭座標多少距離：在深度 |camZ| 那個平面上，畫面高度 = 2·|z|·tan(fov/2)。
   * 越遠的東西，同樣滑一個像素要移動越多，拖起來才會「黏在滑鼠下」。
   */
  function unitsPerPixel() {
    const depth = Math.abs(position.camZ);
    const visibleHeight = 2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.max(camera.zoom, 1e-4);
    return visibleHeight / Math.max(domElement.clientHeight, 1);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    updatePointer(event);
    if (!hitsObject()) return;
    active = true;
    lastX = downX = event.clientX;
    lastY = downY = event.clientY;
    // 先停掉 OrbitControls，同一次按下才不會連畫面一起轉
    controls.enabled = false;
    // stopImmediatePropagation：不讓 surfaceDrag 把這次點擊當成「點到空白處」
    event.stopImmediatePropagation();
    domElement.setPointerCapture(event.pointerId);
    domElement.style.cursor = 'grabbing';
  }

  function onPointerMove(event: PointerEvent) {
    if (!active) {
      updatePointer(event);
      if (hitsObject()) domElement.style.cursor = 'grab';
      return;
    }
    const k = unitsPerPixel();
    position.camX += (event.clientX - lastX) * k;
    // 螢幕的 y 往下增加，鏡頭座標的 y 往上增加，所以要反過來
    position.camY -= (event.clientY - lastY) * k;
    lastX = event.clientX;
    lastY = event.clientY;
    onDrag?.();
  }

  function onPointerUp(event: PointerEvent) {
    if (!active) return;
    active = false;
    controls.enabled = true;
    domElement.releasePointerCapture(event.pointerId);
    domElement.style.cursor = '';
    const dx = event.clientX - downX;
    const dy = event.clientY - downY;
    if (dx * dx + dy * dy > CLICK_DISTANCE * CLICK_DISTANCE) onDragEnd?.();
  }

  // capture: true → 比 OrbitControls 和 surfaceDrag 先收到按下事件
  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
}
