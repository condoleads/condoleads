// app/charlie/components/SellerEstimateRunner.tsx
'use client'
import { useEffect, useState, useRef } from 'react'
import { estimateSale } from '@/app/estimator/actions/estimate-sale'
import { estimateRent } from '@/app/estimator/actions/estimate-rent'
import { estimateHomeSale } from '@/app/estimator/actions/estimate-home-sale'
import { estimateHomeRent } from '@/app/estimator/actions/estimate-home-rent'
import { UnitSpecs } from '@/lib/estimator/types'
import { HomeSpecs } from '@/lib/estimator/home-comparable-matcher-sales'
import { createClient } from '@/lib/supabase/client'


async function fetchMediaForComparables(listingKeys: string[]) {
  if (!listingKeys.length) return {}
  const supabase = createClient()
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

  const runEstimate = async () => { console.log('[Runner] starting estimate, path:', resolvedData.path, 'buildingId:', resolvedData.buildingId)
    try {
      const bedsNum = parseInt(formData.bedrooms) || 2
      const bathsNum = parseInt(formData.bathrooms) || 1
      const parkingNum = parseInt(formData.parking) || 0
      const livingAreaRange = formData.livingAreaRange || undefined
      let result: any = null

      if (resolvedData.path === 'condo' && resolvedData.buildingId) {
        const specs: UnitSpecs = {
          buildingId: resolvedData.buildingId,
          buildingSlug: resolvedData.buildingSlug,
          bedrooms: bedsNum,
          bathrooms: bathsNum,
          livingAreaRange: livingAreaRange || '700-799',
          parking: parkingNum,
          hasLocker: formData.locker !== 'none' && !!formData.locker,
        }
        result = formData.intent === 'lease'
          ? await estimateRent(specs, false)
          : await estimateSale(specs, false)
      }

      if (resolvedData.path === 'home' && resolvedData.municipalityId) {
        const specs: HomeSpecs = {
          bedrooms: bedsNum,
          bathrooms: bathsNum,
          propertySubtype: formData.propertySubtype || 'Detached',
          municipalityId: resolvedData.municipalityId,
          communityId: resolvedData.communityId || null,
          ...(livingAreaRange && { livingAreaRange }),
          lotWidth: formData.frontage ? parseFloat(formData.frontage) : null,
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
