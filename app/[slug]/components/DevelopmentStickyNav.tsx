'use client'
import { useState, useEffect } from 'react'
import AuthStatus from '@/components/auth/AuthStatus'

interface DevelopmentStickyNavProps {
  forSaleCount: number
  forLeaseCount: number
  soldCount: number
  leasedCount: number
  agentId?: string
}

export default function DevelopmentStickyNav({ 
  forSaleCount, 
  forLeaseCount, 
  soldCount, 
  leasedCount,
  agentId 
}: DevelopmentStickyNavProps) {
  const [activeTab, setActiveTab] = useState('for-sale')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 400)
    }

    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      if (['for-sale', 'for-lease', 'sold', 'leased'].includes(hash)) {
        setActiveTab(hash)
      }
    }

    handleHashChange()

    window.addEventListener('scroll', handleScroll)
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  const scrollToSection = (tabId: string) => {
    window.location.hash = tabId
    setActiveTab(tabId)
    
    const element = document.getElementById('listings')
    if (element) {
      const offset = 80
      const elementPosition = element.offsetTop - offset
      window.scrollTo({ top: elementPosition, behavior: 'smooth' })
    }
  }

  const scrollToBuildings = () => {
    const element = document.getElementById('buildings')
    if (element) {
      const offset = 80
      const elementPosition = element.offsetTop - offset
      window.scrollTo({ top: elementPosition, behavior: 'smooth' })
    }
  }

  if (!isVisible) return null

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-900 to-blue-700 shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between gap-2 py-2">
          <div className="flex items-center gap-1 md:gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => scrollToSection('for-sale')}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'for-sale'
                  ? 'bg-white text-blue-900'
                  : 'text-white hover:bg-white/20'
              }`}
            >
              <span className="font-bold">{forSaleCount}</span>
              <span className="hidden sm:inline">For Sale</span>
              <span className="sm:hidden">Sale</span>
            </button>
            
            <button
              onClick={() => scrollToSection('for-lease')}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'for-lease'
                  ? 'bg-white text-blue-900'
                  : 'text-white hover:bg-white/20'
              }`}
            >
              <span className="font-bold">{forLeaseCount}</span>
              <span className="hidden sm:inline">For Lease</span>
              <span className="sm:hidden">Lease</span>
            </button>
            
            <button
              onClick={() => scrollToSection('sold')}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'sold'
                  ? 'bg-white text-blue-900'
                  : 'text-white hover:bg-white/20'
              }`}
            >
              <span className="font-bold">{soldCount}</span>
              <span>Sold</span>
            </button>
            
            <button
              onClick={() => scrollToSection('leased')}
              className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap ${
                activeTab === 'leased'
                  ? 'bg-white text-blue-900'
                  : 'text-white hover:bg-white/20'
              }`}
            >
              <span className="font-bold">{leasedCount}</span>
              <span>Leased</span>
            </button>
            
            <button
              onClick={scrollToBuildings}
              className="px-2 md:px-4 py-2 rounded-lg text-xs md:text-sm font-semibold transition-all whitespace-nowrap text-white hover:bg-white/20"
            >
              Buildings
            </button>
          </div>
          
          <div className="flex-shrink-0">
            <AuthStatus agentId={agentId} />
          </div>
        </div>
      </div>
    </nav>
  )
}