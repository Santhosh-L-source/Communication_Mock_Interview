// Rubric definitions. The seed script writes these to rubrics / rubric_criteria (version 1);
// scoring always reads the active rubric from the database so trainers can publish new versions.

export type ScoredBy = 'computed' | 'ai' | 'ai_vision'
export type InterviewType = 'hr' | 'self_intro' | 'project' | 'technical' | 'situational' | 'jam'

export interface CriterionDef {
  key: string
  label: string
  group: string
  weight: number
  scored_by: ScoredBy
  bands: [string, string, string, string, string] // band 0..4
  applies_to_types?: InterviewType[] // undefined = all types
}

export interface RubricDef {
  name: string
  applies_to: 'writing' | 'speaking' | 'interview'
  criteria: CriterionDef[]
}

export const INTERVIEW_RUBRIC: RubricDef = {
  name: 'Interview rubric',
  applies_to: 'interview',
  criteria: [
    { key: 'grammar', label: 'Grammar & sentence formation', group: 'language_delivery', weight: 10, scored_by: 'ai',
      bands: ['Mostly unintelligible sentences', 'Frequent errors that change meaning', 'Several errors, meaning still clear',
        'Minor slips only (a few tense or agreement errors)', 'Almost no errors; complex sentences used correctly'] },
    { key: 'vocabulary', label: 'Vocabulary & word choice', group: 'language_delivery', weight: 7, scored_by: 'ai',
      bands: ['Very limited words', 'Basic words, repeated often, some slang', 'Adequate everyday words',
        'Good range, mostly professional', 'Precise, professional words; correct technical terms; no slang'] },
    { key: 'pronunciation', label: 'Pronunciation & clarity', group: 'language_delivery', weight: 7, scored_by: 'computed',
      bands: ['Hard to understand most words', 'Many words unclear', 'Some unclear words', 'Clear with rare unclear words',
        'Every word clear and easy to understand (accent is never penalised)'] },
    { key: 'fluency', label: 'Fluency & pace', group: 'language_delivery', weight: 8, scored_by: 'computed',
      bands: ['Long silences, very broken speech', 'Very slow or very fast, frequent long pauses', 'Uneven pace, some long pauses',
        'Mostly steady pace, few long pauses', 'Steady 120–160 words/min, natural pauses, no long silences'] },
    { key: 'fillers', label: 'Filler-word control', group: 'language_delivery', weight: 8, scored_by: 'computed',
      bands: ['9 or more fillers per minute', '6–9 fillers per minute', '4–6 fillers per minute', '2–4 fillers per minute',
        'Fewer than 2 fillers per minute'] },
    { key: 'relevance', label: 'Relevance to the question', group: 'content_thinking', weight: 10, scored_by: 'ai',
      bands: ['Does not answer the question', 'Mostly off-topic', 'Partly answers, drifts', 'Answers the question with minor drift',
        'Answers exactly what was asked, no drifting'] },
    { key: 'structure', label: 'Structure & coherence', group: 'content_thinking', weight: 10, scored_by: 'ai',
      bands: ['No discernible structure', 'Jumps between ideas', 'Some order but weak links', 'Clear order; STAR mostly followed',
        'Clear beginning, middle and end; ideas linked logically (STAR where relevant)'] },
    { key: 'situation_handling', label: 'Situation handling & problem solving', group: 'content_thinking', weight: 10, scored_by: 'ai',
      bands: ['No answer, or does not address the situation', 'Describes the situation but gives no clear action, or blames others',
        'Gives an action, but vague or not realistic; no result', 'Clear, realistic action with a result; limited reflection',
        'Takes ownership, weighs options, involves the right people, gives a measurable result and a lesson learned'] },
    { key: 'technical', label: 'Technical / domain accuracy', group: 'content_thinking', weight: 8, scored_by: 'ai',
      applies_to_types: ['technical', 'project'],
      bands: ['Incorrect concepts', 'Major inaccuracies', 'Partly correct, shallow', 'Correct, explained reasonably',
        'Correct concepts explained simply; can go deeper when followed up'] },
    { key: 'examples', label: 'Examples & evidence', group: 'content_thinking', weight: 7, scored_by: 'ai',
      bands: ['No examples', 'Generic claims only', 'One vague example', 'Specific example with some detail',
        'Specific real examples with numbers or outcomes'] },
    { key: 'confidence', label: 'Confidence & tone', group: 'presence', weight: 5, scored_by: 'ai',
      bands: ['Very hesitant or inappropriate tone', 'Nervous, apologetic, long hesitations', 'Somewhat hesitant',
        'Mostly calm and positive', 'Calm, positive, assertive without being arrogant'] },
    { key: 'eye_contact', label: 'Engagement & eye contact', group: 'presence', weight: 5, scored_by: 'computed',
      bands: ['Looks at the screen under 40% of the time', '40–55% of the time', '55–70% of the time', '70–85% of the time',
        'Looks at the camera most of the time (85%+)'] },
    { key: 'etiquette', label: 'Professional etiquette', group: 'presence', weight: 5, scored_by: 'ai',
      bands: ['Rude or inappropriate', 'Abrupt, no greeting or closing', 'Polite but minimal', 'Polite with greeting and closing',
        'Polite greeting and closing, respectful language, asks a sensible question when invited'] },
  ],
}

export const WRITING_RUBRIC: RubricDef = {
  name: 'Writing rubric',
  applies_to: 'writing',
  criteria: [
    { key: 'grammar', label: 'Grammar & mechanics', group: 'language', weight: 25, scored_by: 'ai',
      bands: ['Errors block meaning', 'Frequent errors', 'Several errors', 'Few minor errors', 'Almost error-free'] },
    { key: 'vocabulary', label: 'Vocabulary', group: 'language', weight: 20, scored_by: 'ai',
      bands: ['Very limited', 'Basic and repetitive', 'Adequate', 'Varied and appropriate', 'Precise and professional'] },
    { key: 'structure', label: 'Structure & organisation', group: 'content', weight: 20, scored_by: 'ai',
      bands: ['No organisation', 'Hard to follow', 'Some order', 'Clear paragraphs, logical flow',
        'Well organised: opening, body, clear close / call to action'] },
    { key: 'tone', label: 'Professional tone', group: 'content', weight: 15, scored_by: 'ai',
      bands: ['Inappropriate', 'Too casual or rude', 'Mixed tone', 'Mostly professional', 'Consistently professional and courteous'] },
    { key: 'relevance', label: 'Task relevance', group: 'content', weight: 20, scored_by: 'ai',
      bands: ['Off-task', 'Misses most requirements', 'Covers some requirements', 'Covers most requirements',
        'Covers every requirement of the task'] },
  ],
}

export const SPEAKING_RUBRIC: RubricDef = {
  name: 'Speaking rubric',
  applies_to: 'speaking',
  criteria: [
    { key: 'pronunciation', label: 'Clarity', group: 'delivery', weight: 20, scored_by: 'computed',
      bands: INTERVIEW_RUBRIC.criteria[2].bands },
    { key: 'fluency', label: 'Fluency & pace', group: 'delivery', weight: 20, scored_by: 'computed',
      bands: INTERVIEW_RUBRIC.criteria[3].bands },
    { key: 'fillers', label: 'Filler-word control', group: 'delivery', weight: 15, scored_by: 'computed',
      bands: INTERVIEW_RUBRIC.criteria[4].bands },
    { key: 'grammar', label: 'Grammar', group: 'language', weight: 15, scored_by: 'ai',
      bands: INTERVIEW_RUBRIC.criteria[0].bands },
    { key: 'vocabulary', label: 'Vocabulary', group: 'language', weight: 10, scored_by: 'ai',
      bands: INTERVIEW_RUBRIC.criteria[1].bands },
    { key: 'relevance', label: 'Relevance & content', group: 'content', weight: 20, scored_by: 'ai',
      bands: INTERVIEW_RUBRIC.criteria[5].bands },
  ],
}

export const ALL_RUBRICS = [INTERVIEW_RUBRIC, WRITING_RUBRIC, SPEAKING_RUBRIC]

export const LEVELS = [
  { level: 1, name: 'Foundation' },
  { level: 2, name: 'Developing' },
  { level: 3, name: 'Placement-ready' },
  { level: 4, name: 'Strong' },
] as const

export const INTERVIEW_TYPES: { value: InterviewType; label: string }[] = [
  { value: 'hr', label: 'HR / behavioural' },
  { value: 'self_intro', label: 'Self-introduction' },
  { value: 'project', label: 'Project explanation' },
  { value: 'technical', label: 'Technical explanation' },
  { value: 'situational', label: 'Situational' },
  { value: 'jam', label: 'JAM (just a minute)' },
]
