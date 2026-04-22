import { headers } from 'next/headers'
import { getAgentFromHost, getAgentBranding } from '@/lib/utils/agent-detection'
import SiteHeader from '@/components/navigation/SiteHeader'
import TenantFooter from '@/components/TenantFooter'

export default async function ComprehensiveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const host = headersList.get('host') || ''
  const agent = await getAgentFromHost(host)
  const branding = agent ? getAgentBranding(agent) : null

  return (
    <>
      <style>{`#universal-nav { display: none !important; }`}</style>
      <SiteHeader
        agentName={branding?.siteName ?? 'CondoLeads'}
        agentLogo={branding?.logoUrl ?? null}
        primaryColor={branding?.primaryColor ?? '#0A2540'}
      />
      <main>{children}</main>
      <TenantFooter />
    </>
  )
}