// 電影院選位範例
// 重點：「依狀態共用材質」——畫面上有幾種外觀就建幾個材質，點擊時「換材質」而不是「改顏色」
import './style.scss'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
// 把多個形狀合併成一個形狀的工具（座位 = 椅墊 + 椅背）
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// ── 0. 設定值（改這裡就能調整影廳大小、價格） ──
const ROWS = 8 // 幾排
const COLS = 12 // 每排幾個座位
const ROW_LABELS = 'ABCDEFGH' // 排名，A 排最靠近銀幕
const AISLE_AFTER = 6 // 第幾個座位後面是走道
const AISLE_WIDTH = 0.8 // 走道寬
const SEAT_GAP = 1 // 左右座位間距
const ROW_GAP = 1.4 // 前後排距
const ROW_RISE = 0.35 // 每往後一排抬高多少（階梯式座位，後排才看得到銀幕）
const PRICE = 300 // 單張票價
const MAX_SELECT = 6 // 單次最多選幾個座位

// 座位的三種狀態（TypeScript 的聯合型別：值只能是這三個字串之一）
type SeatStatus = 'available' | 'selected' | 'sold'

// 每個座位的資料：3D 物體 + 業務資料分開存，Mesh 只負責「長什麼樣子」
type SeatInfo = {
  id: string // 例：C5
  status: SeatStatus
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
}

// ── 1. 狀態材質：整個影廳只有這 4 個座位材質 ──
// 不管有 96 個還是 9600 個座位，材質數都是 4（有幾種外觀，就建幾個）
const SEAT_COLORS = {
  available: 0x5b6475, // 可選：灰藍
  hover: 0x9db4e0, // 滑鼠指向：亮藍
  selected: 0x3ecf8e, // 已選：綠
  sold: 0xe5484d, // 已售：紅
}
const seatMaterials = {
  available: new THREE.MeshStandardMaterial({ color: SEAT_COLORS.available }),
  hover: new THREE.MeshStandardMaterial({ color: SEAT_COLORS.hover }),
  selected: new THREE.MeshStandardMaterial({ color: SEAT_COLORS.selected }),
  sold: new THREE.MeshStandardMaterial({ color: SEAT_COLORS.sold }),
}

// ── 2. 基本三件套：場景、攝影機、渲染器 ──
const container = document.querySelector<HTMLDivElement>('#app')!

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111116)

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100)
// 在最後一排後方的高處往下看（像訂票網站的座位圖，同時看得到銀幕與每個座位）
camera.position.set(0, 15, ROWS * ROW_GAP + 9)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
container.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
// 攝影機繞著影廳中央轉，而不是繞原點
controls.target.set(0, 0, (ROWS * ROW_GAP) / 2 - 1.5)
// 限制角度：不能轉到地板下面（π/2 = 90° = 水平）
controls.maxPolarAngle = Math.PI / 2 - 0.05
// 限制縮放距離：不能鑽進座位裡，也不能拉到太遠
controls.minDistance = 4
controls.maxDistance = 30

// ── 3. 燈光 ──
scene.add(new THREE.AmbientLight(0xffffff, 0.6))
const topLight = new THREE.DirectionalLight(0xffffff, 1.5)
topLight.position.set(3, 10, 8)
scene.add(topLight)

// ── 4. 影廳環境：地板、階梯、銀幕 ──
// 整排座位的總寬度（含走道），地板與階梯都以此為寬
const hallWidth = COLS * SEAT_GAP + AISLE_WIDTH + 2

// 地板：平面預設是直立的（XY 平面），轉 -90° 讓它平躺成 XZ 平面
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(hallWidth + 4, ROWS * ROW_GAP + 14),
  new THREE.MeshStandardMaterial({ color: 0x1c1c24 }),
)
floor.rotation.x = -Math.PI / 2
floor.position.z = (ROWS * ROW_GAP) / 2 - 2
scene.add(floor)

// 階梯：每排底下墊一塊箱子，第 row 排高 row × ROW_RISE（第 0 排直接坐地板，不用墊）
// 階梯都長一樣顏色 → 共用一個材質
const stepMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2a35 })
for (let row = 1; row < ROWS; row++) {
  const height = row * ROW_RISE
  const step = new THREE.Mesh(new THREE.BoxGeometry(hallWidth, height, ROW_GAP), stepMaterial)
  // Box 的 position 是中心點 → y 放在高度一半，底部才會貼齊地板
  step.position.set(0, height / 2, row * ROW_GAP)
  scene.add(step)
}

// 銀幕：MeshBasicMaterial 不受光影響，看起來像自己會發光
const screen = new THREE.Mesh(
  new THREE.PlaneGeometry(hallWidth - 2, 4.5),
  new THREE.MeshBasicMaterial({ color: 0xdfe8ff }),
)
screen.position.set(0, 3.2, -5)
scene.add(screen)

// ── 5. 座位 ──
// 座位形狀 = 椅墊 + 椅背，合併成「一個」形狀，所有座位共用
// translate 是把形狀本身位移（不是移動 Mesh），讓座位的原點落在底部中央
const cushion = new THREE.BoxGeometry(0.8, 0.25, 0.7).translate(0, 0.35, 0)
// 觀眾面向銀幕（-Z 方向），所以椅背放在 +Z 那一側
const backrest = new THREE.BoxGeometry(0.8, 0.7, 0.15).translate(0, 0.6, 0.3)
const seatGeometry = mergeGeometries([cushion, backrest])

const seats: SeatInfo[] = []
// Raycaster 打到的是 Mesh，要從 Mesh 反查座位資料 → 用 Map 建立對照表
const seatByMesh = new Map<THREE.Object3D, SeatInfo>()

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const id = `${ROW_LABELS[row]}${col + 1}`
    // 模擬「已經有人買走」的座位：用固定公式挑出約 1/5，每次重新整理結果都一樣（方便測試）
    const status: SeatStatus = (row * 7 + col * 3) % 5 === 0 ? 'sold' : 'available'

    // 重點：材質不是 new 出來的，而是「從 4 個共用材質裡挑一個」
    const mesh = new THREE.Mesh(seatGeometry, seatMaterials[status])

    // x：以中央走道為界，左半邊往左推、右半邊往右推半個走道寬
    const aisleShift = col < AISLE_AFTER ? -AISLE_WIDTH / 2 : AISLE_WIDTH / 2
    const x = (col - (COLS - 1) / 2) * SEAT_GAP + aisleShift
    // y：坐在該排階梯上；z：越後排越遠離銀幕
    mesh.position.set(x, row * ROW_RISE, row * ROW_GAP)
    scene.add(mesh)

    const info: SeatInfo = { id, status, mesh }
    seats.push(info)
    seatByMesh.set(mesh, info)
  }
}

// ── 6. 面板 DOM ──
const panel = document.querySelector<HTMLElement>('.panel')!
// 用 data-ref 取元素：HTML 改 class 樣式時不會影響 JS
const $ = <T extends HTMLElement>(ref: string) => panel.querySelector<T>(`[data-ref="${ref}"]`)!
const refs = {
  seats: $('seats'),
  total: $('total'),
  clear: $<HTMLButtonElement>('clear'),
  confirm: $<HTMLButtonElement>('confirm'),
  message: $('message'),
}

// 圖例顏色直接取自材質顏色（單一來源），改 SEAT_COLORS 時圖例會自動同步
for (const [name, hex] of Object.entries(SEAT_COLORS)) {
  panel.style.setProperty(`--c-${name}`, `#${hex.toString(16).padStart(6, '0')}`)
}

// ── 7. 狀態 ──
const state = {
  pointer: new THREE.Vector2(),
  downX: 0,
  downY: 0,
  hovered: null as SeatInfo | null, // 目前滑鼠指著的座位
  isBooking: false, // 是否正在送出訂位（loading）
  message: '',
  messageType: 'info' as 'info' | 'success' | 'error',
}

const DRAG_THRESHOLD = 5
const raycaster = new THREE.Raycaster()
// 只檢測座位，不檢測地板、階梯、銀幕
const seatMeshes = seats.map((seat) => seat.mesh)

// ── 8. 私有工具方法 ──
const _handlers = {
  updatePointer(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  },
  // 回傳滑鼠底下最前面的座位資料；沒有則回傳 null
  pickSeat(event: PointerEvent) {
    _handlers.updatePointer(event)
    raycaster.setFromCamera(state.pointer, camera)
    const hit = raycaster.intersectObjects(seatMeshes)[0]
    return hit ? (seatByMesh.get(hit.object) ?? null) : null
  },
  // 依「狀態」決定材質：只有可選的座位會顯示 hover 效果
  materialFor(seat: SeatInfo) {
    if (seat.status === 'available' && state.hovered === seat) return seatMaterials.hover
    return seatMaterials[seat.status]
  },
  // ⭐ 換材質（改參考），而不是 seat.mesh.material.color.set(...)（那會改到所有共用的座位）
  refreshSeat(seat: SeatInfo) {
    seat.mesh.material = _handlers.materialFor(seat)
  },
  selectedSeats() {
    return seats.filter((seat) => seat.status === 'selected')
  },
  setMessage(message: string, type: typeof state.messageType = 'info') {
    state.message = message
    state.messageType = type
  },
  // 依 state 更新面板（資料 → 畫面 單向流動，所有 DOM 更新集中在這裡）
  renderPanel() {
    const selected = _handlers.selectedSeats()
    refs.seats.textContent = selected.length ? selected.map((seat) => seat.id).join('、') : '尚未選位'
    refs.total.textContent = `NT$ ${(selected.length * PRICE).toLocaleString()}`
    refs.clear.disabled = state.isBooking || selected.length === 0
    refs.confirm.disabled = state.isBooking || selected.length === 0
    refs.confirm.textContent = state.isBooking ? '訂位中…' : '確認訂位'
    refs.message.textContent = state.message
    refs.message.className = `message ${state.messageType}`
  },
  // 模擬後端 API：等 0.8 秒，20% 機率失敗（真實專案這裡會是 fetch）
  fakeBookingApi(ids: string[]) {
    return new Promise<string[]>((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < 0.2) reject(new Error('網路忙碌，請再試一次'))
        else resolve(ids)
      }, 800)
    })
  },
}

// ── 9. 業務流程 ──
const _actions = {
  // 送出訂位：loading → success / error 三段狀態
  async submitBooking() {
    // loading guard：送出中不能重複送
    if (state.isBooking) return
    const selected = _handlers.selectedSeats()
    // early return：沒選位就不送
    if (selected.length === 0) return

    state.isBooking = true
    _handlers.setMessage('')
    _handlers.renderPanel()

    try {
      await _handlers.fakeBookingApi(selected.map((seat) => seat.id))
      // success：選中的座位變成已售出
      for (const seat of selected) {
        seat.status = 'sold'
        _handlers.refreshSeat(seat)
      }
      _handlers.setMessage(`訂位成功：${selected.map((seat) => seat.id).join('、')}`, 'success')
    } catch (error) {
      // error：保留選取，讓使用者可以直接再按一次；錯誤顯示在面板上，不吞錯
      _handlers.setMessage(error instanceof Error ? error.message : '訂位失敗', 'error')
    } finally {
      state.isBooking = false
      _handlers.renderPanel()
    }
  },
}

// ── 10. UI 入口事件 ──
const click = {
  onPointerDown(event: PointerEvent) {
    state.downX = event.clientX
    state.downY = event.clientY
  },
  onPointerUp(event: PointerEvent) {
    const moved = Math.hypot(event.clientX - state.downX, event.clientY - state.downY)
    if (moved > DRAG_THRESHOLD) return
    // 送出中鎖定選位，避免送出的內容和畫面不一致
    if (state.isBooking) return

    const seat = _handlers.pickSeat(event)
    if (!seat) return

    if (seat.status === 'sold') {
      _handlers.setMessage(`${seat.id} 已售出`, 'error')
    } else if (seat.status === 'selected') {
      seat.status = 'available'
      _handlers.setMessage('')
    } else if (_handlers.selectedSeats().length >= MAX_SELECT) {
      _handlers.setMessage(`單次最多選 ${MAX_SELECT} 個座位`, 'error')
    } else {
      seat.status = 'selected'
      _handlers.setMessage('')
    }
    _handlers.refreshSeat(seat)
    _handlers.renderPanel()
  },
  onPointerMove(event: PointerEvent) {
    const seat = _handlers.pickSeat(event)
    // 已售出顯示禁止游標，其他座位顯示手指
    renderer.domElement.style.cursor = !seat ? 'default' : seat.status === 'sold' ? 'not-allowed' : 'pointer'
    // hover 對象沒變就不處理（pointermove 觸發很頻繁）
    if (seat === state.hovered) return
    const previous = state.hovered
    state.hovered = seat
    // 舊的恢復、新的高亮
    if (previous) _handlers.refreshSeat(previous)
    if (seat) _handlers.refreshSeat(seat)
  },
  onPointerLeave() {
    const previous = state.hovered
    state.hovered = null
    if (previous) _handlers.refreshSeat(previous)
  },
  onClear() {
    for (const seat of _handlers.selectedSeats()) {
      seat.status = 'available'
      _handlers.refreshSeat(seat)
    }
    _handlers.setMessage('')
    _handlers.renderPanel()
  },
  onConfirm() {
    _actions.submitBooking()
  },
}

renderer.domElement.addEventListener('pointerdown', click.onPointerDown)
renderer.domElement.addEventListener('pointerup', click.onPointerUp)
renderer.domElement.addEventListener('pointermove', click.onPointerMove)
renderer.domElement.addEventListener('pointerleave', click.onPointerLeave)
refs.clear.addEventListener('click', click.onClear)
refs.confirm.addEventListener('click', click.onConfirm)

// ── 11. 視窗縮放 ──
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ── 12. 動畫迴圈：這個範例沒有東西在動，只需要更新 controls 並重畫 ──
_handlers.renderPanel()
renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})
