// Optional second opinion on evidence photos. Photos are only ever sent to a self-hosted
// Ollama vision model (never to an online service). Without OLLAMA_URL the event stays unverified.
import { VisionVerdict } from '@speakready/shared'
import { config } from '../config'
import { logUsage } from './llm'

const QUESTIONS: Record<string, string> = {
  phone_detected: 'Is the person holding or looking at a mobile phone?',
  multiple_faces: 'Is there more than one person visible?',
  book_or_notes: 'Is the person reading a book, notes or paper?',
  no_face: 'Is there no person facing the camera?',
  looking_away: 'Is the person clearly looking away from the screen at something else?',
  random_check: 'Is there anything suspicious: a second person, a phone, or notes?',
}

export async function verifyPhoto(jpeg: Buffer, eventType: string, sessionId?: string) {
  if (!config.OLLAMA_URL || config.AI_MOCK) return null
  const question = QUESTIONS[eventType] ?? QUESTIONS.random_check
  const started = Date.now()
  try {
    const res = await fetch(`${config.OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.OLLAMA_VISION_MODEL,
        stream: false,
        format: 'json',
        messages: [{
          role: 'user',
          content: `This is a webcam photo from an online interview. ${question} ` +
            'Answer as JSON: {"verdict":"confirmed"|"rejected"|"uncertain","faces":number,"phone":boolean,' +
            '"notes_or_book":boolean,"reason":"short reason"}. "confirmed" means the suspicious thing is clearly visible.',
          images: [jpeg.toString('base64')],
        }],
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    const data: any = await res.json()
    await logUsage('vision_check', 'ollama', config.OLLAMA_VISION_MODEL, { latencyMs: Date.now() - started, sessionId })
    const parsed = VisionVerdict.safeParse(JSON.parse(data.message?.content ?? '{}'))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
