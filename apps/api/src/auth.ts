import type { NextFunction, Request, Response } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import jwt from 'jsonwebtoken'
import { config } from './config'
import { one } from './db'
import { forbidden, HttpError } from './lib/errors'

export type Role = 'student' | 'trainer' | 'mentor' | 'coordinator' | 'admin'
export interface AuthUser {
  id: string
  role: Role
  full_name: string
  email: string
  register_no: string | null
  cohort_id: string | null
}

declare global {
  namespace Express {
    interface Request { user: AuthUser }
  }
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

// Verifies a Supabase access token. Uses the legacy JWT secret when set, otherwise the project's public keys.
export async function verifySupabaseToken(token: string): Promise<JWTPayload> {
  if (config.SUPABASE_JWT_SECRET) {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(config.SUPABASE_JWT_SECRET))
    return payload
  }
  if (!config.SUPABASE_URL) throw new Error('SUPABASE_URL or SUPABASE_JWT_SECRET is required')
  jwks ??= createRemoteJWKSet(new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  const { payload } = await jwtVerify(token, jwks)
  return payload
}

// Verifies a Project 9 JWT token (SSO from main dashboard)
export function verifyProject9Token(token: string): any {
  const jwtSecret = process.env.JWT_SECRET || config.SUPABASE_JWT_SECRET
  if (!jwtSecret) throw new Error('JWT_SECRET is required for SSO')
  return jwt.verify(token, jwtSecret)
}

const cache = new Map<string, { user: AuthUser; at: number }>()

export async function loadUser(userId: string): Promise<AuthUser | null> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < 30_000) return hit.user
  const user = await one<AuthUser>(
    `select id, role, full_name, email, register_no, cohort_id from profiles where id = $1`, [userId])
  if (user) cache.set(userId, { user, at: Date.now() })
  return user
}
export const forgetUser = (userId: string) => cache.delete(userId)

export async function userFromToken(token: string | undefined): Promise<AuthUser> {
  if (!token) throw new HttpError(401, 'Missing access token')

  let payload: any
  let userId: string | null = null

  // Try Supabase token first
  try {
    payload = await verifySupabaseToken(token)
    userId = payload.sub || null
  } catch (supabaseError) {
    // If Supabase verification fails, try Project 9 JWT token (SSO)
    try {
      payload = verifyProject9Token(token)
      userId = payload.id || payload.sub || null
      console.log('[AUTH] SSO token verified from Project 9:', userId)
    } catch (project9Error) {
      console.error('[AUTH] Token verification failed:', { supabaseError, project9Error })
      throw new HttpError(401, 'Invalid or expired token')
    }
  }

  if (!userId) throw new HttpError(401, 'No user ID in token')

  const user = await loadUser(userId)
  if (!user) throw new HttpError(401, 'No profile for this account')

  return user
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? ''
    req.user = await userFromToken(header.startsWith('Bearer ') ? header.slice(7) : undefined)
    next()
  } catch (e) {
    next(e)
  }
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) =>
  roles.includes(req.user.role) ? next() : next(forbidden('Your role cannot do this'))

export const isStaff = (u: AuthUser) => u.role !== 'student'

// Same rule as public.can_view_student() in the database.
export async function canViewStudent(u: AuthUser, studentId: string): Promise<boolean> {
  if (u.id === studentId || u.role === 'admin' || u.role === 'coordinator') return true
  if (u.role === 'student') return false
  const row = await one(
    `select 1 from staff_assignments sa join profiles p on p.id = $2
      where sa.staff_id = $1 and (sa.student_id = $2 or sa.cohort_id = p.cohort_id) limit 1`, [u.id, studentId])
  return Boolean(row)
}

export async function assertCanViewStudent(u: AuthUser, studentId: string) {
  if (!(await canViewStudent(u, studentId))) throw forbidden('You cannot view this student')
}
