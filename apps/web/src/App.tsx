import { lazy, Suspense, useEffect, useTransition } from 'react'
import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorBox, Spinner } from './components/ui'
import { RouterProgress } from './components/RouterProgress'
import { useAuth, type Role } from './lib/auth'
import { preloadRoutes } from './lib/route-preload'

// Lazy load pages for code splitting
// Auth pages (needed immediately)
import { Login, ResetPassword } from './pages/auth/AuthPages'

// Student pages (lazy loaded)
const StudentDashboard = lazy(() => import('./pages/student/Dashboard').then(m => ({ default: m.StudentDashboard })))
const Practice = lazy(() => import('./pages/student/Practice').then(m => ({ default: m.Practice })))
const History = lazy(() => import('./pages/student/History').then(m => ({ default: m.History })))
const Rubrics = lazy(() => import('./pages/student/History').then(m => ({ default: m.Rubrics })))
const AssessmentRunner = lazy(() => import('./pages/student/AssessmentRunner').then(m => ({ default: m.AssessmentRunner })))
const AttemptResult = lazy(() => import('./pages/student/AttemptResult').then(m => ({ default: m.AttemptResult })))
const InterviewSetup = lazy(() => import('./pages/student/InterviewSetup').then(m => ({ default: m.InterviewSetup })))
const InterviewRoom = lazy(() => import('./pages/student/InterviewRoom').then(m => ({ default: m.InterviewRoom })))
const InterviewReport = lazy(() => import('./pages/student/InterviewReport').then(m => ({ default: m.InterviewReport })))

// Staff pages (lazy loaded)
const StaffDashboard = lazy(() => import('./pages/staff/Staff').then(m => ({ default: m.StaffDashboard })))
const StudentsList = lazy(() => import('./pages/staff/Staff').then(m => ({ default: m.StudentsList })))
const StudentDetail = lazy(() => import('./pages/staff/Staff').then(m => ({ default: m.StudentDetail })))
const Alerts = lazy(() => import('./pages/staff/Staff').then(m => ({ default: m.Alerts })))
const IntegrityQueue = lazy(() => import('./pages/staff/Integrity').then(m => ({ default: m.IntegrityQueue })))
const IntegritySession = lazy(() => import('./pages/staff/Integrity').then(m => ({ default: m.IntegritySession })))
const QuestionBank = lazy(() => import('./pages/staff/Questions').then(m => ({ default: m.QuestionBank })))
const Reports = lazy(() => import('./pages/staff/Reports').then(m => ({ default: m.Reports })))

// Admin pages (lazy loaded)
const Users = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.Users })))
const Setup = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.Setup })))
const Integrations = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.Integrations })))
const AuditLog = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.AuditLog })))
const OverallScores = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.OverallScores })))
const Overview = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.Overview })))

function Guard({ roles, children }: { roles?: Role[]; children: JSX.Element }) {
  const { me } = useAuth()
  if (roles && me && !roles.includes(me.profile.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { session, me, loading, error, signOut } = useAuth()
  const [isPending, startTransition] = useTransition()

  // Remove app-loading overlay when React takes over
  if (typeof document !== 'undefined') {
    const loader = document.getElementById('app-loading')
    if (loader && !loading) loader.style.display = 'none'
  }

  // Aggressively preload common routes after initial load for instant navigation
  useEffect(() => {
    if (me) {
      // Preload routes based on user role (run in idle time)
      const commonRoutes = ['/history', '/rubrics']
      if (me.profile.role === 'student') {
        // Student: preload dashboard routes immediately
        preloadRoutes([...commonRoutes, '/practice', '/interviews'])
      } else if (me.profile.role === 'admin') {
        // Admin: preload staff/admin routes
        preloadRoutes(['/staff', '/admin/users', '/admin/scores', '/staff/reports'])
      } else if (me.profile.role === 'coordinator') {
        // Coordinator: preload staff routes
        preloadRoutes(['/staff/students', '/staff/reports'])
      }
    }
  }, [me])

  if (loading) return <Spinner />

  return (
    <BrowserRouter>
      <RouterProgress />
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Spinner /></div>}>
        <Routes>
          <Route path="/reset-password" element={<ResetPassword />} />
          {!session ? (<>
            <Route path="*" element={<Login />} />
          </>) : !me ? (
            // Show spinner while profile loads (optimistic - happens in background now)
            <Route path="*" element={<Spinner />} />
          ) : (<>
            <Route path="/interviews/:id/room" element={<Guard roles={['student']}><InterviewRoom /></Guard>} />
            <Route element={<Layout />}>
              <Route path="/" element={me.profile.role === 'student' ? <StudentDashboard /> : <Navigate to={me.profile.role === 'coordinator' ? '/staff/reports' : '/staff'} replace />} />
              <Route path="/practice" element={<Guard roles={['student']}><Practice /></Guard>} />
              <Route path="/history" element={<History />} />
              <Route path="/rubrics" element={<Rubrics />} />
              <Route path="/attempts/:id/take" element={<Guard roles={['student']}><AssessmentRunner /></Guard>} />
              <Route path="/attempts/:id" element={<AttemptResult />} />
              <Route path="/interviews" element={<Guard roles={['student']}><InterviewSetup /></Guard>} />
              <Route path="/interviews/:id/report" element={<InterviewReport />} />
              <Route path="/staff" element={<Guard roles={['admin']}><StaffDashboard /></Guard>} />
              <Route path="/staff/students" element={<Guard roles={['coordinator', 'admin']}><StudentsList /></Guard>} />
              <Route path="/staff/students/:id" element={<Guard roles={['coordinator', 'admin']}><StudentDetail /></Guard>} />
              <Route path="/staff/alerts" element={<Guard roles={['admin']}><Alerts /></Guard>} />
              <Route path="/staff/integrity" element={<Guard roles={['admin']}><IntegrityQueue /></Guard>} />
              <Route path="/staff/integrity/:id" element={<Guard roles={['admin']}><IntegritySession /></Guard>} />
              <Route path="/staff/questions" element={<Guard roles={['admin']}><QuestionBank /></Guard>} />
              <Route path="/staff/reports" element={<Guard roles={['coordinator', 'admin']}><Reports /></Guard>} />
              <Route path="/admin/users" element={<Guard roles={['admin']}><Users /></Guard>} />
              <Route path="/admin/setup" element={<Guard roles={['admin']}><Setup /></Guard>} />
              <Route path="/admin/integrations" element={<Guard roles={['admin']}><Integrations /></Guard>} />
              <Route path="/admin/audit" element={<Guard roles={['admin']}><AuditLog /></Guard>} />
              <Route path="/admin/scores" element={<Guard roles={['admin']}><OverallScores /></Guard>} />
              <Route path="/admin/overview" element={<Guard roles={['admin']}><Overview /></Guard>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </>)}
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
