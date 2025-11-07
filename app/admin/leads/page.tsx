import { createClient } from '@/lib/supabase/server'
import AdminLeadsClient from '@/components/admin/AdminLeadsClient'

export const metadata = {
  title: 'All Leads - Admin Dashboard',
  description: 'View and manage all leads from all agents'
}

export default async function AdminLeadsPage() {
  const supabase = createClient()

  // Fetch ALL leads with agent and building info
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      *,
      agents (
        id,
        full_name,
        email
      ),
      buildings (
        id,
        building_name
      )
    `)
    .order('created_at', { ascending: false })

  // Fetch all agents for filter dropdown
  const { data: agents } = await supabase
    .from('agents')
    .select('id, full_name, email')
    .eq('is_active', true)
    .order('full_name')

  // Fetch all buildings for filter dropdown
  const { data: buildings } = await supabase
    .from('buildings')
    .select('id, building_name')
    .order('building_name')

  return (
    <AdminLeadsClient 
      initialLeads={leads || []}
      agents={agents || []}
      buildings={buildings || []}
    />
  )
}