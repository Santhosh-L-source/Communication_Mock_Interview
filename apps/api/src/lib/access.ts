import type { AuthUser } from '../auth'
import { canViewStudent } from '../auth'
import { forbidden } from './errors'

// Raw answers, recordings and transcripts: the student, admins and assigned trainers/mentors.
// Coordinators see aggregates only (design §2).
export async function assertCanViewRaw(u: AuthUser, studentId: string) {
  if (u.role === 'coordinator' || !(await canViewStudent(u, studentId))) throw forbidden('You cannot view this student\'s answers')
}
