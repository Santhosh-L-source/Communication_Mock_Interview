import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../audit'
import { requireRole } from '../auth'
import { one, q } from '../db'
import { ah, notFound } from '../lib/errors'

export const cohorts = Router()

cohorts.get('/cohorts', ah(async (_req, res) => {
  res.json(await q(`select c.*, (select count(*)::int from profiles p where p.cohort_id = c.id and p.role = 'student') as students
                      from cohorts c order by c.batch_year desc nulls last, c.name`))
}))

cohorts.post('/cohorts', requireRole('admin'), ah(async (req, res) => {
  const b = z.object({ name: z.string().min(2).max(80), department: z.string().max(80).optional(), batch_year: z.coerce.number().int().optional() }).parse(req.body)
  const row = await one(`insert into cohorts (name, department, batch_year) values ($1,$2,$3) returning *`, [b.name, b.department ?? null, b.batch_year ?? null])
  await audit(req.user.id, 'cohort.create', 'cohorts', row.id, null, row)
  res.status(201).json(row)
}))

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s // no spreadsheet formulas
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

// Coordinator report: counts per level, per-dimension averages, student list (CSV with ?format=csv).
// Scores of interviews that are flagged or under review are hidden here until an admin decides.
cohorts.get('/cohorts/:id/report', requireRole('coordinator', 'admin', 'trainer'), ah(async (req, res) => {
  const c = await one(`select * from cohorts where id = $1`, [req.params.id])
  if (!c) throw notFound()
  const rows = await q(
    `select p.register_no, p.full_name, p.department, p.year_of_study, rs.reading, rs.writing, rs.listening, rs.speaking,
            rs.overall, rs.level, rs.weakest_dimension, ss.last_interview_score, ss.last_interview_integrity, ss.interviews_completed
       from profiles p
       left join lateral (select * from readiness_snapshots r where r.student_id = p.id order by created_at desc limit 1) rs on true
       left join export.student_scores ss on ss.register_no = p.register_no
      where p.cohort_id = $1 and p.role = 'student' order by rs.overall desc nulls last`, [c.id])
  const level = req.query.level ? Number(req.query.level) : null
  const list = level ? rows.filter((r) => r.level === level) : rows
  if (req.query.format === 'csv') {
    const cols = ['register_no', 'full_name', 'department', 'year_of_study', 'reading', 'writing', 'listening', 'speaking', 'overall', 'level',
      'weakest_dimension', 'last_interview_score', 'last_interview_integrity', 'interviews_completed']
    await audit(req.user.id, 'report.export', 'cohorts', c.id)
    res.setHeader('content-type', 'text/csv')
    res.setHeader('content-disposition', `attachment; filename="${c.name.replace(/[^a-z0-9]+/gi, '-')}-readiness.csv"`)
    return res.send([cols.join(','), ...list.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\n'))
  }
  const avg = (k: string) => {
    const v = rows.map((r) => r[k]).filter((x) => x != null)
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null
  }
  res.json({
    cohort: c,
    levels: [1, 2, 3, 4].map((l) => ({ level: l, count: rows.filter((r) => r.level === l).length })),
    not_assessed: rows.filter((r) => r.level == null).length,
    averages: Object.fromEntries(['reading', 'writing', 'listening', 'speaking', 'overall'].map((k) => [k, avg(k)])),
    students: list,
  })
}))

cohorts.get('/report', requireRole('coordinator', 'admin'), ah(async (req, res) => {
  const rows = await q(
    `select p.register_no, p.full_name, p.department,
            case when p.admission_year is not null then extract(year from now())::int - p.admission_year + case when extract(month from now()) >= 6 then 1 else 0 end end as year_of_study,
            rs.reading, rs.writing, rs.listening, rs.speaking,
            rs.overall, rs.level, rs.weakest_dimension, ss.last_interview_score, ss.last_interview_integrity, ss.interviews_completed
       from profiles p
       left join lateral (select * from readiness_snapshots r where r.student_id = p.id order by created_at desc limit 1) rs on true
       left join export.student_scores ss on ss.register_no = p.register_no
      where p.role = 'student' order by rs.overall desc nulls last`)
  const level = req.query.level ? Number(req.query.level) : null
  const list = level ? rows.filter((r) => r.level === level) : rows
  if (req.query.format === 'csv') {
    const cols = ['register_no', 'full_name', 'department', 'year_of_study', 'reading', 'writing', 'listening', 'speaking', 'overall', 'level',
      'weakest_dimension', 'last_interview_score', 'last_interview_integrity', 'interviews_completed']
    await audit(req.user.id, 'report.export', 'report', null)
    res.setHeader('content-type', 'text/csv')
    res.setHeader('content-disposition', 'attachment; filename="readiness-report.csv"')
    return res.send([cols.join(','), ...list.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\n'))
  }
  const avg = (k: string) => {
    const v = rows.map((r) => r[k]).filter((x) => x != null)
    return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : null
  }
  res.json({
    levels: [1, 2, 3, 4].map((l) => ({ level: l, count: rows.filter((r) => r.level === l).length })),
    not_assessed: rows.filter((r) => r.level == null).length,
    averages: Object.fromEntries(['reading', 'writing', 'listening', 'speaking', 'overall'].map((k) => [k, avg(k)])),
    students: list,
  })
}))
