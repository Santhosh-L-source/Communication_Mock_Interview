import fs from 'node:fs'
// Unit tests need no database; the end-to-end test needs .env.test (see README "Running the tests").
if (fs.existsSync('.env.test')) process.loadEnvFile('.env.test')
process.env.DATABASE_URL ??= 'postgres://localhost/unused'
process.env.NODE_ENV = 'test'
