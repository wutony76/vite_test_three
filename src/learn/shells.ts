import * as THREE from 'three';

/**
 * 砲彈系統：發射、飛行（受重力影響畫出拋物線）、落地爆炸
 *
 * 用法：
 *   const shells = new Shells(scene, groundY);
 *   shells.fire(cannon);   // 按空白鍵時
 *   shells.update(dt);     // 每一幀
 */

const SHELL_SPEED = 12; // 砲彈初速（公尺 / 秒）：落點約 10 公尺外，看得到整條拋物線
const GRAVITY = 9.8; // 重力加速度（公尺 / 秒²）
const COOLDOWN = 0.4; // 兩發之間至少間隔幾秒
const MUZZLE_OFFSET = 1.5; // 砲管長 3，砲口在中心往前 1.5 的地方

type Shell = { mesh: THREE.Mesh; velocity: THREE.Vector3 };
type Explosion = { mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; age: number };

export class Shells {
  private readonly scene: THREE.Scene;
  private readonly groundY: number;
  private readonly shells: Shell[] = [];
  private readonly explosions: Explosion[] = [];
  private cooldown = 0;

  // 所有砲彈共用同一個形狀、材質（有幾種外觀就建幾個材質）
  private readonly shellGeometry = new THREE.SphereGeometry(0.15, 12, 8);
  private readonly shellMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
  private readonly explosionGeometry = new THREE.SphereGeometry(1, 16, 12);

  constructor(scene: THREE.Scene, groundY: number) {
    this.scene = scene;
    this.groundY = groundY;
  }

  /**
   * 從砲管口發射一顆砲彈
   * @returns 是否有發射（冷卻中會回傳 false）
   */
  fire(cannon: THREE.Object3D) {
    if (this.cooldown > 0) return false;
    this.cooldown = COOLDOWN;

    // 砲管是圓柱，長軸是自己的 y 軸（在 tank.ts 裡轉了 90° 才朝前）
    // localToWorld：把「砲管自己座標裡的一個點」換算成世界座標
    // → 不管戰車怎麼轉、砲塔怎麼轉，算出來的砲口位置都是對的
    const muzzle = cannon.localToWorld(new THREE.Vector3(0, MUZZLE_OFFSET, 0));
    const base = cannon.localToWorld(new THREE.Vector3(0, 0, 0));
    // 方向 = 砲口 - 砲管中心，再正規化成長度 1
    const direction = muzzle.clone().sub(base).normalize();

    const mesh = new THREE.Mesh(this.shellGeometry, this.shellMaterial);
    mesh.position.copy(muzzle);
    mesh.castShadow = true;
    this.scene.add(mesh);

    // 初速沿砲管方向，再往上加一點，飛得比較遠、拋物線比較明顯
    const velocity = direction.multiplyScalar(SHELL_SPEED);
    velocity.y += 2;
    this.shells.push({ mesh, velocity });
    return true;
  }

  /** 每一幀呼叫：dt = 距離上一幀的秒數 */
  update(dt: number) {
    this.cooldown = Math.max(0, this.cooldown - dt);

    // ── 砲彈飛行 ──
    // 從陣列尾巴往前跑：中途刪掉元素時，前面的索引不會亂掉
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const shell = this.shells[i];
      // 重力：每秒讓往下的速度增加 9.8
      shell.velocity.y -= GRAVITY * dt;
      // 位置 += 速度 × 時間
      shell.mesh.position.addScaledVector(shell.velocity, dt);

      // 落地 → 爆炸、移除砲彈
      if (shell.mesh.position.y <= this.groundY) {
        this.explode(shell.mesh.position);
        this.scene.remove(shell.mesh);
        this.shells.splice(i, 1);
      }
    }

    // ── 爆炸：0.5 秒內放大、變淡、消失 ──
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const explosion = this.explosions[i];
      explosion.age += dt;
      const t = explosion.age / 0.5; // 0 → 1
      explosion.mesh.scale.setScalar(0.3 + t * 1.5);
      explosion.mesh.material.opacity = 1 - t;
      // 顏色從亮黃變成橘紅
      explosion.mesh.material.color.setHSL(0.12 - t * 0.1, 1, 0.6 - t * 0.2);

      if (t >= 1) {
        this.scene.remove(explosion.mesh);
        // 每個爆炸有自己的材質（透明度各自不同），用完要釋放
        explosion.mesh.material.dispose();
        this.explosions.splice(i, 1);
      }
    }
  }

  private explode(position: THREE.Vector3) {
    // 每個爆炸各自一個材質：同時有好幾個爆炸時，透明度才能各自變化
    const material = new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(this.explosionGeometry, material);
    mesh.position.set(position.x, this.groundY, position.z);
    this.scene.add(mesh);
    this.explosions.push({ mesh, age: 0 });
  }
}
