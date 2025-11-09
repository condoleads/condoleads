'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import UniversalNav from './UniversalNav'
import Footer from './Footer'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [agentData, setAgentData] = useState<any>(null)
  
  // Don't show public nav/footer on admin or dashboard pages
  const isAdminPage = pathname.startsWith('/admin')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const showPublicLayout = !isAdminPage && !isDashboardPage

  useEffect(() => {
    // Get agent data from page metadata if available
    const checkAgentData = () => {
      const data = (window as any).__AGENT_DATA__
      if (data) {
        setAgentData(data)
      }
    }
    
    checkAgentData()
    
    // Listen for route changes
    const interval = setInterval(checkAgentData, 100)
    return () => clearInterval(interval)
  }, [pathname])

  return (
    <>
      {showPublicLayout && <UniversalNav />}
      {children}
      {showPublicLayout && <Footer agentData={agentData} />}
    </>
  )
}