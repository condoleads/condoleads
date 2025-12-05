'use client'

interface DualCTASectionProps {
  buildingName: string
  activeSalesCount: number
  activeRentalsCount: number
  lowestSalePrice?: number
  lowestRentPrice?: number
}

export default function DualCTASection({
  buildingName,
  activeSalesCount,
  activeRentalsCount,
  lowestSalePrice,
  lowestRentPrice
}: DualCTASectionProps) {
  const totalActiveListings = activeSalesCount + activeRentalsCount

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const formatPrice = (price: number) => {
    if (price >= 1000000) {
      return `$${(price / 1000000).toFixed(1)}M`
    }
    return `$${Math.round(price / 1000)}K`
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10 mb-8">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
          
          {/* Left: Sellers CTA */}
          <div className="p-6 md:p-8 bg-gradient-to-br from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 mb-1">Own a Unit Here?</h3>
                <p className="text-slate-600 text-sm mb-4">
                  Get a FREE instant estimate of your unit's current market value in {buildingName}
                </p>
                <button
                  onClick={() => scrollToSection('list-your-unit')}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                >
                  <span>What's Your Unit Worth?</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Buyers/Renters CTA */}
          <div className="p-6 md:p-8 bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-900 mb-1">Looking to Buy or Rent?</h3>
                <p className="text-slate-600 text-sm mb-2">
                  {totalActiveListings > 0 ? (
                    <>
                      <span className="font-semibold text-blue-600">{totalActiveListings} Active Listing{totalActiveListings !== 1 ? 's' : ''}</span>
                      {activeSalesCount > 0 && lowestSalePrice && (
                        <span> • Sales from <span className="font-semibold">{formatPrice(lowestSalePrice)}</span></span>
                      )}
                      {activeRentalsCount > 0 && lowestRentPrice && (
                        <span> • Rentals from <span className="font-semibold">{formatPrice(lowestRentPrice)}/mo</span></span>
                      )}
                    </>
                  ) : (
                    'Browse available units and get instant price estimates'
                  )}
                </p>
                <button
                  onClick={() => scrollToSection('listings')}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 mt-2"
                >
                  <span>View Available Units</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}