import * as THREE from 'three';

/**
 * 建立一台坦克
 *
 * 用「函式」而不是直接 export 一個建好的 tank：
 * 每呼叫一次就得到一台新的坦克，想放幾台都可以
 *
 * 回傳 tank（整台）之外，也回傳 turret（砲塔）、cannon（砲管），
 * 之後要讓砲塔轉向、砲管抬高時，外面可以直接控制這些零件
 */

// 整台坦克的「根」：移動、旋轉 tank，車身、砲塔、砲管都會一起動
export function createTank() {
  const tank = new THREE.Object3D();

  // 車身
  const bodyGeometry = new THREE.BoxGeometry(4, 1, 6);
  const bodyMaterial = new THREE.MeshPhongMaterial({ color: 0x6688AA });
  const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
  bodyMesh.position.y = 1;
  bodyMesh.castShadow = true;
  tank.add(bodyMesh);

  /**
  // 車輪
  const wheelGeometry = new THREE.CylinderGeometry(0.6, 0.6, 0.4, 6);
  const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });
  const wheels = []; // 儲存輪子物件以利後續動畫旋轉
  const numWheelsPerSide = 5;
  const wheelSpacing = 1;

  for (let side = -1; side <= 1; side += 2) { // -1 表示左邊，1 表示右邊
    for (let i = 0; i < numWheelsPerSide; i++) {
      const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);

      // 將圓柱體轉橫向 (X 軸朝外)
      wheelMesh.rotation.z = Math.PI / 2;
      // 排列輪子位置
      const x = side * 2; // 左右間隔
      const y = 0.6;      // 輪子半徑的高度
      const z = (i - (numWheelsPerSide - 1) / 2) * wheelSpacing; // 前後均勻排列
      wheelMesh.position.set(x, y, z);
      wheelMesh.castShadow = true;

      tank.add(wheelMesh);
      wheels.push(wheelMesh);
    }
  }
  */


  // --- 車輪與履帶配置 ---
  // 標明型別：之後 drive() 要讀 wheel.rotation，TypeScript 需要知道裡面是 Mesh
  const wheels: THREE.Mesh[] = [];
  const numWheelsPerSide = 5;
  const wheelSpacing = 1.0;
  const wheelRadius = 0.6;
  const wheelY = wheelRadius;

  const wheelGeometry = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.5, 16);
  const wheelMaterial = new THREE.MeshPhongMaterial({ color: 0x222222 });

  // ── 履帶路徑：像「操場跑道」的形狀，包住所有輪子 ──
  // 上下兩條直線 + 前後兩個半圓（圓心在第一個、最後一個輪子的中心）
  const firstWheelZ = -((numWheelsPerSide - 1) / 2) * wheelSpacing; // -2
  const lastWheelZ = -firstWheelZ; // 2
  const trackRadius = wheelRadius + 0.08; // 比輪子大一點，履帶板才不會插進輪子
  const trackPoints: THREE.Vector3[] = [];
  const ARC_STEPS = 12;
  // 走的方向：底部從後往前 → 前方半圓往上 → 頂部從前往後 → 後方半圓往下
  // （這個方向配合輪子 rotation.x 增加時的轉向：車子往 +z 前進時，底部履帶相對車身往 -z 跑）
  trackPoints.push(new THREE.Vector3(0, wheelY - trackRadius, lastWheelZ));
  trackPoints.push(new THREE.Vector3(0, wheelY - trackRadius, 0));
  for (let i = 0; i <= ARC_STEPS; i++) {
    // 前方半圓：從正下方（-90°）繞到正上方（+90°），往 -z 凸出
    const a = -Math.PI / 2 + (i / ARC_STEPS) * Math.PI;
    trackPoints.push(new THREE.Vector3(0, wheelY + Math.sin(a) * trackRadius, firstWheelZ - Math.cos(a) * trackRadius));
  }
  trackPoints.push(new THREE.Vector3(0, wheelY + trackRadius, 0));
  for (let i = 0; i <= ARC_STEPS; i++) {
    // 後方半圓：從正上方（+90°）繞到正下方（-90°），往 +z 凸出
    const a = Math.PI / 2 - (i / ARC_STEPS) * Math.PI;
    trackPoints.push(new THREE.Vector3(0, wheelY + Math.sin(a) * trackRadius, lastWheelZ + Math.cos(a) * trackRadius));
  }

  // 閉合的平滑曲線；centripetal：轉角處不會繞出多餘的圈
  const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, 'centripetal');
  const trackLength = trackCurve.getLength();

  // 單個履帶板：x = 寬（和輪子同寬再多一點）、y = 厚度、z = 長度
  const SEGMENT_LENGTH = 0.25;
  const SEGMENT_GAP = 0.05;
  const trackSegmentGeo = new THREE.BoxGeometry(0.6, 0.1, SEGMENT_LENGTH);
  const trackSegmentMat = new THREE.MeshPhongMaterial({ color: 0x111111 });

  // 儲存所有履帶板，動畫時沿著曲線移動
  const trackSegments: { mesh: THREE.Mesh; xOffset: number; baseU: number }[] = [];
  // 履帶板數量 = 路徑長度 ÷（板長 + 縫隙）
  const numTrackSegments = Math.floor(trackLength / (SEGMENT_LENGTH + SEGMENT_GAP));

  for (let side = -1; side <= 1; side += 2) {
    // 車身寬 4（左右各 2）、輪子寬 0.5：
    // 放在 ±2.35 → 輪子內側在 2.1，剛好露在車身外面（原本 1.8 會有大半埋進車身）
    const xOffset = side * 2.35;

    // 1. 生成車輪
    for (let i = 0; i < numWheelsPerSide; i++) {
      const wheelMesh = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheelMesh.rotation.z = Math.PI / 2;
      const z = (i - (numWheelsPerSide - 1) / 2) * wheelSpacing;
      wheelMesh.position.set(xOffset, wheelY, z);
      wheelMesh.castShadow = true;
      tank.add(wheelMesh);
      wheels.push(wheelMesh);
    }

    // 2. 沿著 trackCurve 鋪設履帶板
    for (let i = 0; i < numTrackSegments; i++) {
      const segmentMesh = new THREE.Mesh(trackSegmentGeo, trackSegmentMat);
      segmentMesh.castShadow = true;
      tank.add(segmentMesh);

      trackSegments.push({
        mesh: segmentMesh,
        xOffset: xOffset,
        baseU: i / numTrackSegments // 初始在曲線上的相對位置 (0 ~ 1)
      });
    }
  }







  // 砲塔 (Turret)
  const turretGeometry = new THREE.SphereGeometry(1.5, 8, 8);
  const turretMaterial = new THREE.MeshPhongMaterial({ color: 0x446688 });
  const turretMesh = new THREE.Mesh(turretGeometry, turretMaterial);
  turretMesh.position.y = 1.8;
  tank.add(turretMesh);

  // 砲管 (Cannon)：加在砲塔底下 → 砲塔轉動時，砲管會跟著轉
  const cannonGeometry = new THREE.CylinderGeometry(0.2, 0.2, 3);
  const cannonMaterial = new THREE.MeshPhongMaterial({ color: 0x224466 });
  const cannonMesh = new THREE.Mesh(cannonGeometry, cannonMaterial);
  cannonMesh.position.z = 1.5;
  // 圓柱預設是直立的（沿 y 軸），轉 90° 變成往前（沿 z 軸）
  cannonMesh.rotation.x = Math.PI / 2;
  turretMesh.add(cannonMesh);

  // ── 把履帶板擺到曲線上 ──
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  function placeTrack(offsetU: number) {
    for (const segment of trackSegments) {
      // u：在曲線上的位置 0 ~ 1；超過 1 就繞回 0（閉合曲線）
      const u = THREE.MathUtils.euclideanModulo(segment.baseU + offsetU, 1);
      // getPointAt / getTangentAt 用「實際長度」換算位置 → 履帶板間距均勻
      trackCurve.getPointAt(u, point);
      trackCurve.getTangentAt(u, tangent);
      segment.mesh.position.set(segment.xOffset, point.y, point.z);
      // 讓履帶板的長邊（z）對齊曲線的前進方向：繞 x 軸轉
      segment.mesh.rotation.x = -Math.atan2(tangent.y, tangent.z);
    }
  }
  placeTrack(0);

  /**
   * 開動：輪子轉、履帶跑
   * @param distance 前進的距離（公尺）
   *
   * 不打滑時：輪子轉的角度 = 距離 ÷ 半徑；履帶移動的比例 = 距離 ÷ 履帶總長
   */
  function drive(distance: number) {
    for (const wheel of wheels) wheel.rotation.x = distance / wheelRadius;
    placeTrack(distance / trackLength);
  }

  return { tank, turret: turretMesh, cannon: cannonMesh, wheels, drive };
}
