import { useState } from 'react'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { LevelBadge } from '../../components/Scores'
import { Badge, Button, Card, Empty, integrityTone, PageHeader, Select, Spinner, Stat, Table, Td } from '../../components/ui'
import { downloadCsv } from '../../lib/api'
import { cap, INTEGRITY_LABEL, LEVEL_NAMES, num } from '../../lib/format'
import { useApi } from '../../lib/useApi'

export function Reports() {
  const [level, setLevel] = useState('')
  const report = useApi<any>(`/report${level ? `?level=${level}` : ''}`)
  const r = report.data
  return (
    <div className="space-y-6">
      <PageHeader title="Readiness report" subtitle="Interview scores that are flagged or under review are hidden until an admin decides."
        action={<div className="flex gap-2">
          <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-40"><option value="">All levels</option>{[1, 2, 3, 4].map((l) => <option key={l} value={l}>L{l} {LEVEL_NAMES[l]}</option>)}</Select>
          <Button variant="secondary" disabled={!r} onClick={() => downloadCsv(`/report?format=csv${level ? `&level=${level}` : ''}`, `readiness-report.csv`)}>Export CSV</Button>
        </div>} />
      {!r ? <Spinner /> : (<>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {r.levels.map((l: any) => <Stat key={l.level} label={`L${l.level} ${LEVEL_NAMES[l.level]}`} value={l.count} />)}
          <Stat label="Not assessed" value={r.not_assessed} />
        </div>
        <Card title="Average by dimension"><div className="h-56"><ResponsiveContainer><BarChart data={['reading', 'writing', 'listening', 'speaking', 'overall'].map((k) => ({ k: cap(k), v: r.averages[k] }))}>
          <XAxis dataKey="k" fontSize={12} /><YAxis domain={[0, 100]} fontSize={12} /><Tooltip /><Bar dataKey="v" name="Average" fill="#1d4ed8" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
        <Card title={`Students (${r.students.length})`}>{!r.students.length ? <Empty>No students.</Empty> : (
          <Table head={['Roll no.', 'Name', 'R', 'W', 'L', 'S', 'Overall', 'Level', 'Last interview']}>
            {r.students.map((s: any) => <tr key={s.register_no}><Td>{s.register_no}</Td><Td>{s.full_name}</Td>
              {['reading', 'writing', 'listening', 'speaking', 'overall'].map((k) => <Td key={k}>{num(s[k])}</Td>)}<Td><LevelBadge level={s.level} /></Td>
              <Td>{s.last_interview_integrity ? <>{num(s.last_interview_score)} <Badge tone={integrityTone(s.last_interview_integrity)}>{INTEGRITY_LABEL[s.last_interview_integrity]}</Badge></> : '–'}</Td></tr>)}
          </Table>)}</Card>
      </>)}
    </div>
  )
}
