'use client'
import { useState, useEffect } from 'react'
import { MLSListing } from '@/lib/types/building'
import { extractExactSqft } from '@/lib/estimator/types'
import { estimateSale } from '@/app/estimator/actions/estimate-sale'
import { estimateRent } from '@/app/estimator/actions/estimate-rent'
import EstimatorResults from '@/app/estimator/components/EstimatorResults'
import { EstimateResult } from '@/lib/estimator/types'

interface PropertyEstimateCTAProps {
  listing: MLSListing
  status: 'Active' | 'Closed'
  isSale: boolean
  buildingName: string
  buildingAddress?: string
  buildingSlug?: string
  agentId: string
}

export default function PropertyEstimateCTA({ listing, status, isSale, buildingName, buildingAddress, buildingSlug, agentId }: PropertyEstimateCTAProps) {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exactSqft = extractExactSqft(listing.square_foot_source)

  useEffect(() => {
    const runEstimate = async () => {
      setLoading(true)
      setError(null)

      const specs = {
        bedrooms: listing.bedrooms_total || 0,
        bathrooms: listing.bathrooms_total_integer || 0,
        livingAreaRange: listing.living_area_range || '',
        parking: listing.parking_total || 0,
        hasLocker: !!(listing.locker && listing.locker !== 'None'),
        buildingId: listing.building_id,
        buildingSlug: buildingSlug,
        ...(exactSqft !== null && { exactSqft }),
        ...(listing.association_fee && { associationFee: listing.association_fee })
      }
      

      try {
        const response = isSale
          ? await estimateSale(specs, true)
          : await estimateRent(specs, true)

        if (response.success && response.data) {
          setResult(response.data)
        } else {
          setError(response.error || 'Failed to calculate estimate')
        }
      } catch (err) {
        setError('Failed to load estimate')
      }

      setLoading(false)
    }

    runEstimate()
  }, [listing, isSale, buildingSlug, exactSqft])

  if (loading) {
    return (
      <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-2/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
          <div className="h-12 bg-slate-200 rounded w-full"></div>
        </div>
        <p className="text-center text-slate-500 mt-4">Calculating estimate...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
        <h3 className="text-xl font-bold text-red-900 mb-2">Estimate Unavailable</h3>
        <p className="text-sm text-red-600">{error}</p>
      </div>
    )
  }

  if (result) {
    return (
      <EstimatorResults
        result={result}
        type={isSale ? 'sale' : 'lease'}
        buildingId={listing.building_id}
        buildingName={buildingName}
        buildingAddress={buildingAddress}
        unitNumber={listing.unit_number || ''}
        agentId={agentId}
        propertySpecs={{
          bedrooms: listing.bedrooms_total,
          bathrooms: listing.bathrooms_total_integer,
          livingAreaRange: listing.living_area_range,
          parking: listing.parking_total,
          locker: listing.locker
        }}
      />
    )
  }

  return null
}