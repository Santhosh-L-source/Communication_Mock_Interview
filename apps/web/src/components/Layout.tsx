import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth, type Role } from '../lib/auth'
import { fmtDate } from '../lib/format'
import { supabase } from '../lib/supabase'
import { getPreloadHandlers } from '../lib/route-preload'

const NAV: Record<Role, [string, string][]> = {
  student: [['/', 'Dashboard'], ['/practice', 'Practice'], ['/interviews', 'AI interview'], ['/history', 'History'], ['/rubrics', 'How scoring works']],
  coordinator: [['/staff/reports', 'Readiness reports'], ['/staff/students', 'Students']],
  admin: [['/staff', 'Dashboard'], ['/staff/students', 'Students'], ['/staff/integrity', 'Integrity'], ['/staff/alerts', 'Alerts'], ['/staff/questions', 'Question bank'],
    ['/staff/reports', 'Reports'], ['/admin/users', 'Users'], ['/admin/setup', 'AI assessment'], ['/admin/scores', 'All scores'], ['/admin/integrations', 'API access'], ['/admin/audit', 'Audit log'], ['/admin/overview', 'System']],
}

function Notifications() {
  const { me, refresh } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<any[]>([])
  const toggle = async () => {
    if (!open) {
      setItems(await api('/me/notifications'))
      if (me?.unread_notifications) { await api('/me/notifications/read', { method: 'POST' }); refresh() }
    }
    setOpen(!open)
  }
  return (
    <div className="relative">
      <button onClick={toggle} className="relative rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100" aria-label="Notifications">
        🔔{me?.unread_notifications ? <span className="absolute -right-0.5 -top-0.5 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{me.unread_notifications}</span> : null}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {items.length ? items.map((n) => (
            <Link key={n.id} to={n.link ?? '#'} onClick={() => setOpen(false)} className="block rounded-lg p-2 hover:bg-slate-50">
              <div className="text-sm font-medium">{n.title}</div>{n.body && <div className="text-xs text-slate-600">{n.body}</div>}
              <div className="text-[11px] text-slate-400">{fmtDate(n.created_at)}</div>
            </Link>)) : <p className="p-3 text-sm text-slate-500">No notifications yet.</p>}
        </div>
      )}
    </div>
  )
}

// Live integrity alerts for admins (Supabase Realtime on the alerts table)
function LiveAlerts() {
  const [toast, setToast] = useState<any | null>(null)
  const navigate = useNavigate()
  useEffect(() => {
    const ch = supabase.channel('live-alerts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts' }, (p) => {
      if ((p.new as any).kind === 'integrity') setToast(p.new)
    }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
  if (!toast) return null
  return (
    <div className="fixed bottom-4 right-4 z-30 w-80 rounded-xl border border-red-200 bg-white p-4 shadow-xl" role="alert">
      <div className="text-sm font-semibold text-red-700">Live integrity alert</div>
      <div className="mt-1 text-sm">{toast.reason}</div>
      <div className="mt-3 flex gap-2">
        <button className="text-sm font-medium text-brand-700" onClick={() => { navigate(`/staff/integrity/${toast.session_id}`); setToast(null) }}>Review</button>
        <button className="text-sm text-slate-500" onClick={() => setToast(null)}>Dismiss</button>
      </div>
    </div>
  )
}

export function Layout() {
  const { me, signOut } = useAuth()
  const role = me?.profile.role ?? 'student'
  const [menu, setMenu] = useState(false)
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <Link to={role === 'student' ? '/' : role === 'coordinator' ? '/staff/reports' : '/staff'} className="text-lg font-bold text-brand-700">SpeakReady</Link>
          <button className="ml-auto rounded-lg px-2 py-1 text-sm md:hidden" onClick={() => setMenu(!menu)} aria-label="Menu">☰</button>
          <nav className={`${menu ? 'flex' : 'hidden'} absolute left-0 right-0 top-full flex-col border-b border-slate-200 bg-white p-2 md:static md:flex md:flex-row md:border-0 md:p-0`}>
            {NAV[role].map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/' || to === '/staff'} onClick={() => setMenu(false)}
                {...getPreloadHandlers(to)}
                className={({ isActive }) => `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</NavLink>
            ))}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            <Notifications />
            <span className="text-sm text-slate-600">{me?.profile.full_name}{me?.profile.register_no ? ` · ${me.profile.register_no}` : ''}</span>
            <button onClick={signOut} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Sign out</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6"><Outlet /></main>
      {role === 'admin' && <LiveAlerts />}
      <div className="flex justify-center gap-4 pb-6 md:hidden"><Notifications /><button onClick={signOut} className="text-sm text-slate-600">Sign out</button></div>
    </div>
  )
}
