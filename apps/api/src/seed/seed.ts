// Idempotent: safe to run more than once. Usage: npm run seed
import { ALL_RUBRICS } from '@speakready/shared'
import { one, pool, q } from '../db'
import { ASSESSMENTS, COHORTS, QUESTIONS } from './data'

export async function seed() {
  for (const r of ALL_RUBRICS) {
    const exists = await one(`select id from rubrics where name = $1 and version = 1`, [r.name])
    if (exists) continue
    const row = await one(`insert into rubrics (name, applies_to, version) values ($1,$2,1) returning id`, [r.name, r.applies_to])
    for (const [i, c] of r.criteria.entries())
      await q(`insert into rubric_criteria (rubric_id, key, label, group_name, weight, scored_by, band_descriptors, applies_to_types, sort_order)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [row.id, c.key, c.label, c.group, c.weight, c.scored_by, JSON.stringify(Object.fromEntries(c.bands.map((b, k) => [k, b]))),
          c.applies_to_types ?? null, i])
  }
  const rubricId = async (appliesTo: string) => (await one(`select id from rubrics where applies_to = $1 and is_active order by version desc limit 1`, [appliesTo]))?.id

  const ids = new Map<string, string>()
  for (const s of QUESTIONS) {
    const existing = await one(`select id from questions where prompt = $1 and coalesce(passage,'') = coalesce($2,'') and status = 'approved' limit 1`,
      [s.prompt, s.passage ?? null])
    if (existing) { ids.set(s.key, existing.id); continue }
    const rub = s.type === 'spoken' ? await rubricId('speaking') : ['short_text', 'long_text'].includes(s.type) ? await rubricId('writing')
      : s.type === 'interview' ? await rubricId('interview') : null
    const row = await one(
      `insert into questions (dimension, sub_skill, type, interview_type, difficulty, context, prompt, passage, options, answer_key,
                              expected_points, rubric_id, time_limit_s, status, source)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'approved','trainer') returning id`,
      [s.dimension, s.sub_skill, s.type, s.interview_type ?? null, s.difficulty, s.context ?? null, s.prompt, s.passage ?? null,
        s.options ? JSON.stringify(s.options) : null, s.answer != null ? JSON.stringify({ index: s.answer }) : null,
        s.expected_points ?? [], rub, s.time_limit_s ?? null])
    ids.set(s.key, row.id)
  }

  for (const a of ASSESSMENTS) {
    if (await one(`select id from assessments where title = $1`, [a.title])) continue
    const row = await one(`insert into assessments (title, is_baseline, duration_min) values ($1, true, $2) returning id`, [a.title, a.duration_min])
    const keys = QUESTIONS.filter((s) => s.key.startsWith(a.prefix)).map((s) => s.key)
    for (const [i, k] of keys.entries())
      await q(`insert into assessment_items (assessment_id, question_id, position, points) values ($1,$2,$3,$4)`,
        [row.id, ids.get(k), i + 1, QUESTIONS.find((s) => s.key === k)!.type.endsWith('mcq') ? 1 : 3])
  }

  for (const c of COHORTS)
    if (!(await one(`select id from cohorts where name = $1`, [c.name])))
      await q(`insert into cohorts (name, department, batch_year) values ($1,$2,$3)`, [c.name, c.department, c.batch_year])

  const counts = await one(`select (select count(*) from rubrics)::int as rubrics, (select count(*) from questions)::int as questions,
                                   (select count(*) from assessments)::int as assessments`)
  console.log('Seed complete:', counts)
}

import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  seed().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1) })
}
