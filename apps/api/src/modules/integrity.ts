import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../audit'
import { canViewStudent, requireRole } from '../auth'
import { one, q } from '../db'
import { enqueue } from '../jobs/boss'
import { ah, forbidden, notFound } from '../lib/errors'
import { notify, staffFor } from '../lib/notify'
import { recalcReadiness } from '../scoring/readiness'
import { signedUrls } from '../storage'

export const integrity = Router()

integrity.get('/integrity/queue', requireRole('admin', 'trainer'), ah(async (req, res) => {
  const status = (req.query.status as string) || null
  const rows = await q(
    `select s.id, s.register_no, p.full_name, s.interview_type, s.started_at, s.ended_at, s.end_reason, s.status,
            s.integrity_score, s.integrity_status, s.student_id,
            (select count(*)::int from proctoring_events e where e.session_id = s.id and e.event_type <> 'random_check') as events,
            (select count(*)::int from proctoring_events e where e.session_id = s.id and e.severity = 'high') as high_events
       from interview_sessions s join profiles p on p.id = s.student_id
      where ($1::integrity_status is null and s.integrity_status in ('needs_review','flagged')) or s.integrity_status = $1
      order by (s.integrity_status = 'flagged') desc, s.integrity_score asc, s.ended_at desc nulls first limit 200`, [status])
  const visible = []
  for (const r of rows) if (await canViewStudent(req.user, r.student_id)) visible.push(r)
  res.json(visible)
}))

// Timeline of events with 60-second photo links and transcript; every view is audited.
integrity.get('/integrity/sessions/:id', requireRole('admin', 'trainer'), ah(async (req, res) => {
  const s = await one(`select s.*, p.full_name, p.email, p.reference_face_path from interview_sessions s join profiles p on p.id = s.student_id where s.id = $1`, [req.params.id])
  if (!s) throw notFound()
  if (!(await canViewStudent(req.user, s.student_id))) throw forbidden()
  const events = await q(`select * from proctoring_events where session_id = $1 order by occurred_at`, [s.id])
  const turns = await q(`select seq, speaker, text, started_ms, ended_ms from interview_turns where session_id = $1 order by seq`, [s.id])
  const reviews = await q(`select r.*, p.full_name as reviewer_name from integrity_reviews r join profiles p on p.id = r.reviewer_id
                            where r.session_id = $1 order by r.created_at desc`, [s.id])
  const urls = await signedUrls([...events.map((e) => e.snapshot_path), s.transcript_path,
    req.user.role === 'admin' ? s.reference_face_path : null], 60)
  await audit(req.user.id, 'evidence.view', 'interview_sessions', s.id)
  res.json({
    session: { ...s, plan: undefined, reference_face_url: urls[s.reference_face_path] ?? null, transcript_url: urls[s.transcript_path] ?? null },
    events: events.map((e) => ({ ...e, photo_url: e.snapshot_path ? urls[e.snapshot_path] ?? null : null })),
    turns, reviews,
  })
}))

integrity.post('/integrity/sessions/:id/review', requireRole('admin'), ah(async (req, res) => {
  const b = z.object({ decision: z.enum(['cleared', 'confirmed_cheating', 'needs_review']), notes: z.string().min(3).max(2000) }).parse(req.body)
  const s = await one(`select * from interview_sessions where id = $1`, [req.params.id])
  if (!s) throw notFound()
  const dup = await one(`select id from integrity_reviews where session_id = $1 and reviewer_id = $2 and decision = $3 and notes = $4
                          and created_at > now() - interval '30 seconds'`, [s.id, req.user.id, b.decision, b.notes])
  if (dup) return res.json({ ok: true, duplicate: true })
  await q(`insert into integrity_reviews (session_id, reviewer_id, decision, notes) values ($1,$2,$3,$4)`, [s.id, req.user.id, b.decision, b.notes])
  await q(`update interview_sessions set integrity_status = $2 where id = $1`, [s.id, b.decision])
  await q(`update alerts set status = 'resolved', resolved_at = now() where session_id = $1 and kind = 'integrity' and status in ('open','in_progress')`, [s.id])
  await audit(req.user.id, 'integrity.review', 'interview_sessions', s.id, { integrity_status: s.integrity_status }, b)
  await recalcReadiness(s.student_id, `review:${s.id}`)
  await notify(s.student_id, 'Interview review completed',
    b.decision === 'cleared' ? 'Your interview was reviewed and cleared.' : b.decision === 'confirmed_cheating'
      ? 'Your interview was marked as malpractice after review. Contact your trainer if you want to respond.' : 'Your interview needs further review.',
    `/interviews/${s.id}/report`)
  if (b.decision === 'confirmed_cheating') {
    const mentor = await staffFor(s.student_id, 'mentor')
    if (mentor) await notify(mentor, 'Malpractice confirmed', `${s.register_no}: ${b.notes}`, `/staff/students/${s.student_id}`)
  }
  await enqueue('webhook_deliver', { registerNo: s.register_no })
  res.json({ ok: true })
}))
