// Files live in private Supabase Storage buckets. Paths are stored in the database as
// "<bucket>/<path>", e.g. "proctoring-evidence/21CS045/<session>/<event>.jpg".
// STORAGE_DRIVER=local keeps files on disk for development and tests.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from './config'
import { supabaseAdmin } from './supabase'

export function splitPath(full: string): { bucket: string; key: string } {
  const i = full.indexOf('/')
  return { bucket: full.slice(0, i), key: full.slice(i + 1) }
}

const localFile = (full: string) => {
  const resolved = path.resolve(config.LOCAL_STORAGE_DIR, full)
  if (!resolved.startsWith(path.resolve(config.LOCAL_STORAGE_DIR))) throw new Error('bad path')
  return resolved
}
const localSig = (full: string, exp: number) =>
  crypto.createHmac('sha256', config.LOCAL_SIGNING_SECRET).update(`${full}:${exp}`).digest('hex')

export async function putObject(full: string, data: Buffer | string, contentType: string, upsert = false) {
  if (config.STORAGE_DRIVER === 'local') {
    const f = localFile(full)
    await fs.mkdir(path.dirname(f), { recursive: true })
    if (!upsert) {
      const exists = await fs.stat(f).then(() => true, () => false)
      if (exists) throw new Error(`object exists: ${full}`)
    }
    await fs.writeFile(f, data)
    return full
  }
  const { bucket, key } = splitPath(full)
  const { error } = await supabaseAdmin().storage.from(bucket).upload(key, data, { contentType, upsert })
  if (error) throw new Error(`storage upload failed (${full}): ${error.message}`)
  return full
}

export async function getObject(full: string): Promise<Buffer | null> {
  if (config.STORAGE_DRIVER === 'local') return fs.readFile(localFile(full)).catch(() => null)
  const { bucket, key } = splitPath(full)
  const { data, error } = await supabaseAdmin().storage.from(bucket).download(key)
  if (error || !data) return null
  return Buffer.from(await data.arrayBuffer())
}

export async function removeObjects(fulls: string[]) {
  if (!fulls.length) return
  if (config.STORAGE_DRIVER === 'local') {
    await Promise.all(fulls.map((f) => fs.rm(localFile(f), { force: true })))
    return
  }
  const byBucket = new Map<string, string[]>()
  for (const f of fulls) {
    const { bucket, key } = splitPath(f)
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), key])
  }
  for (const [bucket, keys] of byBucket) await supabaseAdmin().storage.from(bucket).remove(keys)
}

// Short-lived links. Returns a map from stored path to URL (missing files are left out).
export async function signedUrls(fulls: (string | null | undefined)[], expiresIn: number): Promise<Record<string, string>> {
  const list = [...new Set(fulls.filter((f): f is string => Boolean(f)))]
  const out: Record<string, string> = {}
  if (!list.length) return out
  if (config.STORAGE_DRIVER === 'local') {
    const exp = Math.floor(Date.now() / 1000) + expiresIn
    for (const f of list)
      out[f] = `${config.PUBLIC_API_URL}/local-files/${f}?exp=${exp}&sig=${localSig(f, exp)}`
    return out
  }
  const byBucket = new Map<string, string[]>()
  for (const f of list) {
    const { bucket, key } = splitPath(f)
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), key])
  }
  for (const [bucket, keys] of byBucket) {
    const { data } = await supabaseAdmin().storage.from(bucket).createSignedUrls(keys, expiresIn)
    for (const item of data ?? []) if (item.signedUrl && item.path) out[`${bucket}/${item.path}`] = item.signedUrl
  }
  return out
}

export async function signedUrl(full: string | null | undefined, expiresIn: number) {
  if (!full) return null
  return (await signedUrls([full], expiresIn))[full] ?? null
}

// Serves files for STORAGE_DRIVER=local, checking the signature.
export async function serveLocal(full: string, exp: number, sig: string): Promise<Buffer | null> {
  if (!exp || exp < Date.now() / 1000) return null
  const expected = localSig(full, exp)
  if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  return getObject(full)
}
