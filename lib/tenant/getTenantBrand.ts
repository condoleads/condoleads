// lib/tenant/getTenantBrand.ts
// W-FUNNEL Batch 1: single source of truth for "what brand string to show".
//
// Source of truth = agent's tenant_id (NOT request host), because the dashboard
// is served from the platform host (condoleads.ca) on which middleware does
// not set x-tenant-id -- getTenant() returns null there. The agent row carries
// tenant_id reliably whether they land at condoleads.ca/dashboard or any other
// path that has called requireAgent().
//
// Fallback rule (one place):
//   - tenantId non-null + tenant row found -> tenants.brand_name || tenants.name
//   - tenantId null (System 1 legacy agent: OVAIS, Mary, Syed, Viya) -> 'CondoLeads'
//   - tenantId set but tenant not found / DB error -> 'CondoLeads' (safe default)

import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function getTenantBrand(tenantId: string | null | undefined): Promise<string> {
  if (!tenantId) return 'CondoLeads'

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('tenants')
    .select('brand_name, name')
    .eq('id', tenantId)
    .maybeSingle()

  if (error || !data) return 'CondoLeads'
  return data.brand_name || data.name || 'CondoLeads'
}
