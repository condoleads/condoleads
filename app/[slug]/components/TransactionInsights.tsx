'use client'

import { useState } from 'react'
import { MLSListing } from '@/lib/types/building'
import { formatPrice, formatPriceShort } from '@/lib/utils/formatters'

interface TransactionInsightsProps {
  activeSales: MLSListing[]
  closedSales: MLSListing[]
  activeRentals: MLSListing[]
  closedRentals: MLSListing[]
  totalUnits: number | null
}

interface BedroomStats {
  priceMin: number | null
  priceMax: number | null
  avgDays: number | null
  ratio: number
  count: number
}

export default function TransactionInsights({
  activeSales = [],
  closedSales = [],
  activeRentals = [],
  closedRentals = [],
  totalUnits = 0,
}: TransactionInsightsProps) {
  const [activeTab, setActiveTab] = useState<'sale' | 'rent'>('sale')


  const calculateStats = (listings: MLSListing[]): Map<number, BedroomStats> => {
    const statsMap = new Map<number, BedroomStats>()
    
    listings.forEach(listing => {
      const beds = listing.bedrooms_total
      if (!statsMap.has(beds)) {
        statsMap.set(beds, {
          priceMin: null,
          priceMax: null,
          avgDays: null,
          ratio: 0,
          count: 0,
        })
      }
      
      const stats = statsMap.get(beds)!
      stats.count++
      
      if (listing.list_price) {
        stats.priceMin = stats.priceMin === null ? listing.list_price : Math.min(stats.priceMin, listing.list_price)
        stats.priceMax = stats.priceMax === null ? listing.list_price : Math.max(stats.priceMax, listing.list_price)
      }
    })
    
    // Calculate ratios
    const totalCount = Array.from(statsMap.values()).reduce((sum, s) => sum + s.count, 0)
    statsMap.forEach(stats => {
      stats.ratio = totalCount > 0 ? (stats.count / totalCount) * 100 : 0
    })
    
    return statsMap
  }

  const calculateAvgDays = (listings: MLSListing[]): Map<number, number> => {
    const daysMap = new Map<number, number[]>()
    
    listings.forEach(listing => {
      if (listing.days_on_market !== null && listing.days_on_market !== undefined) {
        if (!daysMap.has(listing.bedrooms_total)) {
          daysMap.set(listing.bedrooms_total, [])
        }
        daysMap.get(listing.bedrooms_total)!.push(listing.days_on_market)
      }
    })
    
    const avgMap = new Map<number, number>()
    daysMap.forEach((days, beds) => {
      avgMap.set(beds, Math.round(days.reduce((a, b) => a + b, 0) / days.length))
    })
    
    return avgMap
  }

  const saleStats = calculateStats([...closedSales, ...activeSales])
  const rentStats = calculateStats([...closedRentals, ...activeRentals])
  const saleDays = calculateAvgDays(closedSales)
  const rentDays = calculateAvgDays(closedRentals)

  const currentStats = activeTab === 'sale' ? saleStats : rentStats
  const currentDays = activeTab === 'sale' ? saleDays : rentDays

  // Define bedroom types to display
  const bedroomTypes = [
    { beds: 0, label: 'Studio' },
    { beds: 1, label: '1 Bed' },
    { beds: 2, label: '2 Bed' },
    { beds: 3, label: '3 Bed' },
    { beds: 4, label: '4 Bed' },
  ]

  return (
    <section className="max-w-7xl mx-auto px-6 mb-20">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        {/* Header with tabs */}
        <div className="border-b border-slate-200 p-6">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Transaction Insights</h2>
          <p className="text-lg text-slate-600 mb-4">Transaction Insights At X2 Condos</p>
          
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('sale')}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                activeTab === 'sale'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Sale
            </button>
            <button
              onClick={() => setActiveTab('rent')}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                activeTab === 'rent'
                  ? 'bg-cyan-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Rent
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700 text-white">
              <tr>
                <th className="px-6 py-4 text-left font-semibold"></th>
                {bedroomTypes.map(type => (
                  <th key={type.beds} className="px-6 py-4 text-center font-semibold">
                    {type.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Price Range Row */}
              <tr className="border-b border-slate-200">
                <td className="px-6 py-4 bg-slate-700 text-white font-semibold">
                  Price Range
                </td>
                {bedroomTypes.map(type => {
                  const stats = currentStats.get(type.beds)
                  return (
                    <td key={type.beds} className="px-6 py-4 text-center">
                      {stats && stats.priceMin && stats.priceMax ? (
                        activeTab === 'sale' ? (
                          <span className="font-medium">
                            {formatPriceShort(stats.priceMin)} - {formatPriceShort(stats.priceMax)}
                          </span>
                        ) : (
                          <span className="font-medium">
                            ${stats.priceMin.toLocaleString()} - ${stats.priceMax.toLocaleString()}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-400">No Data </span>
                      )}
                    </td>
                  )
                })}
              </tr>

              {/* Avg Wait for Unit Availability Row */}
              <tr className="border-b border-slate-200 bg-slate-50">
                <td className="px-6 py-4 bg-slate-700 text-white font-semibold">
                  Avg. Wait for Unit Availability
                </td>
                {bedroomTypes.map(type => {
                  const days = currentDays.get(type.beds)
                  return (
                    <td key={type.beds} className="px-6 py-4 text-center">
                      {days ? (
                        <span className="font-medium">{days} Days</span>
                      ) : (
                        <span className="text-slate-400">No Data </span>
                      )}
                    </td>
                  )
                })}
              </tr>

              {/* Ratio of Units in Building Row */}
              <tr>
                <td className="px-6 py-4 bg-slate-700 text-white font-semibold">
                  Ratio of Units in Building
                </td>
                {bedroomTypes.map(type => {
                  const stats = currentStats.get(type.beds)
                  return (
                    <td key={type.beds} className="px-6 py-4 text-center">
                      {stats && stats.ratio > 0 ? (
                        <span className="font-medium">{stats.ratio.toFixed(0)}%</span>
                      ) : (
                        <span className="text-slate-400"></span>
                      )}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

