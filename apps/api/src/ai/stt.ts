// Speech-to-text with word timestamps: Whisper on the Groq free tier, or a self-hosted
// faster-whisper server with the same (OpenAI-compatible) API. Mock mode returns a canned answer.
import { aiEnabled, config } from '../config'
import { logUsage } from './llm'

export interface Word { w: string; start: number; end: number; conf: number }
export interface Transcript { text: string; words: Word[]; duration: number; model: string }

// A short prompt full of fillers makes Whisper keep "um" and "uh" instead of dropping them.
const FILLER_PROMPT = 'Umm, let me think, uh, so, like, you know, I mean...'

async function whisper(baseUrl: string, apiKey: string | null, model: string, audio: Buffer, mime: string) {
  const form = new FormData()
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : mime.includes('wav') ? 'wav' : 'webm'
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `answer.${ext}`)
  form.append('model', model)
  form.append('response_format', 'verbose_json')
  form.append('language', 'en')
  form.append('prompt', FILLER_PROMPT)
  form.append('timestamp_granularities[]', 'word')
  form.append('timestamp_granularities[]', 'segment')
  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
    body: form,
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`whisper ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json() as Promise<any>
}

function toTranscript(data: any, model: string): Transcript {
  const segments: any[] = data.segments ?? []
  const segConf = (t: number) => {
    const s = segments.find((x) => t >= x.start && t <= x.end)
    return s?.avg_logprob != null ? Math.min(1, Math.exp(s.avg_logprob)) : 0.85
  }
  const words: Word[] = (data.words ?? []).map((w: any) => ({
    w: String(w.word).trim(),
    start: Number(w.start),
    end: Number(w.end),
    conf: w.probability != null ? Number(w.probability) : segConf(Number(w.start)),
  }))
  return { text: String(data.text ?? '').trim(), words, duration: Number(data.duration ?? words.at(-1)?.end ?? 0), model }
}

export async function transcribe(audio: Buffer, mime: string, opts: { durationS?: number; sessionId?: string; mockText?: string } = {}): Promise<Transcript> {
  if (!aiEnabled() || !(config.GROQ_API_KEY || config.LOCAL_WHISPER_URL)) return mockTranscript(opts.durationS ?? 30, opts.mockText)
  const errors: string[] = []
  const tries: [string, string | null, string, string][] = []
  if (config.GROQ_API_KEY) tries.push(['https://api.groq.com/openai/v1', config.GROQ_API_KEY, config.GROQ_WHISPER_MODEL, 'groq'])
  if (config.LOCAL_WHISPER_URL) tries.push([`${config.LOCAL_WHISPER_URL}/v1`, null, 'whisper', 'local-whisper'])
  for (const [url, key, model, provider] of tries) {
    const started = Date.now()
    try {
      const data = await whisper(url, key, model, audio, mime)
      const t = toTranscript(data, `${provider}/${model}`)
      await logUsage('stt', provider, model, { audioSeconds: t.duration, latencyMs: Date.now() - started, sessionId: opts.sessionId })
      return t
    } catch (e: any) {
      errors.push(e.message)
    }
  }
  throw new Error(`speech-to-text failed: ${errors.join(' | ')}`)
}

const MOCK_ANSWERS = [
  'Sure. Um, in my final year project we built a placement portal for our college. I handled the backend using Node and Postgres, ' +
    'and I, uh, coordinated with two teammates on the design. We reduced manual work for the placement office by around forty percent.',
  'I would first listen to both team members and understand the actual problem. Then I would, you know, suggest a quick call ' +
    'to agree on the deadline and split the tasks clearly. Finally I would update the manager so there are no surprises.',
  'My strength is that I learn quickly. For example, I learned React in two weeks for a hackathon and our team, um, reached the final round.',
]

export function mockTranscript(durationS: number, text?: string): Transcript {
  // If no text provided or empty, return empty transcript (student said nothing)
  if (!text || text.trim().length === 0) {
    return { text: '', words: [], duration: Math.max(1, durationS || 0), model: 'mock' }
  }

  const chosen = text
  const tokens = chosen.split(/\s+/)
  const dur = Math.max(5, Math.min(durationS || tokens.length / 2.3, 120))
  const step = dur / tokens.length
  const words = tokens.map((w, i) => ({
    w: w.replace(/[.,!?]/g, ''), start: +(i * step).toFixed(2), end: +(i * step + step * 0.8).toFixed(2), conf: 0.9,
  }))
  return { text: chosen, words, duration: dur, model: 'mock' }
}
