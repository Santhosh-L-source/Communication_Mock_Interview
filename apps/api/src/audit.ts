import { q } from './db'

export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null,
  before: unknown = null, after: unknown = null, client?: { query: (t: string, p: unknown[]) => Promise<unknown> }) {
  const sql = `insert into audit_log (actor_id, action, entity, entity_id, before, after) values ($1,$2,$3,$4,$5,$6)`
  const params = [actorId, action, entity, entityId, before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after)]
  if (client) await client.query(sql, params)
  else await q(sql, params)
}
