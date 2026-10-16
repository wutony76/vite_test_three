// 可重用的商品 3D 檢視器
// 只負責「把一個模型漂亮地呈現出來」：渲染器、環境光、陰影、攝影機、操作、效能
// 不知道商品名稱、價格、配色這些業務資料 → 換成別的商品（包包、家具）也能直接用
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
// 程式產生的「攝影棚」環境：提供柔和的反射與照明，不需要下載 HDR 圖檔
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

// 自動旋轉被使用者打斷後，閒置幾毫秒再恢復
const AUTO_ROTATE_RESUME_MS = 3000
// 重設視角動畫秒數
const RESET_DURATION = 0.8

type CameraPose = { position: THREE.Vector3; target: THREE.Vector3 }
type Tween = { from: CameraPose; to: CameraPose; elapsed: number }

// 緩動函式：開始和結束慢、中間快，動畫看起來比較自然
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

export class ProductViewer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10)
  readonly controls: OrbitControls

  private readonly container: HTMLElement
  private readonly timer = new THREE.Timer()
  private readonly resizeObserver: ResizeObserver
  private readonly shadowLight = new THREE.DirectionalLight(0xffffff, 1.2)
  private readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>
  private readonly environment: THREE.Texture

  private model: THREE.Object3D | null = null
  // 按需渲染：畫面有變化才設為 true，下一幀才會真的去畫
  private needsRender = true
  private autoRotateEnabled = true
  private resumeTimer = 0
  private tween: Tween | null = null
  // 模型載入後計算出的「預設視角」，重設視角時回到這裡
  private home: CameraPose = { position: new THREE.Vector3(0, 0.2, 0.6), target: new THREE.Vector3() }

  // 檢查瀏覽器是否支援 WebGL（極舊的裝置或關閉硬體加速時會不支援）
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

    // ── 渲染器 ──
    // alpha：背景透明，讓 CSS 漸層背景透出來（換背景不用改 3D 程式）
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // 色調映射：把 3D 計算出的亮度轉成螢幕能顯示的範圍
    // NeutralToneMapping（Khronos PBR Neutral）專為「商品顏色準確」設計，不會像 ACES 那樣讓顏色偏移
    this.renderer.toneMapping = THREE.NeutralToneMapping
    // 陰影：PCFShadowMap 搭配 shadow.radius 做柔邊（新版已移除 PCFSoftShadowMap）
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    container.appendChild(this.renderer.domElement)

    // ── 環境光照 ──
    // PMREMGenerator 把環境場景預先處理成「不同粗糙度」的反射貼圖，金屬、皮革、布料的反光才會正確
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    // scene.environment：所有 PBR 材質都會用它來計算反射與照明，主要的光就是它
    this.scene.environment = this.environment

    // 平行光只負責「投射陰影」，亮度不高，避免把商品打得過亮
    this.shadowLight.castShadow = true
    this.shadowLight.shadow.mapSize.set(1024, 1024)
    // 陰影偏移：避免模型表面出現條紋狀的自我陰影（shadow acne）
    this.shadowLight.shadow.bias = -0.0005
    // 柔邊程度：數字越大陰影邊緣越模糊，更像攝影棚的柔光
    this.shadowLight.shadow.radius = 6
    this.scene.add(this.shadowLight, this.shadowLight.target)

    // 地面：ShadowMaterial 只畫出陰影，其他部分透明 → 商品像放在背景上
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.18 }))
    this.ground.rotation.x = -Math.PI / 2
    this.ground.receiveShadow = true
    this.scene.add(this.ground)

    // ── 操作 ──
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    // 商品展示不需要平移，避免使用者把商品拖出畫面
    this.controls.enablePan = false
    // 不能轉到地面以下，也不能轉到正上方（0 = 正上方、π/2 = 水平）
    this.controls.minPolarAngle = 0.2
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05
    this.controls.autoRotate = true
    this.controls.autoRotateSpeed = 1.5
    // 相機有移動（拖曳、阻尼慣性、自動旋轉）都會觸發 change → 要求重畫
    this.controls.addEventListener('change', this.requestRender)
    // 使用者開始操作：停止自動旋轉、中斷重設動畫
    this.controls.addEventListener('start', this.onInteractionStart)
    // 使用者放開：閒置一段時間後恢復自動旋轉
    this.controls.addEventListener('end', this.onInteractionEnd)

    // ── 尺寸 ──
    // ResizeObserver 監聽「容器」尺寸，而不是 window resize：
    // 版面切換（側欄展開、手機轉向、全螢幕）時容器大小改變，但 window 不一定有 resize
    this.resizeObserver = new ResizeObserver(this.onResize)
    this.resizeObserver.observe(container)
    this.onResize()

    // 切到別的分頁再回來時，不把離開的時間算進動畫
    this.timer.connect(document)
    this.renderer.setAnimationLoop(this.tick)
  }

  // 箭頭函式寫法：當作事件 callback 傳出去時，this 仍然指向這個 viewer
  requestRender = () => {
    this.needsRender = true
  }

  /** 放入模型：置中、貼齊地面、設定陰影範圍、自動取景 */
  setModel(model: THREE.Object3D) {
    if (this.model) this.scene.remove(this.model)
    this.model = model

    // 模型的原點不一定在中心 → 用包圍盒（Box3）算出實際範圍再位移
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.x -= center.x
    model.position.z -= center.z
    // 底部對齊 y = 0（地面）
    model.position.y -= box.min.y
    this.scene.add(model)

    // 用包圍球半徑當「模型大小」，之後的距離、陰影範圍都以它為比例
    // → 不管模型是 30 公分的鞋還是 2 公尺的沙發，都能自動取景
    const size = box.getSize(new THREE.Vector3())
    const radius = box.getBoundingSphere(new THREE.Sphere()).radius
    const target = new THREE.Vector3(0, size.y * 0.4, 0)

    // 陰影：光從右上方照下，陰影相機只涵蓋模型附近（範圍越小，陰影越清楚）
    this.shadowLight.position.set(radius * 1.5, radius * 4, radius * 1.2)
    const shadowCamera = this.shadowLight.shadow.camera
    shadowCamera.left = shadowCamera.bottom = -radius * 1.5
    shadowCamera.right = shadowCamera.top = radius * 1.5
    shadowCamera.near = radius
    shadowCamera.far = radius * 8
    shadowCamera.updateProjectionMatrix()
    this.ground.scale.setScalar(radius * 8)

    // 取景：讓整個包圍球剛好塞進畫面，再多留一點邊
    const fov = THREE.MathUtils.degToRad(this.camera.fov)
    const distance = (radius / Math.sin(fov / 2)) * 1.15
    // 從斜前方 3/4 視角看（商品攝影最常用的角度）
    const direction = new THREE.Vector3(1, 0.45, 1.3).normalize()
    this.home = { position: target.clone().addScaledVector(direction, distance), target }

    this.camera.near = distance / 100
    this.camera.far = distance * 10
    this.camera.updateProjectionMatrix()
    this.controls.minDistance = radius * 1.2
    this.controls.maxDistance = distance * 2.5

    this.camera.position.copy(this.home.position)
    this.controls.target.copy(this.home.target)
    this.controls.update()
    this.requestRender()
  }

  setAutoRotate(enabled: boolean) {
    this.autoRotateEnabled = enabled
    this.controls.autoRotate = enabled
    window.clearTimeout(this.resumeTimer)
    this.requestRender()
  }

  /** 平滑飛回預設視角 */
  resetView() {
    this.tween = {
      from: { position: this.camera.position.clone(), target: this.controls.target.clone() },
      to: this.home,
      elapsed: 0,
    }
    // 動畫期間關掉阻尼與自動旋轉：
    // 拖曳後殘留的慣性、自動旋轉都會在每幀偷偷轉動相機，導致停下來的位置偏離預設視角
    // （OrbitControls 關閉阻尼時，update() 會清空殘留的慣性）
    this.controls.enableDamping = false
    this.controls.autoRotate = false
    window.clearTimeout(this.resumeTimer)
    this.requestRender()
  }

  private finishTween() {
    this.tween = null
    this.controls.enableDamping = true
    this.controls.autoRotate = this.autoRotateEnabled
  }

  /** 檢視器全螢幕（全螢幕的是容器，工具列等 UI 一起進入全螢幕） */
  async toggleFullscreen(element: HTMLElement = this.container) {
    if (document.fullscreenElement) await document.exitFullscreen()
    else await element.requestFullscreen()
  }

  /** 釋放所有資源（單頁應用切換頁面時一定要呼叫，否則 GPU 記憶體會一直累積） */
  dispose() {
    this.renderer.setAnimationLoop(null)
    window.clearTimeout(this.resumeTimer)
    this.resizeObserver.disconnect()
    this.timer.dispose()
    this.controls.dispose()
    this.environment.dispose()
    this.ground.geometry.dispose()
    this.ground.material.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  private onInteractionStart = () => {
    // 動畫中被使用者拖曳 → 中斷動畫，把操作權交還給使用者
    if (this.tween) this.finishTween()
    this.controls.autoRotate = false
    window.clearTimeout(this.resumeTimer)
  }

  private onInteractionEnd = () => {
    if (!this.autoRotateEnabled) return
    this.resumeTimer = window.setTimeout(() => {
      this.controls.autoRotate = true
      this.requestRender()
    }, AUTO_ROTATE_RESUME_MS)
  }

  private onResize = () => {
    const { clientWidth: width, clientHeight: height } = this.container
    // 容器被隱藏時寬高為 0，不處理，避免 aspect 變成 NaN
    if (width === 0 || height === 0) return
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    // 第三個參數 false：不要改 canvas 的 CSS 尺寸（由 CSS 的 100% 控制）
    this.renderer.setSize(width, height, false)
    this.requestRender()
  }

  // 每次螢幕刷新都會呼叫，但只有 needsRender 為 true 才真的重畫
  private tick = (timestamp: number) => {
    this.timer.update(timestamp)
    const delta = this.timer.getDelta()

    if (this.tween) {
      const tween = this.tween
      tween.elapsed += delta
      const t = easeInOutCubic(Math.min(tween.elapsed / RESET_DURATION, 1))
      this.camera.position.lerpVectors(tween.from.position, tween.to.position, t)
      this.controls.target.lerpVectors(tween.from.target, tween.to.target, t)
      if (t === 1) this.finishTween()
      this.requestRender()
    }

    // 傳入 delta：自動旋轉速度以「秒」計算，不受螢幕更新率影響
    // 有變化時會觸發 change 事件 → requestRender
    this.controls.update(delta)

    if (!this.needsRender) return
    this.needsRender = false
    this.renderer.render(this.scene, this.camera)
  }
}
