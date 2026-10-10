import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import { requireAuth } from './auth'
import { config } from './config'
import { errorHandler } from './lib/errors'
import { logger } from './lib/logger'
import { admin } from './modules/admin'
import { assessments } from './modules/assessments'
import { cohorts } from './modules/cohorts'
import { evaluations } from './modules/evaluations'
import { external } from './modules/external'
import { integrity } from './modules/integrity'
import { interviews } from './modules/interviews'
import { me } from './modules/me'
import { questions } from './modules/questions'
import { students } from './modules/students'
import { serveLocal } from './storage'

export const corsOrigins = config.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)

export function buildApp() {
  const app = express()
  app.set('trust proxy', 1)
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }))

  // Cache-Control headers for better performance
  app.use((req, res, next) => {
    // Static assets (JS, CSS, images, fonts) - cache for 1 year
    if (req.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|eot|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    }
    // API responses - no cache (always fresh)
    else if (req.url.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
    }
    next()
  })

  app.get('/health', cors({ origin: corsOrigins, credentials: true }), (_req, res) => res.json({ ok: true }))

  if (config.STORAGE_DRIVER === 'local')
    app.get('/local-files/*', async (req, res) => {
      const full = decodeURIComponent((req.params as any)[0])
      const file = await serveLocal(full, Number(req.query.exp), String(req.query.sig ?? ''))
      if (!file) return res.status(403).send('Link expired or invalid')
      res.type(full.split('.').pop() ?? 'bin').send(file)
    })

  // Other projects: API key, any origin (server-to-server)
  app.use('/api/v1', express.json({ limit: '100kb' }), external)

  const api = express.Router()
  api.use(cors({ origin: corsOrigins, credentials: true }))
  api.use(express.json({ limit: '1mb' }))
  api.use(requireAuth)
  for (const r of [me, assessments, questions, interviews, integrity, evaluations, students, cohorts, admin]) api.use(r)
  app.use('/api/v1', api)

  app.use(errorHandler)
  return app
}
