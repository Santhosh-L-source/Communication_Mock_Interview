import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { requireRole } from '../auth'
import { one, q, tx } from '../db'
import { assertCanViewRaw } from '../lib/access'
import { ah, badRequest, forbidden, HttpError, notFound } from '../lib/errors'
import { putObject } from '../storage'
import { attemptDetail, previousAttempt, submitAttempt } from './attemptsService'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })
export const assessments = Router()

// What the student can take now: the baseline(s), scheduled assessments for their cohort.
assessments.get('/assessments', ah(async (req, res) => {
  const rows = await q(
    `select s.id, s.title, s.is_baseline, s.duration_min, s.deadline,
            (select count(*)::int from assessment_items ai where ai.assessment_id = s.id) as items,
            sch.id as schedule_id, sch.opens_at, sch.closes_at, sch.max_attempts,
            (select count(*)::int from attempts a where a.assessment_id = s.id and a.student_id = $1) as my_attempts,
            (select max(total_score) from attempts a where a.assessment_id = s.id and a.student_id = $1 and a.status = 'evaluated') as best_score
       from assessments s
       left join assessment_schedules sch on sch.assessment_id = s.id and sch.cohort_id = $2
      where s.is_baseline or sch.id is not null or s.deadline is not null or s.created_by is not null or $3
      order by s.is_baseline desc, sch.opens_at nulls first, s.title`, [req.user.id, req.user.cohort_id, req.user.role !== 'student'])
  res.json(rows)
}))

async function createAttempt(studentId: string, kind: string, questionIds: string[], assessmentId: string | null, scheduleId: string | null) {
  return tx(async (c) => {
    const { rows: [a] } = await c.query(
      `insert into attempts (student_id, assessment_id, schedule_id, kind) values ($1,$2,$3,$4) returning *`,
      [studentId, assessmentId, scheduleId, kind])
    for (const qid of questionIds)
      await c.query(`insert into responses (attempt_id, question_id) values ($1,$2) on conflict do nothing`, [a.id, qid])
    return a
  })
}

assessments.post('/assessments/:id/attempts', requireRole('student'), ah(async (req, res) => {
  const s = await one(`select * from assessments where id = $1`, [req.params.id])
  if (!s) throw notFound('Assessment not found')
  const open = await one(`select id from attempts where student_id = $1 and assessment_id = $2 and status = 'in_progress'`, [req.user.id, s.id])
  if (open) return res.json(open) // resume
  if (!s.is_baseline) {
    const done = await one(`select 1 from attempts where student_id = $1 and assessment_id = $2 and status in ('evaluated','submitted')`, [req.user.id, s.id])
    if (done) throw forbidden('You have already completed this assessment')
  }
  const sch = await one(`select * from assessment_schedules where assessment_id = $1 and cohort_id = $2
                          and now() between opens_at and closes_at order by opens_at desc limit 1`, [s.id, req.user.cohort_id])
  const deadlineOpen = !s.deadline || new Date(s.deadline) > new Date()
  if (!s.is_baseline && !sch && !deadlineOpen) throw forbidden('The deadline for this assessment has passed')
  if (sch) {
    const used = await one(`select count(*)::int as n from attempts where student_id = $1 and schedule_id = $2`, [req.user.id, sch.id])
    if (used!.n >= sch.max_attempts) throw forbidden('No attempts left for this assessment')
  }
  const hadBaseline = await one(`select 1 from attempts a join assessments x on x.id = a.assessment_id
                                  where a.student_id = $1 and x.is_baseline and a.status = 'evaluated'`, [req.user.id])
  const kind = s.is_baseline ? (hadBaseline ? 'reattempt' : 'baseline') : 'scheduled'
  const items = await q(`select question_id from assessment_items where assessment_id = $1 order by position`, [s.id])
  res.status(201).json(await createAttempt(req.user.id, kind, items.map((i) => i.question_id), s.id, sch?.id ?? null))
}))

// Practice: one exercise (from the plan or the bank). Retrying the same question counts as a reattempt.
assessments.post('/practice/:questionId/attempts', requireRole('student'), ah(async (req, res) => {
  const qu = await one(`select id, status, for_student_id, type from questions where id = $1`, [req.params.questionId])
  if (!qu || qu.type === 'interview' || (qu.status !== 'approved' && qu.for_student_id !== req.user.id)) throw notFound('Exercise not found')
  const before = await one(`select 1 from responses r join attempts a on a.id = r.attempt_id
                             where a.student_id = $1 and r.question_id = $2 and a.status = 'evaluated'`, [req.user.id, qu.id])
  res.status(201).json(await createAttempt(req.user.id, before ? 'reattempt' : 'practice', [qu.id], null, null))
}))

async function ownAttempt(req: any, forWrite = false) {
  const a = await one(`select * from attempts where id = $1`, [req.params.id])
  if (!a) throw notFound('Attempt not found')
  if (forWrite) {
    if (a.student_id !== req.user.id) throw forbidden()
    if (a.status !== 'in_progress') throw new HttpError(409, 'This attempt was already submitted')
  } else await assertCanViewRaw(req.user, a.student_id)
  return a
}

// Runner view: questions without answer keys + whatever is already saved (resume after refresh).
assessments.get('/attempts/:id', ah(async (req, res) => {
  const a = await ownAttempt(req)
  const s = a.assessment_id ? await one(`select title, duration_min from assessments where id = $1`, [a.assessment_id]) : null
  const items = await q(
    `select r.question_id, r.answer_text, r.selected_option, r.audio_path is not null as has_audio, r.saved_at,
            qu.dimension, qu.sub_skill, qu.type, qu.prompt, qu.passage, qu.options, qu.time_limit_s, qu.context
       from responses r join questions qu on qu.id = r.question_id
       left join assessment_items ai on ai.assessment_id = $2 and ai.question_id = r.question_id
      where r.attempt_id = $1 order by ai.position nulls last`, [a.id, a.assessment_id])
  res.json({ attempt: a, assessment: s, items })
}))

assessments.get('/attempts', ah(async (req, res) => {
  const studentId = (req.query.student_id as string) || req.user.id
  if (studentId !== req.user.id) await assertCanViewRaw(req.user, studentId)
  res.json(await q(`select a.*, s.title, (select string_agg(distinct qu.dimension::text, ', ') from responses r join questions qu on qu.id = r.question_id
                     where r.attempt_id = a.id) as dimensions
                     from attempts a left join assessments s on s.id = a.assessment_id
                    where a.student_id = $1 order by a.started_at desc limit 100`, [studentId]))
}))

// Autosave (the runner calls this on change and every 10 s)
assessments.put('/attempts/:id/responses/:qid', requireRole('student'), ah(async (req, res) => {
  const a = await ownAttempt(req, true)
  const body = z.object({ answer_text: z.string().max(10_000).nullable().optional(), selected_option: z.string().max(10).nullable().optional() }).parse(req.body)
  const row = await one(`update responses set answer_text = coalesce($3, answer_text), selected_option = coalesce($4, selected_option), saved_at = now()
                          where attempt_id = $1 and question_id = $2 returning question_id, saved_at`,
    [a.id, req.params.qid, body.answer_text ?? null, body.selected_option ?? null])
  if (!row) throw notFound('Question is not part of this attempt')
  res.json(row)
}))

assessments.post('/attempts/:id/responses/:qid/audio', requireRole('student'), upload.single('audio'), ah(async (req, res) => {
  const a = await ownAttempt(req, true)
  if (!req.file) throw badRequest('Missing audio')
  const path = await putObject(`recordings/${a.register_no}/attempt-${a.id}/${req.params.qid}.webm`, req.file.buffer, req.file.mimetype || 'audio/webm', true)
  const duration = z.coerce.number().min(0).max(600).default(0).parse(req.body.duration_s)
  const caption = typeof req.body.caption === 'string' ? req.body.caption.slice(0, 5000) : null
  const row = await one(`update responses set audio_path = $3, duration_s = $4, answer_text = coalesce($5, answer_text), saved_at = now()
                          where attempt_id = $1 and question_id = $2 returning question_id, saved_at`, [a.id, req.params.qid, path, duration, caption])
  if (!row) throw notFound('Question is not part of this attempt')
  res.json(row)
}))

const proctorUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 } })
assessments.post('/attempts/:id/proctor-events', requireRole('student'), proctorUpload.single('photo'), ah(async (req, res) => {
  const a = await ownAttempt(req, true)
  const eventType = String(req.body.event_type)
  const severity = String(req.body.severity)
  const occurredAt = req.body.occurred_at ?? new Date().toISOString()
  const durationMs = req.body.duration_ms ? Number(req.body.duration_ms) : null
  const confidence = req.body.confidence ? Number(req.body.confidence) : null
  const details = req.body.details ? JSON.parse(req.body.details) : {}
  let snapshotPath: string | null = null
  if (req.file) {
    snapshotPath = await putObject(`proctoring-evidence/${a.register_no}/attempt-${a.id}/${Date.now()}.jpg`, req.file.buffer, 'image/jpeg', true)
  }
  const row = await one(
    `insert into assessment_proctor_events (attempt_id, register_no, event_type, severity, confidence, occurred_at, duration_ms, snapshot_path, details)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [a.id, a.register_no, eventType, severity, confidence, occurredAt, durationMs, snapshotPath, JSON.stringify(details)])
  res.status(201).json(row)
}))

assessments.post('/attempts/:id/submit', requireRole('student'), ah(async (req, res) => {
  const a = await ownAttempt(req, true)
  res.json(await submitAttempt(a.id))
}))

// Results with per-criterion scores, feedback and the before/after comparison.
assessments.get('/attempts/:id/result', ah(async (req, res) => {
  const a = await ownAttempt(req)
  const detail = await attemptDetail(a.id)
  const prev = await previousAttempt(a.id)
  const previous = prev ? await attemptDetail(prev.id) : null
  let comparison = null
  if (previous && detail) {
    const crit = (d: any) => {
      const out: Record<string, number[]> = {}
      for (const r of d.responses) for (const c of r.evaluation?.criteria ?? []) if (c.score != null) (out[c.key] ??= []).push((c.score / c.weight) * 100)
      return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, +(v.reduce((x, y) => x + y, 0) / v.length).toFixed(1)]))
    }
    const now = crit(detail), then = crit(previous)
    comparison = {
      previous_attempt_id: previous.id, previous_total: previous.total_score, total_change: detail.total_score != null && previous.total_score != null
        ? +(detail.total_score - previous.total_score).toFixed(2) : null,
      by_dimension: Object.fromEntries(Object.keys({ ...detail.by_dimension, ...previous.by_dimension }).map((k) =>
        [k, { before: previous.by_dimension[k] ?? null, after: detail.by_dimension[k] ?? null }])),
      by_criterion: Object.fromEntries(Object.keys({ ...now, ...then }).map((k) => [k, { before: then[k] ?? null, after: now[k] ?? null }])),
    }
  }
  res.json({ ...detail, comparison })
}))
