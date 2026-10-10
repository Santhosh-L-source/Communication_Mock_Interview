import { Link, useParams } from 'react-router-dom'
import { OverrideEditor } from '../../components/Override'
import { CriteriaTable, Feedback } from '../../components/Scores'
import { Badge, Card, ErrorBox, PageHeader, Spinner, Stat } from '../../components/ui'
import { cap, num } from '../../lib/format'
import { usePoll } from '../../lib/useApi'

const delta = (b: number | null, a: number | null) => (a == null || b == null ? null : +(a - b).toFixed(1))
const Delta = ({ v }: { v: number | null }) => v == null ? <span className="text-slate-400">–</span>
  : <span className={v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-700' : 'text-slate-500'}>{v > 0 ? '+' : ''}{v}</span>

export function AttemptResult() {
  const { id } = useParams()
  const { data, error, reload } = usePoll<any>(`/attempts/${id}/result`, (d) => d.status === 'evaluated')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  if (data.status !== 'evaluated')
    return <Card title="Scoring your answers…"><Spinner label="The AI is scoring your written and spoken answers. This usually takes under a minute." /></Card>
  const cmp = data.comparison
  return (
    <div className="space-y-6">
      <PageHeader title={data.assessment_title ?? 'Practice result'} subtitle={<>{cap(data.kind)} · <Link to="/" className="text-brand-700">Back to dashboard</Link></>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total" value={num(data.total_score, 1)} sub={cmp?.total_change != null ? <>Change: <Delta v={cmp.total_change} /></> : undefined} />
        {Object.entries(data.by_dimension).map(([k, v]: any) => <Stat key={k} label={cap(k)} value={num(v)} sub={cmp?.by_dimension?.[k] ? <>Before {num(cmp.by_dimension[k].before)} · <Delta v={delta(cmp.by_dimension[k].before, v)} /></> : undefined} />)}
      </div>
      {cmp && Object.keys(cmp.by_criterion).length > 0 && (
        <Card title="Before and after, per criterion (% of marks)">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(cmp.by_criterion).map(([k, v]: any) => (
            <div key={k} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{cap(k)}</span>
              <span>{num(v.before)} → {num(v.after)} (<Delta v={delta(v.before, v.after)} />)</span></div>))}</div>
        </Card>
      )}
      {data.responses.map((r: any, i: number) => (
        <Card key={r.id} title={<span className="flex items-center gap-2">Q{i + 1}. {cap(r.dimension)} <Badge>{cap(r.sub_skill)}</Badge></span>}
          action={r.evaluation ? <b>{num(r.evaluation.overall, 1)} / 100</b> : r.is_correct != null && <Badge tone={r.is_correct ? 'good' : 'bad'}>{r.is_correct ? 'Correct' : 'Incorrect'}</Badge>}>
          <p className="mb-3 text-sm font-medium">{r.prompt}</p>
          {r.options && (
            <ul className="mb-2 space-y-1 text-sm">{r.options.map((o: string, oi: number) => (
              <li key={oi} className={String(r.answer_key?.index) === String(oi) ? 'font-medium text-emerald-700' : r.selected_option === String(oi) ? 'text-red-700 line-through' : 'text-slate-600'}>
                {String(r.answer_key?.index) === String(oi) ? '✓ ' : r.selected_option === String(oi) ? '✗ ' : '• '}{o}</li>))}</ul>
          )}
          {r.answer_text && <details className="mb-3 text-sm"><summary className="cursor-pointer text-brand-700">{r.type === 'spoken' ? 'Transcript of your answer' : 'Your answer'}</summary>
            <p className="mt-2 whitespace-pre-line rounded bg-slate-50 p-3">{r.answer_text}</p></details>}
          {r.evaluation && (
            <div className="space-y-4">
              {r.evaluation.status === 'needs_review' && <Badge tone="warn">Waiting for review</Badge>}
              {r.evaluation.evaluator === 'trainer' && <Badge tone="info">Adjusted by admin: {r.evaluation.override_reason}</Badge>}
              <CriteriaTable criteria={r.evaluation.criteria ?? []} />
              <Feedback fb={r.evaluation.feedback} />
              <OverrideEditor evaluationId={r.evaluation.id} criteria={r.evaluation.criteria ?? []} onDone={reload} />
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
