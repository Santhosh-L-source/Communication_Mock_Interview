import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts'
import { cap, LEVEL_NAMES, num } from '../lib/format'
import { Badge, ScoreBar } from './ui'

export function ReadinessRadar({ r }: { r: any }) {
  const data = ['reading', 'writing', 'listening', 'speaking'].map((k) => ({ dim: cap(k), score: r?.[k] ?? 0 }))
  return (
    <div className="h-64 w-full" aria-label="Readiness radar chart">
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid />
          <PolarAngleAxis dataKey="dim" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
          <Radar dataKey="score" stroke="#1d4ed8" fill="#1d4ed8" fillOpacity={0.3} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

export const LevelBadge = ({ level }: { level?: number | null }) =>
  level ? <Badge tone={level >= 3 ? 'good' : level === 2 ? 'warn' : 'bad'}>L{level} {LEVEL_NAMES[level]}</Badge> : <Badge>Not assessed</Badge>

export interface CriterionScore { key: string; label?: string; band: number | null; score: number | null; weight: number; reason?: string; evidence?: string[]; group_name?: string }

// Transparent rubric: each criterion, its weight, the band and why.
export function CriteriaTable({ criteria }: { criteria: CriterionScore[] }) {
  return (
    <div className="space-y-3">
      {criteria.map((c) => (
        <div key={c.key} className="rounded-lg border border-slate-100 p-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{c.label ?? cap(c.key)}</span>
            <span className="whitespace-nowrap text-slate-600">
              {c.score == null ? 'N/A' : `${num(c.score, 1)} / ${num(c.weight)}`}{c.band != null && <span className="ml-2 text-xs text-slate-400">band {c.band}/4</span>}
            </span>
          </div>
          {c.score != null && <div className="mt-2"><ScoreBar value={c.score} max={c.weight} /></div>}
          {c.reason && <p className="mt-2 text-sm text-slate-600">{c.reason}</p>}
          {c.evidence?.length ? <ul className="mt-1 space-y-0.5">{c.evidence.map((e, i) => <li key={i} className="text-xs italic text-slate-500">“{e}”</li>)}</ul> : null}
        </div>
      ))}
    </div>
  )
}

export function Feedback({ fb }: { fb: any }) {
  if (!fb) return null
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fb.strengths?.length > 0 && <div><h3 className="mb-1 text-sm font-semibold text-emerald-700">What went well</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{fb.strengths.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>}
      {fb.improvements?.length > 0 && <div><h3 className="mb-1 text-sm font-semibold text-amber-700">What to fix next</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">{fb.improvements.map((s: string, i: number) => <li key={i}>{s}</li>)}</ul></div>}
      {fb.better_answer && <div className="md:col-span-2"><h3 className="mb-1 text-sm font-semibold text-brand-700">An improved answer</h3>
        <p className="rounded-lg bg-brand-50 p-3 text-sm">{fb.better_answer}</p></div>}
    </div>
  )
}
