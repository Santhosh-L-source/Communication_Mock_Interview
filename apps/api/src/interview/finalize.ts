import { one, q } from '../db'
import { enqueue } from '../jobs/boss'
import { logger } from '../lib/logger'
import { putObject } from '../storage'
import { emitToSession } from './live'
import { refreshExcerpts } from './proctor'

const ending = new Set<string>()

// Saves transcript.json + transcript.txt, closes the session and queues scoring. Safe to call twice.
export async function endInterview(sessionId: string, reason: 'completed' | 'student_left' | 'integrity_terminated' | 'time_limit' | 'error') {
  if (ending.has(sessionId)) return
  ending.add(sessionId)
  try {
    const s = await one(`update interview_sessions set status = $2, ended_at = now(), end_reason = $3
                          where id = $1 and status in ('setup','in_progress') returning *`,
      [sessionId, reason === 'integrity_terminated' ? 'terminated' : 'completed', reason])
    if (!s) return

    // Practice sessions: notify the student then delete all data — no scoring, no storage
    if (s.is_practice) {
      emitToSession(sessionId, 'interview:ended', { reason })
      await q(`delete from proctoring_events where session_id = $1`, [sessionId])
      await q(`delete from interview_turns where session_id = $1`, [sessionId])
      await q(`delete from interview_sessions where id = $1`, [sessionId])
      logger.info({ sessionId }, 'practice session cleaned up')
      return
    }

    const turns = await q(`select seq, speaker, text, question_id, is_follow_up, started_ms, ended_ms, words, metrics
                             from interview_turns where session_id = $1 order by seq`, [sessionId])
    const base = `transcripts/${s.register_no}/${s.id}`
    await putObject(`${base}/transcript.json`, JSON.stringify({
      session_id: s.id, register_no: s.register_no, interview_type: s.interview_type,
      started_at: s.started_at, ended_at: s.ended_at, end_reason: reason, turns,
    }, null, 2), 'application/json', true)
    await putObject(`${base}/transcript.txt`, turns.map((t) =>
      `[${Math.round((t.started_ms ?? 0) / 1000)}s] ${t.speaker === 'ai' ? 'Interviewer' : 'Student'}: ${t.text}`).join('\n\n'), 'text/plain', true)
    await q(`update interview_sessions set transcript_path = $2 where id = $1`, [sessionId, `${base}/transcript.json`])
    await refreshExcerpts(sessionId)
    emitToSession(sessionId, 'interview:ended', { reason })
    if (turns.some((t) => t.speaker === 'student')) {
      await q(`update interview_sessions set status = 'scoring' where id = $1 and status in ('completed','terminated')`, [sessionId])
      await enqueue('score_interview', { sessionId }, { singletonKey: `score:${sessionId}` })
    }
  } catch (e) {
    logger.error({ e, sessionId }, 'ending interview failed')
    await q(`update interview_sessions set status = 'error', end_reason = 'error' where id = $1`, [sessionId])
  } finally {
    ending.delete(sessionId)
  }
}
