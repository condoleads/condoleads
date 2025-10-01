﻿'use client'

import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import ListingCard from './ListingCard'

interface ListingSectionProps {
  activeSales: MLSListing[]
  activeRentals: MLSListing[]
  closedSales: MLSListing[]
  closedRentals: MLSListing[]
}

type TabType = 'for-sale' | 'for-lease' | 'sold' | 'leased'

export default function ListingSection({
  activeSales = [],
  activeRentals = [],
  closedSales = [],
  closedRentals = [],
}: ListingSectionProps) {
  const [activeTab, setActiveTab] = useState<TabType>('for-sale')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 6

  const tabs = [
    { id: 'for-sale' as TabType, label: 'For Sale', count: activeSales?.length || 0, data: activeSales || [] },
    { id: 'for-lease' as TabType, label: 'For Lease', count: activeRentals?.length || 0, data: activeRentals || [] },
    { id: 'sold' as TabType, label: 'Sold', count: closedSales?.length || 0, data: closedSales || [] },
    { id: 'leased' as TabType, label: 'Leased', count: closedRentals?.length || 0, data: closedRentals || [] },
  ]

  const currentData = tabs.find(tab => tab.id === activeTab)?.data || []
  const isSaleTab = activeTab === 'for-sale' || activeTab === 'sold'

  // Reset to page 1 when tab changes
  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId)
    setCurrentPage(1)
  }

  // Pagination calculations
  const totalPages = Math.ceil(currentData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedData = currentData.slice(startIndex, endIndex)

  return (
    <>
      <section className="py-20 bg-gradient-to-br from-emerald-700 via-teal-600 to-emerald-700 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}></div>
        </div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <h2 className="text-5xl font-black text-white text-center mb-4">Browse Properties</h2>
          <p className="text-xl text-emerald-50 text-center mb-12">Explore available units and recent transactions</p>
          
          <div className="flex justify-center gap-6 mb-8 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-12 py-6 text-2xl font-black rounded-2xl transition-all duration-300 ${
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
        {paginatedData.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {paginatedData.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  type={isSaleTab ? 'sale' : 'rent'}
                />
              ))}
            </div>

            {/* Pagination Controls */}
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
            <p className="text-xl text-slate-500">No listings available in this category.</p>
          </div>
        )}
      </section>
    </>
  )
}
