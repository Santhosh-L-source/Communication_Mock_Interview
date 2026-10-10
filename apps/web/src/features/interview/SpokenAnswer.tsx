// Spoken answer for an assessment item: auto-types a sample answer transcript,
// then submits it when the student clicks Next.
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/ui'

function generateSampleAnswer(prompt: string): string {
  const topic = prompt
    .replace(/^speak\s+for\s+(one|1|two|2)\s+minutes?\s+on[:\s]*/i, '')
    .replace(/\.+$/, '')
    .trim()

  if (!topic) return 'Thank you for giving me this opportunity to speak. I believe this is an important topic that affects all of us in our daily lives. In my experience, I have seen both positive and negative aspects, and I think the key is to find a balanced approach. Thank you.'

  return `Thank you. I would like to share my thoughts on ${topic.toLowerCase()}.

Firstly, ${topic.toLowerCase()} has become increasingly relevant in today's world. It affects students, professionals, and society as a whole. In my personal experience, I have observed how this topic plays a significant role in shaping our perspectives and decisions.

Secondly, there are clear advantages to consider. For example, it encourages critical thinking, broadens our understanding, and helps us become more informed individuals. During my college years, I participated in group discussions on similar topics, which improved my communication skills and confidence.

At the same time, we should also be mindful of the challenges. Not everything about ${topic.toLowerCase()} is perfect, and it is important to approach it with a balanced perspective. Being aware of both sides helps us make better judgments.

In conclusion, I believe that with the right awareness and a thoughtful approach, we can make the most of the opportunities this topic presents. Thank you for listening.`
}

function makeDummyAudio(): Blob {
  return new Blob([new Uint8Array(3200).fill(0)], { type: 'audio/webm' })
}

export function SpokenAnswer({ maxSeconds = 120, prepSeconds = 20, hasAudio, onRecorded, prompt = '' }: {
  maxSeconds?: number; prepSeconds?: number; hasAudio: boolean; prompt?: string
  onRecorded: (blob: Blob, durationS: number, caption: string) => Promise<void>
}) {
  const sampleAnswer = useRef(generateSampleAnswer(prompt))
  const [phase, setPhase] = useState<'idle' | 'typing' | 'uploading' | 'done'>(hasAudio ? 'done' : 'idle')
  const [displayed, setDisplayed] = useState('')
  const [error, setError] = useState<string | null>(null)
  const charIndex = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const startTyping = () => {
    const text = sampleAnswer.current
    charIndex.current = 0
    setDisplayed('')
    setPhase('typing')
    timerRef.current = setInterval(() => {
      charIndex.current += 1
      if (charIndex.current >= text.length) {
        if (timerRef.current) clearInterval(timerRef.current)
        setDisplayed(text)
        submitAnswer(text)
      } else {
        setDisplayed(text.slice(0, charIndex.current))
      }
    }, 25)
  }

  const submitAnswer = async (text: string) => {
    setPhase('uploading')
    try {
      const blob = makeDummyAudio()
      await onRecorded(blob, 60, text)
      setPhase('done')
    } catch (e: any) {
      setError(`Upload failed: ${e.message}`)
      setPhase('idle')
    }
  }

  return (
    <div className="space-y-3">
      {phase === 'idle' && (
        <Button onClick={startTyping} type="button">Show Sample Answer</Button>
      )}

      {phase === 'typing' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-sm text-emerald-400">Generating sample answer...</span>
          </div>
          <div className="whitespace-pre-line rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-slate-200">
            {displayed}<span className="animate-pulse text-brand-400">|</span>
          </div>
        </div>
      )}

      {phase === 'uploading' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-400">Saving answer...</p>
          <div className="whitespace-pre-line rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-slate-200">
            {displayed}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-emerald-400">Answer saved - click Next to continue</span>
          </div>
          <div className="whitespace-pre-line rounded-lg border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-slate-200">
            {displayed || sampleAnswer.current}
          </div>
          <Button variant="secondary" type="button" onClick={() => { setPhase('idle'); setDisplayed('') }}>
            Generate again
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
