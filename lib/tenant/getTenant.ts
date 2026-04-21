// lib/tenant/getTenant.ts
// Server-side helper to fetch the current tenant's full record.
// Reads x-tenant-id from request headers (set by middleware).
// Returns null if no tenant can be resolved (caller must handle gracefully).

import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export interface Tenant {
  id: string
  name: string
  domain: string
  brand_name: string | null
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
  admin_email: string
  assistant_name: string | null
  brokerage_name: string | null
  brokerage_address: string | null
  brokerage_phone: string | null
  broker_of_record: string | null
  license_number: string | null
  footer_tagline: string | null
  google_analytics_id: string | null
  is_active: boolean | null
}

/**
 * Fetch the current tenant based on the x-tenant-id header.
 * Returns null if header missing or tenant not found (caller handles).
 */
export async function getTenant(): Promise<Tenant | null> {
  const headerList = await headers()
  const tenantId = headerList.get('x-tenant-id')
  if (!tenantId) return null

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select(`
      id, name, domain, brand_name, logo_url,
      primary_color, secondary_color, admin_email,
      assistant_name, brokerage_name, brokerage_address,
      brokerage_phone, broker_of_record, license_number,
      footer_tagline, google_analytics_id, is_active
    `)
    .eq('id', tenantId)
    .single()

  if (error || !data) return null
  return data as Tenant
}