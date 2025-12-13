import { formatPrice } from '@/lib/utils/formatters'
import { getStatusDisplay } from '@/lib/utils/dom'

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
}

interface UnitHistoryProps {
  history: HistoricalSale[]
  unitNumber: string
}

export default function UnitHistory({ history, unitNumber }: UnitHistoryProps) {
  if (!history || history.length === 0) return null

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">
        Unit {unitNumber} History
      </h2>
      <p className="text-slate-600 mb-6">
        Complete transaction history for this unit
      </p>

      <div className="space-y-4">
        {history.map((sale) => {
          const isSale = sale.transaction_type === 'For Sale'
          const statusDisplay = getStatusDisplay(sale.standard_status, sale.mls_status, sale.transaction_type)
          
          // Use close_price for closed transactions, list_price for others
          const displayPrice = sale.close_price || sale.list_price
          const priceChange = sale.close_price && sale.list_price
            ? sale.close_price - sale.list_price
            : 0
          const priceChangePercent = sale.close_price && sale.list_price
            ? ((priceChange / sale.list_price) * 100).toFixed(1)
            : '0'

          // Determine which date to show
          const displayDate = sale.close_date || sale.listing_contract_date
          const dateLabel = sale.close_date ? 
            (statusDisplay.label === 'Sold' ? 'Sold' : 
             statusDisplay.label === 'Leased' ? 'Leased' : 
             statusDisplay.label === 'Expired' ? 'Expired' : 'Closed') 
            : 'Listed'

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
            </div>
          )
        })}
      </div>
    </section>
  )
}