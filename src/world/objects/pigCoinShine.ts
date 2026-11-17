import * as THREE from 'three';

/**
 * 小豬背上的金幣「閃閃發光」：
 *   1. 金幣本身：明亮金黃色＋金屬光澤＋金黃色自發光，亮度像呼吸一樣起伏
 *   2. 背後一圈淡淡的金色光暈（加法混合的 Sprite）
 *   3. 金幣周圍幾顆四角星，輪流一閃一閃（每顆的相位、週期都不同，才不會整齊得像機器）
 *
 * 光暈和星星 toneMapped = false：畫面風格統一（styleGrade）不會幫它們調色，也不會被色調映射壓暗，
 * 才看得出「亮晶晶」。
 */

const STAR_COUNT = 4;

/** 四角星貼圖：中心最亮、十字尖角漸淡（用 canvas 畫一次，所有星星共用） */
function makeStarTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = size / 2;
  // 十字光芒：兩條細長的漸層菱形
  for (const [w, h] of [[size * 0.09, size * 0.5], [size * 0.5, size * 0.09]]) {
    const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, 'rgba(255,255,240,1)');
    grad.addColorStop(0.35, 'rgba(255,230,140,0.8)');
    grad.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(c, c - h);
    ctx.lineTo(c + w, c);
    ctx.lineTo(c, c + h);
    ctx.lineTo(c - w, c);
    ctx.closePath();
    ctx.fill();
  }
  // 中心一顆小亮點
  const core = ctx.createRadialGradient(c, c, 0, c, c, size * 0.16);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,240,180,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 柔和的圓形光暈 */
function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,220,110,0.9)');
  grad.addColorStop(0.45, 'rgba(255,190,60,0.35)');
  grad.addColorStop(1, 'rgba(255,170,40,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createPigCoinShine(model: THREE.Object3D) {
  let coin: THREE.Mesh | null = null;
  model.traverse((child) => {
    if (!coin && (child as THREE.Mesh).isMesh && child.name.endsWith('top_coin')) coin = child as THREE.Mesh;
  });
  const coinMesh = coin as THREE.Mesh | null;
  if (!coinMesh) return null;

  // 1. 金幣材質：複製一份，不影響共用同一張 atlas 材質的身體
  const material = (coinMesh.material as THREE.MeshStandardMaterial).clone();
  // 不用 atlas 貼圖的金色（#F4B731 在暖色燈光下偏橘）：直接給明亮的金黃色，發光也是金黃色
  material.map = null;
  material.color.set('#ffe36b');
  material.metalness = 0.55;
  material.roughness = 0.22;
  material.emissive.set('#ffcc33');
  material.emissiveMap = null;
  material.envMapIntensity = 1.4;
  coinMesh.material = material;

  // 金幣在自己局部座標的中心與大小（光暈、星星都繞著它擺）
  coinMesh.geometry.computeBoundingBox();
  const box = coinMesh.geometry.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) / 2;

  const sparkle = new THREE.Group();
  sparkle.name = 'pig_coin_sparkle';
  sparkle.position.copy(center);
  coinMesh.add(sparkle);

  // 2. 光暈
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeGlowTexture(),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    }),
  );
  glow.scale.setScalar(radius * 4.2);
  sparkle.add(glow);

  // 3. 星星：放在金幣邊緣外一點，四個方向各一顆
  const starTexture = makeStarTexture();
  const stars = Array.from({ length: STAR_COUNT }, (_, i) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: starTexture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    // 金幣立著、正面朝左右（模型的 X），所以星星排在 Y（上下）和 Z（前後）的平面上
    const angle = (i / STAR_COUNT) * Math.PI * 2 + 0.6;
    sprite.position.set(0, Math.sin(angle) * radius * 1.25, Math.cos(angle) * radius * 1.25);
    sparkle.add(sprite);
    return { sprite, phase: i * 1.7, speed: 2.2 + i * 0.55, baseSize: radius * (1.4 + (i % 2) * 0.5) };
  });

  let time = 0;

  function update(deltaTime: number) {
    time += deltaTime;
    // 金幣自發光像呼吸：0.25～0.65
    material.emissiveIntensity = 0.45 + 0.2 * Math.sin(time * 3.1);
    glow.material.opacity = 0.55 + 0.25 * Math.sin(time * 3.1);
    for (const star of stars) {
      // max(0, sin)^3：大部分時間是暗的，偶爾「叮」一下亮起來，比一直亮著更像閃光
      const t = Math.max(0, Math.sin(time * star.speed + star.phase));
      const flash = t * t * t;
      star.sprite.material.opacity = flash;
      star.sprite.scale.setScalar(star.baseSize * (0.4 + 0.8 * flash));
      star.sprite.material.rotation = time * 0.8 + star.phase;
    }
  }

  return { update };
}
