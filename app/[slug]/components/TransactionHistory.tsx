'use client'

import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'
import { useState, useEffect } from 'react'
import { trackActivity } from '@/lib/actions/user-activity'
import { MLSListing } from '@/lib/types/building'
import { formatPriceShort } from '@/lib/utils/formatters'

interface TransactionHistoryProps {
  closedSales: MLSListing[]
  closedRentals: MLSListing[]
  highestSale: number
  buildingName?: string
  buildingAddress?: string
  unitNumber?: string
}

export default function TransactionHistory({
  closedSales = [],
  closedRentals = [],
  highestSale = 0,
  buildingName = '',
  buildingAddress = '',
  unitNumber = '',
}: TransactionHistoryProps) {
  const { user } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  
  // Track when authenticated user views transaction history
  useEffect(() => {
    if (user?.email && (closedSales.length > 0 || closedRentals.length > 0)) {
      trackActivity({
        contactEmail: user.email,
        activityType: 'viewed_transaction_history',
        activityData: {
          totalSales: closedSales.length,
          totalRentals: closedRentals.length,
          highestSale,
          buildingName,
          buildingAddress,
          unitNumber
        }
      }).catch(err => console.error('Failed to track activity:', err))
    }
  }, [user?.email, closedSales.length, closedRentals.length, highestSale])

  if (closedSales.length === 0 && closedRentals.length === 0) {
    return null
  }

  // GATE: Require registration to view sold/leased data (MLS VOW compliance)
  const isAuthenticated = !!user?.email

  return (
    <section className="bg-slate-900 py-20">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl font-bold text-white mb-10">Transaction History</h2>

        {!isAuthenticated ? (
          /* GATED STATE - Show teaser with blur overlay */
          <div className="relative">
            {/* Blurred preview */}
            <div className="filter blur-md pointer-events-none select-none" aria-hidden="true">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white border border-white/20">
                  <p className="text-5xl font-bold mb-2">{closedSales.length}</p>
                  <p className="text-lg opacity-80">Total Units Sold</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white border border-white/20">
                  <p className="text-5xl font-bold mb-2">{closedRentals.length}</p>
                  <p className="text-lg opacity-80">Total Units Leased</p>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white border border-white/20">
                  <p className="text-5xl font-bold mb-2">$X,XXX,XXX</p>
                  <p className="text-lg opacity-80">Record Sale Price</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[1,2,3,4,5,6].map((i) => (
                  <div key={i} className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-white border border-white/10">
                    <p className="text-sm opacity-70 mb-1">Unit XXX</p>
                    <p className="text-xl font-bold mb-1">$XXX,XXX</p>
                    <p className="text-xs opacity-60">X BR  X BA</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Registration overlay */}
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl p-8 text-center max-w-md border border-white/20 shadow-2xl">
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Transaction History</h3>
                <p className="text-white/70 mb-1">
                  {closedSales.length} sold  {closedRentals.length} leased transactions
                </p>
                <p className="text-white/50 text-sm mb-6">
                  Register for free to view sold prices, lease rates, and full transaction details.
                </p>
                <button
                  onClick={() => setShowRegister(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors w-full"
                >
                  Register to View
                </button>
              </div>
            </div>

            {/* Register Modal */}
            {showRegister && (
              <RegisterModal
                onClose={() => setShowRegister(false)}
                buildingName={buildingName}
                buildingAddress={buildingAddress}
                unitNumber={unitNumber}
                triggerSource="Transaction History"
              />
            )}
          </div>
        ) : (
          /* AUTHENTICATED STATE - Show full data */
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white border border-white/20">
                <p className="text-5xl font-bold mb-2">{closedSales.length}</p>
                <p className="text-lg opacity-80">Total Units Sold</p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white border border-white/20">
                <p className="text-5xl font-bold mb-2">{closedRentals.length}</p>
                <p className="text-lg opacity-80">Total Units Leased</p>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-white border border-white/20">
                <p className="text-5xl font-bold mb-2">
                  {highestSale > 0 ? formatPriceShort(highestSale) : ''}
                </p>
                <p className="text-lg opacity-80">Record Sale Price</p>
              </div>
            </div>

            {/* Transaction Grid */}
            {closedSales.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {closedSales.slice(0, 24).map((listing) => (
                  <div
                    key={listing.id}
                    className="bg-white/10 backdrop-blur-sm rounded-lg p-4 text-white hover:bg-white/20 transition-colors border border-white/10"
                  >
                    <p className="text-sm opacity-70 mb-1">Unit {listing.unit_number}</p>
                    <p className="text-xl font-bold mb-1">{formatPriceShort(listing.list_price)}</p>
                    <p className="text-xs opacity-60">
                      {listing.bedrooms_total}BR  {listing.bathrooms_total_integer}BA
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}