// Background jobs in Postgres with pg-boss (no Redis). Runs inside the API process by default.
import PgBoss from 'pg-boss'
import { config } from '../config'
import { logger } from '../lib/logger'

export const QUEUES = ['evaluate_response', 'score_interview', 'verify_evidence', 'coach_run', 'weekly_plans',
  'evidence_cleanup', 'webhook_deliver'] as const
export type QueueName = typeof QUEUES[number]

let boss: PgBoss | null = null

export async function startBoss() {
  if (boss) return boss
  boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    ssl: /supabase\.(co|com)/.test(config.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
    max: 4,
  })
  boss.on('error', (e) => logger.error({ e }, 'pg-boss error'))
  await boss.start()
  for (const name of QUEUES)
    await boss.createQueue(name, { name, retryLimit: 3, retryDelay: 20, retryBackoff: true, expireInSeconds: 600 } as any)
  return boss
}

export async function enqueue(name: QueueName, data: object, options: PgBoss.SendOptions = {}) {
  const b = await startBoss()
  return b.send(name, data, options)
}

export async function stopBoss() {
  if (boss) await boss.stop({ graceful: true, wait: true })
  boss = null
}
