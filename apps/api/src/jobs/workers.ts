import crypto from 'node:crypto'
import { verifyPhoto } from '../ai/vision'
import { runCoach } from '../coach/agent'
import { config } from '../config'
import { q, one } from '../db'
import { logger } from '../lib/logger'
import { notify } from '../lib/notify'
import { finalizeAttemptIfDone } from '../modules/attemptsService'
import { buildReports } from '../modules/externalService'
import { evaluateResponse, scoreInterview } from '../scoring/evaluate'
import { effectivePenalty, recomputeIntegrity } from '../scoring/integrity'
import { recalcReadiness } from '../scoring/readiness'
import { getObject, removeObjects } from '../storage'
import { enqueue, startBoss, type QueueName } from './boss'

type Handler = (data: any, meta: { retryCount: number; retryLimit: number }) => Promise<void>

export const handlers: Record<QueueName, Handler> = {
  async evaluate_response({ responseId, attemptId }, meta) {
    await evaluateResponse(responseId, { allowPartial: meta.retryCount >= meta.retryLimit })
    await finalizeAttemptIfDone(attemptId)
  },

  async score_interview({ sessionId }, meta) {
    await scoreInterview(sessionId, { allowPartial: meta.retryCount >= meta.retryLimit })
    const s = await one(`select student_id, register_no from interview_sessions where id = $1`, [sessionId])
    await recalcReadiness(s.student_id, `interview:${sessionId}`)
    await notify(s.student_id, 'Your interview report is ready', undefined, `/interviews/${sessionId}/report`)
    await enqueue('coach_run', { studentId: s.student_id, trigger: 'evaluation_completed', key: `interview:${sessionId}`, sessionId })
    await enqueue('webhook_deliver', { registerNo: s.register_no })
  },

  async verify_evidence({ eventId }) {
    const e = await one(`select * from proctoring_events where id = $1`, [eventId])
    if (!e?.snapshot_path) return
    const photo = await getObject(e.snapshot_path)
    if (!photo) return
    const verdict = await verifyPhoto(photo, e.event_type, e.session_id)
    if (!verdict) return // no self-hosted vision model: the event stays unverified and an admin decides
    await q(`update proctoring_events set ai_verdict = $2, ai_verdict_detail = $3, penalty = $4 where id = $1`,
      [eventId, verdict.verdict, JSON.stringify(verdict), effectivePenalty(e.severity, verdict.verdict)])
    await recomputeIntegrity(e.session_id)
  },

  async coach_run({ studentId, trigger, key, attemptId, sessionId }) {
    await runCoach(studentId, trigger, key, { attemptId, sessionId })
  },

  async weekly_plans() {
    const students = await q(`select distinct student_id from readiness_snapshots`)
    const week = new Date().toISOString().slice(0, 10)
    for (const s of students)
      await enqueue('coach_run', { studentId: s.student_id, trigger: 'weekly', key: `weekly:${s.student_id}:${week}` })
  },

  // Deletes evidence photos some time after review, and old answer recordings (privacy: retention limits).
  async evidence_cleanup() {
    const old = await q(
      `select e.id, e.snapshot_path, e.evidence_json_path from proctoring_events e
        where e.snapshot_path is not null and exists (
          select 1 from integrity_reviews r where r.session_id = e.session_id
           and r.created_at < now() - make_interval(days => $1))`, [config.EVIDENCE_RETENTION_DAYS])
    await removeObjects(old.flatMap((e) => [e.snapshot_path, e.evidence_json_path].filter(Boolean)))
    if (old.length) await q(`update proctoring_events set snapshot_path = null, evidence_json_path = null where id = any($1)`, [old.map((e) => e.id)])
    const recs = await q(`select id, audio_path from interview_turns t where audio_path is not null and exists (
                            select 1 from interview_sessions s where s.id = t.session_id and s.ended_at < now() - make_interval(days => $1))`,
      [config.RECORDING_RETENTION_DAYS])
    await removeObjects(recs.map((r) => r.audio_path))
    if (recs.length) await q(`update interview_turns set audio_path = null where id = any($1)`, [recs.map((r) => r.id)])
    logger.info({ evidence: old.length, recordings: recs.length }, 'retention cleanup done')
  },

  async webhook_deliver({ registerNo }) {
    const hooks = await q(`select * from webhooks where is_active`)
    if (!hooks.length) return
    const [report] = await buildReports([registerNo], 3600)
    if (!report) return
    const body = JSON.stringify({ event: 'student.updated', data: report })
    for (const h of hooks) {
      const sig = crypto.createHmac('sha256', h.secret).update(body).digest('hex')
      try {
        const res = await fetch(h.url, { method: 'POST', body, signal: AbortSignal.timeout(10_000),
          headers: { 'content-type': 'application/json', 'x-speakready-signature': `sha256=${sig}` } })
        await q(`update webhooks set last_status = $2, last_error = null where id = $1`, [h.id, res.status])
      } catch (e: any) {
        await q(`update webhooks set last_status = 0, last_error = $2 where id = $1`, [h.id, String(e.message).slice(0, 300)])
      }
    }
  },
}

export async function startWorkers() {
  const boss = await startBoss()
  for (const [name, fn] of Object.entries(handlers) as [QueueName, Handler][]) {
    await boss.work(name, { includeMetadata: true, pollingIntervalSeconds: 1, batchSize: 1 }, async (jobs: any[]) => {
      for (const job of jobs) {
        try {
          await fn(job.data, { retryCount: job.retryCount ?? 0, retryLimit: job.retryLimit ?? 3 })
        } catch (e) {
          logger.error({ e, job: name, id: job.id }, 'job failed')
          throw e
        }
      }
    })
  }
  await boss.schedule('weekly_plans', '0 6 * * 1', {}, { tz: 'Asia/Kolkata' })
  await boss.schedule('evidence_cleanup', '30 2 * * *', {}, { tz: 'Asia/Kolkata' })
  logger.info('background jobs running')
}
