// Deterministic stand-ins for AI judgements, used when AI_MOCK=true or no AI key is set.
// They react to answer length and a few simple signals so an offline demo still shows differences.
import type { InterviewScoring, ResponseScoring } from '@speakready/shared'

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function heuristicBand(text: string, key: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  if (words < 5) return 0
  let band = words < 25 ? 1 : words < 60 ? 2 : 3
  if (key === 'examples' && /\d/.test(text)) band++
  if (key === 'structure' && /\b(first|then|finally|because|so)\b/i.test(text)) band++
  if (key === 'etiquette' && /\b(thank|please|sure)\b/i.test(text)) band++
  if (key === 'tone' && /\b(dear|regards|kindly|thank)\b/i.test(text)) band++
  if (key === 'grammar' && /\b(i|we) (has|is going to went)\b/i.test(text)) band--
  band += hash(key + text) % 2 === 0 ? 0 : words > 60 ? 1 : 0
  return Math.max(0, Math.min(4, band))
}

export function mockResponseScoring(keys: string[], text: string): ResponseScoring {
  return {
    criteria: keys.map((key) => ({
      key, band: heuristicBand(text, key), reason: 'Offline estimate (AI is switched off): based on length and structure.',
      evidence: text ? [text.split(/[.!?]/)[0].slice(0, 120)] : [],
    })),
    strengths: ['You attempted every part of the task.', 'Your main point is understandable.'],
    improvements: ['Add one specific example with a number or result.', 'Use a clear opening and closing sentence.'],
    better_answer: 'An improved answer would open with the main point, give one concrete example with a result, and close politely.',
  }
}

export function mockInterviewScoring(keys: string[], answers: { seq: number; text: string }[]): InterviewScoring {
  const all = answers.map((a) => a.text).join(' ')
  return {
    criteria: keys.map((key) => ({
      key, band: heuristicBand(all.slice(0, 600), key), reason: 'Offline estimate (AI is switched off).',
      evidence: answers[0] ? [answers[0].text.slice(0, 120)] : [],
    })),
    per_question: answers.map((a) => ({
      turn_seq: a.seq, relevance: heuristicBand(a.text, 'relevance'), structure: heuristicBand(a.text, 'structure'),
      feedback: 'Answer the question directly first, then support it with one example.',
      better_answer: 'Start with a one-line answer, explain the situation briefly, what you did, and the result.',
    })),
    strengths: ['You stayed on topic for most answers.', 'You spoke in complete sentences.'],
    improvements: ['Use the STAR structure: situation, task, action, result.', 'Reduce filler words such as "um".',
      'Quantify results where you can.'],
  }
}
