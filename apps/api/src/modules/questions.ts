import { Router } from 'express'
import { z } from 'zod'
import { audit } from '../audit'
import { requireRole } from '../auth'
import { generateExercise } from '../coach/agent'
import { one, q } from '../db'
import { ah, notFound } from '../lib/errors'

export const questions = Router()
const staffOnly = requireRole('admin')

const QuestionBody = z.object({
  dimension: z.enum(['reading', 'writing', 'listening', 'speaking']),
  sub_skill: z.string().min(2).max(60),
  type: z.enum(['mcq', 'short_text', 'long_text', 'listening_mcq', 'spoken', 'interview']),
  interview_type: z.enum(['hr', 'self_intro', 'project', 'technical', 'situational', 'jam']).nullable().optional(),
  difficulty: z.coerce.number().int().min(1).max(5),
  context: z.string().max(40).nullable().optional(),
  prompt: z.string().min(5).max(3000),
  passage: z.string().max(6000).nullable().optional(),
  options: z.array(z.string().min(1).max(400)).max(6).nullable().optional(),
  answer_index: z.coerce.number().int().min(0).max(5).nullable().optional(),
  expected_points: z.array(z.string().max(200)).max(8).optional(),
  time_limit_s: z.coerce.number().int().min(10).max(3600).nullable().optional(),
})

questions.get('/questions', staffOnly, ah(async (req, res) => {
  const { dimension, status, type, search } = req.query as Record<string, string | undefined>
  res.json(await q(
    `select id, dimension, sub_skill, type, interview_type, difficulty, context, prompt, passage, options, answer_key,
            expected_points, time_limit_s, status, source, version, for_student_id, created_at
       from questions
      where ($1::skill_dimension is null or dimension = $1) and ($2::content_status is null or status = $2)
        and ($3::question_type is null or type = $3) and ($4::text is null or prompt ilike '%' || $4 || '%')
        and for_student_id is null
      order by created_at desc limit 300`, [dimension || null, status || null, type || null, search || null]))
}))

questions.post('/questions', staffOnly, ah(async (req, res) => {
  const b = QuestionBody.parse(req.body)
  const row = await one(
    `insert into questions (dimension, sub_skill, type, interview_type, difficulty, context, prompt, passage, options, answer_key,
                            expected_points, time_limit_s, status, source, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft','trainer',$13) returning *`,
    [b.dimension, b.sub_skill, b.type, b.interview_type ?? null, b.difficulty, b.context ?? null, b.prompt, b.passage ?? null,
      b.options ? JSON.stringify(b.options) : null, b.answer_index != null ? JSON.stringify({ index: b.answer_index }) : null,
      b.expected_points ?? [], b.time_limit_s ?? null, req.user.id])
  await audit(req.user.id, 'question.create', 'questions', row.id, null, row)
  res.status(201).json(row)
}))

// Editing an approved question creates a new version and retires the old one.
questions.patch('/questions/:id', staffOnly, ah(async (req, res) => {
  const old = await one(`select * from questions where id = $1`, [req.params.id])
  if (!old) throw notFound()
  const b = QuestionBody.partial().parse(req.body)
  const merged = { ...old, ...b, options: b.options !== undefined ? b.options : old.options,
    answer_key: b.answer_index !== undefined ? (b.answer_index == null ? null : { index: b.answer_index }) : old.answer_key }
  const params = [merged.dimension, merged.sub_skill, merged.type, merged.interview_type, merged.difficulty, merged.context, merged.prompt,
    merged.passage, merged.options ? JSON.stringify(merged.options) : null, merged.answer_key ? JSON.stringify(merged.answer_key) : null,
    merged.expected_points ?? [], merged.time_limit_s]
  let row
  if (old.status === 'approved') {
    row = await one(`insert into questions (dimension, sub_skill, type, interview_type, difficulty, context, prompt, passage, options, answer_key,
                       expected_points, time_limit_s, status, source, version, created_by)
                     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft',$13,$14,$15) returning *`,
      [...params, old.source, old.version + 1, req.user.id])
    await q(`update questions set status = 'retired' where id = $1`, [old.id])
  } else {
    row = await one(`update questions set dimension=$1, sub_skill=$2, type=$3, interview_type=$4, difficulty=$5, context=$6, prompt=$7,
                       passage=$8, options=$9, answer_key=$10, expected_points=$11, time_limit_s=$12 where id = $13 returning *`, [...params, old.id])
  }
  await audit(req.user.id, 'question.update', 'questions', row.id, old, row)
  res.json(row)
}))

questions.post('/questions/:id/status', staffOnly, ah(async (req, res) => {
  const { status } = z.object({ status: z.enum(['approved', 'retired', 'draft']) }).parse(req.body)
  const row = await one(`update questions set status = $2::content_status, approved_by = case when $2::text = 'approved' then $3 else approved_by end
                          where id = $1 returning *`, [req.params.id, status, req.user.id])
  if (!row) throw notFound()
  await audit(req.user.id, `question.${status}`, 'questions', row.id, null, { status })
  res.json(row)
}))

// AI drafts a new item; it stays a draft until a trainer approves it.
questions.post('/questions/generate', staffOnly, ah(async (req, res) => {
  const b = z.object({ dimension: z.enum(['reading', 'writing', 'listening', 'speaking']), sub_skill: z.string().min(2).max(60),
    difficulty: z.coerce.number().int().min(1).max(5) }).parse(req.body)
  const ex = await generateExercise(req.user.id, b.dimension, b.sub_skill, b.difficulty)
  const row = await one(
    `insert into questions (dimension, sub_skill, type, difficulty, context, prompt, passage, options, answer_key, expected_points, status, source, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft','ai',$11) returning *`,
    [ex.dimension, ex.sub_skill, ex.type, ex.difficulty, ex.context ?? null, ex.prompt, ex.passage ?? null,
      ex.options ? JSON.stringify(ex.options) : null, ex.answer_index != null ? JSON.stringify({ index: ex.answer_index }) : null,
      ex.expected_points ?? [], req.user.id])
  await audit(req.user.id, 'question.ai_draft', 'questions', row.id, null, row)
  res.status(201).json(row)
}))

// Rubrics are public to every logged-in user (transparency requirement)
questions.get('/rubrics', ah(async (_req, res) => {
  res.json(await q(`select r.id, r.name, r.applies_to, r.version,
                           (select json_agg(c order by c.sort_order) from rubric_criteria c where c.rubric_id = r.id) as criteria
                      from rubrics r where r.is_active order by r.applies_to`))
}))
