'use client'

import { useState, useEffect } from 'react'
import { X, MessageSquare } from 'lucide-react'
import { formatPrice } from '@/lib/utils/formatters'
import { getStatusDisplay } from '@/lib/utils/dom'
import { useAuth } from '@/components/auth/AuthContext'
import { getOrCreateLead } from '@/lib/actions/leads'
import { trackActivity } from '@/lib/actions/user-activity'

interface HistoryItem {
  id: string
  list_price: number
  close_price: number | null
  close_date: string | null
  listing_contract_date: string | null
  days_on_market: number | null
  transaction_type: string
  standard_status: string | null
  mls_status: string | null
  listing_key: string | null
}

interface UnitHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  unitNumber: string
  buildingId: string
  buildingSlug?: string
  buildingName?: string
  agentId?: string
  currentListingId?: string
}

export default function UnitHistoryModal({
  isOpen,
  onClose,
  unitNumber,
  buildingId,
  buildingSlug,
  buildingName,
  agentId,
  currentListingId
}: UnitHistoryModalProps) {
  const { user } = useAuth()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Contact form state - pre-filled with user data
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Pre-fill form when user data available
  useEffect(() => {
    if (user) {
      setContactForm(prev => ({
        ...prev,
        name: user.user_metadata?.full_name || user.user_metadata?.name || prev.name,
        email: user.email || prev.email,
        phone: user.user_metadata?.phone || prev.phone
      }))
    }
  }, [user])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSubmitted(false)
      if (user) {
        setContactForm({
          name: user.user_metadata?.full_name || user.user_metadata?.name || '',
          email: user.email || '',
          phone: user.user_metadata?.phone || '',
          message: ''
        })
      }
    }
  }, [isOpen, user])

  useEffect(() => {
    if (isOpen && buildingId && unitNumber) {
      fetchHistory()
    }
  }, [isOpen, buildingId, unitNumber])

  const fetchHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = '/api/unit-history?buildingId=' + buildingId + '&unitNumber=' + encodeURIComponent(unitNumber) + (currentListingId ? '&excludeId=' + currentListingId : '')
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch history')
      const data = await response.json()
      setHistory(data.history || [])
    } catch (err) {
      setError('Unable to load unit history')
      console.error('History fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const message = 'Interested in Unit ' + unitNumber + ' at ' + (buildingName || 'this building') + '. ' + (contactForm.message || 'Please contact me with more details about this unit\'s history and availability.')

    if (agentId) {
      try {
        await trackActivity({
          contactEmail: contactForm.email,
          agentId: agentId,
          activityType: 'property_inquiry',
          activityData: {
            buildingId,
            buildingName,
            unitNumber,
            historyCount: history.length
          }
        })
      } catch (error) {
        console.error('trackActivity error:', error)
      }

      try {
        await getOrCreateLead({
          agentId,
          contactName: contactForm.name,
          contactEmail: contactForm.email,
          contactPhone: contactForm.phone,
          source: 'unit_history_inquiry',
          buildingId,
          message,
          propertyDetails: {
            buildingName,
            unitNumber,
            historyCount: history.length
          },
          forceNew: true
        })
      } catch (error) {
        console.error('Lead creation error:', error)
      }
    }

    setIsSubmitting(false)
    setSubmitted(true)
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Unit {unitNumber} History</h2>
            <p className="text-sm text-slate-500 mt-1">2 Year Transaction History</p>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="p-5 overflow-y-auto max-h-[65vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-slate-500">{error}</p>
            </div>
          ) : (
            <>
              {/* History Items */}
              {history.length === 0 ? (
                <div className="text-center py-8 mb-6">
                  <p className="text-slate-500">No previous transactions found for this unit</p>
                </div>
              ) : (
                <div className="space-y-4 mb-6">
                  {history.map((item) => {
                    const isSale = item.transaction_type === 'For Sale'
                    const statusDisplay = getStatusDisplay(item.standard_status, item.mls_status, item.transaction_type)
                    const displayPrice = item.close_price || item.list_price
                    const displayDate = item.close_date || item.listing_contract_date
                    const priceChange = item.close_price && item.list_price ? item.close_price - item.list_price : 0
                    const priceChangePercent = item.close_price && item.list_price && item.list_price > 0 ? ((priceChange / item.list_price) * 100).toFixed(1) : '0'
                    const propertyUrl = buildingSlug && item.listing_key ? '/' + buildingSlug + '-unit-' + unitNumber + '-' + item.listing_key.toLowerCase() : null

                    return (
                      <div key={item.id} className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <span className={'inline-block px-3 py-1 rounded-full text-xs font-semibold ' + statusDisplay.bgColor + ' ' + statusDisplay.textColor}>
                              {statusDisplay.label}
                            </span>
                            <p className="text-sm text-slate-600 mt-2">{formatDate(displayDate)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-slate-900">
                              {formatPrice(displayPrice)}
                              {!isSale && <span className="text-sm font-normal text-slate-500">/mo</span>}
                            </p>
                            {priceChange !== 0 && item.close_price && (
                              <p className={'text-xs font-semibold ' + (priceChange < 0 ? 'text-red-600' : 'text-emerald-600')}>
                                {priceChange < 0 ? '' : '+'}{formatPrice(priceChange)} ({priceChangePercent}%)
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                          {item.close_price && item.list_price && item.close_price !== item.list_price && (
                            <span>Listed: {formatPrice(item.list_price)}</span>
                          )}
                          {item.days_on_market !== null && item.days_on_market !== undefined && (
                            <span>• {item.days_on_market} days on market</span>
                          )}
                        </div>
                        {propertyUrl && (
                          <a href={propertyUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="mt-3 block text-center text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                            View Property Details →
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Contact Agent Form - Always Open */}
              <div className="border-t border-slate-200 pt-6">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl p-5 text-white">
                  <div className="flex items-center gap-3 mb-4">
                    <MessageSquare className="w-6 h-6" />
                    <h3 className="text-lg font-bold">Contact Agent for More Details</h3>
                  </div>
                  
                  {!submitted ? (
                    <form onSubmit={handleContactSubmit} className="space-y-3">
                      <div>
                        <input
                          type="text"
                          required
                          value={contactForm.name}
                          onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                          placeholder="Your Name *"
                          className="w-full px-4 py-3 border-0 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                      <div>
                        <input
                          type="email"
                          required
                          value={contactForm.email}
                          onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                          placeholder="Your Email *"
                          className="w-full px-4 py-3 border-0 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                      <div>
                        <input
                          type="tel"
                          value={contactForm.phone}
                          onChange={(e) => setContactForm({...contactForm, phone: e.target.value})}
                          placeholder="Your Phone"
                          className="w-full px-4 py-3 border-0 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                      <div>
                        <textarea
                          value={contactForm.message}
                          onChange={(e) => setContactForm({...contactForm, message: e.target.value})}
                          placeholder="Message (optional)"
                          rows={2}
                          className="w-full px-4 py-3 border-0 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-300 resize-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-white text-blue-700 font-bold py-3 rounded-lg transition-all hover:bg-blue-50 disabled:opacity-50"
                      >
                        {isSubmitting ? 'Sending...' : 'Send Inquiry'}
                      </button>
                    </form>
                  ) : (
                    <div className="bg-white rounded-xl p-5 text-center">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h4 className="text-lg font-bold text-slate-900 mb-1">Inquiry Sent!</h4>
                      <p className="text-slate-600 text-sm">Your agent will contact you shortly.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}