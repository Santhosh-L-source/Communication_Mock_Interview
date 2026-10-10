import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../audit'
import { canViewStudent, requireRole } from '../auth'
import { one, q, tx } from '../db'
import { ah, forbidden, notFound } from '../lib/errors'
import { computeMarks } from '../scoring/rubric'
import { recalcReadiness } from '../scoring/readiness'

export const evaluations = Router()

evaluations.get('/evaluations/pending', requireRole('trainer', 'admin'), ah(async (req, res) => {
  const rows = await q(
    `select e.id, e.overall, e.status, e.created_at, e.register_no, p.full_name, p.id as student_id,
            coalesce(qu.dimension::text, 'interview') as dimension, e.interview_session_id, r.attempt_id
       from evaluations e join profiles p on p.register_no = e.register_no
       left join responses r on r.id = e.response_id left join questions qu on qu.id = r.question_id
      where e.status = 'needs_review' order by e.created_at limit 100`)
  const out = []
  for (const r of rows) if (await canViewStudent(req.user, r.student_id)) out.push(r)
  res.json(out)
}))

// Trainer changes bands with a reason. The old evaluation is kept (superseded) for calibration and audit.
evaluations.post('/evaluations/:id/override', requireRole('trainer', 'admin'), ah(async (req, res) => {
  const b = z.object({
    reason: z.string().min(5).max(1000),
    criteria: z.array(z.object({ key: z.string(), band: z.number().int().min(0).max(4).nullable() })).min(1),
  }).parse(req.body)
  const old = await one(`select e.*, p.id as student_id from evaluations e join profiles p on p.register_no = e.register_no where e.id = $1`, [req.params.id])
  if (!old) throw notFound()
  if (old.status === 'superseded') throw forbidden('This evaluation was already replaced')
  if (!(await canViewStudent(req.user, old.student_id))) throw forbidden()
  const prev = await q(`select * from criterion_scores where evaluation_id = $1 and turn_id is null`, [old.id])
  const judged: Record<string, { band: number | null; reason: string; evidence: string[] }> = {}
  for (const c of prev) judged[c.criterion_key] = { band: c.band, reason: c.reason ?? '', evidence: c.evidence ?? [] }
  for (const c of b.criteria) if (judged[c.key]) judged[c.key] = { ...judged[c.key], band: c.band, reason: `Trainer: ${b.reason}` }
  const { items, overall } = computeMarks(prev.map((c) => ({ key: c.criterion_key, weight: c.weight })), judged)

  const newId = await tx(async (c) => {
    await c.query(`update evaluations set status = 'superseded' where id = $1`, [old.id])
    const { rows: [ev] } = await c.query(
      `insert into evaluations (response_id, interview_session_id, register_no, evaluator, rubric_id, rubric_version, model_id, overall,
                               feedback, metrics, status, supersedes_id, override_reason, created_by)
       values ($1,$2,$3,'trainer',$4,$5,$6,$7,$8,$9,'final',$10,$11,$12) returning id`,
      [old.response_id, old.interview_session_id, old.register_no, old.rubric_id, old.rubric_version, old.model_id, overall,
        JSON.stringify(old.feedback), JSON.stringify(old.metrics), old.id, b.reason, req.user.id])
    for (const i of items)
      await c.query(`insert into criterion_scores (evaluation_id, criterion_key, band, score, weight, reason, evidence) values ($1,$2,$3,$4,$5,$6,$7)`,
        [ev.id, i.key, i.band, i.score, i.weight, i.reason, JSON.stringify(i.evidence)])
    if (old.interview_session_id) await c.query(`update interview_sessions set overall_score = $2 where id = $1`, [old.interview_session_id, overall])
    if (old.response_id) {
      const { rows: [r] } = await c.query(`select attempt_id from responses where id = $1`, [old.response_id])
      // Recompute the attempt total with the new mark
      await c.query(`update attempts a set total_score = sub.total from (
          select round(sum(coalesce(ai.points,1) * case when qu.type in ('mcq','listening_mcq') then (case when r.is_correct then 100 else 0 end)
                   else coalesce((select overall from evaluations e where e.response_id = r.id and e.status <> 'superseded' order by created_at desc limit 1), 0) end)
                   / nullif(sum(coalesce(ai.points,1)),0), 2) as total
            from responses r join questions qu on qu.id = r.question_id join attempts a2 on a2.id = r.attempt_id
            left join assessment_items ai on ai.assessment_id = a2.assessment_id and ai.question_id = r.question_id
           where r.attempt_id = $1) sub where a.id = $1`, [r.attempt_id])
    }
    return ev.id as string
  })
  await audit(req.user.id, 'evaluation.override', 'evaluations', newId, { id: old.id, overall: old.overall }, { overall, criteria: b.criteria, reason: b.reason })
  await recalcReadiness(old.student_id, `override:${newId}`)
  res.json({ id: newId, overall })
}))
