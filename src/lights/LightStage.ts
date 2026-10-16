// 燈光舞台：一組白色雕塑 + 五種光源，依「權重」決定每種光現在有多亮
// 權重由捲動位置決定（main.ts），這裡只負責：把權重套到光源、跟著滑鼠移動光源、畫出來
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'

export type LightKey = 'cursor' | 'rgb' | 'spot' | 'area' | 'neon'
export type Weights = Record<LightKey, number>
export const LIGHT_KEYS: LightKey[] = ['cursor', 'rgb', 'spot', 'area', 'neon']

// 每種光可切換的顏色（點一下換下一組）；rgb 是三盞一組
export const PALETTES: Record<LightKey, string[][]> = {
  cursor: [['#ffd9a8'], ['#9fd4ff'], ['#ff9ad5'], ['#b8ff9f']],
  rgb: [['#ff2a2a', '#2aff4f', '#2a6bff'], ['#00e5ff', '#ff00d4', '#ffe600'], ['#ff6b35', '#ff2e88', '#7b2cff']],
  spot: [['#ffffff'], ['#ffd28a'], ['#8ac6ff'], ['#ff7ab6']],
  // 面光源：暖白（約 3200K 鎢絲燈）、冷白（約 6500K 日光）、粉、薄荷
  area: [['#ffe2c2'], ['#e3ecff'], ['#ffb3d9'], ['#b3ffe6']],
  neon: [['#ff2e88'], ['#2ef5ff'], ['#ffcc2e'], ['#9b5cff']],
}

// 光束：從聚光燈往下的錐體，越靠近燈越亮、邊緣淡出（加法混合，疊在畫面上像空氣中的光）
const beamVertex = /* glsl */ `
  varying float vAlong;
  varying float vFacing;
  void main() {
    vAlong = uv.y; // 圓柱的 uv.y：0 = 底部（照到的地方）、1 = 頂端（燈的位置）
    vec3 normalView = normalize(normalMatrix * normal);
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    // 面向攝影機的程度：正對時 1、側邊 0 → 錐體邊緣自然淡出，不會有硬邊
    vFacing = abs(dot(normalView, normalize(-viewPosition.xyz)));
    gl_Position = projectionMatrix * viewPosition;
  }
`
const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vAlong;
  varying float vFacing;
  void main() {
    // ⚠️ pow(0.0, y) 在部分 GPU（例如 Apple Metal）會算出 NaN（無效數值）
    // 一個 NaN 像素經過 Bloom 模糊會擴散成整個畫面全黑 → 底數至少給一個極小值
    float along = max(vAlong, 0.0001);
    float alpha = pow(along, 1.4) * vFacing * vFacing * 0.22 * uIntensity;
    gl_FragColor = vec4(uColor * alpha, alpha);
    #include <colorspace_fragment>
  }
`

export class LightStage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 60)
  readonly bloom: UnrealBloomPass
  /** 展台 + 所有光源都在這個群組裡，捲動時整組左右移動 */
  readonly display = new THREE.Group()
  /** 目前各光源權重（平滑後） */
  readonly weights: Weights = { cursor: 0, rgb: 0, spot: 0, area: 0, neon: 0 }
  readonly colorIndex: Record<LightKey, number> = { cursor: 0, rgb: 0, spot: 0, area: 0, neon: 0 }

  private readonly composer: EffectComposer
  private readonly knot: THREE.Mesh
  // 光源
  private readonly cursorLight = new THREE.PointLight(0xffffff, 0, 12, 2)
  private readonly cursorBulb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>
  private readonly rgbLights: { light: THREE.PointLight; bulb: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> }[] = []
  private readonly spot = new THREE.SpotLight(0xffffff, 0, 20, 0.42, 0.45, 1.5)
  private readonly beam: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>
  private readonly area = new THREE.RectAreaLight(0xffffff, 0, 2.2, 1)
  private readonly areaPanel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  private readonly neonRing: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>
  private readonly neonHalo: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>
  private readonly neonSpill = new THREE.PointLight(0xffffff, 0, 7, 2)
  private readonly chase: THREE.InstancedMesh
  // 滑鼠控制的目標位置（展台座標），光源每幀往目標靠近
  private readonly cursorTarget = new THREE.Vector3(0.8, 2, 1.6)
  private readonly spotTarget = new THREE.Vector3()
  private areaX = 1.2
  private rgbAngle = 0
  private rgbSpeed = 0.6
  private readonly tmp = new THREE.Color()
  // 滑鼠換算用：重複使用，不在每次 pointermove 時建立新物件
  private readonly raycaster = new THREE.Raycaster()
  private readonly frontPlane = new THREE.Plane()
  private readonly floorPlane = new THREE.Plane()
  private readonly hit = new THREE.Vector3()

  constructor(container: HTMLElement, pixelRatio: number, shadows: boolean) {
    RectAreaLightUniformsLib.init()
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = shadows
    container.appendChild(this.renderer.domElement)

    this.scene.background = new THREE.Color(0x07070b)
    this.camera.position.set(0, 2.2, 7.5)
    this.camera.lookAt(0, 1.2, 0)
    // 極弱的環境光：所有燈都暗時，雕塑仍有一點輪廓
    this.scene.add(new THREE.HemisphereLight(0x6a7090, 0x0a0a10, 0.12))
    this.scene.add(this.display)

    // ── 房間：霧面地面 + 背後弧形牆（攝影棚的無接縫背景，光打上去會形成柔和漸層）──
    const roomMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95 })
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), roomMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 10, 48, 1, true, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.95, side: THREE.BackSide }))
    wall.position.set(0, 5, 1)
    wall.receiveShadow = true
    this.display.add(floor, wall)

    // ── 雕塑：白色霧面（看清光的顏色）、鉻金屬（看清反光）、方塊（看清陰影）──
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.35 })
    const chrome = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.18 })
    const stone = new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.8 })
    const shadowed = <T extends THREE.Mesh>(mesh: T) => {
      mesh.castShadow = mesh.receiveShadow = true
      return mesh
    }
    const pedestal = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.6 })))
    pedestal.position.y = 0.25
    const sphere = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 32), white))
    sphere.position.set(-0.5, 1.0, 0.15)
    this.knot = shadowed(new THREE.Mesh(new THREE.TorusKnotGeometry(0.3, 0.1, 160, 24), chrome))
    this.knot.position.set(0.55, 1.35, 0.1)
    const cube = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.45, 0.45, 0.45, 3, 0.04), stone))
    cube.position.set(0.15, 0.73, -0.55)
    cube.rotation.y = 0.5
    const cube2 = shadowed(new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.3, 0.3, 3, 0.03), stone))
    cube2.position.set(0.2, 1.11, -0.5)
    cube2.rotation.y = 1.1
    this.display.add(pedestal, sphere, this.knot, cube, cube2)

    // ── 游標點光源：可見的小燈泡 ──
    this.cursorBulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial())
    this.display.add(this.cursorLight, this.cursorBulb)

    // ── RGB 三盞點光源 ──
    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial())
      this.rgbLights.push({ light, bulb })
      this.display.add(light, bulb)
    }

    // ── 聚光燈 + 光束 ──
    this.spot.position.set(2.2, 6, 2.8)
    this.spot.castShadow = shadows
    this.spot.shadow.mapSize.set(1024, 1024)
    this.spot.shadow.bias = -0.0004
    this.beam = new THREE.Mesh(
      // 單位高度的圓柱，每幀依燈到照射點的距離縮放、轉向
      new THREE.CylinderGeometry(0.04, 1, 1, 40, 1, true),
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { uColor: { value: new THREE.Color() }, uIntensity: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    )
    this.display.add(this.spot, this.spot.target, this.beam)

    // ── 面光源 + 看得到的發光面板 ──
    this.areaPanel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    this.display.add(this.area, this.areaPanel)

    // ── 霓虹光環：雕塑背後的圓環（核心 + 外暈）+ 一盞點光源模擬霓虹灑在周圍的光 ──
    // 放在展台後方（展台半徑 1.25），底部離地一點
    this.neonRing = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.035, 12, 120), new THREE.MeshBasicMaterial())
    this.neonHalo = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.11, 12, 120),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    for (const ring of [this.neonRing, this.neonHalo]) ring.position.set(0, 1.6, -1.55)
    this.neonSpill.position.set(0, 1.6, -1.0)
    // 地面追逐燈：展台周圍一圈燈泡
    const COUNT = 56
    this.chase = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial(), COUNT)
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < COUNT; i++) {
      const a = (i / COUNT) * Math.PI * 2
      this.chase.setMatrixAt(i, matrix.makeTranslation(Math.cos(a) * 1.75, 0.035, Math.sin(a) * 1.75))
      this.chase.setColorAt(i, new THREE.Color())
    }
    this.display.add(this.neonRing, this.neonHalo, this.neonSpill, this.chase)

    // ── 後製：Bloom ──
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.5, 1)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height
    // 直式手機：視角放寬，雕塑才放得下
    this.camera.fov = this.camera.aspect < 1 ? 58 : 40
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    this.composer.setSize(width, height)
  }

  /** 換到下一個顏色 */
  nextColor(key: LightKey) {
    this.colorIndex[key] = (this.colorIndex[key] + 1) % PALETTES[key].length
  }

  /**
   * 滑鼠位置（NDC）→ 各光源的目標
   * - 游標光、面光源：打到雕塑前方的垂直平面
   * - 聚光燈：打到地面，照向滑鼠指的地方
   */
  setPointer(ndc: THREE.Vector2) {
    const { raycaster, hit } = this
    raycaster.setFromCamera(ndc, this.camera)
    // 平面先用展台座標定義，再轉到世界座標（展台會隨捲動左右移動）
    const front = this.frontPlane.set(new THREE.Vector3(0, 0, 1), -1.6).applyMatrix4(this.display.matrixWorld)
    if (raycaster.ray.intersectPlane(front, hit)) {
      this.display.worldToLocal(hit)
      this.cursorTarget.set(THREE.MathUtils.clamp(hit.x, -3, 3), THREE.MathUtils.clamp(hit.y, 0.45, 3.4), 1.6)
      this.areaX = THREE.MathUtils.clamp(hit.x, -2, 2)
    }
    const floor = this.floorPlane.set(new THREE.Vector3(0, 1, 0), 0).applyMatrix4(this.display.matrixWorld)
    if (raycaster.ray.intersectPlane(floor, hit)) {
      this.display.worldToLocal(hit)
      // 照射點限制在展台附近，避免光束打到畫面外
      hit.y = 0
      if (hit.length() > 1.6) hit.setLength(1.6)
      this.spotTarget.copy(hit)
    }
    // RGB 轉速：滑鼠越往右轉越快，往左會反轉
    this.rgbSpeed = ndc.x * 1.6
  }

  update(dt: number, time: number, target: Weights, reducedMotion: boolean) {
    // 權重平滑追蹤：燈光在段落之間淡入淡出
    const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 3)
    for (const key of LIGHT_KEYS) this.weights[key] += (target[key] - this.weights[key]) * ease
    const w = this.weights
    const follow = 1 - Math.exp(-dt * 6)
    const color = (key: LightKey, i = 0) => this.tmp.set(PALETTES[key][this.colorIndex[key]][i])

    if (!reducedMotion) this.knot.rotation.y += dt * 0.4

    // 游標光
    this.cursorLight.position.lerp(this.cursorTarget, follow)
    this.cursorBulb.position.copy(this.cursorLight.position)
    this.cursorLight.color.copy(color('cursor'))
    this.cursorLight.intensity = 14 * w.cursor
    this.cursorBulb.material.color.copy(color('cursor')).multiplyScalar(0.05 + 4 * w.cursor)
    this.cursorBulb.visible = w.cursor > 0.02

    // RGB 繞行：三盞平均分佈在一圈上（相差 120°）
    if (!reducedMotion) this.rgbAngle += dt * (0.5 + this.rgbSpeed)
    this.rgbLights.forEach(({ light, bulb }, i) => {
      const a = this.rgbAngle + (i * Math.PI * 2) / 3
      light.position.set(Math.cos(a) * 2.1, 1.7 + Math.sin(a * 2) * 0.3, Math.sin(a) * 2.1)
      bulb.position.copy(light.position)
      light.color.copy(color('rgb', i))
      light.intensity = 10 * w.rgb
      bulb.material.color.copy(color('rgb', i)).multiplyScalar(0.05 + 4 * w.rgb)
      bulb.visible = w.rgb > 0.02
    })

    // 聚光燈：照射點跟著滑鼠；光束錐體從燈延伸到照射點
    this.spot.target.position.lerp(this.spotTarget, follow)
    this.spot.color.copy(color('spot'))
    this.spot.intensity = 55 * w.spot
    const from = this.spot.position
    const to = this.spot.target.position
    const length = from.distanceTo(to)
    this.beam.position.copy(from).add(to).multiplyScalar(0.5)
    // 圓柱預設沿 y 軸 → 轉到「照射點指向燈」的方向（寬口在照射點、窄口在燈）
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize())
    // 底部半徑 = 距離 × tan(角度)：和聚光燈的照射範圍一致
    const radius = length * Math.tan(this.spot.angle) * 0.9
    this.beam.scale.set(radius, length, radius)
    this.beam.material.uniforms.uColor.value.copy(color('spot'))
    this.beam.material.uniforms.uIntensity.value = w.spot
    this.beam.visible = w.spot > 0.02

    // 面光源：左右跟著滑鼠，永遠朝向雕塑
    // 放在雕塑右上前方，離鏡頭遠一點，面板才不會塞滿畫面
    const areaPosition = new THREE.Vector3(this.areaX, 2.75, 1.5)
    this.area.position.lerp(areaPosition, follow)
    this.area.lookAt(this.display.localToWorld(new THREE.Vector3(0, 1, 0)))
    this.areaPanel.position.copy(this.area.position)
    this.areaPanel.quaternion.copy(this.area.quaternion)
    this.area.color.copy(color('area'))
    this.area.intensity = 14 * w.area
    this.areaPanel.material.color.copy(color('area')).multiplyScalar(0.02 + 0.9 * w.area)
    this.areaPanel.visible = w.area > 0.02

    // 霓虹：核心亮度 > 1 → Bloom；外暈 + 點光源讓牆面與雕塑染上霓虹色
    this.neonRing.material.color.copy(color('neon')).multiplyScalar(0.015 + 3.4 * w.neon)
    this.neonHalo.material.color.copy(color('neon'))
    this.neonHalo.material.opacity = 0.2 * w.neon
    this.neonSpill.color.copy(color('neon'))
    this.neonSpill.intensity = 9 * w.neon
    // 追逐燈：每 4 顆亮 1 顆，依序往前跑
    const step = reducedMotion ? 0 : Math.floor(time * 12)
    for (let i = 0; i < this.chase.count; i++) {
      const on = (i + step) % 4 === 0 ? 1 : 0.1
      this.chase.setColorAt(i, color('neon').multiplyScalar(0.01 + on * 3 * w.neon))
    }
    this.chase.instanceColor!.needsUpdate = true

    this.composer.render(dt)
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      mesh.geometry?.dispose()
      for (const material of [mesh.material].flat()) (material as THREE.Material | undefined)?.dispose()
    })
    this.composer.dispose()
    this.renderer.dispose()
  }
}
