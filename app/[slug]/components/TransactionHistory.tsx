'use client'

import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'
import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import { formatPriceShort } from '@/lib/utils/formatters'

interface TransactionHistoryProps {
  closedSales: MLSListing[]
  closedRentals: MLSListing[]
  highestSale: number
}

export default function TransactionHistory({
  closedSales = [],
  closedRentals = [],
  highestSale = 0,
}: TransactionHistoryProps) {
  const { user } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  if (closedSales.length === 0 && closedRentals.length === 0) {
    return null
  }

  return (
    <section className="bg-slate-900 py-20">
      <div className="max-w-7xl mx-auto px-6">
        <h2 className="text-4xl font-bold text-white mb-10">Transaction History</h2>

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
      </div>
    </section>
  )
}
