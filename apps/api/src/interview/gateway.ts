// Interview room over Socket.IO. The browser speaks the AI's questions (speechSynthesis), records each answer
// and sends it as one audio file; the server transcribes it (Whisper), scores delivery, saves the turn and
// asks the AI interviewer what comes next. The server's transcript is the one that counts.
import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import { transcribe, mockTranscript } from '../ai/stt'
import { aiEnabled, config } from '../config'
import { userFromToken, type AuthUser } from '../auth'
import { one, q } from '../db'
import { logger } from '../lib/logger'
import { speechMetrics } from '../scoring/speech'
import { putObject } from '../storage'
import { endInterview } from './finalize'
import { CLOSING, decideNext, greeting, interviewProgress, type PlannedQuestion, type TurnLite } from './interviewer'
import { setIo } from './live'

const busy = new Set<string>()
const disconnectTimers = new Map<string, NodeJS.Timeout>()
const randomTimers = new Map<string, NodeJS.Timeout>()
const sessionTimers = new Map<string, NodeJS.Timeout>()
const MAX_AUDIO_BYTES = 8 * 1024 * 1024

const offsetMs = (session: any, iso?: string | number) =>
  Math.max(0, new Date(iso ?? Date.now()).getTime() - new Date(session.started_at).getTime())

async function saveAiTurn(session: any, seq: number, text: string, questionId: string | null, isFollowUp: boolean) {
  const start = offsetMs(session)
  const dbQuestionId = questionId && !questionId.startsWith('builtin-') ? questionId : null
  // builtin (non-bank) questions keep their plan id in metrics so progress tracking still works
  await q(`insert into interview_turns (session_id, seq, speaker, question_id, is_follow_up, text, started_ms, ended_ms, metrics)
           values ($1,$2,'ai',$3,$4,$5,$6,$7,$8) on conflict (session_id, seq) do nothing`,
    [session.id, seq, dbQuestionId, isFollowUp, text, start, start + Math.round(text.split(/\s+/).length / 2.5 * 1000),
      JSON.stringify({ plan_id: questionId })])
}

async function turnsWithPlanIds(sessionId: string): Promise<TurnLite[]> {
  const rows = await q(`select seq, speaker, text, coalesce(question_id::text, metrics->>'plan_id') as question_id, is_follow_up
                          from interview_turns where session_id = $1 order by seq`, [sessionId])
  return rows
}

function questionPayload(plan: PlannedQuestion[], turns: TurnLite[], seq: number, text: string, isFollowUp: boolean) {
  const { askedCount } = interviewProgress(plan, turns)
  return { seq, text, is_follow_up: isFollowUp, number: askedCount, total: plan.length }
}

function scheduleRandomCheck(sessionId: string, io: Server) {
  clearTimeout(randomTimers.get(sessionId))
  const delay = 60_000 + Math.random() * 60_000
  randomTimers.set(sessionId, setTimeout(async () => {
    const s = await one(`select status from interview_sessions where id = $1`, [sessionId])
    if (s?.status !== 'in_progress') return randomTimers.delete(sessionId)
    io.to(`session:${sessionId}`).emit('proctor:request_snapshot', { reason: 'random_check' })
    scheduleRandomCheck(sessionId, io)
  }, delay))
}

async function start(socket: Socket, user: AuthUser, sessionId: string, io: Server) {
  let session = await one(`select s.*, p.target_roles from interview_sessions s join profiles p on p.id = s.student_id where s.id = $1`, [sessionId])
  if (!session || session.student_id !== user.id) throw new Error('Interview not found')
  if (!['setup', 'in_progress'].includes(session.status)) throw new Error('This interview has already ended')
  if (session.status === 'setup')
    session = { ...session, ...(await one(`update interview_sessions set status = 'in_progress', started_at = now() where id = $1 returning status, started_at`, [sessionId])) }

  socket.join(`session:${sessionId}`)
  clearTimeout(disconnectTimers.get(sessionId))
  scheduleRandomCheck(sessionId, io)

  const durationMs = (session.duration_min ?? 10) * 60_000
  const elapsedMs = session.started_at ? Date.now() - new Date(session.started_at).getTime() : 0
  const remainingMs = Math.max(0, durationMs - elapsedMs)
  socket.emit('interview:timer', { total_ms: durationMs, remaining_ms: remainingMs })
  if (!sessionTimers.has(sessionId) && remainingMs > 0) {
    sessionTimers.set(sessionId, setTimeout(async () => {
      sessionTimers.delete(sessionId)
      const s = await one(`select status from interview_sessions where id = $1`, [sessionId])
      if (s?.status === 'in_progress') {
        io.to(`session:${sessionId}`).emit('ai:question', { seq: 9999, text: CLOSING, is_follow_up: false, final: true })
        await endInterview(sessionId, 'time_limit')
      }
    }, remainingMs))
  }

  const plan: PlannedQuestion[] = session.plan
  const turns = await turnsWithPlanIds(sessionId)
  const last = turns.at(-1)
  if (!last) {
    const text = greeting(session.interview_type, plan, session.duration_min)
    await saveAiTurn(session, 1, text, plan[0].id, false)
    const after = await turnsWithPlanIds(sessionId)
    socket.emit('ai:question', questionPayload(plan, after, 1, text, false))
  } else if (last.speaker === 'ai') {
    socket.emit('ai:question', questionPayload(plan, turns, last.seq, last.text, last.is_follow_up)) // reconnect: repeat it
  }
  return session
}

async function handleAnswer(socket: Socket, session: any, payload: any) {
  const sessionId = session.id
  if (busy.has(sessionId)) throw new Error('Still processing the previous answer')
  busy.add(sessionId)
  try {
    const fresh = await one(`select status from interview_sessions where id = $1`, [sessionId])
    if (fresh?.status !== 'in_progress') throw new Error('Interview is not live')
    const turns = await turnsWithPlanIds(sessionId)
    if (turns.at(-1)?.speaker !== 'ai') throw new Error('No question is waiting for an answer')
    const seq = turns.length + 1
    const audio: Buffer | null = payload.audio ? Buffer.from(payload.audio) : null
    if (audio && audio.length > MAX_AUDIO_BYTES) throw new Error('Answer recording is too large')
    const mime = String(payload.mime ?? 'audio/webm')
    const startedAt = payload.started_at ?? Date.now() - 30_000
    const endedAt = payload.ended_at ?? Date.now()
    const durationS = Math.max(1, (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    const caption = typeof payload.caption === 'string' ? payload.caption.slice(0, 5000) : ''

    socket.emit('ai:thinking', { seq })

    // Phase 1: upload audio and transcribe in parallel
    const uploadPromise = audio?.length
      ? putObject(`recordings/${session.register_no}/${sessionId}/${seq}.webm`, audio, mime, true)
      : Promise.resolve(null)

    // Detect if student actually spoke - check audio size and caption length
    const hasActualSpeech = audio && audio.length > 5000 // Minimum 5KB audio
    const hasCaptionText = caption && caption.trim().length > 3 // At least 3 characters

    const transcribePromise = hasActualSpeech && aiEnabled() && (config.GROQ_API_KEY || config.LOCAL_WHISPER_URL)
      ? transcribe(audio, mime, { durationS, sessionId }).catch((e) => {
          logger.warn({ e: e.message }, 'transcription failed; using browser caption')
          // If transcription fails but we have browser caption, use it
          return mockTranscript(durationS, hasCaptionText ? caption : '')
        })
      : Promise.resolve(mockTranscript(durationS, hasCaptionText ? caption : ''))
    const [audioPath, t] = await Promise.all([uploadPromise, transcribePromise])

    const metrics = speechMetrics(t.words, t.text)
    const gaze = typeof payload.gaze_pct === 'number' ? Math.max(0, Math.min(100, payload.gaze_pct)) : null

    // If student said nothing or very little, mark as no speech
    const actualText = t.text && t.text.trim().length > 2 ? t.text : '(no speech detected)'
    socket.emit('transcript:final', { seq, text: actualText, metrics: { wpm: metrics.wpm, fillers_per_min: metrics.fillers_per_min } })

    // Phase 2: DB insert and AI decision in parallel — AI uses in-memory turns, doesn't need the write to finish
    const insertPromise = q(`insert into interview_turns (session_id, seq, speaker, text, audio_path, started_ms, ended_ms, words, metrics)
             values ($1,$2,'student',$3,$4,$5,$6,$7,$8)`,
      [sessionId, seq, actualText, audioPath, offsetMs(session, startedAt), offsetMs(session, endedAt),
        JSON.stringify(t.words.map((w) => ({ ...w, filler: metrics.filler_words.includes(w.w.toLowerCase()) }))),
        JSON.stringify({ speech: metrics, gaze_on_screen_pct: gaze, stt_model: t.model })])
    const all: TurnLite[] = [...turns, { seq, speaker: 'student', text: actualText, question_id: null, is_follow_up: false }]
    const [, next] = await Promise.all([
      insertPromise,
      decideNext({ type: session.interview_type, targetRoles: session.target_roles ?? [], plan: session.plan, turns: all, sessionId,
        startedAt: session.started_at, durationMin: session.duration_min ?? 10 }),
    ])
    const aiSeq = seq + 1
    if (next.action === 'end') {
      clearTimeout(sessionTimers.get(sessionId))
      sessionTimers.delete(sessionId)
      await saveAiTurn(session, aiSeq, next.text || CLOSING, null, false)
      socket.emit('ai:question', { seq: aiSeq, text: next.text || CLOSING, is_follow_up: false, final: true })
      await endInterview(sessionId, 'completed')
    } else {
      await saveAiTurn(session, aiSeq, next.text, next.question_id ?? null, next.action === 'follow_up')
      const after = await turnsWithPlanIds(sessionId)
      socket.emit('ai:question', questionPayload(session.plan, after, aiSeq, next.text, next.action === 'follow_up'))
    }
  } finally {
    busy.delete(sessionId)
  }
}

export function attachInterviewGateway(httpServer: HttpServer, corsOrigins: string[]) {
  const io = new Server(httpServer, { cors: { origin: corsOrigins, credentials: true }, maxHttpBufferSize: MAX_AUDIO_BYTES + 100_000 })
  setIo(io)

  io.on('connection', async (socket) => {
    let user: AuthUser
    try {
      user = await userFromToken(socket.handshake.auth?.token)
    } catch {
      socket.emit('error:fatal', { message: 'Please log in again.' })
      return socket.disconnect(true)
    }
    if (user.role !== 'student') socket.join('staff')
    const sessionId = socket.handshake.auth?.sessionId as string | undefined
    if (!sessionId) return // staff dashboards connect without a session for live alerts

    let session: any
    try {
      session = await start(socket, user, sessionId, io)
    } catch (e: any) {
      socket.emit('error:fatal', { message: e.message })
      return socket.disconnect(true)
    }

    socket.on('answer', async (payload, ack) => {
      try {
        await handleAnswer(socket, session, payload ?? {})
        ack?.({ ok: true })
      } catch (e: any) {
        logger.warn({ e: e.message, sessionId }, 'answer failed')
        ack?.({ ok: false, error: e.message })
      }
    })

    socket.on('end', async (_payload, ack) => {
      clearTimeout(sessionTimers.get(sessionId))
      sessionTimers.delete(sessionId)
      const turns = await turnsWithPlanIds(sessionId)
      const { remaining } = interviewProgress(session.plan, turns)
      await endInterview(sessionId, remaining.length ? 'student_left' : 'completed')
      ack?.({ ok: true })
    })

    socket.on('disconnect', async () => {
      const room = io.sockets.adapter.rooms.get(`session:${sessionId}`)
      if (room?.size) return
      // Give the student 2 minutes to reconnect (refresh, network drop) before closing the session
      disconnectTimers.set(sessionId, setTimeout(async () => {
        disconnectTimers.delete(sessionId)
        if (io.sockets.adapter.rooms.get(`session:${sessionId}`)?.size) return
        clearTimeout(randomTimers.get(sessionId))
        clearTimeout(sessionTimers.get(sessionId))
        sessionTimers.delete(sessionId)
        await endInterview(sessionId, 'student_left')
      }, 120_000))
    })
  })
  return io
}
