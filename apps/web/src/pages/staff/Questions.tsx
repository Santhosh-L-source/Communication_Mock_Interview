import { useState } from 'react'
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, PageHeader, Select, Spinner, Table, Td, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { cap } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const TYPES = ['mcq', 'short_text', 'long_text', 'listening_mcq', 'spoken', 'interview']
const blank = { dimension: 'reading', sub_skill: '', type: 'mcq', interview_type: '', difficulty: 2, context: '', prompt: '', passage: '', options: '', answer_index: 0, expected_points: '' }

function Editor({ initial, onSaved, onCancel }: { initial: any; onSaved: () => void; onCancel: () => void }) {
  const [f, setF] = useState<any>(initial)
  const [error, setError] = useState<string | null>(null)
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const isMcq = f.type.endsWith('mcq')
  const save = async () => {
    const body = {
      dimension: f.dimension, sub_skill: f.sub_skill, type: f.type, interview_type: f.type === 'interview' ? f.interview_type || 'hr' : null,
      difficulty: Number(f.difficulty), context: f.context || null, prompt: f.prompt, passage: f.passage || null,
      options: isMcq ? String(f.options).split('\n').map((s: string) => s.trim()).filter(Boolean) : null, answer_index: isMcq ? Number(f.answer_index) : null,
      expected_points: String(f.expected_points ?? '').split('\n').map((s: string) => s.trim()).filter(Boolean),
    }
    try { await api(f.id ? `/questions/${f.id}` : '/questions', { method: f.id ? 'PATCH' : 'POST', body }); onSaved() } catch (e: any) { setError(e.message) }
  }
  return (
    <Card title={f.id ? 'Edit question (approved questions get a new version)' : 'New question'}>
      <div className="grid gap-3 md:grid-cols-4">
        <Field label="Dimension"><Select value={f.dimension} onChange={set('dimension')}>{['reading', 'writing', 'listening', 'speaking'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label="Type"><Select value={f.type} onChange={set('type')}>{TYPES.map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label="Sub-skill"><Input value={f.sub_skill} onChange={set('sub_skill')} placeholder="inference" /></Field>
        <Field label="Difficulty"><Select value={f.difficulty} onChange={set('difficulty')}>{[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</Select></Field>
        {f.type === 'interview' && <Field label="Interview type"><Select value={f.interview_type} onChange={set('interview_type')}>{['hr', 'self_intro', 'project', 'technical', 'situational', 'jam'].map((d) => <option key={d}>{d}</option>)}</Select></Field>}
        <Field label="Context"><Input value={f.context ?? ''} onChange={set('context')} placeholder="hr, email, technical…" /></Field>
      </div>
      <div className="mt-3 space-y-3">
        <Field label="Prompt"><Textarea rows={2} value={f.prompt} onChange={set('prompt')} /></Field>
        {(f.dimension === 'reading' || f.dimension === 'listening' || f.type === 'short_text') &&
          <Field label={f.dimension === 'listening' ? 'Audio script (read aloud by the browser voice)' : 'Passage'}><Textarea rows={4} value={f.passage ?? ''} onChange={set('passage')} /></Field>}
        {isMcq && <div className="grid gap-3 md:grid-cols-[1fr_160px]">
          <Field label="Options (one per line)"><Textarea rows={4} value={f.options} onChange={set('options')} /></Field>
          <Field label="Correct option (0 = first)"><Input type="number" min={0} max={5} value={f.answer_index} onChange={set('answer_index')} /></Field></div>}
        {!isMcq && <Field label="What a good answer covers (one per line)"><Textarea rows={3} value={f.expected_points} onChange={set('expected_points')} /></Field>}
      </div>
      <ErrorBox error={error} />
      <div className="mt-4 flex gap-2"><Button onClick={save}>Save as draft</Button><Button variant="secondary" onClick={onCancel}>Cancel</Button></div>
    </Card>
  )
}

export function QuestionBank() {
  const [filters, setFilters] = useState({ dimension: '', status: '', type: '', search: '' })
  const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString()
  const { data, loading, reload } = useApi<any[]>(`/questions?${qs}`)
  const [editing, setEditing] = useState<any | null>(null)
  const [gen, setGen] = useState({ dimension: 'reading', sub_skill: 'inference', difficulty: 2 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const setStatus = async (id: string, status: string) => { await api(`/questions/${id}/status`, { body: { status } }); reload() }
  const generate = async () => {
    setBusy(true)
    try { await api('/questions/generate', { body: gen }); setFilters({ ...filters, status: 'draft' }) } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  const edit = (q: any) => setEditing({ ...q, options: (q.options ?? []).join('\n'), answer_index: q.answer_key?.index ?? 0, expected_points: (q.expected_points ?? []).join('\n'),
    interview_type: q.interview_type ?? '', passage: q.passage ?? '' })
  return (
    <div className="space-y-6">
      <PageHeader title="Question bank" subtitle="New and AI-drafted items stay in draft until an admin approves them." action={<Button onClick={() => setEditing({ ...blank })}>New question</Button>} />
      {editing && <Editor initial={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload() }} />}
      <Card title="Draft a question with AI">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Dimension"><Select value={gen.dimension} onChange={(e) => setGen({ ...gen, dimension: e.target.value })}>{['reading', 'writing', 'listening', 'speaking'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <Field label="Sub-skill"><Input value={gen.sub_skill} onChange={(e) => setGen({ ...gen, sub_skill: e.target.value })} /></Field>
          <Field label="Difficulty"><Select value={gen.difficulty} onChange={(e) => setGen({ ...gen, difficulty: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((d) => <option key={d}>{d}</option>)}</Select></Field>
          <Button onClick={generate} disabled={busy}>{busy ? 'Drafting…' : 'Draft with AI'}</Button>
        </div>
        <ErrorBox error={error} />
      </Card>
      <div className="grid gap-3 sm:grid-cols-4">
        <Select value={filters.dimension} onChange={(e) => setFilters({ ...filters, dimension: e.target.value })}><option value="">All dimensions</option>{['reading', 'writing', 'listening', 'speaking'].map((d) => <option key={d}>{d}</option>)}</Select>
        <Select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}><option value="">All types</option>{TYPES.map((d) => <option key={d}>{d}</option>)}</Select>
        <Select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Any status</option>{['draft', 'approved', 'retired'].map((d) => <option key={d}>{d}</option>)}</Select>
        <Input placeholder="Search prompt" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
      </div>
      <Card>{loading ? <Spinner /> : !data?.length ? <Empty>No questions match.</Empty> : (
        <Table head={['Question', 'Dimension', 'Type', 'Diff.', 'Status', '']}>
          {data.map((q) => <tr key={q.id}>
            <Td className="max-w-md"><div className="line-clamp-2">{q.prompt}</div>{q.passage && <div className="line-clamp-1 text-xs text-slate-400">{q.passage}</div>}</Td>
            <Td>{cap(q.dimension)}<div className="text-xs text-slate-500">{cap(q.sub_skill)}</div></Td>
            <Td>{q.type}{q.interview_type ? ` (${q.interview_type})` : ''}</Td><Td>{q.difficulty}</Td>
            <Td><Badge tone={q.status === 'approved' ? 'good' : q.status === 'draft' ? 'warn' : 'neutral'}>{q.status}</Badge>{q.source === 'ai' && <Badge tone="info">AI</Badge>} <span className="text-xs text-slate-400">v{q.version}</span></Td>
            <Td className="whitespace-nowrap">
              <Button variant="ghost" onClick={() => edit(q)}>Edit</Button>
              {q.status !== 'approved' && <Button variant="ghost" onClick={() => setStatus(q.id, 'approved')}>Approve</Button>}
              {q.status !== 'retired' && <Button variant="ghost" onClick={() => setStatus(q.id, 'retired')}>Retire</Button>}
            </Td></tr>)}
        </Table>)}</Card>
    </div>
  )
}
