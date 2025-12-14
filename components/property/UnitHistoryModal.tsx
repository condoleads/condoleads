'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { formatPrice } from '@/lib/utils/formatters'
import { getStatusDisplay } from '@/lib/utils/dom'

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
}

interface UnitHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  unitNumber: string
  buildingId: string
  currentListingId?: string
}

export default function UnitHistoryModal({
  isOpen,
  onClose,
  unitNumber,
  buildingId,
  currentListingId
}: UnitHistoryModalProps) {
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && buildingId && unitNumber) {
      fetchHistory()
    }
  }, [isOpen, buildingId, unitNumber])

  const fetchHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/unit-history?buildingId=${buildingId}&unitNumber=${encodeURIComponent(unitNumber)}${currentListingId ? `&excludeId=${currentListingId}` : ''}`)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Unit {unitNumber} History</h2>
            <p className="text-sm text-slate-500 mt-1">Complete transaction history</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-slate-500">{error}</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-500">No previous transactions found for this unit</p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item) => {
                const isSale = item.transaction_type === 'For Sale'
                const statusDisplay = getStatusDisplay(item.standard_status, item.mls_status, item.transaction_type)
                const displayPrice = item.close_price || item.list_price
                const displayDate = item.close_date || item.listing_contract_date
                
                const priceChange = item.close_price && item.list_price
                  ? item.close_price - item.list_price
                  : 0
                const priceChangePercent = item.close_price && item.list_price && item.list_price > 0
                  ? ((priceChange / item.list_price) * 100).toFixed(1)
                  : '0'

                return (
                  <div 
                    key={item.id} 
                    className="border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusDisplay.bgColor} ${statusDisplay.textColor}`}>
                          {statusDisplay.label}
                        </span>
                        <p className="text-sm text-slate-600 mt-2">
                          {formatDate(displayDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-slate-900">
                          {formatPrice(displayPrice)}
                          {!isSale && <span className="text-sm font-normal text-slate-500">/mo</span>}
                        </p>
                        {priceChange !== 0 && item.close_price && (
                          <p className={`text-xs font-semibold ${priceChange < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
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
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}