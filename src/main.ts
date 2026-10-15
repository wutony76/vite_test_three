// 全域樣式：讓 canvas 填滿整個視窗
import './style.scss'
// Three.js 核心，所有功能都在 THREE 底下（THREE.Scene、THREE.Mesh…）
import * as THREE from 'three'
// 滑鼠控制視角：不在核心內，屬於附加功能（addons），需另外引入
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// index.html 裡的 <div id="app">，之後 canvas 會放進這裡
// 結尾的 ! 是告訴 TypeScript「確定這個元素存在，不會是 null」
const container = document.querySelector<HTMLDivElement>('#app')!

// ── 1. 場景 Scene：放所有物體、燈光的 3D 空間（片場） ──
const scene = new THREE.Scene()
// 背景色，0x1e1e24 等同 CSS 的 #1e1e24
scene.background = new THREE.Color(0x1e1e24)

// ── 2. 攝影機 Camera：決定從哪裡、用什麼角度看場景 ──
// PerspectiveCamera = 透視攝影機（近大遠小，像人眼）
// 參數：視野角度(度)、畫面寬高比、近裁切面、遠裁切面（比 0.1 近或比 100 遠的東西不畫）
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100)
// 座標系：X 往右、Y 往上、Z 朝向螢幕外（朝你）
// 攝影機放在右 7、上 6、前 9 的位置，預設看向原點 (0, 0, 0)；拉遠一點才看得到整個方陣
camera.position.set(7, 6, 9)

// ── 3. 渲染器 Renderer：用 WebGL（顯示卡）把攝影機拍到的畫面畫到 <canvas> 上 ──
// antialias：反鋸齒，讓物體邊緣平滑
const renderer = new THREE.WebGLRenderer({ antialias: true })
// Retina 螢幕 1 個 CSS 像素 = 2~3 個實體像素；上限設 2，避免 3 倍運算量但肉眼差異不大
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
// canvas 尺寸 = 視窗尺寸
renderer.setSize(window.innerWidth, window.innerHeight)
// renderer.domElement 就是 <canvas>，要放進網頁才看得到（少了這行畫面全白）
container.appendChild(renderer.domElement)

// ── 4. 滑鼠控制：左鍵拖曳旋轉、滾輪縮放、右鍵拖曳平移 ──
// 參數：要控制哪台攝影機、監聽哪個元素上的滑鼠事件
const controls = new OrbitControls(camera, renderer.domElement)
// 阻尼：放開滑鼠後會有慣性慢慢停下；開啟後每一幀都必須呼叫 controls.update()
controls.enableDamping = true

// ── 5. 燈光：MeshStandardMaterial 會受光影響，沒有光就是一片黑 ──
// 環境光：從四面八方均勻照亮，沒有方向、沒有立體感（像陰天）。參數：顏色、強度
scene.add(new THREE.AmbientLight(0xffffff, 0.4))
// 平行光：從一個方向照過來，產生亮面與暗面（像太陽）
const dirLight = new THREE.DirectionalLight(0xffffff, 2)
// 光從右上前方 (5, 5, 5) 照向原點
dirLight.position.set(5, 5, 5)
// 建好的東西一定要 scene.add()，否則不會出現在畫面上
scene.add(dirLight)

// ── 6. 物體：用迴圈排出 GRID_SIZE × GRID_SIZE 個方塊 ──
// 物體 Mesh = 形狀 Geometry + 材質 Material
// 一排幾個：10 → 100 個；改成 30 → 900 個、50 → 2500 個，觀察右上角 draw calls 與 FPS 的變化
const GRID_SIZE = 100
// 方塊邊長（小於格距 1，方塊之間才會有縫隙）
const CUBE_SIZE = 1

// 形狀只建立一次，所有方塊共用 → 頂點資料在記憶體裡只有一份
// （若在迴圈裡 new 100 次 BoxGeometry，內容完全一樣卻佔 100 份記憶體）
const sharedGeometry = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)

// Group：把多個物體打包成一組，移動 / 旋轉 group 時，裡面的方塊會一起動
const cubeGroup = new THREE.Group()
scene.add(cubeGroup)

// 所有方塊存進陣列，之後給 Raycaster 檢測與動畫迴圈使用
const cubes: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = []

// 讓整個方陣的中心落在原點：GRID_SIZE = 10 → 位置為 -4.5、-3.5 … 4.5（剛好在每一格的正中央）
const offset = (GRID_SIZE - 1) / 2

for (let row = 0; row < GRID_SIZE; row++) {
  for (let col = 0; col < GRID_SIZE; col++) {
    // 材質每個方塊各一份：點擊時要「只改這一個」的顏色
    // （若共用同一個材質，改一個 = 全部一起變色）
    const material = new THREE.MeshStandardMaterial()
    // 依位置漸層上色：左上到右下，色相從 0 漸變到接近 1（紅 → 黃 → 綠 → 藍 → 紫）
    material.color.setHSL((row + col) / (GRID_SIZE * 2), 0.7, 0.6)

    const cube = new THREE.Mesh(sharedGeometry, material)
    // x = 第幾欄、z = 第幾列（地面是 XZ 平面）；y 抬高半個邊長，讓方塊底部貼齊地面
    cube.position.set(col - offset, CUBE_SIZE / 2, row - offset)

    cubeGroup.add(cube)
    cubes.push(cube)
  }
}

// 地面輔助格線：邊長、切幾格、中心線顏色、格線顏色（跟著 GRID_SIZE 調整大小）
scene.add(new THREE.GridHelper(GRID_SIZE, GRID_SIZE, 0x444444, 0x333333))

// ── 7. 點擊互動：Raycaster（射線檢測） ──
// 問題：滑鼠點的是 2D 螢幕座標，方塊在 3D 空間，要怎麼知道「點到哪個物體」？
// 做法：從攝影機穿過滑鼠位置射出一條看不見的射線，看它先撞到哪些物體
const raycaster = new THREE.Raycaster()

// 狀態集中在單一物件
const state = {
  // 滑鼠位置，換算成 NDC（標準化裝置座標）：畫面左下 (-1, -1)、右上 (1, 1)、中心 (0, 0)
  pointer: new THREE.Vector2(),
  // 按下滑鼠時的螢幕座標，用來判斷這次是「點擊」還是「拖曳旋轉視角」
  downX: 0,
  downY: 0,
  // 效能面板用：累計的幀數、上次更新面板的時間（秒）
  frames: 0,
  statsAt: 0,
}

// 移動超過幾像素就算拖曳（拖曳是 OrbitControls 在轉視角，不該觸發變色）
const DRAG_THRESHOLD = 5

// 私有工具方法
const _handlers = {
  // 螢幕像素座標 → NDC
  // X：0 ~ 寬 → -1 ~ 1
  // Y：0 ~ 高 → 1 ~ -1（螢幕 Y 往下增加，3D 的 Y 往上增加，所以要加負號翻轉）
  updatePointer(event: PointerEvent) {
    const rect = renderer.domElement.getBoundingClientRect()
    state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  },
  // 從攝影機往滑鼠方向射出射線，回傳滑鼠底下「最前面」的方塊；沒打中回傳 null
  pickCube(event: PointerEvent) {
    _handlers.updatePointer(event)
    raycaster.setFromCamera(state.pointer, camera)
    // intersectObjects（多了 s）一次檢測整個陣列
    // 一條射線可能穿過好幾個方塊，結果依距離由近到遠排序 → [0] 就是最靠近攝影機、被看到的那個
    // <(typeof cubes)[number]> 告訴 TypeScript 回傳的物體型別，取材質時才不用轉型
    const hits = raycaster.intersectObjects<(typeof cubes)[number]>(cubes)
    return hits[0]?.object ?? null
  },
  // 隨機顏色：HSL 只隨機色相 H，固定飽和度 S 與亮度 L，避免抽到太暗或太灰的顏色
  randomizeColor(cube: (typeof cubes)[number]) {
    cube.material.color.setHSL(Math.random(), 0.7, 0.6)
  },
}

// UI 入口事件
const click = {
  onPointerDown(event: PointerEvent) {
    state.downX = event.clientX
    state.downY = event.clientY
  },
  onPointerUp(event: PointerEvent) {
    // 按下到放開移動太多 → 是拖曳，不處理
    const moved = Math.hypot(event.clientX - state.downX, event.clientY - state.downY)
    if (moved > DRAG_THRESHOLD) return
    const cube = _handlers.pickCube(event)
    if (!cube) return
    _handlers.randomizeColor(cube)
  },
  // 滑鼠移到方塊上時游標變成手指，提示「這裡可以點」
  onPointerMove(event: PointerEvent) {
    renderer.domElement.style.cursor = _handlers.pickCube(event) ? 'pointer' : 'default'
  },
}

// 用 pointer 事件而非 click 事件：同時支援滑鼠、觸控、觸控筆
renderer.domElement.addEventListener('pointerdown', click.onPointerDown)
renderer.domElement.addEventListener('pointerup', click.onPointerUp)
renderer.domElement.addEventListener('pointermove', click.onPointerMove)

// ── 8. 視窗縮放：同步更新攝影機比例與 canvas 尺寸，否則畫面會變形 ──
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  // 攝影機參數改了之後，必須呼叫這個才會生效（最常忘記的一步）
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ── 9. 效能面板（右上角）──
// draw call：CPU 叫 GPU「畫一個東西」的一次指令。每個 Mesh 至少 1 次，是效能瓶頸的主要指標
const statsEl = document.createElement('div')
statsEl.className = 'stats'
container.appendChild(statsEl)

// ── 10. 動畫迴圈：每次螢幕刷新（約每秒 60 次）執行一次 ──
// Timer 用來計算時間（舊的 THREE.Clock 已棄用，會在 console 出現警告）
const timer = new THREE.Timer()
// 切到別的分頁再回來時，不把離開期間算進去（否則回來瞬間會跳一大段）
timer.connect(document)
// setAnimationLoop 每次呼叫都會傳入當下的時間戳（毫秒）
renderer.setAnimationLoop((timestamp) => {
  // 每幀開頭先更新 Timer，之後讀到的時間才是這一幀的
  timer.update(timestamp)
  // 從開始到現在經過的總秒數
  // （另有 timer.getDelta() 是「兩幀之間」的秒數，適合累加；這裡要算位置，用總時間比較直接）
  const elapsed = timer.getElapsed()

  // 波浪動畫：每個方塊的高度 = sin(時間 + 位置)
  // 「+ 位置」讓相鄰方塊的相位錯開，看起來就像一波一波從角落傳過去
  // sin 介於 -1 ~ 1，(+1) × 0.25 → 0 ~ 0.5，方塊只往上浮、不會沉到地面下
  for (const cube of cubes) {
    const phase = (cube.position.x + cube.position.z) * 0.5
    cube.position.y = CUBE_SIZE / 2 + (Math.sin(elapsed * 2 + phase) + 1) * 0.25
  }

  // 開啟阻尼時必須每幀更新，慣性效果才會運作
  controls.update()
  // 用這台攝影機拍這個場景，畫到 canvas 上（每一幀都要畫一次）
  renderer.render(scene, camera)

  // 每 0.5 秒更新一次面板（每幀都改 DOM 很浪費，數字也會跳到看不清）
  // renderer.info 記錄「剛剛這次 render」的統計，所以要在 render() 之後讀
  state.frames++
  if (elapsed - state.statsAt >= 0.5) {
    const fps = state.frames / (elapsed - state.statsAt)
    const { calls, triangles } = renderer.info.render
    statsEl.textContent = `FPS ${fps.toFixed(0)} ｜ 方塊 ${cubes.length} ｜ draw calls ${calls} ｜ 三角形 ${triangles}`
    state.frames = 0
    state.statsAt = elapsed
  }
})
