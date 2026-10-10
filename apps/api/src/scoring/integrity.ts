// Integrity score (0-100), kept separate from communication marks.
// Start at 100; High -20, Medium -8, Low -3. Vision check "rejected" = 0, "uncertain" = half.
import { q, one } from '../db'

export type Severity = 'info' | 'low' | 'medium' | 'high'
export const PENALTY: Record<Severity, number> = { info: 0, low: 3, medium: 8, high: 20 }

export function effectivePenalty(severity: Severity, verdict: string | null | undefined) {
  const base = PENALTY[severity] ?? 0
  if (verdict === 'rejected') return 0
  if (verdict === 'uncertain') return base / 2
  return base
}

export function integrityFrom(events: { penalty: number; event_type: string; ai_verdict: string | null }[]) {
  const score = Math.max(0, 100 - events.reduce((s, e) => s + Number(e.penalty), 0))
  const identityConfirmed = events.some((e) => e.event_type === 'face_mismatch' && e.ai_verdict === 'confirmed')
  const status = identityConfirmed || score < 50 ? 'flagged' : score < 80 ? 'needs_review' : 'clean'
  return { score: +score.toFixed(2), status: status as 'clean' | 'needs_review' | 'flagged' }
}

// Recomputes and stores the score. A status an admin already decided (cleared / confirmed) is never overwritten.
export async function recomputeIntegrity(sessionId: string) {
  const events = await q(`select penalty, event_type, ai_verdict from proctoring_events where session_id = $1`, [sessionId])
  const { score, status } = integrityFrom(events)
  return one<{ integrity_score: number; integrity_status: string }>(
    `update interview_sessions
        set integrity_score = $2,
            integrity_status = case when integrity_status in ('cleared','confirmed_cheating') then integrity_status
                                    else $3::integrity_status end
      where id = $1 returning integrity_score, integrity_status`, [sessionId, score, status])
}
