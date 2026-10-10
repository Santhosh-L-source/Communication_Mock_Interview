import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../audit'
import { assertCanViewStudent, canViewStudent, requireRole } from '../auth'
import { weekStart } from '../coach/agent'
import { one, q } from '../db'
import { enqueue } from '../jobs/boss'
import { ah, notFound } from '../lib/errors'

export const students = Router()

export async function planFor(studentId: string) {
  const plan = await one(`select * from practice_plans where student_id = $1 and status = 'active' order by week_start desc limit 1`, [studentId])
  const items = plan ? await q(
    `select pi.*, qu.prompt, qu.type, qu.sub_skill, qu.difficulty,
            (select overall from evaluations e where e.id = pi.result_evaluation_id) as result_score
       from plan_items pi left join questions qu on qu.id = pi.question_id
      where pi.plan_id in (select id from practice_plans where student_id = $1 and week_start >= $2::date - 7)
      order by pi.status = 'pending' desc, pi.due_date nulls last`, [studentId, plan.week_start]) : []
  return { plan, items }
}

students.get('/students/:id/readiness', ah(async (req, res) => {
  await assertCanViewStudent(req.user, req.params.id)
  const history = await q(`select * from readiness_snapshots where student_id = $1 order by created_at`, [req.params.id])
  // Trend: slope per dimension over the last 5 snapshots (points per activity)
  const slope = (key: string) => {
    const v = history.slice(-5).map((h) => h[key]).filter((x) => x != null) as number[]
    if (v.length < 2) return null
    const n = v.length, xs = v.map((_, i) => i), mx = (n - 1) / 2, my = v.reduce((a, b) => a + b, 0) / n
    return +(xs.reduce((s, x, i) => s + (x - mx) * (v[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0)).toFixed(2)
  }
  res.json({ latest: history.at(-1) ?? null, history,
    trend: Object.fromEntries(['reading', 'writing', 'listening', 'speaking', 'overall'].map((k) => [k, slope(k)])) })
}))

students.get('/students/:id/plan', ah(async (req, res) => {
  await assertCanViewStudent(req.user, req.params.id)
  res.json(await planFor(req.params.id))
}))

// Staff: students they can see, with latest readiness
students.get('/students', requireRole('coordinator', 'admin'), ah(async (req, res) => {
  const { level, search } = req.query as Record<string, string | undefined>
  const rows = await q(
    `select p.id, p.full_name, p.register_no, p.department,
            case when p.admission_year is not null then extract(year from now())::int - p.admission_year + case when extract(month from now()) >= 6 then 1 else 0 end end as year_of_study,
            p.coach_paused,
            rs.reading, rs.writing, rs.listening, rs.speaking, rs.interview, rs.overall, rs.level, rs.weakest_dimension, rs.created_at as readiness_at,
            (select count(*)::int from alerts al where al.student_id = p.id and al.status in ('open','in_progress')) as open_alerts
       from profiles p
       left join lateral (select * from readiness_snapshots r where r.student_id = p.id order by created_at desc limit 1) rs on true
      where p.role = 'student' and ($1::int is null or rs.level = $1)
        and ($2::text is null or p.full_name ilike '%'||$2||'%' or p.register_no ilike '%'||$2||'%')
      order by p.register_no`, [level ? Number(level) : null, search || null])
  res.json(rows)
}))

students.get('/students/:id', requireRole('coordinator', 'admin'), ah(async (req, res) => {
  await assertCanViewStudent(req.user, req.params.id)
  const profile = await one(`select p.id, p.full_name, p.email, p.register_no, p.department, p.target_roles, p.coach_paused,
                                    case when p.admission_year is not null then extract(year from now())::int - p.admission_year + case when extract(month from now()) >= 6 then 1 else 0 end end as year_of_study,
                                    p.created_at from profiles p where p.id = $1`, [req.params.id])
  if (!profile) throw notFound()
  const alerts = await q(`select * from alerts where student_id = $1 order by created_at desc limit 20`, [req.params.id])
  const runs = req.user.role === 'coordinator' ? [] : await q(
    `select r.*, (select json_agg(s order by s.seq) from agent_steps s where s.run_id = r.id) as steps
       from agent_runs r where r.student_id = $1 order by r.started_at desc limit 5`, [req.params.id])
  res.json({ profile, alerts, agent_runs: runs })
}))

students.post('/students/:id/coach', requireRole('trainer', 'mentor', 'admin'), ah(async (req, res) => {
  await assertCanViewStudent(req.user, req.params.id)
  const b = z.object({ action: z.enum(['run', 'weekly', 'pause', 'resume']) }).parse(req.body)
  if (b.action === 'pause' || b.action === 'resume') {
    await q(`update profiles set coach_paused = $2 where id = $1`, [req.params.id, b.action === 'pause'])
    await audit(req.user.id, `coach.${b.action}`, 'profiles', req.params.id)
    return res.json({ ok: true })
  }
  const key = b.action === 'weekly' ? `weekly:${req.params.id}:${weekStart()}:manual:${Date.now()}` : `manual:${req.params.id}:${Date.now()}`
  await enqueue('coach_run', { studentId: req.params.id, trigger: b.action === 'weekly' ? 'weekly' : 'manual', key })
  await audit(req.user.id, 'coach.run', 'profiles', req.params.id, null, b)
  res.json({ queued: true })
}))

// ---------- Alerts and interventions ----------
students.get('/alerts', requireRole('trainer', 'mentor', 'admin'), ah(async (req, res) => {
  const rows = await q(`select al.*, p.full_name, p.register_no from alerts al join profiles p on p.id = al.student_id
                         where al.status = any($1) order by al.created_at desc limit 200`,
    [req.query.all ? ['open', 'in_progress', 'resolved', 'dismissed'] : ['open', 'in_progress']])
  const out = []
  for (const r of rows) if (await canViewStudent(req.user, r.student_id)) out.push(r)
  res.json(out)
}))

students.post('/alerts/:id/interventions', requireRole('trainer', 'mentor', 'admin'), ah(async (req, res) => {
  const b = z.object({ action: z.string().min(2).max(200), notes: z.string().max(2000).optional(), due_date: z.string().optional(),
    outcome: z.string().max(1000).optional(), status: z.enum(['in_progress', 'resolved', 'dismissed']).optional() }).parse(req.body)
  const al = await one(`select * from alerts where id = $1`, [req.params.id])
  if (!al) throw notFound()
  await assertCanViewStudent(req.user, al.student_id)
  const row = await one(`insert into interventions (alert_id, staff_id, action, notes, due_date, outcome) values ($1,$2,$3,$4,$5,$6) returning *`,
    [al.id, req.user.id, b.action, b.notes ?? null, b.due_date || null, b.outcome ?? null])
  const status = b.status ?? 'in_progress'
  await q(`update alerts set status = $2, assigned_to = coalesce(assigned_to, $3),
                             resolved_at = case when $2 in ('resolved','dismissed') then now() end where id = $1`, [al.id, status, req.user.id])
  await audit(req.user.id, 'alert.intervention', 'alerts', al.id, { status: al.status }, { ...b, status })
  res.status(201).json(row)
}))

students.get('/alerts/:id/interventions', requireRole('trainer', 'mentor', 'admin'), ah(async (req, res) => {
  const al = await one(`select student_id from alerts where id = $1`, [req.params.id])
  if (!al || !(await canViewStudent(req.user, al.student_id))) throw notFound()
  res.json(await q(`select i.*, p.full_name as staff_name from interventions i join profiles p on p.id = i.staff_id where alert_id = $1 order by created_at`, [req.params.id]))
}))
