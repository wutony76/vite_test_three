// 聲音：引擎聲與喇叭，全部用 Web Audio 即時合成（不需要音檔）
export class CarAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engine: { osc: OscillatorNode; sub: OscillatorNode; gain: GainNode; filter: BiquadFilterNode } | null = null
  muted = false

  /** 必須在使用者點擊後才能建立（瀏覽器的自動播放限制） */
  async start() {
    if (this.ctx) return
    const ctx = new AudioContext()
    const master = ctx.createGain()
    master.gain.value = this.muted ? 0 : 0.5
    master.connect(ctx.destination)

    // 引擎：鋸齒波（粗糙的嗡嗡聲）+ 低八度的方波，經過低通濾波變得悶一點
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    const sub = ctx.createOscillator()
    sub.type = 'square'
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 600
    const gain = ctx.createGain()
    gain.gain.value = 0
    osc.connect(filter)
    sub.connect(filter)
    filter.connect(gain).connect(master)
    osc.start()
    sub.start()

    this.ctx = ctx
    this.master = master
    this.engine = { osc, sub, gain, filter }
    await ctx.resume()
  }

  /** speed：0 ~ 1、throttle：0 ~ 1 */
  update(speed: number, throttle: number) {
    if (!this.ctx || !this.engine) return
    const now = this.ctx.currentTime
    // 車速越快音調越高；踩油門時聲音大一點
    const frequency = 42 + speed * 95 + throttle * 12
    this.engine.osc.frequency.setTargetAtTime(frequency, now, 0.08)
    this.engine.sub.frequency.setTargetAtTime(frequency / 2, now, 0.08)
    this.engine.filter.frequency.setTargetAtTime(380 + speed * 900, now, 0.1)
    this.engine.gain.gain.setTargetAtTime(0.05 + throttle * 0.06 + speed * 0.05, now, 0.1)
  }

  /** 喇叭：兩個方波和弦，短促的「叭」 */
  honk() {
    if (!this.ctx || !this.master) return
    const now = this.ctx.currentTime
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02)
    gain.gain.setValueAtTime(0.25, now + 0.28)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)
    gain.connect(this.master)
    for (const frequency of [415, 523]) {
      const osc = this.ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = frequency
      osc.connect(gain)
      osc.start(now)
      osc.stop(now + 0.36)
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05)
  }
}
