import { enqueue } from '../jobs/boss'
import { one, q, tx } from '../db'
import { notify } from '../lib/notify'
import { recalcReadiness } from '../scoring/readiness'

const MCQ = ['mcq', 'listening_mcq']

// Scores objective items, queues AI evaluation for the rest.
export async function submitAttempt(attemptId: string) {
  const pending = await tx(async (c) => {
    const { rows: [a] } = await c.query(`update attempts set status = 'evaluating', submitted_at = now()
                                           where id = $1 and status = 'in_progress' returning *`, [attemptId])
    if (!a) return null
    const { rows } = await c.query(
      `select r.id, r.selected_option, r.answer_text, r.audio_path, qu.type, qu.answer_key
         from responses r join questions qu on qu.id = r.question_id where r.attempt_id = $1`, [attemptId])
    const toEvaluate: string[] = []
    for (const r of rows) {
      if (MCQ.includes(r.type)) {
        const correct = r.selected_option != null && String(r.answer_key?.index) === String(r.selected_option)
        await c.query(`update responses set is_correct = $2 where id = $1`, [r.id, correct])
      } else toEvaluate.push(r.id)
    }
    return toEvaluate
  })
  if (pending === null) return { alreadySubmitted: true }
  for (const id of pending) await enqueue('evaluate_response', { responseId: id, attemptId }, { singletonKey: `resp:${id}` })
  if (!pending.length) await finalizeAttemptIfDone(attemptId)
  return { queued: pending.length }
}

export async function finalizeAttemptIfDone(attemptId: string) {
  const open = await one(
    `select count(*)::int as n from responses r join questions qu on qu.id = r.question_id
      where r.attempt_id = $1 and qu.type not in ('mcq','listening_mcq')
        and not exists (select 1 from evaluations e where e.response_id = r.id and e.status in ('final','needs_review'))`, [attemptId])
  if (open!.n > 0) return false
  const score = await one<{ total: number }>(
    `select round(sum(coalesce(ai.points, 1) * case when qu.type in ('mcq','listening_mcq') then (case when r.is_correct then 100 else 0 end)
                                                  else coalesce(e.overall, 0) end) / nullif(sum(coalesce(ai.points, 1)), 0), 2) as total
       from responses r join questions qu on qu.id = r.question_id join attempts a on a.id = r.attempt_id
       left join assessment_items ai on ai.assessment_id = a.assessment_id and ai.question_id = r.question_id
       left join lateral (select overall from evaluations e where e.response_id = r.id and e.status <> 'superseded'
                          order by created_at desc limit 1) e on true
      where r.attempt_id = $1`, [attemptId])
  const a = await one(`update attempts set status = 'evaluated', total_score = $2 where id = $1 and status = 'evaluating' returning *`,
    [attemptId, score?.total ?? 0])
  if (!a) return false // another worker finished it
  await recalcReadiness(a.student_id, `attempt:${attemptId}`)
  await notify(a.student_id, 'Your results are ready', `Score: ${a.total_score}`, `/attempts/${attemptId}`)
  await enqueue('coach_run', { studentId: a.student_id, trigger: 'evaluation_completed', key: `attempt:${attemptId}`, attemptId })
  await enqueue('webhook_deliver', { registerNo: a.register_no })
  return true
}

// Previous evaluated attempt on the same assessment (or the same single question) for before/after comparison.
export async function previousAttempt(attemptId: string) {
  const a = await one(`select * from attempts where id = $1`, [attemptId])
  if (!a) return null
  if (a.assessment_id) {
    const isBaseline = await one(`select is_baseline from assessments where id = $1`, [a.assessment_id])
    // Parallel forms: any earlier baseline counts as the comparison point
    return one(`select a2.* from attempts a2 left join assessments s on s.id = a2.assessment_id
                 where a2.student_id = $1 and a2.id <> $2 and a2.status = 'evaluated' and a2.started_at < $3
                   and (a2.assessment_id = $4 or ($5 and s.is_baseline))
                 order by a2.started_at desc limit 1`, [a.student_id, a.id, a.started_at, a.assessment_id, Boolean(isBaseline?.is_baseline)])
  }
  return one(`select a2.* from attempts a2
               where a2.student_id = $1 and a2.id <> $2 and a2.status = 'evaluated' and a2.started_at < $3
                 and exists (select 1 from responses r2 join responses r on r.question_id = r2.question_id
                              where r2.attempt_id = a2.id and r.attempt_id = $2)
               order by a2.started_at desc limit 1`, [a.student_id, a.id, a.started_at])
}

export async function attemptDetail(attemptId: string) {
  const a = await one(`select a.*, s.title as assessment_title from attempts a left join assessments s on s.id = a.assessment_id where a.id = $1`, [attemptId])
  if (!a) return null
  const responses = await q(
    `select r.id, r.question_id, r.answer_text, r.selected_option, r.is_correct, r.duration_s, r.audio_path is not null as has_audio,
            qu.dimension, qu.sub_skill, qu.type, qu.prompt, qu.options,
            case when a.status = 'evaluated' then qu.answer_key end as answer_key,
            (select row_to_json(e) from (
               select e.id, e.overall, e.feedback, e.metrics, e.status, e.evaluator, e.model_id, e.override_reason,
                      (select json_agg(json_build_object('key', cs.criterion_key, 'band', cs.band, 'score', cs.score,
                               'weight', cs.weight, 'reason', cs.reason, 'evidence', cs.evidence,
                               'label', rc.label) order by rc.sort_order)
                         from criterion_scores cs left join rubric_criteria rc on rc.rubric_id = e.rubric_id and rc.key = cs.criterion_key
                        where cs.evaluation_id = e.id and cs.turn_id is null) as criteria
                 from evaluations e where e.response_id = r.id and e.status <> 'superseded'
                order by e.created_at desc limit 1) e) as evaluation
       from responses r join questions qu on qu.id = r.question_id join attempts a on a.id = r.attempt_id
       left join assessment_items ai on ai.assessment_id = a.assessment_id and ai.question_id = r.question_id
      where r.attempt_id = $1 order by ai.position nulls last, qu.dimension`, [attemptId])
  const dims: Record<string, { correct: number; total: number; scores: number[] }> = {}
  for (const r of responses) {
    const d = (dims[r.dimension] ??= { correct: 0, total: 0, scores: [] })
    if (r.type === 'mcq' || r.type === 'listening_mcq') { d.total++; if (r.is_correct) d.correct++ }
    else if (r.evaluation) d.scores.push(r.evaluation.overall)
  }
  const by_dimension = Object.fromEntries(Object.entries(dims).map(([k, v]) => [k,
    v.total ? Math.round((v.correct / v.total) * 100) : v.scores.length ? +(v.scores.reduce((a, b) => a + b, 0) / v.scores.length).toFixed(1) : null]))
  return { ...a, responses, by_dimension }
}
