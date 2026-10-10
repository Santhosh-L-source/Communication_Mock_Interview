import { API_URL, supabase } from './supabase'
import { hasSSOAuth } from './sso'

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message) }
}

let cachedToken: string | null = null
let tokenExpiresAt = 0

supabase.auth.onAuthStateChange(() => { cachedToken = null; tokenExpiresAt = 0 })

export async function accessToken() {
  if (hasSSOAuth()) {
    const ssoToken = localStorage.getItem('sso_token');
    if (ssoToken) return ssoToken;
  }

  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken

  const { data } = await supabase.auth.getSession()
  cachedToken = data.session?.access_token ?? ''
  tokenExpiresAt = Date.now() + 30_000
  return cachedToken
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const token = await accessToken()
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
    headers: { authorization: `Bearer ${token}`, ...(opts.form ? {} : { 'content-type': 'application/json' }) },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({}))
    throw new ApiError(res.status, j.error ?? `Request failed (${res.status})`, j.details)
  }
  const type = res.headers.get('content-type') ?? ''
  return (type.includes('json') ? res.json() : res.text()) as Promise<T>
}

export async function downloadCsv(path: string, filename: string) {
  const text = await api<string>(path)
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
