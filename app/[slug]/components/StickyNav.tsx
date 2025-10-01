'use client'

import { useState, useEffect } from 'react'

const sections = [
  { id: 'listings', label: 'Listings' },
  { id: 'list-your-unit', label: 'List Your Unit' },
  { id: 'highlights', label: 'Building Highlights' },
  { id: 'market-stats', label: 'Market Stats' },
  { id: 'amenities', label: 'Amenities' },
  { id: 'price-trends', label: 'Price Trends' },
  { id: 'transaction-history', label: 'Transaction History' },
]

export default function StickyNav() {
  const [activeSection, setActiveSection] = useState('listings')
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      // Show nav after scrolling past hero (800px)
      setIsVisible(window.scrollY > 800)

      // Find active section
      const scrollPosition = window.scrollY + 200
      
      for (const section of sections) {
        const element = document.getElementById(section.id)
        if (element) {
          const { offsetTop, offsetHeight } = element
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section.id)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const elementPosition = element.offsetTop - offset
      window.scrollTo({ top: elementPosition, behavior: 'smooth' })
    }
  }

  if (!isVisible) return null

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-lg">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-center gap-1 py-3 overflow-x-auto">
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeSection === section.id
                  ? 'bg-emerald-500 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {section.label}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}
