import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  
  console.log(' Creating Supabase client:', {
    url: url?.substring(0, 30) + '...',
    keyLength: key?.length,
    keyPrefix: key?.substring(0, 20) + '...'
  })
  
  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}
