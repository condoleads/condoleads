import type { Metadata } from 'next'
import SiteHeader from '@/components/navigation/SiteHeader'

export const metadata: Metadata = {
  title: 'CondoLeads',
  description: 'Toronto Real Estate — Condos & Homes',
}

export default function ComprehensiveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
    </>
  )
}