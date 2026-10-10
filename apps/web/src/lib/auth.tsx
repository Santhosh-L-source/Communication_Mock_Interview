import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import { supabase } from './supabase'
import { extractSSOToken, validateSSOToken, createMockSession, clearSSO, hasSSOAuth } from './sso'

export type Role = 'student' | 'coordinator' | 'admin'
export interface Me {
  profile: { id: string; role: Role; full_name: string; email: string; register_no: string | null; department: string | null
    year_of_study: number | null; target_roles: string[]
    recording_consent_at: string | null; proctoring_consent_at: string | null }
  readiness: any | null
  baseline: { id: string; status: string } | null
  unread_notifications: number
}

interface AuthState { session: Session | null; me: Me | null; loading: boolean; error: string | null; refresh: () => Promise<void>; signOut: () => Promise<void> }
const Ctx = createContext<AuthState>(null as any)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'))
      setError(null)
    } catch (e: any) {
      setMe(null)
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    const initAuth = async () => {
      const ssoToken = extractSSOToken();

      if (ssoToken) {
        const userData = await validateSSOToken(ssoToken);
        if (userData) {
          const mockSession = createMockSession(userData, ssoToken);
          setSession(mockSession as Session);
          setLoading(false);
          refresh().catch(() => {});
          return;
        }
        clearSSO();
      }

      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setLoading(false);

      if (data.session) refresh().catch(() => {});
    };

    initAuth();

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN') refresh()
      if (event === 'SIGNED_OUT') {
        setMe(null);
        clearSSO();
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [refresh])

  const signOut = async () => {
    clearSSO();
    await supabase.auth.signOut();
    setMe(null);
  }
  return <Ctx.Provider value={{ session, me, loading, error, refresh, signOut }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
export const isStaff = (r?: Role) => Boolean(r && r !== 'student')
