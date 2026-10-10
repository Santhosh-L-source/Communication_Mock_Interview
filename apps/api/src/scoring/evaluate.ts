// Evaluation service: written answers, spoken answers and whole interviews.
import { InterviewScoring, ResponseScoring } from '@speakready/shared'
import { asData, DATA_RULE, generateJson, AiUnavailableError } from '../ai/llm'
import { transcribe } from '../ai/stt'
import { one, q, tx } from '../db'
import { getObject } from '../storage'
import { activeRubric, computeMarks, rubricForPrompt, type ActiveRubric } from './rubric'
import { mockInterviewScoring, mockResponseScoring } from './mock'
import { clarityBand, combineMetrics, explainMetric, eyeContactBand, fillerBand, fluencyBand, speechMetrics, type SpeechMetrics } from './speech'

const ASSESSOR = 'You are a fair communication assessor for campus placement in India. Judge clarity and content, ' +
  'never accent or native-likeness. Quote the student\'s own words as evidence. ' + DATA_RULE

interface Judged { band: number | null; reason: string; evidence: string[] }

async function saveEvaluation(args: {
  responseId?: string; sessionId?: string; rubric: ActiveRubric; modelId: string; overall: number
  feedback: unknown; metrics: unknown; status: 'final' | 'needs_review'
  items: { key: string; band: number | null; weight: number; score: number | null; reason: string; evidence: string[] }[]
  turnItems?: { key: string; turnId: string; band: number; weight: number; reason: string }[]
}) {
  return tx(async (c) => {
    const { rows: [ev] } = await c.query(
      `insert into evaluations (response_id, interview_session_id, evaluator, rubric_id, rubric_version, model_id, overall, feedback, metrics, status)
       values ($1,$2,'ai',$3,$4,$5,$6,$7,$8,$9) returning id`,
      [args.responseId ?? null, args.sessionId ?? null, args.rubric.id, args.rubric.version, args.modelId, args.overall,
        JSON.stringify(args.feedback), JSON.stringify(args.metrics), args.status])
    for (const i of args.items)
      await c.query(`insert into criterion_scores (evaluation_id, criterion_key, band, score, weight, reason, evidence)
                     values ($1,$2,$3,$4,$5,$6,$7)`, [ev.id, i.key, i.band, i.score, i.weight, i.reason, JSON.stringify(i.evidence)])
    for (const t of args.turnItems ?? [])
      await c.query(`insert into criterion_scores (evaluation_id, criterion_key, turn_id, band, score, weight, reason)
                     values ($1,$2,$3,$4,$5,$6,$7)`, [ev.id, t.key, t.turnId, t.band, +((t.band / 4) * t.weight).toFixed(2), t.weight, t.reason])
    return ev.id as string
  })
}

function computedJudgements(m: SpeechMetrics, gazePct: number | null): Record<string, Judged> {
  return {
    pronunciation: { band: clarityBand(m), reason: explainMetric('pronunciation', m), evidence: [] },
    fluency: { band: fluencyBand(m), reason: explainMetric('fluency', m), evidence: [] },
    fillers: { band: fillerBand(m), reason: explainMetric('fillers', m), evidence: m.filler_words.slice(0, 4) },
    eye_contact: { band: eyeContactBand(gazePct), reason: explainMetric('eye_contact', m, gazePct), evidence: [] },
  }
}

// ---------- Written or spoken answer in an assessment / practice ----------
export async function evaluateResponse(responseId: string, opts: { allowPartial?: boolean } = {}) {
  const r = await one(
    `select r.*, qu.prompt, qu.passage, qu.expected_points, qu.type, qu.dimension, qu.sub_skill, a.register_no
       from responses r join questions qu on qu.id = r.question_id join attempts a on a.id = r.attempt_id
      where r.id = $1`, [responseId])
  if (!r) throw new Error('response not found')
  const already = await one(`select id from evaluations where response_id = $1 and status in ('final','needs_review')`, [responseId])
  if (already) return already.id as string

  const spoken = r.type === 'spoken'
  const rubric = await activeRubric(spoken ? 'speaking' : 'writing')
  let text: string = r.answer_text ?? ''
  let metrics: SpeechMetrics | null = null

  if (spoken) {
    if (r.audio_path) {
      const audio = await getObject(r.audio_path)
      if (audio) {
        const t = await transcribe(audio, 'audio/webm', { durationS: Number(r.duration_s ?? 30) })
        text = t.text
        metrics = speechMetrics(t.words, t.text)
        await q(`update responses set answer_text = $2 where id = $1`, [responseId, text])
      }
    }
    metrics ??= speechMetrics([])
  }

  const aiKeys = rubric.criteria.filter((c) => c.scored_by === 'ai').map((c) => c.key)
  const judged: Record<string, Judged> = metrics ? computedJudgements(metrics, null) : {}
  let modelId = 'none'
  let status: 'final' | 'needs_review' = 'final'
  let feedback: any = {}

  // Check for empty, silent, or "no speech detected" responses
  const isEmptyResponse = !text || !text.trim() || text.trim() === '(no speech detected)' || text.trim().length < 3

  if (isEmptyResponse) {
    for (const k of aiKeys) judged[k] = { band: 0, reason: 'No answer given.', evidence: [] }
    feedback = { strengths: [], improvements: ['Attempt the question: even a short answer earns marks.'], better_answer: '' }
  } else {
    try {
      const { data, model } = await generateJson({
        purpose: 'scoring',
        system: ASSESSOR,
        user: `Task given to the student:\n${r.prompt}\n${r.passage ? `Reference text:\n${r.passage}\n` : ''}` +
          `${r.expected_points?.length ? `A good answer covers: ${r.expected_points.join('; ')}\n` : ''}` +
          `Score ONLY these criteria on bands 0-4:\n${rubricForPrompt(rubric.criteria.filter((c) => c.scored_by === 'ai'))}\n\n` +
          `${spoken ? 'This is a speech transcript; ignore punctuation.' : ''}\n${asData('student_answer', text)}\n\n` +
          'Return JSON: {"criteria":[{"key","band","reason","evidence":["quote"]}],"strengths":[2 items],' +
          '"improvements":[2-3 specific fixes],"better_answer":"an improved version of the answer"}',
        schema: ResponseScoring,
        mock: () => mockResponseScoring(aiKeys, text),
      })
      modelId = model
      for (const c of data.criteria) if (aiKeys.includes(c.key)) judged[c.key] = { band: c.band, reason: c.reason, evidence: c.evidence }
      feedback = { strengths: data.strengths, improvements: data.improvements, better_answer: data.better_answer }
    } catch (e) {
      if (!(e instanceof AiUnavailableError) || !opts.allowPartial) throw e
      status = 'needs_review'
      feedback = { strengths: [], improvements: ['AI scoring was unavailable; a trainer will review this answer.'], better_answer: '' }
    }
  }
  // A criterion the model skipped is marked for trainer review rather than silently scored 0
  for (const k of aiKeys) if (!judged[k]) { judged[k] = { band: null, reason: 'Not scored by AI.', evidence: [] }; status = 'needs_review' }

  const { items, overall } = computeMarks(rubric.criteria, judged)
  return saveEvaluation({ responseId, rubric, modelId, overall, feedback, metrics, status, items })
}

// ---------- Whole interview ----------
export async function scoreInterview(sessionId: string, opts: { allowPartial?: boolean } = {}) {
  const s = await one(`select * from interview_sessions where id = $1`, [sessionId])
  if (!s) throw new Error('session not found')
  const existing = await one(`select id from evaluations where interview_session_id = $1 and status in ('final','needs_review')`, [sessionId])
  if (existing) return existing.id as string

  const turns = await q(`select * from interview_turns where session_id = $1 order by seq`, [sessionId])
  const answers = turns.filter((t) => t.speaker === 'student')
  const rubric = await activeRubric('interview')
  const applicable = rubric.criteria.filter((c) => !c.applies_to_types || c.applies_to_types.includes(s.interview_type))
  const aiKeys = applicable.filter((c) => c.scored_by === 'ai').map((c) => c.key)

  const perAnswer: SpeechMetrics[] = answers.map((t) => t.metrics?.speech).filter(Boolean)
  const combined = combineMetrics(perAnswer)
  const gazes = answers.map((t) => t.metrics?.gaze_on_screen_pct).filter((g: any) => typeof g === 'number') as number[]
  const gazePct = gazes.length ? gazes.reduce((a, b) => a + b, 0) / gazes.length : null
  const judged: Record<string, Judged> = computedJudgements(combined, gazePct)
  for (const c of rubric.criteria) if (!applicable.includes(c)) judged[c.key] = { band: null, reason: 'Not applicable to this interview type.', evidence: [] }

  const transcript = turns.map((t) => `[turn ${t.seq}, ${t.speaker === 'ai' ? 'interviewer' : 'student'}] ${t.text}`).join('\n')
  let modelId = 'none'
  let status: 'final' | 'needs_review' = 'final'
  let feedback: any = { strengths: [], improvements: [], per_question: [] }
  const turnItems: { key: string; turnId: string; band: number; weight: number; reason: string }[] = []

  if (!answers.some((a) => a.text.trim())) {
    for (const k of aiKeys) judged[k] = { band: 0, reason: 'No spoken answers were recorded.', evidence: [] }
  } else {
    try {
      const { data, model } = await generateJson({
        purpose: 'scoring',
        sessionId,
        system: ASSESSOR,
        user: `Interview type: ${s.interview_type}. Difficulty ${s.difficulty}/5.\n` +
          `Score ONLY these criteria across the whole interview (bands 0-4):\n${rubricForPrompt(applicable.filter((c) => c.scored_by === 'ai'))}\n\n` +
          `Measured speech facts (context only): ${combined.wpm} words/min, ${combined.fillers_per_min} fillers/min.\n` +
          `Student answers are speech transcripts; ignore punctuation.\n${asData('transcript', transcript)}\n\n` +
          'Return JSON: {"criteria":[{"key","band","reason","evidence":["quote"]}],' +
          '"per_question":[{"turn_seq": <student turn number>,"relevance":0-4,"structure":0-4,"feedback":"...","better_answer":"..."}],' +
          '"strengths":[2 items],"improvements":[2-3 items]}',
        schema: InterviewScoring,
        mock: () => mockInterviewScoring(aiKeys, answers.map((a) => ({ seq: a.seq, text: a.text }))),
      })
      modelId = model
      for (const c of data.criteria) if (aiKeys.includes(c.key)) judged[c.key] = { band: c.band, reason: c.reason, evidence: c.evidence }
      // Confidence mixes the AI's judgement with measured delivery
      if (judged.confidence?.band != null) judged.confidence.band = Math.round((judged.confidence.band + fluencyBand(combined)) / 2)
      feedback = { strengths: data.strengths, improvements: data.improvements, per_question: data.per_question }
      for (const pq of data.per_question) {
        const turn = answers.find((a) => a.seq === pq.turn_seq)
        if (!turn) continue
        turnItems.push({ key: 'relevance', turnId: turn.id, band: pq.relevance, weight: 10, reason: pq.feedback })
        turnItems.push({ key: 'structure', turnId: turn.id, band: pq.structure, weight: 10, reason: pq.feedback })
      }
    } catch (e) {
      if (!(e instanceof AiUnavailableError) || !opts.allowPartial) throw e
      status = 'needs_review'
      feedback.improvements = ['AI scoring was unavailable; a trainer will review this interview.']
    }
  }
  for (const k of aiKeys) if (!judged[k]) { judged[k] = { band: null, reason: 'Not scored by AI.', evidence: [] }; status = 'needs_review' }

  const { items, overall } = computeMarks(rubric.criteria, judged)
  const evId = await saveEvaluation({ sessionId, rubric, modelId, overall, feedback, status, items, turnItems,
    metrics: { ...combined, gaze_on_screen_pct: gazePct } })
  await q(`update interview_sessions set overall_score = $2, status = 'scored' where id = $1`, [sessionId, overall])
  return evId
}
