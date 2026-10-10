// Anti-cheat evidence: photo + transcript around the moment, stored by Node only (students cannot touch it).
import crypto from 'node:crypto'
import type { ProctorEventType } from '@speakready/shared'
import { config } from '../config'
import { one, q } from '../db'
import { enqueue } from '../jobs/boss'
import { HttpError } from '../lib/errors'
import { notify } from '../lib/notify'
import { effectivePenalty, recomputeIntegrity, type Severity } from '../scoring/integrity'
import { putObject } from '../storage'
import { emitToSession, emitToStaff } from './live'

const WARNINGS: Partial<Record<ProctorEventType, string>> = {
  no_face: 'Please keep your face in view of the camera.',
  multiple_faces: 'Only you should be visible during the interview.',
  looking_away: 'Please look at the screen while you answer.',
  phone_detected: 'Please put your phone away.',
  book_or_notes: 'Please put away books and notes.',
  second_voice: 'It sounds like someone else is speaking. Please make sure you are alone.',
  tab_switch: 'Please stay on the interview tab.',
  window_blur: 'Please keep the interview window active.',
  fullscreen_exit: 'Please return to full screen.',
  camera_off: 'Your camera stopped. Please turn it back on.',
  mic_off: 'Your microphone stopped. Please turn it back on.',
}

const recent = new Map<string, number[]>() // session -> timestamps, for rate limiting

export async function transcriptExcerpt(sessionId: string, offsetMs: number) {
  const turns = await q<{ speaker: string; text: string; started_ms: number | null; ended_ms: number | null }>(
    `select speaker, text, started_ms, ended_ms from interview_turns where session_id = $1 order by seq`, [sessionId])
  const inWindow = turns.filter((t) => (t.ended_ms ?? t.started_ms ?? 0) >= offsetMs - 60_000 && (t.started_ms ?? 0) <= offsetMs + 10_000)
  const lastQuestion = [...turns].reverse().find((t) => t.speaker === 'ai' && (t.started_ms ?? 0) <= offsetMs)
  const list = lastQuestion && !inWindow.includes(lastQuestion) ? [lastQuestion, ...inWindow] : inWindow
  return list.map((t) => ({ speaker: t.speaker, offset_ms: t.started_ms, text: t.text }))
}
const excerptText = (ex: { speaker: string; text: string }[]) =>
  ex.map((t) => `${t.speaker === 'ai' ? 'Interviewer' : 'Student'}: ${t.text}`).join('\n').slice(0, 4000)

export async function recordProctorEvent(session: any, input: {
  event_type: ProctorEventType; severity: Severity; confidence?: number; occurred_at: string; duration_ms?: number; details?: any
}, photo?: Buffer, detectedBy: 'browser' | 'server' = 'browser') {
  if (!['in_progress'].includes(session.status)) throw new HttpError(409, 'Interview is not live')
  const now = Date.now()
  const times = (recent.get(session.id) ?? []).filter((t) => now - t < 60_000)
  if (times.length >= 30) throw new HttpError(429, 'Too many events')
  recent.set(session.id, [...times, now])
  if (photo && photo.length > 300 * 1024) throw new HttpError(413, 'Photo too large (max 300 KB)')

  const occurred = new Date(input.occurred_at)
  // Repeats of the same type within 30 s merge into one event
  if (input.event_type !== 'random_check') {
    const merged = await one(
      `update proctoring_events set duration_ms = coalesce(duration_ms, 0) + coalesce($3, 0)
        where id = (select id from proctoring_events where session_id = $1 and event_type = $2
                     and occurred_at > $4::timestamptz - interval '30 seconds' order by occurred_at desc limit 1)
        returning id`, [session.id, input.event_type, input.duration_ms ?? 0, occurred.toISOString()])
    if (merged) return { id: merged.id, merged: true }
  }

  const id = crypto.randomUUID()
  const offsetMs = session.started_at ? Math.max(0, occurred.getTime() - new Date(session.started_at).getTime()) : null
  const excerpt = offsetMs != null ? await transcriptExcerpt(session.id, offsetMs) : []
  const base = `proctoring-evidence/${session.register_no}/${session.id}/${id}`
  const snapshotPath = photo ? await putObject(`${base}.jpg`, photo, 'image/jpeg') : null
  const lastQ = [...excerpt].reverse().find((t) => t.speaker === 'ai')
  const evidence = {
    event_id: id, session_id: session.id, register_no: session.register_no, type: input.event_type, severity: input.severity,
    confidence: input.confidence ?? null, detected_by: detectedBy, occurred_at: occurred.toISOString(), offset_ms: offsetMs,
    duration_ms: input.duration_ms ?? null, question: lastQ?.text ?? null, transcript_excerpt: excerpt,
    detector: input.details ?? {}, photo_path: snapshotPath,
  }
  const evidencePath = await putObject(`${base}.json`, JSON.stringify(evidence, null, 2), 'application/json', true)
  const penalty = effectivePenalty(input.severity, null)
  await q(`insert into proctoring_events (id, session_id, register_no, event_type, severity, confidence, detected_by, occurred_at,
             offset_ms, duration_ms, snapshot_path, evidence_json_path, transcript_excerpt, details, penalty)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, session.id, session.register_no, input.event_type, input.severity, input.confidence ?? null, detectedBy, occurred.toISOString(),
      offsetMs, input.duration_ms ?? null, snapshotPath, evidencePath, excerptText(excerpt), JSON.stringify(input.details ?? {}), penalty])
  const integrity = await recomputeIntegrity(session.id)
  if (snapshotPath) await enqueue('verify_evidence', { eventId: id })

  const warning = WARNINGS[input.event_type]
  if (warning) emitToSession(session.id, 'proctor:warning', { type: input.event_type, message: warning })

  if (input.severity === 'high') {
    const open = await one(`select id from alerts where session_id = $1 and kind = 'integrity' and status = 'open'`, [session.id])
    if (!open) {
      await q(`insert into alerts (student_id, kind, session_id, severity, reason) values ($1,'integrity',$2,'high',$3)`,
        [session.student_id, session.id, `High-severity anti-cheat event: ${input.event_type.replaceAll('_', ' ')}`])
      const admins = await q(`select id from profiles where role = 'admin'`)
      for (const a of admins) await notify(a.id, 'Live integrity alert', `${session.register_no}: ${input.event_type}`, `/staff/integrity/${session.id}`)
    }
    emitToStaff('integrity:event', { session_id: session.id, register_no: session.register_no, type: input.event_type })
    const highs = await one(`select count(*)::int as n from proctoring_events where session_id = $1 and severity = 'high'
                              and coalesce(ai_verdict, 'uncertain') <> 'rejected'`, [session.id])
    if (config.TERMINATE_AFTER_HIGH_EVENTS > 0 && highs!.n >= config.TERMINATE_AFTER_HIGH_EVENTS) {
      const { endInterview } = await import('./finalize')
      await endInterview(session.id, 'integrity_terminated')
    }
  }
  return { id, merged: false, integrity }
}

// At the end, rebuild each event's transcript excerpt now that every answer is transcribed.
export async function refreshExcerpts(sessionId: string) {
  const events = await q(`select * from proctoring_events where session_id = $1 and offset_ms is not null`, [sessionId])
  for (const e of events) {
    const excerpt = await transcriptExcerpt(sessionId, e.offset_ms)
    await q(`update proctoring_events set transcript_excerpt = $2 where id = $1`, [e.id, excerptText(excerpt)])
    if (e.evidence_json_path) {
      const lastQ = [...excerpt].reverse().find((t) => t.speaker === 'ai')
      await putObject(e.evidence_json_path, JSON.stringify({
        event_id: e.id, session_id: sessionId, register_no: e.register_no, type: e.event_type, severity: e.severity,
        confidence: e.confidence, detected_by: e.detected_by, occurred_at: e.occurred_at, offset_ms: e.offset_ms,
        duration_ms: e.duration_ms, question: lastQ?.text ?? null, transcript_excerpt: excerpt, detector: e.details,
        photo_path: e.snapshot_path,
      }, null, 2), 'application/json', true)
    }
  }
}
