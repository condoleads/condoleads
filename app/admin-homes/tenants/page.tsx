// app/admin-homes/tenants/page.tsx
import { createClient as createServiceClient } from '@supabase/supabase-js'
import TenantsClient from '@/components/admin-homes/TenantsClient'

export const metadata = { title: 'Tenants — Admin' }

export default async function TenantsPage() {
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: tenants } = await supabase
    .from('tenants')
    .select('*')
    .order('created_at', { ascending: false })

  // Enrich with stats
  const tenantsWithStats = await Promise.all(
    (tenants || []).map(async (tenant) => {
      const { count: agentCount } = await supabase
        .from('agents')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)

      const { count: leadCount } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)

      const { count: restrictionCount } = await supabase
        .from('tenant_property_access')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_active', true)

      return {
        ...tenant,
        agent_count: agentCount || 0,
        lead_count: leadCount || 0,
        restriction_count: restrictionCount || 0,
      }
    })
  )

  return <TenantsClient tenants={tenantsWithStats} />
}