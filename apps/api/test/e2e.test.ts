// End-to-end: the Day-30 scenario plus an AI interview with an anti-cheat event, against a real Postgres.
// Needs .env.test (local Postgres with supabase/local-stub.sql + migrations, AI_MOCK=true, STORAGE_DRIVER=local).
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { SignJWT } from 'jose'
import { io as ioc } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const RUN = process.env.RUN_E2E === 'true' && process.env.DATABASE_URL?.includes('127.0.0.1') && process.env.AI_MOCK === 'true'
const d = RUN ? describe : describe.skip

let base = ''
let server: http.Server
let db: typeof import('../src/db')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function token(sub: string) {
  return new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(sub).setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!))
}
async function makeUser(role: string, extra: Record<string, unknown> = {}) {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`
  const row = await db.one(`insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1,$2,$3) returning id`,
    [email, JSON.stringify({ full_name: `Test ${role}`, ...extra }), JSON.stringify({ role })])
  return { id: row.id as string, token: await token(row.id), email }
}
async function api(tok: string, method: string, path: string, body?: unknown, raw = false) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method, headers: { authorization: `Bearer ${tok}`, ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  })
  if (raw) return res
  const json: any = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${JSON.stringify(json)}`)
  return json
}
async function until<T>(fn: () => Promise<T | null | undefined | false>, ms = 60_000): Promise<T> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    const v = await fn()
    if (v) return v
    await sleep(500)
  }
  throw new Error('timed out')
}
const jpeg = () => new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(200).fill(1), 0xff, 0xd9])], { type: 'image/jpeg' })

d('SpeakReady end to end', () => {
  let student: Awaited<ReturnType<typeof makeUser>>
  let adminU: Awaited<ReturnType<typeof makeUser>>
  let trainer: Awaited<ReturnType<typeof makeUser>>
  const regNo = `21CS${Math.floor(Math.random() * 90000 + 10000)}`

  beforeAll(async () => {
    db = await import('../src/db')
    const { buildApp, corsOrigins } = await import('../src/app')
    const { attachInterviewGateway } = await import('../src/interview/gateway')
    const { startWorkers } = await import('../src/jobs/workers')
    const { seed } = await import('../src/seed/seed')
    await seed()
    server = http.createServer(buildApp())
    attachInterviewGateway(server, corsOrigins)
    await new Promise<void>((r) => server.listen(Number(process.env.PORT), r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await startWorkers()
    const cohort = await db.one(`select id from cohorts limit 1`)
    student = await makeUser('student', { register_no: regNo.toLowerCase(), department: 'CSE', year_of_study: 4, cohort_id: cohort.id })
    adminU = await makeUser('admin')
    trainer = await makeUser('trainer')
    await db.q(`insert into staff_assignments (staff_id, relation, cohort_id) values ($1,'trainer',$2)`, [trainer.id, cohort.id])
  })
  afterAll(async () => {
    const { stopBoss } = await import('../src/jobs/boss')
    await stopBoss()
    server?.close()
    await db?.pool.end()
  })

  it('creates the profile from sign-up metadata with an upper-case register number', async () => {
    const me = await api(student.token, 'GET', '/me')
    expect(me.profile.register_no).toBe(regNo)
    expect(me.readiness).toBeNull()
  })

  it('rejects a student sign-up without a register number', async () => {
    await expect(makeUser('student')).rejects.toThrow()
  })

  let baselineAttempt = ''
  it('baseline -> 4-dimension readiness profile -> coach assigns practice', async () => {
    const list = await api(student.token, 'GET', '/assessments')
    const formA = list.find((a: any) => a.title.includes('Form A'))
    const attempt = await api(student.token, 'POST', `/assessments/${formA.id}/attempts`)
    baselineAttempt = attempt.id
    const { items } = await api(student.token, 'GET', `/attempts/${attempt.id}`)
    expect(items.every((i: any) => i.answer_key === undefined)).toBe(true)
    for (const item of items) {
      if (item.type.endsWith('mcq')) await api(student.token, 'PUT', `/attempts/${attempt.id}/responses/${item.question_id}`, { selected_option: '0' })
      else if (item.type === 'spoken') {
        const fd = new FormData()
        fd.append('audio', new Blob([Buffer.alloc(2000, 1)], { type: 'audio/webm' }), 'a.webm')
        fd.append('duration_s', '40')
        fd.append('caption', 'Hello, I am a final year computer science student. Um, I built a placement portal with two friends and it reduced manual work by forty percent.')
        await api(student.token, 'POST', `/attempts/${attempt.id}/responses/${item.question_id}/audio`, fd)
      } else await api(student.token, 'PUT', `/attempts/${attempt.id}/responses/${item.question_id}`, {
        answer_text: 'Dear Sir, I have an exam at the same time as my interview. Could we please reschedule to Thursday or Friday? Thank you for understanding. Regards, Student' })
    }
    await api(student.token, 'POST', `/attempts/${attempt.id}/submit`)
    const result = await until(async () => {
      const r = await api(student.token, 'GET', `/attempts/${attempt.id}/result`)
      return r.status === 'evaluated' && r
    })
    expect(result.total_score).toBeGreaterThan(0)
    const writing = result.responses.find((r: any) => r.type === 'long_text')
    expect(writing.evaluation.criteria.length).toBe(5)
    expect(writing.evaluation.feedback.strengths.length).toBeGreaterThan(0)
    expect(result.responses.find((r: any) => r.type === 'mcq').answer_key).toBeTruthy() // shown after evaluation

    const me = await api(student.token, 'GET', '/me')
    for (const k of ['reading', 'writing', 'listening', 'speaking']) expect(me.readiness[k]).not.toBeNull()
    expect(me.readiness.level).toBeGreaterThanOrEqual(1)
    expect(me.readiness.weakest_dimension).toBeTruthy()

    const plan = await until(async () => {
      const p = await api(student.token, 'GET', '/me/plan')
      return p.items.length > 0 && p
    })
    expect(plan.items[0].reason).toBeTruthy()
    const run = await db.one(`select * from agent_runs where idempotency_key = $1`, [`attempt:${attempt.id}`])
    expect(run.state).toBe('done')
    const steps = await db.q(`select step, tool from agent_steps where run_id = $1 order by seq`, [run.id])
    expect(steps.map((s) => s.tool)).toEqual(expect.arrayContaining(['get_recent_performance', 'get_readiness_profile', 'find_exercises', 'assign_practice']))
  })

  it('practice from the plan closes the plan item', async () => {
    const plan = await api(student.token, 'GET', '/me/plan')
    const item = plan.items.find((i: any) => i.question_id && i.status === 'pending')
    const attempt = await api(student.token, 'POST', `/practice/${item.question_id}/attempts`)
    const { items } = await api(student.token, 'GET', `/attempts/${attempt.id}`)
    const it0 = items[0]
    if (it0.type.endsWith('mcq')) await api(student.token, 'PUT', `/attempts/${attempt.id}/responses/${it0.question_id}`, { selected_option: '1' })
    else if (it0.type === 'spoken') {
      const fd = new FormData()
      fd.append('audio', new Blob([Buffer.alloc(1000, 1)], { type: 'audio/webm' }), 'a.webm')
      fd.append('duration_s', '30')
      fd.append('caption', 'First I listened to the client, then I fixed the issue and finally I shared the timeline with them. Thank you.')
      await api(student.token, 'POST', `/attempts/${attempt.id}/responses/${it0.question_id}/audio`, fd)
    } else await api(student.token, 'PUT', `/attempts/${attempt.id}/responses/${it0.question_id}`, { answer_text: 'First, I would apologise and explain the delay. Then I would share a new date and a plan. Thank you.' })
    await api(student.token, 'POST', `/attempts/${attempt.id}/submit`)
    await until(async () => (await db.one(`select status from plan_items where id = $1`, [item.id])).status === 'done')
  })

  let sessionId = ''
  it('AI interview with an anti-cheat event, then a scored report', async () => {
    await expect(api(student.token, 'POST', '/interviews', { interview_type: 'hr' })).rejects.toThrow(/consent/)
    await api(student.token, 'POST', '/me/consent', { recording: true, proctoring: true })
    const s = await api(student.token, 'POST', '/interviews', { interview_type: 'hr', planned_questions: 3 })
    sessionId = s.id
    const socket = ioc(base, { auth: { token: student.token, sessionId }, transports: ['websocket'] })
    const questions: any[] = []
    const warnings: any[] = []
    let ended = false
    socket.on('ai:question', (q) => questions.push(q))
    socket.on('proctor:warning', (w) => warnings.push(w))
    socket.on('interview:ended', () => { ended = true })
    await until(async () => questions.length >= 1)
    expect(questions[0].text).toMatch(/welcome/i)

    // Phone held up during the first answer: photo + transcript excerpt saved
    const fd = new FormData()
    fd.append('event_type', 'phone_detected')
    fd.append('severity', 'high')
    fd.append('confidence', '0.82')
    fd.append('occurred_at', new Date().toISOString())
    fd.append('duration_ms', '2600')
    fd.append('details', JSON.stringify({ model: 'efficientdet_lite0', label: 'cell phone' }))
    fd.append('photo', jpeg(), 'e.jpg')
    const ev = await api(student.token, 'POST', `/interviews/${sessionId}/proctor-events`, fd)
    expect(ev.integrity.integrity_score).toBe(80)

    const answers = [
      'Thank you. I am a final year CSE student. I built a placement portal with Node and Postgres that saved the placement office forty percent of their time.',
      'My strength is learning quickly. For example I learned React in two weeks for a hackathon and we reached the finals.',
      'In my project two teammates disagreed on the database. First I listened to both, then we tested both options and finally chose Postgres. The result was a faster release.',
      'I want to grow as a backend engineer and lead a small team in five years. Thank you.',
      'Thank you for the opportunity.',
    ]
    for (let i = 0; i < 8 && !ended; i++) {
      const before = questions.length
      const ack: any = await socket.timeout(30_000).emitWithAck('answer', {
        audio: Buffer.alloc(3000, 2), mime: 'audio/webm', started_at: Date.now() - 20_000, ended_at: Date.now(),
        gaze_pct: 88, caption: answers[i % answers.length],
      })
      expect(ack.ok).toBe(true)
      await until(async () => questions.length > before || ended)
    }
    await until(async () => ended)
    socket.close()
    expect(warnings[0].message).toMatch(/phone/i)

    const report = await until(async () => {
      const r = await api(student.token, 'GET', `/interviews/${sessionId}/report`)
      return r.session.status === 'scored' && r
    })
    expect(report.criteria).toHaveLength(13)
    expect(report.criteria.find((c: any) => c.key === 'technical').score).toBeNull() // N/A for HR
    expect(report.criteria.find((c: any) => c.key === 'eye_contact').band).toBe(4)
    expect(report.evaluation.overall).toBeGreaterThan(0)
    expect(report.integrity.events).toHaveLength(1)
    const evRow = await db.one(`select * from proctoring_events where session_id = $1`, [sessionId])
    expect(evRow.snapshot_path).toBe(`proctoring-evidence/${regNo}/${sessionId}/${evRow.id}.jpg`)
    expect(evRow.transcript_excerpt).toMatch(/Interviewer:/)
    const t = await db.one(`select transcript_path from interview_sessions where id = $1`, [sessionId])
    expect(t.transcript_path).toBe(`transcripts/${regNo}/${sessionId}/transcript.json`)
  })

  it('students cannot see the integrity queue; admins review with photo links; views are audited', async () => {
    const res = await api(student.token, 'GET', '/integrity/queue', undefined, true) as Response
    expect(res.status).toBe(403)
    await db.q(`update interview_sessions set integrity_status = 'needs_review' where id = $1`, [sessionId])
    const queue = await api(adminU.token, 'GET', '/integrity/queue')
    expect(queue.some((s: any) => s.id === sessionId)).toBe(true)
    const detail = await api(adminU.token, 'GET', `/integrity/sessions/${sessionId}`)
    expect(detail.events[0].photo_url).toMatch(/local-files\/proctoring-evidence/)
    const photo = await fetch(detail.events[0].photo_url)
    expect(photo.status).toBe(200)
    await api(adminU.token, 'POST', `/integrity/sessions/${sessionId}/review`, { decision: 'cleared', notes: 'Phone was on the desk, not used.' })
    const audit = await db.one(`select count(*)::int as n from audit_log where entity_id = $1 and action = 'evidence.view'`, [sessionId])
    expect(audit.n).toBe(1)
  })

  it('another project reads everything by register number with an API key', async () => {
    const client = await api(adminU.token, 'POST', '/admin/api-clients', { name: 'Placement portal' })
    const bad = await fetch(`${base}/api/v1/external/students/${regNo}`, { headers: { 'x-api-key': 'nope' } })
    expect(bad.status).toBe(401)
    const res = await fetch(`${base}/api/v1/external/students/${regNo.toLowerCase()}`, { headers: { 'x-api-key': client.api_key } })
    expect(res.status).toBe(200)
    const s: any = await res.json()
    expect(s.api_version).toBe('v1')
    expect(s.register_no).toBe(regNo)
    expect(s.readiness.score).toBeGreaterThan(0)
    expect(s.malpractice_confirmed).toBe(false)
    const iv = s.interviews.find((i: any) => i.session_id === sessionId)
    expect(iv.integrity_status).toBe('cleared')
    expect(iv.overall_score).toBeGreaterThan(0)
    expect(iv.criteria.grammar).toBeGreaterThanOrEqual(0)
    expect(iv.review.decision).toBe('cleared')
    expect(iv.evidence[0].type).toBe('phone_detected')
    expect((await fetch(iv.evidence[0].photo_url)).status).toBe(200)
    const tr: any = await (await fetch(iv.transcript_url)).json()
    expect(tr.turns.length).toBeGreaterThan(4)
    const missing = await fetch(`${base}/api/v1/external/students/NOPE123`, { headers: { 'x-api-key': client.api_key } })
    expect(missing.status).toBe(404)
    const list: any = await (await fetch(`${base}/api/v1/external/students?updated_since=2020-01-01T00:00:00Z`, { headers: { 'x-api-key': client.api_key } })).json()
    expect(list.students.some((x: any) => x.register_no === regNo)).toBe(true)
  })

  it('reattempt on the parallel form shows a before/after comparison', async () => {
    const list = await api(student.token, 'GET', '/assessments')
    const formB = list.find((a: any) => a.title.includes('Form B'))
    const attempt = await api(student.token, 'POST', `/assessments/${formB.id}/attempts`)
    expect(attempt.kind).toBe('reattempt')
    const { items } = await api(student.token, 'GET', `/attempts/${attempt.id}`)
    const answers = await db.q(`select id, answer_key from questions where id = any($1)`, [items.map((i: any) => i.question_id)])
    for (const item of items) {
      if (item.type.endsWith('mcq')) {
        const key = answers.find((a) => a.id === item.question_id).answer_key.index
        await api(student.token, 'PUT', `/attempts/${attempt.id}/responses/${item.question_id}`, { selected_option: String(key) })
      } else if (item.type !== 'spoken')
        await api(student.token, 'PUT', `/attempts/${attempt.id}/responses/${item.question_id}`, { answer_text: 'Dear Ms Rao, thank you for the offer. My final exams end on 20 May, so could I please join on 1 June instead? I remain very keen to join the team. Kind regards, Student' })
    }
    await api(student.token, 'POST', `/attempts/${attempt.id}/submit`)
    const result = await until(async () => {
      const r = await api(student.token, 'GET', `/attempts/${attempt.id}/result`)
      return r.status === 'evaluated' && r
    })
    expect(result.comparison.previous_attempt_id).toBe(baselineAttempt)
    expect(result.comparison.by_dimension.reading.after).toBe(100)
  })

  it('a trainer overrides an AI score with a reason; the change is audited', async () => {
    const ev = await db.one(`select id, overall from evaluations where interview_session_id = $1 and status = 'final'`, [sessionId])
    const out = await api(trainer.token, 'POST', `/evaluations/${ev.id}/override`, { reason: 'Grammar was better than the AI judged.', criteria: [{ key: 'grammar', band: 4 }] })
    expect(out.overall).toBeGreaterThanOrEqual(ev.overall)
    const old = await db.one(`select status from evaluations where id = $1`, [ev.id])
    expect(old.status).toBe('superseded')
    const audit = await db.one(`select count(*)::int as n from audit_log where action = 'evaluation.override' and entity_id = $1`, [out.id])
    expect(audit.n).toBe(1)
  })

  it('coordinator report exports CSV without formulas', async () => {
    const cohort = await db.one(`select id from cohorts limit 1`)
    const coord = await makeUser('coordinator')
    const res = await api(coord.token, 'GET', `/cohorts/${cohort.id}/report?format=csv`, undefined, true) as Response
    const csv = await res.text()
    expect(csv.split('\n')[0]).toMatch(/^register_no,/)
    expect(csv).toContain(regNo)
    const raw = await api(coord.token, 'GET', `/attempts/${baselineAttempt}/result`, undefined, true) as Response
    expect(raw.status).toBe(403) // coordinators see aggregates only
  })
})
