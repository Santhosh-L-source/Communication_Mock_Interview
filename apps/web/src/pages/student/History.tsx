import { Link } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Card, Empty, integrityTone, PageHeader, Spinner, Table, Td } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { cap, fmtDate, INTEGRITY_LABEL, num } from '../../lib/format'
import { useApi } from '../../lib/useApi'

export function ReadinessChart({ history }: { history: any[] }) {
  const data = history.map((h) => ({ ...h, date: new Date(h.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }))
  const colors: Record<string, string> = { reading: '#0ea5e9', writing: '#8b5cf6', listening: '#f59e0b', speaking: '#10b981', overall: '#1d4ed8' }
  return (
    <div className="h-72"><ResponsiveContainer><LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey="date" fontSize={12} /><YAxis domain={[0, 100]} fontSize={12} /><Tooltip /><Legend />
      {Object.entries(colors).map(([k, c]) => <Line key={k} dataKey={k} name={cap(k)} stroke={c} strokeWidth={k === 'overall' ? 3 : 1.5} dot={false} connectNulls />)}
    </LineChart></ResponsiveContainer></div>
  )
}

export function History({ studentId }: { studentId?: string }) {
  const { me } = useAuth()
  const sid = studentId ?? me?.profile.id
  const readiness = useApi<any>(sid ? `/students/${sid}/readiness` : null)
  const attempts = useApi<any[]>(sid ? `/attempts?student_id=${sid}` : null)
  const interviews = useApi<any[]>(sid ? `/interviews?student_id=${sid}` : null)
  if (readiness.loading) return <Spinner />
  return (
    <div className="space-y-6">
      {!studentId && <PageHeader title="Progress history" />}
      <Card title="Readiness over time">{readiness.data?.history?.length ? <ReadinessChart history={readiness.data.history} /> : <Empty>No results yet.</Empty>}</Card>
      <Card title="Assessments and practice">
        {!attempts.data?.length ? <Empty>Nothing yet.</Empty> : (
          <Table head={['Date', 'Activity', 'Kind', 'Status', 'Score']}>
            {attempts.data.map((a) => <tr key={a.id}><Td>{fmtDate(a.started_at)}</Td><Td><Link className="text-brand-700" to={`/attempts/${a.id}`}>{a.title ?? cap(a.dimensions)}</Link></Td>
              <Td>{cap(a.kind)}</Td><Td>{cap(a.status)}</Td><Td>{num(a.total_score, 1)}</Td></tr>)}
          </Table>)}
      </Card>
      <Card title="Interviews">
        {!interviews.data?.length ? <Empty>No interviews yet.</Empty> : (
          <Table head={['Date', 'Type', 'Score', 'Integrity', 'End']}>
            {interviews.data.map((s) => <tr key={s.id}><Td>{fmtDate(s.created_at)}</Td><Td><Link className="text-brand-700" to={`/interviews/${s.id}/report`}>{cap(s.interview_type)}</Link></Td>
              <Td>{num(s.overall_score, 1)}</Td><Td><Badge tone={integrityTone(s.integrity_status)}>{INTEGRITY_LABEL[s.integrity_status]}</Badge></Td><Td>{cap(s.end_reason ?? s.status)}</Td></tr>)}
          </Table>)}
      </Card>
    </div>
  )
}

export function Rubrics() {
  const { data } = useApi<any[]>('/rubrics')
  if (!data) return <Spinner />
  return (
    <div className="space-y-6">
      <PageHeader title="How scoring works" subtitle="Every score comes from these published rubrics. Each criterion is scored on a band from 0 to 4; marks = band ÷ 4 × weight." />
      <Card title="Readiness levels">
        <ul className="space-y-1 text-sm"><li><b>L1 Foundation</b>: 0–44</li><li><b>L2 Developing</b>: 45–64</li>
          <li><b>L3 Placement-ready</b>: 65–79 and no area below 55</li><li><b>L4 Strong</b>: 80+ and no area below 70</li></ul>
        <p className="mt-2 text-xs text-slate-500">Speaking = 70% interviews + 30% speaking exercises. Recent activities count more (50/30/20). Accent is never penalised: clarity measures how clearly words can be recognised.</p>
      </Card>
      {data.map((r) => (
        <Card key={r.id} title={`${r.name} (v${r.version})`}>
          <Table head={['Criterion', 'Marks', 'How', 'What a 4/4 looks like']}>
            {r.criteria.map((c: any) => <tr key={c.key}><Td className="font-medium">{c.label}</Td><Td>{num(c.weight)}</Td>
              <Td>{c.scored_by === 'computed' ? 'Measured' : 'AI + rubric'}</Td><Td className="text-slate-600">{c.band_descriptors['4']}</Td></tr>)}
          </Table>
        </Card>
      ))}
    </div>
  )
}
