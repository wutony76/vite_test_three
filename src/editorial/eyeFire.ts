import * as THREE from 'three'
import { FIRE } from './fireTheme'

/**
 * 粒子池大小。用環狀覆寫（最舊的先被重用），所以要大於「每秒產生數 × 最長壽命」。
 * 卡通風用「少量大顆、平塗色塊」的火舌，不需要上千顆柔邊粒子疊出漸層 → 3000 降到 600。
 */
const MAX = 600

/** 粒子種類：落點火苗（往上竄）、火星（四散、受重力）。眼睛到目標改用雷射線，不是粒子 */
const FLAME = 1
const SPARK = 2

/** 每秒產生數（火星加量：命中時要看起來「打得很用力」） */
const FLAME_RATE = 60
const SPARK_RATE = 45

/** 雷射整條長方形的厚度（含外圈光暈，unit = 照片高度）：約 43px，紅色光束本體約 13px */
const LASER_WIDTH = 0.05
/** 發射時光束從眼睛「伸」到目標的時間（秒） */
const LASER_EXTEND = 0.1
/** 眼睛光芒大小（unit） */
const FLARE_SIZE = 0.075
/** 命中衝擊波：多久擴散一個、每個活多久（秒）、最大尺寸（unit） */
const RING_INTERVAL = 0.12
const RING_LIFE = 0.4
const RING_MAX = 0.24
const RING_POOL = 8

const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/**
 * 雷射（配色見 fireTheme.ts）：一個 1×1 長方形，每幀縮放成「眼睛到目標的長度 × 厚度」並旋轉過去。
 * 橫切面（y = 離中心線的比例，0 = 中心、1 = 長方形邊緣）由內到外：
 *   白色亮芯（< 0.13）→ 紅色光束（< 0.30，上面有往目標流動的亮紋）→ 黑色描邊（< 0.36）→ 紅色光暈（漸淡）
 * uExtend：發射瞬間光束從眼睛伸到目標（0 → 1），前端有一顆白色亮點。
 */
const laserFragment = /* glsl */ `
uniform float uLength;
uniform float uTime;
uniform float uExtend;
varying vec2 vUv;

float edge(float y, float at, float aa) { return 1.0 - smoothstep(at - aa, at + aa, y); }

void main() {
  float xPx = vUv.x * uLength;
  float headPx = uExtend * uLength;
  if (xPx > headPx) discard;

  float y = abs(vUv.y - 0.5) * 2.0;
  // 硬邊色塊用 fwidth 做約 1px 反鋸齒（火焰層沒開 antialias、又是 1 倍解析度）
  float aa = fwidth(y) * 1.2 + 1e-4;

  // 能量流動：每 70px 一段亮紋，以每秒 900px 往目標方向跑
  float flow = step(0.55, fract((xPx - uTime * 900.0) / 70.0));
  vec3 bodyCol = mix(${FIRE.laserBody}, ${FIRE.laserFlow}, flow);

  float core = edge(y, 0.13, aa);
  float body = edge(y, 0.30, aa);
  float outline = edge(y, 0.36, aa);
  float glow = pow(1.0 - clamp((y - 0.36) / 0.64, 0.0, 1.0), 2.0) * 0.45;

  vec3 col = ${FIRE.laserGlow};
  float a = glow * (1.0 - outline);
  col = mix(col, ${FIRE.laserOutline}, outline);
  a = max(a, outline);
  col = mix(col, bodyCol, body);
  col = mix(col, ${FIRE.laserCore}, core);

  // 伸出去的過程中，前端 14px 是白色亮點
  float tip = (1.0 - smoothstep(0.0, 14.0, headPx - xPx)) * step(uExtend, 0.999);
  col = mix(col, ${FIRE.laserCore}, tip * body);

  gl_FragColor = vec4(col, a);
}
`

/**
 * 眼睛光芒：四道長尖刺（上下左右）＋四道短尖刺（斜角）＋中間方塊，紅邊白芯，硬邊卡通風。
 * 尖刺 = 從中心往外越來越細的菱形條。
 */
const flareFragment = /* glsl */ `
varying vec2 vUv;

float spike(vec2 p, float len, float w) {
  float t = abs(p.x) / len;
  return step(t, 1.0) * step(abs(p.y), w * (1.0 - t));
}

void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  vec2 r = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;
  float s = max(max(spike(p, 1.0, 0.16), spike(p.yx, 1.0, 0.16)), max(spike(r, 0.55, 0.12), spike(r.yx, 0.55, 0.12)));
  float square = step(max(abs(p.x), abs(p.y)), 0.22);
  if (s < 0.5 && square < 0.5) discard;
  float inner = max(square, step(length(p), 0.42));
  gl_FragColor = vec4(mix(${FIRE.flareOuter}, ${FIRE.flareInner}, inner), 1.0);
}
`

/** 命中衝擊波：方形外框（mesh 轉 45° 變菱形），越擴越細、白轉紅、淡出 */
const ringFragment = /* glsl */ `
uniform float uAge;
varying vec2 vUv;
void main() {
  vec2 p = abs(vUv - 0.5) * 2.0;
  float d = max(p.x, p.y);
  float th = mix(0.2, 0.05, uAge);
  float aa = fwidth(d) * 1.2 + 1e-4;
  float ring = smoothstep(1.0 - th - aa, 1.0 - th + aa, d) * (1.0 - smoothstep(1.0 - aa, 1.0, d));
  if (ring < 0.01) discard;
  gl_FragColor = vec4(mix(${FIRE.ringStart}, ${FIRE.ringEnd}, uAge), ring * (1.0 - uAge));
}
`

const vertex = /* glsl */ `
attribute float aAge;
attribute float aSize;
attribute float aKind;
uniform float uPxPerWorld;
varying float vAge;
varying float vKind;

void main() {
  vAge = aAge;
  vKind = aKind;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // 火苗與火星前半段保持大小、最後 40% 縮小到消失（不用淡出，卡通感比較強）
  float grow = 1.0 - smoothstep(0.6, 1.0, aAge);
  // 正交相機沒有透視縮放，粒子大小（CSS px）× devicePixelRatio = 繪圖緩衝區像素
  gl_PointSize = aAge < 0.0 ? 0.0 : aSize * grow * uPxPerWorld;
}
`

/**
 * 方格風火焰：point sprite 本身就是正方形，不用算形狀，整顆塗同一個顏色就是「純色方塊」。
 * - 火苗（FLAME）：顏色隨燃燒時間 淡黃白 → 橘 → 紅，往上竄、最後縮小消失
 * - 火星（SPARK）：小菱形
 * 不做 alpha 漸層 → 不需要大量半透明疊加，GPU 的重疊繪製（overdraw）也少很多。
 */
const fragment = /* glsl */ `
varying float vAge;
varying float vKind;

// 三色兩段內插：t = 0 → a、0.5 → b、1 → c
vec3 ramp(vec3 a, vec3 b, vec3 c, float t) {
  return t < 0.5 ? mix(a, b, t / 0.5) : mix(b, c, (t - 0.5) / 0.5);
}

void main() {
  if (vAge < 0.0) discard;

  if (vKind < 1.5) {
    vec3 fill = ramp(${FIRE.flameYoung}, ${FIRE.flameMid}, ${FIRE.flameOld}, vAge);
    // 描邊：方塊外圈一圈（max(|x|,|y|) 接近 0.5 的地方）換成邊框色，越老邊框越淡
    vec2 sq = abs(gl_PointCoord - 0.5);
    float rim = step(0.5 - ${FIRE.flameEdgeWidth}, max(sq.x, sq.y)) * step(0.001, ${FIRE.flameEdgeWidth});
    gl_FragColor = vec4(mix(fill, ${FIRE.flameEdge}, rim * (1.0 - vAge * 0.6)), 1.0);
    return;
  }

  // 火星：菱形（|x| + |y| 小於半徑）
  vec2 c = gl_PointCoord - 0.5;
  float s = (abs(c.x) + abs(c.y)) / 0.5;
  if (s > 1.0) discard;
  gl_FragColor = vec4(s < 0.6 ? ${FIRE.sparkInner} : ${FIRE.sparkOuter}, 1.0);
}
`

/**
 * 眼睛噴火粒子系統（CPU 更新、一個 Points 畫完）。
 * 座標系：頁面 CSS px，x 向右、y 向上（= −pageY），火焰「往上竄」才能直接寫成 vy > 0。
 *
 * 混合模式不用 Additive：這張照片背景很亮，Additive 會把火疊成一片死白；卡通色塊本來就是不透明的。
 */
export class EyeFire {
  /** 加進場景的根節點：火苗粒子＋兩條雷射＋眼睛光芒＋命中衝擊波 */
  readonly object = new THREE.Group()
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>
  private readonly lasers: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[]
  /** 每條雷射「伸出去」的進度 0..1（剛出現時從 0 開始） */
  private readonly extend = [0, 0]
  private readonly flares: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[]
  private readonly rings: { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>; age: number }[]
  private ringTimer = 0
  private ringCursor = 0

  private readonly pos = new Float32Array(MAX * 3)
  private readonly vel = new Float32Array(MAX * 3)
  private readonly age = new Float32Array(MAX).fill(-1)
  private readonly life = new Float32Array(MAX).fill(1)
  private readonly size = new Float32Array(MAX)
  private readonly kind = new Float32Array(MAX)
  private readonly ageNorm = new Float32Array(MAX).fill(-1)
  private cursor = 0

  private active = false
  /**
   * 每隻眼睛的雷射開關：眼睛被燒掉 → 那隻眼睛的雷射自動關掉；
   * 眼睛燒掉的狀態由外層記住，重新開火時燒掉的眼睛也不會再射。
   */
  private readonly eyeBeam = [true, true]
  private readonly eyeDisabled = [false, false]
  private readonly target = new THREE.Vector2()
  private eyes: THREE.Vector2[] = []
  /**
   * 長度單位：1 unit = 人像照片在螢幕上的高度（CSS px）。
   * 粒子座標是頁面像素，所以下面所有距離、速度、大小常數都要乘上它。
   */
  private u = 800
  private live = 0
  /** 小數累加器：每幀產生數不是整數，餘數留到下一幀，粒子流量才會穩定 */
  private carry = { flame: 0, spark: 0 }

  constructor() {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aAge', new THREE.BufferAttribute(this.ageNorm, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    geo.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage))
    // 粒子到處飛，包圍盒算不準 → 關掉視錐剔除，不然整組粒子可能被誤判在畫面外
    const mat = new THREE.ShaderMaterial({
      uniforms: { uPxPerWorld: { value: 1 } },
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 10

    // 雷射、光芒、衝擊波都是 1×1 長方形（共用幾何），每幀用位置／旋轉／縮放擺到定位。
    // 每個都有自己的材質：uniform（長度、伸出進度、年齡）各自不同
    const quad = new THREE.PlaneGeometry(1, 1)
    const makeMesh = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>, order: number) => {
      const m = new THREE.Mesh(
        quad,
        new THREE.ShaderMaterial({
          uniforms,
          vertexShader: quadVertex,
          fragmentShader,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
      )
      m.frustumCulled = false
      m.renderOrder = order
      m.visible = false
      return m
    }
    // 畫的順序：衝擊波 8 → 雷射 9 → 火苗粒子 10 → 眼睛光芒 11
    this.lasers = [0, 1].map(() =>
      makeMesh(laserFragment, { uLength: { value: 1 }, uTime: { value: 0 }, uExtend: { value: 0 } }, 9),
    )
    this.flares = [0, 1].map(() => makeMesh(flareFragment, {}, 11))
    this.rings = Array.from({ length: RING_POOL }, () => ({
      mesh: makeMesh(ringFragment, { uAge: { value: 0 } }, 8),
      age: 1,
    }))
    this.object.add(...this.rings.map((r) => r.mesh), ...this.lasers, this.points, ...this.flares)
  }

  setPxPerWorld(px: number) {
    this.points.material.uniforms.uPxPerWorld.value = px
  }

  start(target: THREE.Vector2) {
    this.target.copy(target)
    this.active = true
    this.eyeBeam[0] = !this.eyeDisabled[0]
    this.eyeBeam[1] = !this.eyeDisabled[1]
  }

  /** 這隻眼睛被燒掉了：立刻關掉它的雷射，之後重新開火也不再射 */
  disableEye(i: number) {
    this.eyeDisabled[i] = true
    this.eyeBeam[i] = false
  }

  /** 還原頁面時，眼睛也恢復 */
  resetEyes() {
    this.eyeDisabled[0] = false
    this.eyeDisabled[1] = false
  }

  get hasBeam() {
    return this.active && (this.eyeBeam[0] || this.eyeBeam[1])
  }

  /** 噴火中移動落點（火柱跟著滑鼠走） */
  setTarget(target: THREE.Vector2) {
    this.target.copy(target)
  }

  stop() {
    this.active = false
  }

  get isActive() {
    return this.active
  }

  /** 還有活著的粒子（停火後火焰還在飄）；全部消失才能讓外層跳過繪製 */
  get hasLive() {
    return this.live > 0
  }

  /**
   * 每幀更新。
   * eyes = 兩眼目前的位置（頁面 px，y 向上為正，會跟著虹膜移動）
   * burnRadius = 落點燒痕半徑（px）、unit = 1 unit 幾 px
   */
  update(dt: number, time: number, eyes: THREE.Vector2[], burnRadius: number, unit: number) {
    this.eyes = eyes
    this.u = unit
    const u = unit
    if (this.active) this.emit(dt, burnRadius)
    this.updateLasers(dt, time)
    this.updateRings(dt)

    this.live = 0
    for (let i = 0; i < MAX; i++) {
      if (this.age[i] < 0) continue
      this.live++
      this.age[i] += dt
      if (this.age[i] >= this.life[i]) {
        this.age[i] = -1
        this.ageNorm[i] = -1
        continue
      }
      const j = i * 3
      if (this.kind[i] === FLAME) {
        // 火焰往上竄＋左右亂飄（用 sin 做簡單擾流）
        this.vel[j] += Math.sin(time * 9 + (this.pos[j + 1] / u) * 40 + i) * 0.5 * u * dt
        this.vel[j + 1] += 0.35 * u * dt
      } else if (this.kind[i] === SPARK) {
        this.vel[j + 1] -= 0.7 * u * dt
      } else {
        this.vel[j + 1] += 0.15 * u * dt
      }
      this.pos[j] += this.vel[j] * dt
      this.pos[j + 1] += this.vel[j + 1] * dt
      this.ageNorm[i] = this.age[i] / this.life[i]
    }

    const geo = this.points.geometry
    geo.attributes.position.needsUpdate = true
    geo.attributes.aAge.needsUpdate = true
    geo.attributes.aSize.needsUpdate = true
    geo.attributes.aKind.needsUpdate = true
  }

  /**
   * 產生一顆粒子。preAge = 這顆粒子「其實在這一幀裡早一點就出生了」的秒數，
   * 直接把它往前推進那段時間 → 同一幀生的粒子會沿路平均分布。
   * 少了這步，每幀生的粒子擠在同一點，幀率低時火柱會變成一串斷開的點點。
   */
  /**
   * 雷射：中點放在眼睛與目標中間、轉到兩點連線的角度、x 縮放成長度、y 縮放成厚度。
   * 同時更新眼睛光芒（跟著瞳孔、脈動＋慢慢轉）。
   */
  private updateLasers(dt: number, time: number) {
    this.lasers.forEach((laser, i) => {
      const eye = this.eyes[i]
      const on = this.active && this.eyeBeam[i] && !!eye
      laser.visible = on
      this.flares[i].visible = on
      if (!on || !eye) {
        // 下次出現時重新「伸出去」
        this.extend[i] = 0
        return
      }
      this.extend[i] = Math.min(1, this.extend[i] + dt / LASER_EXTEND)
      const dx = this.target.x - eye.x
      const dy = this.target.y - eye.y
      const length = Math.max(Math.hypot(dx, dy), 1e-3)
      // 厚度微微閃動，雷射才有「能量在跑」的感覺
      const width = LASER_WIDTH * this.u * (0.9 + 0.1 * Math.sin(time * 40 + i * 1.7))
      laser.position.set((eye.x + this.target.x) / 2, (eye.y + this.target.y) / 2, 0.005)
      laser.rotation.z = Math.atan2(dy, dx)
      laser.scale.set(length, width, 1)
      const u = laser.material.uniforms
      u.uLength.value = length
      u.uTime.value = time
      u.uExtend.value = this.extend[i]

      // 光芒：剛發射時從小放大（跟著伸出進度），之後快速脈動、慢慢旋轉
      const flare = this.flares[i]
      const pulse = 0.85 + 0.2 * Math.sin(time * 18 + i)
      const grow = Math.min(1, this.extend[i] * 2)
      const size = FLARE_SIZE * this.u * pulse * grow
      flare.position.set(eye.x, eye.y, 0.02)
      flare.rotation.z = time * 1.5 * (i === 0 ? 1 : -1)
      flare.scale.set(size, size, 1)
    })
  }

  /** 命中衝擊波：發射中每 0.12 秒在目標點放一個，往外擴散、變細、淡出 */
  private updateRings(dt: number) {
    if (this.active && (this.eyeBeam[0] || this.eyeBeam[1])) {
      this.ringTimer += dt
      if (this.ringTimer >= RING_INTERVAL) {
        this.ringTimer = 0
        const ring = this.rings[this.ringCursor]
        this.ringCursor = (this.ringCursor + 1) % RING_POOL
        ring.age = 0
        ring.mesh.position.set(this.target.x, this.target.y, 0.004)
      }
    }
    for (const ring of this.rings) {
      if (ring.age >= 1) {
        ring.mesh.visible = false
        continue
      }
      ring.age = Math.min(1, ring.age + dt / RING_LIFE)
      // 先快後慢地擴散（ease-out）
      const k = 1 - (1 - ring.age) * (1 - ring.age)
      const size = (0.03 + (RING_MAX - 0.03) * k) * this.u
      ring.mesh.visible = true
      ring.mesh.rotation.z = Math.PI / 4
      ring.mesh.scale.set(size, size, 1)
      ring.mesh.material.uniforms.uAge.value = ring.age
    }
  }

  private spawn(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, preAge = 0) {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % MAX
    const j = i * 3
    this.pos[j] = x + vx * preAge
    this.pos[j + 1] = y + vy * preAge
    this.pos[j + 2] = 0.01
    this.vel[j] = vx
    this.vel[j + 1] = vy
    this.age[i] = preAge
    this.ageNorm[i] = preAge / life
    this.life[i] = life
    this.size[i] = size
    this.kind[i] = kind
  }

  private take(key: keyof EyeFire['carry'], rate: number, dt: number) {
    const n = this.carry[key] + rate * dt
    const count = Math.floor(n)
    this.carry[key] = n - count
    return count
  }

  private emit(dt: number, burnRadius: number) {
    const rand = Math.random
    const u = this.u
    const { x: tx, y: ty } = this.target

    // 落點火焰：燒痕還小時在中心冒，變大後沿著燒痕邊緣冒（看起來是邊緣在燒）
    const flames = this.take('flame', FLAME_RATE, dt)
    for (let k = 0; k < flames; k++) {
      const ang = rand() * Math.PI * 2
      const r = burnRadius > 0.03 * u ? burnRadius * (0.65 + rand() * 0.45) : Math.sqrt(rand()) * 0.02 * u
      const x = tx + Math.cos(ang) * r
      const y = ty + Math.sin(ang) * r
      const big = 1 + Math.min((burnRadius / u) * 2, 0.5)
      this.spawn(FLAME, x, y, (rand() - 0.5) * 0.06 * u, (0.1 + rand() * 0.18) * u, 0.5 + rand() * 0.4, (0.035 + rand() * 0.028) * big * u, rand() * dt)
    }

    // 火星：從落點彈出、受重力落下
    const sparks = this.take('spark', SPARK_RATE, dt)
    for (let k = 0; k < sparks; k++) {
      const ang = Math.PI * (0.1 + rand() * 0.8)
      const sp = (0.3 + rand() * 0.45) * u
      this.spawn(SPARK, tx, ty, Math.cos(ang) * sp, Math.sin(ang) * sp, 0.5 + rand() * 0.5, (0.016 + rand() * 0.01) * u, rand() * dt)
    }
  }

  dispose() {
    this.points.geometry.dispose()
    this.points.material.dispose()
    // 長方形幾何是共用的，丟一次就好；材質每個都要丟
    this.lasers[0].geometry.dispose()
    for (const m of [...this.lasers, ...this.flares, ...this.rings.map((r) => r.mesh)]) m.material.dispose()
  }
}
