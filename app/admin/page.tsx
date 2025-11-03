import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, isAdmin } from '@/lib/auth/helpers'
import AdminDashboardClient from '@/components/admin/AdminDashboardClient'

export default async function AdminDashboardPage() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }

  // Check if user is admin
  const adminStatus = await isAdmin(user.id)
  
  if (!adminStatus) {
    // Not an admin - redirect to agent dashboard
    redirect('/dashboard')
  }

  const supabase = createClient()

  // Fetch admin stats
  const [agentsResult, buildingsResult, leadsResult] = await Promise.all([
    supabase.from('agents').select('id, full_name, email, created_at').order('created_at', { ascending: false }),
    supabase.from('buildings').select('id, building_name, total_units').order('building_name'),
    supabase.from('leads').select('id, status, quality, created_at, agent_id')
  ])

  const agents = agentsResult.data || []
  const buildings = buildingsResult.data || []
  const leads = leadsResult.data || []

  // Calculate stats
  const stats = {
    totalAgents: agents.length,
    totalBuildings: buildings.length,
    totalLeads: leads.length,
    newLeads: leads.filter(l => l.status === 'new').length,
    contactedLeads: leads.filter(l => l.status === 'contacted').length,
    qualifiedLeads: leads.filter(l => l.status === 'qualified').length,
    closedLeads: leads.filter(l => l.status === 'closed').length,
    hotLeads: leads.filter(l => l.quality === 'hot').length,
    warmLeads: leads.filter(l => l.quality === 'warm').length,
    coldLeads: leads.filter(l => l.quality === 'cold').length,
  }

  return <AdminDashboardClient stats={stats} agents={agents} buildings={buildings} />
}
