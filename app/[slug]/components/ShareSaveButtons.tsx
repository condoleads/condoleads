'use client'

import { useState } from 'react'

interface ShareSaveButtonsProps {
  buildingName: string
  slug: string
}

export default function ShareSaveButtons({ buildingName, slug }: ShareSaveButtonsProps) {
  const [saved, setSaved] = useState(false)
  const [showShareMenu, setShowShareMenu] = useState(false)

  const url = `https://condoleads.com/${slug}`
  const text = `Check out ${buildingName} on CondoLeads`

  const handleShare = async () => {
    // Try native Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({ title: buildingName, text, url })
      } catch (err) {
        console.log('Share cancelled')
      }
    } else {
      // Desktop: show menu
      setShowShareMenu(!showShareMenu)
    }
  }

  const shareLinks = {
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(buildingName)}&body=${encodeURIComponent(`${text}: ${url}`)}`
  }

  const handleSave = () => {
    // TODO: Implement save to favorites (localStorage or user account)
    setSaved(!saved)
    if (!saved) {
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]')
      favorites.push(slug)
      localStorage.setItem('favorites', JSON.stringify(favorites))
    } else {
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]')
      localStorage.setItem('favorites', JSON.stringify(favorites.filter((s: string) => s !== slug)))
    }
  }

  return (
    <div className="flex items-center gap-3">
      {/* Share Button */}
      <div className="relative">
        <button
          onClick={handleShare}
          className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-emerald-600 text-emerald-600 hover:bg-emerald-50 rounded-lg font-semibold transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
          </svg>
          Share
        </button>

        {/* Share Menu (Desktop) */}
        {showShareMenu && (
          <div className="absolute top-full mt-2 bg-white border-2 border-slate-200 rounded-lg shadow-xl p-4 z-50 min-w-[200px] right-0">
            <p className="text-sm font-semibold text-slate-700 mb-3">Share via:</p>
            <div className="space-y-2">
              <a href={shareLinks.twitter} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                <span className="text-sm">Twitter</span>
              </a>
              <a href={shareLinks.facebook} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                <span className="text-sm">Facebook</span>
              </a>
              <a href={shareLinks.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-blue-700" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                <span className="text-sm">LinkedIn</span>
              </a>
              <a href={shareLinks.email} className="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                <span className="text-sm">Email</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className={`flex items-center gap-2 px-4 py-2 border-2 rounded-lg font-semibold transition-colors ${
          saved 
            ? 'bg-emerald-600 border-emerald-600 text-white' 
            : 'bg-white border-slate-300 text-slate-700 hover:border-emerald-600 hover:text-emerald-600'
        }`}
      >
        <svg className="w-5 h-5" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
        </svg>
        {saved ? 'Saved' : 'Save'}
      </button>
    </div>
  )
}