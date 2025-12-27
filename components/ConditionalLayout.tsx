'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import UniversalNav from './UniversalNav'
import Footer from './Footer'

// Derive siteName from hostname immediately (runs on client)
function getSiteNameFromHost(): string | null {
  if (typeof window === 'undefined') return null
  
  const host = window.location.hostname
  
  // Check if custom domain (not condoleads.ca or localhost)
  if (!host.includes('condoleads.ca') && !host.includes('localhost') && !host.includes('vercel.app')) {
    const domainName = host.replace(/^www\./, '').replace(/\.(ca|com|net|org)$/, '')
    return domainName.split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
  }
  
  // Subdomain
  if (host.includes('.condoleads.ca')) {
    const subdomain = host.split('.')[0]
    return subdomain.charAt(0).toUpperCase() + subdomain.slice(1)
  }
  
  return null
}

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [agentData, setAgentData] = useState<any>(null)
  const [initialSiteName] = useState<string | null>(() => getSiteNameFromHost())

  // Don't show public nav/footer on admin, dashboard, or landing pages
  const isAdminPage = pathname.startsWith('/admin')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const isLoginPage = pathname === '/login'
  const isLandingPage = pathname === '/' && !agentData && !initialSiteName
  const showPublicLayout = !isAdminPage && !isDashboardPage && !isLoginPage && !isLandingPage

  useEffect(() => {
    const checkAgentData = () => {
      const data = (window as any).__AGENT_DATA__
      if (data) {
        setAgentData(data)
        return true
      }
      return false
    }

    if (checkAgentData()) return

    // Use MutationObserver to detect when script adds data
    const observer = new MutationObserver(() => {
      if (checkAgentData()) {
        observer.disconnect()
      }
    })

    observer.observe(document, { childList: true, subtree: true })

    const timeout = setTimeout(() => {
      checkAgentData()
      observer.disconnect()
    }, 500)

    return () => {
      observer.disconnect()
      clearTimeout(timeout)
    }
  }, [pathname])

  // Use agentData.siteName if available, otherwise use initialSiteName derived from hostname
  const siteName = agentData?.siteName || initialSiteName

  return (
    <>
      {showPublicLayout && <UniversalNav siteName={siteName} agentData={agentData} />}
      {children}
      {showPublicLayout && <Footer agentData={agentData} />}
    </>
  )
}