import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, ErrorBox, Field, Input, Select } from '../../components/ui'
import { supabase } from '../../lib/supabase'

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center"><div className="text-3xl font-bold text-brand-700">SpeakReady</div>
          <p className="mt-1 text-sm text-slate-600">Placement communication readiness</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="mb-4 text-xl font-semibold">{title}</h1>{children}</div>
      </div>
    </div>
  )
}

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const nav = useNavigate()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setError(error.message)
    else nav('/')
  }
  const forgot = async () => {
    if (!email) return setError('Enter your email first')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` })
    if (error) setError(error.message)
    else setSent(true)
  }
  return (
    <Shell title="Sign in">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
        <Field label="Password"><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        <ErrorBox error={error} />
        {sent && <p className="text-sm text-emerald-700">Check your email for a reset link.</p>}
        <Button className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
        <div className="text-center text-sm">
          <button type="button" onClick={forgot} className="text-brand-700">Forgot password?</button>
        </div>
      </form>
    </Shell>
  )
}

export function Signup() {
  const [f, setF] = useState({ full_name: '', register_no: '', department: '', admission_year: String(new Date().getFullYear()), email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const nav = useNavigate()
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!/^[A-Za-z0-9/-]{4,20}$/.test(f.register_no.trim())) return setError('Enter your college roll number (letters and digits)')
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: f.email, password: f.password,
      options: { data: { full_name: f.full_name, register_no: f.register_no.trim().toUpperCase(), department: f.department, admission_year: f.admission_year },
        emailRedirectTo: `${location.origin}/` },
    })
    setBusy(false)
    if (error) return setError(error.message.includes('Database error') ? 'This roll number or email is already registered.' : error.message)
    if (data.session) nav('/')
    else setDone(true)
  }
  if (done) return <Shell title="Check your email"><p className="text-sm">We sent a confirmation link to {f.email}. Open it, then sign in.</p></Shell>
  return (
    <Shell title="Create your student account">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name"><Input required value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Roll number" hint="Your college roll number. It links all your results and cannot be changed later.">
          <Input required value={f.register_no} onChange={set('register_no')} placeholder="21CS045" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department"><Input value={f.department} onChange={set('department')} placeholder="CSE" /></Field>
          <Field label="Admission year"><Select value={f.admission_year} onChange={set('admission_year')}>{Array.from({ length: new Date().getFullYear() - 2014 }, (_, i) => new Date().getFullYear() - i).map((y) => <option key={y}>{y}</option>)}</Select></Field>
        </div>
        <Field label="Email"><Input type="email" required value={f.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 8 characters"><Input type="password" minLength={8} required value={f.password} onChange={set('password')} /></Field>
        <ErrorBox error={error} />
        <Button className="w-full" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</Button>
        <p className="text-center text-sm"><Link to="/login" className="text-brand-700">Already registered? Sign in</Link></p>
      </form>
    </Shell>
  )
}

// Opened from an invite or password-reset email (Supabase puts a session in the URL).
export function ResetPassword() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nav = useNavigate()
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError(error.message)
    else nav('/')
  }
  return (
    <Shell title="Set your password">
      <form onSubmit={submit} className="space-y-4">
        <Field label="New password"><Input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorBox error={error} />
        <Button className="w-full">Save password</Button>
      </form>
    </Shell>
  )
}
