import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LevelBadge, ReadinessRadar } from '../../components/Scores'
import { Badge, Button, Card, Empty, ErrorBox, integrityTone, PageHeader, ScoreBar, Spinner, Stat } from '../../components/ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { cap, fmtDate, INTEGRITY_LABEL, num } from '../../lib/format'
import { useApi } from '../../lib/useApi'

function Consent({ onDone }: { onDone: () => void }) {
  const [ok, setOk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    try { await api('/me/consent', { body: { recording: true, proctoring: true } }); onDone() } catch (e: any) { setError(e.message) }
  }
  return (
    <Card title="Before you start: consent">
      <div className="space-y-2 text-sm text-slate-700">
        <p>SpeakReady records your spoken answers to score pronunciation, fluency and content. Answer transcripts (text only, without your name)
          are processed by a free third-party AI service (Google Gemini or Groq) to score and give feedback.</p>
        <p>During AI interviews your camera and microphone are monitored in your browser for fairness. If something unusual happens
          (for example a phone or a second person), a still photo and the transcript around that moment are saved for an admin to review.
          Full video is never recorded. Photos are never sent to online AI services.</p>
        <p>Recordings are kept for 180 days and evidence photos for 90 days after review. You can ask for your data to be deleted.</p>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1" />
        I agree to voice recording and interview monitoring as described above.</label>
      <ErrorBox error={error} />
      <Button className="mt-4" disabled={!ok} onClick={save}>Agree and continue</Button>
    </Card>
  )
}

export function StudentDashboard() {
  const { me, refresh } = useAuth()
  const nav = useNavigate()
  const assessments = useApi<any[]>('/assessments')
  const interviewAssignments = useApi<any[]>('/interview-assignments')
  const readiness = useApi<any>(me ? `/students/${me.profile.id}/readiness` : null)
  const plan = useApi<any>('/me/plan')
  const interviews = useApi<any[]>('/interviews')
  const [error, setError] = useState<string | null>(null)
  if (!me) return <Spinner />
  const p = me.profile
  const r = me.readiness
  const start = async (id: string) => {
    try { const a = await api(`/assessments/${id}/attempts`, { method: 'POST' }); nav(`/attempts/${a.id}/take`) } catch (e: any) { setError(e.message) }
  }
  if (!p.recording_consent_at) return <div className="mx-auto max-w-2xl"><PageHeader title={`Welcome, ${p.full_name.split(' ')[0]}`} subtitle="Let's measure where you stand." /><Consent onDone={refresh} /></div>

  const baselines = (assessments.data ?? []).filter((a) => a.is_baseline)
  const hasBaseline = Boolean(r)
  const nextItem = plan.data?.items?.find((i: any) => i.status === 'pending')
  return (
    <div className="space-y-6">
      <PageHeader title={`Hi, ${p.full_name.split(' ')[0]}`} subtitle={`${p.register_no} · ${p.department ?? ''}`} />
      <ErrorBox error={error} />
      {!hasBaseline && (
        <Card title="Step 1: take your baseline assessment">
          <p className="text-sm text-slate-600">About 30–40 minutes: reading passages, a professional email, listening clips and two short spoken answers.
            Use headphones and a quiet room. Your answers autosave, so you can resume if the page reloads.</p>
          {me.baseline?.status === 'in_progress'
            ? <Button className="mt-4" onClick={() => nav(`/attempts/${me.baseline!.id}/take`)}>Resume baseline</Button>
            : me.baseline ? <p className="mt-4 text-sm text-slate-600">Your baseline is being scored. This page updates when results are ready.</p>
            : baselines[0] && <Button className="mt-4" onClick={() => start(baselines[0].id)}>Start baseline</Button>}
        </Card>
      )}
      {hasBaseline && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Readiness" value={num(r.overall)} sub={<LevelBadge level={r.level} />} />
            <Stat label="Weakest area" value={cap(r.weakest_dimension)} sub={r.weakest_sub_skill ? cap(r.weakest_sub_skill) : undefined} />
            <Stat label="Interview score" value={num(r.interview)} sub="average of recent interviews" />
            <Stat label="Trend" value={readiness.data?.trend?.overall != null ? `${readiness.data.trend.overall > 0 ? '+' : ''}${readiness.data.trend.overall}` : '–'} sub="points per activity" />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Your readiness profile" className="lg:col-span-2">
              <div className="grid items-center gap-4 md:grid-cols-2">
                <ReadinessRadar r={r} />
                <div className="space-y-3">{['reading', 'writing', 'listening', 'speaking'].map((k) => (
                  <div key={k}><div className="flex justify-between text-sm"><span>{cap(k)}</span><span className="font-medium">{num(r[k])}</span></div><ScoreBar value={r[k]} /></div>))}
                  <p className="text-xs text-slate-500">L3 Placement-ready needs 65+ overall with no area below 55. <Link to="/rubrics" className="text-brand-700">How scoring works</Link></p>
                </div>
              </div>
            </Card>
            <Card title="Next recommended action">
              {nextItem ? (
                <div className="space-y-3">
                  <p className="text-sm">{nextItem.reason}</p>
                  {nextItem.question_id ? <Button onClick={() => nav('/practice')}>Go to practice</Button> : <Button onClick={() => nav('/interviews')}>Start a mock interview</Button>}
                </div>
              ) : <p className="text-sm text-slate-600">Your coach is preparing practice. Meanwhile, try an AI mock interview.</p>}
              <div className="mt-6 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-sm font-semibold">Reattempt</h3>
                <p className="mb-3 text-xs text-slate-500">Take the parallel baseline form to measure your change.</p>
                {baselines.slice(1).map((b) => <Button key={b.id} variant="secondary" onClick={() => start(b.id)}>{b.title}</Button>)}
              </div>
            </Card>
          </div>
        </>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Assessments">
          {assessments.loading ? <Spinner /> : (assessments.data ?? []).filter((a) => !a.is_baseline).length === 0 ? <Empty>No scheduled assessments right now.</Empty> :
            <ul className="divide-y divide-slate-100">{(assessments.data ?? []).filter((a) => !a.is_baseline).map((a) => {
              const isScheduled = a.opens_at && a.closes_at
              const deadlinePassed = a.deadline && new Date(a.deadline) < new Date()
              const alreadyDone = a.my_attempts > 0
              const disabled = alreadyDone || (isScheduled
                ? (new Date(a.opens_at) > new Date() || new Date(a.closes_at) < new Date())
                : deadlinePassed)
              return (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <div><div className="font-medium">{a.title}</div>
                  <div className="text-xs text-slate-500">{isScheduled ? `Open ${fmtDate(a.opens_at)} – ${fmtDate(a.closes_at)}` : a.deadline ? `Deadline: ${fmtDate(a.deadline)}` : 'No deadline'}</div></div>
                {alreadyDone ? <Badge tone="good">Completed</Badge>
                  : <Button variant="secondary" disabled={disabled} onClick={() => start(a.id)}>{deadlinePassed ? 'Closed' : 'Start'}</Button>}
              </li>)
            })}</ul>}
        </Card>
        <Card title="AI interview assignments">
          {interviewAssignments.loading ? <Spinner /> : !(interviewAssignments.data ?? []).length ? <Empty>No interview assignments right now.</Empty> :
            <ul className="divide-y divide-slate-100">{(interviewAssignments.data ?? []).map((a) => {
              const deadlinePassed = a.deadline && new Date(a.deadline) < new Date()
              const alreadyDone = a.my_attempts > 0
              return (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <div><div className="font-medium">{a.title}</div>
                  <div className="text-xs text-slate-500">{cap(a.interview_type)} · Difficulty {a.difficulty}{a.deadline ? ` · Deadline: ${fmtDate(a.deadline)}` : ''}</div></div>
                {alreadyDone ? <Badge tone="good">Completed</Badge>
                  : <Button variant="secondary" disabled={deadlinePassed} onClick={() => nav(`/interviews?assignment=${a.id}`)}>{deadlinePassed ? 'Closed' : 'Start'}</Button>}
              </li>)
            })}</ul>}
        </Card>
      </div>
      <Card title="Recent interviews">
        {(interviews.data ?? []).length === 0 ? <Empty>No interviews yet.</Empty> :
          <ul className="divide-y divide-slate-100">{interviews.data!.slice(0, 5).map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/interviews/${s.id}/report`} className="font-medium text-brand-700">{cap(s.interview_type)} · {fmtDate(s.created_at)}</Link>
              <span className="flex items-center gap-2">{s.overall_score != null && <b>{num(s.overall_score)}</b>}<Badge tone={integrityTone(s.integrity_status)}>{INTEGRITY_LABEL[s.integrity_status]}</Badge></span>
            </li>))}</ul>}
      </Card>
    </div>
  )
}
