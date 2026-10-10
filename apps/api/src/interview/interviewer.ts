// The AI interviewer: plans questions from the bank and decides follow-up / next / end after each answer.
// The model's JSON is validated; anything invalid falls back to the next planned question.
import { INTERVIEW_TYPES, InterviewerAction } from '@speakready/shared'
import { asData, DATA_RULE, generateJson } from '../ai/llm'
import { q } from '../db'

export interface PlannedQuestion { id: string | null; prompt: string; expected_points?: string[] }
export interface TurnLite { seq: number; speaker: 'ai' | 'student'; text: string; question_id: string | null; is_follow_up: boolean }

const FALLBACK: Record<string, string[]> = {
  hr: ['Tell me about yourself.', 'What are your greatest strengths?', 'Tell me about a weakness you are working on.',
    'Describe a time you handled a conflict in your team.', 'Why should we hire you?', 'Where do you see yourself in five years?'],
  self_intro: ['Please introduce yourself.', 'What motivated you to choose your branch of engineering?', 'What are you looking for in your first job?'],
  project: ['Explain your final year project in simple terms.', 'What was your specific role in the project?',
    'What was the hardest technical problem and how did you solve it?', 'What would you improve if you did it again?'],
  technical: ['Explain the difference between a process and a thread.', 'What happens when you type a URL into a browser?',
    'Explain what an API is to a non-technical person.', 'How would you find a bug that only happens in production?'],
  situational: ['Your teammate misses a deadline that affects you. What do you do?', 'A client asks for a feature two days before release. How do you respond?',
    'You disagree with your manager on an approach. What do you do?'],
  jam: ['Speak for one minute on: Is online learning better than classroom learning?', 'Speak for one minute on: Social media does more good than harm.',
    'Speak for one minute on: The most useful invention of the last 20 years.'],
}

export async function planQuestions(type: string, difficulty: number, n: number): Promise<PlannedQuestion[]> {
  const rows = await q<{ id: string; prompt: string; expected_points: string[] | null }>(
    `select id, prompt, expected_points from questions
      where type = 'interview' and interview_type = $1 and status = 'approved'
      order by abs(difficulty - $2) + random() limit $3`, [type, difficulty, n])
  const plan: PlannedQuestion[] = rows.map((r) => ({ id: r.id, prompt: r.prompt, expected_points: r.expected_points ?? [] }))
  for (const p of FALLBACK[type] ?? FALLBACK.hr) {
    if (plan.length >= n) break
    if (!plan.some((x) => x.prompt === p)) plan.push({ id: null, prompt: p })
  }
  // First question is always an introduction
  const introPrompt = type === 'self_intro' ? 'Please introduce yourself.' : 'Tell me about yourself.'
  plan.sort((a, b) => Number(/introduce|about yourself/i.test(b.prompt)) - Number(/introduce|about yourself/i.test(a.prompt)))
  if (!plan.some((p) => /introduce|about yourself/i.test(p.prompt)))
    plan.unshift({ id: null, prompt: introPrompt })
  // Fill remaining slots with dynamic placeholders — AI will generate these from conversation context
  while (plan.length < n) plan.push({ id: null, prompt: '__dynamic__' })
  return plan.slice(0, n).map((p, i) => ({ ...p, id: p.id ?? `builtin-${i}` }))
}

export function greeting(type: string, plan: PlannedQuestion[], durationMin?: number) {
  const label = INTERVIEW_TYPES.find((t) => t.value === type)?.label ?? 'practice'
  const timeNote = durationMin ? `We have about ${durationMin} minutes together.` : `I will ask you ${plan.length} questions.`
  return `Hello, and welcome to your ${label} interview. ${timeNote} ` +
    `Take a moment to think before you answer, and speak clearly. Let's begin. ${plan[0].prompt}`
}
export const CLOSING = 'Thank you for your time. That is the end of the interview. Your report will be ready in a couple of minutes.'

export function interviewProgress(plan: PlannedQuestion[], turns: TurnLite[]) {
  const aiTurns = turns.filter((t) => t.speaker === 'ai')
  const askedIds = new Set(aiTurns.filter((t) => !t.is_follow_up && t.question_id).map((t) => t.question_id!))
  const remaining = plan.filter((p) => !askedIds.has(p.id!))
  const lastMainIdx = aiTurns.map((t) => !t.is_follow_up).lastIndexOf(true)
  const followUpsOnCurrent = lastMainIdx < 0 ? 0 : aiTurns.slice(lastMainIdx + 1).filter((t) => t.is_follow_up).length
  const currentId = lastMainIdx < 0 ? null : aiTurns[lastMainIdx].question_id
  return { askedCount: askedIds.size, remaining, followUpsOnCurrent, currentId }
}

// Applies the rules to whatever the model proposed.
export function enforceRules(proposed: InterviewerAction, plan: PlannedQuestion[], turns: TurnLite[], remainingMin?: number): InterviewerAction {
  const { remaining, followUpsOnCurrent } = interviewProgress(plan, turns)
  const hasDynamic = remaining.some((r) => r.prompt === '__dynamic__')
  const maxFollowUps = remainingMin != null && remainingMin > (plan.length * 1) ? 2 : 1
  const next = (): InterviewerAction => remaining.length
    ? { action: 'next_question', question_id: remaining[0].id, text: remaining[0].prompt === '__dynamic__' ? proposed.text : `Thank you. ${remaining[0].prompt}` }
    : { action: 'end', text: CLOSING, question_id: null }
  if (proposed.action === 'follow_up') return followUpsOnCurrent < maxFollowUps ? { ...proposed, question_id: null } : next()
  if (proposed.action === 'end') {
    if (remainingMin != null && remainingMin <= 1.5) return { ...proposed, text: proposed.text || CLOSING }
    return remaining.length ? next() : { ...proposed, text: proposed.text || CLOSING }
  }
  // Dynamic questions: accept the AI's generated text and assign it to the next dynamic slot
  if (hasDynamic && proposed.text?.length > 10) {
    const dynSlot = remaining.find((r) => r.prompt === '__dynamic__')!
    return { action: 'next_question', question_id: dynSlot.id, text: proposed.text }
  }
  const chosen = remaining.find((r) => r.id === proposed.question_id)
  if (!chosen) return next()
  const text = proposed.text.toLowerCase().includes(chosen.prompt.toLowerCase().slice(0, 25)) ? proposed.text : `${proposed.text.split(/[.?!]/)[0].slice(0, 80)}. ${chosen.prompt}`
  return { action: 'next_question', question_id: chosen.id, text }
}

const SKIP_PATTERNS = /^(i\s*don'?t\s*know|no\s*idea|pass|skip|next\s*(please|question)?|i'?m\s*not\s*sure|nothing|can'?t\s*answer|no\s*comment|i\s*have\s*no|move\s*on)/i
const NO_SPEECH = /^\(no speech detected\)$|^$|^[\s]*$/

export function isSkipAnswer(text: string): boolean {
  const trimmed = text.trim()
  // Empty or no speech detected
  if (NO_SPEECH.test(trimmed) || trimmed.length < 3) return true
  // Very short answers with skip words
  if (trimmed.split(/\s+/).length <= 5 && SKIP_PATTERNS.test(trimmed)) return true
  return false
}

export async function decideNext(args: { type: string; targetRoles: string[]; plan: PlannedQuestion[]; turns: TurnLite[]; sessionId: string; startedAt?: string; durationMin?: number }) {
  const { remaining, followUpsOnCurrent, askedCount } = interviewProgress(args.plan, args.turns)
  const last = args.turns.filter((t) => t.speaker === 'student').at(-1)
  const skipped = last ? isSkipAnswer(last.text) : false
  const history = args.turns.slice(-6).map((t) => t.speaker === 'ai'
    ? `Interviewer: ${t.text}` : `Student: ${asData('student_answer', t.text)}`).join('\n')
  const hasDynamic = remaining.some((r) => r.prompt === '__dynamic__')

  const durationMin = args.durationMin ?? 10
  const elapsedMin = args.startedAt ? (Date.now() - new Date(args.startedAt).getTime()) / 60_000 : 0
  const remainingMin = Math.max(0, durationMin - elapsedMin)

  // Hard cutoff: <=1 min left — end immediately without calling AI
  if (remainingMin <= 1) return { action: 'end' as const, text: CLOSING, question_id: null }

  // If student skipped/passed, move to next question immediately
  if (skipped && remaining.length) {
    const next = remaining[0]
    const text = next.prompt === '__dynamic__'
      ? "That's alright, let's move on. Can you tell me about a project or experience you're proud of?"
      : `No problem, let's move on. ${next.prompt}`
    return { action: 'next_question' as const, question_id: next.id, text }
  }
  if (skipped && !remaining.length) return { action: 'end' as const, text: CLOSING, question_id: null }

  const fallback = (): InterviewerAction => {
    const words = (last?.text ?? '').split(/\s+/).filter(Boolean).length
    if (words > 0 && words < 25 && followUpsOnCurrent < 1)
      return { action: 'follow_up', text: 'Could you give me a specific example of that, with what you did and the result?', question_id: null }
    return remaining.length
      ? { action: 'next_question', text: remaining[0].prompt === '__dynamic__' ? 'Tell me more about your experience.' : `Thank you. ${remaining[0].prompt}`, question_id: remaining[0].id }
      : { action: 'end', text: CLOSING, question_id: null }
  }
  const dynamicInstruction = hasDynamic
    ? `\nIMPORTANT: Generate your next question based on what the student just said. ` +
      `Pick up on specific details, projects, skills, or experiences they mentioned and ask deeper questions about those. ` +
      `For example, if they mentioned a project, ask about their role or a challenge they faced. ` +
      `If they mentioned a skill, ask them to demonstrate it with an example. ` +
      `Do NOT repeat a question already asked. Make each question feel like a natural conversation.`
    : ''
  const plannedList = remaining.filter((r) => r.prompt !== '__dynamic__')

  const timeContext = `\nTime: ${Math.round(elapsedMin)} of ${durationMin} minutes elapsed, ~${Math.round(remainingMin)} minutes remaining.` +
    (remainingMin <= 2 ? ' TIME IS ALMOST UP — wrap up now and end the interview after this response.' :
     remainingMin <= 4 ? ' Running low on time — keep answers moving, skip follow-ups unless critical.' : '')

  try {
    const { data } = await generateJson({
      purpose: 'interviewer',
      sessionId: args.sessionId,
      timeoutMs: 8000,
      temperature: 0.5,
      race: true,
      system: `You are a friendly, professional campus placement interviewer running a ${args.type} interview for an Indian engineering student` +
        `${args.targetRoles.length ? ` aiming for ${args.targetRoles.join(', ')} roles` : ''}. Speak in short, clear sentences (under 45 words). ` +
        `Ask one thing at a time. Manage your pacing to cover all questions within the time limit. ` +
        `At most one follow-up per question; ask it only if the answer was vague, very short or missed the point. ` + DATA_RULE,
      user: (plannedList.length ? `Remaining planned questions:\n${plannedList.map((r) => `${r.id}: ${r.prompt}`).join('\n')}\n` : '') +
        `Questions asked so far: ${askedCount}/${args.plan.length}. Questions remaining: ${remaining.length}.\n` +
        `Follow-ups already asked on the current question: ${followUpsOnCurrent}\n` +
        timeContext +
        dynamicInstruction +
        `\n\nConversation so far:\n${history}\n\n` +
        'Decide the next step. Return JSON {"action":"follow_up"|"next_question"|"end","text":"what you say next (a brief acknowledgement plus the question)","question_id": id for next_question or null if generating a new question}. ' +
        'Use "end" only when no questions remain (0 remaining) or time is almost up.',
      schema: InterviewerAction,
      mock: fallback,
    })
    return enforceRules(data, args.plan, args.turns, remainingMin)
  } catch {
    return enforceRules(fallback(), args.plan, args.turns, remainingMin)
  }
}
