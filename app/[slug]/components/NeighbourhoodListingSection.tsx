'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/components/auth/AuthContext'
import RegisterModal from '@/components/auth/RegisterModal'
import { MLSListing } from '@/lib/types/building'
import GeoListingCard from './GeoListingCard'
import HomeListingCard from './HomeListingCard'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'
import HomeEstimatorBuyerModal from '@/app/estimator/components/HomeEstimatorBuyerModal'
import GeoQuickFilters, { FilterState } from './GeoQuickFilters'
import GeoAdvancedFilters, { AdvancedFilterState } from './GeoAdvancedFilters'

interface NeighbourhoodListingSectionProps {
  municipalityIds: string[]
  agentId: string
  tenantId?: string
  initialListings?: MLSListing[]
  initialTotal?: number
  counts?: { forSale: number; forLease: number; sold: number; leased: number }
  pageSize?: number
  propertyCategory?: 'condo' | 'homes'
}

type TabType = 'for-sale' | 'for-lease' | 'sold' | 'leased'

const isHomeProperty = (listing: MLSListing) =>
  listing.property_type === 'Residential Freehold' ||
  (!listing.building_id && ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
    'Duplex', 'Triplex', 'Fourplex', 'Multiplex'].some(t => listing.property_subtype?.trim() === t))

const DEFAULT_FILTERS: FilterState = { minPrice: '', maxPrice: '', beds: '0', baths: '0', sort: 'default' }
const DEFAULT_ADVANCED: AdvancedFilterState = { subtypes: [], minSqft: '', maxSqft: '', garage: 'any', basement: 'any', parking: '0', locker: 'any' }

export default function NeighbourhoodListingSection({
  municipalityIds,
  agentId,
  tenantId,
  initialListings,
  initialTotal,
  counts: initialCounts,
  pageSize = 24,
  propertyCategory,
}: NeighbourhoodListingSectionProps) {
  const [activeTab, setActiveTab] = useState<TabType>('for-sale')
  const [currentPage, setCurrentPage] = useState(1)
  const [listings, setListings] = useState<MLSListing[]>(initialListings || [])
  const [totalCount, setTotalCount] = useState(initialTotal || 0)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [counts, setCounts] = useState(initialCounts || { forSale: 0, forLease: 0, sold: 0, leased: 0 })
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(DEFAULT_ADVANCED)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<MLSListing | null>(null)
  const [modalType, setModalType] = useState<'sale' | 'rent'>('sale')
  const [modalExactSqft, setModalExactSqft] = useState<number | null>(null)
  const [selectedIsHome, setSelectedIsHome] = useState(false)
  const [showSoldGate, setShowSoldGate] = useState(false)
  const { user } = useAuth()

  const totalPages = Math.ceil(totalCount / pageSize)
  const idsParam = municipalityIds.join(',')

  const buildUrl = useCallback((tab: TabType, page: number) => {
    const params = new URLSearchParams()
    params.set('municipalityIds', idsParam)
    params.set('tab', tab)
    params.set('page', String(page))
    params.set('pageSize', String(pageSize))
    if (propertyCategory) params.set('propertyCategory', propertyCategory)
    if (filters.minPrice) params.set('minPrice', filters.minPrice)
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice)
    if (filters.beds !== '0') params.set('beds', filters.beds)
    if (filters.baths !== '0') params.set('baths', filters.baths)
    if (filters.sort !== 'default') params.set('sort', filters.sort)
    if (advancedFilters.subtypes.length > 0) params.set('subtypes', advancedFilters.subtypes.join(','))
    if (advancedFilters.minSqft) params.set('minSqft', advancedFilters.minSqft)
    if (advancedFilters.maxSqft) params.set('maxSqft', advancedFilters.maxSqft)
    if (advancedFilters.garage !== 'any') params.set('garage', advancedFilters.garage)
    if (advancedFilters.basement !== 'any') params.set('basement', advancedFilters.basement)
    if (advancedFilters.parking !== '0') params.set('parking', advancedFilters.parking)
    if (advancedFilters.locker !== 'any') params.set('locker', advancedFilters.locker)
    return `/api/neighbourhood-listings?${params.toString()}`
  }, [idsParam, pageSize, propertyCategory, filters, advancedFilters])

  const fetchListings = async (tab: TabType, page: number) => {
    setLoading(true)
    try {
      const res = await fetch(buildUrl(tab, page))
      const data = await res.json()
      setListings(data.listings || [])
      setTotalCount(data.total || 0)
    } catch (err) {
      console.error('Failed to fetch listings:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCounts = async () => {
    try {
      const tabs: TabType[] = ['for-sale', 'for-lease', 'sold', 'leased']
      const results = await Promise.all(
        tabs.map(tab =>
          fetch(buildUrl(tab, 1).replace(`pageSize=${pageSize}`, 'pageSize=1'))
            .then(r => r.json()).then(d => d.total || 0)
        )
      )
      setCounts({ forSale: results[0], forLease: results[1], sold: results[2], leased: results[3] })
    } catch (err) {
      console.error('Failed to fetch counts:', err)
    }
  }

  useEffect(() => {
    if (propertyCategory) {
      setFilters(DEFAULT_FILTERS)
      setAdvancedFilters(DEFAULT_ADVANCED)
      setActiveTab('for-sale')
      setCurrentPage(1)
      setInitialLoad(false)
      setLoading(true)
      const params = new URLSearchParams()
      params.set('municipalityIds', idsParam)
      params.set('tab', 'for-sale')
      params.set('page', '1')
      params.set('pageSize', String(pageSize))
      params.set('propertyCategory', propertyCategory)
      fetch(`/api/neighbourhood-listings?${params.toString()}`)
        .then(r => r.json()).then(data => {
          setListings(data.listings || [])
          setTotalCount(data.total || 0)
          setLoading(false)
        }).catch(() => setLoading(false))
      const tabs = ['for-sale', 'for-lease', 'sold', 'leased']
      Promise.all(tabs.map(tab => {
        const p = new URLSearchParams(params)
        p.set('tab', tab); p.set('pageSize', '1')
        return fetch(`/api/neighbourhood-listings?${p.toString()}`).then(r => r.json()).then(d => d.total || 0)
      })).then(results => setCounts({ forSale: results[0], forLease: results[1], sold: results[2], leased: results[3] }))
    } else if (initialListings && initialCounts) {
      setListings(initialListings)
      setTotalCount(initialTotal || 0)
      setCounts(initialCounts)
      setInitialLoad(true)
    }
  }, [propertyCategory])

  useEffect(() => {
    if (!initialLoad) {
      setCurrentPage(1)
      fetchListings('for-sale', 1)
      fetchCounts()
      setActiveTab('for-sale')
    }
  }, [filters, advancedFilters])

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    setCurrentPage(1)
    if (!propertyCategory && !hasActiveFilters() && tab === 'for-sale' && initialLoad && initialListings) {
      setListings(initialListings)
      setTotalCount(initialTotal || 0)
    } else {
      fetchListings(tab, 1)
      setInitialLoad(false)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    fetchListings(activeTab, page)
    setInitialLoad(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const hasActiveFilters = () =>
    !!(filters.minPrice || filters.maxPrice || filters.beds !== '0' || filters.baths !== '0' || filters.sort !== 'default')

  const advancedFilterCount = [
    advancedFilters.subtypes.length > 0, advancedFilters.minSqft, advancedFilters.maxSqft,
    advancedFilters.garage !== 'any', advancedFilters.basement !== 'any',
    advancedFilters.parking !== '0', advancedFilters.locker !== 'any',
  ].filter(Boolean).length

  const getType = (): 'sale' | 'lease' =>
    activeTab === 'for-lease' || activeTab === 'leased' ? 'lease' : 'sale'

  const handleEstimateClick = (listing: MLSListing, type: 'sale' | 'lease', exactSqft: number | null) => {
    setSelectedListing(listing)
    setModalType(type === 'lease' ? 'rent' : 'sale')
    setModalExactSqft(exactSqft)
    setSelectedIsHome(isHomeProperty(listing))
    setModalOpen(true)
  }

  const tabs = [
    { key: 'for-sale' as TabType, label: 'For Sale', count: counts.forSale },
    { key: 'for-lease' as TabType, label: 'For Lease', count: counts.forLease },
    { key: 'sold' as TabType, label: 'Sold', count: counts.sold },
    { key: 'leased' as TabType, label: 'Leased', count: counts.leased },
  ]

  return (
    <div>
      <GeoQuickFilters
        filters={filters}
        onChange={(f) => { setFilters(f); setInitialLoad(false) }}
        onToggleAdvanced={() => setAdvancedOpen(!advancedOpen)}
        advancedOpen={advancedOpen}
        activeFilterCount={advancedFilterCount}
        type={activeTab === 'for-lease' || activeTab === 'leased' ? 'lease' : 'sale'}
      />
      {advancedOpen && (
        <GeoAdvancedFilters
          filters={advancedFilters}
          onChange={(f) => { setAdvancedFilters(f); setInitialLoad(false) }}
          onClose={() => setAdvancedOpen(false)}
          propertyCategory={propertyCategory}
        />
      )}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-lg" />)}
        </div>
      )}
      {!loading && listings.length > 0 && (
        <div className="relative">
          <div className={(!user && (activeTab === 'sold' || activeTab === 'leased')) ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 blur-sm pointer-events-none select-none' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'}>
          {listings.map(listing => {
            const isHome = isHomeProperty(listing)
            const currentType = getType()
            return isHome ? (
              <HomeListingCard key={listing.id} listing={listing} type={currentType}
                onEstimateClick={(sqft) => handleEstimateClick(listing, currentType, sqft)} agentId={agentId} />
            ) : (
              <GeoListingCard key={listing.id} listing={listing} type={currentType} onEstimateClick={(sqft) => handleEstimateClick(listing, currentType, sqft)} agentId={agentId} />
            )
          })}
          </div>
          {(!user && (activeTab === 'sold' || activeTab === 'leased')) && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md mx-4 text-center border border-gray-100">
                <div className="text-3xl mb-3">🔒</div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Register to See {activeTab === 'sold' ? 'Sold' : 'Leased'} Prices
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  Create a free account to access sold prices, days on market, and full transaction history.
                </p>
                <button onClick={() => setShowSoldGate(true)} className="w-full py-3 px-6 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors">
                  Create Free Account
                </button>
                <p className="text-xs text-gray-400 mt-3">No credit card required</p>
              </div>
            </div>
          )}
        </div>
      )}
      {!loading && listings.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No listings found{hasActiveFilters() || advancedFilterCount > 0 ? ' matching your filters.' : '.'}</p>
          {(hasActiveFilters() || advancedFilterCount > 0) && (
            <button onClick={() => { setFilters(DEFAULT_FILTERS); setAdvancedFilters(DEFAULT_ADVANCED) }}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium">Clear all filters</button>
          )}
        </div>
      )}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <button onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || loading}
            className="px-4 py-2 rounded-lg border disabled:opacity-50 hover:bg-gray-50 text-sm">Previous</button>
          <span className="px-4 py-2 text-sm text-gray-600">Page {currentPage} of {totalPages} ({totalCount} total)</span>
          <button onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || loading}
            className="px-4 py-2 rounded-lg border disabled:opacity-50 hover:bg-gray-50 text-sm">Next</button>
        </div>
      )}
      {!selectedIsHome && (
        <EstimatorBuyerModal isOpen={modalOpen} onClose={() => setModalOpen(false)}
          listing={selectedListing} buildingName={(selectedListing as any)?.building_name || selectedListing?.unparsed_address || ''}
          buildingId={selectedListing?.building_id || ''} type={modalType === 'rent' ? 'lease' : 'sale'}
          exactSqft={modalExactSqft} agentId={agentId} />
      )}
      {selectedIsHome && (
        <HomeEstimatorBuyerModal isOpen={modalOpen} onClose={() => setModalOpen(false)}
          listing={selectedListing} agentId={agentId} tenantId={tenantId} type={modalType} exactSqft={modalExactSqft} />
      )}
      {showSoldGate && (
        <RegisterModal
          isOpen={showSoldGate}
          onClose={() => setShowSoldGate(false)}
          onSuccess={() => setShowSoldGate(false)}
          registrationSource="walliam_sold_gate"
          agentId={agentId}
        />
      )}
    </div>
  )
}

