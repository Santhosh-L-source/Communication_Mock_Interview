import { z } from 'zod'

// ---------- AI outputs (every model answer is validated against these) ----------

export const InterviewerAction = z.object({
  action: z.enum(['follow_up', 'next_question', 'end']),
  text: z.string().min(1).max(1200),
  question_id: z.string().nullable().optional(),
})
export type InterviewerAction = z.infer<typeof InterviewerAction>

const Band = z.coerce.number().int().min(0).max(4)

export const CriterionJudgement = z.object({
  key: z.string(),
  band: Band.nullable(), // null = not applicable
  reason: z.string().max(600),
  evidence: z.array(z.string().max(300)).max(4).default([]),
})

export const InterviewScoring = z.object({
  criteria: z.array(CriterionJudgement).min(1),
  per_question: z.array(z.object({
    turn_seq: z.coerce.number().int(),
    relevance: Band,
    structure: Band,
    feedback: z.string().max(800),
    better_answer: z.string().max(1500),
  })).default([]),
  strengths: z.array(z.string()).min(1).max(4),
  improvements: z.array(z.string()).min(1).max(5),
})
export type InterviewScoring = z.infer<typeof InterviewScoring>

export const ResponseScoring = z.object({
  criteria: z.array(CriterionJudgement).min(1),
  strengths: z.array(z.string()).min(1).max(3),
  improvements: z.array(z.string()).min(1).max(4),
  better_answer: z.string().max(2000),
})
export type ResponseScoring = z.infer<typeof ResponseScoring>

export const GeneratedExercise = z.object({
  dimension: z.string().transform(v => v.toLowerCase()).pipe(z.enum(['reading', 'writing', 'listening', 'speaking'])),
  sub_skill: z.string().min(2).max(60),
  type: z.string().transform(v => v.toLowerCase()).pipe(z.enum(['mcq', 'short_text', 'long_text', 'listening_mcq', 'spoken'])),
  difficulty: z.coerce.number().int().min(1).max(5),
  context: z.string().max(40).optional(),
  prompt: z.string().min(10).max(1500),
  passage: z.string().max(4000).nullable().optional(),
  options: z.array(z.union([z.string(), z.record(z.unknown()).transform(o => (o as any).text ?? (o as any).option ?? JSON.stringify(o))]).pipe(z.string().min(1).max(300))).min(3).max(5).nullable().optional(),
  answer_index: z.coerce.number().int().min(0).max(4).nullable().optional(),
  expected_points: z.any().transform(v => {
    if (!v || !Array.isArray(v)) return []
    return v.slice(0, 6).map((x: unknown) => typeof x === 'string' ? x.slice(0, 200) : String(x).slice(0, 200))
  }),
}).superRefine((v, ctx) => {
  const isMcq = v.type === 'mcq' || v.type === 'listening_mcq'
  if (isMcq && (!v.options || v.answer_index == null || v.answer_index >= v.options.length))
    ctx.addIssue({ code: 'custom', message: 'MCQ needs options and a valid answer_index' })
  if ((v.dimension === 'reading' || v.dimension === 'listening') && !v.passage)
    ctx.addIssue({ code: 'custom', message: 'reading/listening items need a passage' })
})
export type GeneratedExercise = z.infer<typeof GeneratedExercise>

export const TargetCheck = z.object({ targets_sub_skill: z.boolean(), reason: z.string().max(300) })

export const PracticeChoice = z.object({
  question_id: z.string(),
  reason: z.string().max(300),
})

export const VisionVerdict = z.object({
  verdict: z.enum(['confirmed', 'rejected', 'uncertain']),
  faces: z.coerce.number().int().min(0).max(10).optional(),
  phone: z.boolean().optional(),
  notes_or_book: z.boolean().optional(),
  reason: z.string().max(300),
})

// ---------- API payloads ----------

export const PROCTOR_EVENT_TYPES = ['no_face', 'multiple_faces', 'face_mismatch', 'looking_away', 'phone_detected',
  'book_or_notes', 'second_voice', 'tab_switch', 'window_blur', 'fullscreen_exit', 'copy_paste', 'camera_off',
  'mic_off', 'virtual_camera', 'multiple_displays', 'script_reading', 'random_check'] as const
export type ProctorEventType = typeof PROCTOR_EVENT_TYPES[number]

export const ProctorEventInput = z.object({
  event_type: z.enum(PROCTOR_EVENT_TYPES),
  severity: z.enum(['info', 'low', 'medium', 'high']),
  confidence: z.coerce.number().min(0).max(1).optional(),
  occurred_at: z.string().datetime(),
  duration_ms: z.coerce.number().int().min(0).optional(),
  details: z.string().optional(), // JSON string (multipart)
})

export const CreateInterview = z.object({
  device_info: z.record(z.unknown()).optional(),
  company_style: z.string().max(40).optional(),
})

export const InterviewConfig = z.object({
  interview_type: z.enum(['hr', 'self_intro', 'project', 'technical', 'situational', 'jam']),
  difficulty: z.coerce.number().int().min(1).max(5),
  duration_min: z.coerce.number().int().min(5).max(30).default(10),
  planned_questions: z.coerce.number().int().min(2).max(15).optional(),
})
export type InterviewConfig = z.infer<typeof InterviewConfig>

export function poolSizeFromDuration(durationMin: number, type?: string): number {
  if (type === 'jam') return 3
  if (type === 'self_intro') return Math.min(Math.ceil(durationMin / 2), 4)
  return Math.min(Math.ceil(durationMin / 2), 15)
}
