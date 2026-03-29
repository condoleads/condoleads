// lib/admin-homes/auth.ts
import { createServerClient } from '@/lib/supabase/server'

export type AdminHomesRole = 'admin' | 'manager' | 'agent'

export interface AdminHomesUser {
  role: AdminHomesRole
  name: string
  email: string
  agentId: string | null
  managedAgentIds: string[]
}

export async function resolveAdminHomesUser(): Promise<AdminHomesUser | null> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: agent } = await supabase
    .from('agents')
    .select('id, full_name, parent_id, tenant_id')
    .eq('user_id', user.id)
    .eq('tenant_id', 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9')
    .single()

  if (!agent) {
    return {
      role: 'admin',
      name: user.email?.split('@')[0] || 'Admin',
      email: user.email || '',
      agentId: null,
      managedAgentIds: [],
    }
  }

  const { data: managedAgents } = await supabase
    .from('agents')
    .select('id')
    .eq('parent_id', agent.id)
    .eq('tenant_id', 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9')

  const managedIds = (managedAgents || []).map((a: any) => a.id)

  if (managedIds.length > 0) {
    return {
      role: 'manager',
      name: agent.full_name || user.email || '',
      email: user.email || '',
      agentId: agent.id,
      managedAgentIds: managedIds,
    }
  }

  return {
    role: 'agent',
    name: agent.full_name || user.email || '',
    email: user.email || '',
    agentId: agent.id,
    managedAgentIds: [],
  }
}