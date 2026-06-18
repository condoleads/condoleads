// h3 fix — single source of truth for the Competing-For-Sale fetch.
//
// Both estimator surfaces (HomeEstimatorBuyerModal — modal trigger from geo
// pages + property-page secondary CTA; HomePropertyEstimateCTA — auto-run on
// the single-property page) need IDENTICAL fetch behavior. h2-finish wired
// only the modal; the CTA stayed un-wired and the competing rail never
// rendered on /property URLs. The drift root cause: two places to keep in
// sync. This hook collapses that to one.
//
// h3 refinement: gate is now "has municipalityId" — the server-side
// findActiveCompetition branches on subject type and applies the correct
// matching criteria (plex same-subtype+LAR-adjacent vs SF funnel pipeline).
// Client doesn't decide whether to fetch by type; the server returns the
// right pool for any home subject.
'use client'

import { useState, useCallback } from 'react'
import type { CompetingListing } from '@/app/estimator/components/HomeEstimatorResults'

interface FetchParams {
  // W-CONDO-MODAL-PARITY Phase 2 (2026-06-11) — explicit path param.
  // Default 'home' preserves byte-identical behavior for every pre-Phase-2
  // caller (HomeEstimatorBuyerModal, HomePropertyEstimateCTA). The 'condo'
  // path hits the endpoint's existing condo branch (community+bed+LAR);
  // no architecturalStyle/age/subtype required.
  path?: 'home' | 'condo'
  propertySubtype?: string | null
  // h3 refinement: communityId added so the competing rail can cascade
  // community → muni → area (mirrors the sold pool's geography).
  communityId?: string | null
  municipalityId?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  livingAreaRange?: string | null
  // h3 refinement: SF funnels need style + age to match the sold-comp pool.
  architecturalStyle?: string | null
  approximateAge?: string | null
}

export function useCompetingListings() {
  const [competingListings, setCompetingListings] = useState<CompetingListing[]>([])

  const fetchCompetingListings = useCallback(async (params: FetchParams): Promise<CompetingListing[]> => {
    const path = params.path || 'home'
    // Gate per path:
    //   HOME : needs propertySubtype + municipalityId (unchanged from pre-Phase-2)
    //   CONDO: needs communityId + bedrooms (matches the endpoint's condo branch)
    if (path === 'home') {
      const subtype = params.propertySubtype?.trim() || null
      if (!subtype || !params.municipalityId) {
        setCompetingListings([])
        return []
      }
    } else {
      if (!params.communityId || params.bedrooms == null) {
        setCompetingListings([])
        return []
      }
    }
    try {
      const res = await fetch('/api/charlie/competing-listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          communityId: params.communityId,
          municipalityId: params.municipalityId,
          bedrooms: params.bedrooms,
          bathrooms: params.bathrooms,
          livingAreaRange: params.livingAreaRange,
          propertySubtype: params.propertySubtype?.trim() || null,
          architecturalStyle: params.architecturalStyle,
          approximateAge: params.approximateAge,
        }),
      })
      const d = await res.json()
      if (d?.success && Array.isArray(d.listings)) {
        const listings = d.listings as CompetingListing[]
        setCompetingListings(listings)
        return listings
      } else {
        setCompetingListings([])
        return []
      }
    } catch (err) {
      console.error('competing-listings fetch failed:', err)
      setCompetingListings([])
      return []
    }
  }, [])

  const resetCompetingListings = useCallback(() => setCompetingListings([]), [])

  return { competingListings, fetchCompetingListings, resetCompetingListings }
}
