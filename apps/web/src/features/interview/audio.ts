// Browser audio helpers: recording (MediaRecorder), live captions (Web Speech API, display only),
// the AI voice (speechSynthesis) and a simple energy-based voice detector (Web Audio).

export function pickMime() {
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'])
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  return ''
}

export class AnswerRecorder {
  private rec: MediaRecorder | null = null
  private chunks: Blob[] = []
  startedAt = 0
  start(stream: MediaStream) {
    const audioOnly = new MediaStream(stream.getAudioTracks())
    const mime = pickMime()
    this.rec = new MediaRecorder(audioOnly, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined)
    this.chunks = []
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.rec.start(250)
    this.startedAt = Date.now()
  }
  get recording() { return this.rec?.state === 'recording' }
  stop(): Promise<{ blob: Blob; mime: string; startedAt: number; endedAt: number }> {
    return new Promise((resolve) => {
      const rec = this.rec
      if (!rec || rec.state === 'inactive') return resolve({ blob: new Blob(), mime: 'audio/webm', startedAt: this.startedAt, endedAt: Date.now() })
      rec.onstop = () => resolve({ blob: new Blob(this.chunks, { type: rec.mimeType }), mime: rec.mimeType || 'audio/webm', startedAt: this.startedAt, endedAt: Date.now() })
      rec.stop()
    })
  }
}

export class LiveCaptions {
  private rec: any = null
  private finalText = ''
  interim = ''
  onUpdate?: (text: string) => void
  get supported() { return Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) }
  start() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    this.finalText = ''
    this.interim = ''
    this.rec = new SR()
    this.rec.lang = 'en-IN'
    this.rec.continuous = true
    this.rec.interimResults = true
    this.rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) this.finalText += e.results[i][0].transcript + ' '
        else interim += e.results[i][0].transcript
      }
      this.interim = interim
      this.onUpdate?.(this.text)
    }
    this.rec.onend = () => { if (this.rec) try { this.rec.start() } catch { /* already running */ } }
    try { this.rec.start() } catch { /* ignore */ }
  }
  get text() { return (this.finalText + this.interim).trim() }
  stop() {
    const r = this.rec
    this.rec = null
    try { r?.stop() } catch { /* ignore */ }
    return this.text
  }
}

let voice: SpeechSynthesisVoice | null = null
function chooseVoice() {
  const voices = speechSynthesis.getVoices()
  voice = voices.find((v) => v.lang === 'en-IN') ?? voices.find((v) => v.lang.startsWith('en-GB')) ?? voices.find((v) => v.lang.startsWith('en')) ?? null
}
if (typeof speechSynthesis !== 'undefined') { chooseVoice(); speechSynthesis.onvoiceschanged = chooseVoice }

export function speak(text: string, rate = 0.95): Promise<void> {
  return new Promise((resolve) => {
    if (typeof speechSynthesis === 'undefined') return resolve()
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-IN'
    u.rate = rate
    u.onend = () => resolve()
    u.onerror = () => resolve()
    speechSynthesis.speak(u)
    // Some browsers never fire onend for long text; resolve after an estimate
    setTimeout(resolve, Math.max(4000, (text.split(/\s+/).length / 2.2) * 1000 + 2000))
  })
}
export const stopSpeaking = () => typeof speechSynthesis !== 'undefined' && speechSynthesis.cancel()

// Energy-based voice activity: good enough for end-of-answer detection and "speech while mouth closed".
export class VoiceActivity {
  private ctx: AudioContext
  private analyser: AnalyserNode
  private buf: Float32Array
  private timer = 0
  speaking = false
  lastVoiceAt = 0
  constructor(stream: MediaStream, private threshold = 0.02) {
    this.ctx = new AudioContext()
    const src = this.ctx.createMediaStreamSource(stream)
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 1024
    src.connect(this.analyser)
    this.buf = new Float32Array(this.analyser.fftSize)
    this.timer = window.setInterval(() => this.tick(), 100)
  }
  level() {
    this.analyser.getFloatTimeDomainData(this.buf as any)
    let sum = 0
    for (const v of this.buf) sum += v * v
    return Math.sqrt(sum / this.buf.length)
  }
  private tick() {
    const loud = this.level() > this.threshold
    if (loud) this.lastVoiceAt = Date.now()
    this.speaking = loud || Date.now() - this.lastVoiceAt < 300
  }
  silenceMs() { return this.lastVoiceAt ? Date.now() - this.lastVoiceAt : Infinity }
  close() { clearInterval(this.timer); this.ctx.close().catch(() => {}) }
}
