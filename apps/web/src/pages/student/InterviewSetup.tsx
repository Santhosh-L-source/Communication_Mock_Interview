import { INTERVIEW_TYPES } from '@speakready/shared'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from '../../components/ui'
import { VoiceActivity } from '../../features/interview/audio'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { useApi } from '../../lib/useApi'
import { API_URL } from '../../lib/supabase'

type Check = 'pending' | 'ok' | 'fail'
const Status = ({ s, label }: { s: Check; label: string }) => (
  <li className="flex items-center justify-between py-1.5 text-sm"><span>{label}</span>
    <Badge tone={s === 'ok' ? 'good' : s === 'fail' ? 'bad' : 'neutral'}>{s === 'ok' ? 'OK' : s === 'fail' ? 'Problem' : 'Checking…'}</Badge></li>
)

export function InterviewSetup() {
  const { me, refresh } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const assignmentId = params.get('assignment')
  const assignment = useApi<any>(assignmentId ? `/interview-assignments` : null)
  const assignmentData = (assignment.data ?? []).find((a: any) => a.id === assignmentId)
  const config = useApi<{ interview_type: string; difficulty: number; planned_questions: number; duration_min?: number }>(assignmentId ? null : '/interview-config')
  const [checks, setChecks] = useState<Record<string, Check>>({ camera: 'pending', mic: 'pending', net: 'pending', browser: 'pending' })
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [agree, setAgree] = useState(false)
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let vad: VoiceActivity | null = null
    let t = 0
    const isChromium = /Chrome|Edg\//.test(navigator.userAgent)
    setChecks((c) => ({ ...c, browser: isChromium && 'MediaRecorder' in window ? 'ok' : 'fail' }))
    const started = performance.now()
    fetch(`${API_URL}/health`).then((r) => setChecks((c) => ({ ...c, net: r.ok && performance.now() - started < 3000 ? 'ok' : 'fail' })))
      .catch(() => setChecks((c) => ({ ...c, net: 'fail' })))
    navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true }).then((s) => {
      stream = s
      if (video.current) video.current.srcObject = s
      setChecks((c) => ({ ...c, camera: s.getVideoTracks().length ? 'ok' : 'fail' }))
      vad = new VoiceActivity(s)
      let heard = false
      t = window.setInterval(() => {
        const l = vad!.level()
        setLevel(l)
        if (l > 0.02 && !heard) { heard = true; setChecks((c) => ({ ...c, mic: 'ok' })) }
      }, 150)
    }).catch(() => setChecks((c) => ({ ...c, camera: 'fail', mic: 'fail' })))
    return () => { clearInterval(t); vad?.close(); stream?.getTracks().forEach((x) => x.stop()) }
  }, [])

  const consented = Boolean(me?.profile.proctoring_consent_at)
  const assignmentDone = assignmentData?.my_attempts > 0
  const assignmentExpired = assignmentData?.deadline && new Date(assignmentData.deadline) < new Date()

  // STRICT ENFORCEMENT: Camera AND Microphone are MANDATORY
  const hasCamera = checks.camera === 'ok'
  const hasMic = checks.mic === 'ok'
  const hasNetwork = checks.net === 'ok'
  const hasBrowser = checks.browser === 'ok'

  const ready = hasCamera && hasMic && hasNetwork && hasBrowser && (consented || agree) && !assignmentDone && !assignmentExpired

  // User-friendly error messages
  const getBlockReason = () => {
    if (!hasCamera && !hasMic) return 'Camera and microphone required'
    if (!hasCamera) return 'Camera required - please allow camera access'
    if (!hasMic) return 'Microphone required - please allow microphone access'
    if (!hasNetwork) return 'Cannot connect to server - check your internet'
    if (!hasBrowser) return 'Please use Chrome or Edge browser'
    if (assignmentDone) return 'You have already completed this interview'
    if (assignmentExpired) return 'This assignment has expired'
    if (!consented && !agree) return 'Please agree to monitoring consent'
    return null
  }

  const start = async () => {
    // Double-check before starting
    if (!hasCamera || !hasMic) {
      setError('Cannot start interview: Camera and microphone are mandatory for AI interviews with proctoring.')
      return
    }

    setBusy(true)
    setError(null)
    try {
      if (!consented) { await api('/me/consent', { body: { recording: true, proctoring: true } }); await refresh() }
      const s = await api('/interviews', { body: {
        device_info: { ua: navigator.userAgent, screen: `${screen.width}x${screen.height}` },
        ...(assignmentId && { assignment_id: assignmentId }),
      } })
      nav(`/interviews/${s.id}/room`)
    } catch (e: any) {
      if (e.details?.session_id) nav(`/interviews/${e.details.session_id}/room`)
      else { setError(e.message); setBusy(false) }
    }
  }

  const retryPermissions = () => {
    window.location.reload()
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={assignmentData ? assignmentData.title : 'AI mock interview'} subtitle="The AI interviewer asks questions aloud, listens to your answers and asks follow-ups. You get a scored report afterwards." />
      <div className="grid gap-6 md:grid-cols-2">
        <Card title="1. Your interview">
          {(assignmentData || config.data) ? (() => {
            const cfg = assignmentData ?? config.data!
            return (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Type:</span> {INTERVIEW_TYPES.find((t) => t.value === cfg.interview_type)?.label ?? cfg.interview_type}</p>
              <p><span className="font-medium">Difficulty:</span> {cfg.difficulty} / 5</p>
              <p><span className="font-medium">Duration:</span> {cfg.duration_min ?? 10} minutes</p>
              <p><span className="font-medium">Questions:</span> ~{cfg.planned_questions}</p>
              {assignmentData?.deadline && <p><span className="font-medium">Deadline:</span> {new Date(assignmentData.deadline).toLocaleString()}</p>}
              {assignmentData?.my_attempts > 0 && <p className="font-medium text-red-600">You have already completed this interview.</p>}
            </div>)
          })() : <Spinner />}
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-slate-600">
            <li>Use Chrome or Edge on a laptop with a webcam, in a quiet, well-lit room.</li>
            <li>The interview runs in full screen. Stay on this tab and keep your face in view.</li>
            <li>After each question, answer out loud. Stop talking for 3 seconds or press "I'm done" to finish an answer.</li>
          </ul>
        </Card>
        <Card title="2. Device check">
          <video ref={video} autoPlay muted playsInline className="mb-3 aspect-video w-full rounded-lg bg-slate-900 object-cover" />
          <div className="mb-2 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-emerald-500 transition-all" style={{ width: `${Math.min(100, level * 800)}%` }} /></div>
          <p className="mb-2 text-xs text-slate-500">Say something to test your microphone.</p>
          <ul className="divide-y divide-slate-100">
            <Status s={checks.camera} label="Camera" /><Status s={checks.mic} label="Microphone" />
            <Status s={checks.net} label="Connection to server" /><Status s={checks.browser} label="Browser (Chrome or Edge recommended)" />
          </ul>
        </Card>
      </div>
      {!consented && (
        <Card title="Monitoring consent">
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />
            I agree that my answers are recorded and transcribed, and that my camera and screen activity are monitored in my browser. If something
            unusual is detected, a still photo and the transcript at that moment are saved for an admin to review. No video is recorded.</label>
        </Card>
      )}
      {/* Camera/Mic Required Warning */}
      {(checks.camera === 'fail' || checks.mic === 'fail') && (
        <Card title="⚠️ Required Access Missing">
          <div className="space-y-3 text-sm">
            <p className="font-medium text-red-600">
              {checks.camera === 'fail' && checks.mic === 'fail'
                ? 'Camera and microphone access are required but not available.'
                : checks.camera === 'fail'
                ? 'Camera access is required but not available.'
                : 'Microphone access is required but not available.'}
            </p>
            <p className="text-slate-600">
              AI interviews require:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-600">
              <li><strong>Camera</strong> - For face detection and proctoring (anti-cheat)</li>
              <li><strong>Microphone</strong> - To record your spoken answers</li>
            </ul>
            <p className="text-slate-600">
              <strong>How to fix:</strong>
            </p>
            <ol className="list-decimal pl-5 space-y-1 text-slate-600">
              <li>Click the <strong>camera icon</strong> in your browser's address bar</li>
              <li>Select <strong>"Always allow"</strong> for camera and microphone</li>
              <li>Click the button below to retry</li>
            </ol>
            <div className="pt-2">
              <Button onClick={retryPermissions} variant="secondary">
                ↻ Retry Permissions
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ErrorBox error={error} />

      <div className="flex items-center justify-between">
        {!ready && getBlockReason() && (
          <p className="text-sm text-red-600 font-medium">
            🚫 {getBlockReason()}
          </p>
        )}
        <div className="ml-auto">
          <Button
            onClick={start}
            disabled={!ready || busy}
            title={!ready ? getBlockReason() || 'Complete all checks first' : 'Start the AI interview'}
          >
            {busy ? 'Preparing…' : 'Start interview'}
          </Button>
        </div>
      </div>
    </div>
  )
}
