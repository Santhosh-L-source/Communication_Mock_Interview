import crypto from 'node:crypto'
import { Router } from 'express'
import { InterviewConfig, poolSizeFromDuration } from '@speakready/shared'
import { z } from 'zod'
import { audit } from '../audit'
import { forgetUser, requireRole } from '../auth'
import { one, q, tx } from '../db'
import { ah, badRequest, HttpError, notFound } from '../lib/errors'
import { supabaseAdmin } from '../supabase'

export const admin = Router()
admin.use('/admin', requireRole('admin'))

const NewUser = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(100),
  role: z.enum(['student', 'trainer', 'mentor', 'coordinator', 'admin']).default('student'),
  register_no: z.string().max(30).optional(),
  department: z.string().max(80).optional(),
  admission_year: z.coerce.number().int().min(2015).max(2099).optional(),
  cohort_id: z.string().uuid().optional(),
})

// Creates the Supabase Auth account (the sign-up trigger creates the profile) and emails a set-password link.
async function createUser(u: z.infer<typeof NewUser>, redirectTo?: string) {
  if (u.role === 'student' && !u.register_no) throw badRequest(`${u.email}: students need a register number`)
  const sb = supabaseAdmin()
  const { data, error } = await sb.auth.admin.createUser({
    email: u.email,
    email_confirm: true,
    user_metadata: { full_name: u.full_name, register_no: u.register_no, department: u.department, admission_year: u.admission_year },
    app_metadata: { role: u.role, cohort_id: u.cohort_id },
  })
  if (error) throw new HttpError(400, `${u.email}: ${error.message}`)
  await sb.auth.resetPasswordForEmail(u.email, redirectTo ? { redirectTo } : undefined)
  return data.user!.id
}

admin.get('/admin/users', ah(async (req, res) => {
  res.json(await q(`select p.id, p.full_name, p.email, p.role, p.register_no, p.department, p.admission_year,
                           case when p.admission_year is not null then extract(year from now())::int - p.admission_year + case when extract(month from now()) >= 6 then 1 else 0 end end as year_of_study,
                           p.created_at
                      from profiles p
                     where ($1::user_role is null or p.role = $1) order by p.role, p.register_no nulls last, p.full_name`, [req.query.role || null]))
}))

admin.post('/admin/users', ah(async (req, res) => {
  const u = NewUser.parse(req.body)
  const id = await createUser(u, req.body.redirect_to)
  await audit(req.user.id, 'user.create', 'profiles', id, null, u)
  res.status(201).json({ id })
}))

// Bulk invite from CSV text: email,full_name,register_no,department,admission_year
admin.post('/admin/users/bulk', ah(async (req, res) => {
  const b = z.object({ csv: z.string().min(5).max(500_000), cohort_id: z.string().uuid().optional(), redirect_to: z.string().optional() }).parse(req.body)
  const lines = b.csv.trim().split(/\r?\n/).filter(Boolean)
  const header = lines[0].toLowerCase().split(',').map((h) => h.trim())
  const start = header.includes('email') ? 1 : 0
  const cols = start ? header : ['email', 'full_name', 'register_no', 'department', 'admission_year']
  const results: { email: string; ok: boolean; error?: string }[] = []
  for (const line of lines.slice(start)) {
    const cells = line.split(',').map((c) => c.trim())
    const rec: any = Object.fromEntries(cols.map((c, i) => [c, cells[i] || undefined]))
    try {
      const u = NewUser.parse({ ...rec, role: 'student', cohort_id: b.cohort_id })
      await createUser(u, b.redirect_to)
      results.push({ email: u.email, ok: true })
    } catch (e: any) {
      results.push({ email: rec.email ?? line, ok: false, error: e.message })
    }
  }
  await audit(req.user.id, 'user.bulk_invite', 'profiles', null, null, { total: results.length, ok: results.filter((r) => r.ok).length })
  res.json({ results })
}))

admin.patch('/admin/users/:id', ah(async (req, res) => {
  const b = z.object({ role: z.enum(['student', 'trainer', 'mentor', 'coordinator', 'admin']).optional(), cohort_id: z.string().uuid().nullable().optional(),
    register_no: z.string().max(30).optional(), full_name: z.string().max(100).optional() }).parse(req.body)
  const before = await one(`select * from profiles where id = $1`, [req.params.id])
  if (!before) throw notFound()
  const row = await one(`update profiles set role = coalesce($2, role), cohort_id = case when $3 then $4::uuid else cohort_id end,
                           register_no = coalesce(upper($5), register_no), full_name = coalesce($6, full_name) where id = $1 returning *`,
    [req.params.id, b.role ?? null, b.cohort_id !== undefined, b.cohort_id ?? null, b.register_no ?? null, b.full_name ?? null])
  forgetUser(req.params.id)
  await audit(req.user.id, b.role && b.role !== before.role ? 'role.change' : 'user.update', 'profiles', row.id,
    { role: before.role, cohort_id: before.cohort_id, register_no: before.register_no }, b)
  res.json(row)
}))

// Staff assignments (trainer/mentor to a cohort or a single student)
admin.get('/admin/assignments', ah(async (_req, res) => {
  res.json(await q(`select sa.*, s.full_name as staff_name, s.role as staff_role, c.name as cohort, st.full_name as student_name, st.register_no
                      from staff_assignments sa join profiles s on s.id = sa.staff_id
                      left join cohorts c on c.id = sa.cohort_id left join profiles st on st.id = sa.student_id order by s.full_name`))
}))
admin.post('/admin/assignments', ah(async (req, res) => {
  const b = z.object({ staff_id: z.string().uuid(), relation: z.enum(['trainer', 'mentor']), cohort_id: z.string().uuid().optional(),
    student_id: z.string().uuid().optional() }).refine((v) => v.cohort_id || v.student_id, 'cohort_id or student_id').parse(req.body)
  const row = await one(`insert into staff_assignments (staff_id, relation, cohort_id, student_id) values ($1,$2,$3,$4) returning *`,
    [b.staff_id, b.relation, b.cohort_id ?? null, b.student_id ?? null])
  await audit(req.user.id, 'assignment.create', 'staff_assignments', row.id, null, row)
  res.status(201).json(row)
}))
admin.delete('/admin/assignments/:id', ah(async (req, res) => {
  const row = await one(`delete from staff_assignments where id = $1 returning *`, [req.params.id])
  await audit(req.user.id, 'assignment.delete', 'staff_assignments', req.params.id, row, null)
  res.json({ ok: true })
}))

// Assessments
admin.post('/admin/assessments', ah(async (req, res) => {
  const b = z.object({ title: z.string().min(3).max(120), duration_min: z.coerce.number().int().min(5).max(240), is_baseline: z.boolean().default(false),
    deadline: z.string().optional(), question_ids: z.array(z.string().uuid()).min(1).max(80) }).parse(req.body)
  const row = await tx(async (c) => {
    const { rows: [a] } = await c.query(`insert into assessments (title, is_baseline, duration_min, deadline, created_by) values ($1,$2,$3,$4,$5) returning *`,
      [b.title, b.is_baseline, b.duration_min, b.deadline ?? null, req.user.id])
    for (const [i, qid] of b.question_ids.entries())
      await c.query(`insert into assessment_items (assessment_id, question_id, position) values ($1,$2,$3)`, [a.id, qid, i + 1])
    return a
  })
  await audit(req.user.id, 'assessment.create', 'assessments', row.id, null, b)
  res.status(201).json(row)
}))

admin.get('/admin/assessments', ah(async (_req, res) => {
  res.json(await q(`select a.id, a.title, a.is_baseline, a.duration_min, a.deadline, a.created_at,
                           (select count(*)::int from assessment_items ai where ai.assessment_id = a.id) as items,
                           (select coalesce(sum(ai.points),0)::float from assessment_items ai where ai.assessment_id = a.id) as max_marks,
                           (select count(distinct at.student_id)::int from attempts at where at.assessment_id = a.id and at.status = 'evaluated') as completed_by
                      from assessments a order by a.created_at desc`))
}))
admin.get('/admin/assessments/:id/scores', ah(async (req, res) => {
  res.json(await q(
    `select p.register_no, p.full_name, p.department,
            at.status, at.total_score,
            (select coalesce(sum(ai.points),0)::float from assessment_items ai where ai.assessment_id = at.assessment_id) as max_marks,
            at.started_at, at.submitted_at
       from attempts at
       join profiles p on p.id = at.student_id
      where at.assessment_id = $1 and at.status in ('evaluated','submitted')
      order by at.total_score desc nulls last`, [req.params.id]))
}))

admin.get('/admin/interview-assignments/:id/scores', ah(async (req, res) => {
  res.json(await q(
    `select p.register_no, p.full_name, p.department,
            s.status, s.overall_score, s.integrity_score, s.integrity_status,
            s.started_at, s.ended_at, s.end_reason
       from interview_sessions s
       join profiles p on p.id = s.student_id
      where s.assignment_id = $1 and s.status in ('completed','scored','terminated') and not s.is_practice
      order by s.overall_score desc nulls last`, [req.params.id]))
}))

admin.get('/admin/scores/overall', ah(async (_req, res) => {
  const students = await q(`
    select p.id, p.register_no, p.full_name, p.email, p.department, p.year_of_study,
      (select json_agg(json_build_object(
          'assessment_id', a.id, 'title', a.title,
          'score', at.total_score,
          'max_marks', (select coalesce(sum(ai.points),0)::float from assessment_items ai where ai.assessment_id = a.id),
          'status', at.status, 'submitted_at', at.submitted_at
        ) order by at.submitted_at desc)
        from attempts at join assessments a on a.id = at.assessment_id
        where at.student_id = p.id and at.status in ('evaluated','submitted')
      ) as assessments,
      (select json_agg(json_build_object(
          'assignment_id', ia.id, 'title', ia.title,
          'score', s.overall_score, 'max_marks', 100,
          'integrity_score', s.integrity_score, 'integrity_status', s.integrity_status,
          'status', s.status, 'ended_at', s.ended_at
        ) order by s.ended_at desc)
        from interview_sessions s join interview_assignments ia on ia.id = s.assignment_id
        where s.student_id = p.id and s.status in ('completed','scored','terminated') and not s.is_practice
      ) as interviews
    from profiles p
    where p.role = 'student'
      and (exists (select 1 from attempts at where at.student_id = p.id and at.status in ('evaluated','submitted'))
        or exists (select 1 from interview_sessions s where s.student_id = p.id and s.status in ('completed','scored','terminated') and not s.is_practice))
    order by p.register_no, p.full_name`)
  res.json(students)
}))

admin.get('/admin/attempts/:id/proctor-events', ah(async (req, res) => {
  res.json(await q(
    `select id, event_type, severity, confidence, detected_by, occurred_at, duration_ms, snapshot_path, details
       from assessment_proctor_events where attempt_id = $1 order by occurred_at`, [req.params.id]))
}))

admin.get('/admin/interview-sessions/:id/proctor-events', ah(async (req, res) => {
  res.json(await q(
    `select id, event_type, severity, confidence, detected_by, occurred_at, duration_ms, snapshot_path, details
       from proctoring_events where session_id = $1 order by occurred_at`, [req.params.id]))
}))

admin.get('/admin/schedules', ah(async (_req, res) => {
  res.json(await q(`select sch.*, s.title, c.name as cohort from assessment_schedules sch join assessments s on s.id = sch.assessment_id
                      join cohorts c on c.id = sch.cohort_id order by sch.opens_at desc`))
}))
admin.post('/admin/schedules', ah(async (req, res) => {
  const b = z.object({ assessment_id: z.string().uuid(), cohort_id: z.string().uuid(), opens_at: z.string(), closes_at: z.string(),
    max_attempts: z.coerce.number().int().min(1).max(10).default(1) }).parse(req.body)
  const row = await one(`insert into assessment_schedules (assessment_id, cohort_id, opens_at, closes_at, max_attempts) values ($1,$2,$3,$4,$5) returning *`,
    [b.assessment_id, b.cohort_id, b.opens_at, b.closes_at, b.max_attempts])
  const students = await q(`select id from profiles where cohort_id = $1 and role = 'student'`, [b.cohort_id])
  for (const s of students)
    await q(`insert into notifications (user_id, title, body, link) values ($1,'New assessment scheduled',$2,'/')`, [s.id, `Opens ${new Date(b.opens_at).toLocaleString('en-IN')}`])
  await audit(req.user.id, 'schedule.create', 'assessment_schedules', row.id, null, row)
  res.status(201).json(row)
}))

// API keys for other systems (the key is shown once; only its SHA-256 is stored)
export const newApiKey = () => `sk_live_${crypto.randomBytes(24).toString('base64url')}`
export const hashKey = (k: string) => crypto.createHash('sha256').update(k).digest('hex')

admin.get('/admin/api-clients', ah(async (_req, res) => {
  res.json(await q(`select id, name, scopes, is_active, last_used_at, created_at from api_clients order by created_at desc`))
}))
admin.post('/admin/api-clients', ah(async (req, res) => {
  const b = z.object({ name: z.string().min(2).max(80) }).parse(req.body)
  const key = newApiKey()
  const row = await one(`insert into api_clients (name, key_hash) values ($1,$2) returning id, name, scopes, created_at`, [b.name, hashKey(key)])
  await audit(req.user.id, 'api_client.create', 'api_clients', row.id, null, { name: b.name })
  res.status(201).json({ ...row, api_key: key })
}))
admin.delete('/admin/api-clients/:id', ah(async (req, res) => {
  await q(`update api_clients set is_active = false where id = $1`, [req.params.id])
  await audit(req.user.id, 'api_client.revoke', 'api_clients', req.params.id)
  res.json({ ok: true })
}))

admin.get('/admin/webhooks', ah(async (_req, res) => {
  res.json(await q(`select id, name, url, is_active, last_status, last_error, created_at from webhooks order by created_at desc`))
}))
admin.post('/admin/webhooks', ah(async (req, res) => {
  const b = z.object({ name: z.string().min(2).max(80), url: z.string().url().startsWith('https://') }).parse(req.body)
  const secret = crypto.randomBytes(24).toString('hex')
  const row = await one(`insert into webhooks (name, url, secret) values ($1,$2,$3) returning id, name, url, created_at`, [b.name, b.url, secret])
  await audit(req.user.id, 'webhook.create', 'webhooks', row.id, null, b)
  res.status(201).json({ ...row, secret })
}))
admin.delete('/admin/webhooks/:id', ah(async (req, res) => {
  await q(`update webhooks set is_active = false where id = $1`, [req.params.id])
  await audit(req.user.id, 'webhook.disable', 'webhooks', req.params.id)
  res.json({ ok: true })
}))

const IC_DEFAULT = { interview_type: 'hr', difficulty: 2, duration_min: 10, planned_questions: 5 }

admin.get('/admin/interview-config', ah(async (_req, res) => {
  const row = await one(`select interview_type, difficulty, planned_questions, duration_min, updated_at from interview_config where id = true`)
  res.json(row ?? IC_DEFAULT)
}))

admin.put('/admin/interview-config', ah(async (req, res) => {
  const b = InterviewConfig.parse(req.body)
  const planned = poolSizeFromDuration(b.duration_min, b.interview_type)
  const before = await one(`select interview_type, difficulty, planned_questions, duration_min from interview_config where id = true`)
  const row = await one(
    `insert into interview_config (id, interview_type, difficulty, planned_questions, duration_min, updated_by)
     values (true, $1, $2, $3, $4, $5)
     on conflict (id) do update set interview_type = $1, difficulty = $2, planned_questions = $3, duration_min = $4, updated_by = $5, updated_at = now()
     returning interview_type, difficulty, planned_questions, duration_min, updated_at`,
    [b.interview_type, b.difficulty, planned, b.duration_min, req.user.id])
  await audit(req.user.id, 'interview_config.update', 'interview_config', null, before, b)
  res.json(row)
}))

// Interview assignments (AI interview tasks with deadlines)
admin.get('/admin/interview-assignments', ah(async (_req, res) => {
  res.json(await q(`select ia.*, ia.duration_min,
                           (select count(distinct s.student_id)::int from interview_sessions s where s.assignment_id = ia.id and s.status in ('completed','scored')) as completed_by
                      from interview_assignments ia order by ia.created_at desc`))
}))

admin.post('/admin/interview-assignments', ah(async (req, res) => {
  const b = z.object({
    title: z.string().min(3).max(120),
    interview_type: z.enum(['hr', 'self_intro', 'project', 'technical', 'situational', 'jam']).default('hr'),
    difficulty: z.coerce.number().int().min(1).max(5).default(2),
    duration_min: z.coerce.number().int().min(5).max(30).default(10),
    deadline: z.string().optional(),
  }).parse(req.body)
  const planned = poolSizeFromDuration(b.duration_min, b.interview_type)
  const row = await one(
    `insert into interview_assignments (title, interview_type, difficulty, planned_questions, duration_min, deadline, created_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning *`,
    [b.title, b.interview_type, b.difficulty, planned, b.duration_min, b.deadline ?? null, req.user.id])
  await audit(req.user.id, 'interview_assignment.create', 'interview_assignments', row.id, null, b)
  res.status(201).json(row)
}))

// Export assessment results as CSV
const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

admin.get('/admin/assessments/:id/export', ah(async (req, res) => {
  const a = await one(`select id, title from assessments where id = $1`, [req.params.id])
  if (!a) throw notFound()
  const rows = await q(
    `select p.register_no, p.full_name, p.department,
            case when p.admission_year is not null then extract(year from now())::int - p.admission_year + case when extract(month from now()) >= 6 then 1 else 0 end end as year_of_study,
            at.status, at.total_score, at.started_at, at.submitted_at,
            (select string_agg(distinct qu.dimension::text, ', ') from responses r join questions qu on qu.id = r.question_id where r.attempt_id = at.id) as dimensions
       from attempts at
       join profiles p on p.id = at.student_id
      where at.assessment_id = $1 and at.status in ('evaluated','submitted')
      order by at.total_score desc nulls last`, [a.id])
  const cols = ['register_no', 'full_name', 'department', 'year_of_study', 'status', 'total_score', 'started_at', 'submitted_at', 'dimensions']
  const header = ['Roll No', 'Name', 'Department', 'Year', 'Status', 'Score', 'Started', 'Submitted', 'Dimensions']
  await audit(req.user.id, 'assessment.export', 'assessments', a.id)
  res.setHeader('content-type', 'text/csv')
  res.setHeader('content-disposition', `attachment; filename="${a.title.replace(/[^a-z0-9]+/gi, '-')}-results.csv"`)
  res.send([header.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\n'))
}))

admin.get('/admin/interview-assignments/:id/export', ah(async (req, res) => {
  const a = await one(`select id, title from interview_assignments where id = $1`, [req.params.id])
  if (!a) throw notFound()
  const rows = await q(
    `select p.register_no, p.full_name, p.department,
            case when p.admission_year is not null then extract(year from now())::int - p.admission_year + case when extract(month from now()) >= 6 then 1 else 0 end end as year_of_study,
            s.status, s.overall_score, s.integrity_score, s.integrity_status, s.started_at, s.ended_at, s.end_reason
       from interview_sessions s
       join profiles p on p.id = s.student_id
      where s.assignment_id = $1 and s.status in ('completed','scored')
      order by s.overall_score desc nulls last`, [a.id])
  const cols = ['register_no', 'full_name', 'department', 'year_of_study', 'status', 'overall_score', 'integrity_score', 'integrity_status', 'started_at', 'ended_at', 'end_reason']
  const header = ['Roll No', 'Name', 'Department', 'Year', 'Status', 'Score', 'Integrity Score', 'Integrity Status', 'Started', 'Ended', 'End Reason']
  await audit(req.user.id, 'interview_assignment.export', 'interview_assignments', a.id)
  res.setHeader('content-type', 'text/csv')
  res.setHeader('content-disposition', `attachment; filename="${a.title.replace(/[^a-z0-9]+/gi, '-')}-results.csv"`)
  res.send([header.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\n'))
}))

admin.get('/admin/audit', ah(async (req, res) => {
  res.json(await q(`select a.*, p.full_name as actor_name from audit_log a left join profiles p on p.id = a.actor_id
                     where ($1::text is null or a.action like $1 || '%') order by a.id desc limit 300`, [req.query.action || null]))
}))

// Free-tier usage today + queue health
admin.get('/admin/overview', ah(async (_req, res) => {
  const usage = await q(`select provider, purpose, count(*)::int as calls, coalesce(sum(input_tokens),0)::int as input_tokens,
                                coalesce(sum(output_tokens),0)::int as output_tokens, coalesce(sum(audio_seconds),0)::float as audio_seconds,
                                round(avg(latency_ms))::int as avg_latency_ms
                           from ai_usage where created_at > date_trunc('day', now()) group by provider, purpose order by provider, purpose`)
  const live = await q(`select s.id, s.register_no, p.full_name, s.interview_type, s.started_at, s.integrity_score, s.integrity_status
                          from interview_sessions s join profiles p on p.id = s.student_id where s.status = 'in_progress' order by s.started_at`)
  const jobs = await q(`select name, state, count(*)::int as n from pgboss.job where created_on > now() - interval '1 day'
                         group by name, state order by name, state`).catch(() => [])
  const counts = await one(`select (select count(*)::int from profiles where role = 'student') as students,
                                   (select count(*)::int from interview_sessions where status = 'scored') as interviews_scored,
                                   (select count(*)::int from interview_sessions where integrity_status in ('needs_review','flagged')) as to_review,
                                   (select count(*)::int from alerts where status = 'open') as open_alerts`)
  res.json({ usage, live, jobs, counts })
}))
