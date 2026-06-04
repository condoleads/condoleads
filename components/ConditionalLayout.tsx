'use client'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useEffect, useState } from 'react'
import UniversalNav from './UniversalNav'
import CharlieWidget from '@/app/charlie/components/CharlieWidget'
import Footer from './Footer'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [agentData, setAgentData] = useState<any>(null)
  const [siteName, setSiteName] = useState<string>('')
  const [mounted, setMounted] = useState(false)

  const isAdminPage = pathname.startsWith('/admin')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const isLoginPage = pathname === '/login'
  const is01Leads = mounted && window.location.hostname.replace(/^www\./, '') === '01leads.com'
  // W-FUNNEL: do not render Charlie on System 1 hosts (condoleads.ca + subdomains).
  // Charlie is a System 2 surface; on System 1 the API returns 401 anyway (middleware
  // doesn't set x-tenant-id for condoleads.ca subdomains), so showing the widget chrome
  // is cosmetic stray UI -- hide it. Same client-side host-gate pattern as is01Leads.
  const isSystem1 = mounted && window.location.hostname.replace(/^www\./, '').endsWith('condoleads.ca')
  const isCharlieVisible = !isAdminPage && !isDashboardPage && !isLoginPage && !is01Leads && !isSystem1
  const [isComprehensiveSite, setIsComprehensiveSite] = useState(false)
  

  // Use useLayoutEffect to set siteName BEFORE paint
  useLayoutEffect(() => {
    const host = window.location.hostname
    
    if (!host.includes('condoleads.ca') && !host.includes('localhost') && !host.includes('vercel.app')) {
      const domainName = host.replace(/^www\./, '').replace(/\.(ca|com|net|org)$/, '')
      setSiteName(domainName.split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(''))
    } else if (host.includes('.condoleads.ca')) {
      const subdomain = host.split('.')[0]
      setSiteName(subdomain.charAt(0).toUpperCase() + subdomain.slice(1))
    } else {
      setSiteName('CondoLeads')
    }
    setMounted(true)
  }, [])

  // Listen for __AGENT_DATA__ to get database siteName
  useLayoutEffect(() => {
    const data = (window as any).__AGENT_DATA__
    if (data) {
      setAgentData(data)
      if (data.siteName) setSiteName(data.siteName)
    }
  }, [pathname])

  useEffect(() => {
    setIsComprehensiveSite(!!document.querySelector('[data-layout="comprehensive"]'))
  }, [pathname])

  const isTenantDomain = typeof window !== 'undefined' && !window.location.hostname.includes('condoleads.ca') && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('vercel.app')
  const isAgentSite = siteName && siteName !== 'CondoLeads'
  const isLandingPage = pathname === '/' && !isAgentSite
  const showPublicLayout = mounted && !isAdminPage && !isDashboardPage && !isLoginPage && !isLandingPage && !isComprehensiveSite && !isTenantDomain

  return (
    <>
      {showPublicLayout && <UniversalNav siteName={siteName} agentData={agentData} />}
      {/* W-MOBILE-RESPONSIVE Fix A (2026-06-02): reserve bottom space for the
          global Charlie bar so content never renders under it. Gated to the
          exact scope where the bar appears: Charlie visible (not admin/dashboard
          /login/01leads) AND not on the homepage (the bar self-hides on '/' per
          CharlieWidget.tsx:60-62 + 102). */}
      <div style={isCharlieVisible && pathname !== '/' ? { paddingBottom: 'var(--charlie-bar-clearance)' } : undefined}>
        {children}
      </div>
      {showPublicLayout && <Footer agentData={agentData} />}
      {isCharlieVisible && <CharlieWidget />}
    </>
  )
}