// app/estimator/components/EstimatorResults.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { EstimateResult, TEMPERATURE_CONFIG } from '@/lib/estimator/types'
import { formatPrice } from '@/lib/utils/formatters'
import GeoConfidenceSpread, { HOME_LABEL_MAP } from './GeoConfidenceSpread'
import { generateHomePropertySlug } from '@/lib/utils/slugs'
import { MessageSquare, AlertTriangle, Phone } from 'lucide-react'
import { submitLeadFromForm } from '@/app/actions/submitLeadFromForm'
import { submitActivityFromForm } from '@/app/actions/submitActivityFromForm'
// W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17): additive enrichment action
// for the optional contact-form follow-up. Generate-fire already created
// the lead with the rich workingDoc; this action updates contact fields
// on the SAME row, no email re-fire, no second lead.
import { updateLeadEnrichmentFromForm } from '@/app/actions/updateLeadEnrichmentFromForm'
import { useAuth } from '@/components/auth/AuthContext'
import { MULTI_UNIT_SUBTYPES } from '@/lib/estimator/home-comparable-matcher-sales'

// h3: relative-time helper for the Charlie-style plex tile's stats row. Mirrors
// app/charlie/components/ComparableCard.tsx:timeAgo verbatim — the duplication
// is flagged in the tracker (theme-mismatch makes cross-import of the dark-mode
// Charlie cards unsafe for the light-mode estimator surface).
function plexTimeAgo(dateStr: string | undefined | null): string {
  if (!dateStr) return ''
  const months = Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30))
  if (months <= 0) return 'this month'
  if (months === 1) return '1 mo ago'
  return `${months} mo ago`
}

// h3: DOM-tinted pill color, mirrors app/charlie/components/ActiveListingCard.tsx
// :domColor verbatim. Light-mode adapts the alpha-on-dark token to a Tailwind
// class set.
function plexDomTone(dom: number | null | undefined): string {
  if (dom == null) return 'bg-slate-100 text-slate-500'
  if (dom <= 21) return 'bg-emerald-50 text-emerald-700'
  if (dom <= 45) return 'bg-amber-50 text-amber-700'
  return 'bg-red-50 text-red-700'
}

// h4: unified status·subtype badge text. 'Att/Row/Townhouse' shortens to
// 'TOWNHOUSE' for the pill. Other subtypes uppercase as-is. Applied
// consistently across SOLD tiles + FOR SALE tiles, plex + SF.
function badgeSubtype(s: string | null | undefined): string {
  if (!s) return ''
  const t = s.trim().toUpperCase()
  if (t === 'ATT/ROW/TOWNHOUSE') return 'TOWNHOUSE'
  return t
}

// h2 finish — Competing-For-Sale rail tile shape (LOCKED v11 Option C, same
// tile as the sold-comp rail). Shape mirrors the /api/charlie/competing-
// listings response (home path), trimmed to the fields the tile renders.
// Income signals carried for plex tiles only — silent-omit per-field.
export interface CompetingListing {
  id: string
  listing_key: string
  list_price: number
  unparsed_address: string | null
  bedrooms_total: number | null
  bathrooms_total_integer: number | null
  living_area_range: string | null
  days_on_market: number | null
  approximate_age: number | null
  property_subtype: string | null
  net_operating_income?: number | null
  gross_revenue?: number | null
  mediaUrl?: string | null
  // W-CONDO-MODAL-PARITY Phase 2 (2026-06-11) — condo-only fields returned
  // by the endpoint's `path: 'condo'` branch (route.ts:25-56). Additive on
  // the home path (the home findActiveCompetition pipeline never sets
  // them, so home tiles ignore these fields entirely).
  unit_number?: string | null
  association_fee?: number | null
}

interface EstimatorResultsProps {
  result: EstimateResult
  type?: 'sale' | 'lease' | 'estimator'
  buildingId: string
  buildingName: string
  buildingAddress?: string
  unitNumber?: string
  agentId?: string
  listingId?: string
  subjectSubtype?: string | null
  subjectNoi?: number | null
  subjectListPrice?: number | null
  competingListings?: CompetingListing[]
  propertySpecs: any
}

export default function HomeEstimatorResults({
  result,
  type = 'sale',
  buildingId,
  buildingName,
  buildingAddress,
  unitNumber,
  agentId,
  listingId,
  subjectSubtype,
  subjectNoi,
  subjectListPrice,
  competingListings,
  propertySpecs
}: EstimatorResultsProps) {
  const isSale = type === 'sale' || type === 'estimator'
  const { user } = useAuth()
  const [showContactForm, setShowContactForm] = useState(true)
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  // P-LEADS-FIX (2026-06-12): surface lead-write failures instead of showing
  // a false "submitted" success state. Set on FK-reject / network failure /
  // resolver miss; cleared at the next submit attempt.
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Pre-fill form with user data
  useEffect(() => {
    if (user) {
      setContactForm({
        name: user.user_metadata?.full_name || user.user_metadata?.name || '',
        email: user.email || '',
        phone: user.user_metadata?.phone || ''
      })
    }
  }, [user])
  const [submitted, setSubmitted] = useState(false)
  // W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17): persisted leadId from the
  // fire-on-generate write. The optional contact-form submit reads this
  // to ENRICH the same row (not create a second). null until generate-
  // fire succeeds.
  const [generatedLeadId, setGeneratedLeadId] = useState<string | null>(null)
  // Fire-once guard so React re-renders don't double-fire submitLeadFromForm
  // for the same result. Reset whenever the underlying result changes.
  const generateFiredRef = useRef<string | null>(null)

  // W-ESTIMATOR-FIRE-ON-GENERATE: extracted workingDoc builder. Shape is
  // BYTE-IDENTICAL to the prior in-handleContactSubmit construction at
  // L240-321 of the pre-fix file — so the rich 3-section payload that
  // worked from the form path now ALSO ships from the generate path.
  // Pure function reading closure state; caller decides when to invoke.
  // W-COMPETING-CONTENT-ALL-PATHS (2026-06-18): override arg lets the
  // fire-on-generate IIFE pass the AWAITED inline-fetch result, sidestepping
  // the fire-and-forget race in the parent's useCompetingListings hook.
  // Omitted → closure-captured prop (back-compat for non-fire callers like
  // the form-submit fallback). Override has priority when defined.
  function buildWorkingDoc(competingOverride?: any[]): any {
    const competingSrc = (competingOverride !== undefined ? competingOverride : competingListings) || []
    return {
      version: 1,
      type: 'home',
      subject: {
        listingId: listingId ?? null,
        buildingName,
        buildingAddress,
        unitNumber,
        bedrooms: propertySpecs?.bedrooms ?? null,
        bathrooms: propertySpecs?.bathrooms ?? null,
        livingAreaRange: propertySpecs?.livingAreaRange ?? null,
      },
      estimate: {
        estimatedPrice: result.showPrice ? result.estimatedPrice : null,
        priceRange: result.priceRange ?? null,
        matchTier: result.matchTier ?? null,
        bestGeoTier: (result as any).bestGeoTier ?? null,
        confidence: result.confidence ?? null,
        confidenceMessage: result.confidenceMessage ?? null,
        // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): marketSpeed block.
        marketSpeed: (result as any).marketSpeed
          ? {
              avgDaysOnMarket: (result as any).marketSpeed.avgDaysOnMarket ?? null,
              status:          (result as any).marketSpeed.status ?? null,
              message:         (result as any).marketSpeed.message ?? null,
            }
          : null,
      },
      // W-ESTIMATOR-TIER-RAIL (2026-06-17): 4-row "Confidence by Area"
      // rail data from EstimateResult.tiers. ADDITIVE; null slots when
      // the matcher's cascade had no comparables at that tier.
      tiers: (result as any).tiers
        ? (() => {
            const t = (result as any).tiers as Record<string, any>
            const slot = (x: any): any =>
              x ? { count: x.count ?? null, median: x.median ?? null, range: x.range ?? null, estimatedPrice: x.estimatedPrice ?? null } : null
            return {
              platinum: slot(t.platinum),
              gold:     slot(t.gold),
              silver:   slot(t.silver),
              bronze:   slot(t.bronze),
            }
          })()
        : null,
      comparableSold: Array.isArray(result.comparables) && result.comparables.length > 0
        ? {
            bestGeoTier: (result as any).bestGeoTier ?? null,
            count: (result as any).tiers?.[(result as any).bestGeoTier]?.count ?? result.comparables.length,
            estimatedPrice: result.showPrice ? result.estimatedPrice : null,
            median: (result as any).tiers?.[(result as any).bestGeoTier]?.median ?? null,
            tiles: result.comparables.slice(0, 10).map((c: any) => ({
              listingKey: c.listingKey ?? null,
              closePrice: c.closePrice ?? null,
              adjustedPrice: c.adjustedPrice ?? null,
              closeDate: c.closeDate ?? null,
              daysOnMarket: c.daysOnMarket ?? null,
              bedrooms: c.bedrooms ?? null,
              bathrooms: c.bathrooms ?? null,
              livingAreaRange: c.livingAreaRange ?? null,
              unitNumber: c.unitNumber ?? null,
              unparsedAddress: c.unparsedAddress ?? null,
              matchTier: c.matchTier ?? null,
              sourceTier: c.sourceTier ?? null,
              temperature: c.temperature ?? null,
              // W-ESTIMATOR-LEAD-RENDER-AND-EMAIL P2-PHOTOS (2026-06-17):
              // forward mediaUrl from the matcher (populated by
              // attachMediaUrls in the home matcher).
              mediaUrl: c.mediaUrl ?? null,
              // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): matchQuality +
              // per-comp adjustments.
              matchQuality: c.matchQuality ?? null,
              adjustments: Array.isArray(c.adjustments) && c.adjustments.length > 0
                ? c.adjustments.map((a: any) => ({
                    type:             a?.type ?? null,
                    difference:       a?.difference ?? null,
                    adjustmentAmount: a?.adjustmentAmount ?? null,
                    reason:           a?.reason ?? null,
                  }))
                : null,
            })),
          }
        : null,
      taxMatch: (result as any).taxMatch && Array.isArray((result as any).taxMatch.comparables) && (result as any).taxMatch.comparables.length > 0
        ? {
            bestGeoTier: (result as any).taxMatch.bestGeoTier ?? null,
            count: (result as any).taxMatch.count ?? (result as any).taxMatch.comparables.length,
            estimatedPrice: (result as any).taxMatch.estimatedPrice ?? null,
            // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): tax-match
            // matchTier + priceRange + tiers (the SECOND 4-tier rail).
            matchTier:  (result as any).taxMatch.matchTier ?? null,
            priceRange: (result as any).taxMatch.priceRange ?? null,
            tiers: (result as any).taxMatch.tiers
              ? (() => {
                  const t = (result as any).taxMatch.tiers as Record<string, any>
                  const slot = (x: any): any =>
                    x ? { count: x.count ?? null, median: x.median ?? null, range: x.range ?? null, estimatedPrice: x.estimatedPrice ?? null } : null
                  return {
                    platinum: slot(t.platinum),
                    gold:     slot(t.gold),
                    silver:   slot(t.silver),
                    bronze:   slot(t.bronze),
                  }
                })()
              : null,
            tiles: (result as any).taxMatch.comparables.slice(0, 10).map((c: any) => ({
              listingKey: c.listingKey ?? null,
              closePrice: c.closePrice ?? null,
              adjustedPrice: c.adjustedPrice ?? null,
              closeDate: c.closeDate ?? null,
              daysOnMarket: c.daysOnMarket ?? null,
              bedrooms: c.bedrooms ?? null,
              bathrooms: c.bathrooms ?? null,
              livingAreaRange: c.livingAreaRange ?? null,
              unitNumber: c.unitNumber ?? null,
              unparsedAddress: c.unparsedAddress ?? null,
              matchTier: c.matchTier ?? null,
              sourceTier: c.sourceTier ?? null,
              temperature: c.temperature ?? null,
              mediaUrl: c.mediaUrl ?? null,
              matchQuality: c.matchQuality ?? null,
              adjustments: Array.isArray(c.adjustments) && c.adjustments.length > 0
                ? c.adjustments.map((a: any) => ({
                    type:             a?.type ?? null,
                    difference:       a?.difference ?? null,
                    adjustmentAmount: a?.adjustmentAmount ?? null,
                    reason:           a?.reason ?? null,
                  }))
                : null,
            })),
          }
        : null,
      competing: Array.isArray(competingSrc) && competingSrc.length > 0
        ? {
            count: competingSrc.length,
            tiles: competingSrc.slice(0, 10).map((c: any) => ({
              id: c.id ?? null,
              listingKey: c.listing_key ?? null,
              listPrice: c.list_price ?? null,
              daysOnMarket: c.days_on_market ?? null,
              bedrooms: c.bedrooms_total ?? null,
              bathrooms: c.bathrooms_total_integer ?? null,
              livingAreaRange: c.living_area_range ?? null,
              unitNumber: c.unit_number ?? null,
              unparsedAddress: c.unparsed_address ?? null,
              // W-ESTIMATOR-LEAD-RENDER-AND-EMAIL P2-PHOTOS (2026-06-17):
              // competing endpoint already returns mediaUrl per listing.
              mediaUrl: c.mediaUrl ?? null,
            })),
          }
        : null,
    }
  }

  // W-ESTIMATOR-FIRE-ON-GENERATE: fire-on-generate effect. Once the
  // estimate result is ready AND the user is authed AND we know which
  // agent to route to, write the lead with the full workingDoc payload
  // and log the activity. forceNew=true → creates a fresh lead +
  // triggers the helper-driven email fan-out.
  //
  // Anonymous gate: !user → no fire (the parent modal shows
  // RegisterModal first). !agentId → no fire (public context, matches
  // prior handleContactSubmit early-exit). Fire-once via fingerprint
  // ref so state-induced re-renders don't double-fire.
  useEffect(() => {
    if (!user || !user.email) return
    if (!agentId) return
    if (!result) return
    const fingerprint = `${result.estimatedPrice ?? 'n'}|${result.priceRange?.low ?? 'n'}|${result.priceRange?.high ?? 'n'}|${(result.comparables || []).map((c: any) => c.listingKey ?? '').join(',')}`
    if (generateFiredRef.current === fingerprint) return
    generateFiredRef.current = fingerprint

    // Capture for the async IIFE so TS narrows past the closure boundary.
    const userEmail = user.email

    ;(async () => {
      // W-COMPETING-CONTENT-ALL-PATHS (2026-06-18): inline-await the
      // competing-listings fetch INSIDE the fire-on-generate IIFE
      // (mirror of OfferInquiryModal). Same race fix as the condo
      // EstimatorResults — parent's useCompetingListings is fire-
      // and-forget, so the prop was empty when the lead wrote.
      // Endpoint may legitimately return [] for niche subjects;
      // we capture either way and let the renderer omit cleanly.
      let competingForDoc: any[] = []
      const homeSubtype = (propertySpecs as any)?.propertySubtype || null
      const homeMuniId = (propertySpecs as any)?.municipalityId || null
      if (homeSubtype && homeMuniId) {
        try {
          const cres = await fetch('/api/charlie/competing-listings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              path: 'home',
              communityId:        (propertySpecs as any)?.communityId ?? null,
              municipalityId:     homeMuniId,
              bedrooms:           propertySpecs?.bedrooms ?? null,
              bathrooms:          propertySpecs?.bathrooms ?? null,
              livingAreaRange:    propertySpecs?.livingAreaRange ?? null,
              propertySubtype:    homeSubtype,
              architecturalStyle: (propertySpecs as any)?.architecturalStyle ?? null,
              approximateAge:     (propertySpecs as any)?.approximateAge ?? null,
            }),
          })
          const cdata = await cres.json().catch(() => null)
          if (cdata?.success && Array.isArray(cdata.listings)) competingForDoc = cdata.listings
        } catch (err) {
          console.error('[HomeEstimatorResults] competing inline fetch threw:', err)
        }
      }
      const workingDoc = buildWorkingDoc(competingForDoc)
      const message = result.showPrice
        ? `Received estimate for ${buildingName}${unitNumber ? ` — ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}: ${formatPrice(result.estimatedPrice)} (${formatPrice(result.priceRange.low)} - ${formatPrice(result.priceRange.high)}). ${propertySpecs?.bedrooms || 'N/A'}BR/${propertySpecs?.bathrooms || 'N/A'}BA, ${propertySpecs?.livingAreaRange || 'N/A'} sqft. Confidence: ${result.confidence}. Estimate generated automatically.`
        : `Requesting valuation for ${buildingName}${unitNumber ? ` — ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}. ${propertySpecs?.bedrooms || 'N/A'}BR/${propertySpecs?.bathrooms || 'N/A'}BA, ${propertySpecs?.livingAreaRange || 'N/A'} sqft. Property requires professional analysis - no automated estimate available.`
      try {
        const leadResult = await submitLeadFromForm({
          agentId,
          contactName: contactForm.name || user.user_metadata?.full_name || user.user_metadata?.name || '',
          contactEmail: userEmail,
          contactPhone: contactForm.phone || user.user_metadata?.phone || '',
          // W-ESTIMATOR-USERID-AND-STATS G3 (2026-06-17): thread user.id so
          // leads.user_id is populated → leadFamily aggregation can group
          // this lead with other estimator events from the same auth
          // user → pill selector appears in admin Estimator + Plan tabs.
          userId: user.id,
          source: type === 'estimator' ? 'estimator' : (type === 'sale' ? 'sale_offer_inquiry' : 'lease_offer_inquiry'),
          buildingId,
          listingId,
          message,
          estimatedValueMin: result.showPrice ? result.priceRange.low : undefined,
          estimatedValueMax: result.showPrice ? result.priceRange.high : undefined,
          propertyDetails: {
            ...(propertySpecs || {}),
            buildingName,
            buildingAddress,
            unitNumber,
            estimatedPrice: result.showPrice ? result.estimatedPrice : null,
            confidence: result.confidence,
            matchTier: result.matchTier,
            marketSpeed: result.marketSpeed?.status,
            workingDoc,
          },
          forceNew: true,
        })
        if (leadResult?.success && 'lead' in leadResult && leadResult.lead?.id) {
          setGeneratedLeadId(leadResult.lead.id)
        } else {
          const errMsg = leadResult && 'error' in leadResult ? leadResult.error : 'unknown'
          console.error('[HomeEstimatorResults] fire-on-generate lead-write failed:', errMsg)
        }
        await submitActivityFromForm({
          contactEmail: userEmail,
          agentId,
          activityType: type === 'estimator' ? 'estimator' : (type === 'sale' ? 'sale_offer_inquiry' : 'lease_offer_inquiry'),
          activityData: {
            buildingId,
            buildingName,
            buildingAddress,
            unitNumber,
            estimatedPrice: result.showPrice ? result.estimatedPrice : null,
            priceRangeLow: result.showPrice ? result.priceRange.low : null,
            priceRangeHigh: result.showPrice ? result.priceRange.high : null,
            confidence: result.confidence,
            matchTier: result.matchTier,
            bedrooms: propertySpecs?.bedrooms,
            bathrooms: propertySpecs?.bathrooms,
            sqft: propertySpecs?.livingAreaRange,
          },
        })
      } catch (err) {
        console.error('[HomeEstimatorResults] fire-on-generate error:', err)
      }
    })()
  // Deliberately omit contactForm — typing in the form must NOT re-fire.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, agentId, result, type, buildingId, listingId, buildingName, buildingAddress, unitNumber, propertySpecs, competingListings])

  const confidenceColors: Record<string, string> = {
    'High': 'text-emerald-700 bg-emerald-50 border-emerald-200',
    'Medium-High': 'text-green-700 bg-green-50 border-green-200',
    'Medium': 'text-amber-700 bg-amber-50 border-amber-200',
    'Medium-Low': 'text-orange-600 bg-orange-50 border-orange-200',
    'Low': 'text-red-700 bg-red-50 border-red-200',
    'None': 'text-slate-700 bg-slate-50 border-slate-200'
  }

  const marketSpeedColors = {
    Fast: 'text-emerald-600',
    Moderate: 'text-blue-600',
    Slow: 'text-amber-600'
  }

  const temperatureDisplay = {
    HOT: { icon: '🔥', label: 'Hot', color: 'text-red-600 bg-red-50 border-red-200' },
    WARM: { icon: '🌡️', label: 'Warm', color: 'text-orange-600 bg-orange-50 border-orange-200' },
    COLD: { icon: '❄️', label: 'Cold', color: 'text-blue-600 bg-blue-50 border-blue-200' },
    FROZEN: { icon: '🧊', label: 'Frozen', color: 'text-slate-600 bg-slate-50 border-slate-200' }
  }

  const tierLabels: Record<string, { label: string; description: string }> = {
    'BINGO': { label: 'Best Matches', description: 'Similar homes with exact sqft (+-10%)' },
    'BINGO-ADJ': { label: 'Best Matches (Adjusted)', description: 'Similar sqft with lot & feature adjustments' },
    'RANGE': { label: 'Comparable Homes', description: 'Same sqft range with matching specs' },
    'RANGE-ADJ': { label: 'Comparable Homes (Adjusted)', description: 'Same sqft range with lot & feature adjustments' },
    'MAINT': { label: 'Similar Homes', description: 'Similar size homes in your area' },
    'MAINT-ADJ': { label: 'Similar Homes (Adjusted)', description: 'Similar homes with lot & feature adjustments' },
    'CONTACT': { label: 'Market Reference', description: 'Recent sales for context only' }
  }

  // g4: class-aware copy flag for the CONTACT branch. Single-family strings
  // stay byte-identical to pre-g4; multi-unit subjects see class-appropriate
  // variants on the comp-rail header, sub-heading, and footer.
  const isMultiUnitSubject = !!subjectSubtype && MULTI_UNIT_SUBTYPES.includes(subjectSubtype)

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitError(null)

    // W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17): inverted from
    // "create lead + email" to "enrich the same lead". The lead+email
    // already fired ON generate (useEffect above) using the rich
    // workingDoc payload + helper-driven 6-layer fan-out. This handler
    // is the OPTIONAL follow-up: it writes contact_name / contact_phone
    // / message onto the SAME row. No second lead. No email re-fire.
    // No second activity log.
    const specs = propertySpecs || {}
    const message = result.showPrice
      ? `Received estimate for ${buildingName}${unitNumber ? ` — ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}: ${formatPrice(result.estimatedPrice)} (${formatPrice(result.priceRange.low)} - ${formatPrice(result.priceRange.high)}). ${specs.bedrooms || 'N/A'}BR/${specs.bathrooms || 'N/A'}BA, ${specs.livingAreaRange || 'N/A'} sqft. Confidence: ${result.confidence}. Would like to discuss accurate valuation.`
      : `Requesting valuation for ${buildingName}${unitNumber ? ` — ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}. ${specs.bedrooms || 'N/A'}BR/${specs.bathrooms || 'N/A'}BA, ${specs.livingAreaRange || 'N/A'} sqft. Property requires professional analysis - no automated estimate available.`

    if (!agentId) {
      setSubmitted(true)
      setShowContactForm(false)
      setIsSubmitting(false)
      return
    }

    // Resolve targetLeadId: prefer the leadId captured by fire-on-generate;
    // fallback uses submitLeadFromForm with forceNew=FALSE so createLead's
    // dedup helper returns the EXISTING row without re-firing the email.
    let targetLeadId = generatedLeadId
    let enrichSucceeded = false

    try {
      if (!targetLeadId) {
        const dedupResult = await submitLeadFromForm({
          agentId,
          contactName: contactForm.name,
          contactEmail: contactForm.email,
          contactPhone: contactForm.phone,
          // W-ESTIMATOR-USERID-AND-STATS G3 (2026-06-17): thread user.id
          // through the dedup-fallback path too — keeps the lead linked
          // to the auth user when generate-fire's leadId race forces
          // this branch to write the row.
          userId: user?.id,
          source: type === 'estimator' ? 'estimator' : (type === 'sale' ? 'sale_offer_inquiry' : 'lease_offer_inquiry'),
          buildingId,
          listingId,
          message,
          estimatedValueMin: result.showPrice ? result.priceRange.low : undefined,
          estimatedValueMax: result.showPrice ? result.priceRange.high : undefined,
          propertyDetails: {
            ...(propertySpecs || {}),
            buildingName,
            buildingAddress,
            unitNumber,
            estimatedPrice: result.showPrice ? result.estimatedPrice : null,
            confidence: result.confidence,
            matchTier: result.matchTier,
            marketSpeed: result.marketSpeed?.status,
            workingDoc: buildWorkingDoc(),
          },
          forceNew: false,
        })
        if (dedupResult?.success && 'lead' in dedupResult && dedupResult.lead?.id) {
          targetLeadId = dedupResult.lead.id
          setGeneratedLeadId(dedupResult.lead.id)
        } else {
          const errMsg = dedupResult && 'error' in dedupResult ? dedupResult.error : undefined
          console.error('[HomeEstimatorResults] dedup-resolve failed:', errMsg)
          setSubmitError(errMsg || 'We could not submit your request right now. Please try again.')
        }
      }

      if (targetLeadId) {
        const enrichResult = await updateLeadEnrichmentFromForm({
          leadId: targetLeadId,
          contactName: contactForm.name,
          contactPhone: contactForm.phone,
          message,
        })
        if (enrichResult.success) {
          enrichSucceeded = true
        } else {
          console.error('[HomeEstimatorResults] updateLeadEnrichment failed:', enrichResult.error)
          setSubmitError(enrichResult.error || 'We could not submit your request right now. Please try again.')
        }
      }
    } catch (error) {
      console.error('[HomeEstimatorResults] enrichment exception:', error)
      setSubmitError('We could not submit your request right now. Please try again.')
    }

    setIsSubmitting(false)
    if (enrichSucceeded) {
      setSubmitted(true)
      setShowContactForm(false)
    }
  }

  // CONTACT TIER: No price - show reference comparables + strong CTA
  if (!result.showPrice || result.matchTier === 'CONTACT') {
    return (
      <div className="space-y-6">
        {/* Expert Valuation Required Banner */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl shadow-xl p-8 text-white">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Phone className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-bold mb-3">Expert Valuation Required</h2>
            <p className="text-lg text-blue-100 max-w-lg mx-auto">
              {result.confidenceMessage || 'Your home has unique characteristics that require professional analysis for accurate pricing.'}
            </p>
            {/* g3: cap-rate context line — multi-unit only, renders ONLY when
                the subject listing carries multi-unit subtype + NOI > 0 +
                list_price > 0. Geo-page entry omits silently (loader doesn't
                select NOI). Single-family / condo / mixed-use suppressed by
                the subtype guard even if NOI happens to be non-null. No "—%",
                no "N/A", no zero — silent omission per accurate-or-nothing.
                One-decimal precision matches input honesty (single reported
                NOI ÷ asking is not 2-decimal-accurate). */}
            {subjectSubtype && MULTI_UNIT_SUBTYPES.includes(subjectSubtype)
              && subjectNoi != null && subjectNoi > 0
              && subjectListPrice != null && subjectListPrice > 0 && (
              <div className="mt-4 inline-block bg-white/10 rounded-lg px-4 py-2 text-sm text-blue-100">
                Reported NOI {formatPrice(subjectNoi)} — implied ~{((subjectNoi / subjectListPrice) * 100).toFixed(1)}% cap at asking
              </div>
            )}
          </div>

          {/* Contact Form */}
          {!submitted ? (
            !showContactForm ? (
              <button
                onClick={() => setShowContactForm(true)}
                className="w-full bg-white text-blue-700 font-bold py-5 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl hover:bg-blue-50 flex items-center justify-center gap-3 text-lg"
              >
                <MessageSquare className="w-6 h-6" />
                Request Free Professional Valuation
              </button>
            ) : (
              <form onSubmit={handleContactSubmit} className="bg-white rounded-xl p-6 space-y-4">
                <h4 className="font-bold text-gray-900 text-lg mb-4">Get Your Free Valuation</h4>
                {submitError && (
                  <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                    {submitError}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Name *</label>
                  <input
                    type="text"
                    required
                    value={contactForm.name}
                    onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                    placeholder="John Doe"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                  <input
                    type="email"
                    required
                    value={contactForm.email}
                    onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                    placeholder="john@example.com"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                  <input
                    type="tel"
                    value={contactForm.phone}
                    onChange={(e) => setContactForm({...contactForm, phone: e.target.value})}
                    placeholder="(416) 555-1234"
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Sending...' : 'Request Valuation'}
                </button>
              </form>
            )
          ) : (
            <div className="bg-white rounded-xl p-6 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-xl font-bold text-gray-900 mb-2">Request Received!</h4>
              <p className="text-gray-700">Your agent will contact you within 24 hours with an accurate market valuation.</p>
            </div>
          )}
        </div>

        {/* Reference Comparables */}
        {result.comparables.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-start gap-3 mb-6">
              <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {isMultiUnitSubject
                    ? 'Recent Multi-Unit Sales (Reference Context)'
                    : 'Market Reference (Not Direct Comparables)'}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                  {isMultiUnitSubject
                    ? 'These recent multi-unit sales in your area provide context for the valuation conversation with your agent.'
                    : 'These recent sales in your area differ from your home but provide market context.'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {result.comparables.map((comp, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-5 border-2 border-slate-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {comp.unparsedAddress && (
                          <span className="text-sm font-semibold text-slate-500">{comp.unparsedAddress.split(',')[0]}</span>
                        )}
                        <span className="font-bold text-slate-900">
                          {comp.bedrooms} bed, {comp.bathrooms} bath
                        </span>
                        {comp.temperature && (
                          <span className={`px-2 py-1 rounded-full text-xs font-bold border ${temperatureDisplay[comp.temperature].color}`}>
                            {temperatureDisplay[comp.temperature].icon} {temperatureDisplay[comp.temperature].label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">
                        {comp.livingAreaRange} sqft • {comp.parking} parking spot(s)
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {isSale ? 'Sold' : 'Leased'}: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-900">{formatPrice(comp.closePrice)}</p>
                    </div>
                  </div>

                  {/* Mismatch Reason */}
                  {comp.mismatchReason && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <p className="text-xs text-amber-800">
                        <span className="font-semibold">Why this differs:</span> {comp.mismatchReason}
                      </p>
                    </div>
                  )}
                  
                  {!comp.unitNumber && comp.listingKey && comp.unparsedAddress && (
                      <a
                        href={generateHomePropertySlug({
                          unparsed_address: comp.unparsedAddress,
                          listing_key: comp.listingKey
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block text-center text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        View Property Details →
                      </a>
                    )}
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 mt-4 text-center">
              ⚠️ These are for reference only. Contact agent for accurate valuation of your {isMultiUnitSubject ? 'property' : 'home'}.
            </p>
          </div>
        )}
      </div>
    )
  }

  // BINGO / FAIR / ADJUSTED TIERS: Show price estimates
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
        {/* Main Estimate - Option A Display */}
        <div className="text-center border-b pb-6">
          <p className="text-sm text-slate-600 mb-2">
            Estimated {isSale ? 'Market Value' : 'Monthly Rent'}
          </p>
          <h2 className="text-5xl font-bold text-slate-900 mb-1">
            {formatPrice(result.estimatedPrice)}
            {!isSale && <span className="text-2xl font-normal">/mo</span>}
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            (average of {result.comparables.length} comparable home{result.comparables.length > 1 ? 's' : ''})
          </p>

          {/* Current Market Price - Most Recent Sale */}
          {result.currentMarketPrice && result.currentMarketPrice !== result.estimatedPrice && (
            <div className="bg-emerald-50 rounded-lg px-4 py-3 inline-block mb-3">
              <p className="text-sm text-emerald-700">
                <span className="font-semibold">Current Market:</span> {formatPrice(result.currentMarketPrice)}
                <span className="text-emerald-600 ml-1">(most recent sale)</span>
              </p>
            </div>
          )}

          <p className="text-lg text-slate-600">
            Range: {formatPrice(result.priceRange.low)} - {formatPrice(result.priceRange.high)}
            {!isSale && '/mo'}
          </p>

          <div className="mt-4 flex flex-col items-center gap-2">
            <span className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border ${confidenceColors[result.confidence]}`}>
              {result.confidence} Confidence
            </span>
            {result.confidenceMessage && (
              <p className="text-xs text-slate-500 max-w-md">{result.confidenceMessage}</p>
            )}
          </div>
        </div>

        {/* Match Tier Banner */}
        {result.matchTier && (
          <div className={`rounded-xl p-4 border-2 ${
            result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ' ? 'bg-emerald-50 border-emerald-200' :
            result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ' ? 'bg-blue-50 border-blue-200' :
            result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ' ? 'bg-amber-50 border-amber-200' :
            'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">
                {result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ' ? '🎯' : 
                 result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ' ? '📊' : 
                 result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ' ? '🔧' : '📋'}
              </span>
              <div>
                <p className={`font-bold ${
                  result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ' ? 'text-emerald-800' :
                  result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ' ? 'text-blue-800' :
                  result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ' ? 'text-amber-800' :
                  'text-slate-800'
                }`}>
                  {tierLabels[result.matchTier]?.label || 'Comparables'}
                </p>
                <p className={`text-sm ${
                  result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ' ? 'text-emerald-600' :
                  result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ' ? 'text-blue-600' :
                  result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ' ? 'text-amber-600' :
                  'text-slate-600'
                }`}>
                  {tierLabels[result.matchTier]?.description || ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* h7: Geographic Confidence Spread (Platinum / Gold / Silver / Bronze).
            Extracted to <GeoConfidenceSpread> (W-CONDO-MODAL-PARITY Phase 2,
            2026-06-11) so both HOME and condo callers share the same JSX.
            Outer gate (isMultiUnitSubject + result.tiers) and HOME_LABEL_MAP
            preserved here — pixel-identical to pre-Phase-2. */}
        {!isMultiUnitSubject && result.tiers && (
          <GeoConfidenceSpread
            tiers={result.tiers}
            bestGeoTier={result.bestGeoTier}
            labelMap={HOME_LABEL_MAP}
          />
        )}

        {/* Market Speed */}
        <div className="bg-slate-50 rounded-xl p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-3">Market Conditions</h3>
          <div className="flex items-start gap-3">
            <div className={`text-2xl font-bold ${marketSpeedColors[result.marketSpeed.status]}`}>
              {result.marketSpeed.avgDaysOnMarket} days
            </div>
            <div className="flex-1">
              <p className={`font-semibold ${marketSpeedColors[result.marketSpeed.status]} mb-1`}>
                {result.marketSpeed.status} Market
              </p>
              <p className="text-sm text-slate-600">
                {isSale
                  ? result.marketSpeed.message
                  : result.marketSpeed.message.replace(/selling/gi, 'leasing').replace(/sold/gi, 'leased')
                }
              </p>
            </div>
          </div>
        </div>

        {/* AI Insights (if available) */}
        {result.aiInsights && (
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 9a1 1 0 112 0v4a1 1 0 11-2 0V9z"/>
              </svg>
              AI Market Insights
            </h3>
            <p className="text-slate-700 mb-4">{result.aiInsights.summary}</p>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Key Factors:</p>
              <ul className="space-y-1">
                {result.aiInsights.keyFactors.map((factor, idx) => (
                  <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                    <span className="text-purple-600 mt-0.5">•</span>
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200">
              <p className="text-sm font-semibold text-slate-900 mb-1">Market Trend:</p>
              <p className="text-sm text-slate-700">{result.aiInsights.marketTrend}</p>
            </div>
          </div>
        )}

        {/* Comparables with Temperature */}
        <div>
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            {isMultiUnitSubject
              ? `Recent ${subjectSubtype} Sales (Plex Reference)`
              : (
                result.matchTier === 'BINGO' ? 'Perfect Matches' :
                result.matchTier === 'BINGO-ADJ' ? 'Perfect Matches (Adjusted)' :
                result.matchTier === 'RANGE' ? 'Comparable Homes' :
                result.matchTier === 'RANGE-ADJ' ? 'Comparable Homes (Adjusted)' :
                result.matchTier === 'MAINT' ? 'Similar Homes' :
                result.matchTier === 'MAINT-ADJ' ? 'Similar Homes (Adjusted)' :
                'Comparables'
              )} ({result.comparables.length})
          </h3>
          {/* h2 Phase 2: plex educational one-liner — these properties price on income, not on bed/bath/sqft */}
          {isMultiUnitSubject && (
            <p className="text-xs text-slate-600 mb-3 italic">
              Multi-unit properties are valued on rental income, not size — figures below show each comp&apos;s income where reported.
            </p>
          )}
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {result.comparables.map((comp, idx) => {
              const hasAdjustments = comp.adjustments && comp.adjustments.length > 0

              // h3: plex subjects render the Charlie-style horizontal card (compact,
              // photo + facts row + elevated income block). SF subjects fall through
              // to the existing tall vertical tile unchanged — REGRESSION GUARD.
              if (isMultiUnitSubject) {
                const noi   = comp.netOperatingIncome ?? 0
                const gross = comp.grossRevenue ?? 0
                const cp    = comp.closePrice ?? 0
                // h3 refinement: income panel is plex-only (subject-level gate, NOT
                // just row-level). Stray NOI on a non-plex subject row never triggers
                // it. Subject gate `isMultiUnitSubject` is already enforced by the
                // outer branch — but kept explicit on the tile gate for clarity.
                const showIncome = isMultiUnitSubject && (noi > 0 || gross > 0)
                const slug = comp.listingKey && comp.unparsedAddress
                  ? generateHomePropertySlug({
                      unparsed_address: comp.unparsedAddress,
                      listing_key: comp.listingKey,
                    })
                  : null
                const Inner = (
                  <>
                    {/* Photo column — 96x96, mediaUrl with 🏠 fallback.
                        h4: unified SOLD · SUBTYPE pill top-left (slate-700 = sold). */}
                    <div className="w-24 h-24 flex-shrink-0 bg-slate-100 relative overflow-hidden">
                      {comp.mediaUrl ? (
                        <img src={comp.mediaUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🏠</div>
                      )}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-700 text-white">
                        SOLD{comp.propertySubtype ? ` · ${badgeSubtype(comp.propertySubtype)}` : ''}
                      </span>
                    </div>

                    {/* Info column */}
                    <div className="flex-1 px-3 py-2 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <span className="text-base font-bold text-slate-900">
                          {isSale ? formatPrice(comp.closePrice) : formatPrice(comp.closePrice) + '/mo'}
                        </span>
                        {comp.daysOnMarket != null && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plexDomTone(comp.daysOnMarket)}`}>
                            {comp.daysOnMarket}d DOM
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mb-0.5">
                        {comp.unparsedAddress?.split(',')[0] || '—'}
                      </div>

                      {/* h4: plex match-basis — one muted line stating WHY this is
                          a comp (parallel to SF Match-Details panel). Plex axis =
                          same-subtype + LAR-adjacent (per runPlexPricingPath). */}
                      <div className="text-[10px] text-slate-400 italic mb-0.5">
                        Same {comp.propertySubtype || 'plex'} · similar size
                      </div>

                      {/* h3 refinement: ELEVATED income panel for plex-with-data.
                          Indigo-50 bg + indigo-700 cap headline. Sits ABOVE the
                          stats so it reads as the primary fact. Silent-omits per
                          field; entire panel silent-omits when no income data. */}
                      {showIncome && (
                        <div className="mt-1 mb-1 px-2 py-1 rounded bg-indigo-50 border border-indigo-100 flex flex-wrap gap-x-2 gap-y-0 items-baseline text-[11px]">
                          {noi > 0 && cp > 0 && (
                            <span className="text-sm font-bold text-indigo-700">{((noi / cp) * 100).toFixed(1)}%<span className="text-[10px] font-medium text-indigo-600"> cap</span></span>
                          )}
                          {noi > 0 && (
                            <span className="text-slate-700"><span className="font-semibold text-slate-900">NOI</span> {formatPrice(noi)}</span>
                          )}
                          {gross > 0 && (
                            <span className="text-slate-700"><span className="font-semibold text-slate-900">Gross</span> {formatPrice(gross)}</span>
                          )}
                          {gross > 0 && cp > 0 && (
                            <span className="text-slate-700"><span className="font-semibold text-slate-900">GRM</span> {(cp / gross).toFixed(1)}</span>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                        {comp.bedrooms != null && <span>{comp.bedrooms} bed</span>}
                        {comp.bathrooms != null && <span>{comp.bathrooms} bath</span>}
                        {comp.livingAreaRange && <span>{comp.livingAreaRange} sqft</span>}
                        {comp.closeDate && <span className="ml-auto text-slate-300">{isSale ? 'Sold' : 'Leased'} {plexTimeAgo(comp.closeDate)}</span>}
                      </div>
                    </div>
                  </>
                )
                // h3 refinement: tiles WITH income data get an indigo left-accent
                // border (2px). Tiles without — neutral slate border. The two
                // states are visually distinct: rich vs compact.
                const baseClasses = "flex bg-white border border-slate-200 hover:border-slate-300 rounded-xl overflow-hidden transition-colors"
                const accentClass = showIncome ? ' border-l-2 border-l-indigo-500' : ''
                const tileClasses = baseClasses + accentClass
                return slug ? (
                  <a key={idx} href={slug} target="_blank" rel="noopener noreferrer" className={tileClasses + ' cursor-pointer'}>
                    {Inner}
                  </a>
                ) : (
                  <div key={idx} className={tileClasses}>
                    {Inner}
                  </div>
                )
              }

              // Geo-tier chip (SF only — plex branch returned above).
              // Uniform per section: geo cascade returns mono-tier comps from
              // result.bestGeoTier. Mirrors the tax-tile body chip (df4419d).
              // Skipped on CONTACT-tier (bestGeoTier === 'none').
              const geoTierKey = result.bestGeoTier && result.bestGeoTier !== 'none' ? result.bestGeoTier as 'platinum' | 'gold' | 'silver' | 'bronze' : null
              const geoTierLabel = geoTierKey ? HOME_LABEL_MAP[geoTierKey] : null
              const geoTierBadgeColor = !geoTierKey ? ''
                : geoTierKey === 'platinum' ? 'bg-emerald-600 text-white'
                : geoTierKey === 'gold'     ? 'bg-amber-500 text-white'
                : geoTierKey === 'silver'   ? 'bg-slate-500 text-white'
                :                             'bg-orange-700 text-white'

              return (
                <div key={idx} className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl overflow-hidden transition-colors">
                  {/* h4: SHARED FRAME (photo column + horizontal header) — same
                      skeleton as the plex tile. SF datums (bedrooms, bathrooms,
                      exactSqft/livingAreaRange, parking, closeDate, daysOnMarket,
                      temperature, unparsedAddress, closePrice) all rendered here
                      in the new layout. */}
                  <div className="flex">
                    <div className="w-24 h-24 flex-shrink-0 bg-slate-100 relative overflow-hidden">
                      {comp.mediaUrl ? (
                        <img src={comp.mediaUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🏠</div>
                      )}
                      {/* h4: unified SOLD · SUBTYPE pill (slate-700 = sold). */}
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-700 text-white">
                        SOLD{comp.propertySubtype ? ` · ${badgeSubtype(comp.propertySubtype)}` : ''}
                      </span>
                    </div>

                    <div className="flex-1 px-3 py-2 min-w-0">
                      <div className="flex justify-between items-start mb-0.5 gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {isSale ? formatPrice(comp.closePrice) : formatPrice(comp.closePrice) + '/mo'}
                        </span>
                        {/* Temperature pill — preserved from prior SF tile (HOT/WARM/COLD/FROZEN with icon). */}
                        {comp.temperature && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${temperatureDisplay[comp.temperature].color} flex-shrink-0`}>
                            {temperatureDisplay[comp.temperature].icon} {temperatureDisplay[comp.temperature].label}
                          </span>
                        )}
                      </div>
                      {geoTierLabel && (
                        <div className="mb-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${geoTierBadgeColor}`}>
                            {geoTierLabel.emoji} {geoTierLabel.name} · {geoTierLabel.sub}
                          </span>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500 truncate mb-0.5">
                        {comp.unparsedAddress?.split(',')[0] || '—'}
                      </div>
                      <div className="text-[11px] text-slate-400 mb-0.5">
                        {comp.bedrooms} bed · {comp.bathrooms} bath · {comp.exactSqft ? `${comp.exactSqft} sqft` : `${comp.livingAreaRange} sqft`} · {comp.parking} parking spot(s)
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isSale ? 'Sold' : 'Leased'}: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} • {comp.daysOnMarket} days on market
                      </div>
                    </div>
                  </div>

                  {/* h4: SF type-specific enrichment below the shared frame.
                      Match-Details panels + Price section + adjustments + originally-
                      listed + View Details link — PRESERVED EXACTLY from prior SF
                      tile. Every existing datum (BINGO/RANGE/MAINT checkmarks,
                      adjustment reason/amount, adjustedPrice, listPrice, listingKey,
                      unitNumber, associationFee, userExactSqft) still renders. */}
                  <div className="px-4 pb-4 pt-3">

                  {/* Match Details for BINGO / BINGO-ADJ (SF only — SF axes panel; hidden for plex per h2) */}
                  {!isMultiUnitSubject && (result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ') && (
                    <div className="bg-emerald-50 rounded-lg p-4 mb-3 border border-emerald-200">
                      <p className="text-xs font-semibold text-emerald-900 mb-2">🎯 {result.matchTier === 'BINGO' ? 'Perfect Match' : 'Perfect Match (Adjusted)'}:</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600">✓</span>
                          <span className="text-slate-700">Exact sqft match: {comp.exactSqft} sqft {comp.userExactSqft ? `(yours: ${comp.userExactSqft} sqft, ±10%)` : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600">✓</span>
                          <span className="text-slate-700">Bedroom: {comp.bedrooms} bed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-emerald-600">✓</span>
                          <span className="text-slate-700">Bathroom: {comp.bathrooms} bath</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Match Details for RANGE / RANGE-ADJ (SF only — SF axes panel; hidden for plex per h2) */}
                  {!isMultiUnitSubject && (result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ') && (
                    <div className="bg-blue-50 rounded-lg p-4 mb-3 border border-blue-200">
                      <p className="text-xs font-semibold text-blue-900 mb-2">📊 {result.matchTier === 'RANGE' ? 'Same Size Match' : 'Same Size Match (Adjusted)'}:</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600">✓</span>
                          <span className="text-slate-700">Same sqft range: {comp.livingAreaRange}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600">✓</span>
                          <span className="text-slate-700">Bedroom: {comp.bedrooms} bed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-blue-600">✓</span>
                          <span className="text-slate-700">Bathroom: {comp.bathrooms} bath</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Match Details for MAINT / MAINT-ADJ (SF only — SF axes panel; hidden for plex per h2) */}
                  {!isMultiUnitSubject && (result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ') && (
                    <div className="bg-amber-50 rounded-lg p-4 mb-3 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-900 mb-2">🔧 {result.matchTier === 'MAINT' ? 'Similar Size Match' : 'Similar Size Match (Adjusted)'}:</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600">✓</span>
                          <span className="text-slate-700">
                            Similar maintenance: ${comp.associationFee ? Math.round(comp.associationFee) : 'N/A'}/month (±20%)
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600">✓</span>
                          <span className="text-slate-700">Sqft range: {comp.livingAreaRange}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600">✓</span>
                          <span className="text-slate-700">Bedroom: {comp.bedrooms} bed</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-amber-600">✓</span>
                          <span className="text-slate-700">Bathroom: {comp.bathrooms} bath</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Price Section */}
                  <div className="bg-white rounded-lg p-4 mt-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-slate-600">{isSale ? 'Sale' : 'Lease'} Price:</span>
                      <span className="text-lg font-bold text-slate-900">{formatPrice(comp.closePrice)}</span>
                    </div>

                    {/* Adjustments for ADJUSTED tier */}
                    {isSale && hasAdjustments && comp.adjustments!.map((adj, adjIdx) => (
                      <div key={adjIdx} className="flex justify-between items-center py-2 border-t border-slate-200">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm ${adj.adjustmentAmount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {adj.adjustmentAmount > 0 ? '↑' : '↓'}
                          </span>
                          <span className="text-sm text-slate-600">{adj.reason}</span>
                        </div>
                        <span className={`text-sm font-semibold ${adj.adjustmentAmount > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {adj.adjustmentAmount > 0 ? '+' : ''}{formatPrice(adj.adjustmentAmount)}
                        </span>
                      </div>
                    ))}

                    {isSale && hasAdjustments && (
                      <div className="flex justify-between items-center pt-3 mt-3 border-t-2 border-slate-300">
                        <span className="text-sm font-bold text-slate-900">Adjusted Value:</span>
                        <span className="text-xl font-bold text-emerald-600">{formatPrice(comp.adjustedPrice || comp.closePrice)}</span>
                      </div>
                    )}

                    {isSale && !hasAdjustments && result.matchTier === 'BINGO' && (
                      <div className="pt-3 mt-3 border-t-2 border-emerald-300">
                        <p className="text-sm font-semibold text-emerald-700 text-center">
                          ✨ Very similar home - no adjustments needed
                        </p>
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500">Originally listed:</span>
                      <span className="text-xs text-slate-500">{formatPrice(comp.listPrice)}</span>
                    </div>
                    
                     {!comp.unitNumber && comp.listingKey && comp.unparsedAddress && (
                      <a
                        href={generateHomePropertySlug({
                          unparsed_address: comp.unparsedAddress,
                          listing_key: comp.listingKey
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block text-center text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        View Property Details →
                      </a>
                    )}
                  </div>
                  </div>{/* h4: close px-4 SF enrichment wrapper */}
                </div>
              )
            })}
          </div>
        </div>

        {/* W-TAX-MATCH HOME (2026-06-11) — Tax-Matched Comparables section.
            Mirror of EstimatorResults.tsx (condo b1) on the home renderer.
            Co-equal to the geo comparables section above: same h3 header,
            same GeoConfidenceSpread (HOME_LABEL_MAP — Platinum=Same street),
            same simplified tile (photo + bed/bath/sqft + price + tax + tier
            badge pill). NO geo-tier match-detail panels (geo-mode specific).
            NO combined estimate. Gated on result.taxMatch.comparables.length
            > 0 + !isMultiUnitSubject (plex paths don't emit taxMatch). */}
        {!isMultiUnitSubject && result.taxMatch && result.taxMatch.comparables.length > 0 && (
          <div className="mt-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Tax-Matched Comparables ({result.taxMatch.count})
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                Matched by property tax — similar assessed value within the same municipality.
              </p>
              <div className="bg-white rounded-xl p-5 border border-slate-200 mb-4">
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm font-semibold text-slate-700">Tax-matched estimate</span>
                  <span className="text-2xl font-bold text-slate-900">{formatPrice(result.taxMatch.estimatedPrice)}</span>
                </div>
                <div className="text-xs text-slate-500">
                  Range: {formatPrice(result.taxMatch.priceRange.low)} – {formatPrice(result.taxMatch.priceRange.high)}
                </div>
              </div>
              {result.taxMatch.tiers && (
                <div className="mb-4">
                  {/* Section-level label: clarifies these tiers are derived
                      from the tax-mode cascade, not geo. Shared
                      GeoConfidenceSpread's internal title stays unchanged
                      (correct for the geo section above). */}
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Tax-Match Confidence Spread</h4>
                  <GeoConfidenceSpread
                    tiers={result.taxMatch.tiers}
                    bestGeoTier={result.taxMatch.bestGeoTier}
                    labelMap={HOME_LABEL_MAP}
                  />
                </div>
              )}
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {result.taxMatch.comparables.map((comp, idx) => {
                  // W-TAX-MATCH HOME b1-fix (2026-06-11): tier indicator
                  // moved from photo-pill overlay into the tile body. Labels
                  // via HOME_LABEL_MAP (name + sub: 'Platinum · Same street',
                  // etc.). Mirror of EstimatorResults.tsx tax-tile relocation.
                  const tierKey = (comp.sourceTier || result.taxMatch?.bestGeoTier || 'gold') as 'platinum' | 'gold' | 'silver' | 'bronze'
                  const tierLabel = HOME_LABEL_MAP[tierKey]
                  const tierBadgeColor =
                    tierKey === 'platinum' ? 'bg-emerald-600 text-white'
                    : tierKey === 'gold'   ? 'bg-amber-500 text-white'
                    : tierKey === 'silver' ? 'bg-slate-500 text-white'
                    :                        'bg-orange-700 text-white'
                  return (
                  <div key={idx} className="bg-slate-50 rounded-xl p-5 border-2 border-slate-200 hover:border-slate-300 transition-colors">
                    <div className="flex items-start gap-4 mb-3">
                      <div className="w-24 h-24 flex-shrink-0 bg-slate-100 rounded-lg relative overflow-hidden">
                        {comp.mediaUrl ? (
                          <img src={comp.mediaUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🏠</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="mb-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${tierBadgeColor}`}>
                            {tierLabel.emoji} {tierLabel.name} · {tierLabel.sub}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <p className="font-bold text-slate-900 text-lg">
                            {comp.bedrooms} bed, {comp.bathrooms} bath
                          </p>
                          {comp.propertySubtype && (
                            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              {badgeSubtype(comp.propertySubtype)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">
                          {comp.exactSqft ? `${comp.exactSqft} sqft` : comp.livingAreaRange + ' sqft'}
                        </p>
                        <p className="text-xs text-slate-500 truncate mt-1">
                          {comp.unparsedAddress?.split(',')[0] || '—'}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          Sold: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} • {comp.daysOnMarket} days on market
                        </p>
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-4 mt-3">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-slate-600">Sale Price:</span>
                        <span className="text-lg font-bold text-slate-900">{formatPrice(comp.closePrice)}</span>
                      </div>
                      {comp.taxAnnualAmount != null && comp.taxAnnualAmount > 0 && (
                        <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-100">
                          <span className="text-xs text-slate-500">Property tax:</span>
                          <span className="text-xs text-slate-500">${Math.round(comp.taxAnnualAmount).toLocaleString()}/yr</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                        <span className="text-xs text-slate-500">Originally listed:</span>
                        <span className="text-xs text-slate-500">{formatPrice(comp.listPrice)}</span>
                      </div>
                      {comp.listingKey && comp.unparsedAddress && (
                        <a
                          href={generateHomePropertySlug({ unparsed_address: comp.unparsedAddress, listing_key: comp.listingKey })}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 block text-center text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          View Property Details →
                        </a>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* h3 refinement — Competing-For-Sale rail (LOCKED v11 Option C,
            Principle 5). Now shows for ALL home subjects (SF + plex), each
            matched on its type's sold-comp criteria (server-side via
            findActiveCompetition). Income panel is PLEX-ONLY (subject gate
            isMultiUnitSubject) — SF tiles never render the income panel
            even if a stray row carries NOI. Tiles WITH income data get an
            indigo left-accent border + raised indigo-50 income panel. */}
        {competingListings && competingListings.length > 0 && (() => {
          const sortedByPrice = [...competingListings].sort((a, b) => a.list_price - b.list_price)
          const low = sortedByPrice[0].list_price
          const high = sortedByPrice[sortedByPrice.length - 1].list_price
          const noun = isMultiUnitSubject ? 'plex listing' : 'home'
          return (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Competing For Sale ({competingListings.length})
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                {competingListings.length} similar {noun}{competingListings.length === 1 ? '' : 's'} on the market now, {formatPrice(low)}–{formatPrice(high)} — your competition.
              </p>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {competingListings.map((cl, idx) => {
                  // h3 refinement: same Charlie horizontal card. Income panel
                  // PLEX-ONLY — gated on isMultiUnitSubject, not just row data.
                  const noi   = cl.net_operating_income ?? 0
                  const gross = cl.gross_revenue ?? 0
                  const lp    = cl.list_price ?? 0
                  const showIncome = isMultiUnitSubject && (noi > 0 || gross > 0)
                  const slug = cl.listing_key && cl.unparsed_address
                    ? generateHomePropertySlug({
                        unparsed_address: cl.unparsed_address,
                        listing_key: cl.listing_key,
                      })
                    : null
                  const Inner = (
                    <>
                      <div className="w-24 h-24 flex-shrink-0 bg-slate-100 relative overflow-hidden">
                        {cl.mediaUrl ? (
                          <img src={cl.mediaUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🏠</div>
                        )}
                        {/* h4: unified FOR SALE · SUBTYPE pill (blue-600 = for-sale). */}
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white">
                          FOR SALE{cl.property_subtype ? ` · ${badgeSubtype(cl.property_subtype)}` : ''}
                        </span>
                      </div>

                      <div className="flex-1 px-3 py-2 min-w-0">
                        <div className="flex justify-between items-start mb-0.5">
                          <span className="text-base font-bold text-slate-900">
                            {formatPrice(lp)}
                          </span>
                          {cl.days_on_market != null && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${plexDomTone(cl.days_on_market)}`}>
                              {cl.days_on_market}d on market
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mb-0.5">
                          {cl.unparsed_address?.split(',')[0] || '—'}
                        </div>

                        {/* h3 refinement: ELEVATED income panel — plex-only. Cap
                            rate at asking (NOI / list_price). */}
                        {showIncome && (
                          <div className="mt-1 mb-1 px-2 py-1 rounded bg-indigo-50 border border-indigo-100 flex flex-wrap gap-x-2 gap-y-0 items-baseline text-[11px]">
                            {noi > 0 && lp > 0 && (
                              <span className="text-sm font-bold text-indigo-700">{((noi / lp) * 100).toFixed(1)}%<span className="text-[10px] font-medium text-indigo-600"> cap</span></span>
                            )}
                            {noi > 0 && (
                              <span className="text-slate-700"><span className="font-semibold text-slate-900">NOI</span> {formatPrice(noi)}</span>
                            )}
                            {gross > 0 && (
                              <span className="text-slate-700"><span className="font-semibold text-slate-900">Gross</span> {formatPrice(gross)}</span>
                            )}
                            {gross > 0 && lp > 0 && (
                              <span className="text-slate-700"><span className="font-semibold text-slate-900">GRM</span> {(lp / gross).toFixed(1)}</span>
                            )}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                          {cl.bedrooms_total != null && <span>{cl.bedrooms_total} bed</span>}
                          {cl.bathrooms_total_integer != null && <span>{cl.bathrooms_total_integer} bath</span>}
                          {cl.living_area_range && <span>{cl.living_area_range} sqft</span>}
                        </div>
                      </div>
                    </>
                  )
                  const baseClasses = "flex bg-white border border-slate-200 hover:border-slate-300 rounded-xl overflow-hidden transition-colors"
                  const accentClass = showIncome ? ' border-l-2 border-l-indigo-500' : ''
                  const tileClasses = baseClasses + accentClass
                  return slug ? (
                    <a key={cl.id ?? idx} href={slug} target="_blank" rel="noopener noreferrer" className={tileClasses + ' cursor-pointer'}>
                      {Inner}
                    </a>
                  ) : (
                    <div key={cl.id ?? idx} className={tileClasses}>
                      {Inner}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Standard Disclaimer */}
        <div className="text-xs text-slate-500 pt-4 border-t">
          <p>
            * This estimate is based on recent {isSale ? 'sales' : 'lease'} data and market analysis. Actual market {isSale ? 'value' : 'rent'} may vary based on home condition, lot features, finishes, and current market conditions. Contact an agent for a professional evaluation.
          </p>
        </div>
      </div>

      {/* IMPORTANT DISCLAIMER + CONTACT AGENT */}
      <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 rounded-2xl border-2 border-amber-300 p-8 shadow-lg">
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-8 h-8 text-amber-600" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">
              Important: AI Estimates Require Human Verification
            </h3>
            <div className="space-y-3 text-gray-700">
              <p className="font-semibold">
                While our algorithm analyzes hundreds of data points, these numbers should NOT be relied upon for making financial decisions.
              </p>
              <ul className="space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span> Home condition, lot features, and upgrades significantly impact value </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Market dynamics change daily - timing matters</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span>Building reputation and location nuances aren't captured by algorithms</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-1">•</span>
                  <span className="font-bold">Human expertise is irreplaceable - talk to a real agent for accurate pricing</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        {!submitted ? (
          !showContactForm ? (
            <button
              onClick={() => setShowContactForm(true)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-5 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-3 text-lg"
            >
              <MessageSquare className="w-6 h-6" />
              Talk to an Agent - Get Accurate Pricing
            </button>
          ) : (
            <form onSubmit={handleContactSubmit} className="bg-white rounded-xl p-6 space-y-4">
              <h4 className="font-bold text-gray-900 text-lg mb-4">Connect with Your Agent</h4>
              {submitError && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {submitError}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Name *</label>
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(e) => setContactForm({...contactForm, name: e.target.value})}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                <input
                  type="email"
                  required
                  value={contactForm.email}
                  onChange={(e) => setContactForm({...contactForm, email: e.target.value})}
                  placeholder="john@example.com"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Phone</label>
                <input
                  type="tel"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({...contactForm, phone: e.target.value})}
                  placeholder="(416) 555-1234"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-lg transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Sending...' : 'Get Professional Evaluation'}
              </button>
            </form>
          )
        ) : (
          <div className="bg-green-50 border-2 border-green-300 rounded-xl p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-xl font-bold text-green-900 mb-2">Request Received!</h4>
            <p className="text-green-800">Your agent will contact you within 24 hours with an accurate market evaluation.</p>
          </div>
        )}
      </div>
    </div>
  )
}
