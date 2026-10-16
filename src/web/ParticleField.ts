// 粒子場：一個 Points 物件 + 自訂 Shader
// 每顆粒子同時記住 4 個形狀的位置，Shader 依 uMorph 在它們之間混合
import * as THREE from 'three'
import * as shapes from './shapes'
import { fragmentShader, vertexShader } from './shaders'

export type Palette = [string, string]

export class ParticleField {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  readonly count: number
  /** 平滑後的變形進度（每幀往 targetMorph 靠近） */
  morph = 0
  targetMorph = 0

  private readonly uniforms: Record<string, THREE.IUniform>
  private readonly targetColors: [THREE.Color, THREE.Color] = [new THREE.Color(), new THREE.Color()]

  constructor(count: number, pixelRatio: number) {
    this.count = count
    const geometry = new THREE.BufferGeometry()
    // position 是 Three.js 必備的屬性（用來算包圍球等），這裡放球體
    geometry.setAttribute('position', new THREE.BufferAttribute(shapes.sphere(count), 3))
    geometry.setAttribute('aKnot', new THREE.BufferAttribute(shapes.torusKnot(count), 3))
    geometry.setAttribute('aWave', new THREE.BufferAttribute(shapes.wavePlane(count), 3))
    geometry.setAttribute('aText', new THREE.BufferAttribute(shapes.text(count), 3))
    const random = new Float32Array(count)
    for (let i = 0; i < count; i++) random[i] = Math.random()
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(random, 1))

    this.uniforms = {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uSize: { value: 26 },
      uPixelRatio: { value: pixelRatio },
      uMouse: { value: new THREE.Vector3(999, 999, 999) },
      uMouseStrength: { value: 0 },
      uRippleOrigin: { value: new THREE.Vector3() },
      uRippleTime: { value: -999 },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uOpacity: { value: 0.85 },
    }

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      // 疊加混合：粒子重疊的地方會更亮，像發光
      blending: THREE.AdditiveBlending,
      // 不寫入深度：透明粒子互相遮擋時不會出現黑邊
      depthWrite: false,
    })

    this.points = new THREE.Points(geometry, material)
    // 頂點位置在 Shader 裡會變動，包圍球不準 → 關閉視錐剔除
    this.points.frustumCulled = false
  }

  setPalette([a, b]: Palette, immediate = false) {
    this.targetColors[0].set(a)
    this.targetColors[1].set(b)
    if (immediate) {
      this.uniforms.uColorA.value.copy(this.targetColors[0])
      this.uniforms.uColorB.value.copy(this.targetColors[1])
    }
  }

  setMouse(position: THREE.Vector3 | null) {
    if (position) this.uniforms.uMouse.value.copy(position)
  }

  ripple(origin: THREE.Vector3) {
    this.uniforms.uRippleOrigin.value.copy(origin)
    this.uniforms.uRippleTime.value = this.uniforms.uTime.value
  }

  /** 整體透明度（內容較多的段落讓粒子退到背景） */
  setOpacity(opacity: number) {
    this.uniforms.uOpacity.value = opacity
  }

  setPixelRatio(pixelRatio: number) {
    this.uniforms.uPixelRatio.value = pixelRatio
  }

  /**
   * @param mouseActive 滑鼠最近是否有移動（停止移動後推力慢慢消失，粒子回到原位）
   * @param reducedMotion 減少動態效果：變形直接到位
   */
  update(dt: number, elapsed: number, mouseActive: boolean, reducedMotion: boolean) {
    const u = this.uniforms
    u.uTime.value = elapsed
    // 指數平滑：每秒往目標靠近一大截，不管 FPS 高低速度都一樣
    const ease = reducedMotion ? 1 : 1 - Math.exp(-dt * 3)
    this.morph += (this.targetMorph - this.morph) * ease
    u.uMorph.value = this.morph
    u.uMouseStrength.value += ((mouseActive ? 1 : 0) - u.uMouseStrength.value) * (1 - Math.exp(-dt * 4))
    u.uColorA.value.lerp(this.targetColors[0], 1 - Math.exp(-dt * 2.5))
    u.uColorB.value.lerp(this.targetColors[1], 1 - Math.exp(-dt * 2.5))
  }

  dispose() {
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}
