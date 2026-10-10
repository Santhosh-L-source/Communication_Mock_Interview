import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

const cache = new Map<string, { data: unknown; at: number }>()
const STALE_MS = 15_000

export function invalidateApi(prefix?: string) {
  if (!prefix) { cache.clear(); return }
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k)
}

export function useApi<T = any>(path: string | null, deps: unknown[] = []) {
  const hit = path ? cache.get(path) : null
  const fresh = hit && Date.now() - hit.at < STALE_MS
  const [data, setData] = useState<T | null>((fresh ? hit.data : null) as T | null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(Boolean(path) && !fresh)
  const mountedRef = useRef(true)

  const load = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try {
      const result = await api<T>(path)
      cache.set(path, { data: result, at: Date.now() })
      if (mountedRef.current) { setData(result); setError(null) }
    } catch (e: any) {
      if (mountedRef.current) setError(e.message)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])

  useEffect(() => {
    mountedRef.current = true
    if (!fresh) load()
    return () => { mountedRef.current = false }
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, error, loading, reload: load, setData }
}

export function usePoll<T = any>(path: string, done: (d: T) => boolean, intervalMs = 2500) {
  const state = useApi<T>(path)
  useEffect(() => {
    if (!state.data || done(state.data)) return
    const t = setTimeout(state.reload, intervalMs)
    return () => clearTimeout(t)
  }, [state.data]) // eslint-disable-line react-hooks/exhaustive-deps
  return state
}
