import { z } from 'zod'

const bool = z.enum(['true', 'false', '1', '0']).optional().transform((v) => v === 'true' || v === '1')

const Env = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),

  // Supabase
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Supabase > Connect > Session pooler)'),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_JWT_SECRET: z.string().default(''), // legacy HS256 secret; leave empty to use the project's JWKS

  // Storage: 'supabase' in real use; 'local' writes files to ./.local-storage (development / tests only)
  STORAGE_DRIVER: z.enum(['supabase', 'local']).default('supabase'),
  LOCAL_STORAGE_DIR: z.string().default('.local-storage'),
  LOCAL_SIGNING_SECRET: z.string().default('dev-only-change-me'),

  // Free AI providers, tried in this order
  AI_MOCK: bool, // true = no AI calls at all (offline demo / tests)
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.6-flash'),
  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  GROQ_WHISPER_MODEL: z.string().default('whisper-large-v3-turbo'),
  OLLAMA_URL: z.string().default(''), // e.g. http://lab-pc:11434
  OLLAMA_MODEL: z.string().default('llama3.1:8b'),
  OLLAMA_VISION_MODEL: z.string().default('llava:7b'),
  LOCAL_WHISPER_URL: z.string().default(''), // optional faster-whisper server with an OpenAI-compatible API

  // Anti-cheat and retention
  TERMINATE_AFTER_HIGH_EVENTS: z.coerce.number().default(3), // 0 disables early termination
  EVIDENCE_RETENTION_DAYS: z.coerce.number().default(90),
  RECORDING_RETENTION_DAYS: z.coerce.number().default(180),

  RUN_JOBS: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
})

const parsed = Env.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}
export const config = parsed.data
export const aiEnabled = () =>
  !config.AI_MOCK && Boolean(config.GEMINI_API_KEY || config.GROQ_API_KEY || config.OLLAMA_URL)
