export type AgentTier = 'admin' | 'manager' | 'managed' | 'solo'

export interface AgentTierInput {
  is_admin: boolean
  can_create_children: boolean
  parent_id: string | null
}

/**
 * Derives the effective tier of an agent from their DB fields.
 * All agents have role = 'agent' in the DB — tier is computed.
 *
 * admin   — is_admin = true
 * manager — can_create_children = true, no parent
 * managed — has a parent_id (reports to a manager)
 * solo    — default agent, no children, no parent (e.g. WALLiam default agent)
 *           solo agents cannot set credit overrides
 */
export function getAgentTier(agent: AgentTierInput): AgentTier {
  if (agent.is_admin) return 'admin'
  if (agent.can_create_children && !agent.parent_id) return 'manager'
  if (agent.parent_id) return 'managed'
  return 'solo'
}

/**
 * Only admin, manager, and managed agents can set user credit overrides.
 * Solo agents (system defaults) cannot.
 */
export function canSetCreditOverride(tier: AgentTier): boolean {
  return tier === 'admin' || tier === 'manager' || tier === 'managed'
}