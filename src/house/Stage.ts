// 舞台：渲染器、後製、攝影機、操作、飛行動畫
// 跟場景內容無關，World 負責「有什麼」，Stage 負責「怎麼看、怎麼畫」
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
// 後製（Post-processing）：先把場景畫到一張「暫存圖」，再對整張圖套效果，最後才顯示
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

type Pose = { position: THREE.Vector3; target: THREE.Vector3 }
type FrameCallback = (dt: number, elapsed: number) => void

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export class Stage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(32, 1, 0.5, 800)
  readonly controls: OrbitControls
  readonly composer: EffectComposer
  /** 滑鼠指向物品時的外框 */
  readonly outline: OutlinePass
  /** 發光物體的光暈 */
  readonly bloom: UnrealBloomPass
  /** 預設視角（右前上方的等角視角，像在看桌上的微縮模型） */
  readonly home: Pose = { position: new THREE.Vector3(22, 15, 24), target: new THREE.Vector3(0, 2.2, 0) }

  private readonly container: HTMLElement
  private readonly timer = new THREE.Timer()
  private readonly resizeObserver: ResizeObserver
  private readonly callbacks: FrameCallback[] = []
  private tween: { from: Pose; to: Pose; elapsed: number; duration: number } | null = null

  constructor(container: HTMLElement) {
    this.container = container

    // 後製會自己做反鋸齒（下面的 samples），renderer 不必再開 antialias
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    // 後製每多一個效果就多畫一次整個畫面 → 解析度上限壓在 1.5 倍，手機才跑得動
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    // ACES：電影感的色調映射，暗部有層次、亮部不會死白
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    // 陰影貼圖不要每幀自動重畫（等於每幀從光源角度多畫一次整個場景）
    // 改成需要時設定 shadowMap.needsUpdate = true（見 requestShadowUpdate）
    this.renderer.shadowMap.autoUpdate = false
    container.appendChild(this.renderer.domElement)

    this.camera.position.copy(this.home.position)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.copy(this.home.target)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.07
    this.controls.enablePan = false
    this.controls.minDistance = 6
    this.controls.maxDistance = 60
    // 限制俯仰：不能鑽到地底，也不能從正上方往下看
    this.controls.minPolarAngle = 0.35
    this.controls.maxPolarAngle = 1.38
    this.controls.addEventListener('start', () => this.cancelTween())

    // ── 後製流程：畫場景 → 光暈 → 外框 → 色調映射與色彩空間轉換 ──
    // 外框要排在光暈之後：否則白色外框會被當成強光，整個物體暈成一團白
    // HalfFloat：暫存圖可以存「比 1 還亮」的顏色，Bloom 才知道哪裡要發光
    // samples: 4 → MSAA 反鋸齒
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    // threshold 1：只有亮度超過 1 的地方（霓虹、燈泡、亮窗）才會暈開
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.8, 0.55, 1)
    this.composer.addPass(this.bloom)

    this.outline = new OutlinePass(new THREE.Vector2(1, 1), this.scene, this.camera)
    this.outline.edgeStrength = 2.5
    this.outline.edgeThickness = 1
    this.outline.edgeGlow = 0
    this.outline.visibleEdgeColor.set(0xfff4e0)
    this.outline.hiddenEdgeColor.set(0x6f6f80)
    this.composer.addPass(this.outline)

    // OutputPass：套用 renderer 的 toneMapping 與 sRGB 輸出（使用後製時必須放最後）
    this.composer.addPass(new OutputPass())

    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)
    this.onResize()

    this.timer.connect(document)
    this.renderer.setAnimationLoop(this.tick)
  }

  /** 註冊每幀要執行的更新（World 動畫、標籤位置…） */
  onFrame(callback: FrameCallback) {
    this.callbacks.push(callback)
  }

  /** 平滑飛到指定視角 */
  flyTo(to: Pose, duration = 1.1) {
    this.tween = {
      from: { position: this.camera.position.clone(), target: this.controls.target.clone() },
      to: { position: to.position.clone(), target: to.target.clone() },
      elapsed: 0,
      duration,
    }
    // 飛行期間關閉阻尼：避免殘留的拖曳慣性讓相機停在錯的位置
    this.controls.enableDamping = false
  }

  /**
   * 計算「看著某些物體」的視角：保持目前觀看方向，距離依物體大小調整
   */
  poseFor(objects: THREE.Object3D[]): Pose {
    const box = new THREE.Box3()
    for (const object of objects) box.expandByObject(object)
    const sphere = box.getBoundingSphere(new THREE.Sphere())
    const direction = this.camera.position.clone().sub(this.controls.target).normalize()
    // 至少要有一點俯角，避免貼著地面看
    direction.y = Math.max(direction.y, 0.32)
    direction.normalize()

    // 取景距離：讓物體塞得進「垂直、水平視角中比較窄的那個」
    // 手機直式螢幕水平視角很窄，只看垂直視角的話物體左右會被切掉
    const aspect = this.camera.aspect
    const vFov = THREE.MathUtils.degToRad(this.camera.fov)
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect)
    const fitFov = Math.min(vFov, hFov)
    const distance = THREE.MathUtils.clamp((sphere.radius / Math.sin(fitFov / 2)) * 1.5 + 2, 7, 32)

    const target = sphere.center.clone()
    // 直式螢幕：介紹卡蓋住下半部 → 視線往下移，物體就會出現在畫面上半部
    if (aspect < 1) target.y -= distance * 0.14
    return { target, position: sphere.center.clone().addScaledVector(direction, distance) }
  }

  /** 下一幀重畫陰影貼圖 */
  requestShadowUpdate() {
    this.renderer.shadowMap.needsUpdate = true
  }

  goHome() {
    this.flyTo(this.home)
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
    this.outline.dispose()
    this.bloom.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private cancelTween() {
    if (!this.tween) return
    this.tween = null
    this.controls.enableDamping = true
  }

  private onResize = () => {
    const { clientWidth: width, clientHeight: height } = this.container
    if (width === 0 || height === 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    // 後製的暫存圖也要跟著改尺寸（會自動乘上 pixelRatio）
    this.composer.setSize(width, height)
  }

  private tick = (timestamp: number) => {
    this.timer.update(timestamp)
    // 切回分頁的第一幀 delta 可能很大，上限 0.1 秒避免動畫跳太多
    const dt = Math.min(this.timer.getDelta(), 0.1)
    const elapsed = this.timer.getElapsed()

    if (this.tween) {
      const tween = this.tween
      tween.elapsed += dt
      const t = easeInOutCubic(Math.min(tween.elapsed / tween.duration, 1))
      this.camera.position.lerpVectors(tween.from.position, tween.to.position, t)
      this.controls.target.lerpVectors(tween.from.target, tween.to.target, t)
      if (t === 1) this.cancelTween()
    }
    this.controls.update(dt)

    for (const callback of this.callbacks) callback(dt, elapsed)
    // 用 composer.render 取代 renderer.render，後製效果才會生效
    this.composer.render(dt)
  }
}
