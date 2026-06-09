'use client'

import { useState, useEffect } from 'react'
import { estimateHomeSale } from '@/app/estimator/actions/estimate-home-sale'
import { EstimateResult } from '@/lib/estimator/types'
import HomeEstimatorResults from '@/app/estimator/components/HomeEstimatorResults'
import { extractExactSqft } from '@/lib/estimator/types'
import type { HomeSpecs } from '@/lib/estimator/home-comparable-matcher-sales'
import { useCompetingListings } from '@/app/estimator/hooks/useCompetingListings'

interface HomePropertyEstimateCTAProps {
  listing: any
  isSale: boolean
  agentId: string
}

export default function HomePropertyEstimateCTA({ listing, isSale, agentId }: HomePropertyEstimateCTAProps) {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const exactSqft = extractExactSqft(listing.square_foot_source)

  // h3 fix — Competing-For-Sale fetch (shared hook with HomeEstimatorBuyerModal).
  // Plex-only — SF subjects never hit the fetch. This component is the
  // auto-run estimator on /property URLs; previously the competing rail
  // never populated here because the fetch was wired only to the modal.
  const { competingListings, fetchCompetingListings } = useCompetingListings()

  useEffect(() => {
    // Only estimate for sale listings (rent estimation not yet built for homes)
    if (!isSale) {
      setLoading(false)
      return
    }

    const runEstimate = async () => {
      setLoading(true)
      setError(null)

      // h5: subject street threading (street-level matching activation).
      const streetNumParsed = parseInt(listing.street_number, 10)
      const specs: HomeSpecs = {
        bedrooms: listing.bedrooms_total || 0,
        bathrooms: parseFloat(listing.bathrooms_total_integer) || 0,
        propertySubtype: listing.property_subtype || listing.property_subtype || 'Detached',
        communityId: listing.community_id || null,
        municipalityId: listing.municipality_id || null,
        livingAreaRange: listing.living_area_range || '',
        exactSqft: exactSqft,
        parking: listing.parking_total || 0,
        lotWidth: listing.lot_width ? parseFloat(listing.lot_width) : null,
        lotDepth: listing.lot_depth ? parseFloat(listing.lot_depth) : null,
        // h6: lot_size_units drives metres→feet normalization in the matcher.
        lotSizeUnits: listing.lot_size_units || null,
        garageType: listing.garage_type || null,
        basementRaw: listing.basement || null,
        poolFeatures: listing.pool_features || null,
        architecturalStyle: listing.architectural_style?.[0] || null,
        approximateAge: listing.approximate_age || null,
        agentId: agentId,
        ...(listing.street_name ? { subjectStreetName: listing.street_name } : {}),
        ...(!Number.isNaN(streetNumParsed) ? { subjectStreetNumber: streetNumParsed } : {}),
        // h8: subject tax for tax-similarity score band (silent-omit when missing)
        ...(listing.tax_annual_amount != null ? { subjectTaxAnnualAmount: parseFloat(String(listing.tax_annual_amount)) } : {}),
        ...(listing.tax_year != null ? { subjectTaxYear: parseInt(String(listing.tax_year), 10) } : {}),
      }

      try {
        const response = await estimateHomeSale(specs, false)
        if (response.success && response.data) {
          setResult(response.data)
          // h3 refinement — Competing-For-Sale fetch. The server's
          // findActiveCompetition mirrors the sold-comp matching for the
          // subject's type (plex axis or SF funnel). Thread the full
          // specs the matcher needs.
          fetchCompetingListings({
            propertySubtype: listing.property_subtype,
            communityId: listing.community_id,
            municipalityId: listing.municipality_id,
            bedrooms: specs.bedrooms,
            bathrooms: specs.bathrooms,
            livingAreaRange: specs.livingAreaRange,
            architecturalStyle: specs.architecturalStyle,
            approximateAge: specs.approximateAge,
          })
        } else {
          setError(response.error || 'Failed to calculate estimate')
        }
      } catch (err) {
        setError('Failed to load estimate')
      }
      setLoading(false)
    }

    runEstimate()
  }, [listing, isSale, exactSqft, agentId, fetchCompetingListings])

  if (!isSale) return null

  if (loading) {
    return (
      <div className="bg-slate-50 border-2 border-slate-200 rounded-xl p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-2/3 mb-4"></div>
          <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
          <div className="h-4 bg-slate-200 rounded w-3/4 mb-4"></div>
          <div className="h-12 bg-slate-200 rounded w-full"></div>
        </div>
        <p className="text-center text-slate-500 mt-4">Calculating home estimate...</p>
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
      <HomeEstimatorResults
        result={result}
        type="sale"
        buildingId=""
        buildingName={listing.unparsed_address || ''}
        buildingAddress={listing.unparsed_address || ''}
        unitNumber=""
        agentId={agentId}
        listingId={listing.id}
        subjectSubtype={listing.property_subtype?.trim() || null}
        subjectNoi={(listing as any).net_operating_income}
        subjectListPrice={listing.list_price}
        competingListings={competingListings}
        propertySpecs={{
          bedrooms: listing.bedrooms_total,
          bathrooms: parseFloat(listing.bathrooms_total_integer) || 0,
          livingAreaRange: listing.living_area_range,
          parking: listing.parking_total,
          locker: null
        }}
      />
    )
  }

  return null
}
