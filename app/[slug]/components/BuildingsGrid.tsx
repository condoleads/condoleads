'use client'
import { useState, useEffect } from 'react'
import GeoBuildingCard from './GeoBuildingCard'
import { ChevronDown, Building2 } from 'lucide-react'

interface Building {
  id: string
  building_name: string
  slug: string
  canonical_address: string
  cover_photo_url: string | null
  gallery_photos: string[]
  total_units: number | null
  year_built: number | null
  forSale: number
  forLease: number
}

interface BuildingsGridProps {
  initialBuildings?: Building[]
  totalBuildings: number
  geoType: 'community' | 'municipality' | 'area'
  geoId: string
  title?: string
  pageSize?: number
}

export default function BuildingsGrid({
  initialBuildings,
  totalBuildings,
  geoType,
  geoId,
  title = 'Buildings',
  pageSize = 12,
}: BuildingsGridProps) {
  const [buildings, setBuildings] = useState<Building[]>(initialBuildings || [])
  const [loading, setLoading] = useState(!initialBuildings || initialBuildings.length === 0)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(totalBuildings)
  const [loadingMore, setLoadingMore] = useState(false)

  const hasMore = buildings.length < total

  const fetchBuildings = async (p: number, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const res = await fetch(
        `/api/geo-buildings?geoType=${geoType}&geoId=${geoId}&page=${p}&pageSize=${pageSize}`
      )
      const data = await res.json()
      if (append) {
        setBuildings(prev => [...prev, ...(data.buildings || [])])
      } else {
        setBuildings(data.buildings || [])
      }
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to fetch buildings:', err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (!initialBuildings || initialBuildings.length === 0) {
      fetchBuildings(1)
    }
  }, [geoType, geoId])

  const loadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchBuildings(nextPage, true)
  }

  if (total === 0 && !loading) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-blue-600" />
          {title}
          <span className="text-sm font-normal text-gray-500 ml-1">({total})</span>
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="aspect-[4/3] bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-3 bg-gray-200 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {buildings.map(b => (
              <GeoBuildingCard key={b.id} building={b} />
            ))}
          </div>

          {hasMore && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50"
              >
                {loadingMore ? (
                  <>
                    <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    Show More Buildings ({total - buildings.length} remaining)
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}