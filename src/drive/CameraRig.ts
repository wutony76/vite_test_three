// 跟車鏡頭：固定斜上方的角度看著車（像在看玩具模型），滑鼠拖曳可以繞著轉、滾輪縮放
import * as THREE from 'three'

export class CameraRig {
  readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400)
  private readonly target = new THREE.Vector3()
  private azimuth = Math.PI * 0.18 // 水平角度
  private targetAzimuth = this.azimuth
  private distance = 20
  private targetDistance = 20
  private drag: { x: number } | null = null

  constructor(element: HTMLElement) {
    element.addEventListener('pointerdown', (event) => {
      // 觸控的拖曳用來開車，鏡頭只給滑鼠拖
      if (event.pointerType === 'mouse') this.drag = { x: event.clientX }
    })
    window.addEventListener('pointermove', (event) => {
      if (!this.drag) return
      this.targetAzimuth -= (event.clientX - this.drag.x) * 0.005
      this.drag.x = event.clientX
    })
    window.addEventListener('pointerup', () => (this.drag = null))
    element.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault()
        this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + event.deltaY * 0.02, 10, 40)
      },
      { passive: false },
    )
  }

  get dragging() {
    return this.drag !== null
  }

  /** 瞬間移到車子位置（開場、重置時用） */
  snap(position: THREE.Vector3) {
    this.target.copy(position)
    this.update(position, new THREE.Vector3(), 1)
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height
    // 直式手機：拉遠一點才看得到周圍
    this.targetDistance = width < height ? 28 : 20
    this.camera.updateProjectionMatrix()
  }

  update(carPosition: THREE.Vector3, carVelocity: THREE.Vector3, dt: number) {
    const ease = 1 - Math.exp(-dt * 5)
    // 鏡頭看向車子「前方一點」：開快時看得到前面的路
    const lookAhead = carVelocity.clone().setY(0).multiplyScalar(0.25)
    this.target.lerp(carPosition.clone().add(lookAhead), ease)
    this.azimuth += (this.targetAzimuth - this.azimuth) * ease
    this.distance += (this.targetDistance - this.distance) * ease
    // 球座標 → 相機位置：俯角固定約 40°
    const elevation = 0.7
    const offset = new THREE.Vector3(Math.sin(this.azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(this.azimuth) * Math.cos(elevation)).multiplyScalar(this.distance)
    this.camera.position.copy(this.target).add(offset)
    this.camera.lookAt(this.target)
  }

  get focus() {
    return this.target
  }
}
