import * as THREE from 'three';
import { beeBody, beeWing } from './critters';

/**
 * 蜜蜂巢的蜂群：小豬經過有蜂巢的香菇時，有機率飛出一群蜜蜂追著小豬跑，追一陣子再飛回蜂巢。
 *
 * 運作方式（全部在 ground 的座標系裡算：球心在原點）：
 *   - start(hive)：所有蜜蜂從蜂巢洞口一隻隻接連飛出來（錯開一點時間，像湧出來）
 *   - 追：每隻蜜蜂各自繞著「小豬頭上一點」的目標點轉小圈，圈的半徑、高度、速度都不一樣 → 看起來是一團亂飛的蜂群
 *     用「彈簧＋阻尼」往目標拉（不是瞬移），轉彎會甩一下，比較卡通
 *   - chaseSeconds 秒後：飛回蜂巢，到洞口就縮小消失
 *   - 蜜蜂永遠飛在地面上方（低於地表就推回去）
 *
 * 造型沿用島上生物的蜜蜂（黃黑條紋、半透明翅膀），翅膀快速拍動。
 */

export type BeeSwarmSettings = {
  /** 小豬經過時觸發的機率（0 ~ 1） */
  chance: number;
  /** 一次飛出幾隻 */
  beeCount: number;
  /** 追幾秒 */
  chaseSeconds: number;
  /** 被追時小豬的速度倍率 */
  pigSpeedBoost: number;
  /** 小豬離香菇多近算「經過」（度，綠球上的角距離） */
  triggerDegrees: number;
  /** 蜜蜂大小倍率：1 = 跟島上生物的蜜蜂一樣大（會跟著島上生物的「大小」一起變） */
  beeScale: number;
  /** 小豬偶爾自己跑去逗弄蜜蜂 */
  autoTease: boolean;
  /** 自己去逗弄的平均間隔（秒；實際會前後隨機 ±40%） */
  autoTeaseSeconds: number;
};

export const BEE_SWARM_DEFAULT: BeeSwarmSettings = {
  chance: 0.8,
  beeCount: 16,
  chaseSeconds: 7,
  pigSpeedBoost: 3,
  triggerDegrees: 7,
  beeScale: 1,
  autoTease: true,
  autoTeaseSeconds: 45,
};

const MAX_BEES = 40;
/** 蜜蜂身長（世界單位）：跟島上生物的蜜蜂一樣（critters.ts 的 BODY_LENGTH.bee），再乘島上生物的「大小」 */
const BEE_LENGTH = 0.011;

type Bee = {
  root: THREE.Group;
  wingL: THREE.Mesh;
  wingR: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** 出場延遲（秒）：一隻隻接連飛出來 */
  delay: number;
  mode: 'idle' | 'chase' | 'return';
  grow: number;
  /** 繞圈參數：每隻不一樣 */
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  height: number;
  bobPhase: number;
};

export function createBeeSwarm() {
  const settings: BeeSwarmSettings = { ...BEE_SWARM_DEFAULT };
  const group = new THREE.Group();
  group.name = 'bee_swarm';

  const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
  const wingMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.3,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
  });
  const bodyGeometry = beeBody();
  const wingGeometryL = beeWing(true);
  const wingGeometryR = beeWing(false);

  const bees: Bee[] = Array.from({ length: MAX_BEES }, (_, i) => {
    const root = new THREE.Group();
    root.name = `swarm_bee_${i}`;
    root.visible = false;
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    root.add(body);
    // 翅膀以身體中線為軸拍：翅膀根部在 x = 0，往外伸
    const wingL = new THREE.Mesh(wingGeometryL, wingMaterial);
    const wingR = new THREE.Mesh(wingGeometryR, wingMaterial);
    root.add(wingL, wingR);
    group.add(root);
    return {
      root,
      wingL,
      wingR,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      delay: 0,
      mode: 'idle',
      grow: 0,
      orbitRadius: 0,
      orbitSpeed: 0,
      orbitPhase: 0,
      height: 0,
      bobPhase: 0,
    };
  });

  let chaseRemaining = 0;
  let time = 0;
  const hive = new THREE.Vector3();
  const target = new THREE.Vector3();
  const up = new THREE.Vector3();
  const east = new THREE.Vector3();
  const north = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const side = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const toTarget = new THREE.Vector3();

  /** 從蜂巢洞口（ground 座標）飛出一群蜜蜂 */
  function start(hiveMouth: THREE.Vector3) {
    hive.copy(hiveMouth);
    chaseRemaining = settings.chaseSeconds;
    const count = Math.min(MAX_BEES, Math.max(1, Math.round(settings.beeCount)));
    for (let i = 0; i < MAX_BEES; i++) {
      const bee = bees[i];
      if (i >= count) {
        bee.mode = 'idle';
        bee.root.visible = false;
        continue;
      }
      bee.mode = 'chase';
      bee.delay = i * 0.06 + Math.random() * 0.05;
      bee.grow = 0;
      bee.pos.copy(hive);
      bee.vel.set(0, 0, 0);
      bee.orbitRadius = 0.012 + Math.random() * 0.022;
      bee.orbitSpeed = (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 4);
      bee.orbitPhase = Math.random() * Math.PI * 2;
      bee.height = 0.018 + Math.random() * 0.03;
      bee.bobPhase = Math.random() * Math.PI * 2;
      bee.root.visible = false;
    }
  }

  /** 正在追小豬嗎（給外面決定小豬要不要加速） */
  function isChasing() {
    return chaseRemaining > 0;
  }

  /** 還有蜜蜂在外面飛嗎（追完飛回去的途中也算） */
  function isActive() {
    return bees.some((bee) => bee.mode !== 'idle');
  }

  /**
   * 每幀：pig = 小豬在 ground 座標裡的位置（地表上）；groundRadius = 綠球半徑；
   * critterSize = 島上生物面板的「大小」（蜂群跟島上的蜜蜂一樣大）
   */
  function update(deltaTime: number, pig: THREE.Vector3 | null, groundRadius: number, critterSize = 1) {
    if (deltaTime <= 0) return;
    time += deltaTime;
    if (chaseRemaining > 0) {
      chaseRemaining -= deltaTime;
      if (chaseRemaining <= 0) {
        for (const bee of bees) if (bee.mode === 'chase') bee.mode = 'return';
      }
    }
    const length = BEE_LENGTH * Math.max(0.1, critterSize) * settings.beeScale;
    for (const bee of bees) {
      if (bee.mode === 'idle') continue;
      if (bee.delay > 0) {
        bee.delay -= deltaTime;
        continue;
      }
      bee.root.visible = true;
      // ── 目標點 ──
      if (bee.mode === 'chase' && pig) {
        // 繞著「小豬頭上一點」轉小圈：在小豬所在的地表切平面上畫圓，再加上下起伏
        up.copy(pig).normalize();
        east.crossVectors(up, Math.abs(up.y) < 0.9 ? Y : X).normalize();
        north.crossVectors(east, up);
        const a = time * bee.orbitSpeed + bee.orbitPhase;
        target
          .copy(pig)
          .addScaledVector(up, bee.height + Math.sin(time * 5 + bee.bobPhase) * 0.006)
          .addScaledVector(east, Math.cos(a) * bee.orbitRadius)
          .addScaledVector(north, Math.sin(a) * bee.orbitRadius);
      } else {
        target.copy(hive);
      }
      // ── 彈簧＋阻尼：往目標拉，轉彎會甩一下 ──
      toTarget.subVectors(target, bee.pos);
      const stiffness = bee.mode === 'chase' ? 38 : 22;
      bee.vel.addScaledVector(toTarget, stiffness * deltaTime);
      bee.vel.multiplyScalar(Math.exp(-4.5 * deltaTime));
      const maxSpeed = 0.6;
      if (bee.vel.length() > maxSpeed) bee.vel.setLength(maxSpeed);
      bee.pos.addScaledVector(bee.vel, deltaTime);
      // 不能鑽進地面
      const minR = groundRadius + 0.006;
      if (bee.pos.length() < minR) bee.pos.setLength(minR);
      // ── 出場長大、回巢縮小 ──
      if (bee.mode === 'return' && toTarget.length() < 0.01) {
        bee.grow = Math.max(0, bee.grow - deltaTime * 4);
        if (bee.grow <= 0) {
          bee.mode = 'idle';
          bee.root.visible = false;
          continue;
        }
      } else {
        bee.grow = Math.min(1, bee.grow + deltaTime * 5);
      }
      // ── 朝向：頭朝飛的方向，背朝地表外側 ──
      up.copy(bee.pos).normalize();
      forward.copy(bee.vel).addScaledVector(up, -bee.vel.dot(up));
      if (forward.lengthSq() < 1e-8) forward.copy(toTarget).addScaledVector(up, -toTarget.dot(up));
      if (forward.lengthSq() < 1e-8) forward.crossVectors(up, X);
      forward.normalize();
      side.crossVectors(up, forward).normalize();
      basis.makeBasis(side, up, forward);
      bee.root.quaternion.setFromRotationMatrix(basis);
      bee.root.position.copy(bee.pos);
      // 出場「啵」一下（overshoot）
      const pop = bee.grow < 1 ? Math.sin(bee.grow * Math.PI * 0.5) * (1 + 0.25 * Math.sin(bee.grow * Math.PI)) : 1;
      bee.root.scale.setScalar(length * pop);
      // 翅膀快速拍動
      const flap = 0.3 + Math.sin(time * 60 + bee.bobPhase) * 0.45;
      bee.wingL.rotation.z = -flap;
      bee.wingR.rotation.z = flap;
    }
  }

  function dispose() {
    group.removeFromParent();
    bodyGeometry.dispose();
    wingGeometryL.dispose();
    wingGeometryR.dispose();
    bodyMaterial.dispose();
    wingMaterial.dispose();
  }

  return { object: group, settings, start, update, isChasing, isActive, dispose };
}

const Y = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

export function formatBeeSwarmSettingsForPaste(s: BeeSwarmSettings) {
  return (
    `// 貼回 src/world/objects/beeSwarm.ts 的 BEE_SWARM_DEFAULT\n` +
    `export const BEE_SWARM_DEFAULT: BeeSwarmSettings = {\n` +
    `  chance: ${s.chance.toFixed(2)},\n` +
    `  beeCount: ${Math.round(s.beeCount)},\n` +
    `  chaseSeconds: ${s.chaseSeconds.toFixed(1)},\n` +
    `  pigSpeedBoost: ${s.pigSpeedBoost.toFixed(2)},\n` +
    `  triggerDegrees: ${s.triggerDegrees.toFixed(1)},\n` +
    `  beeScale: ${s.beeScale.toFixed(2)},\n` +
    `  autoTease: ${s.autoTease},\n` +
    `  autoTeaseSeconds: ${s.autoTeaseSeconds.toFixed(0)},\n` +
    `};\n`
  );
}
