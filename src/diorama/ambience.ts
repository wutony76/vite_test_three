// 環境音：用 Web Audio 即時合成，不需要任何音檔
// 原理：產生「白噪音」（隨機數值的聲波），再用濾波器篩出不同頻率
//   - 只留低頻 → 遠處車流、城市的低鳴
//   - 只留高頻 → 沙沙的雨聲

export class Ambience {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private rainGain: GainNode | null = null
  private rainAmount = 0

  /** 必須在使用者點擊後呼叫：瀏覽器禁止網頁自動播放聲音 */
  async start() {
    const { ctx, master } = this.ctx && this.master ? { ctx: this.ctx, master: this.master } : this.setup()
    await ctx.resume()
    // setTargetAtTime：平滑淡入，避免「啪」一聲
    master.gain.setTargetAtTime(0.7, ctx.currentTime, 0.4)
  }

  stop() {
    if (!this.ctx || !this.master) return
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
  }

  setRain(amount: number) {
    this.rainAmount = amount
    if (!this.ctx || !this.rainGain) return
    this.rainGain.gain.setTargetAtTime(amount * 0.32, this.ctx.currentTime, 0.6)
  }

  dispose() {
    this.ctx?.close()
    this.ctx = null
  }

  private setup() {
    const ctx = new AudioContext()
    // 2 秒的白噪音，循環播放
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1

    const noise = () => {
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.start()
      return source
    }
    const filter = (type: BiquadFilterType, frequency: number) => {
      const node = ctx.createBiquadFilter()
      node.type = type
      node.frequency.value = frequency
      return node
    }
    const gain = (value: number) => {
      const node = ctx.createGain()
      node.gain.value = value
      return node
    }

    const master = gain(0)
    master.connect(ctx.destination)

    // 城市低鳴：低通 220Hz
    const city = gain(0.12)
    noise().connect(filter('lowpass', 220)).connect(city).connect(master)

    // 雨聲：高通 900Hz + 低通 7000Hz
    const rain = gain(this.rainAmount * 0.32)
    noise().connect(filter('highpass', 900)).connect(filter('lowpass', 7000)).connect(rain).connect(master)

    this.ctx = ctx
    this.master = master
    this.rainGain = rain
    return { ctx, master }
  }
}
