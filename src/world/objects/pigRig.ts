import * as THREE from 'three';

/**
 * 第二版小豬（pig_v2.glb）的「骨架」：讓四隻腳、耳朵、尾巴各自動起來。
 *
 * pig_v2 的腳、耳朵、尾巴是獨立節點（見 tools/blender/plans/pig_v2.plan.json 的 anim_groups），
 * 但節點的原點在零件 bounds 的「底面中心」，直接旋轉節點會繞錯地方：
 *   - 腳應該繞「腿頂」（插進肚子的那端）前後擺；繞腳底轉，整隻腳會像雨刷一樣掃過地面
 *   - 耳朵繞「耳根」晃；尾巴繞「接在屁股上的那端」搖
 * 所以每個零件外面包一層 pivot Group，放在正確的轉軸位置，動畫只轉 pivot。
 *
 * 座標：glTF 是 Y 朝上；Blender 的正面 -Y 匯出後變成 +Z，所以模型的「前方」是 +Z、側邊是 X。
 * 舊版 pig.glb 沒有這些節點時，createPigRig 回傳 null，小豬照舊只做整隻搖晃。
 */

type PivotPart = { pivot: THREE.Object3D; side: number };

const box = new THREE.Box3();
const pivotPoint = new THREE.Vector3();

/** 把 node 包進一個 pivot Group；pivot 放在 node 自己幾何的某個點（由 pick 從 bounding box 選） */
function wrapWithPivot(node: THREE.Object3D, pick: (b: THREE.Box3, out: THREE.Vector3) => void) {
  const mesh = node as THREE.Mesh;
  if (!mesh.geometry) return null;
  mesh.geometry.computeBoundingBox();
  box.copy(mesh.geometry.boundingBox!);
  pick(box, pivotPoint);
  // node 局部的點 → node 父節點座標（節點本身只有平移與縮放，沒有旋轉）
  pivotPoint.multiply(node.scale).add(node.position);
  const parent = node.parent;
  if (!parent) return null;
  const pivot = new THREE.Group();
  pivot.name = `${node.name}_pivot`;
  pivot.position.copy(pivotPoint);
  parent.add(pivot);
  // 少了這一步，零件會跟著 pivot 一起被搬到轉軸位置，整個錯位
  node.position.sub(pivotPoint);
  pivot.add(node);
  return pivot;
}

export function createPigRig(model: THREE.Object3D) {
  const find = (suffix: string) => {
    let found: THREE.Object3D | null = null;
    model.traverse((child) => {
      if (!found && child.name.endsWith(suffix)) found = child;
    });
    return found as THREE.Object3D | null;
  };

  const legs: PivotPart[] = [];
  // fl/br 一組、fr/bl 一組，兩組相差半拍：四腳動物走路的「對角步」
  for (const [suffix, phase] of [['leg_fl', 0], ['leg_br', 0], ['leg_fr', 1], ['leg_bl', 1]] as const) {
    const node = find(suffix);
    if (!node) continue;
    const pivot = wrapWithPivot(node, (b, out) => out.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2));
    if (pivot) legs.push({ pivot, side: phase });
  }
  const ears: PivotPart[] = [];
  for (const [suffix, side] of [['ear_l', -1], ['ear_r', 1]] as const) {
    const node = find(suffix);
    if (!node) continue;
    const pivot = wrapWithPivot(node, (b, out) => out.set((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2));
    if (pivot) ears.push({ pivot, side });
  }
  const tailNode = find('tail');
  // 尾巴的根部在最靠近身體的那端：模型前方是 +Z，所以是 bounding box 的 max.z
  const tail = tailNode
    ? wrapWithPivot(tailNode, (b, out) => out.set((b.min.x + b.max.x) / 2, b.min.y + (b.max.y - b.min.y) * 0.3, b.max.z))
    : null;

  if (legs.length === 0 && ears.length === 0 && !tail) return null;

  let time = 0;

  /**
   * walkPhase：步伐相位（弧度，跟整隻搖晃同一個節奏，腳步和身體擺動才對得上）
   * walkAmount：0 = 站著、1 = 正在走；停下來時腳會慢慢回正，不會瞬間站直
   */
  function update(deltaTime: number, walkPhase: number, walkAmount: number) {
    time += deltaTime;
    for (const leg of legs) {
      // 繞 X 軸前後擺；0.55 rad ≈ 31°，短腿擺大一點才看得出在走
      leg.pivot.rotation.x = Math.sin(walkPhase + leg.side * Math.PI) * 0.55 * walkAmount;
    }
    for (const ear of ears) {
      // 走路時耳朵跟著步伐上下拍；站著時慢慢、輕輕地晃（看起來還活著）
      const idle = Math.sin(time * 2.1 + ear.side) * 0.08;
      const bounce = Math.sin(walkPhase * 2 + ear.side * 0.6) * 0.22 * walkAmount;
      ear.pivot.rotation.z = ear.side * (idle + bounce);
      ear.pivot.rotation.x = bounce * 0.5;
    }
    if (tail) {
      // 尾巴一直左右搖（小花跟著甩），走路時搖得更快
      const wagSpeed = 7 + walkAmount * 6;
      tail.rotation.y = Math.sin(time * wagSpeed) * (0.35 + 0.2 * walkAmount);
      tail.rotation.x = Math.sin(time * wagSpeed * 0.5) * 0.12;
    }
  }

  return { update };
}
