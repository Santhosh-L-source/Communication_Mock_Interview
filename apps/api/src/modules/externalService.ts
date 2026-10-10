// Builds the v1 student report for other projects from export.student_report,
// replacing stored file paths with short-lived signed links.
import { q } from '../db'
import { signedUrls } from '../storage'

function toV1(row: any, urls: Record<string, string>) {
  return {
    api_version: 'v1',
    register_no: row.register_no,
    full_name: row.full_name,
    department: row.department,
    year_of_study: row.admission_year ? new Date().getFullYear() - row.admission_year + (new Date().getMonth() >= 5 ? 1 : 0) : row.year_of_study,
    readiness: row.readiness,
    malpractice_confirmed: row.malpractice_confirmed,
    interviews: (row.interviews ?? []).map((i: any) => {
      const { transcript_path, evidence, ...rest } = i
      return {
        ...rest,
        criteria: rest.criteria ?? {},
        transcript_url: transcript_path ? urls[transcript_path] ?? null : null,
        evidence: (evidence ?? []).map((e: any) => {
          const { photo_path, ...ev } = e
          return { ...ev, photo_url: photo_path ? urls[photo_path] ?? null : null }
        }),
      }
    }),
    updated_at: row.updated_at,
  }
}

async function sign(rows: any[], ttl: number) {
  const paths: string[] = []
  for (const r of rows)
    for (const i of r.interviews ?? []) {
      if (i.transcript_path) paths.push(i.transcript_path)
      for (const e of i.evidence ?? []) if (e.photo_path) paths.push(e.photo_path)
    }
  const urls = await signedUrls(paths, ttl)
  return rows.map((r) => toV1(r, urls))
}

export async function buildReports(registerNos: string[], ttl = 3600) {
  const rows = await q(`select * from export.student_report where register_no = any($1)`, [registerNos])
  return sign(rows, ttl)
}

export async function reportsUpdatedSince(since: string, page: number, cohort?: string, pageSize = 100) {
  const rows = await q(
    `select * from export.student_report
      where coalesce(updated_at, '-infinity') >= $1 and ($2::text is null or cohort = $2)
      order by updated_at nulls last, register_no limit $3 offset $4`,
    [since, cohort ?? null, pageSize + 1, (page - 1) * pageSize])
  const hasMore = rows.length > pageSize
  return { students: await sign(rows.slice(0, pageSize), 3600), next_page: hasMore ? page + 1 : null }
}
