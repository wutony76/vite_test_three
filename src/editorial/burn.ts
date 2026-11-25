import * as THREE from 'three'

/**
 * 燒灼遮罩（burn mask）：一張覆蓋整個頁面的浮點貼圖，記錄「每個位置被燒了多少」。
 *
 * 為什麼用貼圖而不是記一串燒點：火會跟著滑鼠移動，一路燒出軌跡，
 * 用「點」來記會需要成千上萬個；改成每幀把火焰「蓋章」進貼圖，數量再多也是固定成本。
 *
 * 兩張貼圖輪流讀寫（ping-pong）：shader 不能同時讀寫同一張貼圖，
 * 所以每幀讀 A、寫 B，下一幀再反過來。
 *
 * 通道：R = 累積燒灼量（只增不減，≥ 1 代表燒穿）；G = 熱度（會冷卻，決定火邊亮不亮）；
 *       B = 自燃火線（擴散時，燒穿區域外面一圈還沒燒到、正要燒的帶狀區域）。
 */

/** 遮罩解析度 = 頁面 CSS px × SCALE；燒痕邊緣另外用雜訊做細節，不需要全解析度 */
const SCALE = 0.5
/** 火焰正中心每秒累積的燒灼量：8 → 約 0.12 秒燒穿（一般移動速度下，軌跡中心也會燒穿） */
const BURN_RATE = 8
/** 熱度冷卻的時間常數（秒） */
const COOL_TAU = 0.9
/**
 * 自燃擴散：已燒穿的格子點燃 SPREAD_STEP 個 texel 外的鄰居，鄰居每秒累積 SPREAD_RATE。
 * 一步 3 texel = 6 px、平均約 0.08 秒燒穿 → 火線每秒前進約 70～100 px，整頁大約 10～15 秒燒光。
 * （火線前緣另外用 B 通道畫寬帶，速度快也看得到火在跑）
 */
const SPREAD_STEP = 3
const SPREAD_RATE = 12
/** 算「燒焦面積」的門檻：燒灼量 ≥ 這個值就算看得出被燒黑了 */
const COVERAGE_LEVEL = 0.6
/** 面積統計用的縮圖解析度（每格再取 6×6 個樣本） */
const COVERAGE_RES = 16

const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/**
 * 蓋章＋擴散：
 * - 火焰從上一幀位置掃到這一幀位置（線段），線段附近累積燒灼量、熱度拉滿
 * - uSpread = 1 時，已燒穿的區域會點燃旁邊，火線一路往外吃
 */
const stampFragment = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uSize;
uniform vec2 uTexel;
uniform vec2 uFrom;
uniform vec2 uTo;
uniform float uRadius;
uniform float uAmount;
uniform float uDecay;
uniform float uActive;
uniform float uSpread;
uniform float uSpreadAmount;
varying vec2 vUv;

// 點到線段的距離：只用「點到這一幀位置」的距離的話，滑鼠移太快時軌跡會斷成一顆顆圓
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return length(p - a - ab * t);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec4 prev = texture2D(uPrev, vUv);
  // 貼圖 uv 原點在左下，頁面座標原點在左上 → y 要翻轉
  vec2 page = vec2(vUv.x, 1.0 - vUv.y) * uSize;
  float d = segDist(page, uFrom, uTo);
  float f = (1.0 - smoothstep(0.0, uRadius, d)) * uActive;
  float burn = prev.r + f * uAmount;
  // 熱度範圍比燒灼範圍大一圈：洞口邊緣在燃燒中才會有火邊。
  float heat = max(prev.g * uDecay, (1.0 - smoothstep(uRadius * 0.6, uRadius * 1.5, d)) * uActive);

  float front = prev.b * uDecay;
  if (uSpread > 0.5) {
    vec2 o = uTexel * ${SPREAD_STEP.toFixed(1)};
    float lit = max(
      max(texture2D(uPrev, vUv + vec2(o.x, 0.0)).r, texture2D(uPrev, vUv - vec2(o.x, 0.0)).r),
      max(texture2D(uPrev, vUv + vec2(0.0, o.y)).r, texture2D(uPrev, vUv - vec2(0.0, o.y)).r));
    float ignite = step(1.0, lit);
    // 每一小格速度不同，火線才會參差不齊地往外吃，而不是一圈完美的同心圓
    float speed = 0.35 + 1.3 * hash(floor(page / 24.0));
    burn += ignite * uSpreadAmount * speed;

    // 火線：再往外看兩倍距離。緊貼燒穿處 = 1（畫黃）、再外一圈 = 0.6（畫橘）。
    // 只看「燒穿的下一步」的話，火線只有幾 px 寬、而且一下就燒穿，畫面上幾乎看不到火在跑。
    vec2 o2 = o * 2.0;
    float far = max(
      max(texture2D(uPrev, vUv + vec2(o2.x, 0.0)).r, texture2D(uPrev, vUv - vec2(o2.x, 0.0)).r),
      max(texture2D(uPrev, vUv + vec2(0.0, o2.y)).r, texture2D(uPrev, vUv - vec2(0.0, o2.y)).r));
    // 再外一圈（4 倍距離）記 0.25：低於火邊顯示門檻（0.35），不會畫出來，
    // 只用來讓火花知道「這附近有火線」→ 火花的出生範圍比較寬，才不會幾乎抽不到
    vec2 o4 = o * 4.0;
    float farther = max(
      max(texture2D(uPrev, vUv + vec2(o4.x, 0.0)).r, texture2D(uPrev, vUv - vec2(o4.x, 0.0)).r),
      max(texture2D(uPrev, vUv + vec2(0.0, o4.y)).r, texture2D(uPrev, vUv - vec2(0.0, o4.y)).r));
    float unburnt = 1.0 - step(1.0, prev.r);
    front = max(front, max(max(ignite, step(1.0, far) * 0.6), step(1.0, farther) * 0.25) * unburnt);
  }
  gl_FragColor = vec4(min(burn, 4.0), heat, front, 1.0);
}
`

/** 頁面尺寸改變時，把舊遮罩按頁面座標搬到新遮罩（燒痕不會因為縮放視窗而消失或錯位） */
const copyFragment = /* glsl */ `
uniform sampler2D uOld;
uniform vec2 uOldSize;
uniform vec2 uNewSize;
varying vec2 vUv;
void main() {
  vec2 page = vec2(vUv.x, 1.0 - vUv.y) * uNewSize;
  vec2 oldUv = vec2(page.x / uOldSize.x, 1.0 - page.y / uOldSize.y);
  bool inside = all(greaterThanEqual(oldUv, vec2(0.0))) && all(lessThanEqual(oldUv, vec2(1.0)));
  gl_FragColor = inside ? texture2D(uOld, oldUv) : vec4(0.0, 0.0, 0.0, 1.0);
}
`

/** 面積統計：把「目前視窗範圍」切成 16×16 格，每格取 6×6 個樣本，輸出被燒黑的比例 */
const coverageFragment = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uMaskSize;
uniform vec2 uScroll;
uniform vec2 uView;
varying vec2 vUv;
void main() {
  vec2 cell = 1.0 / vec2(${COVERAGE_RES}.0);
  vec2 cellOrigin = floor(vUv / cell) * cell;
  float hit = 0.0;
  for (int i = 0; i < 6; i++) {
    for (int j = 0; j < 6; j++) {
      vec2 uv = cellOrigin + (vec2(float(i), float(j)) + 0.5) / 6.0 * cell;
      vec2 page = vec2(uv.x, 1.0 - uv.y) * uView + uScroll;
      vec2 maskUv = vec2(page.x / uMaskSize.x, 1.0 - page.y / uMaskSize.y);
      hit += step(${COVERAGE_LEVEL.toFixed(2)}, texture2D(uMask, maskUv).r);
    }
  }
  gl_FragColor = vec4(hit / 36.0, 0.0, 0.0, 1.0);
}
`

/** 取樣兩個點（眼睛）的燒灼量：輸出 2×1 像素，x = 0 是第一點、x = 1 是第二點 */
const probeFragment = /* glsl */ `
uniform sampler2D uMask;
uniform vec2 uMaskSize;
uniform vec2 uP0;
uniform vec2 uP1;
void main() {
  vec2 p = gl_FragCoord.x < 1.0 ? uP0 : uP1;
  float burn = texture2D(uMask, vec2(p.x / uMaskSize.x, 1.0 - p.y / uMaskSize.y)).r;
  gl_FragColor = vec4(clamp(burn, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`

const makeTarget = (w: number, h: number) =>
  new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
  })

export class BurnMask {
  /** 遮罩涵蓋的頁面大小（CSS px） */
  readonly size = new THREE.Vector2(1, 1)

  private read: THREE.WebGLRenderTarget
  private write: THREE.WebGLRenderTarget
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly quad: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  private readonly stampMat: THREE.ShaderMaterial
  private readonly copyMat: THREE.ShaderMaterial
  private readonly coverageMat: THREE.ShaderMaterial
  /** 面積統計用 8-bit 小貼圖：readRenderTargetPixelsAsync 只支援 UnsignedByte */
  private readonly coverageTarget = new THREE.WebGLRenderTarget(COVERAGE_RES, COVERAGE_RES, { depthBuffer: false })
  private readonly coverageBuf = new Uint8Array(COVERAGE_RES * COVERAGE_RES * 4)
  private coveragePending = false
  private readonly probeMat: THREE.ShaderMaterial
  private readonly probeTarget = new THREE.WebGLRenderTarget(2, 1, { depthBuffer: false })
  private readonly probeBuf = new Uint8Array(2 * 4)
  private probePending = false
  private needsClear = true
  private empty = true
  /** 自燃擴散中（一旦開始就一路燒到整頁，只有 clear 能停） */
  spreading = false

  constructor() {
    this.read = makeTarget(1, 1)
    this.write = makeTarget(1, 1)
    const tri = new THREE.BufferGeometry()
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    this.stampMat = new THREE.ShaderMaterial({
      uniforms: {
        uPrev: { value: null },
        uSize: { value: this.size },
        uTexel: { value: new THREE.Vector2(1, 1) },
        uFrom: { value: new THREE.Vector2() },
        uTo: { value: new THREE.Vector2() },
        uRadius: { value: 1 },
        uAmount: { value: 0 },
        uDecay: { value: 1 },
        uActive: { value: 0 },
        uSpread: { value: 0 },
        uSpreadAmount: { value: 0 },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: stampFragment,
    })
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { uOld: { value: null }, uOldSize: { value: new THREE.Vector2() }, uNewSize: { value: new THREE.Vector2() } },
      vertexShader: fullscreenVertex,
      fragmentShader: copyFragment,
    })
    this.coverageMat = new THREE.ShaderMaterial({
      uniforms: {
        uMask: { value: null },
        uMaskSize: { value: this.size },
        uScroll: { value: new THREE.Vector2() },
        uView: { value: new THREE.Vector2() },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: coverageFragment,
    })
    this.probeMat = new THREE.ShaderMaterial({
      uniforms: {
        uMask: { value: null },
        uMaskSize: { value: this.size },
        uP0: { value: new THREE.Vector2() },
        uP1: { value: new THREE.Vector2() },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: probeFragment,
    })
    this.quad = new THREE.Mesh(tri, this.stampMat)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  /** 目前的遮罩貼圖（顯示用） */
  get texture() {
    return this.read.texture
  }

  /** 沒燒過任何東西 → 外層可以跳過全螢幕繪製 */
  get isEmpty() {
    return this.empty
  }

  clear() {
    this.needsClear = true
    this.empty = true
    this.spreading = false
  }

  /** 頁面大小改變就重配貼圖，並把舊燒痕搬過去 */
  ensureSize(renderer: THREE.WebGLRenderer, pageW: number, pageH: number) {
    if (pageW === this.size.x && pageH === this.size.y) return
    const w = Math.max(1, Math.round(pageW * SCALE))
    const h = Math.max(1, Math.round(pageH * SCALE))
    const next = makeTarget(w, h)
    if (!this.needsClear) {
      this.copyMat.uniforms.uOld.value = this.read.texture
      this.copyMat.uniforms.uOldSize.value.copy(this.size)
      this.copyMat.uniforms.uNewSize.value.set(pageW, pageH)
      this.renderWith(renderer, this.copyMat, next)
    }
    this.read.dispose()
    this.write.dispose()
    this.read = next
    this.write = makeTarget(w, h)
    this.size.set(pageW, pageH)
    this.stampMat.uniforms.uTexel.value.set(1 / w, 1 / h)
  }

  /**
   * 每幀蓋章。from → to 是火焰這一幀掃過的線段（頁面 px），radius 是火焰半徑（px）。
   * active = false 時只做冷卻與擴散，燒灼量不會變少。
   */
  update(renderer: THREE.WebGLRenderer, dt: number, active: boolean, from: THREE.Vector2, to: THREE.Vector2, radius: number) {
    if (this.needsClear) {
      for (const rt of [this.read, this.write]) {
        renderer.setRenderTarget(rt)
        renderer.setClearColor(0x000000, 1)
        renderer.clear(true, false, false)
      }
      renderer.setRenderTarget(null)
      renderer.setClearColor(0x000000, 0)
      this.needsClear = false
    }
    if (active) this.empty = false
    if (this.empty) return

    const u = this.stampMat.uniforms
    u.uPrev.value = this.read.texture
    u.uFrom.value.copy(from)
    u.uTo.value.copy(to)
    u.uRadius.value = radius
    u.uAmount.value = BURN_RATE * dt
    u.uDecay.value = Math.exp(-dt / COOL_TAU)
    u.uActive.value = active ? 1 : 0
    u.uSpread.value = this.spreading ? 1 : 0
    u.uSpreadAmount.value = SPREAD_RATE * dt
    this.renderWith(renderer, this.stampMat, this.write)
    ;[this.read, this.write] = [this.write, this.read]
  }

  /**
   * 量目前視窗內被燒黑的面積比例（0..1）。
   * 用 GPU 先縮成 16×16，再非同步讀回 CPU：同步的 readPixels 會讓 CPU 停下來等 GPU 畫完（卡頓），
   * 非同步版本等 GPU 有空才把結果交回來。上一次還沒回來就不重複送。
   */
  async measureCoverage(renderer: THREE.WebGLRenderer, scroll: THREE.Vector2, view: THREE.Vector2): Promise<number | null> {
    if (this.coveragePending || this.empty) return null
    this.coveragePending = true
    try {
      const u = this.coverageMat.uniforms
      u.uMask.value = this.read.texture
      u.uScroll.value.copy(scroll)
      u.uView.value.copy(view)
      this.renderWith(renderer, this.coverageMat, this.coverageTarget)
      await renderer.readRenderTargetPixelsAsync(this.coverageTarget, 0, 0, COVERAGE_RES, COVERAGE_RES, this.coverageBuf)
      let sum = 0
      for (let i = 0; i < COVERAGE_RES * COVERAGE_RES; i++) sum += this.coverageBuf[i * 4]
      return sum / (255 * COVERAGE_RES * COVERAGE_RES)
    } finally {
      this.coveragePending = false
    }
  }

  /**
   * 讀兩個頁面座標點的燒灼量（0..1）。用來判斷「眼睛有沒有被燒到」。
   * 跟面積統計一樣走非同步讀回，不會卡住畫面。
   */
  async probe(renderer: THREE.WebGLRenderer, p0: THREE.Vector2, p1: THREE.Vector2): Promise<[number, number] | null> {
    if (this.probePending || this.empty) return null
    this.probePending = true
    try {
      const u = this.probeMat.uniforms
      u.uMask.value = this.read.texture
      u.uP0.value.copy(p0)
      u.uP1.value.copy(p1)
      this.renderWith(renderer, this.probeMat, this.probeTarget)
      await renderer.readRenderTargetPixelsAsync(this.probeTarget, 0, 0, 2, 1, this.probeBuf)
      return [this.probeBuf[0] / 255, this.probeBuf[4] / 255]
    } finally {
      this.probePending = false
    }
  }

  private renderWith(renderer: THREE.WebGLRenderer, mat: THREE.ShaderMaterial, rt: THREE.WebGLRenderTarget) {
    this.quad.material = mat
    renderer.setRenderTarget(rt)
    renderer.render(this.scene, this.camera)
    renderer.setRenderTarget(null)
    this.quad.material = this.stampMat
  }

  dispose() {
    this.read.dispose()
    this.write.dispose()
    this.coverageTarget.dispose()
    this.probeTarget.dispose()
    this.probeMat.dispose()
    this.quad.geometry.dispose()
    this.stampMat.dispose()
    this.copyMat.dispose()
    this.coverageMat.dispose()
  }
}

/**
 * 預先產生一張可無縫拼接的雜訊貼圖（R、G：扭曲方向，B：門檻雜訊）。
 * 顯示時每個像素只要讀一次貼圖；原本每個像素每幀要現算約 20 次程序雜訊（最耗 GPU 的地方）。
 */
export function createNoiseTexture(size = 128) {
  const data = new Uint8Array(size * size * 4)
  // 可拼接的 value noise：格點座標取餘數，左右、上下邊界的格點是同一個 → 平鋪時沒有接縫
  const lattice = (cells: number, seed: number) => {
    const grid = Array.from({ length: cells * cells }, (_, i) => {
      const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453
      return x - Math.floor(x)
    })
    const g = (gx: number, gy: number) => grid[(((gy % cells) + cells) % cells) * cells + (((gx % cells) + cells) % cells)]
    return (u: number, v: number) => {
      const x = u * cells
      const y = v * cells
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      const fx = x - x0
      const fy = y - y0
      const sx = fx * fx * (3 - 2 * fx)
      const sy = fy * fy * (3 - 2 * fy)
      const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx
      const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx
      return a + (b - a) * sy
    }
  }
  const layers = [0, 1, 2].map((c) => [lattice(4, c * 3 + 1), lattice(8, c * 3 + 2), lattice(16, c * 3 + 3)])
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const o = (y * size + x) * 4
      layers.forEach(([l4, l8, l16], c) => {
        data[o + c] = Math.round((l4(u, v) * 0.55 + l8(u, v) * 0.3 + l16(u, v) * 0.15) * 255)
      })
      data[o + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/**
 * 全頁燒痕顯示（卡通風）：畫在最上層透明畫布上，用幾個「硬邊色塊」表現：
 *   深褐描邊 → 焦褐 → 焦黑 → 燒穿的空洞，燃燒中洞口多一圈 橘＋黃 的火邊。
 * 這層看不到底下 HTML 的顏色，所以燒穿直接畫成不透明空洞，視覺上就等於頁面被燒掉了。
 *
 * 硬邊用 fwidth 做 1px 左右的反鋸齒：純 step 在斜邊會有明顯鋸齒，
 * fwidth = 這個值在相鄰像素間變化多少，用它當 smoothstep 寬度，邊緣永遠只糊一個像素。
 */
export const burnVertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

export const burnFragment = /* glsl */ `
uniform sampler2D uMask;
uniform sampler2D uNoise;
uniform vec2 uMaskSize;
uniform float uTime;
uniform float uUnit;
uniform vec2 uScroll;
uniform float uDpr;
uniform float uViewH;
/** 1 = 自燃中：火線上冒火花 */
uniform float uSparks;

float band(float x, float edge, float aa) { return smoothstep(edge - aa, edge + aa, x); }
float sHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }

/**
 * 自燃火花（在 shader 裡畫，不用 CPU 粒子）：
 * 畫面切成 28px 的格子，約 35% 的格子有一顆火花，從格子裡的隨機點往上飄 ~40px、邊飄邊縮小。
 * 只有「起點在火線附近（B 通道 ≥ 0.2、還沒燒穿）」的火花才出現 → 火花自然只沿著正在燒的邊緣冒。
 * 火花會飄出自己的格子，所以每個像素要檢查自己這格和下面兩格發出來的火花。
 * 回傳 vec4：rgb 顏色、a = 1 表示這個像素被火花蓋到。
 */
vec4 sparkAt(vec2 page) {
  const float CELL = 28.0;
  vec2 base = floor(page / CELL);
  for (int j = 0; j < 3; j++) {
    vec2 cell = base + vec2(0.0, float(j)); // 頁面 y 向下，下面的格子 = y + 1
    float rnd = sHash(cell);
    if (rnd > 0.35) continue;
    float period = 0.7 + rnd * 2.0;
    float t = fract(uTime / period + rnd * 7.0);
    vec2 origin = (cell + vec2(sHash(cell + 3.1), sHash(cell + 7.7))) * CELL;
    vec4 o = texture2D(uMask, vec2(origin.x / uMaskSize.x, 1.0 - origin.y / uMaskSize.y));
    if (o.b < 0.2 || o.r >= 1.0) continue;
    vec2 pos = origin + vec2(sin(t * 6.0 + rnd * 40.0) * 5.0, -t * 42.0);
    float size = mix(6.0, 1.0, t);
    vec2 d = abs(page - pos);
    if (d.x + d.y < size) {
      return vec4(t < 0.45 ? vec3(1.0, 0.92, 0.5) : vec3(1.0, 0.55, 0.12), 1.0);
    }
  }
  return vec4(0.0);
}

void main() {
  // gl_FragCoord 是繪圖緩衝區像素、原點在左下 → 換成頁面座標（CSS px、原點左上、含捲動）
  vec2 page = vec2(gl_FragCoord.x / uDpr, uViewH - gl_FragCoord.y / uDpr) + uScroll;
  vec2 q = page / uUnit;

  // 一次讀雜訊貼圖：rg 扭曲遮罩取樣位置（邊緣變成波浪狀的卡通焦邊），b 當門檻雜訊
  vec4 nz = texture2D(uNoise, q * 1.3);
  vec2 warped = page + (nz.rg - 0.5) * 0.12 * uUnit;
  vec4 m = texture2D(uMask, vec2(warped.x / uMaskSize.x, 1.0 - warped.y / uMaskSize.y));
  float nb = m.r * (0.55 + 0.9 * nz.b);
  float front = m.b;
  // 火花要在 discard 之前算：火花會飄到還沒燒到的地方（那裡 nb 很小，原本會直接被丟掉）
  vec4 spark = uSparks > 0.5 ? sparkAt(page) : vec4(0.0);
  if (spark.a > 0.5 && m.r < 1.0) {
    gl_FragColor = spark;
    return;
  }
  if (nb < 0.2 && front < 0.3) discard;
  float aa = fwidth(nb) * 1.2 + 1e-4;

  vec3 OUTLINE = vec3(0.30, 0.16, 0.08);
  vec3 SCORCH = vec3(0.62, 0.38, 0.18);
  vec3 CHAR = vec3(0.17, 0.10, 0.07);
  vec3 VOID = vec3(0.09, 0.06, 0.05);
  vec3 ORANGE = vec3(1.0, 0.46, 0.08);
  vec3 YELLOW = vec3(1.0, 0.85, 0.25);

  vec3 col = OUTLINE;
  col = mix(col, SCORCH, band(nb, 0.27, aa));
  col = mix(col, CHAR, band(nb, 0.55, aa));
  float hole = band(nb, 1.0, aa);
  col = mix(col, VOID, hole);

  // 火邊：還熱的洞口一圈 橘（外）＋黃（內）；每 1/8 秒在小區塊間跳動一次，像卡通火焰的逐格動畫
  float hot = step(0.3, m.g);
  float jitter = fract(sin(floor(uTime * 8.0) * 7.13 + dot(floor(q * 10.0), vec2(12.9, 78.2))) * 43758.5) * 0.05;
  float rim = band(nb, 0.84 + jitter, aa) * (1.0 - hole) * hot;
  float core = band(nb, 0.93 + jitter, aa) * (1.0 - hole) * hot;
  col = mix(col, ORANGE, rim);
  col = mix(col, YELLOW, core);

  // 自燃火線：燒穿區域外面一圈 橘（外）＋黃（內）的卡通火邊，跟著擴散往外推
  float fOuter = band(front + jitter, 0.35, 0.03) * (1.0 - hole);
  float fInner = band(front + jitter, 0.8, 0.03) * (1.0 - hole);
  col = mix(col, ORANGE, fOuter);
  col = mix(col, YELLOW, fInner);

  // 焦褐那圈留一點點透，底下的字隱約看得到；其他色塊都是不透明的平塗
  float a = mix(1.0, 0.88, band(nb, 0.27, aa) * (1.0 - band(nb, 0.55, aa)));
  // 只有火線、還沒焦的地方：火線外的部分要透明（不然會畫出一圈深褐描邊色）
  a = nb < 0.2 ? fOuter : a;
  gl_FragColor = vec4(col, a);
}
`
