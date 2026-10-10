// Communication Coach Agent: a persisted state machine. The LLM makes choices at specific steps
// (which exercise, drafting a new one); plain code verifies every choice. Every step is stored in
// agent_steps so trainers can see why a recommendation was made.
import { GeneratedExercise, PracticeChoice, TargetCheck } from '@speakready/shared'
import { generateJson } from '../ai/llm'
import { audit } from '../audit'
import { one, q } from '../db'
import { logger } from '../lib/logger'
import { notify, staffFor } from '../lib/notify'
import { latestSnapshot, type Dimension, type Snapshot } from '../scoring/readiness'

const MAX_STEPS = 12
const DIM_TYPES: Record<Dimension, string[]> = {
  reading: ['mcq'], listening: ['listening_mcq'], writing: ['short_text', 'long_text'], speaking: ['spoken'],
}

export const weekStart = (d = new Date()) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = x.getUTCDay() || 7
  x.setUTCDate(x.getUTCDate() - day + 1)
  return x.toISOString().slice(0, 10)
}
const addDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10)
const difficultyFor = (level: number) => Math.min(5, Math.max(1, level + 1))

class Run {
  seq = 0
  constructor(public id: string, public studentId: string) {}
  async step<T>(step: string, tool: string | null, input: unknown, fn: () => Promise<{ output: T; verified?: boolean | null }>) {
    if (++this.seq > MAX_STEPS) throw new Error('step budget exceeded')
    await q(`update agent_runs set state = $2 where id = $1`, [this.id, step])
    const { output, verified = null } = await fn()
    await q(`insert into agent_steps (run_id, seq, step, tool, input, output, verified) values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (run_id, seq) do update set output = excluded.output, verified = excluded.verified`,
      [this.id, this.seq, step, tool, JSON.stringify(input ?? null), JSON.stringify(output ?? null), verified])
    return output
  }
}

// ---------- Tools ----------
export async function getRecentPerformance(studentId: string, n = 5) {
  return q(`select e.id, e.overall, e.created_at, coalesce(qu.dimension::text, 'speaking') as dimension,
                   case when e.interview_session_id is not null then 'interview' else qu.sub_skill end as activity,
                   (select jsonb_object_agg(cs.criterion_key, cs.score) from criterion_scores cs
                     where cs.evaluation_id = e.id and cs.turn_id is null) as criteria
              from evaluations e
              left join responses r on r.id = e.response_id left join questions qu on qu.id = r.question_id
             where e.register_no = (select register_no from profiles where id = $1) and e.status = 'final'
             order by e.created_at desc limit $2`, [studentId, n])
}

export async function findExercises(studentId: string, dim: Dimension, subSkill: string | null, difficulty: number) {
  return q(`select id, sub_skill, difficulty, type, left(prompt, 200) as prompt from questions qu
             where qu.dimension = $2 and qu.type = any($5::question_type[])
               and (qu.status = 'approved' or qu.for_student_id = $1)
               and (qu.for_student_id is null or qu.for_student_id = $1)
               and not exists (select 1 from responses r join attempts a on a.id = r.attempt_id
                                where a.student_id = $1 and r.question_id = qu.id)
               and not exists (select 1 from plan_items pi join practice_plans pp on pp.id = pi.plan_id
                                where pp.student_id = $1 and pi.question_id = qu.id)
             order by (qu.sub_skill = $3) desc, abs(qu.difficulty - $4), random() limit 5`,
    [studentId, dim, subSkill ?? '', difficulty, DIM_TYPES[dim]])
}

export async function generateExercise(studentId: string, dim: Dimension, subSkill: string, difficulty: number, sessionHint?: string) {
  const { data } = await generateJson({
    purpose: 'exercise',
    system: 'You write short placement-communication practice exercises for Indian engineering students. Output JSON only.',
    user: `Write ONE ${dim} exercise targeting the sub-skill "${subSkill}" at difficulty ${difficulty}/5 in a placement context ` +
      `(interviews, workplace emails, technical explanations, company notices).\n` +
      `Allowed types for ${dim}: ${DIM_TYPES[dim].join(', ')}. Reading and listening items need a "passage" ` +
      `(for listening, the passage is the script read aloud) and MCQ "options" (4) with "answer_index".\n` +
      `JSON keys: dimension, sub_skill, type, difficulty, context, prompt, passage, options, answer_index, expected_points.`,
    schema: GeneratedExercise,
    temperature: 0.7,
    mock: () => mockExercise(dim, subSkill, difficulty, sessionHint),
  })
  return data
}

function mockExercise(dim: Dimension, subSkill: string, difficulty: number, hint?: string): GeneratedExercise {
  if (dim === 'reading' || dim === 'listening')
    return {
      dimension: dim, sub_skill: subSkill, type: dim === 'reading' ? 'mcq' : 'listening_mcq', difficulty, context: 'workplace',
      passage: 'The team will move the weekly review from Monday to Wednesday at 3 pm, starting next week, because two members ' +
        'attend client calls on Monday afternoons. Please update your calendars and share your status notes by Tuesday evening.',
      prompt: 'Why is the weekly review being moved?',
      options: ['The manager is on leave', 'Two members have client calls on Monday afternoons', 'The office is closed on Mondays', 'Status notes are late'],
      answer_index: 1, expected_points: [],
    }
  return {
    dimension: dim, sub_skill: subSkill, type: dim === 'writing' ? 'long_text' : 'spoken', difficulty, context: 'hr',
    prompt: dim === 'writing'
      ? `Write a short professional email (80-120 words) to your project guide asking to reschedule tomorrow's review. Focus on ${subSkill}.${hint ?? ''}`
      : `In about 60 seconds, describe a time you solved a problem in a team project. Focus on ${subSkill}.`,
    passage: null, options: null, answer_index: null,
    expected_points: ['clear purpose in the first sentence', 'a reason', 'a proposed alternative', 'polite close'],
  }
}

async function verifyTargets(ex: GeneratedExercise, subSkill: string) {
  const { data } = await generateJson({
    purpose: 'verify',
    system: 'You check practice exercises. Output JSON only.',
    user: `Does this exercise genuinely practise the sub-skill "${subSkill}"?\n${JSON.stringify({ prompt: ex.prompt, passage: ex.passage, options: ex.options })}\n` +
      'Return {"targets_sub_skill": true|false, "reason": "..."}',
    schema: TargetCheck,
    mock: () => ({ targets_sub_skill: true, reason: 'offline check' }),
  })
  return data
}

async function saveGenerated(studentId: string, ex: GeneratedExercise) {
  const row = await one<{ id: string }>(
    `insert into questions (dimension, sub_skill, type, difficulty, context, prompt, passage, options, answer_key, expected_points,
                            status, source, for_student_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft','ai',$11) returning id`,
    [ex.dimension, ex.sub_skill, ex.type, ex.difficulty, ex.context ?? null, ex.prompt, ex.passage ?? null,
      ex.options ? JSON.stringify(ex.options) : null, ex.answer_index != null ? JSON.stringify({ index: ex.answer_index }) : null,
      ex.expected_points ?? [], studentId])
  return row!.id
}

async function ensurePlan(studentId: string, runId: string) {
  const ws = weekStart()
  return (await one<{ id: string }>(
    `insert into practice_plans (student_id, week_start, summary, agent_run_id) values ($1,$2,'Practice picked by your coach',$3)
     on conflict (student_id, week_start) do update set status = 'active' returning id`, [studentId, ws, runId]))!.id
}

export async function assignPractice(studentId: string, runId: string, questionId: string | null, dim: Dimension,
  subSkill: string | null, reason: string, interviewType?: string) {
  const planId = await ensurePlan(studentId, runId)
  const item = await one<{ id: string }>(
    `insert into plan_items (plan_id, question_id, interview_type, target_dimension, target_sub_skill, due_date, reason)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [planId, questionId, interviewType ?? null, dim, subSkill, addDays(3), reason])
  return item!.id
}

// Escalation rule: a dimension below 45 across 3 consecutive snapshots; or under 3 points of improvement after
// 3 completed practices on it; or 2 consecutive plan weeks with nothing done.
export async function checkEscalation(studentId: string) {
  const reasons: { kind: 'persistent_weakness' | 'missed_plan'; dimension: Dimension | null; reason: string }[] = []
  const snaps = await q<Snapshot>(`select * from readiness_snapshots where student_id = $1 order by created_at desc limit 3`, [studentId])
  for (const d of ['reading', 'writing', 'listening', 'speaking'] as Dimension[]) {
    if (snaps.length === 3 && snaps.every((s) => s[d] != null && (s[d] as number) < 45))
      reasons.push({ kind: 'persistent_weakness', dimension: d, reason: `${d} stayed below 45 for 3 activities in a row (now ${snaps[0][d]}).` })
    const done = await q<{ created_at: string }>(
      `select pp.created_at from plan_items pi join practice_plans pp on pp.id = pi.plan_id
        where pp.student_id = $1 and pi.target_dimension = $2 and pi.status = 'done' order by pp.created_at desc limit 3`, [studentId, d])
    if (done.length === 3 && snaps[0]?.[d] != null) {
      const before = await one<Snapshot>(`select * from readiness_snapshots where student_id = $1 and created_at <= $2
                                           order by created_at desc limit 1`, [studentId, done[2].created_at])
      if (before?.[d] != null && (snaps[0][d] as number) - (before[d] as number) < 3)
        reasons.push({ kind: 'persistent_weakness', dimension: d,
          reason: `${d} improved by less than 3 points after 3 practices (${before[d]} to ${snaps[0][d]}).` })
    }
  }
  const missed = await q(`select pp.week_start, count(pi.*) filter (where pi.status = 'done') as done
                            from practice_plans pp left join plan_items pi on pi.plan_id = pp.id
                           where pp.student_id = $1 and pp.week_start < $2
                           group by pp.id order by pp.week_start desc limit 2`, [studentId, weekStart()])
  if (missed.length === 2 && missed.every((m) => Number(m.done) === 0))
    reasons.push({ kind: 'missed_plan', dimension: null, reason: 'No practice was completed in the last 2 plan weeks.' })
  return reasons
}

export async function raiseAlert(studentId: string, kind: string, dimension: Dimension | null, reason: string, severity = 'medium') {
  const open = await one(`select id from alerts where student_id = $1 and kind = $2 and dimension is not distinct from $3
                            and status in ('open','in_progress')`, [studentId, kind, dimension])
  if (open) return { created: false, id: open.id as string }
  const assigned = await staffFor(studentId, 'mentor')
  const row = await one<{ id: string }>(
    `insert into alerts (student_id, kind, dimension, severity, reason, assigned_to) values ($1,$2,$3,$4,$5,$6) returning id`,
    [studentId, kind, dimension, severity, reason, assigned])
  if (assigned) await notify(assigned, 'Student needs attention', reason, `/staff/students/${studentId}`)
  await audit(null, 'alert.raise', 'alerts', row!.id, null, { kind, dimension, reason })
  return { created: true, id: row!.id }
}

// ---------- The loop ----------
export async function runCoach(studentId: string, trigger: 'evaluation_completed' | 'weekly' | 'manual', idempotencyKey: string,
  ctx: { attemptId?: string; sessionId?: string } = {}) {
  const existing = await one(`select id, finished_at from agent_runs where idempotency_key = $1`, [idempotencyKey])
  if (existing?.finished_at) return existing.id as string
  const runId: string = existing?.id ?? (await one(
    `insert into agent_runs (student_id, trigger, idempotency_key, state, context) values ($1,$2,$3,'observe',$4) returning id`,
    [studentId, trigger, idempotencyKey, JSON.stringify(ctx)]))!.id
  const run = new Run(runId, studentId)
  if (existing) run.seq = (await one(`select coalesce(max(seq),0) as m from agent_steps where run_id = $1`, [runId]))!.m

  try {
    const profile = await one(`select coach_paused from profiles where id = $1`, [studentId])
    if (profile?.coach_paused) {
      await q(`update agent_runs set state = 'paused', finished_at = now() where id = $1`, [runId])
      return runId
    }

    // Observe
    const perf = await run.step('observe', 'get_recent_performance', { n: 5 }, async () => ({ output: await getRecentPerformance(studentId) }))
    const snap = await run.step('observe', 'get_readiness_profile', {}, async () => ({ output: await latestSnapshot(studentId) }))
    if (!snap) {
      await q(`update agent_runs set state = 'done', finished_at = now(), error = 'no readiness profile yet' where id = $1`, [runId])
      return runId
    }

    // Evaluate: practice attempts close their plan items
    if (ctx.attemptId) {
      await run.step('evaluate', 'evaluate_attempt', { attempt_id: ctx.attemptId }, async () => {
        const closed = await q(
          `update plan_items pi set status = 'done',
                  result_evaluation_id = (select e.id from evaluations e join responses r on r.id = e.response_id
                                           where r.attempt_id = $2 and r.question_id = pi.question_id and e.status = 'final' limit 1)
             from practice_plans pp
            where pp.id = pi.plan_id and pp.student_id = $1 and pi.status = 'pending'
              and pi.question_id in (select question_id from responses where attempt_id = $2)
          returning pi.id`, [studentId, ctx.attemptId])
        return { output: { closed_plan_items: closed.map((c) => c.id) }, verified: true }
      })
    }
    if (ctx.sessionId) {
      await run.step('evaluate', 'evaluate_attempt', { session_id: ctx.sessionId }, async () => {
        const s = await one(`select interview_type from interview_sessions where id = $1`, [ctx.sessionId])
        const closed = await q(
          `update plan_items pi set status = 'done',
                  result_evaluation_id = (select id from evaluations where interview_session_id = $2 and status = 'final' limit 1)
             from practice_plans pp
            where pp.id = pi.plan_id and pp.student_id = $1 and pi.status = 'pending' and pi.interview_type = $3
          returning pi.id`, [studentId, ctx.sessionId, s?.interview_type])
        return { output: { closed_plan_items: closed.map((c) => c.id) }, verified: true }
      })
    }

    // Update profile (the scoring pipeline already stored a new snapshot; record the change)
    const previous = await one<Snapshot>(`select * from readiness_snapshots where student_id = $1 order by created_at desc offset 1 limit 1`, [studentId])
    await run.step('update_profile', 'update_readiness', {}, async () => ({
      output: { snapshot_id: snap.id, overall: snap.overall, level: snap.level, delta: previous ? +(snap.overall - previous.overall).toFixed(2) : null },
      verified: Boolean(snap.id),
    }))

    // Diagnose
    const dim = (snap.weakest_dimension ?? 'speaking') as Dimension
    const sub = snap.weakest_sub_skill ?? 'general'
    await run.step('diagnose', null, { snapshot: snap.id }, async () => ({ output: { dimension: dim, sub_skill: sub, score: snap[dim] } }))

    if (trigger === 'weekly') {
      await run.step('recommend', 'create_weekly_plan', {}, async () => {
        const res = await createWeeklyPlan(studentId, runId, snap)
        return { output: res, verified: res.weakest_items * 2 >= res.total }
      })
    } else {
      // Select practice: a bank item if one fits, otherwise generate one
      const difficulty = difficultyFor(snap.level)
      const candidates = await run.step('select_practice', 'find_exercises', { dim, sub, difficulty }, async () => {
        const list = await findExercises(studentId, dim, sub, difficulty)
        return { output: list, verified: list.every((c) => c.difficulty >= 1) }
      })
      let questionId: string | null = null
      let reason = `Practise ${dim} (${sub.replaceAll('_', ' ')}), your weakest area right now.`
      if (candidates.length) {
        const choice = await run.step('select_practice', 'choose_exercise', { candidates: candidates.map((c) => c.id) }, async () => {
          const { data } = await generateJson({
            purpose: 'coach',
            system: 'You are a communication coach choosing the single most useful next exercise. Output JSON only.',
            user: `Student weakest area: ${dim} / ${sub}. Level ${snap.level}/4. Recent results: ${JSON.stringify(perf.slice(0, 3).map((p) => ({ dimension: p.dimension, overall: p.overall })))}\n` +
              `Candidates:\n${candidates.map((c) => `${c.id}: [${c.sub_skill}, difficulty ${c.difficulty}] ${c.prompt}`).join('\n')}\n` +
              'Return {"question_id": one of the ids above, "reason": "one sentence for the student"}',
            schema: PracticeChoice,
            mock: () => ({ question_id: candidates[0].id, reason }),
          })
          const valid = candidates.some((c) => c.id === data.question_id)
          return { output: valid ? data : { question_id: candidates[0].id, reason }, verified: valid }
        })
        questionId = choice.question_id
        reason = choice.reason
      } else {
        for (let i = 0; i < 3 && !questionId; i++) {
          const ex = await run.step('generate', 'generate_exercise', { dim, sub, difficulty, attempt: i + 1 }, async () => ({
            output: await generateExercise(studentId, dim, sub, difficulty),
          }))
          const check = await run.step('verify', 'verify_exercise', { attempt: i + 1 }, async () => {
            const c = await verifyTargets(ex, sub)
            return { output: c, verified: c.targets_sub_skill && ex.dimension === dim }
          })
          if (check.targets_sub_skill && ex.dimension === dim) questionId = await saveGenerated(studentId, ex)
        }
      }
      if (questionId) {
        const qid = questionId
        await run.step('assign', 'assign_practice', { question_id: qid }, async () => {
          const itemId = await assignPractice(studentId, runId, qid, dim, sub, reason)
          await notify(studentId, 'New practice from your coach', reason, `/practice`)
          return { output: { plan_item_id: itemId }, verified: Boolean(itemId) }
        })
      }
      await run.step('recommend', null, {}, async () => {
        const msg = previous && snap.overall !== previous.overall
          ? `Your readiness moved from ${previous.overall} to ${snap.overall}. Keep going on ${dim}.`
          : `Your next focus is ${dim}.`
        return { output: { message: msg } }
      })
    }

    // Escalate
    const reasons = await run.step('escalate', 'check_escalation', {}, async () => ({ output: await checkEscalation(studentId) }))
    for (const r of reasons)
      await run.step('escalate', 'raise_alert', r, async () => ({ output: await raiseAlert(studentId, r.kind, r.dimension, r.reason) }))

    await q(`update agent_runs set state = 'done', finished_at = now() where id = $1`, [runId])
  } catch (e: any) {
    logger.error({ e, runId }, 'coach run failed')
    await q(`update agent_runs set error = $2 where id = $1`, [runId, String(e.message).slice(0, 500)])
    throw e
  }
  return runId
}

// 5-7 activities, at least half on the weakest dimension, plus one mock interview.
export async function createWeeklyPlan(studentId: string, runId: string, snap: Snapshot) {
  const dims = (['reading', 'writing', 'listening', 'speaking'] as Dimension[])
    .filter((d) => snap[d] != null).sort((a, b) => (snap[a] as number) - (snap[b] as number))
  const weakest = dims[0] ?? 'speaking'
  const second = dims[1] ?? weakest
  const difficulty = difficultyFor(snap.level)
  const picks: { q: any; dim: Dimension }[] = []
  for (const q1 of await findExercises(studentId, weakest, snap.weakest_sub_skill, difficulty)) if (picks.length < 3) picks.push({ q: q1, dim: weakest })
  for (const q2 of await findExercises(studentId, second, null, difficulty)) if (picks.length < 5 && !picks.some((p) => p.q.id === q2.id)) picks.push({ q: q2, dim: second })
  let weakestItems = 0
  for (const p of picks) {
    await assignPractice(studentId, runId, p.q.id, p.dim, p.q.sub_skill, `Weekly plan: ${p.dim}`)
    if (p.dim === weakest) weakestItems++
  }
  await assignPractice(studentId, runId, null, 'speaking', null, 'Weekly mock interview', weakest === 'speaking' ? 'hr' : 'self_intro')
  if (weakest === 'speaking') weakestItems++
  await notify(studentId, 'Your weekly plan is ready', `${picks.length + 1} activities, focused on ${weakest}.`, '/practice')
  return { total: picks.length + 1, weakest_items: weakestItems, weakest }
}
