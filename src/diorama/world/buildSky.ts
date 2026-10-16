// 天空：漸層天空球、星星、月亮、遠山
import * as THREE from 'three'

export function buildSky(softDot: THREE.Texture) {
  const sky = new THREE.Group()

  // ── 漸層天空：一顆從內側看的大球（BackSide），用自訂 Shader 依高度混合兩種顏色 ──
  const skyUniforms = {
    topColor: { value: new THREE.Color() },
    bottomColor: { value: new THREE.Color() },
  }
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(300, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying float vHeight;
        void main() {
          // normalize 後的 y：地平線 0、正上方 1
          vHeight = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying float vHeight;
        void main() {
          float t = smoothstep(-0.02, 0.55, vHeight);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
    }),
  )
  // 天空要畫在最後面，不受霧影響
  dome.renderOrder = -1

  // ── 星星：Points 一次畫幾百顆點，只要 1 次 draw call ──
  const STARS = 700
  const starPositions = new Float32Array(STARS * 3)
  for (let i = 0; i < STARS; i++) {
    // 在上半球面隨機取點（y 至少 0.12，避免星星掉到山後面）
    const y = 0.12 + Math.random() * 0.88
    const angle = Math.random() * Math.PI * 2
    const radius = Math.sqrt(1 - y * y)
    starPositions.set([Math.cos(angle) * radius * 250, y * 250, Math.sin(angle) * radius * 250], i * 3)
  }
  const starGeometry = new THREE.BufferGeometry()
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
  const starMaterial = new THREE.PointsMaterial({
    size: 1.8,
    map: softDot,
    transparent: true,
    depthWrite: false,
    fog: false,
    color: 0xdfe8ff,
  })
  const stars = new THREE.Points(starGeometry, starMaterial)

  // ── 月亮：Sprite 永遠面向攝影機，適合光暈這種圓形的東西 ──
  const moonMaterial = new THREE.SpriteMaterial({ map: softDot, color: 0xe6ecff, fog: false, transparent: true, depthWrite: false })
  const moon = new THREE.Sprite(moonMaterial)
  moon.scale.setScalar(30)
  moon.position.set(-110, 120, -150)

  // ── 遠山：兩圈鋸齒狀的環形帶，越遠越淡（受霧影響）──
  const mountainNear = mountainRing(110, 9, 1.3)
  const mountainFar = mountainRing(150, 16, 4.1)

  sky.add(dome, stars, moon, mountainFar.mesh, mountainNear.mesh)

  return {
    sky,
    skyUniforms,
    starMaterial,
    moonMaterial,
    mountains: [mountainNear.material, mountainFar.material],
  }
}

/** 一圈山的剪影：沿圓周取點，每點高度由幾個 sin 疊加，做出不規則的山稜線 */
function mountainRing(radius: number, peak: number, seed: number) {
  const SEGMENTS = 160
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2
    const height = peak * (0.55 + 0.25 * Math.sin(a * 3 + seed) + 0.15 * Math.sin(a * 7 + seed * 2) + 0.05 * Math.sin(a * 19))
    const x = Math.cos(a) * radius
    const z = Math.sin(a) * radius
    positions.push(x, -1, z, x, height, z)
    if (i < SEGMENTS) {
      const b = i * 2
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  return { mesh: new THREE.Mesh(geometry, material), material }
}
