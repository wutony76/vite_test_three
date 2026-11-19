import * as THREE from 'three';
import { cloneGltfInstance, loadGltfOnce, scheduleGltfMount } from './sharedGltf';

const PINEAPPLE_BUN_URL = `${import.meta.env.BASE_URL}models/pineapple_bun/pineapple_bun.glb`;

/**
 * 菠蘿麵包（菠蘿油＋頂上木牌「Welcome / HFYY world.」）：浮在番茄醬緞帶上、固定在畫面左側，載浮載沉。
 * 模型：tools/blender/plans/pineapple_bun.plan.json → public/models/pineapple_bun/pineapple_bun.glb
 *
 * 為什麼不放在綠球上？綠球（和鏡頭）會轉，放在球上的東西會跟著跑出畫面。
 * 為什麼不用「畫面比例」定位？視窗拉寬時畫面左下角已經離開番茄醬，麵包會浮在空中。
 *
 * 做法：鏡頭是繞著番茄醬圈圈的中心軸轉的（main.ts 的 ORBIT_ALONG_KETCHUP），
 * 所以「圈圈上離鏡頭最近的那一點」永遠在畫面正下方。從那一點沿著圈圈往畫面左邊繞固定的 ringAngleDegrees：
 *   - 鏡頭怎麼轉，麵包都在綠球的同一個相對位置（畫面左側）
 *   - 視窗寬窄改變時位置也不變（不看畫面比例，只看它在醬圈上的角度）
 *   - 超過 90° 就是醬圈的後段，在綠球後面、會被綠球擋住一部分
 */
export type PineappleBunSettings = {
  enabled: boolean;
  /** 從畫面正下方（醬圈離鏡頭最近的點）沿著醬往左繞幾度：小於 90° 在綠球前面，大於 90° 在綠球後面 */
  ringAngleDegrees: number;
  /** 沿著圈圈半徑往外（+）／往內（-）挪：外 = 離綠球遠一點、靠近醬的外緣 */
  radialOffset: number;
  /** 相對醬面的高度：0 = 麵包底部剛好貼著醬面，負 = 沉進醬裡（看起來泡在醬裡），正 = 浮起來 */
  lift: number;
  /** 模型高度（世界單位，含木牌；醬管半徑約 0.12） */
  size: number;
  /** 左右轉（0 = 木牌正對鏡頭） */
  yawDegrees: number;
  /** 往鏡頭方向前傾（看得到上面的酥皮格） */
  pitchDegrees: number;
  /** 上下起伏的高度（世界單位） */
  bobHeight: number;
  /** 起伏速度（每秒幾次） */
  bobSpeed: number;
  /** 搖晃角度（前後、左右各自晃） */
  swayDegrees: number;
  /** 載浮載沉時慢慢左右轉的角度（以 yawDegrees 為中心來回轉） */
  turnDegrees: number;
  /** 麵包底下醬面往下壓的深度：醬一團一團流過時才不會從麵包底部穿出來（0 = 不壓） */
  sauceDent: number;
};

export const PINEAPPLE_BUN_DEFAULT: PineappleBunSettings = {
  enabled: true,
  ringAngleDegrees: 115,
  radialOffset: 0.02,
  lift: -0.03,
  size: 0.32,
  yawDegrees: 29,
  pitchDegrees: 12,
  bobHeight: 0.026,
  bobSpeed: 0.35,
  swayDegrees: 7.5,
  turnDegrees: 14,
  sauceDent: 0.02,
}

type CreatePineappleBunOptions = {
  camera: THREE.PerspectiveCamera;
  /** 番茄醬整圈（ketchupRing.object）：圈圈在它的 xz 平面上、以 y 軸為中心 */
  ring: THREE.Object3D;
  /** 醬圈上某個角度（ring 座標）那一點的醬面（世界座標），含醬的鼓包、蠕動與自轉（ketchupRing.getSurfacePoint） */
  getSurfacePoint: (pivotAngle: number, radialOffset: number, up: THREE.Vector3, target: THREE.Vector3) => THREE.Vector3;
  envMap?: THREE.Texture;
  layout?: PineappleBunSettings;
};

const local = new THREE.Vector3();
const probe = new THREE.Vector3();
const offset = new THREE.Quaternion();
const euler = new THREE.Euler();
const cameraUp = new THREE.Vector3();

export function createPineappleBun({ camera, ring, getSurfacePoint, envMap, layout = PINEAPPLE_BUN_DEFAULT }: CreatePineappleBunOptions) {
  const settings: PineappleBunSettings = { ...layout };
  const anchor = new THREE.Object3D();
  anchor.name = 'pineapple_bun';
  const content = new THREE.Group();
  anchor.add(content);
  /**
   * 開場：番茄醬沿著圈圈長滿一圈之後，麵包才從醬裡浮上來（彈一下長大）。
   * appearAt = 醬長滿的那一刻（秒）；null = 醬還沒長滿（開場重播時會再變回 null）
   */
  let appearAt: number | null = null;
  let sauceReady = false;
  /** 浮上來要幾秒 */
  const APPEAR_SECONDS = 1.1;
  /** 模型原始高度：載入後量，用來把 size 換成縮放 */
  let modelHeight = 1.62;
  anchor.visible = false;

  loadGltfOnce(PINEAPPLE_BUN_URL)
    .then((gltf) => {
      scheduleGltfMount(() => {
        const model = cloneGltfInstance(gltf.scene);
        model.name = 'pineapple_bun_model';
        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.isMesh) return;
          // 浮在醬上，不投影子：鏡頭轉的時候影子會在綠球上亂跑
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            const m = material as THREE.MeshStandardMaterial;
            if (envMap && 'envMap' in m) {
              m.envMap = envMap;
              m.envMapIntensity = 0.35;
            }
          }
        });
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        modelHeight = Math.max(size.y, 1e-6);
        // 原點在麵包底部中心（plan 的設定），水平置中保險一次
        const center = box.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -box.min.y, -center.z);
        content.add(model);
        apply();
      });
    })
    .catch((error) => console.error(`[pineappleBun] 載入失敗：${PINEAPPLE_BUN_URL}`, error));

  /** 由 main.ts 每幀告訴它：番茄醬是不是已經繞滿一圈了 */
  function setSauceReady(ready: boolean) {
    sauceReady = ready;
    if (!ready) appearAt = null;
    apply();
  }

  function apply() {
    anchor.visible = settings.enabled && content.children.length > 0 && sauceReady;
    content.scale.setScalar(settings.size / modelHeight);
  }

  /** 每一幀呼叫（要在 controls.update() 之後：鏡頭轉完的位置才是這一幀的） */
  function update(time: number) {
    if (!anchor.visible) return;
    camera.updateMatrixWorld();
    ring.updateWorldMatrix(true, false);
    // 鏡頭換到圈圈自己的座標：圈圈在 xz 平面上，鏡頭在 xz 的方向就是「離鏡頭最近的那一點」的方向
    local.copy(camera.position);
    ring.worldToLocal(local);
    const nearest = Math.atan2(local.z, local.x);
    // 哪個繞行方向是畫面左邊（圈圈的繞行方向跟鏡頭的左右不一定一樣）：往兩邊各繞一點，看投影後哪一邊比較左
    cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    const screenXAt = (a: number) => getSurfacePoint(nearest + a, settings.radialOffset, cameraUp, probe).project(camera).x;
    const side = screenXAt(0.3) < screenXAt(-0.3) ? 1 : -1;
    const angle = nearest + side * THREE.MathUtils.degToRad(settings.ringAngleDegrees);
    // 麵包底部放在「醬面」上（含鼓包、蠕動）：醬往上鼓、往下凹，麵包都跟著，不會浮在空中
    getSurfacePoint(angle, settings.radialOffset, cameraUp, anchor.position);
    // 底下的凹洞會把醬面往下壓 sauceDent：麵包也一起往下坐進去；lift 是相對醬面（負 = 沉進醬裡）
    anchor.position.addScaledVector(cameraUp, settings.lift - settings.sauceDent);

    // 開場浮上來：從醬裡往上冒、彈一下長大（easeOutBack 會稍微超過 1 再回來，像「啵」一聲浮出來）
    if (appearAt === null) appearAt = time;
    const appear = THREE.MathUtils.clamp((time - appearAt) / APPEAR_SECONDS, 0, 1);
    const c1 = 1.70158;
    const grow = appear >= 1 ? 1 : 1 + (c1 + 1) * (appear - 1) ** 3 + c1 * (appear - 1) ** 2;
    anchor.scale.setScalar(Math.max(0.0001, grow));
    anchor.position.addScaledVector(cameraUp, -(1 - Math.min(appear * 1.4, 1)) * settings.size * 0.4);

    // 起伏：沿著畫面的「上」上下浮動（兩個頻率疊在一起，看起來不會像機器一樣規律）
    const t = time * settings.bobSpeed * Math.PI * 2;
    const bob = Math.sin(t) * 0.7 + Math.sin(t * 0.53 + 1.3) * 0.3;
    anchor.position.addScaledVector(cameraUp, bob * settings.bobHeight);

    // 朝向：跟鏡頭同一個方向（木牌正對鏡頭），再加上自己的轉向、前傾和搖晃
    const sway = THREE.MathUtils.degToRad(settings.swayDegrees);
    euler.set(
      THREE.MathUtils.degToRad(settings.pitchDegrees) + Math.sin(t * 0.8 + 0.6) * sway,
      // 左右轉：比起伏慢一點（0.43 倍），像浮在醬上被醬流推著慢慢轉過來又轉回去
      THREE.MathUtils.degToRad(settings.yawDegrees + Math.sin(t * 0.43 + 0.8) * settings.turnDegrees),
      Math.sin(t * 0.9 + 2.1) * sway,
      'YXZ',
    );
    anchor.quaternion.copy(camera.quaternion).multiply(offset.setFromEuler(euler));
  }

  /**
   * 麵包在醬上佔的範圍：底部中心（世界座標）＋半徑。給番茄醬壓凹洞、讓食物和鯊魚繞過。
   * 半徑用下半顆的寬度（模型寬 0.96／高 1.62 → 每單位高度約 0.3）再多一點，麵包左右搖晃時也蓋得住。
   */
  function getFootprint() {
    if (!anchor.visible) return null;
    return { center: anchor.position, radius: settings.size * 0.36 };
  }

  return { object: anchor, settings, apply, update, getFootprint, setSauceReady };
}

export function formatPineappleBunSettingsForPaste(s: PineappleBunSettings) {
  return (
    `// 貼回 src/world/objects/pineappleBun.ts 的 PINEAPPLE_BUN_DEFAULT\n` +
    `export const PINEAPPLE_BUN_DEFAULT: PineappleBunSettings = {\n` +
    `  enabled: ${s.enabled},\n` +
    `  ringAngleDegrees: ${Math.round(s.ringAngleDegrees)},\n` +
    `  radialOffset: ${s.radialOffset.toFixed(3)},\n` +
    `  lift: ${s.lift.toFixed(3)},\n` +
    `  size: ${s.size.toFixed(3)},\n` +
    `  yawDegrees: ${Math.round(s.yawDegrees)},\n` +
    `  pitchDegrees: ${Math.round(s.pitchDegrees)},\n` +
    `  bobHeight: ${s.bobHeight.toFixed(3)},\n` +
    `  bobSpeed: ${s.bobSpeed.toFixed(2)},\n` +
    `  swayDegrees: ${s.swayDegrees.toFixed(1)},\n` +
    `  turnDegrees: ${s.turnDegrees.toFixed(1)},\n` +
    `  sauceDent: ${s.sauceDent.toFixed(3)},\n` +
    `};`
  );
}
