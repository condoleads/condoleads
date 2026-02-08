'use client'

import { useState, useEffect } from 'react'
import BuildingCard from './BuildingCard'

interface Building {
  id: string
  building_name: string
  slug: string
  canonical_address: string
  cover_photo_url: string | null
  total_units: number | null
  year_built: number | null
}

interface BuildingsGridProps {
  initialBuildings: Building[]
  totalBuildings: number
  geoType: 'community' | 'municipality' | 'area'
  geoId: string
  title: string
  pageSize?: number
}

export default function BuildingsGrid({
  initialBuildings = [],
  totalBuildings = 0,
  geoType,
  geoId,
  title,
  pageSize = 20,
}: BuildingsGridProps) {
  const [buildings, setBuildings] = useState<Building[]>(initialBuildings)
  const [total, setTotal] = useState(totalBuildings)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [initialPageLoaded, setInitialPageLoaded] = useState(true)

  const totalPages = Math.ceil(total / pageSize)

  const fetchBuildings = async (page: number) => {
    setLoading(true)
    try {
      const res = await fetch(
        '/api/geo-buildings?geoType=' + geoType + '&geoId=' + geoId + '&page=' + page + '&pageSize=' + pageSize
      )
      const data = await res.json()
      setBuildings(data.buildings || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to fetch buildings:', err)
    } finally {
      setLoading(false)
    }
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    if (page === 1 && initialPageLoaded) {
      setBuildings(initialBuildings)
      setTotal(totalBuildings)
    } else {
      fetchBuildings(page)
      if (page !== 1) setInitialPageLoaded(false)
    }
  }

  useEffect(() => {
    if (initialBuildings.length === 0 && totalBuildings > 0) {
      fetchBuildings(1)
    }
  }, [])

  if (total === 0 && !loading) return null

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">{title} ({total})</h2>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-48 bg-gray-100 animate-pulse rounded-lg" />
          ))}
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {buildings.map((b) => (
            <BuildingCard key={b.id} building={b} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <button
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1 || loading}
            className="px-4 py-2 rounded-lg border disabled:opacity-50 hover:bg-gray-50 text-sm">
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-gray-600">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages || loading}
            className="px-4 py-2 rounded-lg border disabled:opacity-50 hover:bg-gray-50 text-sm">
            Next
          </button>
        </div>
      )}
    </div>
  )
}