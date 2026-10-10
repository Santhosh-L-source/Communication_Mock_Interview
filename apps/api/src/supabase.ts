import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from './config'

let client: SupabaseClient | null = null

// Service-role client: storage and auth admin only. Never send this key to a browser.
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY)
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
    client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }
  return client
}
