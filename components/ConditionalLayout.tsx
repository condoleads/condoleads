'use client'
import { usePathname } from 'next/navigation'
import { useLayoutEffect, useState } from 'react'
import UniversalNav from './UniversalNav'
import Footer from './Footer'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [agentData, setAgentData] = useState<any>(null)
  const [siteName, setSiteName] = useState<string>('')
  const [mounted, setMounted] = useState(false)

  const isAdminPage = pathname.startsWith('/admin')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const isLoginPage = pathname === '/login'

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

  const isAgentSite = siteName && siteName !== 'CondoLeads'
  const isLandingPage = pathname === '/' && !isAgentSite
  const showPublicLayout = mounted && !isAdminPage && !isDashboardPage && !isLoginPage && !isLandingPage

  return (
    <>
      {showPublicLayout && <UniversalNav siteName={siteName} agentData={agentData} />}
      {children}
      {showPublicLayout && <Footer agentData={agentData} />}
    </>
  )
}