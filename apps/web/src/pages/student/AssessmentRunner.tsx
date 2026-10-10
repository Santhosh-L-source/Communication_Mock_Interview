import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, ErrorBox, Spinner, Textarea } from '../../components/ui'
import { SpokenAnswer } from '../../features/interview/SpokenAnswer'
import { speak, stopSpeaking } from '../../features/interview/audio'
import { AssessmentProctor, type ProctorEvent } from '../../features/proctoring/assessmentProctor'
import { api } from '../../lib/api'
import { cap } from '../../lib/format'

const MAX_PLAYS = 2

function ListeningClip({ script }: { script: string }) {
  const key = `plays:${script.slice(0, 40)}`
  const [plays, setPlays] = useState(() => Number(sessionStorage.getItem(key) ?? 0))
  const [playing, setPlaying] = useState(false)
  const play = async () => {
    const n = plays + 1
    setPlays(n)
    sessionStorage.setItem(key, String(n))
    setPlaying(true)
    await speak(script, 0.92)
    setPlaying(false)
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/10 p-3">
      <Button type="button" onClick={play} disabled={playing || plays >= MAX_PLAYS}>{playing ? 'Playing…' : 'Play audio'}</Button>
      {playing && <Button type="button" variant="ghost" onClick={() => { stopSpeaking(); setPlaying(false) }}>Stop</Button>}
      <span className="text-xs text-slate-300">{MAX_PLAYS - plays} play(s) left</span>
    </div>
  )
}

export function AssessmentRunner() {
  const { id } = useParams()
  const nav = useNavigate()
  const [data, setData] = useState<any>(null)
  const [answers, setAnswers] = useState<Record<string, { answer_text?: string | null; selected_option?: string | null }>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [current, setCurrent] = useState(0)
  const [warning, setWarning] = useState<string | null>(null)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const answersRef = useRef(answers)
  answersRef.current = answers
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const proctorRef = useRef<AssessmentProctor | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const eventQueue = useRef<Promise<unknown>>(Promise.resolve())

  const reportEvent = useCallback((e: ProctorEvent) => {
    eventQueue.current = eventQueue.current.then(async () => {
      const fd = new FormData()
      fd.append('event_type', e.type)
      fd.append('severity', e.severity)
      fd.append('occurred_at', new Date().toISOString())
      if (e.durationMs != null) fd.append('duration_ms', String(Math.round(e.durationMs)))
      fd.append('details', JSON.stringify(e.details ?? {}))
      if (e.photo && proctorRef.current) {
        const photo = await proctorRef.current.snapshot()
        if (photo) fd.append('photo', photo, 'evidence.jpg')
      }
      await api(`/attempts/${id}/proctor-events`, { form: fd }).catch(() => {})
    })
    const labels: Record<string, string> = { tab_switch: 'Tab switch detected', fullscreen_exit: 'Stay in fullscreen', copy_paste: 'Copy/paste detected', window_blur: 'Window focus lost', camera_off: 'Camera disconnected', mic_off: 'Microphone disconnected' }
    const msg = labels[e.type]
    if (msg) { setWarning(msg); setTimeout(() => setWarning(null), 4000) }
  }, [id])

  useEffect(() => {
    api(`/attempts/${id}`).then((d) => {
      if (d.attempt.status !== 'in_progress') return nav(`/attempts/${id}`, { replace: true })
      setData(d)
      setAnswers(Object.fromEntries(d.items.map((i: any) => [i.question_id, { answer_text: i.answer_text, selected_option: i.selected_option }])))
    }).catch((e) => setError(e.message))
  }, [id, nav])

  useEffect(() => {
    document.documentElement.requestFullscreen().catch(() => {})
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true }).then((stream) => {
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play().catch(() => {}) }
      const proctor = new AssessmentProctor(videoRef.current!, reportEvent)
      proctorRef.current = proctor
      proctor.start()
    }).catch(() => {})
    return () => {
      proctorRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [reportEvent])

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 200)
  }, [current])

  const flush = useCallback(async () => {
    const ids = [...dirtyRef.current]
    if (!ids.length) return
    setDirty(new Set())
    try {
      for (const qid of ids) await api(`/attempts/${id}/responses/${qid}`, { method: 'PUT', body: answersRef.current[qid] })
      setSaved(`Saved ${new Date().toLocaleTimeString()}`)
    } catch (e: any) {
      setDirty((d) => new Set([...d, ...ids]))
      setSaved(`Not saved (${e.message})`)
    }
  }, [id])

  useEffect(() => {
    const t = setInterval(flush, 10_000)
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const before = () => { flush() }
    window.addEventListener('beforeunload', before)
    return () => { clearInterval(t); clearInterval(tick); window.removeEventListener('beforeunload', before) }
  }, [flush])

  const setAnswer = (qid: string, patch: any) => {
    setAnswers((a) => ({ ...a, [qid]: { ...a[qid], ...patch } }))
    setDirty((d) => new Set(d).add(qid))
  }

  const items = useMemo(() => data?.items ?? [], [data])
  const it = items[current]

  if (error) return <div className="flex min-h-screen items-center justify-center bg-slate-900"><ErrorBox error={error} /></div>
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-slate-900 text-white"><Spinner /></div>

  const deadline = data.assessment ? new Date(data.attempt.started_at).getTime() + data.assessment.duration_min * 60_000 : null
  const remaining = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : null
  const answered = items.filter((i: any) => answers[i.question_id]?.selected_option != null || answers[i.question_id]?.answer_text || i.has_audio).length
  const wordCount = (answers[it?.question_id]?.answer_text ?? '').trim().split(/\s+/).filter(Boolean).length

  const goNext = () => {
    flush()
    if (current < items.length - 1) setCurrent(current + 1)
  }
  const goPrev = () => {
    flush()
    if (current > 0) setCurrent(current - 1)
  }

  const submit = async () => {
    if (answered < items.length && !confirm(`You answered ${answered} of ${items.length}. Submit anyway?`)) return
    setSubmitting(true)
    try {
      await flush()
      await api(`/attempts/${id}/submit`, { method: 'POST' })
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      nav(`/attempts/${id}`)
    } catch (e: any) { setError(e.message); setSubmitting(false) }
  }

  if (remaining != null && remaining <= 0 && !submitting) {
    submit()
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-900 text-white">
      {/* Warning toast */}
      {warning && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-lg animate-pulse">
          {warning}
        </div>
      )}

      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <video ref={videoRef} autoPlay muted playsInline className="h-10 w-14 rounded border border-white/20 object-cover" />
          <div className="font-semibold">{data.assessment?.title ?? 'Practice'}</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">{saved}</span>
          {remaining != null && (
            <Badge tone={remaining < 60 ? 'bad' : remaining < 300 ? 'warn' : 'info'}>
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </Badge>
          )}
          <Badge tone="info">{answered}/{items.length} answered</Badge>
          <Button variant="danger" onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Question nav sidebar */}
        <div className="hidden w-16 flex-col items-center gap-1 overflow-y-auto border-r border-white/10 py-3 md:flex">
          {items.map((_: any, i: number) => {
            const q = items[i]
            const done = answers[q.question_id]?.selected_option != null || answers[q.question_id]?.answer_text || q.has_audio
            return (
              <button key={i} onClick={() => { flush(); setCurrent(i) }}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition
                  ${i === current ? 'bg-brand-600 text-white' : done ? 'bg-emerald-600/30 text-emerald-300' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                {i + 1}
              </button>
            )
          })}
        </div>

        {/* Question area */}
        <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-8 md:px-12">
          <div className="w-full max-w-3xl space-y-6">
            {/* Question header */}
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-brand-600 px-3 py-1 text-sm font-bold">Q{current + 1}</span>
              <Badge>{cap(it.dimension)}</Badge>
              <Badge tone="neutral">{cap(it.sub_skill)}</Badge>
              <Badge tone="neutral">{cap(it.type)}</Badge>
            </div>

            {/* Passage / context */}
            {it.passage && it.dimension === 'reading' && (
              <div className="whitespace-pre-line rounded-lg bg-white/5 p-5 text-sm leading-relaxed text-slate-200">{it.passage}</div>
            )}
            {it.passage && it.dimension === 'listening' && <ListeningClip script={it.passage} />}
            {it.passage && it.dimension === 'writing' && (
              <details className="text-sm"><summary className="cursor-pointer text-brand-300">Show reference text</summary>
                <p className="mt-2 whitespace-pre-line rounded-lg bg-white/5 p-4 text-slate-200">{it.passage}</p></details>
            )}

            {/* Question prompt */}
            <p className="text-xl font-medium leading-relaxed">{it.prompt}</p>

            {/* Answer area */}
            <div className="space-y-3">
              {(it.type === 'mcq' || it.type === 'listening_mcq') && (
                <div className="space-y-2">
                  {(it.options ?? []).map((o: string, oi: number) => (
                    <label key={oi}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 text-sm transition
                        ${answers[it.question_id]?.selected_option === String(oi)
                          ? 'border-brand-500 bg-brand-600/20 text-white'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}>
                      <input type="radio" name={it.question_id}
                        checked={answers[it.question_id]?.selected_option === String(oi)}
                        onChange={() => setAnswer(it.question_id, { selected_option: String(oi) })}
                        className="mt-0.5" />
                      <span>{o}</span>
                    </label>
                  ))}
                </div>
              )}

              {(it.type === 'short_text' || it.type === 'long_text') && (
                <div>
                  <Textarea
                    ref={textareaRef}
                    rows={it.type === 'long_text' ? 12 : 6}
                    value={answers[it.question_id]?.answer_text ?? ''}
                    onChange={(e) => setAnswer(it.question_id, { answer_text: e.target.value })}
                    onBlur={flush}
                    onPaste={(e) => { if (!confirm('Pasting text is recorded. Continue?')) e.preventDefault() }}
                    placeholder="Type your answer here..."
                    className="w-full rounded-lg border border-white/10 bg-white/5 p-4 text-base text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <div className="mt-2 text-right text-sm text-slate-400">{wordCount} words</div>
                </div>
              )}

              {it.type === 'spoken' && (
                <SpokenAnswer hasAudio={it.has_audio} maxSeconds={it.time_limit_s ?? 120} prompt={it.prompt} onRecorded={async (blob, dur, caption) => {
                  const fd = new FormData()
                  fd.append('audio', blob, 'answer.webm')
                  fd.append('duration_s', String(Math.round(dur)))
                  fd.append('caption', caption)
                  await api(`/attempts/${id}/responses/${it.question_id}/audio`, { form: fd })
                }} />
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-4">
              <Button variant="secondary" onClick={goPrev} disabled={current === 0}>Previous</Button>
              <span className="text-sm text-slate-400">Question {current + 1} of {items.length}</span>
              {current < items.length - 1
                ? <Button onClick={goNext}>Next</Button>
                : <Button variant="danger" onClick={submit} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit assessment'}</Button>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
