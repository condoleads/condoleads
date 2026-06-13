// app/charlie/components/SellerEstimateRunner.tsx
'use client'
import { useEffect, useState, useRef } from 'react'
// C-ENHANCE-1-DATA (2026-06-13): switch condo path to S2 matchers so result
// .data carries tiers + bestGeoTier + taxMatch (the S1 estimateSale/Rent
// returned none of these). Charlie is the ONLY non-estimator importer of S1
// estimateSale/Rent — verified C-ENHANCE-PREFLIGHT, no other-caller impact.
// estimateCondoSale's CondoSaleSpecs extends UnitSpecs (all new fields
// optional) and its return is a strict superset of estimateSale's — drop-in.
import { estimateCondoSale } from '@/app/estimator/actions/estimate-condo-sale'
import { estimateCondoRent } from '@/app/estimator/actions/estimate-condo-rent'
import { estimateHomeSale } from '@/app/estimator/actions/estimate-home-sale'
import { estimateHomeRent } from '@/app/estimator/actions/estimate-home-rent'
import type { CondoSaleSpecs } from '@/lib/estimator/condo-comparable-matcher-sales'
import type { CondoLeaseSpecs } from '@/lib/estimator/condo-comparable-matcher-rentals'
import type { HomeSpecs } from '@/lib/estimator/home-comparable-matcher-sales'
import { supabase } from '@/lib/supabase/client'


async function fetchMediaForComparables(listingKeys: string[]) {
  if (!listingKeys.length) return {}
  // singleton -- W-PROPERTY-HYDRATION root cause 1
  const { data: listings } = await supabase
    .from('mls_listings')
    .select('id, listing_key')
    .in('listing_key', listingKeys)
  if (!listings?.length) return {}
  const idToKey: Record<string, string> = {}
  listings.forEach((l: any) => { idToKey[l.id] = l.listing_key })
  const { data: media } = await supabase
    .from('media')
    .select('listing_id, media_url')
    .in('listing_id', listings.map((l: any) => l.id))
    .eq('variant_type', 'thumbnail')
    .eq('order_number', 0)
  const mediaMap: Record<string, string> = {}
  media?.forEach((m: any) => {
    const key = idToKey[m.listing_id]
    if (key) mediaMap[key] = m.media_url
  })
  return mediaMap
}

interface Props {
  resolvedData: {
    path: 'condo' | 'home'
    buildingId?: string
    buildingName?: string
    buildingSlug?: string
    communityId?: string
    municipalityId?: string
    marketAnalytics?: any
    analyticsGeoType?: string
    analyticsGeoId?: string
  }
  formData: {
    intent: 'sale' | 'lease'
    bedrooms: string
    bathrooms: string
    livingAreaRange: string
    approximateAge: string
    parking: string
    locker: string
    frontage: string
    propertySubtype: string
    streetNumber: string
    streetName: string
    // C-ENHANCE-1-DATA (2026-06-13): CharlieOverlay already passes the FULL
    // SellerFormData object (which carries propertyTax) to this runner; the
    // earlier Props interface dropped it. Declaring it here unlocks the
    // tax-match cascade by threading subjectTaxAnnualAmount + subjectTaxYear
    // into the specs build below.
    propertyTax?: string
  }
  onEstimateReady: (data: any) => void
}

export default function SellerEstimateRunner({ resolvedData, formData, onEstimateReady }: Props) {
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const hasRun = useRef(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true
    runEstimate()
  }, [])

  const runEstimate = async () => {
    try {
      const bedsNum = parseInt(formData.bedrooms) || 2
      const bathsNum = parseInt(formData.bathrooms) || 1
      const parkingNum = parseInt(formData.parking) || 0
      const livingAreaRange = formData.livingAreaRange || undefined
      let result: any = null

      if (resolvedData.path === 'condo' && resolvedData.buildingId) {
        // C-ENHANCE-1-DATA: build CondoSaleSpecs (sale) or CondoLeaseSpecs
        // (lease). Both extend UnitSpecs + add optional community/muni/area
        // (already threaded via resolvedData) + tenantId. Sale specs also
        // carry the tax-match inputs. tenantId is intentionally NOT threaded
        // from the client; estimate-condo-{sale,rent}.ts:21 falls back to
        // getCurrentTenantId() server-side (request-host-aware) — verified by
        // the C-ENHANCE-PREFLIGHT pre-flight + the data-verify script below.
        const taxNum = formData.propertyTax ? parseFloat(formData.propertyTax) : NaN
        const subjectTaxAnnualAmount = Number.isFinite(taxNum) && taxNum > 0 ? taxNum : null
        const subjectTaxYear = subjectTaxAnnualAmount != null ? new Date().getFullYear() : null
        if (formData.intent === 'lease') {
          const specs: CondoLeaseSpecs = {
            buildingId: resolvedData.buildingId,
            buildingSlug: resolvedData.buildingSlug,
            bedrooms: bedsNum,
            bathrooms: bathsNum,
            livingAreaRange: livingAreaRange || '700-799',
            parking: parkingNum,
            hasLocker: formData.locker !== 'none' && !!formData.locker,
            communityId: resolvedData.communityId || null,
            municipalityId: resolvedData.municipalityId || null,
          }
          result = await estimateCondoRent(specs, false)
        } else {
          const specs: CondoSaleSpecs = {
            buildingId: resolvedData.buildingId,
            buildingSlug: resolvedData.buildingSlug,
            bedrooms: bedsNum,
            bathrooms: bathsNum,
            livingAreaRange: livingAreaRange || '700-799',
            parking: parkingNum,
            hasLocker: formData.locker !== 'none' && !!formData.locker,
            communityId: resolvedData.communityId || null,
            municipalityId: resolvedData.municipalityId || null,
            // Tax-match inputs — silent-omit when no tax provided (matcher
            // hard-gates on both fields, returns undefined for taxMatch).
            subjectTaxAnnualAmount,
            subjectTaxYear,
          }
          result = await estimateCondoSale(specs, false)
        }
      }

      if (resolvedData.path === 'home' && resolvedData.municipalityId) {
        // h5: thread subject street into HomeSpecs so the matcher can score
        // the same-street + odd/even bonus. Null-guard parseInt — NaN never
        // reaches specs (would silently disable the bonus anyway, but explicit
        // guard avoids weirdness if subjectStreetNumber ever feeds arithmetic).
        const streetNumParsed = parseInt(formData.streetNumber, 10)
        // C-ENHANCE-1-DATA: thread propertyTax → subjectTaxAnnualAmount +
        // subjectTaxYear. HomeSpecs already has these fields (home-comparable-
        // matcher-sales.ts:76-77); the home matcher's h8 tax-similarity score
        // band uses them. Silent-omit when no tax — matcher contributes 0
        // points instead of penalty, and taxMatch cascade returns undefined.
        const taxNum = formData.propertyTax ? parseFloat(formData.propertyTax) : NaN
        const subjectTaxAnnualAmount = Number.isFinite(taxNum) && taxNum > 0 ? taxNum : null
        const subjectTaxYear = subjectTaxAnnualAmount != null ? new Date().getFullYear() : null
        const specs: HomeSpecs = {
          bedrooms: bedsNum,
          bathrooms: bathsNum,
          propertySubtype: formData.propertySubtype || 'Detached',
          municipalityId: resolvedData.municipalityId,
          communityId: resolvedData.communityId || null,
          ...(livingAreaRange && { livingAreaRange }),
          lotWidth: formData.frontage ? parseFloat(formData.frontage) : null,
          ...(formData.streetName ? { subjectStreetName: formData.streetName } : {}),
          ...(!Number.isNaN(streetNumParsed) ? { subjectStreetNumber: streetNumParsed } : {}),
          subjectTaxAnnualAmount,
          subjectTaxYear,
        }
        result = formData.intent === 'lease'
          ? await estimateHomeRent(specs, false)
          : await estimateHomeSale(specs, false)
      }

      if (!result?.success || !result?.data) {
        setErrorMsg(result?.error || 'Estimate failed')
        setStatus('error')
        return
      }

      const listingKeys = result.data.comparables.map((c: any) => c.listingKey).filter(Boolean)
      const mediaMap = await fetchMediaForComparables(listingKeys)
      const comparablesWithMedia = result.data.comparables.map((c: any) => ({
        ...c,
        mediaUrl: c.listingKey ? mediaMap[c.listingKey] : null,
      }))

      // Fetch competing listings
      let competingListings: any[] = []
      try {
        const compRes = await fetch('/api/charlie/competing-listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: resolvedData.path,
            communityId: resolvedData.communityId,
            municipalityId: resolvedData.municipalityId,
            bedrooms: bedsNum,
            livingAreaRange: formData.livingAreaRange || undefined,
            propertySubtype: formData.propertySubtype,
          }),
        })
        const compData = await compRes.json()
        if (compData.success) competingListings = compData.listings || []
      } catch (e) { console.error('[competing]', e) }

      onEstimateReady({
        success: true,
        estimate: result.data,
        comparables: comparablesWithMedia,
        buildingName: resolvedData.buildingName,
        marketAnalytics: resolvedData.marketAnalytics,
        analyticsGeoType: resolvedData.analyticsGeoType,
        analyticsGeoId: resolvedData.analyticsGeoId,
        intent: formData.intent,
        path: resolvedData.path,
        communityId: resolvedData.communityId,
        municipalityId: resolvedData.municipalityId,
        bedrooms: bedsNum,
        livingAreaRange: formData.livingAreaRange || undefined,
        propertySubtype: formData.propertySubtype,
        competingListings,
      })
      setStatus('done')
    } catch (err: any) {
      console.error('[SellerEstimateRunner]', err)
      setErrorMsg(err.message)
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
        <div style={{ fontSize: 24, marginBottom: 12 }}>⚙️</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Running estimate...</div>
        <div style={{ fontSize: 12, marginTop: 6, color: 'rgba(255,255,255,0.25)' }}>Analyzing comparable sales</div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ padding: '24px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12 }}>
        <div style={{ color: '#ef4444', fontWeight: 700, marginBottom: 6 }}>Estimate Error</div>
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>{errorMsg}</div>
      </div>
    )
  }

  return null
}
