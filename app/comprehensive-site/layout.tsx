import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getAgentFromHost, getAgentBranding } from '@/lib/utils/agent-detection'
import SiteHeader from '@/components/navigation/SiteHeader'
import TenantFooter from '@/components/TenantFooter'

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export default async function ComprehensiveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const cleanHost = host.replace(/^www\./, '')

  // Resolve tenant directly from host — same pattern TenantHeader uses, no header dependency
  let tenant: { id: string; brand_name: string | null; logo_url: string | null; primary_color: string | null } | null = null

  if (host.includes('localhost') || host.includes('vercel.app')) {
    const tenantDomain = process.env.DEV_TENANT_DOMAIN || null
    if (tenantDomain) {
      const db = createServiceClient()
      const { data } = await db
        .from('tenants')
        .select('id, brand_name, logo_url, primary_color')
        .eq('domain', tenantDomain)
        .eq('is_active', true)
        .single()
      tenant = data || null
    }
  } else {
    const db = createServiceClient()
    const { data } = await db
      .from('tenants')
      .select('id, brand_name, logo_url, primary_color')
      .eq('domain', cleanHost)
      .eq('is_active', true)
      .single()
    tenant = data || null
  }

  // Agent fallback only used when tenant resolution fails (legacy custom-domain agent sites)
  const agent = tenant ? null : await getAgentFromHost(host)
  const agentBranding = agent ? getAgentBranding(agent) : null

  // Brand resolution priority:
  //   1. tenant.brand_name (multi-tenant correct)
  //   2. agent-derived siteName (legacy fallback)
  //   3. 'CondoLeads' (last-resort default)
  const brandName = tenant?.brand_name ?? agentBranding?.siteName ?? 'CondoLeads'
  const logoUrl = tenant?.logo_url ?? agentBranding?.logoUrl ?? null
  const primaryColor = tenant?.primary_color ?? agentBranding?.primaryColor ?? '#0A2540'

  return (
    <>
      <style>{`#universal-nav { display: none !important; }`}</style>
      <SiteHeader
        agentName={brandName}
        agentLogo={logoUrl}
        primaryColor={primaryColor}
      />
      <main>{children}</main>
      <TenantFooter />
    </>
  )
}