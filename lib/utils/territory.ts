// lib/utils/territory.ts
// Returns effective territories for an agent
// If agent has manual assignments → use those
// If agent has no manual assignments → inherit from manager
// If no manager → use full tenant pool

import { createClient } from '@supabase/supabase-js'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export type TerritorySource = 'manual' | 'inherited_manager' | 'inherited_tenant'

export interface EffectiveTerritories {
  assignments: any[]
  source: TerritorySource
  inheritedFrom: string | null // manager name if inherited
}

export async function getEffectiveTerritories(agentId: string): Promise<EffectiveTerritories> {
  const supabase = createServiceClient()

  // 1. Check agent's own manual assignments
  const { data: manual } = await supabase
    .from('agent_property_access')
    .select('*')
    .eq('agent_id', agentId)
    .eq('is_active', true)

  if (manual && manual.length > 0) {
    return { assignments: manual, source: 'manual', inheritedFrom: null }
  }

  // 2. No manual assignments — check if agent has a manager
  const { data: agent } = await supabase
    .from('agents')
    .select('parent_id, tenant_id')
    .eq('id', agentId)
    .single()

  if (agent?.parent_id) {
    // Inherit from manager
    const { data: manager } = await supabase
      .from('agents')
      .select('full_name')
      .eq('id', agent.parent_id)
      .single()

    const { data: managerAssignments } = await supabase
      .from('agent_property_access')
      .select('*')
      .eq('agent_id', agent.parent_id)
      .eq('is_active', true)

    return {
      assignments: managerAssignments || [],
      source: 'inherited_manager',
      inheritedFrom: manager?.full_name || null,
    }
  }

  // 3. No manager — use tenant pool (all active assignments for tenant)
  if (agent?.tenant_id) {
    const { data: tenantAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('tenant_id', agent.tenant_id)
      .eq('can_create_children', true)
      .limit(1)

    // Return empty — tenant has full access by default
    return { assignments: [], source: 'inherited_tenant', inheritedFrom: 'WALLiam' }
  }

  return { assignments: [], source: 'inherited_tenant', inheritedFrom: null }
}
