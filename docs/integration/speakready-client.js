// SpeakReady client for other projects. Copy this one file; no dependencies (Node 18+ has fetch).
// .env: SPEAKREADY_URL=https://api.speakready.example   SPEAKREADY_KEY=sk_live_...

const BASE = process.env.SPEAKREADY_URL
const KEY = process.env.SPEAKREADY_KEY

async function call(path) {
  const res = await fetch(`${BASE}/api/v1${path}`, { headers: { 'x-api-key': KEY } })
  if (res.status === 404) return null // unknown register number
  if (!res.ok) throw new Error(`SpeakReady ${res.status}: ${await res.text()}`)
  return res.json()
}

// Everything for one student: scores, criteria marks, cheating status, transcript and photo links.
export function getStudent(registerNo) {
  return call(`/external/students/${encodeURIComponent(registerNo)}`)
}

// Every student changed since `since` (Date or ISO string). Follows pages for you.
export async function getUpdatedSince(since) {
  const iso = since instanceof Date ? since.toISOString() : since
  const all = []
  for (let page = 1; ; page++) {
    const body = await call(`/external/students?updated_since=${encodeURIComponent(iso)}&page=${page}`)
    all.push(...body.students)
    if (!body.next_page) return all
  }
}
