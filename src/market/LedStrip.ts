// LED 燈條：一條細長方塊 + 自訂 Shader（決定每顆 LED 的顏色亮度）+ RectAreaLight（真的照亮周圍）
import * as THREE from 'three'

export type StripMode = 'solid' | 'chase' | 'rainbow' | 'breathe' | 'sparkle'
const MODE_INDEX: Record<StripMode, number> = { solid: 0, chase: 1, rainbow: 2, breathe: 3, sparkle: 4 }

// 所有燈條共用的設定：同一個 uniform 物件被多個材質引用 → 改一次，全部燈條一起變
export const stripUniforms = {
  uTime: { value: 0 },
  uSpeed: { value: 1 },
  uMode: { value: 0 },
}

const vertexShader = /* glsl */ `
  attribute float aT;   // 這個頂點在燈條上的位置：0 = 起點、1 = 終點
  varying float vT;
  void main() {
    vT = aT;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform float uMode;
  uniform vec3 uColor;
  uniform float uPower;   // 0 = 關、1 = 全亮（含總亮度）
  uniform float uLength;  // 燈條長度（公尺）
  uniform float uPhase;   // 每條燈條錯開一點，彩虹 / 跑馬燈才不會全部同步
  varying float vT;

  // HSV 轉 RGB：彩虹模式用「色相」繞一圈
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }
  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    float meters = vT * uLength;
    vec3 color = uColor;
    float level = 1.0;

    if (uMode < 0.5) {
      // 單色：全亮
    } else if (uMode < 1.5) {
      // 跑馬燈：一段段亮光沿著燈條移動（fract 讓圖案每 1.2 公尺重複）
      float s = fract(meters / 1.2 - uTime * uSpeed * 0.8 + uPhase);
      level = max(smoothstep(0.0, 0.08, s) * smoothstep(0.55, 0.35, s), 0.06);
    } else if (uMode < 2.5) {
      // 彩虹：色相隨位置與時間變化
      color = hsv2rgb(vec3(fract(meters * 0.12 + uPhase - uTime * uSpeed * 0.15), 0.85, 1.0));
    } else if (uMode < 3.5) {
      // 呼吸：整條一起慢慢明暗
      level = 0.2 + 0.8 * (0.5 + 0.5 * sin(uTime * uSpeed * 2.0 + uPhase * 6.283));
    } else {
      // 閃爍：每顆 LED 隨機閃亮（floor(時間) 讓亂數每一小段時間換一次）
      float led = floor(meters * 30.0);
      level = 0.12 + step(0.82, hash(led + floor(uTime * uSpeed * 10.0) * 17.0));
    }

    // LED 顆粒感：每公尺 30 顆，顆與顆之間稍暗
    float dotMask = smoothstep(0.5, 0.15, abs(fract(meters * 30.0) - 0.5));
    level *= mix(0.55, 1.0, dotMask);

    // × 3：亮度超過 1 → Bloom 光暈
    gl_FragColor = vec4(color * level * uPower * 3.0, 1.0);
    #include <colorspace_fragment>
  }
`

// CPU 端的 HSV → RGB（和 Shader 的 hsv2rgb 結果相同，給 RectAreaLight 用）
const hsv = (h: number, s: number, v: number, target: THREE.Color) => {
  const channel = (n: number) => {
    const k = (n + h * 6) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return target.setRGB(channel(5), channel(3), channel(1), THREE.LinearSRGBColorSpace)
}

export class LedStrip {
  readonly mesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>
  /** 面光源：讓燈條真的照亮附近的牆、地面（只對 MeshStandard / Physical 材質有效） */
  readonly light: THREE.RectAreaLight
  /** 燈條本身的顏色（攤位原色模式時用） */
  readonly baseColor: THREE.Color

  private readonly length: number
  private readonly phase: number
  private readonly lightIntensity: number
  private readonly uniforms: Record<string, THREE.IUniform>

  constructor(length: number, color: THREE.ColorRepresentation, options: { lightHeight?: number; intensity?: number; phase?: number } = {}) {
    this.length = length
    this.phase = options.phase ?? 0
    this.lightIntensity = options.intensity ?? 8
    this.baseColor = new THREE.Color(color)

    const geometry = new THREE.BoxGeometry(length, 0.035, 0.035)
    // aT：每個頂點在長度方向的位置 0 ~ 1（由 x 座標換算）
    const positions = geometry.attributes.position
    const t = new Float32Array(positions.count)
    for (let i = 0; i < positions.count; i++) t[i] = (positions.getX(i) + length / 2) / length
    geometry.setAttribute('aT', new THREE.BufferAttribute(t, 1))

    this.uniforms = {
      ...stripUniforms,
      uColor: { value: this.baseColor.clone() },
      uPower: { value: 0 },
      uLength: { value: length },
      uPhase: { value: this.phase },
    }
    this.mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms }))

    this.light = new THREE.RectAreaLight(this.baseColor, 0, length, options.lightHeight ?? 0.3)
  }

  /**
   * @param power 0 ~ 1（含總亮度與開關動畫）
   * @param color null = 使用燈條原色
   */
  update(power: number, mode: StripMode, color: THREE.Color | null, time: number, speed: number) {
    const u = this.uniforms
    u.uPower.value = power
    u.uColor.value.copy(color ?? this.baseColor)

    // RectAreaLight 的顏色：用和 Shader 相同的公式算出「這條燈條整體看起來的顏色」
    const lightColor = this.light.color.copy(u.uColor.value)
    let level = 1
    if (mode === 'chase') level = 0.4
    else if (mode === 'rainbow') hsv((((0.5 * this.length * 0.12 + this.phase - time * speed * 0.15) % 1) + 1) % 1, 0.85, 1, lightColor)
    else if (mode === 'breathe') level = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(time * speed * 2 + this.phase * 6.283))
    else if (mode === 'sparkle') level = 0.3
    this.light.intensity = this.lightIntensity * level * power
  }

  dispose() {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.light.dispose()
  }
}

/** 每幀更新共用 uniform（所有燈條一起） */
export function updateStripUniforms(time: number, speed: number, mode: StripMode) {
  stripUniforms.uTime.value = time
  stripUniforms.uSpeed.value = speed
  stripUniforms.uMode.value = MODE_INDEX[mode]
}
