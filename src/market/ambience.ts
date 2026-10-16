// 夜市環境音：用 Web Audio 即時合成，不需要音檔
// - 人聲嘈雜：白噪音只留中頻（像很多人同時講話的「嗡嗡」聲），音量慢慢起伏
// - 油炸滋滋聲：只留高頻的細碎噪音
export class Ambience {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null

  /** 必須在使用者點擊後呼叫：瀏覽器禁止自動播放 */
  async start() {
    const { ctx, master } = this.ctx && this.master ? { ctx: this.ctx, master: this.master } : this.setup()
    await ctx.resume()
    master.gain.setTargetAtTime(0.6, ctx.currentTime, 0.4)
  }

  stop() {
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2)
  }

  dispose() {
    this.ctx?.close()
    this.ctx = null
  }

  private setup() {
    const ctx = new AudioContext()
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
    const filter = (type: BiquadFilterType, frequency: number, q = 1) => {
      const node = ctx.createBiquadFilter()
      node.type = type
      node.frequency.value = frequency
      node.Q.value = q
      return node
    }
    const gain = (value: number) => {
      const node = ctx.createGain()
      node.gain.value = value
      return node
    }

    const master = gain(0)
    master.connect(ctx.destination)

    // 人聲：帶通 700Hz；再用一個很慢的振盪器（LFO）讓音量忽大忽小，像人潮的起伏
    const crowd = gain(0.22)
    noise().connect(filter('bandpass', 700, 0.6)).connect(crowd).connect(master)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.18
    const lfoDepth = gain(0.08)
    lfo.connect(lfoDepth).connect(crowd.gain)
    lfo.start()

    // 滋滋聲：高通 4000Hz，音量小
    noise().connect(filter('highpass', 4000)).connect(gain(0.035)).connect(master)

    this.ctx = ctx
    this.master = master
    return { ctx, master }
  }
}
