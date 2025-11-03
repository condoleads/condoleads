import { redirect } from 'next/navigation'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import AgentsManagementClient from '@/components/admin/AgentsManagementClient'

export default async function AdminAgentsPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  const adminStatus = await isAdmin(user.id)
  
  if (!adminStatus) {
    redirect('/dashboard')
  }

  const supabase = createClient()

  // Fetch all agents with their lead counts
  const { data: agents, error } = await supabase
    .from('agents')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching agents:', error)
  }

  // Get lead counts for each agent
  const agentsWithStats = await Promise.all(
    (agents || []).map(async (agent) => {
      const { data: leads } = await supabase
        .from('leads')
        .select('id, status, quality')
        .eq('agent_id', agent.id)
      
      return {
        ...agent,
        total_leads: leads?.length || 0,
        new_leads: leads?.filter(l => l.status === 'new').length || 0,
        hot_leads: leads?.filter(l => l.quality === 'hot').length || 0,
      }
    })
  )

  return <AgentsManagementClient agents={agentsWithStats} />
}
