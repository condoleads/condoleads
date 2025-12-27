'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import UniversalNav from './UniversalNav'
import Footer from './Footer'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [agentData, setAgentData] = useState<any>(null)
  const [siteName, setSiteName] = useState<string>('CondoLeads')
  const [isAgentSite, setIsAgentSite] = useState<boolean>(false)

  // Don't show public nav/footer on admin, dashboard, or landing pages
  const isAdminPage = pathname.startsWith('/admin')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const isLoginPage = pathname === '/login'

  // Derive siteName from hostname on mount
  useEffect(() => {
    const host = window.location.hostname
    
    // Check if custom domain (not condoleads.ca or localhost)
    if (!host.includes('condoleads.ca') && !host.includes('localhost') && !host.includes('vercel.app')) {
      const domainName = host.replace(/^www\./, '').replace(/\.(ca|com|net|org)$/, '')
      const formatted = domainName.split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
      setSiteName(formatted)
      setIsAgentSite(true)
    } else if (host.includes('.condoleads.ca')) {
      // Subdomain
      const subdomain = host.split('.')[0]
      setSiteName(subdomain.charAt(0).toUpperCase() + subdomain.slice(1))
      setIsAgentSite(true)
    }
  }, [])

  // Listen for __AGENT_DATA__
  useEffect(() => {
    const checkAgentData = () => {
      const data = (window as any).__AGENT_DATA__
      if (data) {
        setAgentData(data)
        if (data.siteName) {
          setSiteName(data.siteName)
        }
        setIsAgentSite(true)
        return true
      }
      return false
    }

    if (checkAgentData()) return

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

  const isLandingPage = pathname === '/' && !isAgentSite
  const showPublicLayout = !isAdminPage && !isDashboardPage && !isLoginPage && !isLandingPage

  return (
    <>
      {showPublicLayout && <UniversalNav siteName={siteName} agentData={agentData} />}
      {children}
      {showPublicLayout && <Footer agentData={agentData} />}
    </>
  )
}