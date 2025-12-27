'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import UniversalNav from './UniversalNav'
import Footer from './Footer'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [agentData, setAgentData] = useState<any>(null)
  const [siteName, setSiteName] = useState<string | null>(null)

  // Don't show public nav/footer on admin, dashboard, or landing pages
  const isAdminPage = pathname.startsWith('/admin')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const isLandingPage = pathname === '/' && !agentData // Root without agent data = landing page
  const showPublicLayout = !isAdminPage && !isDashboardPage && !isLandingPage

  useEffect(() => {
    // Immediately check for __AGENT_DATA__
    const checkAgentData = () => {
      const data = (window as any).__AGENT_DATA__
      if (data) {
        setAgentData(data)
        if (data.siteName) {
          setSiteName(data.siteName)
        }
        return true
      }
      return false
    }

    // Check immediately
    if (checkAgentData()) return

    // If not found, use MutationObserver to detect when script adds it
    const observer = new MutationObserver(() => {
      if (checkAgentData()) {
        observer.disconnect()
      }
    })

    observer.observe(document, { childList: true, subtree: true })

    // Fallback timeout
    const timeout = setTimeout(() => {
      checkAgentData()
      observer.disconnect()
    }, 500)

    return () => {
      observer.disconnect()
      clearTimeout(timeout)
    }
  }, [pathname])

  // Derive siteName from hostname as fallback for instant display
  useEffect(() => {
    if (!siteName && typeof window !== 'undefined') {
      const host = window.location.hostname
      // Check if custom domain (not condoleads.ca or localhost)
      if (!host.includes('condoleads.ca') && !host.includes('localhost') && !host.includes('vercel.app')) {
        // Custom domain - derive name from domain
        const domainName = host.replace(/^www\./, '').replace(/\.(ca|com|net|org)$/, '')
        const formatted = domainName.split('.').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
        setSiteName(formatted)
      } else if (host.includes('.condoleads.ca')) {
        // Subdomain
        const subdomain = host.split('.')[0]
        setSiteName(subdomain.charAt(0).toUpperCase() + subdomain.slice(1))
      }
    }
  }, [siteName])

  return (
    <>
      {showPublicLayout && <UniversalNav siteName={agentData?.siteName || siteName} agentData={agentData} />}
      {children}
      {showPublicLayout && <Footer agentData={agentData} />}
    </>
  )
}