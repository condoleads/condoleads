// lib/admin-homes/service-client.ts
// Service-role Supabase client factory.
// Bypasses RLS. Use only after auth checks pass.
// Extracted from lib/admin-homes/api-auth.ts during P0-5 (W-ADMIN-AUTH-LOCKDOWN).

import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}