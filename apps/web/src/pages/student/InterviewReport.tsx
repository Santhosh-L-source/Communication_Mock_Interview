import { Link, useParams } from 'react-router-dom'
import { OverrideEditor } from '../../components/Override'
import { CriteriaTable, Feedback } from '../../components/Scores'
import { Badge, Card, ErrorBox, integrityTone, PageHeader, Spinner, Stat } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { cap, fmtDate, INTEGRITY_LABEL, num } from '../../lib/format'
import { usePoll } from '../../lib/useApi'

const GROUPS: Record<string, string> = { language_delivery: 'Language & delivery', content_thinking: 'Content & thinking', presence: 'Presence & professionalism' }

export function InterviewReport() {
  const { id } = useParams()
  const { me } = useAuth()
  const { data, error, reload } = usePoll<any>(`/interviews/${id}/report`, (d) => ['scored', 'error'].includes(d.session.status) || !d.turns.some((t: any) => t.speaker === 'student'))
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const s = data.session
  if (s.status !== 'scored')
    return <Card title="Preparing your report…">{s.status === 'error' ? <ErrorBox error="Something went wrong while scoring. An admin has been notified." />
      : !data.turns.some((t: any) => t.speaker === 'student') ? <p className="text-sm">No answers were recorded in this interview.</p>
      : <Spinner label="Scoring your answers against the 13-criterion rubric. This usually takes under two minutes." />}</Card>

  const groups = Object.keys(GROUPS).map((g) => ({ g, items: data.criteria.filter((c: any) => c.group_name === g) }))
  const perQ = new Map<number, any>((data.evaluation?.feedback?.per_question ?? []).map((p: any) => [p.turn_seq, p]))
  const isStudent = me?.profile.role === 'student'
  return (
    <div className="space-y-6">
      <PageHeader title={`${cap(s.interview_type)} interview report`} subtitle={<>{fmtDate(s.started_at)} · {cap(s.end_reason)}{isStudent && <> · <Link to="/interviews" className="text-brand-700">Practise again</Link></>}</>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Overall" value={`${num(data.evaluation?.overall, 1)} / 100`} sub={data.evaluation?.evaluator === 'trainer' ? `Adjusted by admin: ${data.evaluation.override_reason}` : undefined} />
        <Stat label="Integrity" value={num(data.integrity.score)} sub={<Badge tone={integrityTone(data.integrity.status)}>{INTEGRITY_LABEL[data.integrity.status]}</Badge>} />
        <Stat label="Pace and fillers" value={`${num(data.evaluation?.metrics?.wpm)} wpm`} sub={`${num(data.evaluation?.metrics?.fillers_per_min, 1)} fillers per minute`} />
      </div>
      {data.integrity.events.length > 0 && (
        <Card title="Monitoring notes">
          <p className="mb-2 text-sm text-slate-600">These moments were flagged during your interview. An admin reviews them; your communication marks are kept separate.
            {data.integrity.review && <> Review decision: <b>{INTEGRITY_LABEL[data.integrity.review.decision]}</b>.</>}</p>
          <ul className="flex flex-wrap gap-2">{data.integrity.events.map((e: any, i: number) => <Badge key={i} tone={e.severity === 'high' ? 'bad' : 'warn'}>{cap(e.event_type)} · {new Date(e.occurred_at).toLocaleTimeString()}</Badge>)}</ul>
        </Card>
      )}
      <Card title="Feedback"><Feedback fb={data.evaluation?.feedback} /></Card>
      <div className="grid gap-6 lg:grid-cols-3">
        {groups.map(({ g, items }) => <Card key={g} title={`${GROUPS[g]} (${items.reduce((a: number, c: any) => a + (c.score ?? 0), 0).toFixed(1)} / ${items.reduce((a: number, c: any) => a + (c.score == null ? 0 : c.weight), 0)})`}><CriteriaTable criteria={items} /></Card>)}
      </div>
      {data.evaluation && <OverrideEditor evaluationId={data.evaluation.id} criteria={data.criteria} onDone={reload} />}
      <Card title="Question by question">
        <div className="space-y-4">{data.turns.map((t: any) => (
          <div key={t.seq} className={t.speaker === 'ai' ? '' : 'ml-4 border-l-2 border-emerald-200 pl-3'}>
            <p className="text-sm"><b>{t.speaker === 'ai' ? (t.is_follow_up ? 'Follow-up' : 'Interviewer') : 'You'}:</b> {t.text}</p>
            {t.speaker === 'student' && t.metrics?.speech && <p className="text-xs text-slate-500">{t.metrics.speech.wpm} wpm · {t.metrics.speech.fillers} fillers{t.metrics.gaze_on_screen_pct != null ? ` · looked at screen ${t.metrics.gaze_on_screen_pct}%` : ''}</p>}
            {perQ.get(t.seq) && <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
              <p><b>Relevance</b> {perQ.get(t.seq).relevance}/4 · <b>Structure</b> {perQ.get(t.seq).structure}/4. {perQ.get(t.seq).feedback}</p>
              <p className="mt-1 text-brand-700"><b>Better answer:</b> {perQ.get(t.seq).better_answer}</p></div>}
          </div>))}</div>
        {data.transcript_url && <a className="mt-4 inline-block text-sm text-brand-700" href={data.transcript_url} target="_blank" rel="noreferrer">Download transcript (JSON)</a>}
      </Card>
    </div>
  )
}
