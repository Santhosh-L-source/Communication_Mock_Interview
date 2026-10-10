import { useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { cap } from '../lib/format'
import { Button, ErrorBox, Field, Select, Textarea } from './ui'

// Admins review an AI evaluation and change bands with a reason (audited; the AI version is kept).
export function OverrideEditor({ evaluationId, criteria, onDone }: { evaluationId: string; criteria: any[]; onDone: () => void }) {
  const { me } = useAuth()
  const [open, setOpen] = useState(false)
  const [bands, setBands] = useState<Record<string, string>>(() => Object.fromEntries(criteria.map((c) => [c.key, c.band == null ? '' : String(c.band)])))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!me || me.profile.role !== 'admin') return null
  if (!open) return <Button variant="secondary" onClick={() => setOpen(true)}>Review / override score</Button>
  const save = async () => {
    try {
      await api(`/evaluations/${evaluationId}/override`, { body: { reason, criteria: criteria.map((c) => ({ key: c.key, band: bands[c.key] === '' ? null : Number(bands[c.key]) })) } })
      setOpen(false)
      onDone()
    } catch (e: any) { setError(e.message) }
  }
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {criteria.map((c) => (
          <Field key={c.key} label={c.label ?? cap(c.key)}>
            <Select value={bands[c.key]} onChange={(e) => setBands({ ...bands, [c.key]: e.target.value })}>
              <option value="">N/A</option>{[0, 1, 2, 3, 4].map((b) => <option key={b} value={b}>Band {b}</option>)}
            </Select>
          </Field>
        ))}
      </div>
      <Field label="Reason (required, saved in the audit log)"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <ErrorBox error={error} />
      <div className="flex gap-2"><Button onClick={save} disabled={reason.trim().length < 5}>Save override</Button><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button></div>
    </div>
  )
}
