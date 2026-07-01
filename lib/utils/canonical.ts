// W-MARKETING A-UNIT-1b (2026-07-01): shared canonical-host resolver for
// every page-type generateMetadata. Prefers tenants.domain (normalized www
// vs apex per the tenants table); fall-back is the RAW request host —
// self-canonical, never a different tenant's domain. Never a hardcoded
// legacy domain (fixes the AreaPage www.condoleads.ca fallback bug flagged
// in UNIT 61 recon).
//
// Multi-tenant safe by construction: tenant #3 onboarding auto-inherits
// (tenant.domain matches -> tenant.domain is the canonical). No per-tenant
// code branch.

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getTenantByHost } from './tenant-brand'

/**
 * Return the canonical host for the current request:
 *   - Prefer tenants.domain if the resolver finds a match (canonical form
 *     — normalizes www/apex per what the operator stored in the row).
 *   - Fall back to the raw request host (self-canonical; never leaks to
 *     another tenant's domain, never a hardcoded legacy domain).
 *
 * All page-type canonicals should call this and emit
 *   alternates: { canonical: `https://${host}/${slug}` }
 */
export async function resolveCanonicalHost(): Promise<string> {
  const rawHost = headers().get('host') || ''
  try {
    const supabase = createClient()
    const tenant = await getTenantByHost(supabase, rawHost)
    return tenant?.domain || rawHost
  } catch {
    return rawHost
  }
}
