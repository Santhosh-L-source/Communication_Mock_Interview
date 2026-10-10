export const LEVEL_NAMES: Record<number, string> = { 1: 'Foundation', 2: 'Developing', 3: 'Placement-ready', 4: 'Strong' }
export const DIMENSIONS = ['reading', 'writing', 'listening', 'speaking'] as const
export const cap = (s: string | null | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replaceAll('_', ' ') : '')
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '')
export const num = (v: number | null | undefined, digits = 0) => (v == null ? '–' : Number(v).toFixed(digits))
export const INTEGRITY_LABEL: Record<string, string> = {
  clean: 'Clean', needs_review: 'Needs review', flagged: 'Flagged', cleared: 'Cleared', confirmed_cheating: 'Confirmed malpractice',
}
