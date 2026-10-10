import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import { Badge, Button, ErrorBox } from '../../components/ui'
import { AnswerRecorder, LiveCaptions, speak, stopSpeaking, VoiceActivity } from '../../features/interview/audio'
import { ProctorEngine, type DetectedEvent } from '../../features/proctoring/engine'
import { accessToken, api } from '../../lib/api'
import { API_URL } from '../../lib/supabase'

type Phase = 'ready' | 'connecting' | 'ai_speaking' | 'listening' | 'processing' | 'ended'
interface Line { seq: number; who: 'ai' | 'you'; text: string }

const MAX_ANSWER_S = 120
const END_SILENCE_MS = 3000
const NO_SPEECH_MS = 25_000

export function InterviewRoom() {
  const { id } = useParams()
  const nav = useNavigate()
  const video = useRef<HTMLVideoElement>(null)
  const [phase, setPhase] = useState<Phase>('ready')
  const [lines, setLines] = useState<Line[]>([])
  const [caption, setCaption] = useState('')
  const [progress, setProgress] = useState<{ number?: number; total?: number }>({})
  const [warning, setWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [faces, setFaces] = useState(1)

  const refs = useRef({
    socket: null as Socket | null, stream: null as MediaStream | null, vad: null as VoiceActivity | null, engine: null as ProctorEngine | null,
    recorder: new AnswerRecorder(), captions: new LiveCaptions(), aiSpeaking: false, answerTimer: 0, eventQueue: Promise.resolve() as Promise<unknown>,
    pendingSeq: 0, ended: false,
  })
  const r = refs.current

  useEffect(() => () => cleanup(), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== 'listening') return
    const t = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(t)
  }, [phase])
  useEffect(() => {
    if (timeLeft == null || timeLeft <= 0 || phase === 'ready' || phase === 'ended') return
    const t = setInterval(() => setTimeLeft((v) => v != null && v > 0 ? v - 1 : 0), 1000)
    return () => clearInterval(t)
  }, [timeLeft != null && timeLeft > 0, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function cleanup() {
    clearInterval(r.answerTimer)
    stopSpeaking()
    r.captions.stop()
    r.engine?.stop()
    r.vad?.close()
    r.socket?.close()
    r.stream?.getTracks().forEach((t) => t.stop())
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }

  // Anti-cheat events go to the API one at a time, with a webcam photo when the rule says so.
  function report(e: DetectedEvent) {
    r.eventQueue = r.eventQueue.then(async () => {
      if (r.ended) return
      const fd = new FormData()
      fd.append('event_type', e.type)
      fd.append('severity', e.severity)
      if (e.confidence != null) fd.append('confidence', String(Math.min(1, e.confidence)))
      fd.append('occurred_at', new Date().toISOString())
      if (e.durationMs != null) fd.append('duration_ms', String(Math.round(e.durationMs)))
      fd.append('details', JSON.stringify(e.details ?? {}))
      if (e.photo) { const photo = await r.engine?.snapshot(); if (photo) fd.append('photo', photo, 'evidence.jpg') }
      await api(`/interviews/${id}/proctor-events`, { form: fd }).catch(() => {})
    })
  }

  async function begin() {
    setError(null)
    setPhase('connecting')
    try {
      await document.documentElement.requestFullscreen().catch(() => {})
      r.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: { echoCancellation: true, noiseSuppression: true } })
      video.current!.srcObject = r.stream
      await video.current!.play().catch(() => {})
      r.vad = new VoiceActivity(r.stream)
      r.engine = new ProctorEngine(video.current!, { onEvent: report, vad: r.vad, isAiSpeaking: () => r.aiSpeaking, onFaceCount: setFaces })
      await r.engine.init()
      // Reference photo for identity checks + device info
      const ref = await r.engine.snapshot()
      if (ref) { const fd = new FormData(); fd.append('photo', ref, 'enrolled.jpg'); await api(`/interviews/${id}/enroll-face`, { form: fd }).catch(() => {}) }
      await api(`/interviews/${id}/device`, { body: { ua: navigator.userAgent, camera: r.stream.getVideoTracks()[0]?.label,
        screen: `${screen.width}x${screen.height}`, extended: (screen as any).isExtended ?? null, vision_models: r.engine.modelsReady } }).catch(() => {})
      r.engine.start()
      r.engine.startupChecks()
      connect()
    } catch (e: any) {
      setError(e.name === 'NotAllowedError' ? 'Camera and microphone permission is required.' : e.message)
      setPhase('ready')
    }
  }

  async function connect() {
    const socket = io(API_URL, { auth: { token: await accessToken(), sessionId: id }, transports: ['websocket'], reconnectionAttempts: 10 })
    r.socket = socket
    socket.on('connect_error', () => setWarning('Connection problem. Reconnecting…'))
    socket.on('connect', () => setWarning(null))
    socket.on('error:fatal', (e) => { setError(e.message); setPhase('ended') })
    socket.on('interview:timer', (t: { remaining_ms: number }) => {
      setTimeLeft(Math.ceil(t.remaining_ms / 1000))
    })
    socket.on('ai:question', async (q) => {
      if (q.seq <= r.pendingSeq && !q.final) return // duplicate after reconnect
      r.pendingSeq = q.seq
      setLines((l) => l.some((x) => x.seq === q.seq) ? l : [...l, { seq: q.seq, who: 'ai' as const, text: q.text }])
      if (q.number) setProgress({ number: q.number, total: q.total })
      setPhase('ai_speaking')
      r.aiSpeaking = true
      await speak(q.text)
      r.aiSpeaking = false
      if (!q.final && !r.ended) startListening()
    })
    socket.on('ai:thinking', () => setPhase('processing'))
    socket.on('transcript:final', (t) => setLines((l) => [...l.filter((x) => !(x.who === 'you' && x.seq === t.seq)), { seq: t.seq, who: 'you' as const, text: t.text }].sort((a, b) => a.seq - b.seq)))
    socket.on('proctor:warning', (w) => { setWarning(w.message); setTimeout(() => setWarning(null), 6000) })
    socket.on('proctor:request_snapshot', () => report({ type: 'random_check', severity: 'info', photo: true }))
    socket.on('interview:ended', (e) => {
      r.ended = true
      setPhase('ended')
      cleanup()
      setTimeout(() => nav(`/interviews/${id}/report`, { state: { reason: e.reason } }), 2500)
    })
  }

  function startListening() {
    setCaption('')
    setElapsed(0)
    setPhase('listening')
    r.recorder.start(r.stream!)
    r.captions.onUpdate = setCaption
    r.captions.start()
    r.engine?.startAnswer()
    const startedAt = Date.now()
    let spoke = false
    clearInterval(r.answerTimer)
    r.answerTimer = window.setInterval(() => {
      const vad = r.vad!
      if (vad.lastVoiceAt > startedAt + 300) spoke = true
      const long = Date.now() - startedAt > MAX_ANSWER_S * 1000
      const doneTalking = spoke && Date.now() - startedAt > 4000 && vad.silenceMs() > END_SILENCE_MS
      const silentTooLong = !spoke && Date.now() - startedAt > NO_SPEECH_MS
      if (long || doneTalking || silentTooLong) finishAnswer()
    }, 250)
  }

  async function finishAnswer() {
    clearInterval(r.answerTimer)
    if (!r.recorder.recording) return
    setPhase('processing')
    const captionText = r.captions.stop()
    const gaze = r.engine?.endAnswer() ?? null
    const { blob, mime, startedAt, endedAt } = await r.recorder.stop()
    const res: any = await r.socket!.timeout(60_000).emitWithAck('answer', {
      audio: await blob.arrayBuffer(), mime, started_at: startedAt, ended_at: endedAt, gaze_pct: gaze, caption: captionText,
    }).catch((e: any) => ({ ok: false, error: e.message }))
    if (!res.ok) { setWarning(`Your answer was not received (${res.error ?? 'timeout'}). Please answer again.`); startListening() }
  }

  async function endEarly() {
    if (!confirm('End the interview now? Unanswered questions will count as missing.')) return
    r.ended = true
    await r.socket?.timeout(20_000).emitWithAck('end', {}).catch(() => {})
    cleanup()
    nav(`/interviews/${id}/report`)
  }

  const last = [...lines].reverse().find((l) => l.who === 'ai')
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-900 text-white">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="font-semibold">SpeakReady interview</div>
        <div className="flex items-center gap-2">
          {timeLeft != null && <Badge tone={timeLeft < 60 ? 'bad' : timeLeft < 120 ? 'warn' : 'info'}>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</Badge>}
          {progress.number && <Badge tone="info">Question {progress.number} of {progress.total}</Badge>}
          {faces !== 1 && phase !== 'ready' && <Badge tone="bad">{faces === 0 ? 'Face not visible' : 'More than one face'}</Badge>}
          {phase !== 'ready' && phase !== 'ended' && <Button variant="danger" onClick={endEarly}>End interview</Button>}
        </div>
      </div>
      {warning && <div className="bg-amber-500 px-4 py-2 text-center text-sm font-medium text-slate-900" role="alert">{warning}</div>}
      <div className="grid flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col items-center justify-center gap-6">
          {phase === 'ready' ? (
            <div className="max-w-lg text-center">
              <h1 className="mb-3 text-2xl font-bold">Ready when you are</h1>
              <p className="mb-6 text-slate-300">The interview opens in full screen. The AI will greet you and ask the first question aloud. Answer naturally,
                then pause for 3 seconds or press "I'm done".</p>
              <ErrorBox error={error} />
              <Button className="mt-4 px-8 py-3 text-base" onClick={begin}>Start interview</Button>
            </div>
          ) : (
            <>
              <div className={`flex h-28 w-28 items-center justify-center rounded-full text-5xl ${phase === 'ai_speaking' ? 'animate-pulse bg-brand-600' : 'bg-slate-700'}`} aria-hidden>🤖</div>
              <p className="max-w-2xl text-center text-xl leading-relaxed">{last?.text ?? 'Connecting to your interviewer…'}</p>
              <div className="h-16 text-center">
                {phase === 'listening' && (<>
                  <div className="mb-2 flex items-center justify-center gap-2 text-sm text-red-300"><span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />Listening · {elapsed}s</div>
                  <Button onClick={finishAnswer}>I'm done</Button>
                </>)}
                {phase === 'processing' && <p className="text-sm text-slate-300">Thinking about your answer…</p>}
                {phase === 'ended' && <p className="text-sm text-slate-300">Interview finished. Opening your report…</p>}
                {error && phase === 'ended' && <ErrorBox error={error} />}
              </div>
              {phase === 'listening' && caption && <p className="max-w-2xl text-center text-sm italic text-slate-400">{caption}</p>}
            </>
          )}
        </div>
        <aside className="flex min-h-0 flex-col gap-3">
          <video ref={video} muted playsInline className="aspect-video w-full rounded-lg bg-black object-cover" />
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-white/5 p-3" aria-live="polite">
            <h2 className="mb-2 text-xs uppercase tracking-wide text-slate-400">Transcript</h2>
            {lines.map((l) => <p key={`${l.who}-${l.seq}`} className="mb-2 text-sm"><b className={l.who === 'ai' ? 'text-brand-100' : 'text-emerald-300'}>{l.who === 'ai' ? 'Interviewer' : 'You'}:</b> {l.text}</p>)}
          </div>
          <p className="text-[11px] text-slate-500">Monitoring is on. Only still photos of unusual events are saved for review.</p>
        </aside>
      </div>
    </div>
  )
}
