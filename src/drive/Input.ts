// 操作輸入：鍵盤與觸控 → 統一成 { throttle, steer, brake, boost }
// throttle：-1 倒車 ~ 1 前進；steer：-1 右 ~ 1 左
import type { CarInput } from './Car'

type Actions = { jump: () => void; interact: () => void; reset: () => void; honk: () => void; mute: () => void }

export class Input {
  readonly state: CarInput = { throttle: 0, steer: 0, brake: false, boost: false }
  private readonly keys = new Set<string>()
  // 觸控：手指拖曳的方向（相對於按下的位置）
  private touch: { id: number; x: number; y: number; dx: number; dy: number } | null = null
  private touchBrake = false
  private touchBoost = false

  private readonly actions: Actions

  constructor(actions: Actions) {
    this.actions = actions
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', (event) => this.keys.delete(event.code))
    // 切到別的視窗時放開所有按鍵，避免車子一直往前開
    window.addEventListener('blur', () => this.keys.clear())
  }

  private onKeyDown = (event: KeyboardEvent) => {
    // 在輸入框打字時不處理
    if ((event.target as HTMLElement).closest('input, textarea')) return
    // 方向鍵、空白鍵預設會捲動頁面 → 擋掉
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault()
    if (event.repeat) return
    this.keys.add(event.code)
    if (event.code === 'Space') this.actions.jump()
    if (event.code === 'Enter') this.actions.interact()
    if (event.code === 'KeyR') this.actions.reset()
    if (event.code === 'KeyH') this.actions.honk()
    if (event.code === 'KeyL') this.actions.mute()
  }

  /** 觸控：在畫面上按住並拖曳，往上拖 = 前進、往下 = 倒車、左右 = 轉向 */
  bindTouch(area: HTMLElement, brake: HTMLElement, boost: HTMLElement) {
    area.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'touch' || this.touch) return
      this.touch = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 }
    })
    area.addEventListener('pointermove', (event) => {
      if (!this.touch || event.pointerId !== this.touch.id) return
      // 拖 60 像素就是全油門 / 全轉向
      this.touch.dx = Math.max(-1, Math.min(1, (event.clientX - this.touch.x) / 60))
      this.touch.dy = Math.max(-1, Math.min(1, (event.clientY - this.touch.y) / 60))
    })
    const end = (event: PointerEvent) => {
      if (this.touch && event.pointerId === this.touch.id) this.touch = null
    }
    area.addEventListener('pointerup', end)
    area.addEventListener('pointercancel', end)
    const hold = (element: HTMLElement, set: (on: boolean) => void) => {
      element.addEventListener('pointerdown', (event) => {
        event.stopPropagation()
        set(true)
      })
      for (const type of ['pointerup', 'pointerleave', 'pointercancel']) element.addEventListener(type, () => set(false))
    }
    hold(brake, (on) => (this.touchBrake = on))
    hold(boost, (on) => (this.touchBoost = on))
  }

  /** 正在用觸控拖曳（點擊判斷用） */
  get touchDistance() {
    return this.touch ? Math.hypot(this.touch.dx, this.touch.dy) : 0
  }

  update() {
    const k = (...codes: string[]) => codes.some((code) => this.keys.has(code))
    let throttle = (k('KeyW', 'ArrowUp') ? 1 : 0) - (k('KeyS', 'ArrowDown') ? 1 : 0)
    let steer = (k('KeyA', 'ArrowLeft') ? 1 : 0) - (k('KeyD', 'ArrowRight') ? 1 : 0)
    if (this.touch) {
      // 拖曳的「死區」：小於 0.15 不算，避免手指微微晃動就讓車子動
      const dead = (v: number) => (Math.abs(v) < 0.15 ? 0 : v)
      throttle = -dead(this.touch.dy)
      steer = -dead(this.touch.dx)
    }
    this.state.throttle = throttle
    this.state.steer = steer
    this.state.brake = k('ControlLeft', 'ControlRight', 'KeyB') || this.touchBrake
    this.state.boost = k('ShiftLeft', 'ShiftRight') || this.touchBoost
    return this.state
  }
}
