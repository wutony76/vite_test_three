// 草：幾萬根草葉，用 InstancedMesh 一次畫完（1 次 draw call）
// 風的擺動在 GPU 的 vertex shader 裡算：CPU 每幀只送「時間」和「車子位置」兩個值
//
// 做法：沿用 MeshStandardMaterial（光照、陰影、霧都照常運作），
// 用 onBeforeCompile 在它的 vertex shader 裡插入幾行「把頂點往風的方向推」的程式
import * as THREE from 'three'

const BLADE_HEIGHT = 0.55
const BLADE_WIDTH = 0.09

export type GrassOptions = {
  count: number
  radius: number
  // 不長草的區域（作品圓台、跳台…）：圓心 + 半徑
  exclude: { x: number; z: number; r: number }[]
}

export class Grass {
  readonly mesh: THREE.InstancedMesh
  private readonly uniforms = {
    uTime: { value: 0 },
    uCar: { value: new THREE.Vector3(999, 0, 999) },
  }

  constructor({ count, radius, exclude }: GrassOptions) {
    this.mesh = new THREE.InstancedMesh(createBladeGeometry(), this.createMaterial(), count)

    // ── 撒草：隨機位置、角度、高度、顏色 ──
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    // 固定亂數：每次重新整理，草的位置都一樣
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    let placed = 0
    let attempts = 0
    while (placed < count && attempts < count * 6) {
      attempts++
      // 在圓內均勻取點：半徑要開根號，否則草會擠在圓心
      const r = Math.sqrt(random()) * radius
      const a = random() * Math.PI * 2
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (exclude.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) continue
      // 疏密變化：用幾個 sin 疊出「一叢一叢」的分佈，密度低的地方跳過一部分
      const density = 0.5 + 0.3 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.2 * Math.sin((x + z) * 0.53)
      if (random() > density + 0.35) continue

      dummy.position.set(x, 0, z)
      dummy.rotation.set(0, random() * Math.PI * 2, 0)
      // 高矮不一：疏的地方比較矮
      const height = 0.6 + random() * 0.7 * (0.5 + density)
      dummy.scale.set(1, height, 1)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(placed, dummy.matrix)
      // 每根草顏色略有差異（偏黃、偏深）
      color.setHSL(0.24 + random() * 0.06, 0.55 + random() * 0.2, 0.42 + random() * 0.14)
      this.mesh.setColorAt(placed, color)
      placed++
    }
    // 實際放了幾根（被排除的區域會少一些）
    this.mesh.count = placed
    this.mesh.receiveShadow = true
    // 草不投射陰影：幾萬根草的陰影很貴，而且看起來是一團雜訊
    this.mesh.castShadow = false
  }

  private createMaterial() {
    const material = new THREE.MeshStandardMaterial({
      // vertexColors：用頂點顏色做「根部深、尖端亮」的漸層；再乘上每根草的 instanceColor
      vertexColors: true,
      roughness: 0.85,
      side: THREE.DoubleSide,
    })

    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.uniforms.uTime
      shader.uniforms.uCar = this.uniforms.uCar
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          /* glsl */ `
          #include <common>
          uniform float uTime;
          uniform vec3 uCar;
          `,
        )
        // 取代「頂點 → 螢幕位置」這一步：先套用 instance 的位置，再加上風的位移
        .replace(
          '#include <project_vertex>',
          /* glsl */ `
          vec4 mvPosition = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
          #endif

          // 這根草的根部位置（世界座標）
          vec2 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
          // 彎曲程度：根部 0、尖端 1，平方 → 越往上彎得越多（像真的草莖）
          float bend = uv.y * uv.y;

          // ① 陣風：沿著風向前進的大波浪，波峰經過的地方草被壓低
          vec2 windDir = normalize(vec2(1.0, 0.45));
          float wave = sin(dot(root, windDir) * 0.22 - uTime * 1.8);
          float gust = smoothstep(-0.2, 1.0, wave);
          // ② 細微抖動：每根草用自己的位置當相位，不會整齊劃一
          float flutter = sin(uTime * 5.0 + root.x * 1.7 + root.y * 1.3) * 0.08;
          vec2 offset = windDir * (0.08 + gust * 0.38 + flutter);

          // ③ 車子：2.4 公尺內的草被往外推倒
          vec2 away = root - uCar.xz;
          float push = 1.0 - smoothstep(0.6, 2.4, length(away));
          offset += normalize(away + 0.0001) * push * 0.55;

          mvPosition.xz += offset * bend;
          // 往旁邊倒的同時高度要降低，草才不會被「拉長」
          mvPosition.y -= length(offset) * bend * 0.45;

          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;
          `,
        )
      // 雙面材質時，Three.js 會把「背面」的法線乘上 -1（翻成朝下）→ 從背面看的草葉是全黑的
      // 草葉的法線本來就統一朝上，所以再乘一次 faceDirection 把翻轉抵消（-1 × -1 = 1）
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        /* glsl */ `
        #include <normal_fragment_begin>
        normal *= faceDirection;
        `,
      )
    }
    return material
  }

  update(time: number, carPosition: THREE.Vector3) {
    this.uniforms.uTime.value = time
    this.uniforms.uCar.value.copy(carPosition)
  }
}

/** 一根草葉：上窄下寬的細長平面，分 4 段才能彎曲 */
function createBladeGeometry() {
  const geometry = new THREE.PlaneGeometry(BLADE_WIDTH, BLADE_HEIGHT, 1, 4)
  // 平移讓根部在 y = 0
  geometry.translate(0, BLADE_HEIGHT / 2, 0)
  const position = geometry.attributes.position
  const uv = geometry.attributes.uv
  const colors = new Float32Array(position.count * 3)
  const base = new THREE.Color(0x3f7f35)
  const tip = new THREE.Color(0xd4ec8a)
  const c = new THREE.Color()
  for (let i = 0; i < position.count; i++) {
    const t = uv.getY(i) // 0 根部 ~ 1 尖端
    // 越往上越窄，尖端收成一點
    position.setX(i, position.getX(i) * (1 - t * 0.92))
    c.copy(base).lerp(tip, t)
    colors.set([c.r, c.g, c.b], i * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // 法線全部朝上：草葉很薄，用「朝上」的法線打光，亮度會和地面一致，
  // 不會因為草葉朝向不同而一片亮一片暗
  const normal = geometry.attributes.normal
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0)
  return geometry
}
