'use client'

import { useState, useEffect } from 'react'

interface ExitIntentPopupProps {
  unitNumber: string
  buildingName: string
  isSale: boolean
  onEstimateClick: () => void
}

export default function ExitIntentPopup({
  unitNumber,
  buildingName,
  isSale,
  onEstimateClick
}: ExitIntentPopupProps) {
  const [showPopup, setShowPopup] = useState(false)
  const [hasTriggered, setHasTriggered] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth < 768) return
    const hasShown = sessionStorage.getItem('exitIntentShown')
    if (hasShown) return

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 5 && !hasTriggered) {
        setHasTriggered(true)
        setShowPopup(true)
        sessionStorage.setItem('exitIntentShown', 'true')
      }
    }

    document.addEventListener('mouseleave', handleMouseLeave)
    return () => document.removeEventListener('mouseleave', handleMouseLeave)
  }, [hasTriggered])

  const handleClose = () => setShowPopup(false)

  const handleEstimateClick = () => {
    setShowPopup(false)
    onEstimateClick()
  }

  if (!showPopup) return null

  const headerClass = isSale 
    ? 'bg-gradient-to-br from-emerald-500 to-teal-600' 
    : 'bg-gradient-to-br from-purple-500 to-indigo-600'

  const buttonClass = isSale 
    ? 'bg-emerald-600 hover:bg-emerald-700' 
    : 'bg-purple-600 hover:bg-purple-700'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />
      
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className={`p-6 text-center ${headerClass}`}>
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-white mb-2">Before You Go...</h2>
          <p className="text-white/90">Get a FREE instant estimate for</p>
          <p className="text-white font-semibold text-lg">Unit {unitNumber} at {buildingName}</p>
        </div>

        <div className="p-6 text-center">
          <p className="text-slate-600 mb-6">
            See how this unit compares to recent {isSale ? 'sales' : 'rentals'} in the building. No commitment required.
          </p>
          
          <button
            onClick={handleEstimateClick}
            className={`w-full py-3 px-6 rounded-xl font-semibold text-white transition-all transform hover:scale-[1.02] shadow-lg ${buttonClass}`}
          >
            {isSale ? 'Get Free Sale Estimate' : 'Get Free Rent Estimate'}
          </button>
          
          <button onClick={handleClose} className="mt-4 text-sm text-slate-500 hover:text-slate-700 transition-colors">
            No thanks, I'll pass
          </button>
        </div>
      </div>
    </div>
  )
}