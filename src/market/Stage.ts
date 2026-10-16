// 舞台：渲染器、後製（Bloom 光暈）、攝影機、操作
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
// RectAreaLight（面光源）需要額外的查表資料，使用前要初始化一次
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'

type FrameCallback = (dt: number, elapsed: number) => void

export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
  readonly controls: OrbitControls
  readonly composer: EffectComposer
  readonly bloom: UnrealBloomPass
  readonly home = { position: new THREE.Vector3(0, 3.6, 12.5), target: new THREE.Vector3(0, 2.2, -4) }

  private readonly container: HTMLElement
  private readonly timer = new THREE.Timer()
  private readonly callbacks: FrameCallback[] = []
  private readonly resizeObserver: ResizeObserver

  constructor(container: HTMLElement, pixelRatio: number) {
    this.container = container
    RectAreaLightUniformsLib.init()

    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    // 曝光調低一點：燈很多的場景容易整片過亮，暗部保留下來，霓虹的顏色才會飽和
    this.renderer.toneMappingExposure = 0.78
    container.appendChild(this.renderer.domElement)

    this.camera.position.copy(this.home.position)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.copy(this.home.target)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.minDistance = 5
    this.controls.maxDistance = 22
    // 只能在街道這一側看：左右各約 40°、不能鑽到地面以下
    this.controls.minAzimuthAngle = -0.7
    this.controls.maxAzimuthAngle = 0.7
    this.controls.minPolarAngle = 1.0
    this.controls.maxPolarAngle = 1.6

    // 後製：場景 → Bloom（亮度 > 1 的地方暈開）→ 色調映射與 sRGB 輸出
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 1)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())

    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)
    this.onResize()

    this.timer.connect(document)
    this.renderer.setAnimationLoop(this.tick)
  }

  onFrame(callback: FrameCallback) {
    this.callbacks.push(callback)
  }

  get size() {
    return { width: this.container.clientWidth, height: this.container.clientHeight }
  }

  async toggleFullscreen(element: HTMLElement) {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await element.requestFullscreen()
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.timer.dispose()
    this.controls.dispose()
    this.composer.dispose()
    this.bloom.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private onResize = () => {
    const { width, height } = this.size
    if (!width || !height) return
    this.camera.aspect = width / height
    // 直式手機：視角放寬，兩側攤位才看得到
    this.camera.fov = this.camera.aspect < 1 ? 62 : 42
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.composer.setSize(width, height)
  }

  private tick = (timestamp: number) => {
    this.timer.update(timestamp)
    const dt = Math.min(this.timer.getDelta(), 0.1)
    const elapsed = this.timer.getElapsed()
    this.controls.update(dt)
    for (const callback of this.callbacks) callback(dt, elapsed)
    this.composer.render(dt)
  }
}
