// Read API for other projects, keyed by register number. Auth: x-api-key header (see docs/integration).
import { Router, type NextFunction, type Request, type Response } from 'express'
import { z } from 'zod'
import { one, q } from '../db'
import { ah, HttpError } from '../lib/errors'
import { hashKey } from './admin'
import { buildReports, reportsUpdatedSince } from './externalService'

export const external = Router()
const hits = new Map<string, number[]>()

async function apiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const key = req.header('x-api-key')
    if (!key) throw new HttpError(401, 'Missing x-api-key')
    const client = await one(`select id, scopes from api_clients where key_hash = $1 and is_active`, [hashKey(key)])
    if (!client || !client.scopes.includes('scores:read')) throw new HttpError(401, 'Invalid API key')
    const now = Date.now()
    const recent = (hits.get(client.id) ?? []).filter((t) => now - t < 60_000)
    if (recent.length >= 600) throw new HttpError(429, 'Rate limit: 600 requests per minute')
    recent.push(now)
    hits.set(client.id, recent)
    if (recent.length === 1) q(`update api_clients set last_used_at = now() where id = $1`, [client.id]).catch(() => {})
    next()
  } catch (e) {
    next(e)
  }
}

external.use('/external', apiKey)

external.get('/external/students/:registerNo', ah(async (req, res) => {
  const [report] = await buildReports([req.params.registerNo.trim().toUpperCase()])
  if (!report) throw new HttpError(404, 'Unknown register number')
  res.json(report)
}))

external.get('/external/students', ah(async (req, res) => {
  const p = z.object({ updated_since: z.string().datetime({ offset: true }), page: z.coerce.number().int().min(1).default(1),
    cohort: z.string().optional() }).parse(req.query)
  res.json(await reportsUpdatedSince(p.updated_since, p.page, p.cohort))
}))
