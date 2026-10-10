import pg from 'pg'
import { config } from './config'

// Numeric columns come back as numbers instead of strings.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)))
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)))

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  ssl: /supabase\.(co|com)/.test(config.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
})

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(text, params as any[])
  return res.rows as T[]
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params)
  return rows[0] ?? null
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const out = await fn(client)
    await client.query('commit')
    return out
  } catch (e) {
    await client.query('rollback')
    throw e
  } finally {
    client.release()
  }
}
