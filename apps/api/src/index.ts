import http from 'node:http'
import { buildApp, corsOrigins } from './app'
import { warmConnections } from './ai/llm'
import { config } from './config'
import { pool } from './db'
import { attachInterviewGateway } from './interview/gateway'
import { startBoss, stopBoss } from './jobs/boss'
import { startWorkers } from './jobs/workers'
import { logger } from './lib/logger'

const app = buildApp()
const server = http.createServer(app)
attachInterviewGateway(server, corsOrigins)

warmConnections()
await startBoss()
if (config.RUN_JOBS) await startWorkers()

server.listen(config.PORT, () => {
  logger.info(`SpeakReady API on :${config.PORT} (AI ${config.AI_MOCK ? 'mock' : 'live'}, storage ${config.STORAGE_DRIVER})`)
})

async function shutdown() {
  logger.info('shutting down')
  server.close()
  await stopBoss()
  await pool.end()
  process.exit(0)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
