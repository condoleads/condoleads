import { formatPrice } from '@/lib/utils/formatters'

interface PriceHistoryProps {
  listPrice: number
  closePrice: number | null
  listingDate: string | null
  closeDate: string | null
  daysOnMarket: number | null
}

export default function PriceHistory({ 
  listPrice, 
  closePrice, 
  listingDate, 
  closeDate,
  daysOnMarket 
}: PriceHistoryProps) {
  const hasPriceChange = closePrice && closePrice !== listPrice
  const priceChange = closePrice ? closePrice - listPrice : 0
  const priceChangePercent = closePrice ? ((priceChange / listPrice) * 100).toFixed(1) : '0'

  return (
    <section className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-slate-900 mb-4">Price History</h2>
      
      <div className="space-y-4">
        {/* Original List Price */}
        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-lg">
          <div>
            <p className="text-sm text-slate-600">Original List Price</p>
            <p className="text-xl font-bold text-slate-900">{formatPrice(listPrice)}</p>
            {listingDate && (
              <p className="text-sm text-slate-500 mt-1">
                Listed on {new Date(listingDate).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </p>
            )}
          </div>
        </div>

        {/* Sold Price */}
        {closePrice && (
          <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-lg border-2 border-emerald-200">
            <div>
              <p className="text-sm text-emerald-700 font-semibold">Sold Price</p>
              <p className="text-xl font-bold text-emerald-900">{formatPrice(closePrice)}</p>
              {closeDate && (
                <p className="text-sm text-emerald-600 mt-1">
                  Sold on {new Date(closeDate).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </p>
              )}
            </div>
            {hasPriceChange && (
              <div className="text-right">
                <p className={`text-2xl font-bold ${priceChange < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {priceChange < 0 ? '-' : '+'}{formatPrice(Math.abs(priceChange))}
                </p>
                <p className={`text-sm font-semibold ${priceChange < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {priceChangePercent}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* Days on Market */}
        {daysOnMarket !== null && (
          <div className="flex items-center gap-2 text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">
              <span className="font-semibold">{daysOnMarket}</span> days on market
            </span>
          </div>
        )}
      </div>
    </section>
  )
}