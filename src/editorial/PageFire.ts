import * as THREE from 'three'
import { BurnMask, burnFragment, burnVertex, createNoiseTexture } from './burn'
import { EyeFire } from './eyeFire'

/** 頁面座標（CSS px，含捲動），y 向下，與 clientX/Y + scroll 一致 */
export type PagePoint = { x: number; y: number }

/**
 * 火焰半徑（單位 unit = 照片在螢幕上的高度）：
 * 移動時是小火圈，燒出一條軌跡；停在同一點越久火圈越大，往外燒開。
 */
const BRUSH_MIN = 0.05
const BRUSH_GROW = 0.45
const BRUSH_TAU = 8
/** 落點移動超過這個距離（px）就算「換位置」，火圈縮回小火 */
const HOLD_TOLERANCE = 6
/** 停火時燒黑面積超過畫面這個比例 → 自燃，一路燒光整頁 */
const SPREAD_THRESHOLD = 0.1
/** 多久量一次燒黑面積（秒） */
const COVERAGE_INTERVAL = 0.5
/** 自燃時面積到這個比例就算「整頁燒光」（留一點餘裕：視窗邊角可能剩幾個像素沒燒到） */
const SPREAD_DONE = 0.97
/** 噴火時多久檢查一次眼睛有沒有被燒到（秒） */
const EYE_PROBE_INTERVAL = 0.25
/** 眼睛位置燒灼量超過這個值就算「眼睛被燒掉了」 */
const EYE_BURNED_LEVEL = 0.9
/** 下一頁 iframe 的露出範圍（clip-path）更新間隔（秒）與格子大小（CSS px） */
const CLIP_INTERVAL = 1 / 20
const CLIP_CELL = 4
/** 下一頁準備好後，洞裡的截圖淡出時間（秒） */
const LIVE_FADE = 0.3


/**
 * 全頁火焰層：一張蓋在整個頁面最上面的透明畫布（pointer-events: none）。
 * 噴火粒子與燒痕都畫在這層，所以標題、文字、照片都能被「燒掉」。
 *
 * 為什麼不在人像的 WebGL 裡燒：那張畫布只涵蓋右邊人像區，燒不到左邊的 HTML 標題。
 * 為什麼用一層 overlay 而不是真的把 DOM 挖洞：CSS mask 每幀換圖成本高；
 * 直接把燒穿處畫成不透明焦黑，視覺上就等於頁面被燒穿了，連字也一起蓋掉。
 */
export class PageFire {
  readonly domElement: HTMLCanvasElement

  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  /** 正交相機，單位 = CSS px；y 向上（世界 y = −pageY），每幀跟著捲動位置移動 */
  private readonly camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10)
  private readonly timer = new THREE.Timer()
  private readonly mask = new BurnMask()
  private readonly fire = new EyeFire()
  private readonly burnMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>

  private readonly eyes = [new THREE.Vector2(), new THREE.Vector2()]
  private unit = 800
  private getEyes: () => PagePoint[] = () => []
  private getUnit: () => number = () => 800

  /** 火焰落點：這一幀、上一幀（蓋章用線段）、停留起點與停留秒數 */
  private readonly target = new THREE.Vector2()
  private readonly lastTarget = new THREE.Vector2()
  private readonly holdAnchor = new THREE.Vector2()
  private holdTime = 0
  private readonly tmp = new THREE.Vector2()
  /** 上一幀有畫東西；變成「沒東西可畫」的那一幀要再清一次畫面 */
  private drewLastFrame = false
  private readonly noise = createNoiseTexture()
  private coverageTimer = 0
  /** 每次還原 +1：量測是非同步的，還原前送出的量測結果回來時要丟掉，不然可能在還原後馬上自燃 */
  private generation = 0
  /** 最近一次量到的燒黑面積比例（0..1），也給測試／除錯用 */
  coverage = 0
  /** 自燃已經燒光整頁 */
  spreadDone = false
  /** 每隻眼睛是否已經被燒掉（噴火時每 0.25 秒檢查；燒掉就一直記住，直到還原） */
  readonly eyeBurned = [false, false]
  private eyeProbeTimer = 0
  /** 燒穿後露出的下一頁截圖（貼圖），在燒痕 shader 裡畫進洞裡 */
  private revealTex: THREE.Texture | null = null
  /**
   * 下一頁 iframe 的露出範圍回呼：有設定時，燒的期間定期把「要露出的格子圖」交出去
   * （由外層轉成 iframe 的 clip-path）
   */
  onClip: ((data: Uint8Array, w: number, h: number, cell: number) => void) | null = null
  private clipTimer = 0
  /** 洞裡從截圖淡到透明（露出真的下一頁）的進度：0 → 1 */
  private live = 0
  private liveTarget = 0
  private readonly eyePage = [new THREE.Vector2(), new THREE.Vector2()]

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: true })
    // 卡通平塗色塊用 1 倍解析度畫就夠（Retina 上像素數少 4 倍）；硬邊另外用 fwidth 反鋸齒
    this.renderer.setPixelRatio(1)
    this.renderer.setClearColor(0x000000, 0)
    this.domElement = this.renderer.domElement
    this.domElement.className = 'page-fire'
    document.body.appendChild(this.domElement)

    // 全螢幕三角形（比兩個三角形的 quad 少一條對角線接縫），座標直接是 clip space
    const tri = new THREE.BufferGeometry()
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    this.burnMesh = new THREE.Mesh(
      tri,
      new THREE.ShaderMaterial({
        uniforms: {
          uMask: { value: null },
          uNoise: { value: this.noise },
          uSparks: { value: 0 },
          uReveal: { value: null },
          uRevealSize: { value: new THREE.Vector2(1, 1) },
          uHasReveal: { value: 0 },
          uView: { value: new THREE.Vector2(1, 1) },
          uLive: { value: 0 },
          uMaskSize: { value: this.mask.size },
          uTime: { value: 0 },
          uUnit: { value: 800 },
          uScroll: { value: new THREE.Vector2() },
          uDpr: { value: 1 },
          uViewH: { value: 1 },
        },
        vertexShader: burnVertex,
        fragmentShader: burnFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.burnMesh.frustumCulled = false
    this.burnMesh.renderOrder = 0
    this.scene.add(this.burnMesh, this.fire.object)

    this.timer.connect(document)
    this.resize()
    window.addEventListener('resize', this.resize)
    this.renderer.setAnimationLoop(this.tick)
  }

  /** 設定燒穿後要露出的截圖；不設定（或還沒載入完）則燒穿處是焦黑空洞 */
  setRevealImage(src: string) {
    new THREE.TextureLoader().load(src, (tex) => {
      // 這個 shader 不做色彩空間轉換，直接輸出貼圖原本的 sRGB 數值；
      // 標成 sRGB 的話取樣時會被轉成線性值，畫出來偏暗
      tex.colorSpace = THREE.NoColorSpace
      tex.minFilter = THREE.LinearFilter
      tex.generateMipmaps = false
      this.revealTex = tex
      const u = this.burnMesh.material.uniforms
      u.uReveal.value = tex
      u.uRevealSize.value.set(tex.image.width, tex.image.height)
      u.uHasReveal.value = 1
    })
  }

  /** 下一頁準備好了：洞裡的截圖淡出，改成透明露出底下真的 iframe */
  showLive() {
    this.liveTarget = 1
  }

  /** 開始自燃時呼叫一次（例如偷偷載入下一頁） */
  onSpreadStart: (() => void) | null = null
  /** 自燃把整頁燒光時呼叫一次（例如跳轉到下一頁） */
  onSpreadDone: (() => void) | null = null

  /** 由人像提供：兩眼瞳孔目前的頁面座標、照片高度（px） */
  bindPortrait(getEyes: () => PagePoint[], getUnit: () => number) {
    this.getEyes = getEyes
    this.getUnit = getUnit
  }

  start(target: PagePoint) {
    this.target.set(target.x, target.y)
    this.lastTarget.copy(this.target)
    this.holdAnchor.copy(this.target)
    this.holdTime = 0
    this.fire.start(this.tmp.set(target.x, -target.y))
  }

  /** 噴火中移動落點：火柱跟著滑鼠，沿路燒出軌跡 */
  moveTo(target: PagePoint) {
    this.target.set(target.x, target.y)
    this.fire.setTarget(this.tmp.set(target.x, -target.y))
  }

  stop() {
    this.fire.stop()
  }

  /** 放開後馬上量一次面積做自燃判定（不用等下一個 0.5 秒週期） */
  evaluateSpreadSoon() {
    this.coverageTimer = COVERAGE_INTERVAL
  }

  get hasBeam() {
    return this.fire.hasBeam
  }

  /** 任一隻眼睛已經被燒掉 */
  get eyesBurned() {
    return this.eyeBurned[0] || this.eyeBurned[1]
  }

  clear() {
    this.mask.clear()
    this.coverage = 0
    this.live = 0
    this.liveTarget = 0
    this.onClip = null
    this.spreadDone = false
    this.eyeBurned[0] = false
    this.eyeBurned[1] = false
    this.fire.resetEyes()
    this.generation++
  }

  /** 自燃擴散中 */
  get isSpreading() {
    return this.mask.spreading
  }

  get isFiring() {
    return this.fire.isActive
  }

  private readonly resize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.renderer.setSize(w, h, false)
    const u = this.burnMesh.material.uniforms
    u.uDpr.value = this.renderer.getPixelRatio()
    u.uViewH.value = h
    this.fire.setPxPerWorld(this.renderer.getPixelRatio())
  }

  private brushRadius() {
    return this.unit * (BRUSH_MIN + BRUSH_GROW * (1 - Math.exp(-this.holdTime / BRUSH_TAU)))
  }

  private readonly tick = (t: number) => {
    this.timer.update(t)
    const dt = Math.min(this.timer.getDelta(), 0.05)
    const time = this.timer.getElapsed()

    this.unit = this.getUnit() || this.unit
    const eyes = this.getEyes()
    eyes.forEach((p, i) => {
      this.eyes[i]?.set(p.x, -p.y)
      this.eyePage[i]?.set(p.x, p.y)
    })

    // 停留計時：落點離開停留起點太遠就重新計（火圈縮回小火）
    const firing = this.fire.isActive
    if (firing) {
      if (this.target.distanceTo(this.holdAnchor) > HOLD_TOLERANCE) {
        this.holdAnchor.copy(this.target)
        this.holdTime = 0
      } else {
        this.holdTime += dt
      }
    }
    const radius = this.brushRadius()

    // 遮罩涵蓋整個文件（含捲動範圍），燒痕才能存在頁面座標上
    const doc = document.documentElement
    this.mask.ensureSize(this.renderer, Math.max(doc.scrollWidth, window.innerWidth), Math.max(doc.scrollHeight, window.innerHeight))
    this.mask.update(this.renderer, dt, firing, this.lastTarget, this.target, radius)
    this.lastTarget.copy(this.target)
    this.checkSpread(dt, firing)
    this.checkEyes(dt, firing, eyes.length === 2)
    this.updateClip(dt, firing)
    if (this.live < this.liveTarget) this.live = Math.min(this.liveTarget, this.live + dt / LIVE_FADE)

    // 粒子在火圈邊緣冒火（火圈小時就在中心冒）
    this.fire.update(dt, time, this.eyes.slice(0, eyes.length), firing ? radius * 0.7 : 0, this.unit)

    // 什麼都沒有時不畫（全螢幕 shader 每個像素都要跑雜訊，閒置時省下來）
    const hasWork = !this.mask.isEmpty || this.fire.hasLive || firing
    if (!hasWork && !this.drewLastFrame) return
    this.drewLastFrame = hasWork

    // 相機跟著捲動：燒痕存頁面座標，捲動時才會黏在內容上
    const sx = window.scrollX
    const sy = window.scrollY
    this.camera.left = sx
    this.camera.right = sx + window.innerWidth
    this.camera.top = -sy
    this.camera.bottom = -sy - window.innerHeight
    this.camera.updateProjectionMatrix()
    const u = this.burnMesh.material.uniforms
    u.uMask.value = this.mask.texture
    u.uTime.value = time
    u.uUnit.value = this.unit
    u.uScroll.value.set(sx, sy)
    u.uSparks.value = this.mask.spreading ? 1 : 0
    u.uView.value.set(window.innerWidth, window.innerHeight)
    u.uLive.value = this.live
    // 遮罩是空的時候不要畫燒痕層（避免讀到還沒清的貼圖）
    this.burnMesh.visible = !this.mask.isEmpty

    this.renderer.render(this.scene, this.camera)
  }

  /**
   * 每 0.5 秒量一次燒黑面積；停火時超過畫面 10% → 開始自燃擴散（不可逆，直到雙擊還原）。
   * 噴火中也照量（讓 coverage 保持最新），但只在停火後才觸發。
   */
  private checkSpread(dt: number, firing: boolean) {
    // 自燃中也繼續量：用來判斷「整頁燒光」（之後雙擊才能還原）
    if (this.spreadDone || this.mask.isEmpty) return
    this.coverageTimer += dt
    if (this.coverageTimer < COVERAGE_INTERVAL) return
    this.coverageTimer = 0
    const scroll = new THREE.Vector2(window.scrollX, window.scrollY)
    const view = new THREE.Vector2(window.innerWidth, window.innerHeight)
    const gen = this.generation
    void this.mask.measureCoverage(this.renderer, scroll, view).then((value) => {
      if (value === null || gen !== this.generation) return
      this.coverage = value
      if (this.mask.spreading) {
        if (value >= SPREAD_DONE && !this.spreadDone) {
          this.spreadDone = true
          this.onSpreadDone?.()
        }
      } else if (!firing && !this.fire.isActive && value > SPREAD_THRESHOLD) {
        this.mask.spreading = true
        this.onSpreadStart?.()
      }
    })
  }

  /** 燒的期間（發射中、自燃中）定期產生露出格子圖，交給 onClip 轉成 iframe 的 clip-path */
  private updateClip(dt: number, firing: boolean) {
    if (!this.onClip || this.mask.isEmpty) return
    if (!firing && !(this.mask.spreading && !this.spreadDone)) return
    this.clipTimer += dt
    if (this.clipTimer < CLIP_INTERVAL) return
    this.clipTimer = 0
    const gen = this.generation
    const scroll = new THREE.Vector2(window.scrollX, window.scrollY)
    const view = new THREE.Vector2(window.innerWidth, window.innerHeight)
    void this.mask.renderClip(this.renderer, this.noise, scroll, view, this.unit, CLIP_CELL).then((res) => {
      if (!res || gen !== this.generation || !this.onClip) return
      this.onClip(res.data, res.w, res.h, CLIP_CELL)
    })
  }

  /**
   * 噴火中定期讀兩眼位置的燒灼量；哪隻眼睛被燒掉，就自動關掉那隻的雷射（燒掉的眼睛不能再發射）。
   * 一旦燒到就記住，直到還原。
   */
  private checkEyes(dt: number, firing: boolean, hasEyes: boolean) {
    if (!firing || !hasEyes || (this.eyeBurned[0] && this.eyeBurned[1])) return
    this.eyeProbeTimer += dt
    if (this.eyeProbeTimer < EYE_PROBE_INTERVAL) return
    this.eyeProbeTimer = 0
    const gen = this.generation
    void this.mask.probe(this.renderer, this.eyePage[0], this.eyePage[1]).then((v) => {
      if (!v || gen !== this.generation) return
      v.forEach((burn, i) => {
        if (burn < EYE_BURNED_LEVEL || this.eyeBurned[i]) return
        this.eyeBurned[i] = true
        this.fire.disableEye(i)
      })
    })
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.noise.dispose()
    window.removeEventListener('resize', this.resize)
    this.burnMesh.geometry.dispose()
    this.burnMesh.material.dispose()
    this.mask.dispose()
    this.revealTex?.dispose()
    this.fire.dispose()
    this.renderer.dispose()
    this.domElement.remove()
  }
}
