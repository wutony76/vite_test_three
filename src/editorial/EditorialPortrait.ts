import * as THREE from 'three'
import { auraFragment, baseFragment, eyeFragment, portraitVertex } from './shaders'
import type { EyeManifest, PortraitLookLayout, PortraitManifest } from './types'

const loader = new THREE.TextureLoader()

/** 寫輪眼圖案半徑（原圖像素）：虹膜半徑約 21px，略小一點讓外圈保留原本虹膜的邊 */
const SHARINGAN_RADIUS_PX = 20
/** 勾玉轉速（弧度／秒）：平常慢轉，蓄力滿時加速，發射中再快一點 */
const SPIN_BASE = 1.2
const SPIN_BOOST = 5
/** 左右嘴角（原圖像素）：壞笑時從這兩點往上拉 */
const MOUTH_CORNER_L = new THREE.Vector2(192, 644)
const MOUTH_CORNER_R = new THREE.Vector2(340, 640)
/** 嘴角上揚／回復的時間常數（秒） */
const SMIRK_TAU = 0.12
/** 眉頭、眉尾（原圖像素）：發動時眉頭往下壓、眉尾往上挑 */
const BROW_IN_L = new THREE.Vector2(205, 350)
const BROW_IN_R = new THREE.Vector2(305, 350)
const BROW_OUT_L = new THREE.Vector2(88, 345)
const BROW_OUT_R = new THREE.Vector2(442, 345)
/** 氣場在照片框外只畫到這個高度（原圖 y，約肩膀上緣）：再往下是延伸出去的隱形肩膀 */
const AURA_OUTSIDE_CUT_Y = 840
/** 發動強度（眉毛、紋路、打光、氣場）上升／退去的時間常數（秒）：上升快、退去慢一點 */
const POWER_RISE_TAU = 0.15
const POWER_FALL_TAU = 0.4


const loadTex = (url: string, colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace) =>
  new Promise<THREE.Texture>((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = colorSpace
        tex.minFilter = THREE.LinearFilter
        tex.magFilter = THREE.LinearFilter
        resolve(tex)
      },
      undefined,
      reject,
    )
  })

type EyeLayer = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
  spec: EyeManifest
  uniforms: {
    uMap: { value: THREE.Texture }
    uMask: { value: THREE.Texture }
    /** 虹膜貼圖的 UV 位移（mesh 本身不動） */
    uOffset: { value: THREE.Vector2 }
    uCharge: { value: number }
    uIrisUv: { value: THREE.Vector2 }
    uRectPx: { value: THREE.Vector2 }
    uTime: { value: number }
    uSpin: { value: number }
    uIrisR: { value: number }
  }
}

export class EditorialPortrait {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.OrthographicCamera
  readonly domElement: HTMLCanvasElement

  private readonly container: HTMLElement
  private readonly root = new THREE.Group()
  private readonly resizeObserver: ResizeObserver
  private readonly timer = new THREE.Timer()
  private readonly textures: THREE.Texture[] = []

  private manifest: PortraitManifest | null = null
  private aspect = 0.5625
  private layout: PortraitLookLayout = { planeW: 0.5625, planeH: 1, halfW: 0.4, halfH: 0.55, centerX: 0, centerY: 0, zoom: 1 }
  private leftEye: EyeLayer | null = null
  private rightEye: EyeLayer | null = null
  private paused = false

  /** 蓄力 0..1：眼睛發紅光的強度；firing = 正在噴火（紅光會閃爍） */
  private charge = 0
  private firing = false
  /** 寫輪眼勾玉目前的旋轉角度（弧度） */
  private spin = 0
  /** 壞笑程度（0..1，發射時往 1 靠、放開往 0 靠） */
  private smirk = 0
  /** 發動強度（0..1）：蓄力時跟著上升、發射中 1、放開後退去 */
  private power = 0
  private readonly projectTmp = new THREE.Vector3()
  private baseMat: THREE.ShaderMaterial | null = null
  private auraMat: THREE.ShaderMaterial | null = null

  private lookLeft = new THREE.Vector2()
  private lookRight = new THREE.Vector2()
  private lookSmoothedLeft = new THREE.Vector2()
  private lookSmoothedRight = new THREE.Vector2()

  static isWebGLAvailable() {
    try {
      const canvas = document.createElement('canvas')
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
    } catch {
      return false
    }
  }

  constructor(container: HTMLElement) {
    this.container = container

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.domElement = this.renderer.domElement
    container.appendChild(this.domElement)

    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 10)
    this.camera.position.z = 2
    this.scene.add(this.root)

    const key = new THREE.DirectionalLight(0xfff6ee, 0.35)
    key.position.set(0.4, 0.8, 2)
    this.scene.add(key)
    this.scene.add(new THREE.AmbientLight(0xe8e4de, 0.55))

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.timer.connect(document)
    this.resize()

    this.renderer.setAnimationLoop((t) => {
      if (this.paused) return
      this.timer.update(t)
      const k = 1 - Math.exp(-12 * this.timer.getDelta())
      this.lookSmoothedLeft.lerp(this.lookLeft, k)
      this.lookSmoothedRight.lerp(this.lookRight, k)
      if (this.leftEye) this.applyLook(this.leftEye, this.lookSmoothedLeft)
      if (this.rightEye) this.applyLook(this.rightEye, this.lookSmoothedRight)
      this.updateCharge()
      this.renderer.render(this.scene, this.camera)
    })
  }

  async loadAssets(manifest: PortraitManifest, assetBase: string) {
    this.disposeScene()

    const [baseMap, leftMap, rightMap, leftMask, rightMask, silMask] = await Promise.all([
      loadTex(`${assetBase}/portrait-base.webp`),
      loadTex(`${assetBase}/left-eye.webp`),
      loadTex(`${assetBase}/right-eye.webp`),
      loadTex(`${assetBase}/left-eye-mask.webp`, THREE.NoColorSpace),
      loadTex(`${assetBase}/right-eye-mask.webp`, THREE.NoColorSpace),
      // 人物輪廓遮罩是資料不是顏色 → NoColorSpace，數值才不會被轉換
      loadTex(`${assetBase}/portrait-mask.webp`, THREE.NoColorSpace),
    ])

    this.textures.push(baseMap, leftMap, rightMap, leftMask, rightMask, silMask)
    this.manifest = manifest
    this.aspect = manifest.sourceSize.width / manifest.sourceSize.height

    const planeW = this.aspect
    const planeH = manifest.planeHeight

    // 底圖用自訂 shader：順便把 6% 暖暗調色混進去
    this.baseMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: baseMap },
        uSil: { value: silMask },
        uMaskPad: { value: manifest.maskPadding ?? 0 },
        uSmirk: { value: 0 },
        uPower: { value: 0 },
        uTime: { value: 0 },
        uTexSize: { value: new THREE.Vector2(manifest.sourceSize.width, manifest.sourceSize.height) },
        uCornerL: { value: MOUTH_CORNER_L },
        uCornerR: { value: MOUTH_CORNER_R },
        uEyeL: { value: new THREE.Vector2(manifest.leftEye.iris.x, manifest.leftEye.iris.y) },
        uEyeR: { value: new THREE.Vector2(manifest.rightEye.iris.x, manifest.rightEye.iris.y) },
        uBrowInL: { value: BROW_IN_L },
        uBrowInR: { value: BROW_IN_R },
        uBrowOutL: { value: BROW_OUT_L },
        uBrowOutR: { value: BROW_OUT_R },
      },
      vertexShader: portraitVertex,
      fragmentShader: baseFragment,
      toneMapped: true,
    })
    const base = new THREE.Mesh(new THREE.PlaneGeometry(planeW, planeH), this.baseMat)
    this.root.add(base)

    // 查克拉氣場：比照片四周各大 maskPadding 像素的平面，火焰才能竄出照片方框
    const pad = manifest.maskPadding ?? 0
    const { width: srcW, height: srcH } = manifest.sourceSize
    this.auraMat = new THREE.ShaderMaterial({
      uniforms: {
        uSil: { value: silMask },
        uPower: { value: 0 },
        uTime: { value: 0 },
        uMaskSize: { value: new THREE.Vector2(srcW + pad * 2, srcH + pad * 2) },
        uMaskPad: { value: pad },
        uTexSize: { value: new THREE.Vector2(srcW, srcH) },
        uOutsideCutY: { value: AURA_OUTSIDE_CUT_Y },
      },
      vertexShader: portraitVertex,
      fragmentShader: auraFragment,
      toneMapped: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })
    const aura = new THREE.Mesh(
      new THREE.PlaneGeometry((planeW * (srcW + pad * 2)) / srcW, (planeH * (srcH + pad * 2)) / srcH),
      this.auraMat,
    )
    // 照片之上（底圖 0）、眼睛之下（5）
    aura.position.z = 0.001
    aura.renderOrder = 1
    this.root.add(aura)

    this.leftEye = this.makeEyeLayer('left', leftMap, leftMask, manifest.leftEye, planeW, planeH)
    this.rightEye = this.makeEyeLayer('right', rightMap, rightMask, manifest.rightEye, planeW, planeH)
    this.root.add(this.leftEye.mesh, this.rightEye.mesh)

    this.resize()
  }

  /** 像素位移 → 貼圖 UV 位移（貼圖就是 rect 大小，所以除以 rect 寬高即可） */
  private applyLook(eye: EyeLayer, offsetPx: THREE.Vector2) {
    eye.uniforms.uOffset.value.set(offsetPx.x / eye.spec.rect.w, offsetPx.y / eye.spec.rect.h)
  }

  /**
   * 眼睛層 mesh 精準蓋在 manifest.rect 上（原圖像素 → 世界座標）。
   * 位置錯了 → 虹膜層和底圖錯開，就會出現「眼睛沒對準」的雙影。
   */
  private makeEyeLayer(
    side: 'left' | 'right',
    map: THREE.Texture,
    mask: THREE.Texture,
    spec: EyeManifest,
    planeW: number,
    planeH: number,
  ): EyeLayer {
    const { width: srcW, height: srcH } = this.manifest!.sourceSize
    const uniforms = {
      uMap: { value: map },
      uMask: { value: mask },
      uOffset: { value: new THREE.Vector2() },
      uCharge: { value: 0 },
      // 貼圖 UV 的 v 向上、像素 y 向下，所以 v 要用 1 − …
      uIrisUv: {
        value: new THREE.Vector2(
          (spec.iris.x - spec.rect.x) / spec.rect.w,
          1 - (spec.iris.y - spec.rect.y) / spec.rect.h,
        ),
      },
      uRectPx: { value: new THREE.Vector2(spec.rect.w, spec.rect.h) },
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uIrisR: { value: SHARINGAN_RADIUS_PX },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: portraitVertex,
      fragmentShader: eyeFragment,
      // 跟底圖一樣套用 renderer 的 tone mapping，虹膜明暗才會一致
      toneMapped: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })

    const w = (spec.rect.w / srcW) * planeW
    const h = (spec.rect.h / srcH) * planeH
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    // 矩形中心（像素）→ 世界座標；影像 y 向下、世界 y 向上，所以要用 0.5 - v
    const cu = (spec.rect.x + spec.rect.w / 2) / srcW
    const cv = (spec.rect.y + spec.rect.h / 2) / srcH
    mesh.position.set((cu - 0.5) * planeW, (0.5 - cv) * planeH, 0.002)
    mesh.renderOrder = 5
    mesh.name = `${side}-eye`

    return { mesh, spec, uniforms }
  }

  /** 噴火前的蓄力：0 = 正常，1 = 眼睛全紅 */
  setCharge(value: number) {
    this.charge = THREE.MathUtils.clamp(value, 0, 1)
  }

  setFiring(firing: boolean) {
    this.firing = firing
    this.charge = firing ? 1 : 0
  }

  /** 照片高度（CSS px）：全頁火焰層拿它當長度單位，火焰大小才會跟照片比例一致（有算進相機 zoom） */
  get pxPerUnit() {
    const r = this.domElement.getBoundingClientRect()
    return (r.height * this.camera.zoom) / (this.camera.top - this.camera.bottom)
  }

  /**
   * 兩眼瞳孔目前的「頁面座標」（CSS px，含捲動，y 向下）：虹膜中心 ＋ 視線位移。
   * 火要從「現在的瞳孔」射出；只用靜止時的虹膜中心 → 眼睛往旁邊看時火會從眼白冒出來。
   */
  getEyePagePositions() {
    const m = this.manifest
    if (!m) return []
    const r = this.domElement.getBoundingClientRect()
    const s = m.planeHeight / m.sourceSize.height
    const pairs = [
      [m.leftEye, this.lookSmoothedLeft],
      [m.rightEye, this.lookSmoothedRight],
    ] as const
    return pairs.map(([spec, look]) => {
      // 原圖像素 → 世界座標 → 用相機投影成 NDC（相機的位置、zoom 都會算進去）→ 螢幕 → 頁面
      const wx = (spec.iris.x - m.sourceSize.width / 2) * s + look.x * s
      const wy = (m.sourceSize.height / 2 - spec.iris.y) * s + look.y * s
      const ndc = this.projectTmp.set(wx, wy, 0).project(this.camera)
      return {
        x: r.left + ((ndc.x + 1) / 2) * r.width + window.scrollX,
        y: r.top + ((1 - ndc.y) / 2) * r.height + window.scrollY,
      }
    })
  }

  /**
   * 每幀：蓄力值與勾玉旋轉角度寫進眼睛 shader。
   * 角度在 CPU 累加（轉速 = 基本 + 蓄力 × 加速）：若在 shader 用「時間 × 轉速」，
   * 轉速一變，角度會整個跳到別的位置。
   */
  private updateCharge() {
    const time = this.timer.getElapsed()
    const dt = Math.min(this.timer.getDelta(), 0.05)
    this.spin += dt * (SPIN_BASE + SPIN_BOOST * this.charge) * (this.firing ? 1.6 : 1)
    // 壞笑：發射中嘴角慢慢上揚，放開後慢慢放下（指數趨近，不會瞬間跳）
    this.smirk += ((this.firing ? 1 : 0) - this.smirk) * (1 - Math.exp(-dt / SMIRK_TAU))
    // 發動強度：蓄力時跟著蓄力值上升，發射中維持 1；上升快、退去慢
    const powerGoal = this.firing ? 1 : this.charge
    const tau = powerGoal > this.power ? POWER_RISE_TAU : POWER_FALL_TAU
    this.power += (powerGoal - this.power) * (1 - Math.exp(-dt / tau))
    if (this.baseMat) {
      const u = this.baseMat.uniforms
      u.uSmirk.value = this.smirk
      u.uPower.value = this.power
      u.uTime.value = time
    }
    if (this.auraMat) {
      this.auraMat.uniforms.uPower.value = this.power
      this.auraMat.uniforms.uTime.value = time
    }
    for (const eye of [this.leftEye, this.rightEye]) {
      if (!eye) continue
      eye.uniforms.uCharge.value = this.charge
      eye.uniforms.uTime.value = time
      eye.uniforms.uSpin.value = this.spin
    }
  }

  setLook(left: THREE.Vector2, right: THREE.Vector2) {
    this.lookLeft.copy(left)
    this.lookRight.copy(right)
  }

  getManifest() {
    return this.manifest
  }

  getLookLayout() {
    return this.layout
  }

  getInteractionRect(): DOMRect {
    const wrap = this.container.parentElement
    if (wrap) return wrap.getBoundingClientRect()
    return this.domElement.getBoundingClientRect()
  }

  setPaused(paused: boolean) {
    this.paused = paused
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (w < 1 || h < 1) return

    this.renderer.setSize(w, h, false)

    const viewAspect = w / h
    const margin = 0.08
    const planeW = this.aspect
    const planeH = 1

    let halfH = planeH * 0.5 + margin
    let halfW = halfH * viewAspect
    if (halfW * 2 < planeW + margin * 2) {
      halfW = planeW * 0.5 + margin
      halfH = halfW / viewAspect
    }

    this.camera.left = -halfW
    this.camera.right = halfW
    this.camera.top = halfH
    this.camera.bottom = -halfH
    this.camera.updateProjectionMatrix()

    this.layout = {
      planeW,
      planeH,
      halfW,
      halfH,
      centerX: this.camera.position.x,
      centerY: this.camera.position.y,
      zoom: this.camera.zoom,
    }
  }

  private disposeScene() {
    for (const child of [...this.root.children]) {
      this.root.remove(child)
      const mesh = child as THREE.Mesh
      mesh.geometry?.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    }
    this.leftEye = null
    this.rightEye = null
  }

  dispose() {
    this.renderer.setAnimationLoop(null)
    this.resizeObserver.disconnect()
    this.disposeScene()
    for (const tex of this.textures) tex.dispose()
    this.textures.length = 0
    this.renderer.dispose()
    this.domElement.remove()
  }
}