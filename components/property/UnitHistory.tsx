'use client'
import { formatPrice } from '@/lib/utils/formatters'
import { getStatusDisplay } from '@/lib/utils/dom'
import { useAuth } from '@/components/auth/AuthContext'
import { Lock } from 'lucide-react'

interface HistoricalSale {
  id: string
  list_price: number
  close_price: number | null
  close_date: string | null
  listing_contract_date: string | null
  days_on_market: number | null
  transaction_type: string
  standard_status: string | null
  mls_status: string | null
  listing_key?: string | null
}

interface UnitHistoryProps {
  history: HistoricalSale[]
  unitNumber: string
  buildingSlug?: string
  isHome?: boolean
}

export default function UnitHistory({ history, unitNumber, buildingSlug, isHome = false }: UnitHistoryProps) {
  const { user } = useAuth()
  
  if (!history || history.length === 0) return null

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Show only first item for non-registered users
  const displayHistory = user ? history : history.slice(0, 1)
  const isGated = !user && history.length > 1

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">
        {isHome ? unitNumber : `Unit ${unitNumber}`} History
      </h2>
      <p className="text-slate-600 mb-6">
        Complete transaction history for this {isHome ? 'property' : 'unit'}
      </p>
      
      <div className="space-y-4">
        {displayHistory.map((sale) => {
          const isSale = sale.transaction_type === 'For Sale'
          const statusDisplay = getStatusDisplay(sale.standard_status, sale.mls_status, sale.transaction_type)
          const displayPrice = sale.close_price || sale.list_price
          const priceChange = sale.close_price && sale.list_price
            ? sale.close_price - sale.list_price
            : 0
          const priceChangePercent = sale.close_price && sale.list_price
            ? ((priceChange / sale.list_price) * 100).toFixed(1)
            : '0'
          const displayDate = sale.close_date || sale.listing_contract_date
          const dateLabel = sale.close_date ?
            (statusDisplay.label === 'Sold' ? 'Sold' :
             statusDisplay.label === 'Leased' ? 'Leased' :
             statusDisplay.label === 'Expired' ? 'Expired' : 'Closed')
            : 'Listed'
          const propertyUrl = isHome && sale.listing_key
            ? `/${unitNumber.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}-${sale.listing_key.toLowerCase()}`
            : buildingSlug && sale.listing_key 
              ? `/${buildingSlug}-unit-${unitNumber}-${sale.listing_key.toLowerCase()}`
              : null

          return (
            <div key={sale.id} className="border border-slate-200 rounded-lg p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusDisplay.bgColor} ${statusDisplay.textColor}`}>
                    {statusDisplay.label}
                  </span>
                  <p className="text-sm text-slate-600 mt-2">
                    {dateLabel}: {formatDate(displayDate)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">
                    {formatPrice(displayPrice)}
                    {!isSale && <span className="text-base font-normal">/mo</span>}
                  </p>
                  {priceChange !== 0 && sale.close_price && (
                    <p className={`text-sm font-semibold ${priceChange < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {priceChange < 0 ? '' : '+'}{formatPrice(priceChange)} ({priceChangePercent}%)
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                {sale.close_price && sale.list_price && sale.close_price !== sale.list_price && (
                  <span>Listed: {formatPrice(sale.list_price)}</span>
                )}
                {sale.days_on_market !== null && sale.days_on_market !== undefined && (
                  <span>• {sale.days_on_market} days on market</span>
                )}
                {sale.transaction_type && (
                  <span>• {sale.transaction_type === 'For Sale' ? 'Sale' : 'Lease'}</span>
                )}
              </div>
              {propertyUrl && (
                <a 
                  href={propertyUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="mt-3 block text-center text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  View Property Details →
                </a>
              )}
            </div>
          )
        })}
      </div>

      {/* Registration Gate */}
      {isGated && (
        <div className="mt-6 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-white via-white/95 to-transparent z-10" />
          <div className="relative z-20 text-center py-8">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-100 rounded-full mb-4">
              <Lock className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
              {history.length - 1} More Transactions Available
            </h3>
            <p className="text-slate-600 mb-4">
              Register free to see the complete unit history
            </p>
            <button
              onClick={() => {
                const event = new CustomEvent('openAuthModal', { detail: { mode: 'register' } })
                window.dispatchEvent(event)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
            >
              Register to Unlock
            </button>
          </div>
        </div>
      )}
    </section>
  )
}