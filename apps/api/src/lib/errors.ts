import type { NextFunction, Request, Response, RequestHandler } from 'express'
import { ZodError } from 'zod'
import { AiUnavailableError } from '../ai/llm'
import { logger } from './logger'

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message)
  }
}
export const notFound = (what = 'Not found') => new HttpError(404, what)
export const forbidden = (what = 'Forbidden') => new HttpError(403, what)
export const badRequest = (what: string, details?: unknown) => new HttpError(400, what, details)

// Wraps async handlers so thrown errors reach the error middleware.
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next) }

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid input', details: err.flatten() })
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details })
  if (err?.code === '23505') return res.status(409).json({ error: 'Already exists', details: err.detail })
  if (err instanceof AiUnavailableError) return res.status(503).json({ error: 'AI providers are temporarily unavailable. Please try again in a moment.' })
  logger.error({ err, path: req.path }, 'unhandled error')
  res.status(500).json({ error: 'Something went wrong' })
}
