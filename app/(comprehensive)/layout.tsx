import type { Metadata } from 'next'
import CharlieWidget from '@/app/charlie/components/CharlieWidget'
import SiteHeader from '@/components/navigation/SiteHeader'
import WalliamOnboardingBanner from '@/components/WalliamOnboardingBanner'
import TenantFooter from '@/components/TenantFooter'

export const metadata: Metadata = {
  title: 'CondoLeads',
  description: 'Toronto Real Estate - Condos & Homes',
}

export default function ComprehensiveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SiteHeader />
      <WalliamOnboardingBanner />
      <main>{children}</main>
      <TenantFooter />
      <CharlieWidget />
    </>
  )
}