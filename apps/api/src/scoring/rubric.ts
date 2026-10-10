import { one, q } from '../db'

export interface CriterionRow {
  key: string
  label: string
  group_name: string
  weight: number
  scored_by: 'computed' | 'ai' | 'ai_vision'
  band_descriptors: Record<string, string>
  applies_to_types: string[] | null
}
export interface ActiveRubric { id: string; name: string; version: number; criteria: CriterionRow[] }

export async function activeRubric(appliesTo: 'writing' | 'speaking' | 'interview'): Promise<ActiveRubric> {
  const r = await one<{ id: string; name: string; version: number }>(
    `select id, name, version from rubrics where applies_to = $1 and is_active order by version desc limit 1`, [appliesTo])
  if (!r) throw new Error(`No active ${appliesTo} rubric. Run npm run seed.`)
  const criteria = await q<CriterionRow>(
    `select key, label, group_name, weight, scored_by, band_descriptors, applies_to_types
       from rubric_criteria where rubric_id = $1 order by sort_order`, [r.id])
  return { ...r, criteria }
}

export interface Scored { key: string; band: number | null; weight: number; score: number | null; reason: string; evidence: string[] }

// band 0..4 -> marks (band / 4 * weight). N/A criteria (band null) are dropped and the rest scaled to 100.
export function computeMarks(criteria: { key: string; weight: number }[],
  judged: Record<string, { band: number | null; reason?: string; evidence?: string[] }>) {
  const items: Scored[] = criteria.map((c) => {
    const j = judged[c.key]
    const band = j?.band ?? null
    return {
      key: c.key, band, weight: c.weight,
      score: band == null ? null : +((band / 4) * c.weight).toFixed(2),
      reason: j?.reason ?? (band == null ? 'Not applicable' : ''),
      evidence: j?.evidence ?? [],
    }
  })
  const applicable = items.filter((i) => i.score != null)
  const weightSum = applicable.reduce((s, i) => s + i.weight, 0)
  const marks = applicable.reduce((s, i) => s + (i.score ?? 0), 0)
  const overall = weightSum ? +((marks / weightSum) * 100).toFixed(2) : 0
  return { items, overall }
}

export function rubricForPrompt(criteria: CriterionRow[]) {
  return criteria.map((c) =>
    `- ${c.key} (${c.label}, ${c.weight} marks): ` +
    Object.entries(c.band_descriptors).map(([b, d]) => `${b}=${d}`).join('; ')).join('\n')
}
