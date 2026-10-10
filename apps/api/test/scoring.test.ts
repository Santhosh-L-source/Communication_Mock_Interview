import { describe, expect, it } from 'vitest'
import { enforceRules, type PlannedQuestion, type TurnLite } from '../src/interview/interviewer'
import { effectivePenalty, integrityFrom } from '../src/scoring/integrity'
import { levelFor, recencyAverage, speakingScore } from '../src/scoring/readiness'
import { computeMarks } from '../src/scoring/rubric'
import { clarityBand, fillerBand, fluencyBand, speechMetrics } from '../src/scoring/speech'

const words = (text: string, wps = 2.3, gapAt: number[] = []) => {
  let t = 0
  return text.split(' ').map((w, i) => {
    if (gapAt.includes(i)) t += 4
    const out = { w, start: t, end: t + 0.35, conf: 0.9 }
    t += 1 / wps
    return out
  })
}

describe('speech metrics', () => {
  it('counts fillers, pace and pauses', () => {
    const m = speechMetrics(words('um so I built a portal uh for our college and you know it saved time for the placement office staff'), 'um so ... like, it')
    expect(m.fillers).toBe(4) // um, uh, you know, like,
    expect(m.wpm).toBeGreaterThan(100)
    expect(fillerBand(m)).toBeLessThan(4)
  })
  it('penalises long silences', () => {
    const m = speechMetrics(words('I think the answer is that we should first understand the requirement clearly', 2.3, [5]))
    expect(m.longest_pause_s).toBeGreaterThan(3)
    expect(fluencyBand(m)).toBeLessThan(4)
  })
  it('clarity uses word confidence, not accent', () => {
    const m = speechMetrics(words('clear words spoken at a steady pace here'))
    expect(clarityBand(m)).toBe(4)
  })
})

describe('rubric marks', () => {
  it('converts bands to marks and scales N/A criteria to 100', () => {
    const { items, overall } = computeMarks(
      [{ key: 'grammar', weight: 10 }, { key: 'technical', weight: 8 }, { key: 'relevance', weight: 10 }],
      { grammar: { band: 3 }, technical: { band: null }, relevance: { band: 4 } })
    expect(items.find((i) => i.key === 'grammar')!.score).toBe(7.5)
    expect(items.find((i) => i.key === 'technical')!.score).toBeNull()
    expect(overall).toBe(87.5) // (7.5 + 10) / 20
  })
})

describe('integrity score', () => {
  it('subtracts penalties and sets the status', () => {
    expect(integrityFrom([{ penalty: 20, event_type: 'phone_detected', ai_verdict: null }]).status).toBe('clean')
    expect(integrityFrom([{ penalty: 20, event_type: 'x', ai_verdict: null }, { penalty: 8, event_type: 'y', ai_verdict: null }]))
      .toEqual({ score: 72, status: 'needs_review' })
    expect(integrityFrom([{ penalty: 20, event_type: 'a', ai_verdict: null }, { penalty: 20, event_type: 'b', ai_verdict: null },
      { penalty: 20, event_type: 'c', ai_verdict: null }]).status).toBe('flagged')
  })
  it('rejected verdicts cost nothing, uncertain costs half', () => {
    expect(effectivePenalty('high', 'rejected')).toBe(0)
    expect(effectivePenalty('high', 'uncertain')).toBe(10)
    expect(effectivePenalty('medium', null)).toBe(8)
  })
  it('a confirmed different person is always flagged', () => {
    expect(integrityFrom([{ penalty: 0, event_type: 'face_mismatch', ai_verdict: 'confirmed' }]).status).toBe('flagged')
  })
})

describe('readiness', () => {
  it('levels follow the thresholds', () => {
    expect(levelFor(40, [40, 40])).toBe(1)
    expect(levelFor(60, [60, 60])).toBe(2)
    expect(levelFor(70, [80, 50])).toBe(2) // a dimension below 55 blocks L3
    expect(levelFor(70, [70, 60])).toBe(3)
    expect(levelFor(85, [90, 72])).toBe(4)
  })
  it('recent activities count more', () => {
    expect(recencyAverage([80, 60, 40])).toBe(66)
    expect(recencyAverage([])).toBeNull()
    expect(speakingScore(70, 50)).toBe(64)
  })
})

describe('interviewer rules', () => {
  const plan: PlannedQuestion[] = [{ id: 'q1', prompt: 'Tell me about yourself.' }, { id: 'q2', prompt: 'Why should we hire you?' }]
  const turns: TurnLite[] = [
    { seq: 1, speaker: 'ai', text: 'Hello. Tell me about yourself.', question_id: 'q1', is_follow_up: false },
    { seq: 2, speaker: 'student', text: 'I am a student.', question_id: null, is_follow_up: false },
  ]
  it('allows one follow-up, then moves on', () => {
    expect(enforceRules({ action: 'follow_up', text: 'Tell me more.' }, plan, turns).action).toBe('follow_up')
    const after = [...turns, { seq: 3, speaker: 'ai' as const, text: 'Tell me more.', question_id: null, is_follow_up: true },
      { seq: 4, speaker: 'student' as const, text: 'More.', question_id: null, is_follow_up: false }]
    const next = enforceRules({ action: 'follow_up', text: 'Even more?' }, plan, after)
    expect(next).toMatchObject({ action: 'next_question', question_id: 'q2' })
  })
  it('never ends early or asks an unplanned question', () => {
    expect(enforceRules({ action: 'end', text: 'Bye' }, plan, turns)).toMatchObject({ action: 'next_question', question_id: 'q2' })
    expect(enforceRules({ action: 'next_question', text: 'What is your salary?', question_id: 'zzz' }, plan, turns).question_id).toBe('q2')
  })
})
