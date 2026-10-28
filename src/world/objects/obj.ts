import * as THREE from 'three';

export function createObjs() {
  const all = new THREE.Object3D();

  const geometry = new THREE.SphereGeometry(1, 32, 32);
  const material = new THREE.MeshPhongMaterial({
    // 光的顏色會跟材質顏色「相乘」：純綠 0x00ff00 的紅、藍都是 0，
    // 打黃光、紫光上去都只剩綠色（或全黑），所以這裡刻意混一點紅、藍，
    // 讓 main.ts 的黃色主光、紫色補光都有通道可以反射出來
    color: 0x66ff99,
    // 光澤度：數值越大高光點越小越亮（像塑膠、瓷器），預設 30 偏霧面
    shininess: 80,
  });
  const meshBall = new THREE.Mesh(geometry, material);
  all.add(meshBall);

  return { all };
}