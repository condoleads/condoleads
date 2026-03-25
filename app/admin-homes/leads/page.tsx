// app/admin-homes/leads/page.tsx
import { createClient } from '@supabase/supabase-js'
function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
}
import AdminHomesLeadsClient from '@/components/admin-homes/AdminHomesLeadsClient'

export const metadata = {
  title: 'WALLiam Leads — Admin',
}

export default async function AdminHomesLeadsPage() {
  const supabase = createServiceClient()

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