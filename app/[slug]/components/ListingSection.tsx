'use client'

import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import ListingCard from './ListingCard'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'
import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'

interface ListingSectionProps {
  activeSales: MLSListing[]
  activeRentals: MLSListing[]
  closedSalesCount: number
  closedRentalsCount: number
  buildingId: string
  buildingAddress?: string
  buildingName: string
  buildingSlug: string
  agentId: string
  tenantId?: string
  isWalliam?: boolean
}

type TabType = 'for-sale' | 'for-lease' | 'sold' | 'leased'

export default function ListingSection({
  activeSales = [],
  activeRentals = [],
  closedSalesCount = 0,
  closedRentalsCount = 0,
  buildingId,
  buildingAddress,
  buildingName,
  buildingSlug,
  agentId,
  tenantId,
  isWalliam = false,
}: ListingSectionProps) {
  const { user } = useAuth()
  const [showRegister, setShowRegister] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('for-sale')
  const [currentPage, setCurrentPage] = useState(1)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<MLSListing | null>(null)
  const [modalType, setModalType] = useState<'sale' | 'lease'>('sale')
  const [exactSqft, setExactSqft] = useState<number | null>(null)

  // Lazy-loaded data for sold/leased tabs
  const [closedSales, setClosedSales] = useState<any[]>([])
  const [closedRentals, setClosedRentals] = useState<any[]>([])
  const [loadingSold, setLoadingSold] = useState(false)
  const [loadingLeased, setLoadingLeased] = useState(false)
  const [soldLoaded, setSoldLoaded] = useState(false)
  const [leasedLoaded, setLeasedLoaded] = useState(false)

  const itemsPerPage = 6

  // Fetch sold/leased data on tab click
  const fetchClosedListings = async (type: 'sold' | 'leased') => {
    if (type === 'sold' && soldLoaded) return
    if (type === 'leased' && leasedLoaded) return

    const setLoading = type === 'sold' ? setLoadingSold : setLoadingLeased
    const setData = type === 'sold' ? setClosedSales : setClosedRentals
    const setLoaded = type === 'sold' ? setSoldLoaded : setLeasedLoaded

    setLoading(true)
    try {
      const res = await fetch(`/api/building-listings?buildingId=${buildingId}&type=${type}`)
      const json = await res.json()
      setData(json.listings || [])
      setLoaded(true)
    } catch (err) {
      console.error(`Failed to fetch ${type} listings:`, err)
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'for-sale' as TabType, label: 'For Sale', count: activeSales?.length || 0, data: activeSales || [] },
    { id: 'for-lease' as TabType, label: 'For Lease', count: activeRentals?.length || 0, data: activeRentals || [] },
    { id: 'sold' as TabType, label: 'Sold', count: closedSalesCount, data: closedSales },
    { id: 'leased' as TabType, label: 'Leased', count: closedRentalsCount, data: closedRentals },
  ]

  const currentData = tabs.find(tab => tab.id === activeTab)?.data || []
  const isSaleTab = activeTab === 'for-sale' || activeTab === 'sold'
  const isLoading = (activeTab === 'sold' && loadingSold) || (activeTab === 'leased' && loadingLeased)

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId)
    setCurrentPage(1)
    if (tabId === 'sold') fetchClosedListings('sold')
    if (tabId === 'leased') fetchClosedListings('leased')
  }

  const handleEstimateClick = (listing: MLSListing, type: 'sale' | 'lease', exactSqft: number | null) => {
    if (isWalliam && !user) {
      setShowRegister(true)
      return
    }
    setSelectedListing(listing)
    setModalType(type)
    setModalOpen(true)
  }

  const totalPages = Math.ceil(currentData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = currentData.slice(startIndex, endIndex)

  return (
    <>
      <section className="py-20 bg-gradient-to-br from-emerald-700 via-teal-600 to-emerald-700 relative overflow-hidden w-full">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10 w-full overflow-hidden">
          <h2 className="text-2xl sm:text-4xl md:text-5xl font-black text-white text-center mb-4">
            Get Instant<br className="sm:hidden" /> Digital Estimates
          </h2>
          <p className="text-lg sm:text-2xl md:text-3xl font-bold text-white text-center mb-8 sm:mb-12">Browse Condos</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 max-w-4xl mx-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg md:text-xl font-black rounded-2xl transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-white text-emerald-900 shadow-2xl transform scale-110'
                    : 'bg-white/20 text-white hover:bg-white/30 backdrop-blur-lg border-2 border-white/40 hover:scale-105'
                }`}
              >
                {tab.label}
                <span className={`ml-3 px-4 py-1.5 rounded-full text-base font-black ${
                  activeTab === tab.id
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/30 text-white'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-6 py-12">
        {isLoading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
            <span className="ml-3 text-gray-600">Loading listings...</span>
          </div>
        ) : paginatedData.length > 0 ? (
          <>
            <div className="relative">
              <div className={(isWalliam && !user && (activeTab === 'sold' || activeTab === 'leased')) ? 'grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 blur-sm pointer-events-none select-none' : 'grid grid-cols-1 md:grid-cols-3 gap-6 mb-8'}>
                {paginatedData.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    type={isSaleTab ? 'sale' : 'lease'}
                    onEstimateClick={(exactSqft) => handleEstimateClick(listing, isSaleTab ? 'sale' : 'lease', exactSqft)}
                    buildingSlug={buildingSlug}
                    buildingName={buildingName}
                    agentId={agentId}
                  />
                ))}
              </div>
              {isWalliam && !user && (activeTab === 'sold' || activeTab === 'leased') && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center border border-gray-100">
                    <div className="text-3xl mb-3">🔒</div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      Register to See {activeTab === 'sold' ? 'Sold' : 'Leased'} Prices
                    </h3>
                    <p className="text-gray-500 text-sm mb-6">
                      Create a free account to access sold prices, days on market, and full transaction history.
                    </p>
                    <button
                      onClick={() => setShowRegister(true)}
                      className="w-full py-3 px-6 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors"
                    >
                      Create Free Account
                    </button>
                    <p className="text-xs text-gray-400 mt-3">No credit card required</p>
                  </div>
                </div>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-8">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>

                <div className="flex gap-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded-lg font-semibold transition-colors ${
                        currentPage === page
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}

            <p className="text-center text-slate-600 mt-4">
              Showing {startIndex + 1}-{Math.min(endIndex, currentData.length)} of {currentData.length} properties
            </p>
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-xl text-slate-500">
              {(activeTab === 'sold' && !soldLoaded) || (activeTab === 'leased' && !leasedLoaded)
                ? 'Loading...'
                : 'No listings available in this category.'}
            </p>
          </div>
        )}
      </section>

      {/* Estimator Modal */}
      {showRegister && (
        <RegisterModal
          isOpen={showRegister}
          onClose={() => setShowRegister(false)}
          onSuccess={() => setShowRegister(false)}
          registrationSource="walliam_listing_gate"
          agentId={agentId}
          buildingId={buildingId}
          buildingName={buildingName}
        />
      )}
      <EstimatorBuyerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        listing={selectedListing}
        buildingName={buildingName}
        buildingAddress={buildingAddress}
        buildingId={buildingId}
        buildingSlug={buildingSlug}
        agentId={agentId}
          tenantId={tenantId}
        type={modalType}
        exactSqft={exactSqft}
      />
    </>
  )
}