'use client'

import { usePathname } from 'next/navigation'
import UniversalNav from './UniversalNav'
import Footer from './Footer'

export default function ConditionalLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  
  // Don't show public nav/footer on admin or dashboard pages
  const isAdminPage = pathname.startsWith('/admin')
  const isDashboardPage = pathname.startsWith('/dashboard')
  const showPublicLayout = !isAdminPage && !isDashboardPage

  return (
    <>
      {showPublicLayout && <UniversalNav />}
      {children}
      {showPublicLayout && <Footer />}
    </>
  )
}