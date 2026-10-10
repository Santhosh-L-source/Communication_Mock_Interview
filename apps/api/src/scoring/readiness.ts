// Four-dimension readiness profile (R, W, L, S each 0-100) + level, stored as a snapshot.
// Recent activities count more: latest 50%, previous 30%, the one before 20%.
import { one, q } from '../db'

export type Dimension = 'reading' | 'writing' | 'listening' | 'speaking'
export const DIMENSIONS: Dimension[] = ['reading', 'writing', 'listening', 'speaking']

export function recencyAverage(values: number[]): number | null {
  const w = [0.5, 0.3, 0.2]
  const v = values.slice(0, 3)
  if (!v.length) return null
  const ws = w.slice(0, v.length)
  const total = ws.reduce((a, b) => a + b, 0)
  return +(v.reduce((s, x, i) => s + x * ws[i], 0) / total).toFixed(2)
}

export function levelFor(overall: number, dims: (number | null)[]): 1 | 2 | 3 | 4 {
  const present = dims.filter((d): d is number => d != null)
  const min = present.length ? Math.min(...present) : 0
  if (overall >= 80 && min >= 70) return 4
  if (overall >= 65 && min >= 55) return 3
  if (overall >= 45) return 2
  return 1
}

export function speakingScore(interview: number | null, spoken: number | null) {
  if (interview != null && spoken != null) return +(0.7 * interview + 0.3 * spoken).toFixed(2)
  return interview ?? spoken
}

async function mcqScores(studentId: string, dim: Dimension) {
  const rows = await q<{ pct: number }>(
    `select avg(case when r.is_correct then 100 else 0 end)::float as pct
       from attempts a join responses r on r.attempt_id = a.id join questions qu on qu.id = r.question_id
      where a.student_id = $1 and a.status = 'evaluated' and qu.dimension = $2 and qu.type in ('mcq','listening_mcq')
      group by a.id, a.submitted_at order by a.submitted_at desc limit 3`, [studentId, dim])
  return rows.map((r) => r.pct)
}

async function evaluatedScores(studentId: string, dim: Dimension) {
  const rows = await q<{ overall: number }>(
    `select e.overall from evaluations e
       join responses r on r.id = e.response_id join attempts a on a.id = r.attempt_id
       join questions qu on qu.id = r.question_id
      where a.student_id = $1 and qu.dimension = $2 and e.status = 'final'
      order by e.created_at desc limit 3`, [studentId, dim])
  return rows.map((r) => r.overall)
}

async function interviewScores(studentId: string) {
  const rows = await q<{ overall_score: number }>(
    `select overall_score from interview_sessions
      where student_id = $1 and status = 'scored' and overall_score is not null
        and integrity_status not in ('flagged','confirmed_cheating')
      order by ended_at desc limit 3`, [studentId])
  return rows.map((r) => r.overall_score)
}

export async function weakestSubSkill(studentId: string, dim: Dimension): Promise<string | null> {
  if (dim === 'reading' || dim === 'listening') {
    const r = await one<{ sub_skill: string }>(
      `select qu.sub_skill from responses r join attempts a on a.id = r.attempt_id join questions qu on qu.id = r.question_id
        where a.student_id = $1 and qu.dimension = $2 and a.status = 'evaluated'
        group by qu.sub_skill order by avg(case when r.is_correct then 1 else 0 end), count(*) desc limit 1`, [studentId, dim])
    return r?.sub_skill ?? null
  }
  const r = await one<{ criterion_key: string }>(
    `select cs.criterion_key from criterion_scores cs
       join evaluations e on e.id = cs.evaluation_id and e.status = 'final'
       left join responses r on r.id = e.response_id
       left join questions qu on qu.id = r.question_id
       left join interview_sessions s on s.id = e.interview_session_id
      where e.register_no = (select register_no from profiles where id = $1)
        and cs.score is not null and cs.turn_id is null
        and (qu.dimension = $2 or ($2 = 'speaking' and s.id is not null))
      group by cs.criterion_key order by avg(cs.score / cs.weight) asc limit 1`, [studentId, dim])
  return r?.criterion_key ?? null
}

export interface Snapshot {
  id: string; reading: number | null; writing: number | null; listening: number | null; speaking: number | null
  interview: number | null; overall: number; level: number; weakest_dimension: Dimension | null; weakest_sub_skill: string | null
  created_at: string
}

export async function latestSnapshot(studentId: string) {
  return one<Snapshot>(`select * from readiness_snapshots where student_id = $1 order by created_at desc limit 1`, [studentId])
}

export async function recalcReadiness(studentId: string, cause: string) {
  const previous = await latestSnapshot(studentId)
  const reading = recencyAverage(await mcqScores(studentId, 'reading'))
  const listening = recencyAverage(await mcqScores(studentId, 'listening'))
  const writing = recencyAverage(await evaluatedScores(studentId, 'writing'))
  const spoken = recencyAverage(await evaluatedScores(studentId, 'speaking'))
  const interview = recencyAverage(await interviewScores(studentId))
  const speaking = speakingScore(interview, spoken)
  const dims: Record<Dimension, number | null> = { reading, writing, listening, speaking }
  const present = DIMENSIONS.filter((d) => dims[d] != null)
  if (!present.length) return { snapshot: previous, previous, changed: false }
  const overall = +(present.reduce((s, d) => s + (dims[d] as number), 0) / present.length).toFixed(2)
  const level = levelFor(overall, Object.values(dims))
  const weakest = present.reduce((a, b) => ((dims[a] as number) <= (dims[b] as number) ? a : b))
  const sub = await weakestSubSkill(studentId, weakest)
  const snapshot = await one<Snapshot>(
    `insert into readiness_snapshots (student_id, reading, writing, listening, speaking, interview, overall, level,
       weakest_dimension, weakest_sub_skill, cause)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [studentId, reading, writing, listening, speaking, interview, overall, level, weakest, sub, cause])
  return { snapshot, previous, changed: true }
}
