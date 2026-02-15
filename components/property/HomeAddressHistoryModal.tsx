'use client'
import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { formatPrice } from '@/lib/utils/formatters'
import { getStatusDisplay } from '@/lib/utils/dom'
import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'

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
  property_subtype: string | null
}

interface HomeAddressHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  address: string
  currentListingId?: string
  agentId?: string
}

export default function HomeAddressHistoryModal({
  isOpen,
  onClose,
  address,
  currentListingId,
  agentId,
}: HomeAddressHistoryModalProps) {
  const { user } = useAuth()
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)

  useEffect(() => {
    if (isOpen && address) {
      fetchHistory()
    }
  }, [isOpen, address])

  const fetchHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = '/api/address-history?address=' + encodeURIComponent(address) + (currentListingId ? '&excludeId=' + currentListingId : '')
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch history')
      const data = await response.json()
      setHistory(data.history || [])
    } catch (err) {
      setError('Unable to load address history')
      console.error('History fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Short address for display
  const shortAddress = address?.split(',')[0] || 'This Property'

  // Gate closed data behind registration
  const canViewClosed = !!user

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Property History</h2>
              <p className="text-sm text-slate-600 mt-0.5">{shortAddress}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[60vh]">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-slate-500">{error}</p>
                <button onClick={fetchHistory} className="mt-3 text-blue-600 hover:text-blue-700 font-medium text-sm">
                  Try Again
                </button>
              </div>
            ) : history.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-500">No previous listings found for this address.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {history.map((item) => {
                  const isClosed = item.standard_status === 'Closed'
                  const isSale = item.transaction_type === 'For Sale'
                  const statusInfo = getStatusDisplay(item.standard_status, item.mls_status, item.transaction_type)
                  const shouldBlur = isClosed && !canViewClosed

                  // Color coding
                  const statusColor = isClosed
                    ? (isSale ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')
                    : (isSale ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')

                  // Property detail link - use slug format
                          const slugAddress = address.split(',')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
                          const detailUrl = item.listing_key 
                            ? `/${slugAddress}-${item.listing_key.toLowerCase()}`
                            : `/property/${item.id}`

                  return (
                    <div key={item.id} className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors">
                      {/* Top row: Status + Date */}
                      <div className="flex items-center justify-between mb-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColor}`}>
                          {statusInfo?.label || item.standard_status || 'Unknown'}
                        </span>
                        <span className="text-sm text-slate-500">
                          {item.close_date
                            ? new Date(item.close_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
                            : item.listing_contract_date
                            ? `Listed ${new Date(item.listing_contract_date).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}`
                            : ''}
                        </span>
                      </div>

                      {shouldBlur ? (
                        <div className="space-y-2">
                          <div className="blur-sm">
                            <p className="text-lg font-bold text-slate-900">{formatPrice(item.close_price || item.list_price)}</p>
                            <p className="text-sm text-slate-600">
                              Listed at {formatPrice(item.list_price)}
                              {item.days_on_market ? ` · ${item.days_on_market} days` : ''}
                            </p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setShowRegister(true) }}
                            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                          >
                            Register to See {isSale ? 'Sold' : 'Leased'} Price
                          </button>
                        </div>
                      ) : (
                        <>
                          {/* Prices */}
                          <div className="space-y-1 mb-2">
                            {isClosed && item.close_price && (
                              <p className="text-lg font-bold text-slate-900">
                                {isSale ? 'Sold' : 'Leased'}: {formatPrice(item.close_price)}
                              </p>
                            )}
                            <p className="text-sm text-slate-600">
                              Listed at {formatPrice(item.list_price)}
                              {item.days_on_market ? ` · ${item.days_on_market} days on market` : ''}
                            </p>
                          </div>

                          {/* MLS + View Details link */}
                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                            <span className="text-xs text-slate-400">
                              {item.listing_key ? `MLS® #${item.listing_key}` : ''}
                            </span>
                            <a
                              href={detailUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              View Details →
                            </a>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {showRegister && (
        <RegisterModal
          isOpen={showRegister}
          onClose={() => setShowRegister(false)}
          agentId={agentId || ''}
          registrationSource="home_history_modal"
        />
      )}
    </>
  )
}