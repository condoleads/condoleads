'use client'
import { useState, useEffect } from 'react'
import { MLSListing } from '@/lib/types/building'
import { extractExactSqft } from '@/lib/estimator/types'
import { estimateSale } from '@/app/estimator/actions/estimate-sale'
import { estimateRent } from '@/app/estimator/actions/estimate-rent'
// c1 (2026-06-10): tenant-gated S2 condo lease entry. When tenantId is
// present AND the request is LEASE, route to the new System 2 condo
// matcher (geo cascade + segmentation). All other paths (sale, S1 lease)
// continue calling the existing shared estimateSale/estimateRent unchanged.
import { estimateCondoRent } from '@/app/estimator/actions/estimate-condo-rent'
// c2 (2026-06-10): tenant-gated S2 condo SALE entry. Same additive pattern
// as c1 but for the SALE path — building cascade + tax band + maint-PSF.
import { estimateCondoSale } from '@/app/estimator/actions/estimate-condo-sale'
import EstimatorResults from '@/app/estimator/components/EstimatorResults'
import { EstimateResult } from '@/lib/estimator/types'
// W-CONDO-MODAL-PARITY Phase 2 follow-up (2026-06-11) — wire the condo
// Competing-For-Sale rail into the sidebar. The rail JSX shipped with
// 4ac9a46 in EstimatorResults, and useCompetingListings already carries
// the path:'condo' branch; the sidebar caller just never called the hook.
// Mirror of HomePropertyEstimateCTA's wiring.
import { useCompetingListings } from '@/app/estimator/hooks/useCompetingListings'

interface PropertyEstimateCTAProps {
  listing: MLSListing
  status: 'Active' | 'Closed'
  isSale: boolean
  buildingName: string
  buildingAddress?: string
  buildingSlug?: string
  agentId: string
  // c1: optional tenantId from the page; when present we route LEASE
  // requests to the new S2 condo matcher. SALE path unchanged (c2 work).
  tenantId?: string
}

export default function PropertyEstimateCTA({ listing, status, isSale, buildingName, buildingAddress, buildingSlug, agentId, tenantId }: PropertyEstimateCTAProps) {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<EstimateResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  // W-CONDO-MODAL-PARITY Phase 2 follow-up — condo Competing-For-Sale rail.
  const { competingListings, fetchCompetingListings, resetCompetingListings } = useCompetingListings()

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
        ...(listing.association_fee && { associationFee: listing.association_fee }),
        // W-CONDO-MODAL-PARITY Phase 1-FIX (2026-06-11): h8 tax-similarity
        // band on the condo SALE matcher was inert in production because
        // these two fields were never threaded from the production caller —
        // mirror of HomePropertyEstimateCTA.tsx:64-66. Silent-omit when missing.
        ...(listing.tax_annual_amount != null ? { subjectTaxAnnualAmount: parseFloat(String(listing.tax_annual_amount)) } : {}),
        ...(listing.tax_year != null ? { subjectTaxYear: parseInt(String(listing.tax_year), 10) } : {}),
      }
      

      try {
        // c1/c2 (2026-06-10): tenant-gated branches.
        //   SALE + tenantId  → estimateCondoSale (c2 S2 condo SALE matcher)
        //   SALE + !tenantId → estimateSale (shared, unchanged — S1 path)
        //   LEASE + tenantId → estimateCondoRent (c1 S2 condo LEASE matcher)
        //   LEASE + !tenantId → estimateRent (shared, unchanged — S1 path)
        // Null-tenant paths are byte-identical to pre-c1/c2 behavior.
        let response
        if (isSale && tenantId) {
          response = await estimateCondoSale({ ...specs, tenantId }, false)
        } else if (isSale) {
          response = await estimateSale(specs, false)
        } else if (tenantId) {
          response = await estimateCondoRent({ ...specs, tenantId }, false)
        } else {
          response = await estimateRent(specs, false)
        }

        if (response.success && response.data) {
          setResult(response.data)
          // W-CONDO-MODAL-PARITY Phase 2 follow-up — fire the condo
          // Competing-For-Sale fetch only on the S2 condo path (same gate
          // that selected estimateCondoSale/estimateCondoRent above —
          // tenantId presence). S1 callers (null tenant) leave the rail
          // empty, byte-identical to pre-Phase-2 behavior. Endpoint condo
          // branch is community-scoped + bedroom-filtered + limit 10 —
          // no relation to the unbounded Bronze area query (BRONZE-TIMEOUT
          // named-open).
          if (tenantId && (listing as any).community_id && listing.bedrooms_total != null) {
            fetchCompetingListings({
              path: 'condo',
              communityId: (listing as any).community_id,
              bedrooms: listing.bedrooms_total,
              livingAreaRange: listing.living_area_range || null,
            })
          } else {
            resetCompetingListings()
          }
        } else {
          setError(response.error || 'Failed to calculate estimate')
        }
      } catch (err) {
        setError('Failed to load estimate')
      }

      setLoading(false)
    }

    runEstimate()
    // Stable primitive deps: listing.id is the SUBJECT identity. The parent
    // passes listing as {...listing, buildings: building} — a new object literal
    // every render — so depending on the whole `listing` object re-fired this
    // effect on every parent state toggle (Book a Visit, modals, sticky bar)
    // and re-CALLED estimateCondoSale. listing.id is a string primitive, stable
    // across the parent's spread re-renders for the same subject, so the
    // estimate fires once per subject and re-fires only on genuine subject
    // navigation. All listing.* fields read inside the effect are subject-tied
    // (bedrooms, tax, community_id, etc.) — they don't change without id
    // changing, so dropping the whole-object dep is safe.
  }, [listing.id, isSale, buildingSlug, exactSqft])

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
        competingListings={competingListings}
      />
    )
  }

  return null
}