export type Severity = 'info' | 'low' | 'medium' | 'high'
export interface ProctorEvent {
  type: string
  severity: Severity
  durationMs?: number
  details?: Record<string, unknown>
  photo: boolean
}

export class AssessmentProctor {
  private hiddenAt = 0
  private listeners: [EventTarget, string, EventListener][] = []
  private cooldown: Record<string, number> = {}

  constructor(
    private video: HTMLVideoElement,
    private onEvent: (e: ProctorEvent) => void,
  ) {}

  start() {
    this.listen(document, 'visibilitychange', () => this.onVisibility())
    this.listen(window, 'blur', () => this.emit({ type: 'window_blur', severity: 'medium', photo: true }, 'blur', 5000))
    this.listen(document, 'fullscreenchange', () => {
      if (!document.fullscreenElement) this.emit({ type: 'fullscreen_exit', severity: 'medium', photo: true }, 'fs', 5000)
    })
    for (const ev of ['copy', 'paste', 'cut', 'contextmenu'])
      this.listen(document, ev, () => this.emit({ type: 'copy_paste', severity: 'low', photo: false, details: { action: ev } }, 'copy', 5000))
    const stream = this.video.srcObject as MediaStream | null
    for (const track of stream?.getTracks() ?? [])
      track.addEventListener('ended', () =>
        this.emit({ type: track.kind === 'video' ? 'camera_off' : 'mic_off', severity: 'high', photo: track.kind !== 'video' }, `${track.kind}_off`, 60_000))
    this.startupChecks()
    this.scheduleRandomCheck()
  }

  stop() {
    for (const [t, ev, fn] of this.listeners) t.removeEventListener(ev, fn)
    this.listeners = []
  }

  async snapshot(): Promise<Blob | null> {
    const v = this.video
    if (!v.videoWidth) return null
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = Math.round((640 * v.videoHeight) / v.videoWidth)
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    for (const q of [0.7, 0.5, 0.35]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q))
      if (blob && blob.size < 290 * 1024) return blob
    }
    return null
  }

  private listen(t: EventTarget, ev: string, fn: EventListener) {
    t.addEventListener(ev, fn)
    this.listeners.push([t, ev, fn])
  }

  private emit(e: ProctorEvent, key: string, cooldownMs: number) {
    const now = Date.now()
    if ((this.cooldown[key] ?? 0) > now) return
    this.cooldown[key] = now + cooldownMs
    this.onEvent(e)
  }

  private onVisibility() {
    if (document.hidden) { this.hiddenAt = Date.now(); return }
    const away = Date.now() - this.hiddenAt
    this.emit({ type: 'tab_switch', severity: away > 10_000 ? 'high' : 'medium', durationMs: away, photo: true }, 'tab', 3000)
  }

  private startupChecks() {
    const stream = this.video.srcObject as MediaStream | null
    const label = stream?.getVideoTracks()[0]?.label ?? ''
    if (/obs|manycam|virtual|snap camera|xsplit|droidcam/i.test(label))
      this.emit({ type: 'virtual_camera', severity: 'medium', photo: true, details: { label } }, 'virtual', 1e9)
    if ((window.screen as any).isExtended)
      this.emit({ type: 'multiple_displays', severity: 'low', photo: false }, 'displays', 1e9)
  }

  private scheduleRandomCheck() {
    const delay = 60_000 + Math.random() * 120_000
    setTimeout(() => {
      if (!this.listeners.length) return
      this.emit({ type: 'random_check', severity: 'info', photo: true }, 'random', 30_000)
      this.scheduleRandomCheck()
    }, delay)
  }
}
