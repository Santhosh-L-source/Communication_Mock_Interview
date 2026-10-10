import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Badge, Button, Card, Empty, ErrorBox, Field, integrityTone, PageHeader, Select, Spinner, Table, Td, Textarea } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cap, fmtDate, INTEGRITY_LABEL, num } from '../../lib/format'
import { useApi } from '../../lib/useApi'

export function IntegrityQueue() {
  const [status, setStatus] = useState('')
  const { data, loading } = useApi<any[]>(`/integrity/queue${status ? `?status=${status}` : ''}`)
  return (
    <div className="space-y-6">
      <PageHeader title="Integrity review" subtitle="Interviews with anti-cheat events. A person always makes the final decision."
        action={<Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-56">
          <option value="">Waiting for review</option><option value="flagged">Flagged</option><option value="needs_review">Needs review</option>
          <option value="cleared">Cleared</option><option value="confirmed_cheating">Confirmed malpractice</option></Select>} />
      <Card>{loading ? <Spinner /> : !data?.length ? <Empty>Nothing to review.</Empty> : (
        <Table head={['Student', 'Interview', 'When', 'Events', 'Integrity', '']}>
          {data.map((s) => <tr key={s.id}>
            <Td><b>{s.full_name}</b><div className="text-xs text-slate-500">{s.register_no}</div></Td><Td>{cap(s.interview_type)} · {cap(s.end_reason ?? s.status)}</Td>
            <Td>{fmtDate(s.started_at)}</Td><Td>{s.events} ({s.high_events} high)</Td>
            <Td><Badge tone={integrityTone(s.integrity_status)}>{num(s.integrity_score)} · {INTEGRITY_LABEL[s.integrity_status]}</Badge></Td>
            <Td><Link className="font-medium text-brand-700" to={`/staff/integrity/${s.id}`}>Review</Link></Td></tr>)}
        </Table>)}</Card>
    </div>
  )
}

const fmtOffset = (ms: number | null) => ms == null ? '' : `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`

export function IntegritySession() {
  const { id } = useParams()
  const { me } = useAuth()
  const { data, reload, error } = useApi<any>(`/integrity/sessions/${id}`)
  const [decision, setDecision] = useState('cleared')
  const [notes, setNotes] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showRandom, setShowRandom] = useState(false)
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const s = data.session
  const events = data.events.filter((e: any) => showRandom || e.event_type !== 'random_check')
  const submit = async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    try { await api(`/integrity/sessions/${id}/review`, { body: { decision, notes } }); setNotes(''); reload() } catch (e: any) { setSaveError(e.message) } finally { setSaving(false) }
  }
  return (
    <div className="space-y-6">
      <PageHeader title={`${s.full_name} · ${s.register_no}`} subtitle={`${cap(s.interview_type)} interview · ${fmtDate(s.started_at)} · ended: ${cap(s.end_reason)}`}
        action={<Badge tone={integrityTone(s.integrity_status)}>Integrity {num(s.integrity_score)} · {INTEGRITY_LABEL[s.integrity_status]}</Badge>} />
      <p className="text-xs text-slate-500">Photo links expire after 60 seconds (reload the page to refresh). Your view has been recorded in the audit log.</p>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Event timeline</h2>
            <label className="text-sm"><input type="checkbox" checked={showRandom} onChange={(e) => setShowRandom(e.target.checked)} /> Show random check photos</label></div>
          {events.length === 0 && <Empty>No events.</Empty>}
          {events.map((e: any) => (
            <Card key={e.id}>
              <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                {e.photo_url ? <a href={e.photo_url} target="_blank" rel="noreferrer"><img src={e.photo_url} alt={`Evidence for ${e.event_type}`} className="w-full rounded-lg border" /></a>
                  : <div className="flex aspect-video items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-500">No photo</div>}
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><b>{cap(e.event_type)}</b>
                    <Badge tone={e.severity === 'high' ? 'bad' : e.severity === 'medium' ? 'warn' : 'neutral'}>{e.severity}</Badge>
                    <span className="text-slate-500">at {fmtOffset(e.offset_ms)}{e.duration_ms ? ` for ${(e.duration_ms / 1000).toFixed(1)}s` : ''}</span>
                    {e.confidence != null && <span className="text-slate-500">confidence {Math.round(e.confidence * 100)}%</span>}</div>
                  <div>AI photo check: {e.ai_verdict ? <Badge tone={e.ai_verdict === 'confirmed' ? 'bad' : e.ai_verdict === 'rejected' ? 'good' : 'warn'}>{e.ai_verdict}</Badge> : <span className="text-slate-500">not verified (no self-hosted vision model)</span>}
                    {e.ai_verdict_detail?.reason && <span className="text-slate-500"> · {e.ai_verdict_detail.reason}</span>} · penalty −{num(e.penalty)}</div>
                  {e.transcript_excerpt && <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs">{e.transcript_excerpt}</pre>}
                  {Object.keys(e.details ?? {}).length > 0 && <p className="text-xs text-slate-500">Detector: {JSON.stringify(e.details)}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          {s.reference_face_url && <Card title="Enrolled photo"><img src={s.reference_face_url} alt="Reference" className="w-full rounded-lg" /></Card>}
          {me?.profile.role === 'admin' ? (
            <Card title="Decision">
              <div className="space-y-3">
                <Field label="Decision"><Select value={decision} onChange={(e) => setDecision(e.target.value)}>
                  <option value="cleared">Cleared (no malpractice)</option><option value="confirmed_cheating">Confirmed malpractice</option><option value="needs_review">Needs more review</option></Select></Field>
                <Field label="Notes (required, shared with the other project)"><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
                <ErrorBox error={saveError} />
                <Button onClick={submit} disabled={notes.trim().length < 3 || saving} variant={decision === 'confirmed_cheating' ? 'danger' : 'primary'}>{saving ? 'Saving…' : 'Save decision'}</Button>
              </div>
            </Card>
          ) : <Card><p className="text-sm text-slate-600">Only admins can record the decision.</p></Card>}
          <Card title="Review history">{data.reviews.length ? data.reviews.map((r: any) => (
            <p key={r.id} className="mb-2 text-sm"><Badge tone={integrityTone(r.decision)}>{INTEGRITY_LABEL[r.decision]}</Badge> {r.reviewer_name}, {fmtDate(r.created_at)}<br /><span className="text-slate-600">{r.notes}</span></p>
          )) : <Empty>Not reviewed yet.</Empty>}</Card>
          <Card title="Full transcript">
            <div className="max-h-96 space-y-2 overflow-y-auto text-xs">{data.turns.map((t: any) => <p key={t.seq}><b>[{fmtOffset(t.started_ms)}] {t.speaker === 'ai' ? 'Interviewer' : 'Student'}:</b> {t.text}</p>)}</div>
            {s.transcript_url && <a href={s.transcript_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-brand-700">transcript.json</a>}
          </Card>
        </div>
      </div>
    </div>
  )
}
