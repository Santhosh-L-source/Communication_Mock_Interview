import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { LevelBadge } from '../../components/Scores'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, Stat, Table, Td, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cap, fmtDate, num } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { History } from '../student/History'

const heat = (v: number | null) => v == null ? 'bg-slate-50 text-slate-400' : v >= 70 ? 'bg-emerald-100 text-emerald-900' : v >= 55 ? 'bg-lime-100 text-lime-900' : v >= 45 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-900'

export function Heatmap({ rows }: { rows: any[] }) {
  return (
    <Table head={['Student', 'Reading', 'Writing', 'Listening', 'Speaking', 'Overall', 'Level', 'Alerts']}>
      {rows.map((s) => (
        <tr key={s.id}>
          <Td><Link to={`/staff/students/${s.id}`} className="font-medium text-brand-700">{s.full_name}</Link><div className="text-xs text-slate-500">{s.register_no}</div></Td>
          {['reading', 'writing', 'listening', 'speaking', 'overall'].map((k) => <Td key={k}><span className={`inline-block min-w-12 rounded px-2 py-1 text-center text-xs font-medium ${heat(s[k])}`}>{num(s[k])}</span></Td>)}
          <Td><LevelBadge level={s.level} /></Td><Td>{s.open_alerts ? <Badge tone="bad">{s.open_alerts}</Badge> : ''}</Td>
        </tr>))}
    </Table>
  )
}

export function StaffDashboard() {
  const { me } = useAuth()
  const students = useApi<any[]>('/students')
  const alerts = useApi<any[]>('/alerts')
  const pending = useApi<any[]>('/evaluations/pending')
  const queue = useApi<any[]>(me?.profile.role === 'admin' ? '/integrity/queue' : null)
  if (students.loading) return <Spinner />
  const list = students.data ?? []
  const attention = list.filter((s) => s.open_alerts || (s.level != null && s.level <= 1))
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle={`${me?.profile.full_name} · ${cap(me?.profile.role)}`} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={list.length} sub={`${list.filter((s) => s.level != null).length} assessed`} />
        <Stat label="Placement-ready (L3+)" value={list.filter((s) => (s.level ?? 0) >= 3).length} />
        <Stat label="Open alerts" value={alerts.data?.length ?? '–'} />
        <Stat label="Integrity reviews" value={queue.data?.length ?? '–'} sub={pending.data ? `${pending.data.length} scores to review` : undefined} />
      </div>
      <Card title="Needs attention">{attention.length ? <Heatmap rows={attention.slice(0, 15)} /> : <Empty>No one needs attention right now.</Empty>}</Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Alerts" action={<Link to="/staff/alerts" className="text-sm text-brand-700">All alerts</Link>}>
          {(alerts.data ?? []).length === 0 ? <Empty>No open alerts.</Empty> : <ul className="divide-y divide-slate-100">{alerts.data!.slice(0, 8).map((a) => (
            <li key={a.id} className="py-2 text-sm"><Badge tone={a.severity === 'high' ? 'bad' : 'warn'}>{cap(a.kind)}</Badge> <b>{a.full_name}</b> ({a.register_no}): {a.reason}</li>))}</ul>}
        </Card>
        {pending.data && <Card title="AI scores waiting for review">
          {pending.data.length === 0 ? <Empty>Nothing to review.</Empty> : <ul className="divide-y divide-slate-100">{pending.data.map((e) => (
            <li key={e.id} className="flex justify-between py-2 text-sm"><span>{e.full_name} · {cap(e.dimension)}</span>
              <Link className="text-brand-700" to={e.interview_session_id ? `/interviews/${e.interview_session_id}/report` : `/attempts/${e.attempt_id}`}>Review</Link></li>))}</ul>}
        </Card>}
      </div>
      <Card title="All students">{list.length ? <Heatmap rows={list} /> : <Empty>No students yet.</Empty>}</Card>
    </div>
  )
}

export function StudentsList() {
  const [level, setLevel] = useState('')
  const [search, setSearch] = useState('')
  const qs = new URLSearchParams({ ...(level && { level }), ...(search && { search }) }).toString()
  const { data, loading } = useApi<any[]>(`/students?${qs}`)
  return (
    <div className="space-y-6">
      <PageHeader title="Students" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">All levels</option>{[1, 2, 3, 4].map((l) => <option key={l} value={l}>Level {l}</option>)}</Select>
        <Input placeholder="Search name or roll number" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <Card>{loading ? <Spinner /> : data?.length ? <Heatmap rows={data} /> : <Empty>No students found.</Empty>}</Card>
    </div>
  )
}

export function StudentDetail() {
  const { id } = useParams()
  const { me } = useAuth()
  const { data, reload } = useApi<any>(`/students/${id}`)
  const plan = useApi<any>(`/students/${id}/plan`)
  const [msg, setMsg] = useState<string | null>(null)
  if (!data) return <Spinner />
  const p = data.profile
  const coach = async (action: string) => { await api(`/students/${id}/coach`, { body: { action } }); setMsg(action === 'run' || action === 'weekly' ? 'Coach run queued.' : `Coach ${action}d.`); reload() }
  const canCoach = me?.profile.role === 'admin'
  return (
    <div className="space-y-6">
      <PageHeader title={p.full_name} subtitle={`${p.register_no} · ${p.department ?? ''} · Year ${p.year_of_study ?? '–'}`}
        action={canCoach && <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => coach('run')}>Run coach now</Button>
          <Button variant="secondary" onClick={() => coach('weekly')}>New weekly plan</Button>
          <Button variant="secondary" onClick={() => coach(p.coach_paused ? 'resume' : 'pause')}>{p.coach_paused ? 'Resume coach' : 'Pause coach'}</Button>
        </div>} />
      {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      {me?.profile.role !== 'coordinator' ? <History studentId={id} /> : <p className="text-sm text-slate-600">Coordinators see readiness summaries only.</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Current plan">{plan.data?.items?.length ? <ul className="divide-y divide-slate-100">{plan.data.items.map((i: any) => (
          <li key={i.id} className="py-2 text-sm"><Badge tone={i.status === 'done' ? 'good' : 'neutral'}>{cap(i.status)}</Badge> {i.interview_type ? `Interview: ${cap(i.interview_type)}` : `${cap(i.target_dimension)} · ${cap(i.target_sub_skill)}`}
            <div className="text-xs text-slate-500">{i.reason}</div></li>))}</ul> : <Empty>No plan yet.</Empty>}</Card>
        <Card title="Alerts">{data.alerts.length ? <ul className="divide-y divide-slate-100">{data.alerts.map((a: any) => (
          <li key={a.id} className="py-2 text-sm"><Badge tone={a.status === 'open' ? 'bad' : 'neutral'}>{cap(a.status)}</Badge> {a.reason} <span className="text-xs text-slate-400">{fmtDate(a.created_at)}</span></li>))}</ul> : <Empty>No alerts.</Empty>}</Card>
      </div>
      {data.agent_runs.length > 0 && (
        <Card title="Why the coach recommended this (agent runs)">
          <div className="space-y-4">{data.agent_runs.map((run: any) => (
            <details key={run.id} className="rounded-lg border border-slate-100 p-3">
              <summary className="cursor-pointer text-sm"><b>{cap(run.trigger)}</b> · {fmtDate(run.started_at)} · {cap(run.state)}{run.error && <span className="text-red-700"> · {run.error}</span>}</summary>
              <ol className="mt-2 space-y-1 text-xs">{(run.steps ?? []).map((s: any) => (
                <li key={s.seq}><b>{s.seq}. {cap(s.step)}</b>{s.tool && <> · <code>{s.tool}</code></>}{s.verified != null && <> · {s.verified ? '✓ verified' : '✗ not verified'}</>}
                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(s.output, null, 1)?.slice(0, 800)}</pre></li>))}</ol>
            </details>))}</div>
        </Card>
      )}
    </div>
  )
}

export function Alerts() {
  const [all, setAll] = useState(false)
  const { data, reload } = useApi<any[]>(`/alerts${all ? '?all=1' : ''}`)
  const [open, setOpen] = useState<string | null>(null)
  const [form, setForm] = useState({ action: '', notes: '', due_date: '', status: 'in_progress', outcome: '' })
  const [error, setError] = useState<string | null>(null)
  const history = useApi<any[]>(open ? `/alerts/${open}/interventions` : null)
  const save = async () => {
    try { await api(`/alerts/${open}/interventions`, { body: form }); setForm({ action: '', notes: '', due_date: '', status: 'in_progress', outcome: '' }); history.reload(); reload() }
    catch (e: any) { setError(e.message) }
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Alerts and interventions" action={<label className="text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show closed</label>} />
      <Card>{!data ? <Spinner /> : data.length === 0 ? <Empty>No alerts.</Empty> : (
        <Table head={['Student', 'Kind', 'Reason', 'Status', 'Raised', '']}>
          {data.map((a) => (<tr key={a.id}>
            <Td><Link to={`/staff/students/${a.student_id}`} className="text-brand-700">{a.full_name}</Link><div className="text-xs text-slate-500">{a.register_no}</div></Td>
            <Td><Badge tone={a.severity === 'high' ? 'bad' : 'warn'}>{cap(a.kind)}</Badge></Td><Td>{a.reason}</Td><Td>{cap(a.status)}</Td><Td>{fmtDate(a.created_at)}</Td>
            <Td>{a.kind === 'integrity' && a.session_id ? <Link className="text-brand-700" to={`/staff/integrity/${a.session_id}`}>Review</Link>
              : <Button variant="ghost" onClick={() => setOpen(open === a.id ? null : a.id)}>Act</Button>}</Td></tr>))}
        </Table>)}</Card>
      {open && (
        <Card title="Intervention">
          <ul className="mb-4 space-y-1 text-sm">{history.data?.map((i) => <li key={i.id}>• {fmtDate(i.created_at)} · <b>{i.staff_name}</b>: {i.action}{i.notes ? ` (${i.notes})` : ''}{i.outcome ? ` → ${i.outcome}` : ''}</li>)}</ul>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Action"><Input value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} placeholder="1:1 session on email writing" /></Field>
            <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            <Field label="Outcome (when closing)"><Textarea rows={2} value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} /></Field>
            <Field label="Alert status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></Select></Field>
          </div>
          <ErrorBox error={error} />
          <Button className="mt-4" onClick={save} disabled={form.action.length < 2}>Save</Button>
        </Card>
      )}
    </div>
  )
}
