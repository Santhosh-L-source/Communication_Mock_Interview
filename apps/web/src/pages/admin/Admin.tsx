import { INTERVIEW_TYPES } from '@speakready/shared'
import { useEffect, useState } from 'react'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, Stat, Table, Td, Textarea } from '../../components/ui'
import { api, downloadCsv } from '../../lib/api'
import { cap, fmtDate, num } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 1500) }
  return (
    <button onClick={copy} title="Click to copy full ID" className="font-mono text-xs text-slate-500 hover:text-brand-700 transition-colors">
      {copied ? <span className="text-emerald-600">Copied!</span> : id.slice(0, 8)}
    </button>
  )
}

function ScoresPanel({ path, type }: { path: string; type: 'assessment' | 'interview' }) {
  const { data, loading } = useApi<any[]>(path)
  if (loading) return <Spinner />
  if (!data?.length) return <p className="py-3 text-sm text-slate-500">No student submissions yet.</p>
  if (type === 'assessment') return (
    <Table head={['Roll No', 'Name', 'Department', 'Score', 'Total Marks', 'Status', 'Submitted']}>
      {data.map((s, i) => <tr key={i} className="bg-slate-50"><Td className="font-mono text-xs">{s.register_no}</Td><Td>{s.full_name}</Td><Td>{s.department}</Td>
        <Td className="font-semibold">{s.total_score ?? '–'} <span className="font-normal text-slate-400">/ {s.max_marks}</span></Td>
        <Td>{s.max_marks}</Td>
        <Td><Badge tone={s.status === 'evaluated' ? 'good' : 'neutral'}>{cap(s.status)}</Badge></Td>
        <Td>{s.submitted_at ? fmtDate(s.submitted_at) : '–'}</Td></tr>)}
    </Table>)
  return (
    <Table head={['Roll No', 'Name', 'Department', 'Score', 'Total Marks', 'Integrity', 'Status', 'Ended']}>
      {data.map((s, i) => <tr key={i} className="bg-slate-50"><Td className="font-mono text-xs">{s.register_no}</Td><Td>{s.full_name}</Td><Td>{s.department}</Td>
        <Td className="font-semibold">{s.overall_score != null ? num(s.overall_score) : '–'} <span className="font-normal text-slate-400">/ 100</span></Td>
        <Td>100</Td>
        <Td><Badge tone={s.integrity_status === 'clean' || s.integrity_status === 'cleared' ? 'good' : s.integrity_status === 'confirmed_cheating' ? 'bad' : 'neutral'}>{num(s.integrity_score)}</Badge></Td>
        <Td><Badge tone={s.status === 'scored' ? 'good' : 'neutral'}>{cap(s.status)}</Badge></Td>
        <Td>{s.ended_at ? fmtDate(s.ended_at) : '–'}</Td></tr>)}
    </Table>)
}

function ExpandableRow({ children, id, type }: { children: React.ReactNode; id: string; type: 'assessment' | 'interview' }) {
  const [open, setOpen] = useState(false)
  const path = type === 'assessment' ? `/admin/assessments/${id}/scores` : `/admin/interview-assignments/${id}/scores`
  return (<>
    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(!open)}>{children}</tr>
    {open && <tr><td colSpan={20} className="p-0"><div className="border-t border-slate-200 bg-slate-50/50 px-4 py-3"><ScoresPanel path={path} type={type} /></div></td></tr>}
  </>)
}

const ROLES = ['student', 'coordinator', 'admin']

export function Users() {
  const [role, setRole] = useState('')
  const { data, reload } = useApi<any[]>(`/admin/users${role ? `?role=${role}` : ''}`)
  const [f, setF] = useState({ email: '', full_name: '', role: 'student', register_no: '', department: '', admission_year: '' })
  const [csv, setCsv] = useState('email,full_name,register_no,department,admission_year\n')
  const [result, setResult] = useState<any[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const redirect_to = `${location.origin}/reset-password`
  const create = async () => {
    try { await api('/admin/users', { body: { ...f, register_no: f.register_no || undefined, department: f.department || undefined, admission_year: f.admission_year ? Number(f.admission_year) : undefined, redirect_to } })
      setF({ ...f, email: '', full_name: '', register_no: '', department: '', admission_year: '' }); reload() } catch (e: any) { setError(e.message) }
  }
  const bulk = async () => {
    try { const r = await api('/admin/users/bulk', { body: { csv, redirect_to } }); setResult(r.results); reload() } catch (e: any) { setError(e.message) }
  }
  const update = async (id: string, patch: any) => { try { await api(`/admin/users/${id}`, { method: 'PATCH', body: patch }); reload() } catch (e: any) { setError(e.message) } }
  return (
    <div className="space-y-6">
      <PageHeader title="Users and roles" subtitle="New accounts get an email to set their password. Role changes are audited." />
      <ErrorBox error={error} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Add one user">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Full name"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Roll no. (students)"><Input value={f.register_no} onChange={(e) => setF({ ...f, register_no: e.target.value })} /></Field>
            <Field label="Department"><Input value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })} placeholder="e.g. CSE" /></Field>
            <Field label="Admission year"><Select value={f.admission_year} onChange={(e) => setF({ ...f, admission_year: e.target.value })}><option value="">–</option>{Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y} value={y}>{y}</option>)}</Select></Field>
          </div>
          <Button className="mt-4" onClick={create}>Create and send invite</Button>
        </Card>
        <Card title="Invite a class from CSV">
          <Field label="CSV (email, full_name, roll_no, department, admission_year)"><Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} className="font-mono text-xs" /></Field>
          <Button className="mt-3" onClick={bulk}>Invite students</Button>
          {result && <ul className="mt-3 max-h-40 overflow-auto text-xs">{result.map((r, i) => <li key={i} className={r.ok ? 'text-emerald-700' : 'text-red-700'}>{r.ok ? '✓' : '✗'} {r.email} {r.error ?? ''}</li>)}</ul>}
        </Card>
      </div>
      <Card title="All users" action={<Select value={role} onChange={(e) => setRole(e.target.value)} className="w-40"><option value="">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</Select>}>
        {!data ? <Spinner /> : (
          <Table head={['Name', 'Email', 'Roll no.', 'Department', 'Year', 'Role']}>
            {data.map((u) => <tr key={u.id}><Td>{u.full_name}</Td><Td>{u.email}</Td><Td>{u.register_no}</Td><Td>{u.department}</Td><Td>{u.year_of_study}</Td>
              <Td><Select value={u.role} onChange={(e) => confirm(`Change ${u.full_name}'s role to ${e.target.value}?`) && update(u.id, { role: e.target.value })} className="w-36">{ROLES.map((r) => <option key={r}>{r}</option>)}</Select></Td></tr>)}
          </Table>)}
      </Card>
    </div>
  )
}

export function Setup() {
  const assessments = useApi<any[]>('/admin/assessments')
  const interviewAssignments = useApi<any[]>('/admin/interview-assignments')
  const approvedQs = useApi<any[]>('/questions?status=approved')
  const [na, setNa] = useState({ title: '', duration_min: 30, is_baseline: false, deadline: '' })
  const [selectedQs, setSelectedQs] = useState<Set<string>>(new Set())
  const [savingAssessment, setSavingAssessment] = useState(false)
  const [ni, setNi] = useState({ title: '', interview_type: 'hr', difficulty: 2, duration_min: 10, deadline: '' })
  const [savingInterview, setSavingInterview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => setError(e.message))
  const toggleQ = (id: string) => setSelectedQs((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const groupedQs: Record<string, any[]> = {}
  for (const qu of approvedQs.data ?? []) (groupedQs[qu.dimension] ??= []).push(qu)
  const createAssessment = async () => {
    if (savingAssessment) return
    setSavingAssessment(true)
    try {
      await api('/admin/assessments', { body: { ...na, deadline: na.deadline ? new Date(na.deadline).toISOString() : undefined, question_ids: [...selectedQs] } })
      setNa({ title: '', duration_min: 30, is_baseline: false, deadline: '' }); setSelectedQs(new Set()); assessments.reload()
    } catch (e: any) { setError(e.message) } finally { setSavingAssessment(false) }
  }
  const createInterviewAssignment = async () => {
    if (savingInterview) return
    setSavingInterview(true)
    try {
      await api('/admin/interview-assignments', { body: { ...ni, deadline: ni.deadline ? new Date(ni.deadline).toISOString() : undefined } })
      setNi({ title: '', interview_type: 'hr', difficulty: 2, duration_min: 10, deadline: '' }); interviewAssignments.reload()
    } catch (e: any) { setError(e.message) } finally { setSavingInterview(false) }
  }
  const now = new Date()
  const upcoming = (assessments.data ?? []).filter((a) => !a.deadline || new Date(a.deadline) > now)
  const completed = (assessments.data ?? []).filter((a) => a.deadline && new Date(a.deadline) <= now)
  const upcomingIA = (interviewAssignments.data ?? []).filter((a) => !a.deadline || new Date(a.deadline) > now)
  const completedIA = (interviewAssignments.data ?? []).filter((a) => a.deadline && new Date(a.deadline) <= now)
  return (
    <div className="space-y-6">
      <PageHeader title="AI assessment" />
      <ErrorBox error={error} />
      <Card title="Create AI interview assignment">
        <p className="mb-4 text-sm text-slate-600">Assign an AI mock interview to all students. Each student can attempt it only once before the deadline.</p>
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label="Title"><Input value={ni.title} onChange={(e) => setNi({ ...ni, title: e.target.value })} placeholder="e.g. Week 4 HR Interview" /></Field>
          <Field label="Interview type"><Select value={ni.interview_type} onChange={(e) => setNi({ ...ni, interview_type: e.target.value })}>{INTERVIEW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
          <Field label="Difficulty (1–5)"><Select value={ni.difficulty} onChange={(e) => setNi({ ...ni, difficulty: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
          <Field label="Duration (minutes)"><Input type="number" min={5} max={30} value={ni.duration_min} onChange={(e) => setNi({ ...ni, duration_min: Number(e.target.value) })} /></Field>
          <Field label="Deadline"><Input type="datetime-local" value={ni.deadline} onChange={(e) => setNi({ ...ni, deadline: e.target.value })} /></Field>
        </div>
        <Button className="mt-4" disabled={ni.title.length < 3 || savingInterview} onClick={createInterviewAssignment}>{savingInterview ? 'Creating…' : 'Create interview assignment'}</Button>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upcoming interview assignments">
          {!upcomingIA.length ? <Empty>No upcoming interview assignments.</Empty> : (
            <Table head={['Test ID', 'Title', 'Type', 'Difficulty', 'Duration', 'Max Marks', 'Deadline', 'Completed by', '']}>
              {upcomingIA.map((a) => <ExpandableRow key={a.id} id={a.id} type="interview"><Td><CopyId id={a.id} /></Td><Td className="font-medium">{a.title}</Td><Td>{cap(a.interview_type)}</Td><Td>{a.difficulty}</Td><Td>{a.duration_min} min</Td>
                <Td>100</Td>
                <Td>{a.deadline ? fmtDate(a.deadline) : <span className="text-slate-400">No deadline</span>}</Td><Td>{a.completed_by} students</Td>
                <Td>{a.completed_by > 0 && <button className="text-sm font-medium text-brand-700" onClick={(e) => { e.stopPropagation(); downloadCsv(`/admin/interview-assignments/${a.id}/export`, `${a.title}-results.csv`) }}>Export</button>}</Td></ExpandableRow>)}
            </Table>)}
        </Card>
        <Card title="Completed interview assignments">
          {!completedIA.length ? <Empty>No completed interview assignments yet.</Empty> : (
            <Table head={['Test ID', 'Title', 'Type', 'Duration', 'Max Marks', 'Deadline', 'Completed by', '']}>
              {completedIA.map((a) => <ExpandableRow key={a.id} id={a.id} type="interview"><Td><CopyId id={a.id} /></Td><Td className="font-medium">{a.title}</Td><Td>{cap(a.interview_type)}</Td><Td>{a.duration_min} min</Td>
                <Td>100</Td>
                <Td>{fmtDate(a.deadline)}</Td><Td>{a.completed_by} students</Td>
                <Td>{a.completed_by > 0 && <button className="text-sm font-medium text-brand-700" onClick={(e) => { e.stopPropagation(); downloadCsv(`/admin/interview-assignments/${a.id}/export`, `${a.title}-results.csv`) }}>Export</button>}</Td></ExpandableRow>)}
            </Table>)}
        </Card>
      </div>
      <Card title="Create assessment">
        <p className="mb-4 text-sm text-slate-600">Question-bank assessment from approved questions. Each student can attempt it only once.</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Title"><Input value={na.title} onChange={(e) => setNa({ ...na, title: e.target.value })} placeholder="e.g. Week 3 Writing Test" /></Field>
          <Field label="Duration (minutes)"><Input type="number" min={5} max={240} value={na.duration_min} onChange={(e) => setNa({ ...na, duration_min: Number(e.target.value) })} /></Field>
          <Field label="Deadline"><Input type="datetime-local" value={na.deadline} onChange={(e) => setNa({ ...na, deadline: e.target.value })} /></Field>
          <Field label="Type"><label className="flex items-center gap-2 pt-1 text-sm"><input type="checkbox" checked={na.is_baseline} onChange={(e) => setNa({ ...na, is_baseline: e.target.checked })} /> Baseline assessment</label></Field>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium">Select questions ({selectedQs.size} selected)</p>
          {approvedQs.loading ? <Spinner /> : !Object.keys(groupedQs).length ? <Empty>No approved questions in the bank.</Empty> : (
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-lg border border-slate-200 p-3">
              {Object.entries(groupedQs).map(([dim, qs]) => (
                <div key={dim}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{cap(dim)} ({qs.length})</p>
                  <ul className="space-y-1">{qs.map((qu: any) => (
                    <li key={qu.id}><label className="flex cursor-pointer items-start gap-2 rounded p-1 text-sm hover:bg-slate-50">
                      <input type="checkbox" className="mt-0.5" checked={selectedQs.has(qu.id)} onChange={() => toggleQ(qu.id)} />
                      <span className="flex-1 truncate">{qu.prompt.slice(0, 80)}{qu.prompt.length > 80 ? '…' : ''}</span>
                      <Badge>{cap(qu.type)}</Badge><Badge tone="neutral">L{qu.difficulty}</Badge>
                    </label></li>))}</ul>
                </div>))}
            </div>)}
        </div>
        <Button className="mt-4" disabled={na.title.length < 3 || selectedQs.size < 1 || savingAssessment} onClick={createAssessment}>{savingAssessment ? 'Creating…' : 'Create assessment'}</Button>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Upcoming assessments">
          {!upcoming.length ? <Empty>No upcoming assessments.</Empty> : (
            <Table head={['Test ID', 'Title', 'Questions', 'Max Marks', 'Duration', 'Deadline', 'Completed by', '']}>
              {upcoming.map((a) => <ExpandableRow key={a.id} id={a.id} type="assessment"><Td><CopyId id={a.id} /></Td><Td className="font-medium">{a.title}</Td><Td>{a.items}</Td><Td>{a.max_marks}</Td><Td>{a.duration_min} min</Td>
                <Td>{a.deadline ? fmtDate(a.deadline) : <span className="text-slate-400">No deadline</span>}</Td><Td>{a.completed_by} students</Td>
                <Td>{a.completed_by > 0 && <button className="text-sm font-medium text-brand-700" onClick={(e) => { e.stopPropagation(); downloadCsv(`/admin/assessments/${a.id}/export`, `${a.title}-results.csv`) }}>Export</button>}</Td></ExpandableRow>)}
            </Table>)}
        </Card>
        <Card title="Completed assessments">
          {!completed.length ? <Empty>No completed assessments yet.</Empty> : (
            <Table head={['Test ID', 'Title', 'Questions', 'Max Marks', 'Deadline', 'Completed by', '']}>
              {completed.map((a) => <ExpandableRow key={a.id} id={a.id} type="assessment"><Td><CopyId id={a.id} /></Td><Td className="font-medium">{a.title}</Td><Td>{a.items}</Td><Td>{a.max_marks}</Td>
                <Td>{fmtDate(a.deadline)}</Td><Td>{a.completed_by} students</Td>
                <Td>{a.completed_by > 0 && <button className="text-sm font-medium text-brand-700" onClick={(e) => { e.stopPropagation(); downloadCsv(`/admin/assessments/${a.id}/export`, `${a.title}-results.csv`) }}>Export</button>}</Td></ExpandableRow>)}
            </Table>)}
        </Card>
      </div>
    </div>
  )
}

export function Integrations() {
  const clients = useApi<any[]>('/admin/api-clients')
  const hooks = useApi<any[]>('/admin/webhooks')
  const [name, setName] = useState('')
  const [hook, setHook] = useState({ name: '', url: '' })
  const [secret, setSecret] = useState<{ label: string; value: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<unknown>) => fn().catch((e) => setError(e.message))
  return (
    <div className="space-y-6">
      <PageHeader title="API access for other projects" subtitle="Other systems read scores, cheating decisions, transcripts and photos by roll number: GET /api/v1/external/students/{register_no} with header x-api-key." />
      <ErrorBox error={error} />
      {secret && <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"><b>{secret.label}</b> (shown once, copy it now):<pre className="mt-2 overflow-x-auto rounded bg-white p-2">{secret.value}</pre></div>}
      <Card title="API keys">
        {clients.data?.length ? <Table head={['Name', 'Created', 'Last used', 'Status', '']}>{clients.data.map((c) => <tr key={c.id}><Td>{c.name}</Td><Td>{fmtDate(c.created_at)}</Td><Td>{fmtDate(c.last_used_at) || 'Never'}</Td>
          <Td><Badge tone={c.is_active ? 'good' : 'neutral'}>{c.is_active ? 'Active' : 'Revoked'}</Badge></Td>
          <Td>{c.is_active && <Button variant="ghost" onClick={() => confirm('Revoke this key?') && run(async () => { await api(`/admin/api-clients/${c.id}`, { method: 'DELETE' }); clients.reload() })}>Revoke</Button>}</Td></tr>)}</Table> : <Empty>No keys yet.</Empty>}
        <div className="mt-4 flex gap-2"><Input placeholder="Name of the other project" value={name} onChange={(e) => setName(e.target.value)} />
          <Button disabled={name.length < 2} onClick={() => run(async () => { const r = await api('/admin/api-clients', { body: { name } }); setSecret({ label: `API key for ${name}`, value: r.api_key }); setName(''); clients.reload() })}>Create key</Button></div>
      </Card>
      <Card title="Webhooks (optional push)">
        <p className="mb-3 text-sm text-slate-600">We POST the same student JSON whenever an interview is scored or a cheating review is decided, signed with HMAC-SHA256 in the <code>x-speakready-signature</code> header.</p>
        {hooks.data?.length ? <Table head={['Name', 'URL', 'Last delivery', '']}>{hooks.data.map((h) => <tr key={h.id}><Td>{h.name}</Td><Td className="break-all">{h.url}</Td>
          <Td>{h.last_status == null ? '–' : h.last_status === 0 ? <Badge tone="bad">Failed: {h.last_error}</Badge> : <Badge tone={h.last_status < 300 ? 'good' : 'bad'}>{h.last_status}</Badge>}</Td>
          <Td>{h.is_active && <Button variant="ghost" onClick={() => run(async () => { await api(`/admin/webhooks/${h.id}`, { method: 'DELETE' }); hooks.reload() })}>Disable</Button>}</Td></tr>)}</Table> : <Empty>No webhooks.</Empty>}
        <div className="mt-4 grid gap-2 sm:grid-cols-[200px_1fr_auto]"><Input placeholder="Name" value={hook.name} onChange={(e) => setHook({ ...hook, name: e.target.value })} />
          <Input placeholder="https://other-project.example/webhooks/speakready" value={hook.url} onChange={(e) => setHook({ ...hook, url: e.target.value })} />
          <Button onClick={() => run(async () => { const r = await api('/admin/webhooks', { body: hook }); setSecret({ label: `Signing secret for ${hook.name}`, value: r.secret }); setHook({ name: '', url: '' }); hooks.reload() })}>Add</Button></div>
      </Card>
    </div>
  )
}

export function AuditLog() {
  const [action, setAction] = useState('')
  const { data } = useApi<any[]>(`/admin/audit${action ? `?action=${action}` : ''}`)
  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" subtitle="Append-only record of score changes, overrides, role changes, evidence views and escalations."
        action={<Select value={action} onChange={(e) => setAction(e.target.value)} className="w-56"><option value="">All actions</option>
          {['evaluation.override', 'evidence.view', 'integrity.review', 'role.change', 'alert', 'question', 'coach', 'api_client', 'consent'].map((a) => <option key={a} value={a}>{a}</option>)}</Select>} />
      <Card>{!data ? <Spinner /> : !data.length ? <Empty>No entries.</Empty> : (
        <Table head={['When', 'Who', 'Action', 'Entity', 'Change']}>
          {data.map((a) => <tr key={a.id}><Td className="whitespace-nowrap">{fmtDate(a.created_at)}</Td><Td>{a.actor_name ?? 'System'}</Td><Td><code className="text-xs">{a.action}</code></Td>
            <Td className="text-xs">{a.entity}<div className="text-slate-400">{a.entity_id?.slice(0, 8)}</div></Td>
            <Td className="max-w-md text-xs"><details><summary className="cursor-pointer text-brand-700">details</summary><pre className="whitespace-pre-wrap">{JSON.stringify({ before: a.before, after: a.after }, null, 1)}</pre></details></Td></tr>)}
        </Table>)}</Card>
    </div>
  )
}

export function OverallScores() {
  const { data, loading } = useApi<any[]>('/admin/scores/overall')
  const [search, setSearch] = useState('')
  if (loading) return <Spinner />
  if (!data?.length) return (
    <div className="space-y-6">
      <PageHeader title="Overall scores" subtitle="Student-wise scores across all tests." />
      <Empty>No student submissions yet.</Empty>
    </div>)
  const filtered = search
    ? data.filter((s) => s.full_name?.toLowerCase().includes(search.toLowerCase()) || s.register_no?.toLowerCase().includes(search.toLowerCase()) || s.department?.toLowerCase().includes(search.toLowerCase()))
    : data
  return (
    <div className="space-y-6">
      <PageHeader title="Overall scores" subtitle={`${data.length} students with submissions across all tests.`} />
      <Input placeholder="Search by name, roll no, or department…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
      {!filtered.length ? <Empty>No students match your search.</Empty> : (
        <div className="space-y-4">
          {filtered.map((s) => (
            <Card key={s.id} title={`${s.full_name}${s.register_no ? ` (${s.register_no})` : ''}`}>
              <div className="mb-3 flex flex-wrap gap-3 text-sm text-slate-500">
                {s.department && <span>{s.department}</span>}
                {s.year_of_study && <span>Year {s.year_of_study}</span>}
                {s.email && <span>{s.email}</span>}
              </div>
              {s.assessments && (<>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Assessments</p>
                <Table head={['Test', 'Score', 'Total Marks', 'Status', 'Submitted']}>
                  {s.assessments.map((a: any, i: number) => <tr key={i}><Td className="font-medium">{a.title}</Td>
                    <Td className="font-semibold">{a.score ?? '–'} <span className="font-normal text-slate-400">/ {a.max_marks}</span></Td>
                    <Td>{a.max_marks}</Td>
                    <Td><Badge tone={a.status === 'evaluated' ? 'good' : 'neutral'}>{cap(a.status)}</Badge></Td>
                    <Td>{a.submitted_at ? fmtDate(a.submitted_at) : '–'}</Td></tr>)}
                </Table></>)}
              {s.interviews && (<>
                <p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Interviews</p>
                <Table head={['Test', 'Score', 'Total Marks', 'Integrity', 'Status', 'Ended']}>
                  {s.interviews.map((v: any, i: number) => <tr key={i}><Td className="font-medium">{v.title}</Td>
                    <Td className="font-semibold">{v.score != null ? num(v.score) : '–'} <span className="font-normal text-slate-400">/ 100</span></Td>
                    <Td>100</Td>
                    <Td><Badge tone={v.integrity_status === 'clean' || v.integrity_status === 'cleared' ? 'good' : v.integrity_status === 'confirmed_cheating' ? 'bad' : 'neutral'}>{v.integrity_score != null ? num(v.integrity_score) : '–'}</Badge></Td>
                    <Td><Badge tone={v.status === 'scored' ? 'good' : 'neutral'}>{cap(v.status)}</Badge></Td>
                    <Td>{v.ended_at ? fmtDate(v.ended_at) : '–'}</Td></tr>)}
                </Table></>)}
            </Card>))}
        </div>)}
    </div>
  )
}

export function Overview() {
  const { data, reload } = useApi<any>('/admin/overview')
  if (!data) return <Spinner />
  return (
    <div className="space-y-6">
      <PageHeader title="System" subtitle="Free-tier AI usage today, live interviews and background jobs." action={<Button variant="secondary" onClick={reload}>Refresh</Button>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Students" value={data.counts.students} /><Stat label="Interviews scored" value={data.counts.interviews_scored} />
        <Stat label="Waiting for integrity review" value={data.counts.to_review} /><Stat label="Open alerts" value={data.counts.open_alerts} />
      </div>
      <Card title="AI calls today (check against each provider's current free-tier limits)">
        {data.usage.length ? <Table head={['Provider', 'Purpose', 'Calls', 'Tokens in/out', 'Audio (s)', 'Avg latency']}>
          {data.usage.map((u: any, i: number) => <tr key={i}><Td>{u.provider}</Td><Td>{u.purpose}</Td><Td>{u.calls}</Td><Td>{u.input_tokens} / {u.output_tokens}</Td><Td>{num(u.audio_seconds)}</Td><Td>{u.avg_latency_ms} ms</Td></tr>)}
        </Table> : <Empty>No AI calls today.</Empty>}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Live interviews">{data.live.length ? <ul className="divide-y divide-slate-100 text-sm">{data.live.map((s: any) => <li key={s.id} className="py-1.5">{s.full_name} ({s.register_no}) · {cap(s.interview_type)} · integrity {num(s.integrity_score)}</li>)}</ul> : <Empty>None right now.</Empty>}</Card>
        <Card title="Background jobs (24 h)">{data.jobs.length ? <Table head={['Queue', 'State', 'Count']}>{data.jobs.map((j: any, i: number) => <tr key={i}><Td>{j.name}</Td><Td><Badge tone={j.state === 'failed' ? 'bad' : j.state === 'completed' ? 'good' : 'neutral'}>{j.state}</Badge></Td><Td>{j.n}</Td></tr>)}</Table> : <Empty>No jobs.</Empty>}</Card>
      </div>
    </div>
  )
}
