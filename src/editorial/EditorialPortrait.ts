import * as THREE from 'three'
import { eyeFragment, eyeVertex } from './shaders'
import type { EyeManifest, PortraitLookLayout, PortraitManifest } from './types'

const loader = new THREE.TextureLoader()

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
  home: THREE.Vector3
  uniforms: {
    uMap: { value: THREE.Texture }
    uMask: { value: THREE.Texture }
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
  private layout: PortraitLookLayout = { planeW: 0.5625, planeH: 1, halfW: 0.4, halfH: 0.55 }
  private leftEye: EyeLayer | null = null
  private rightEye: EyeLayer | null = null
  private paused = false

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
      if (this.leftEye) {
        this.leftEye.mesh.position.x = this.leftEye.home.x + this.lookSmoothedLeft.x
        this.leftEye.mesh.position.y = this.leftEye.home.y + this.lookSmoothedLeft.y
      }
      if (this.rightEye) {
        this.rightEye.mesh.position.x = this.rightEye.home.x + this.lookSmoothedRight.x
        this.rightEye.mesh.position.y = this.rightEye.home.y + this.lookSmoothedRight.y
      }
      this.renderer.render(this.scene, this.camera)
    })
  }

  async loadAssets(manifest: PortraitManifest, assetBase: string) {
    this.disposeScene()

    const [baseMap, leftMap, rightMap, leftMask, rightMask] = await Promise.all([
      loadTex(`${assetBase}/portrait-base.webp`),
      loadTex(`${assetBase}/left-eye.webp`),
      loadTex(`${assetBase}/right-eye.webp`),
      loadTex(`${assetBase}/left-eye-mask.webp`, THREE.NoColorSpace),
      loadTex(`${assetBase}/right-eye-mask.webp`, THREE.NoColorSpace),
    ])

    this.textures.push(baseMap, leftMap, rightMap, leftMask, rightMask)
    this.manifest = manifest
    this.aspect = manifest.sourceSize.width / manifest.sourceSize.height

    const planeW = this.aspect
    const planeH = manifest.planeHeight

    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(planeW, planeH),
      new THREE.MeshBasicMaterial({ map: baseMap, toneMapped: true }),
    )
    this.root.add(base)

    const grade = new THREE.Mesh(
      new THREE.PlaneGeometry(planeW, planeH),
      new THREE.MeshBasicMaterial({
        color: 0x1a1512,
        transparent: true,
        opacity: 0.06,
        blending: THREE.MultiplyBlending,
        depthWrite: false,
      }),
    )
    grade.position.z = 0.0005
    grade.renderOrder = 1
    this.root.add(grade)

    this.leftEye = this.makeEyeLayer('left', leftMap, leftMask, manifest.leftEye, planeW, planeH)
    this.rightEye = this.makeEyeLayer('right', rightMap, rightMask, manifest.rightEye, planeW, planeH)
    this.root.add(this.leftEye.mesh, this.rightEye.mesh)

    this.resize()
  }

  private makeEyeLayer(
    side: 'left' | 'right',
    map: THREE.Texture,
    mask: THREE.Texture,
    spec: EyeManifest,
    planeW: number,
    planeH: number,
  ): EyeLayer {
    const size = spec.radiusUv * planeW * 2
    const uniforms = {
      uMap: { value: map },
      uMask: { value: mask },
    }

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: eyeVertex,
      fragmentShader: eyeFragment,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    })

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.76), mat)
    const x = (spec.centerU - 0.5) * planeW
    const y = (0.5 - spec.centerV) * planeH
    mesh.position.set(x, y, side === 'left' ? 0.002 : 0.0021)
    mesh.renderOrder = 5
    mesh.name = `${side}-eye`

    return { mesh, spec, home: mesh.position.clone(), uniforms }
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