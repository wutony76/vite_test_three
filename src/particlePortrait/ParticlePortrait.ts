import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildPortraitParticles } from './buildPortraitParticles'
import { buildPortraitRelief } from './buildPortraitRelief'
import {
  effectFromColorMode,
  getEffectPreset,
  particleBlendingFor,
  type PortraitEffect,
} from './effects'
import { DEFAULTS, QUALITY_COUNTS } from './presets'
import { portraitFragmentShader, portraitVertexShader } from './shaders'
import type { ParticlePortraitOptions, RenderMode, ViewMode } from './types'

export type OrbitView = 'front' | 'threeQuarter' | 'left' | 'right' | 'top'

export type PortraitLoadResult = {
  particleCount: number
  rasterWidth: number
  rasterHeight: number
  reliefTriangles: number
  reliefVertices: number
  reliefGrid: { w: number; h: number }
}

export class ParticlePortrait {
  readonly domElement: HTMLCanvasElement

  private readonly container: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly portraitRoot = new THREE.Group()
  private readonly uniforms: Record<string, THREE.IUniform>
  private readonly resizeObserver: ResizeObserver
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerNdc = new THREE.Vector2()
  private readonly mouseWorld = new THREE.Vector3(0, 0, 0)
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

  private points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null
  private reliefMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null
  private readonly reliefLights = new THREE.Group()
  private currentImage: HTMLImageElement | null = null
  private running = false
  private visible = true
  private lastPointerMove = 0
  private dispersionTarget = 0
  private dispersion = 0
  private clickGuard = false
  private pointerDownX = 0
  private pointerDownY = 0
  private homeDistance = 4.2
  private readonly orbitCenter = new THREE.Vector3()
  private orbitRadius = 4.2
  private viewTween: {
    from: THREE.Vector3
    to: THREE.Vector3
    targetFrom: THREE.Vector3
    targetTo: THREE.Vector3
    elapsed: number
    duration: number
  } | null = null

  private opts = {
    particleCount: DEFAULTS.particleCount,
    particleSize: DEFAULTS.particleSize,
    effect: DEFAULTS.effect as PortraitEffect,
    interactionEnabled: DEFAULTS.interactionEnabled,
    autoRotate: DEFAULTS.autoRotate,
    dispersionStrength: DEFAULTS.dispersionStrength,
    alphaThreshold: DEFAULTS.alphaThreshold,
    floatEnabled: DEFAULTS.floatEnabled,
    viewMode: DEFAULTS.viewMode as ViewMode,
    renderMode: DEFAULTS.renderMode as RenderMode,
    reliefDepth: DEFAULTS.reliefDepth,
    reliefGrid: DEFAULTS.reliefGrid,
    edgeBoost: DEFAULTS.edgeBoost,
    wireframe: DEFAULTS.wireframe,
  }

  constructor(container: HTMLElement, options: ParticlePortraitOptions = {}) {
    this.container = container
    this.applyOptions(options, true)

    const pixelRatio = Math.min(window.devicePixelRatio, 2)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setClearColor(DEFAULTS.clearColor)
    this.domElement = this.renderer.domElement
    container.appendChild(this.domElement)

    this.scene.background = new THREE.Color(DEFAULTS.clearColor)
    this.scene.add(this.portraitRoot)

    const ambient = new THREE.AmbientLight(0xa8b8ff, 0.48)
    const key = new THREE.DirectionalLight(0xf2f6ff, 1.05)
    key.position.set(1.6, 2.2, 3.4)
    const rim = new THREE.DirectionalLight(0x58e8ff, 0.55)
    rim.position.set(-2.6, 0.35, -1.8)
    this.reliefLights.add(ambient, key, rim)
    this.reliefLights.visible = false
    this.scene.add(this.reliefLights)

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80)
    this.camera.position.set(0, 0, this.homeDistance)

    const orbitEl = this.opts.renderMode === 'mesh' ? document.body : this.domElement
    this.controls = new OrbitControls(this.camera, orbitEl)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.minDistance = 1.1
    this.controls.maxDistance = 14
    this.controls.enablePan = false
    this.controls.autoRotate = this.opts.autoRotate
    this.controls.autoRotateSpeed = 0.55
    this.controls.rotateSpeed = 0.85

    this.uniforms = {
      uTime: { value: 0 },
      uDispersion: { value: 0 },
      uDispersionStrength: { value: this.opts.dispersionStrength },
      uBaseSize: { value: this.opts.particleSize },
      uPixelRatio: { value: pixelRatio },
      uFloatAmp: { value: this.opts.floatEnabled ? 0.018 : 0 },
      uInteraction: { value: this.opts.interactionEnabled ? 1 : 0 },
      uMouse: { value: new THREE.Vector3(0, 0, 0) },
      uMouseStrength: { value: 0 },
      uRepelRadius: { value: 0.95 },
      uRepelPush: { value: 0.65 },
      uParallax: { value: new THREE.Vector2() },
      uEffect: { value: 1 },
      uTechA: { value: new THREE.Color('#7cf7ff') },
      uTechB: { value: new THREE.Color('#a77bff') },
      uTechC: { value: new THREE.Color('#5eead4') },
      uOpacity: { value: 0.92 },
    }

    this.applyEffectStyle()

    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(container)
    this.onResize()

    const io = new IntersectionObserver(
      (entries) => {
        this.visible = entries[0]?.isIntersecting ?? true
        if (this.visible && this.running) this.startLoop()
        else if (!this.visible) this.stopLoop()
      },
      { threshold: 0.05 },
    )
    io.observe(container)

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopLoop()
      else if (this.visible) this.startLoop()
    })

    this.bindPointer()
    this.startLoop()

    if (options.image) void this.setImage(options.image)
  }

  static isWebGLAvailable() {
    try {
      return Boolean(document.createElement('canvas').getContext('webgl2'))
    } catch {
      return false
    }
  }

  applyOptions(options: ParticlePortraitOptions, initializing = false) {
    if (options.quality) this.opts.particleCount = QUALITY_COUNTS[options.quality]
    if (options.particleCount !== undefined) this.opts.particleCount = options.particleCount
    if (options.particleSize !== undefined) this.opts.particleSize = options.particleSize
    if (options.effect !== undefined) this.opts.effect = options.effect
    else if (options.colorMode !== undefined) this.opts.effect = effectFromColorMode(options.colorMode)
    if (options.interactionEnabled !== undefined) this.opts.interactionEnabled = options.interactionEnabled
    if (options.autoRotate !== undefined) this.opts.autoRotate = options.autoRotate
    if (options.dispersionStrength !== undefined) this.opts.dispersionStrength = options.dispersionStrength
    if (options.alphaThreshold !== undefined) this.opts.alphaThreshold = options.alphaThreshold
    if (options.floatEnabled !== undefined) this.opts.floatEnabled = options.floatEnabled
    if (options.viewMode !== undefined) this.opts.viewMode = options.viewMode
    if (options.reliefDepth !== undefined) this.opts.reliefDepth = options.reliefDepth
    if (options.reliefGrid !== undefined) this.opts.reliefGrid = options.reliefGrid
    if (options.renderMode !== undefined) this.opts.renderMode = options.renderMode
    if (options.edgeBoost !== undefined) this.opts.edgeBoost = options.edgeBoost
    if (options.wireframe !== undefined) this.opts.wireframe = options.wireframe
    if (options.renderMode !== undefined || options.viewMode !== undefined) {
      if (this.opts.renderMode === 'mesh') this.opts.viewMode = 'relief'
      else if (this.opts.renderMode === 'particles') this.opts.viewMode = 'particles'
    }

    if (initializing) return

    this.uniforms.uBaseSize.value = this.opts.particleSize
    this.uniforms.uDispersionStrength.value = this.opts.dispersionStrength
    this.uniforms.uFloatAmp.value = this.opts.floatEnabled ? 0.018 : 0
    this.uniforms.uInteraction.value = this.opts.interactionEnabled ? 1 : 0
    this.applyEffectStyle()
    this.controls.autoRotate = this.opts.autoRotate
    this.syncWireframe()
    this.syncViewMode()
  }

  setViewMode(mode: ViewMode) {
    this.opts.viewMode = mode
    this.syncViewMode()
  }

  async setImage(source: string | HTMLImageElement): Promise<PortraitLoadResult | null> {
    const image = typeof source === 'string' ? await loadImage(source) : source
    this.currentImage = image
    this.dispersionTarget = 0
    this.dispersion = 0
    this.uniforms.uDispersion.value = 0

    this.disposePoints()
    this.disposeRelief()

    const wantParticles = this.opts.renderMode !== 'mesh'
    const wantMesh = this.opts.renderMode !== 'particles'

    let rasterWidth = 0
    let rasterHeight = 0
    let particleCount = 0

    if (wantParticles) {
      const particleDepth = DEFAULTS.depthScale * (this.opts.reliefDepth / DEFAULTS.reliefDepth)
      const built = buildPortraitParticles(image, {
        particleCount: this.opts.particleCount,
        alphaThreshold: this.opts.alphaThreshold,
        planeHeight: DEFAULTS.planeHeight,
        depthScale: particleDepth,
      })
      if (built.count === 0) return null

      rasterWidth = built.rasterWidth
      rasterHeight = built.rasterHeight
      particleCount = built.count

      const { geometryAttributes: g } = built
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(g.position.slice(), 3))
      geometry.setAttribute('aTarget', new THREE.BufferAttribute(g.aTarget.slice(), 3))
      geometry.setAttribute('aScatter', new THREE.BufferAttribute(g.aScatter.slice(), 3))
      geometry.setAttribute('aColor', new THREE.BufferAttribute(g.aColor.slice(), 3))
      geometry.setAttribute('aBright', new THREE.BufferAttribute(g.aBright.slice(), 1))
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(g.aSeed.slice(), 1))
      geometry.computeBoundingBox()

      const material = new THREE.ShaderMaterial({
        vertexShader: portraitVertexShader,
        fragmentShader: portraitFragmentShader,
        uniforms: this.uniforms,
        transparent: true,
        depthWrite: false,
        blending: particleBlendingFor(this.opts.effect),
      })

      this.points = new THREE.Points(geometry, material)
      this.points.frustumCulled = false
      this.portraitRoot.add(this.points)
    }

    let reliefTriangles = 0
    let reliefVertices = 0
    let reliefGrid = { w: 0, h: 0 }

    if (wantMesh) {
      const relief = buildPortraitRelief(image, {
        maxGrid: this.opts.reliefGrid,
        alphaThreshold: this.opts.alphaThreshold,
        planeHeight: DEFAULTS.planeHeight,
        depthScale: this.opts.reliefDepth,
        blurPasses: 2,
        effect: this.opts.effect,
        edgeBoost: this.opts.edgeBoost,
      })

      if (!relief) return null

      rasterWidth = relief.gridWidth
      rasterHeight = relief.gridHeight
      reliefTriangles = relief.triangleCount
      reliefVertices = relief.vertexCount
      reliefGrid = { w: relief.gridWidth, h: relief.gridHeight }

      const meshMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.26,
        roughness: 0.4,
        side: THREE.DoubleSide,
        wireframe: this.opts.wireframe,
      })
      this.reliefMesh = new THREE.Mesh(relief.geometry, meshMat)
      this.portraitRoot.add(this.reliefMesh)
    }

    if (this.opts.renderMode === 'mesh' && reliefTriangles === 0) return null

    this.syncViewMode()
    this.fitCameraToContent()

    return {
      particleCount,
      rasterWidth,
      rasterHeight,
      reliefTriangles,
      reliefVertices,
      reliefGrid,
    }
  }

  rebuildFromCurrentImage() {
    if (this.currentImage) return this.setImage(this.currentImage)
    return Promise.resolve(null)
  }

  toggleDispersion() {
    if (this.opts.renderMode === 'mesh' || this.opts.viewMode !== 'particles') return
    this.dispersionTarget = this.dispersionTarget < 0.5 ? 1 : 0
  }

  resetView() {
    this.setOrbitView('threeQuarter')
  }

  setOrbitView(view: OrbitView) {
    const offset = this.offsetForView(view)
    const toPos = this.orbitCenter.clone().add(offset)
    this.viewTween = {
      from: this.camera.position.clone(),
      to: toPos,
      targetFrom: this.controls.target.clone(),
      targetTo: this.orbitCenter.clone(),
      elapsed: 0,
      duration: 0.55,
    }
    this.controls.autoRotate = false
  }

  private offsetForView(view: OrbitView) {
    const r = this.orbitRadius
    switch (view) {
      case 'front':
        return new THREE.Vector3(0, 0, r)
      case 'left':
        return new THREE.Vector3(-r * 0.92, r * 0.05, r * 0.38)
      case 'right':
        return new THREE.Vector3(r * 0.92, r * 0.05, r * 0.38)
      case 'top':
        return new THREE.Vector3(0, r, r * 0.18)
      default:
        return new THREE.Vector3(r * 0.5, r * 0.2, r * 0.86)
    }
  }

  dispose() {
    this.stopLoop()
    this.resizeObserver.disconnect()
    this.controls.dispose()
    this.disposePoints()
    this.disposeRelief()
    this.renderer.dispose()
    this.domElement.remove()
  }

  private disposePoints() {
    if (!this.points) return
    this.portraitRoot.remove(this.points)
    this.points.geometry.dispose()
    this.points.material.dispose()
    this.points = null
  }

  private disposeRelief() {
    if (!this.reliefMesh) return
    this.portraitRoot.remove(this.reliefMesh)
    this.reliefMesh.geometry.dispose()
    this.reliefMesh.material.dispose()
    this.reliefMesh = null
  }

  private applyEffectStyle() {
    const preset = getEffectPreset(this.opts.effect)
    this.uniforms.uEffect.value = preset.shaderId
    this.uniforms.uTechA.value.set(preset.accentA)
    this.uniforms.uTechB.value.set(preset.accentB)
    this.uniforms.uTechC.value.set(preset.accentC)
    this.uniforms.uOpacity.value = this.opts.effect === 'noir' ? 0.98 : this.opts.effect === 'original' ? 0.94 : 0.92
    this.renderer.setClearColor(preset.background)
    this.scene.background = new THREE.Color(preset.background)
    if (this.points) {
      const mat = this.points.material
      mat.blending = particleBlendingFor(this.opts.effect)
      mat.needsUpdate = true
    }
  }

  private syncWireframe() {
    if (this.reliefMesh) this.reliefMesh.material.wireframe = this.opts.wireframe
  }

  private syncViewMode() {
    const reliefActive =
      (this.opts.renderMode === 'mesh' || this.opts.viewMode === 'relief') && this.reliefMesh !== null
    if (this.points) this.points.visible = !reliefActive
    if (this.reliefMesh) this.reliefMesh.visible = reliefActive
    this.reliefLights.visible = reliefActive
    if (this.opts.renderMode !== 'mesh' && this.opts.viewMode === 'relief' && !this.reliefMesh) {
      this.opts.viewMode = 'particles'
    }
  }

  private fitCameraToContent() {
    const reliefActive =
      (this.opts.renderMode === 'mesh' || this.opts.viewMode === 'relief') && this.reliefMesh !== null
    const source = reliefActive && this.reliefMesh ? this.reliefMesh : (this.points ?? this.reliefMesh ?? this.portraitRoot)
    const box = new THREE.Box3().setFromObject(source)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    const fov = THREE.MathUtils.degToRad(this.camera.fov)
    const dist = maxDim / (2 * Math.tan(fov / 2))

    this.homeDistance = dist * 1.18
    if (reliefActive && this.reliefMesh) {
      this.camera.position.set(center.x + size.x * 0.42, center.y + size.y * 0.22, center.z + dist * 0.92)
    } else {
      this.camera.position.set(center.x, center.y, center.z + dist * 1.12)
    }
    this.orbitCenter.copy(center)
    this.orbitRadius = Math.max(dist * 0.95, 2.2)
    this.controls.target.copy(center)
    this.controls.update()
  }

  private bindPointer() {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const toWorld = (clientX: number, clientY: number) => {
      const rect = this.domElement.getBoundingClientRect()
      this.pointerNdc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      this.raycaster.setFromCamera(this.pointerNdc, this.camera)
      const hit = this.raycaster.ray.intersectPlane(this.plane, this.mouseWorld)
      if (hit) this.uniforms.uMouse.value.copy(hit)
      this.uniforms.uParallax.value.set(this.pointerNdc.x * 0.08, this.pointerNdc.y * 0.06)
    }

    this.domElement.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      this.clickGuard = true
      this.pointerDownX = event.clientX
      this.pointerDownY = event.clientY
    })

    this.domElement.addEventListener('pointermove', (event) => {
      if (!this.opts.interactionEnabled) return
      toWorld(event.clientX, event.clientY)
      this.lastPointerMove = performance.now()
    })

    if (this.opts.renderMode !== 'mesh') {
      this.domElement.addEventListener('pointerup', (event) => {
        if (!this.clickGuard) return
        this.clickGuard = false
        const moved = Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY)
        if (moved > 6) return
        if (!reducedMotion) this.toggleDispersion()
      })
    }

    this.domElement.addEventListener('dblclick', () => this.resetView())
    this.controls.addEventListener('start', () => {
      this.viewTween = null
      if (this.opts.autoRotate) this.controls.autoRotate = false
    })
    this.controls.addEventListener('end', () => {
      if (this.opts.autoRotate) this.controls.autoRotate = true
    })
  }

  private onResize() {
    const { clientWidth: w, clientHeight: h } = this.container
    if (w === 0 || h === 0) return
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h, false)
    this.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, 2)
  }

  private clock = new THREE.Clock()

  private startLoop() {
    if (this.running) return
    this.running = true
    this.clock.start()
    this.renderer.setAnimationLoop(this.tick)
  }

  private stopLoop() {
    if (!this.running) return
    this.running = false
    this.renderer.setAnimationLoop(null)
  }

  private tick = () => {
    const dt = this.clock.getDelta()

    if (this.viewTween) {
      const tw = this.viewTween
      tw.elapsed += dt
      const t = Math.min(tw.elapsed / tw.duration, 1)
      const ease = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      this.camera.position.lerpVectors(tw.from, tw.to, ease)
      this.controls.target.lerpVectors(tw.targetFrom, tw.targetTo, ease)
      if (t >= 1) this.viewTween = null
    }

    if (this.points) {
      const elapsed = this.clock.getElapsedTime()
      this.uniforms.uTime.value = elapsed

      const ease = 1 - Math.exp(-dt * (this.dispersionTarget > this.dispersion ? 2.2 : 3.4))
      this.dispersion += (this.dispersionTarget - this.dispersion) * ease
      this.uniforms.uDispersion.value = this.dispersion

      const mouseActive = performance.now() - this.lastPointerMove < 120
      const targetStrength = mouseActive && this.opts.interactionEnabled && this.dispersion < 0.9 ? 1 : 0
      const u = this.uniforms.uMouseStrength
      u.value += (targetStrength - u.value) * (1 - Math.exp(-dt * 5))
    }

    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image load failed'))
    image.src = src
  })
}