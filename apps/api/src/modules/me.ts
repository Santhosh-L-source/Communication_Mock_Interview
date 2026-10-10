import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { audit } from '../audit'
import { forgetUser } from '../auth'
import { one, q } from '../db'
import { ah, badRequest } from '../lib/errors'
import { notify } from '../lib/notify'
import { latestSnapshot } from '../scoring/readiness'
import { putObject } from '../storage'
import { planFor } from './students'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024 } })
export const me = Router()

me.get('/me', ah(async (req, res) => {
  const profile = await one(`select p.*,
    case when p.admission_year is not null then extract(year from now())::int - p.admission_year + case when extract(month from now()) >= 6 then 1 else 0 end end as year_of_study
    from profiles p where p.id = $1`, [req.user.id])
  const baseline = await one(`select a.id, a.status from attempts a join assessments s on s.id = a.assessment_id
                               where a.student_id = $1 and s.is_baseline order by a.started_at desc limit 1`, [req.user.id])
  const unread = await one(`select count(*)::int as n from notifications where user_id = $1 and read_at is null`, [req.user.id])
  res.json({ profile, readiness: await latestSnapshot(req.user.id), baseline, unread_notifications: unread!.n })
}))

me.patch('/me', ah(async (req, res) => {
  const body = z.object({
    full_name: z.string().min(2).max(100).optional(),
    department: z.string().max(80).optional(),
    admission_year: z.coerce.number().int().min(2015).max(2099).optional(),
    target_roles: z.array(z.string().max(60)).max(8).optional(),
  }).parse(req.body)
  const row = await one(`update profiles set full_name = coalesce($2, full_name), department = coalesce($3, department),
                           admission_year = coalesce($4, admission_year), target_roles = coalesce($5, target_roles)
                          where id = $1 returning *`,
    [req.user.id, body.full_name ?? null, body.department ?? null, body.admission_year ?? null, body.target_roles ?? null])
  forgetUser(req.user.id)
  res.json(row)
}))

me.post('/me/consent', ah(async (req, res) => {
  const body = z.object({ recording: z.literal(true), proctoring: z.literal(true) }).parse(req.body)
  await q(`update profiles set recording_consent_at = coalesce(recording_consent_at, now()),
                               proctoring_consent_at = coalesce(proctoring_consent_at, now()) where id = $1`, [req.user.id])
  await audit(req.user.id, 'consent.given', 'profiles', req.user.id, null, body)
  res.json({ ok: true })
}))

me.post('/me/resume', upload.single('file'), ah(async (req, res) => {
  if (!req.file || req.file.mimetype !== 'application/pdf') throw badRequest('Upload a PDF')
  const path = await putObject(`resumes/${req.user.id}/resume.pdf`, req.file.buffer, 'application/pdf', true)
  await q(`update profiles set resume_path = $2 where id = $1`, [req.user.id, path])
  res.json({ resume_path: path })
}))

me.get('/me/plan', ah(async (req, res) => res.json(await planFor(req.user.id))))

me.get('/me/notifications', ah(async (req, res) => {
  res.json(await q(`select * from notifications where user_id = $1 order by created_at desc limit 50`, [req.user.id]))
}))
me.post('/me/notifications/read', ah(async (req, res) => {
  await q(`update notifications set read_at = now() where user_id = $1 and read_at is null`, [req.user.id])
  res.json({ ok: true })
}))

// DPDP: a student can ask for their data to be deleted; an admin actions it (records are audit-relevant).
me.post('/me/delete-request', ah(async (req, res) => {
  await audit(req.user.id, 'data.delete_requested', 'profiles', req.user.id)
  for (const a of await q(`select id from profiles where role = 'admin'`))
    await notify(a.id, 'Data deletion request', `${req.user.full_name} (${req.user.register_no ?? req.user.email}) asked for their data to be deleted.`)
  res.json({ ok: true })
}))
