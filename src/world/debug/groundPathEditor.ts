import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * 在綠球上直接編輯小徑：
 *   - 在綠球上「點一下」（不是拖）：在目前這條路的尾端加一個路點
 *   - 按住路點拖曳：移動路點（拖的時候畫面不會跟著轉）
 *   - 在路點上按右鍵：刪除這個路點
 *   - 點到別條路的路點：切換成編輯那一條
 *
 * 路點顯示成小圓球：目前這條路是粉紅色，其他路是白色。
 * 只在「編輯模式」開著時有作用；關掉時完全不攔滑鼠事件。
 */
type PathDetailApi = {
  customPaths: THREE.Vector3[][];
  refreshPaths: () => void;
  rescatter: () => void;
};

type GroundPathEditorOptions = {
  ground: THREE.Object3D;
  ballMesh: THREE.Mesh;
  groundRadius: number;
  camera: THREE.Camera;
  domElement: HTMLElement;
  controls: OrbitControls;
  detail: PathDetailApi;
  /** 路線有變動（加點、刪點、拖完、新增／刪除路）時呼叫，例如印出佈局 */
  onChange?: () => void;
};

const CLICK_DISTANCE = 5;
const HANDLE_LIFT = 0.006;

export function enableGroundPathEditor({
  ground,
  ballMesh,
  groundRadius,
  camera,
  domElement,
  controls,
  detail,
  onChange,
}: GroundPathEditorOptions) {
  const state = { editing: false, activePath: 0 };
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const handles = new THREE.Group();
  handles.name = 'ground_path_handles';
  handles.visible = false;
  ground.add(handles);
  const handleGeometry = new THREE.SphereGeometry(0.011, 12, 8);
  // toneMapped: false → 畫面風格統一（styleGrade）不會幫它調色，路點保持醒目
  const activeMaterial = new THREE.MeshBasicMaterial({ color: 0xff6f9f, toneMapped: false });
  const idleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });

  type HandleRef = { path: number; index: number };
  const handleRefs = new Map<THREE.Object3D, HandleRef>();

  let dragging: HandleRef | null = null;
  let pendingClick = false;
  let downX = 0;
  let downY = 0;
  let rescatterTimer: ReturnType<typeof setTimeout> | null = null;

  function rebuildHandles() {
    handles.clear();
    handleRefs.clear();
    detail.customPaths.forEach((path, pathIndex) => {
      path.forEach((normal, index) => {
        const mesh = new THREE.Mesh(handleGeometry, pathIndex === state.activePath ? activeMaterial : idleMaterial);
        mesh.position.copy(normal).multiplyScalar(groundRadius + HANDLE_LIFT);
        // 每條路的第一個點大一點，看得出路的起點
        if (index === 0) mesh.scale.setScalar(1.4);
        handles.add(mesh);
        handleRefs.set(mesh, { path: pathIndex, index });
      });
    });
  }

  function changed(rescatterSoon: boolean) {
    detail.refreshPaths();
    rebuildHandles();
    if (rescatterSoon) {
      // 路改了，草叢和道具重撒才會避開新路；連續操作時只在最後撒一次
      if (rescatterTimer) clearTimeout(rescatterTimer);
      rescatterTimer = setTimeout(() => detail.rescatter(), 400);
    }
    onChange?.();
  }

  function updatePointer(event: PointerEvent | MouseEvent) {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function hitHandle(): HandleRef | null {
    const hits = raycaster.intersectObjects(handles.children, false);
    return hits.length ? handleRefs.get(hits[0].object) ?? null : null;
  }

  /**
   * 點到的是不是「綠球的地面」：從 ground 底下所有東西裡找第一個被射中的，
   * 草叢、道具這類 InstancedMesh 不算（太小、會擋路）；房子擋在前面就不算點到地面。
   */
  function hitGround(allowBlockers: boolean): THREE.Vector3 | null {
    const hits = allowBlockers
      ? raycaster.intersectObject(ballMesh, false)
      : raycaster.intersectObject(ground, true).filter((hit) => {
          const object = hit.object;
          if ((object as THREE.InstancedMesh).isInstancedMesh) return false;
          if (handleRefs.has(object)) return false;
          if ((object as THREE.Sprite).isSprite) return false;
          return true;
        });
    if (!hits.length || hits[0].object !== ballMesh) return null;
    return ground.worldToLocal(hits[0].point.clone()).normalize();
  }

  function onPointerDown(event: PointerEvent) {
    if (!state.editing) return;
    updatePointer(event);
    const handle = hitHandle();
    if (handle) {
      // 不讓 OrbitControls、拖房子的功能收到這次按下
      event.stopImmediatePropagation();
      event.preventDefault();
      if (event.button === 2) {
        detail.customPaths[handle.path].splice(handle.index, 1);
        if (detail.customPaths[handle.path].length === 0) {
          detail.customPaths.splice(handle.path, 1);
          state.activePath = Math.max(0, Math.min(state.activePath, detail.customPaths.length - 1));
        }
        changed(true);
        return;
      }
      if (event.button !== 0) return;
      state.activePath = handle.path;
      dragging = handle;
      controls.enabled = false;
      domElement.setPointerCapture(event.pointerId);
      domElement.style.cursor = 'grabbing';
      rebuildHandles();
      return;
    }
    if (event.button === 0) {
      pendingClick = true;
      downX = event.clientX;
      downY = event.clientY;
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!state.editing) return;
    updatePointer(event);
    if (!dragging) {
      domElement.style.cursor = hitHandle() ? 'grab' : '';
      return;
    }
    // 拖曳中只看綠球本身（拖過房子底下也要能繼續移動）
    const normal = hitGround(true);
    if (!normal) return;
    const point = detail.customPaths[dragging.path]?.[dragging.index];
    if (!point) return;
    point.copy(normal);
    detail.refreshPaths();
    const mesh = [...handleRefs.entries()].find(([, ref]) => ref.path === dragging!.path && ref.index === dragging!.index)?.[0];
    mesh?.position.copy(normal).multiplyScalar(groundRadius + HANDLE_LIFT);
  }

  function onPointerUp(event: PointerEvent) {
    if (!state.editing) return;
    if (dragging) {
      dragging = null;
      controls.enabled = true;
      domElement.releasePointerCapture(event.pointerId);
      domElement.style.cursor = '';
      changed(true);
      return;
    }
    if (!pendingClick) return;
    pendingClick = false;
    const dx = event.clientX - downX;
    const dy = event.clientY - downY;
    // 有拖動 = 在轉畫面，不是要加點
    if (dx * dx + dy * dy > CLICK_DISTANCE * CLICK_DISTANCE) return;
    updatePointer(event);
    const normal = hitGround(false);
    if (!normal) return;
    if (detail.customPaths.length === 0) {
      detail.customPaths.push([]);
      state.activePath = 0;
    }
    detail.customPaths[state.activePath].push(normal);
    changed(true);
  }

  function onContextMenu(event: MouseEvent) {
    // 編輯時右鍵用來刪點，不要跳出瀏覽器選單
    if (state.editing) event.preventDefault();
  }

  // capture: true → 比 OrbitControls 與拖房子的功能先收到按下事件
  domElement.addEventListener('pointerdown', onPointerDown, { capture: true });
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('contextmenu', onContextMenu);

  function setEditing(on: boolean) {
    state.editing = on;
    handles.visible = on;
    if (on) rebuildHandles();
    if (!on && dragging) {
      dragging = null;
      controls.enabled = true;
    }
    domElement.style.cursor = '';
  }

  function addPath() {
    detail.customPaths.push([]);
    state.activePath = detail.customPaths.length - 1;
    rebuildHandles();
    onChange?.();
  }

  function deleteActivePath() {
    if (detail.customPaths.length === 0) return;
    detail.customPaths.splice(state.activePath, 1);
    state.activePath = Math.max(0, Math.min(state.activePath, detail.customPaths.length - 1));
    changed(true);
  }

  function clearAll() {
    detail.customPaths.length = 0;
    state.activePath = 0;
    changed(true);
  }

  return { state, setEditing, addPath, deleteActivePath, clearAll, rebuildHandles };
}
