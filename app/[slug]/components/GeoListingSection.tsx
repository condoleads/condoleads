'use client'

import { useState, useEffect, useCallback } from 'react'
import { MLSListing } from '@/lib/types/building'
import ListingCard from './ListingCard'
import HomeListingCard from './HomeListingCard'
import EstimatorBuyerModal from '@/app/estimator/components/EstimatorBuyerModal'
import HomeEstimatorBuyerModal from '@/app/estimator/components/HomeEstimatorBuyerModal'
import GeoQuickFilters, { FilterState } from './GeoQuickFilters'
import GeoAdvancedFilters, { AdvancedFilterState } from './GeoAdvancedFilters'

interface GeoListingSectionProps {
  initialListings?: MLSListing[]
  initialTotal?: number
  counts?: { forSale: number; forLease: number; sold: number; leased: number }
  geoType: 'community' | 'municipality' | 'area'
  geoId: string
  agentId: string
  pageSize?: number
  propertyCategory?: 'condo' | 'homes'
}

type TabType = 'for-sale' | 'for-lease' | 'sold' | 'leased'

const isHomeProperty = (listing: MLSListing) => {
  return listing.property_type === 'Residential Freehold' ||
    (!listing.building_id && ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'].some(t => listing.property_subtype?.trim() === t))
}

const DEFAULT_FILTERS: FilterState = { minPrice: '', maxPrice: '', beds: '0', baths: '0', sort: 'default' }
const DEFAULT_ADVANCED: AdvancedFilterState = { subtypes: [], minSqft: '', maxSqft: '', garage: 'any', basement: 'any', parking: '0', locker: 'any' }

export default function GeoListingSection({
  initialListings,
  initialTotal,
  counts: initialCounts,
  geoType,
  geoId,
  agentId,
  pageSize = 24,
  propertyCategory,
}: GeoListingSectionProps) {
  const [activeTab, setActiveTab] = useState<TabType>('for-sale')
  const [currentPage, setCurrentPage] = useState(1)
  const [listings, setListings] = useState<MLSListing[]>(initialListings || [])
  const [totalCount, setTotalCount] = useState(initialTotal || 0)
  const [loading, setLoading] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [counts, setCounts] = useState(initialCounts || { forSale: 0, forLease: 0, sold: 0, leased: 0 })

  // Filter state
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilterState>(DEFAULT_ADVANCED)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Estimator modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<MLSListing | null>(null)
  const [modalType, setModalType] = useState<'sale' | 'rent'>('sale')
  const [modalExactSqft, setModalExactSqft] = useState<number | null>(null)
  const [selectedIsHome, setSelectedIsHome] = useState(false)

  const totalPages = Math.ceil(totalCount / pageSize)

  const buildUrl = useCallback((tab: TabType, page: number) => {
    const params = new URLSearchParams()
    params.set('geoType', geoType)
    params.set('geoId', geoId)
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
    if (advancedFilters.garage && advancedFilters.garage !== 'any') params.set('garage', advancedFilters.garage)
    if (advancedFilters.basement && advancedFilters.basement !== 'any') params.set('basement', advancedFilters.basement)
    if (advancedFilters.parking && advancedFilters.parking !== '0') params.set('parking', advancedFilters.parking)
    if (advancedFilters.locker && advancedFilters.locker !== 'any') params.set('locker', advancedFilters.locker)
    return `/api/geo-listings?${params.toString()}`
  }, [geoType, geoId, pageSize, propertyCategory, filters, advancedFilters])

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
            .then(r => r.json())
            .then(d => d.total || 0)
        )
      )
      setCounts({ forSale: results[0], forLease: results[1], sold: results[2], leased: results[3] })
    } catch (err) {
      console.error('Failed to fetch counts:', err)
    }
  }

  // On category change — fresh fetch immediately
  useEffect(() => {
    if (propertyCategory) {
      setFilters(DEFAULT_FILTERS)
      setAdvancedFilters(DEFAULT_ADVANCED)
      setActiveTab('for-sale')
      setCurrentPage(1)
      setInitialLoad(false)
      // Fetch immediately
      setLoading(true)
      const params = new URLSearchParams()
      params.set('geoType', geoType)
      params.set('geoId', geoId)
      params.set('tab', 'for-sale')
      params.set('page', '1')
      params.set('pageSize', String(pageSize))
      params.set('propertyCategory', propertyCategory)
      const url = `/api/geo-listings?${params.toString()}`
      fetch(url).then(r => r.json()).then(data => {
        setListings(data.listings || [])
        setTotalCount(data.total || 0)
        setLoading(false)
      }).catch(() => setLoading(false))
      // Fetch counts
      const tabs = ['for-sale', 'for-lease', 'sold', 'leased']
      Promise.all(
        tabs.map(tab => {
          const p = new URLSearchParams(params)
          p.set('tab', tab)
          p.set('pageSize', '1')
          return fetch(`/api/geo-listings?${p.toString()}`).then(r => r.json()).then(d => d.total || 0)
        })
      ).then(results => {
        setCounts({ forSale: results[0], forLease: results[1], sold: results[2], leased: results[3] })
      })
    } else if (initialListings && initialCounts) {
      setListings(initialListings)
      setTotalCount(initialTotal || 0)
      setCounts(initialCounts)
      setInitialLoad(true)
    }
  }, [propertyCategory])

  // On filter/advanced change — re-fetch
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

  const hasActiveFilters = () => {
    return filters.minPrice || filters.maxPrice || filters.beds !== '0' || filters.baths !== '0' || filters.sort !== 'default'
  }

  const advancedFilterCount = [
    advancedFilters.subtypes.length > 0,
    advancedFilters.minSqft,
    advancedFilters.maxSqft,
    advancedFilters.garage !== 'any',
    advancedFilters.basement !== 'any',
    advancedFilters.parking !== '0',
    advancedFilters.locker !== 'any',
  ].filter(Boolean).length

  const getType = (): 'sale' | 'lease' => {
    return activeTab === 'for-lease' || activeTab === 'leased' ? 'lease' : 'sale'
  }

  const handleEstimateClick = (listing: MLSListing, type: 'sale' | 'lease', exactSqft: number | null) => {
    const isHome = isHomeProperty(listing)
    setSelectedListing(listing)
    setModalType(type === 'lease' ? 'rent' : 'sale')
    setModalExactSqft(exactSqft)
    setSelectedIsHome(isHome)
    setModalOpen(true)
  }

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'for-sale', label: 'For Sale', count: counts.forSale },
    { key: 'for-lease', label: 'For Lease', count: counts.forLease },
    { key: 'sold', label: 'Sold', count: counts.sold },
    { key: 'leased', label: 'Leased', count: counts.leased },
  ]

  return (
    <div>
      {/* Quick Filters */}
      <GeoQuickFilters
        filters={filters}
        onChange={(f) => { setFilters(f); setInitialLoad(false) }}
        onToggleAdvanced={() => setAdvancedOpen(!advancedOpen)}
        advancedOpen={advancedOpen}
        activeFilterCount={advancedFilterCount}
        type={activeTab === 'for-lease' || activeTab === 'leased' ? 'lease' : 'sale'}
      />

      {/* Advanced Filters */}
      {advancedOpen && (
        <GeoAdvancedFilters
          filters={advancedFilters}
          onChange={(f) => { setAdvancedFilters(f); setInitialLoad(false) }}
          onClose={() => setAdvancedOpen(false)}
          propertyCategory={propertyCategory}
        />
      )}

      {/* Status Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {/* Listings Grid */}
      {!loading && listings.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing) => {
            const isHome = isHomeProperty(listing)
            const currentType = getType()
            return isHome ? (
              <HomeListingCard
                key={listing.id}
                listing={listing}
                type={currentType}
                onEstimateClick={(exactSqft) => handleEstimateClick(listing, currentType, exactSqft)}
                agentId={agentId}
              />
            ) : (
              <ListingCard
                key={listing.id}
                listing={listing}
                type={currentType}
                onEstimateClick={(exactSqft) => handleEstimateClick(listing, currentType, exactSqft)}
                agentId={agentId}
              />
            )
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && listings.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No listings found{hasActiveFilters() || advancedFilterCount > 0 ? ' matching your filters.' : '.'}</p>
          {(hasActiveFilters() || advancedFilterCount > 0) && (
            <button
              onClick={() => { setFilters(DEFAULT_FILTERS); setAdvancedFilters(DEFAULT_ADVANCED) }}
              className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <button
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || loading}
            className="px-4 py-2 rounded-lg border disabled:opacity-50 hover:bg-gray-50 text-sm">
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            Page {currentPage} of {totalPages} ({totalCount} total)
          </span>
          <button
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || loading}
            className="px-4 py-2 rounded-lg border disabled:opacity-50 hover:bg-gray-50 text-sm">
            Next
          </button>
        </div>
      )}

      {/* Condo Estimator Modal */}
      {!selectedIsHome && (
        <EstimatorBuyerModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          listing={selectedListing}
          buildingName={(selectedListing as any)?.building_name || selectedListing?.unparsed_address || ''}
          buildingId={selectedListing?.building_id || ''}
          type={modalType === 'rent' ? 'lease' : 'sale'}
          exactSqft={modalExactSqft}
          agentId={agentId}
        />
      )}

      {/* Home Estimator Modal */}
      {selectedIsHome && (
        <HomeEstimatorBuyerModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          listing={selectedListing}
          agentId={agentId}
          type={modalType}
          exactSqft={modalExactSqft}
        />
      )}
    </div>
  )
}