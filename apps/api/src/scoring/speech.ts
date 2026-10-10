// Speech metrics computed from Whisper word timestamps (no AI involved).
import type { Word } from '../ai/stt'

const SINGLE_FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'erm', 'er', 'ah', 'hmm', 'mm', 'basically', 'actually', 'literally'])
const DOUBLE_FILLERS = new Set(['you know', 'i mean', 'kind of', 'sort of'])

export interface SpeechMetrics {
  word_count: number
  speaking_time_s: number
  wpm: number
  pause_ratio: number
  longest_pause_s: number
  fillers: number
  fillers_per_min: number
  clarity: number // mean word confidence 0..1
  filler_words: string[]
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '')

export function speechMetrics(words: Word[], rawText = ''): SpeechMetrics {
  if (!words.length)
    return { word_count: 0, speaking_time_s: 0, wpm: 0, pause_ratio: 1, longest_pause_s: 0, fillers: 0, fillers_per_min: 0, clarity: 0, filler_words: [] }
  const first = words[0].start
  const last = words[words.length - 1].end
  const span = Math.max(1, last - first)
  let pauseTotal = 0
  let longest = 0
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end
    if (gap > 0.5) pauseTotal += gap
    if (gap > longest) longest = gap
  }
  const tokens = words.map((w) => norm(w.w))
  const fillerWords: string[] = []
  for (let i = 0; i < tokens.length; i++) {
    if (SINGLE_FILLERS.has(tokens[i])) fillerWords.push(tokens[i])
    else if (i + 1 < tokens.length && DOUBLE_FILLERS.has(`${tokens[i]} ${tokens[i + 1]}`)) fillerWords.push(`${tokens[i]} ${tokens[i + 1]}`)
  }
  // "like" counts only when used as a pause word ("like," in the punctuated transcript)
  const likeFillers = (rawText.match(/\blike,/gi) ?? []).length
  for (let i = 0; i < likeFillers; i++) fillerWords.push('like')
  const minutes = span / 60
  const content = words.length - fillerWords.length
  return {
    word_count: words.length,
    speaking_time_s: +span.toFixed(1),
    wpm: Math.round(content / minutes),
    pause_ratio: +(pauseTotal / span).toFixed(3),
    longest_pause_s: +longest.toFixed(2),
    fillers: fillerWords.length,
    fillers_per_min: +(fillerWords.length / minutes).toFixed(2),
    clarity: +(words.reduce((s, w) => s + (w.conf ?? 0.85), 0) / words.length).toFixed(3),
    filler_words: fillerWords,
  }
}

// Combine per-answer metrics into one set for the whole session (weighted by speaking time).
export function combineMetrics(list: SpeechMetrics[]): SpeechMetrics {
  const valid = list.filter((m) => m.word_count > 0)
  if (!valid.length) return speechMetrics([])
  const time = valid.reduce((s, m) => s + m.speaking_time_s, 0)
  const w = (f: (m: SpeechMetrics) => number) => valid.reduce((s, m) => s + f(m) * m.speaking_time_s, 0) / time
  const fillers = valid.reduce((s, m) => s + m.fillers, 0)
  return {
    word_count: valid.reduce((s, m) => s + m.word_count, 0),
    speaking_time_s: +time.toFixed(1),
    wpm: Math.round(w((m) => m.wpm)),
    pause_ratio: +w((m) => m.pause_ratio).toFixed(3),
    longest_pause_s: Math.max(...valid.map((m) => m.longest_pause_s)),
    fillers,
    fillers_per_min: +(fillers / (time / 60)).toFixed(2),
    clarity: +w((m) => m.clarity).toFixed(3),
    filler_words: valid.flatMap((m) => m.filler_words),
  }
}

export function fluencyBand(m: SpeechMetrics): number {
  if (m.word_count < 5) return 0
  let band = 4
  if (m.wpm < 120 || m.wpm > 160) band--
  if (m.wpm < 90 || m.wpm > 190) band--
  if (m.pause_ratio > 0.25) band--
  if (m.longest_pause_s > 3) band--
  if (m.longest_pause_s > 6) band--
  return Math.max(0, band)
}

export function fillerBand(m: SpeechMetrics): number {
  if (m.word_count < 5) return 0
  const f = m.fillers_per_min
  return f < 2 ? 4 : f < 4 ? 3 : f < 6 ? 2 : f < 9 ? 1 : 0
}

// Judges clarity (how sure Whisper is about each word), never native-likeness.
export function clarityBand(m: SpeechMetrics): number {
  if (m.word_count < 5) return 0
  const c = m.clarity
  return c >= 0.88 ? 4 : c >= 0.78 ? 3 : c >= 0.68 ? 2 : c >= 0.55 ? 1 : 0
}

export function eyeContactBand(pct: number | null | undefined): number | null {
  if (pct == null) return null
  return pct >= 85 ? 4 : pct >= 70 ? 3 : pct >= 55 ? 2 : pct >= 40 ? 1 : 0
}

export function explainMetric(key: string, m: SpeechMetrics, gazePct?: number | null): string {
  switch (key) {
    case 'fluency': return `${m.wpm} words/min (target 120–160), pauses ${Math.round(m.pause_ratio * 100)}% of the time, longest pause ${m.longest_pause_s}s.`
    case 'fillers': return `${m.fillers} fillers in ${Math.round(m.speaking_time_s)}s = ${m.fillers_per_min}/min (target under 4).`
    case 'pronunciation': return `Average word clarity ${Math.round(m.clarity * 100)}% (how clearly each word could be recognised).`
    case 'eye_contact': return gazePct == null ? 'Not measured.' : `Looked at the screen ${Math.round(gazePct)}% of answer time.`
    default: return ''
  }
}
