// Creates an API key for another project. Usage: npm run create-api-key -- "Placement portal"
import { one, pool } from '../db'
import { hashKey, newApiKey } from '../modules/admin'

const name = process.argv[2] ?? 'External project'
const key = newApiKey()
await one(`insert into api_clients (name, key_hash) values ($1,$2) returning id`, [name, hashKey(key)])
console.log(`API key for "${name}" (shown once, store it in the other project's .env as SPEAKREADY_KEY):\n${key}`)
await pool.end()
