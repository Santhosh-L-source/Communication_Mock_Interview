import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { cap, fmtDate, num } from '../../lib/format'
import { useApi } from '../../lib/useApi'

export function Practice() {
  const { data, loading } = useApi<any>('/me/plan')
  const attempts = useApi<any[]>('/attempts')
  const nav = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const open = async (qid: string) => {
    try { const a = await api(`/practice/${qid}/attempts`, { method: 'POST' }); nav(`/attempts/${a.id}/take`) } catch (e: any) { setError(e.message) }
  }
  if (loading) return <Spinner />
  const items = data?.items ?? []
  return (
    <div className="space-y-6">
      <PageHeader title="Your practice plan" subtitle={data?.plan ? `Week of ${data.plan.week_start}. Your coach picks activities for your weakest areas and updates them after each result.` : undefined} />
      <ErrorBox error={error} />
      <Card title="Assigned by your coach">
        {items.length === 0 ? <Empty>No practice yet. Finish your baseline and your coach will assign some.</Empty> : (
          <ul className="divide-y divide-slate-100">{items.map((i: any) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">{i.interview_type ? `Mock interview: ${cap(i.interview_type)}` : cap(i.target_dimension)}
                  {i.target_sub_skill && <Badge>{cap(i.target_sub_skill)}</Badge>}{i.status === 'done' && <Badge tone="good">Done{i.result_score != null ? ` · ${num(i.result_score)}` : ''}</Badge>}</div>
                {i.prompt && <p className="truncate text-sm text-slate-600">{i.prompt}</p>}
                <p className="text-xs text-slate-500">{i.reason}{i.due_date ? ` · due ${i.due_date}` : ''}</p>
              </div>
              {i.question_id ? <Button variant={i.status === 'done' ? 'secondary' : 'primary'} onClick={() => open(i.question_id)}>{i.status === 'done' ? 'Try again' : 'Start'}</Button>
                : <Button variant={i.status === 'done' ? 'secondary' : 'primary'} onClick={() => nav(`/interviews?type=${i.interview_type}`)}>Start interview</Button>}
            </li>))}</ul>
        )}
      </Card>
      <Card title="Recent practice results">
        {(attempts.data ?? []).filter((a) => !a.assessment_id).length === 0 ? <Empty>No practice attempts yet.</Empty> :
          <ul className="divide-y divide-slate-100">{attempts.data!.filter((a) => !a.assessment_id).slice(0, 10).map((a) => (
            <li key={a.id} className="flex justify-between py-2 text-sm"><Link className="text-brand-700" to={a.status === 'in_progress' ? `/attempts/${a.id}/take` : `/attempts/${a.id}`}>
              {cap(a.dimensions)} · {cap(a.kind)} · {fmtDate(a.started_at)}</Link><span>{a.status === 'evaluated' ? num(a.total_score) : cap(a.status)}</span></li>))}</ul>}
      </Card>
    </div>
  )
}
