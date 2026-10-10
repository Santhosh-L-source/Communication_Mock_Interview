import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  const v = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-slate-300',
    secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
    ghost: 'text-brand-700 hover:bg-brand-50',
  }[variant]
  return <button {...p} className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed', v, className)} />
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
      {(title || action) && <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-base font-semibold text-slate-900">{title}</h2>{action}</div>}
      {children}
    </section>
  )
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold text-slate-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}</div>
      {action}
    </div>
  )
}

const tones = {
  neutral: 'bg-slate-100 text-slate-700', good: 'bg-emerald-100 text-emerald-800', warn: 'bg-amber-100 text-amber-800',
  bad: 'bg-red-100 text-red-800', info: 'bg-brand-100 text-brand-700',
}
export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>
}
export const integrityTone = (s?: string) => (s === 'clean' || s === 'cleared' ? 'good' : s === 'needs_review' ? 'warn' : s ? 'bad' : 'neutral')

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>
}
const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-600 focus:outline-none'
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>((p, ref) => <textarea ref={ref} {...p} className={cx(inputCls, p.className)} />)
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />

export const Spinner = ({ label = 'Loading…' }: { label?: string }) => (
  <div className="flex items-center gap-2 py-6 text-sm text-slate-500" role="status">
    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />{label}
  </div>
)
export const ErrorBox = ({ error }: { error: string | null | undefined }) =>
  error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">{error}</div> : null

export const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-slate-500">{children}</p>

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
    <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>{sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}</div>
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto"><table className="w-full text-left text-sm">
      <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500">{head.map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{children}</tbody>
    </table></div>
  )
}
export const Td = ({ children, className }: { children?: ReactNode; className?: string }) => <td className={cx('px-3 py-2 align-top', className)}>{children}</td>

export function ScoreBar({ value, max = 100 }: { value: number | null | undefined; max?: number }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, (value / max) * 100))
  const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return <div className="h-2 w-full rounded-full bg-slate-100"><div className={cx('h-2 rounded-full', color)} style={{ width: `${pct}%` }} /></div>
}
