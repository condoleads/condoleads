// app/admin-homes/leads/page.tsx
import { createClient } from '@supabase/supabase-js'
import { resolveAdminHomesUser } from '@/lib/admin-homes/auth'
import AdminHomesLeadsClient from '@/components/admin-homes/AdminHomesLeadsClient'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export const metadata = { title: 'WALLiam Leads — Admin' }

export default async function AdminHomesLeadsPage() {
  const supabase = createServiceClient()
  const adminUser = await resolveAdminHomesUser()

  // Build query based on role
  let query = supabase
    .from('leads')
    .select(`
      *,
      agents!leads_agent_id_fkey ( id, full_name, email ),
      manager:agents!leads_manager_id_fkey ( id, full_name, email )
    `)
    .like('source', 'walliam_%')
    .order('created_at', { ascending: false })
    .limit(10000)

  if (adminUser?.role === 'manager' && adminUser.agentId) {
    // Manager sees own leads + all managed agents' leads
    const agentIds = [adminUser.agentId, ...adminUser.managedAgentIds]
    query = query.in('agent_id', agentIds)
  } else if (adminUser?.role === 'agent' && adminUser.agentId) {
    // Agent sees only their own leads
    query = query.eq('agent_id', adminUser.agentId)
  }
  // Admin sees all — no filter

  const { data: leads } = await query

  // Agents for filter dropdown — scoped by role
  let agentsQuery = supabase
    .from('agents')
    .select('id, full_name, email')
    .eq('site_type', 'comprehensive')
    .eq('tenant_id', 'b16e1039-38ed-43d7-bbc5-dd02bb651bc9')
    .order('full_name')

  if (adminUser?.role === 'manager' && adminUser.agentId) {
    // Manager only sees themselves + their managed agents in filter
    agentsQuery = agentsQuery.in('id', [adminUser.agentId, ...adminUser.managedAgentIds])
  } else if (adminUser?.role === 'agent' && adminUser.agentId) {
    agentsQuery = agentsQuery.eq('id', adminUser.agentId)
  }

  const { data: agents } = await agentsQuery

  return (
    <AdminHomesLeadsClient
      initialLeads={leads || []}
      agents={agents || []}
      currentRole={adminUser?.role || 'admin'}
      currentAgentId={adminUser?.agentId || null}
    />
  )
}