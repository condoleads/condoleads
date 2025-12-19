// lib/hierarchy/agent-tree.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type AgentRole = 'solo' | 'agent' | 'manager' | 'sub-manager' | 'brokerage'

export interface Agent {
  id: string
  full_name: string
  email: string
  cell_phone?: string
  office_phone?: string
  whatsapp_number?: string
  subdomain?: string
  custom_domain?: string
  parent_id?: string
  can_create_children: boolean
  branding?: {
    logo_url?: string
    primary_color?: string
    secondary_color?: string
  }
  brokerage_name?: string
  profile_photo_url?: string
}

export interface AgentWithRole extends Agent {
  role: AgentRole
}

/**
 * Get agent's computed role based on tree structure
 * Uses database function for accuracy
 */
export async function getAgentRole(agentId: string): Promise<AgentRole> {
  const { data, error } = await supabase
    .rpc('get_agent_role', { agent_uuid: agentId })

  if (error) {
    console.error('Error getting agent role:', error)
    return 'solo' // Default fallback
  }

  return data as AgentRole
}

/**
 * Get all ancestors of an agent (for lead visibility)
 * Returns array from immediate parent to root
 */
export async function getAgentAncestors(agentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .rpc('get_agent_ancestors', { agent_uuid: agentId })

  if (error) {
    console.error('Error getting ancestors:', error)
    return []
  }

  return (data || []).map((row: { ancestor_id: string }) => row.ancestor_id)
}

/**
 * Get all descendants of an agent (for manager dashboard)
 * Returns array of all agents under this one
 */
export async function getAgentDescendants(agentId: string): Promise<string[]> {
  const { data, error } = await supabase
    .rpc('get_agent_descendants', { agent_uuid: agentId })

  if (error) {
    console.error('Error getting descendants:', error)
    return []
  }

  return (data || []).map((row: { descendant_id: string }) => row.descendant_id)
}

/**
 * Get agent by ID with role
 */
export async function getAgentById(agentId: string): Promise<AgentWithRole | null> {
  const { data: agent, error } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agentId)
    .single()

  if (error || !agent) {
    return null
  }

  const role = await getAgentRole(agentId)
  return { ...agent, role }
}

/**
 * Get all agents that this agent can see (self + descendants)
 */
export async function getVisibleAgents(agentId: string): Promise<Agent[]> {
  const descendantIds = await getAgentDescendants(agentId)
  const allIds = [agentId, ...descendantIds]

  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .in('id', allIds)

  if (error) {
    console.error('Error getting visible agents:', error)
    return []
  }

  return data || []
}

/**
 * Get all leads visible to an agent (their own + descendants')
 */
export async function getVisibleLeads(agentId: string) {
  const descendantIds = await getAgentDescendants(agentId)
  const allIds = [agentId, ...descendantIds]

  const { data, error } = await supabase
    .from('leads')
    .select(`
      *,
      agents!leads_agent_id_fkey (id, full_name, email, parent_id, parent:agents!parent_id(id, full_name)),
      buildings (id, building_name, slug)
    `)
    .in('agent_id', allIds)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error getting visible leads:', error)
    return []
  }

  return data || []
}

/**
 * Check if an agent can see a specific lead
 */
export async function canAgentSeeLead(agentId: string, leadAgentId: string): Promise<boolean> {
  if (agentId === leadAgentId) return true

  const descendants = await getAgentDescendants(agentId)
  return descendants.includes(leadAgentId)
}

/**
 * Get children of an agent (direct reports only)
 */
export async function getAgentChildren(agentId: string): Promise<Agent[]> {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('parent_id', agentId)
    .order('full_name')

  if (error) {
    console.error('Error getting children:', error)
    return []
  }

  return data || []
}

/**
 * Get parent agent
 */
export async function getAgentParent(agentId: string): Promise<Agent | null> {
  const { data: agent } = await supabase
    .from('agents')
    .select('parent_id')
    .eq('id', agentId)
    .single()

  if (!agent?.parent_id) return null

  const { data: parent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', agent.parent_id)
    .single()

  return parent || null
}

/**
 * Set parent for an agent (assign to manager/brokerage)
 */
export async function setAgentParent(agentId: string, parentId: string | null): Promise<boolean> {
  const { error } = await supabase
    .from('agents')
    .update({ parent_id: parentId })
    .eq('id', agentId)

  if (error) {
    console.error('Error setting parent:', error)
    return false
  }

  return true
}