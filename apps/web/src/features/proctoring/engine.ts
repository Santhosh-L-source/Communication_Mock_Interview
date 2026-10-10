// Anti-cheat detectors that run in the student's browser (free, video never leaves the device except
// still photos for events). A condition must last a minimum time before it becomes an event.
import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision'
import type { VoiceActivity } from '../interview/audio'

export type Severity = 'info' | 'low' | 'medium' | 'high'
export interface DetectedEvent {
  type: string
  severity: Severity
  confidence?: number
  durationMs?: number
  details?: Record<string, unknown>
  photo: boolean
}

const WASM = '/mediapipe' // copied from node_modules by scripts/copy-mediapipe.mjs
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const OBJECT_MODEL = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'

// Thresholds from the design (§8.3)
const T = {
  noFaceMs: 3000, multiFaceMs: 1000, lookAwayMs: 4000, lookAwayRepeats: 5, yawDeg: 30, pitchDeg: 25, eyeLook: 0.65,
  phoneFrames: 2, bookFrames: 2, secondVoiceMs: 2000, mouthClosed: 0.08, tabHighMs: 10_000,
}

function headPose(m: number[]) {
  // column-major 4x4 transform -> Euler angles in degrees
  const r20 = m[2], r21 = m[6], r22 = m[10]
  const pitch = Math.atan2(r21, r22) * (180 / Math.PI)
  const yaw = Math.atan2(-r20, Math.hypot(r21, r22)) * (180 / Math.PI)
  return { yaw, pitch }
}

export class ProctorEngine {
  private face: FaceLandmarker | null = null
  private objects: ObjectDetector | null = null
  private timer = 0
  private objTimer = 0
  private since: Record<string, number> = {}
  private fired: Record<string, boolean> = {}
  private phoneFrames = 0
  private bookFrames = 0
  private lookAwayCount = 0
  private hiddenAt = 0
  private listeners: [EventTarget, string, EventListener][] = []
  private answerFrames = 0
  private answerOnScreen = 0
  private inAnswer = false
  mouthOpen = 0
  modelsReady = false

  constructor(private video: HTMLVideoElement, private opts: {
    onEvent: (e: DetectedEvent) => void
    vad: VoiceActivity | null
    isAiSpeaking: () => boolean
    onFaceCount?: (n: number) => void
  }) {}

  async init() {
    try {
      const fileset = await FilesetResolver.forVisionTasks(WASM)
      this.face = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 3,
        outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      })
      this.objects = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: OBJECT_MODEL, delegate: 'GPU' }, runningMode: 'VIDEO', scoreThreshold: 0.5,
        categoryAllowlist: ['cell phone', 'book'], maxResults: 3,
      })
      this.modelsReady = true
    } catch (e) {
      console.warn('Vision models failed to load; browser-event checks still run', e)
    }
    return this.modelsReady
  }

  start() {
    // Face checks ~5 fps, object detection ~1 fps (keeps CPU low on student laptops)
    if (this.face) this.timer = window.setInterval(() => this.faceTick(), 200)
    if (this.objects) this.objTimer = window.setInterval(() => this.objectTick(), 1000)
    this.listen(document, 'visibilitychange', () => this.onVisibility())
    this.listen(window, 'blur', () => { if (!document.hidden) this.emit({ type: 'window_blur', severity: 'medium', photo: true }, 'window_blur', 5000) })
    this.listen(document, 'fullscreenchange', () => { if (!document.fullscreenElement) this.emit({ type: 'fullscreen_exit', severity: 'medium', photo: true }, 'fullscreen', 5000) })
    for (const ev of ['copy', 'paste', 'cut', 'contextmenu'])
      this.listen(document, ev, () => this.emit({ type: 'copy_paste', severity: 'low', photo: false, details: { action: ev } }, 'copy', 5000))
    const stream = this.video.srcObject as MediaStream | null
    for (const track of stream?.getTracks() ?? [])
      track.addEventListener('ended', () => this.emit({ type: track.kind === 'video' ? 'camera_off' : 'mic_off', severity: 'high', photo: track.kind !== 'video' }, `${track.kind}_off`, 60_000))
  }

  // One-off checks before the interview starts
  startupChecks() {
    const stream = this.video.srcObject as MediaStream | null
    const label = stream?.getVideoTracks()[0]?.label ?? ''
    if (/obs|manycam|virtual|snap camera|xsplit|droidcam/i.test(label))
      this.emit({ type: 'virtual_camera', severity: 'medium', photo: true, details: { label } }, 'virtual', 1e9)
    if ((window.screen as any).isExtended)
      this.emit({ type: 'multiple_displays', severity: 'low', photo: false }, 'displays', 1e9)
  }

  stop() {
    clearInterval(this.timer)
    clearInterval(this.objTimer)
    for (const [t, ev, fn] of this.listeners) t.removeEventListener(ev, fn)
    this.listeners = []
    this.face?.close()
    this.objects?.close()
  }

  startAnswer() { this.inAnswer = true; this.answerFrames = 0; this.answerOnScreen = 0; this.lookAwayCount = 0 }
  endAnswer(): number | null {
    this.inAnswer = false
    return this.answerFrames > 5 ? Math.round((this.answerOnScreen / this.answerFrames) * 100) : null
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

  private listen(t: EventTarget, ev: string, fn: EventListener) { t.addEventListener(ev, fn); this.listeners.push([t, ev, fn]) }

  private cooldown: Record<string, number> = {}
  private emit(e: DetectedEvent, key: string, cooldownMs: number) {
    const now = Date.now()
    if ((this.cooldown[key] ?? 0) > now) return
    this.cooldown[key] = now + cooldownMs
    this.opts.onEvent(e)
  }

  // Tracks a condition; fires once when it has lasted `ms`, re-arms when it clears.
  private hold(key: string, active: boolean, ms: number, fire: (duration: number) => void) {
    const now = Date.now()
    if (!active) { delete this.since[key]; this.fired[key] = false; return false }
    this.since[key] ??= now
    const dur = now - this.since[key]
    if (dur >= ms && !this.fired[key]) { this.fired[key] = true; fire(dur); return true }
    return false
  }

  private onVisibility() {
    if (document.hidden) { this.hiddenAt = Date.now(); return }
    const away = Date.now() - this.hiddenAt
    // photo taken on return (the webcam is not visible while the tab is hidden)
    this.emit({ type: 'tab_switch', severity: away > T.tabHighMs ? 'high' : 'medium', durationMs: away, photo: true }, 'tab', 3000)
  }

  private faceTick() {
    const v = this.video
    if (!this.face || v.readyState < 2) return
    const res = this.face.detectForVideo(v, performance.now())
    const n = res.faceLandmarks.length
    this.opts.onFaceCount?.(n)
    this.hold('no_face', n === 0, T.noFaceMs, (d) => this.emit({ type: 'no_face', severity: 'medium', durationMs: d, photo: true }, 'no_face', 10_000))
    this.hold('multi', n > 1, T.multiFaceMs, (d) => this.emit({ type: 'multiple_faces', severity: 'high', durationMs: d, confidence: 0.9, details: { faces: n }, photo: true }, 'multi', 15_000))

    let away = false
    if (n >= 1) {
      const shapes = Object.fromEntries((res.faceBlendshapes[0]?.categories ?? []).map((c) => [c.categoryName, c.score]))
      this.mouthOpen = shapes.jawOpen ?? 0
      const m = res.facialTransformationMatrixes?.[0]?.data
      const pose = m ? headPose(Array.from(m)) : { yaw: 0, pitch: 0 }
      const eyes = Math.max(shapes.eyeLookOutLeft ?? 0, shapes.eyeLookOutRight ?? 0, shapes.eyeLookInLeft ?? 0, shapes.eyeLookInRight ?? 0,
        shapes.eyeLookDownLeft ?? 0, shapes.eyeLookDownRight ?? 0)
      away = Math.abs(pose.yaw) > T.yawDeg || Math.abs(pose.pitch) > T.pitchDeg || eyes > T.eyeLook
      if (this.inAnswer) { this.answerFrames++; if (!away) this.answerOnScreen++ }
      if (this.hold('away', away, T.lookAwayMs, (d) => this.emit({ type: 'looking_away', severity: this.lookAwayCount >= T.lookAwayRepeats ? 'medium' : 'low',
        durationMs: d, details: { yaw: Math.round(pose.yaw), pitch: Math.round(pose.pitch) }, photo: true }, 'away', 8000))) this.lookAwayCount++
    } else if (this.inAnswer) this.answerFrames++

    // Someone else talking: voice while the student's mouth is closed, or while the AI is speaking
    const vad = this.opts.vad
    const otherVoice = Boolean(vad?.speaking) && n >= 1 && (this.mouthOpen < T.mouthClosed || this.opts.isAiSpeaking())
    this.hold('voice', otherVoice, T.secondVoiceMs, (d) => this.emit({ type: 'second_voice', severity: 'high', durationMs: d, confidence: 0.6,
      details: { mouth_open: +this.mouthOpen.toFixed(2), ai_speaking: this.opts.isAiSpeaking() }, photo: true }, 'voice', 20_000))
  }

  private objectTick() {
    const v = this.video
    if (!this.objects || v.readyState < 2) return
    const res = this.objects.detectForVideo(v, performance.now())
    const phone = res.detections.find((d) => d.categories[0]?.categoryName === 'cell phone')
    const book = res.detections.find((d) => d.categories[0]?.categoryName === 'book')
    this.phoneFrames = phone ? this.phoneFrames + 1 : 0
    this.bookFrames = book ? this.bookFrames + 1 : 0
    const box = (d: any) => d?.boundingBox ? [d.boundingBox.originX, d.boundingBox.originY, d.boundingBox.width, d.boundingBox.height] : null
    if (this.phoneFrames === T.phoneFrames)
      this.emit({ type: 'phone_detected', severity: 'high', confidence: phone!.categories[0].score, durationMs: 2000,
        details: { model: 'efficientdet_lite0', label: 'cell phone', box: box(phone) }, photo: true }, 'phone', 15_000)
    if (this.bookFrames === T.bookFrames)
      this.emit({ type: 'book_or_notes', severity: 'medium', confidence: book!.categories[0].score, durationMs: 2000,
        details: { model: 'efficientdet_lite0', label: 'book', box: box(book) }, photo: true }, 'book', 15_000)
  }
}
