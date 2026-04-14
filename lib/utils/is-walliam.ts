// lib/utils/is-walliam.ts
// Detects if the current request is on the WALLiam tenant (walliam.ca)
// Used in server components to conditionally render WALLiam UI vs System 1 UI
// Detection: host header → tenants table lookup
// Dev: uses DEV_TENANT_DOMAIN env var (set to 'walliam.ca' in .env.local)

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

const WALLIAM_TENANT_ID = 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9'

export async function getWalliamTenantId(): Promise<string | null> {
  try {
    const headersList = headers()
    const host = headersList.get('host') || ''

    // Dev environment — use DEV_TENANT_DOMAIN
    if (host.includes('localhost') || host.includes('vercel.app')) {
      const devTenantDomain = process.env.DEV_TENANT_DOMAIN || null
      if (!devTenantDomain) return null

      const supabase = createClient()
      const { data } = await supabase
        .from('tenants')
        .select('id')
        .eq('domain', devTenantDomain)
        .eq('is_active', true)
        .single()

      return data?.id || null
    }

    // Production — check host against tenants table
    const cleanHost = host.replace(/^www\./, '')
    const supabase = createClient()
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('domain', cleanHost)
      .eq('is_active', true)
      .single()

    return data?.id || null
  } catch {
    return null
  }
}

// Convenience boolean check
export async function isWalliamTenant(): Promise<boolean> {
  const id = await getWalliamTenantId()
  return !!id
}

// Get WALLiam-resolved agent for a given context
// Returns agentId string or null
export async function resolveWalliamAgent(params: {
  listing_id?: string | null
  building_id?: string | null
  community_id?: string | null
  municipality_id?: string | null
  area_id?: string | null
  user_id?: string | null
  tenant_id: string
}): Promise<string | null> {
  try {
    const supabase = createClient()
    const { data } = await supabase.rpc('resolve_agent_for_context', {
      p_listing_id: params.listing_id || null,
      p_building_id: params.building_id || null,
      p_community_id: params.community_id || null,
      p_municipality_id: params.municipality_id || null,
      p_area_id: params.area_id || null,
      p_user_id: params.user_id || null,
      p_tenant_id: params.tenant_id,
    })
    if (data) return data
    // Fall back to tenant default_agent_id
    const { data: tenant } = await supabase.from('tenants').select('default_agent_id').eq('id', params.tenant_id).single()
    return tenant?.default_agent_id || null
  } catch {
    return null
  }
}