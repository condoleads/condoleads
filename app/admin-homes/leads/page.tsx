// app/admin-homes/leads/page.tsx
import { createClient } from '@/lib/supabase/server'
import AdminHomesLeadsClient from '@/components/admin-homes/AdminHomesLeadsClient'

export const metadata = {
  title: 'WALLiam Leads — Admin',
}

export default async function AdminHomesLeadsPage() {
  const supabase = createClient()

  // WALLiam leads only — source starts with 'walliam_'
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      *,
      agents (
        id,
        full_name,
        email
      )
    `)
    .like('source', 'walliam_%')
    .order('created_at', { ascending: false })
    .limit(10000)

  // Agents with site_type = 'comprehensive' for filter dropdown
  const { data: agents } = await supabase
    .from('agents')
    .select('id, full_name, email')
    .eq('site_type', 'comprehensive')
    .eq('is_active', true)
    .order('full_name')

  return (
    <AdminHomesLeadsClient
      initialLeads={leads || []}
      agents={agents || []}
    />
  )
}