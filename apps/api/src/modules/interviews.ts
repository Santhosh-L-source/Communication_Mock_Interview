import { Router } from 'express'
import multer from 'multer'
import { CreateInterview, ProctorEventInput, poolSizeFromDuration } from '@speakready/shared'
import { requireRole } from '../auth'
import { one, q } from '../db'
import { planQuestions } from '../interview/interviewer'
import { recordProctorEvent } from '../interview/proctor'
import { assertCanViewRaw } from '../lib/access'
import { ah, badRequest, forbidden, notFound } from '../lib/errors'
import { activeRubric } from '../scoring/rubric'
import { putObject, signedUrl } from '../storage'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 } })
export const interviews = Router()

interviews.get('/interview-config', ah(async (_req, res) => {
  const row = await one(`select interview_type, difficulty, planned_questions, duration_min from interview_config where id = true`)
  res.json(row ?? { interview_type: 'hr', difficulty: 2, planned_questions: 5, duration_min: 10 })
}))

interviews.get('/interview-assignments', ah(async (req, res) => {
  const rows = await q(
    `select ia.id, ia.title, ia.interview_type, ia.difficulty, ia.planned_questions, ia.duration_min, ia.deadline,
            (select count(*)::int from interview_sessions s where s.assignment_id = ia.id and s.student_id = $1) as my_attempts
       from interview_assignments ia
      order by ia.created_at desc`, [req.user.id])
  res.json(rows)
}))

interviews.post('/interviews', requireRole('student'), ah(async (req, res) => {
  const b = CreateInterview.parse(req.body)
  const assignmentId = (req.body as any).assignment_id ?? null

  // CRITICAL: Block mobile devices - MediaPipe doesn't work well on mobile
  if (b.device_info) {
    const ua = String(b.device_info.ua || '').toLowerCase()
    const isMobile = /android|iphone|ipad|mobile/i.test(ua)
    if (isMobile) {
      throw badRequest('Mobile devices are not supported for AI interviews. Please use a laptop or desktop computer with Chrome or Edge browser.')
    }
  }

  let cfg: any
  if (assignmentId) {
    const ia = await one(`select * from interview_assignments where id = $1`, [assignmentId])
    if (!ia) throw badRequest('Interview assignment not found')
    if (ia.deadline && new Date(ia.deadline) < new Date()) throw forbidden('This interview assignment deadline has passed')
    const done = await one(`select 1 from interview_sessions where assignment_id = $1 and student_id = $2`, [assignmentId, req.user.id])
    if (done) throw forbidden('You have already completed this interview assignment')
    cfg = { interview_type: ia.interview_type, difficulty: ia.difficulty, planned_questions: ia.planned_questions, duration_min: ia.duration_min ?? 10 }
  } else {
    cfg = await one(`select interview_type, difficulty, planned_questions, duration_min from interview_config where id = true`)
    if (!cfg) throw badRequest('Interview settings have not been configured yet. Please contact your administrator.')
  }
  const p = await one(`select recording_consent_at, proctoring_consent_at from profiles where id = $1`, [req.user.id])
  if (!p?.recording_consent_at || !p?.proctoring_consent_at) throw forbidden('Please accept the recording and monitoring consent first')
  const live = await one(`select id from interview_sessions where student_id = $1 and status = 'in_progress'`, [req.user.id])
  if (live) throw badRequest('You already have an interview in progress', { session_id: live.id })
  const durationMin = cfg.duration_min ?? 10
  const n = poolSizeFromDuration(durationMin, cfg.interview_type)
  const plan = await planQuestions(cfg.interview_type, cfg.difficulty, n)
  const rubric = await activeRubric('interview')
  const isPractice = !assignmentId
  const row = await one(
    `insert into interview_sessions (student_id, interview_type, difficulty, company_style, rubric_id, planned_questions, duration_min, plan, device_info, ai_models, assignment_id, is_practice)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id, interview_type, planned_questions, duration_min, status, is_practice`,
    [req.user.id, cfg.interview_type, cfg.difficulty, b.company_style ?? null, rubric.id, plan.length, durationMin, JSON.stringify(plan),
      JSON.stringify(b.device_info ?? {}), JSON.stringify({ rubric_version: rubric.version }), assignmentId, isPractice])
  res.status(201).json(row)
}))

interviews.get('/interviews', ah(async (req, res) => {
  const studentId = (req.query.student_id as string) || req.user.id
  if (studentId !== req.user.id) await assertCanViewRaw(req.user, studentId)
  res.json(await q(`select id, interview_type, status, started_at, ended_at, end_reason, overall_score, integrity_score, integrity_status, created_at
                      from interview_sessions where student_id = $1 order by created_at desc limit 50`, [studentId]))
}))

async function ownLiveSession(req: any) {
  const s = await one(`select * from interview_sessions where id = $1`, [req.params.id])
  if (!s) throw notFound('Interview not found')
  if (s.student_id !== req.user.id) throw forbidden()
  return s
}

// Reference photo for identity checks (P1 face match); stored by Node, readable by admins only.
interviews.post('/interviews/:id/enroll-face', requireRole('student'), upload.single('photo'), ah(async (req, res) => {
  await ownLiveSession(req)
  if (!req.file) throw badRequest('Missing photo')
  const path = await putObject(`reference-faces/${req.user.id}/enrolled.jpg`, req.file.buffer, 'image/jpeg', true)
  await q(`update profiles set reference_face_path = $2 where id = $1`, [req.user.id, path])
  res.json({ ok: true })
}))

interviews.post('/interviews/:id/device', requireRole('student'), ah(async (req, res) => {
  const s = await ownLiveSession(req)
  await q(`update interview_sessions set device_info = $2 where id = $1`, [s.id, JSON.stringify(req.body ?? {})])
  res.json({ ok: true })
}))

// Anti-cheat event with an optional webcam photo (multipart: fields + "photo")
interviews.post('/interviews/:id/proctor-events', requireRole('student'), upload.single('photo'), ah(async (req, res) => {
  const s = await ownLiveSession(req)
  const input = ProctorEventInput.parse(req.body)
  let details: any = {}
  try { details = input.details ? JSON.parse(input.details) : {} } catch { details = {} }
  const out = await recordProctorEvent(s, { ...input, details }, req.file?.buffer)
  res.status(201).json(out)
}))

interviews.get('/interviews/:id/report', ah(async (req, res) => {
  const s = await one(`select * from interview_sessions where id = $1`, [req.params.id])
  if (!s) throw notFound('Interview not found')
  await assertCanViewRaw(req.user, s.student_id)
  const turns = await q(`select seq, speaker, text, is_follow_up, started_ms, ended_ms, metrics from interview_turns where session_id = $1 order by seq`, [s.id])
  const ev = await one(`select * from evaluations where interview_session_id = $1 and status <> 'superseded' order by created_at desc limit 1`, [s.id])
  const criteria = ev ? await q(
    `select cs.criterion_key as key, cs.band, cs.score, cs.weight, cs.reason, cs.evidence, rc.label, rc.group_name
       from criterion_scores cs left join rubric_criteria rc on rc.rubric_id = $2 and rc.key = cs.criterion_key
      where cs.evaluation_id = $1 and cs.turn_id is null order by rc.sort_order`, [ev.id, ev.rubric_id]) : []
  const events = await q(`select event_type, severity, occurred_at, ai_verdict from proctoring_events
                           where session_id = $1 and event_type <> 'random_check' order by occurred_at`, [s.id])
  const reviewed = await one(`select decision, notes, created_at from integrity_reviews where session_id = $1 order by created_at desc limit 1`, [s.id])
  res.json({
    session: { ...s, plan: undefined },
    evaluation: ev ? { id: ev.id, overall: ev.overall, feedback: ev.feedback, metrics: ev.metrics, status: ev.status, model_id: ev.model_id,
      evaluator: ev.evaluator, override_reason: ev.override_reason } : null,
    criteria, turns,
    integrity: { score: s.integrity_score, status: s.integrity_status, events, review: reviewed },
    transcript_url: await signedUrl(s.transcript_path, 300),
  })
}))
