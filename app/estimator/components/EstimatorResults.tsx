// app/estimator/components/EstimatorResults.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { EstimateResult, TEMPERATURE_CONFIG } from '@/lib/estimator/types'
import { formatPrice } from '@/lib/utils/formatters'
import GeoConfidenceSpread, { CONDO_LABEL_MAP } from './GeoConfidenceSpread'
import type { CompetingListing } from './HomeEstimatorResults'
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

interface EstimatorResultsProps {
  result: EstimateResult
  type?: 'sale' | 'lease' | 'estimator'
  buildingId: string
  buildingName: string
  buildingAddress?: string
  unitNumber?: string
  agentId?: string
  propertySpecs: any
  // W-CONDO-MODAL-PARITY Phase 2 (2026-06-11) — Competing-For-Sale rail.
  // Optional, gated on .length > 0 — S1 path (no useCompetingListings call)
  // leaves it empty/undefined, so the rail auto-hides.
  competingListings?: CompetingListing[]
  // W-COMPETING-INTO-WORKINGDOC (Option B, 2026-06-18): resolved-array prop
  // from the parent buyer modal. Parent awaits fetchCompetingListings then
  // passes the result here so the fire-on-generate IIFE can build a
  // workingDoc with populated competing without an inline fetch. Falls back
  // to competingListings when undefined (S1 path / form-submit fallback).
  resolvedCompeting?: CompetingListing[]
}

export default function EstimatorResults({
  result,
  type = 'sale',
  buildingId,
  buildingName,
  buildingAddress,
  unitNumber,
  agentId,
  propertySpecs,
  competingListings,
  resolvedCompeting,
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
  // L171-251 of the pre-fix file — so the rich 3-section payload that
  // worked from the form path now ALSO ships from the generate path.
  // Pure function, no state reads. Caller supplies the values.
  // W-COMPETING-INTO-WORKINGDOC (Option B, 2026-06-18): buildWorkingDoc
  // reads the resolvedCompeting prop (race-free, populated atomically with
  // result by the parent). Falls back to the competingListings prop when
  // resolvedCompeting is undefined (S1 path or form-submit fallback at
  // L480). Single source of truth — same array the on-screen Competing
  // section maps over (when resolvedCompeting is populated, the hook state
  // is also populated, so on-screen + workingDoc render the same data).
  function buildWorkingDoc(): any {
    const competingSrc = (resolvedCompeting !== undefined ? resolvedCompeting : competingListings) || []
    return {
      version: 1,
      type: 'condo',
      subject: {
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
              // attachMediaUrls in condo / home matcher).
              mediaUrl: c.mediaUrl ?? null,
              // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): matchQuality +
              // per-comp adjustments (the ±$amount diffs).
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
            // matchTier + priceRange + tiers (the SECOND 4-tier rail
            // distinct from the geo cascade).
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
            // W-COMPETING-GEO-PILLS (2026-06-19): section-level bestGeoTier
            // = the tile-level tier (uniform per response — condo path
            // queries community only → always 'gold'). Same shape as the
            // home IIFE at HomeEstimatorResults.tsx; cross-surface email +
            // lead render the same chip from the same field.
            bestGeoTier: (competingSrc[0] as any)?.sourceTier ?? null,
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
              // W-COMPETING-GEO-PILLS (2026-06-19): tier stamped at the
              // condo route source (route.ts L92, always 'gold').
              // Threaded here so workingDoc.competing.tiles[] carries it
              // into email + lead — same field name the home IIFE uses.
              sourceTier: c.sourceTier ?? null,
            })),
          }
        : null,
    }
  }

  // W-ESTIMATOR-FIRE-ON-GENERATE: fire-on-generate effect. Once the
  // estimate result is ready AND the user is authed AND we know which
  // agent to route to, write the lead with the full workingDoc payload
  // and log the activity. forceNew=true → creates a fresh lead +
  // triggers the helper-driven email fan-out (agent TO + chain CC/BCC
  // + buyer copy via working-doc-render.ts).
  //
  // Anonymous gate: if user is null, do NOT fire (the parent modal
  // shows RegisterModal first). If agentId is missing (public context),
  // do NOT fire — matches the existing handleContactSubmit early-exit
  // at L111-116 of the pre-fix file.
  //
  // Fire-once: keyed on the result identity (we use the listings'
  // joined keys + estimatedPrice as a cheap stable fingerprint). React
  // re-renders for state changes (e.g. setSubmitted) do not re-fire.
  useEffect(() => {
    if (!user || !user.email) return
    if (!agentId) return
    if (!result) return
    // Build a stable fingerprint of THIS result so re-renders for the
    // same result don't re-fire. Different result on the same component
    // (rare — usually the parent re-mounts) re-fires.
    const fingerprint = `${result.estimatedPrice ?? 'n'}|${result.priceRange?.low ?? 'n'}|${result.priceRange?.high ?? 'n'}|${(result.comparables || []).map((c: any) => c.listingKey ?? '').join(',')}`
    if (generateFiredRef.current === fingerprint) return
    generateFiredRef.current = fingerprint

    // Capture for the async IIFE so TS narrows past the closure boundary.
    const userEmail = user.email

    ;(async () => {
      // W-COMPETING-INTO-WORKINGDOC (Option B, 2026-06-18): no inline
      // fetch. The parent buyer modal awaits fetchCompetingListings and
      // passes the resolved array through resolvedCompeting prop in the
      // same batched render that exposes `result`. buildWorkingDoc()
      // reads that prop directly — one source of truth, race eliminated
      // by ordering rather than re-fetching.
      const workingDoc = buildWorkingDoc()
      const message = result.showPrice
        ? `Received estimate for ${buildingName}${unitNumber ? ` Unit ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}: ${formatPrice(result.estimatedPrice)} (${formatPrice(result.priceRange.low)} - ${formatPrice(result.priceRange.high)}). ${propertySpecs?.bedrooms || 'N/A'}BR/${propertySpecs?.bathrooms || 'N/A'}BA, ${propertySpecs?.livingAreaRange || 'N/A'} sqft. Confidence: ${result.confidence}. Estimate generated automatically.`
        : `Requesting valuation for ${buildingName}${unitNumber ? ` Unit ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}. ${propertySpecs?.bedrooms || 'N/A'}BR/${propertySpecs?.bathrooms || 'N/A'}BA, ${propertySpecs?.livingAreaRange || 'N/A'} sqft. Unit requires professional analysis - no automated estimate available.`
      try {
        const leadResult = await submitLeadFromForm({
          agentId,
          // Use auth-context data; name/phone may be empty until the
          // optional form-submit enriches. email is required and known
          // because of the !user.email guard above.
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
          listingId: propertySpecs?.listingId,
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
          console.error('[EstimatorResults] fire-on-generate lead-write failed:', errMsg)
        }
        // Activity log (per-action type)
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
        console.error('[EstimatorResults] fire-on-generate error:', err)
      }
    })()
  // contactForm fields are READ inside the effect for prefill, but the
  // effect MUST NOT re-run when the user types in the form — that would
  // re-fire the lead-create. Deps deliberately omit contactForm.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, agentId, result, type, buildingId, buildingName, buildingAddress, unitNumber, propertySpecs, competingListings, resolvedCompeting])

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
    'BINGO': { label: 'Perfect Matches', description: 'Identical units with exact sqft (±10%)' },
    'BINGO-ADJ': { label: 'Perfect Matches (Adjusted)', description: 'Identical sqft with parking/locker adjustments' },
    'RANGE': { label: 'Same Size Units', description: 'Same sqft range with matching specs' },
    'RANGE-ADJ': { label: 'Same Size Units (Adjusted)', description: 'Same sqft range with parking/locker adjustments' },
    'MAINT': { label: 'Similar Size Units', description: 'Similar maintenance fee (±20%) as size proxy' },
    'MAINT-ADJ': { label: 'Similar Size Units (Adjusted)', description: 'Similar maintenance with parking/locker adjustments' },
    'CONTACT': { label: 'Market Reference', description: 'Recent sales for context only' }
  }

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
      ? `Received estimate for ${buildingName}${unitNumber ? ` Unit ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}: ${formatPrice(result.estimatedPrice)} (${formatPrice(result.priceRange.low)} - ${formatPrice(result.priceRange.high)}). ${specs.bedrooms || 'N/A'}BR/${specs.bathrooms || 'N/A'}BA, ${specs.livingAreaRange || 'N/A'} sqft. Confidence: ${result.confidence}. Would like to discuss accurate valuation.`
      : `Requesting valuation for ${buildingName}${unitNumber ? ` Unit ${unitNumber}` : ''}${buildingAddress ? ` (${buildingAddress})` : ''}. ${specs.bedrooms || 'N/A'}BR/${specs.bathrooms || 'N/A'}BA, ${specs.livingAreaRange || 'N/A'} sqft. Unit requires professional analysis - no automated estimate available.`

    if (!agentId) {
      // Public context (no agent routing): nothing to enrich; just
      // acknowledge the submit. Matches prior behaviour.
      setSubmitted(true)
      setShowContactForm(false)
      setIsSubmitting(false)
      return
    }

    // Resolve the target leadId.
    //   1) Prefer the leadId captured by the fire-on-generate effect.
    //   2) Fallback (race / rare failure of generate-fire) — call
    //      submitLeadFromForm with forceNew=FALSE so createLead's dedup
    //      helper returns the existing row. The helper does NOT re-fire
    //      the email when the dedup key (email, tenant, listing|building)
    //      hits. Worst case (no row at all → generate-fire really did
    //      fail), the dedup miss DOES insert + email — that recovers
    //      the lead. Either way, exactly one lead, at most one email.
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
          listingId: propertySpecs?.listingId,
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
          console.error('[EstimatorResults] dedup-resolve failed:', errMsg)
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
          console.error('[EstimatorResults] updateLeadEnrichment failed:', enrichResult.error)
          setSubmitError(enrichResult.error || 'We could not submit your request right now. Please try again.')
        }
      }
    } catch (error) {
      console.error('[EstimatorResults] enrichment exception:', error)
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
              {result.confidenceMessage || 'Your unit has unique characteristics that require professional analysis for accurate pricing.'}
            </p>
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
                <h3 className="text-lg font-bold text-slate-900">Market Reference (Not Direct Comparables)</h3>
                <p className="text-sm text-slate-600 mt-1">
                  These recent sales in your building differ from your unit but provide market context.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {result.comparables.map((comp, idx) => (
                <div key={idx} className="bg-slate-50 rounded-xl p-5 border-2 border-slate-200">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {comp.unitNumber && (
                          <span className="text-sm font-semibold text-slate-500">Unit {comp.unitNumber}</span>
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
                        {comp.livingAreaRange} sqft • {comp.parking} parking • {comp.locker === 'Owned' ? 'Has locker' : 'No locker'}
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
                  {comp.buildingSlug && comp.unitNumber && comp.listingKey && (
                     <a                 
                      href={`/${comp.buildingSlug}-unit-${comp.unitNumber}-${comp.listingKey.toLowerCase()}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block text-center text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View Property Details →
                    </a>
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
              ⚠️ These are for reference only. Contact agent for accurate valuation of your specific unit.
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
            (average of {result.comparables.length} {result.matchTier === 'BINGO' ? 'identical' : 'comparable'} unit{result.comparables.length > 1 ? 's' : ''})
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

        {/* W-CONDO-MODAL-PARITY Phase 2 (2026-06-11) — Geographic Confidence
            Spread (Platinum=Same Building / Gold=Community / Silver=Muni /
            Bronze=Area). Gated on result.tiers — S2 condo path
            (estimateCondoSale/estimateCondoRent) populates this; the legacy
            shared S1 condo path leaves it undefined, so the block auto-hides
            and S1 UX is byte-identical to pre-Phase-2. */}
        {result.tiers && (
          <GeoConfidenceSpread
            tiers={result.tiers}
            bestGeoTier={result.bestGeoTier}
            labelMap={CONDO_LABEL_MAP}
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
            {result.matchTier === 'BINGO' ? 'Perfect Matches' : 
             result.matchTier === 'BINGO-ADJ' ? 'Perfect Matches (Adjusted)' : 
             result.matchTier === 'RANGE' ? 'Same Size Units' :
             result.matchTier === 'RANGE-ADJ' ? 'Same Size Units (Adjusted)' :
             result.matchTier === 'MAINT' ? 'Similar Size Units' :
             result.matchTier === 'MAINT-ADJ' ? 'Similar Size Units (Adjusted)' :
             'Comparables'} ({result.comparables.length})
          </h3>
          <div className="space-y-4 max-h-[600px] overflow-y-auto">
            {result.comparables.map((comp, idx) => {
              const hasAdjustments = comp.adjustments && comp.adjustments.length > 0
              // Geo-tier chip — uniform per section. The geo cascade returns
              // mono-tier comps from result.bestGeoTier; the chip mirrors the
              // tax-tile body chip shipped in df4419d. Skipped on CONTACT-
              // tier (bestGeoTier === 'none') — no chip, no crash.
              const geoTierKey = result.bestGeoTier && result.bestGeoTier !== 'none' ? result.bestGeoTier as 'platinum' | 'gold' | 'silver' | 'bronze' : null
              const geoTierLabel = geoTierKey ? CONDO_LABEL_MAP[geoTierKey] : null
              const geoTierBadgeColor = !geoTierKey ? ''
                : geoTierKey === 'platinum' ? 'bg-emerald-600 text-white'
                : geoTierKey === 'gold'     ? 'bg-amber-500 text-white'
                : geoTierKey === 'silver'   ? 'bg-slate-500 text-white'
                :                             'bg-orange-700 text-white' // bronze

              return (
                <div key={idx} className="bg-slate-50 rounded-xl p-5 border-2 border-slate-200 hover:border-slate-300 transition-colors">
                  <div className="flex items-start gap-4 mb-3">
                    {/* W-CONDO-MODAL-PARITY follow-up (2026-06-11) — 96x96 photo
                        column mirroring HomeEstimatorResults.tsx:619-630. When
                        comp.mediaUrl is null (no thumbnail in the media table
                        for this listing) → 🏢 fallback, identical to home's
                        🏠 fallback pattern (no broken-img icon). */}
                    <div className="w-24 h-24 flex-shrink-0 bg-slate-100 rounded-lg relative overflow-hidden">
                      {comp.mediaUrl ? (
                        <img src={comp.mediaUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">🏢</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {geoTierLabel && (
                        <div className="mb-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${geoTierBadgeColor}`}>
                            {geoTierLabel.emoji} {geoTierLabel.name} · {geoTierLabel.sub}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {comp.unitNumber && (
                          <span className="text-sm font-semibold text-slate-500">Unit {comp.unitNumber}</span>
                        )}
                        <p className="font-bold text-slate-900 text-lg">
                          {comp.bedrooms} bed, {comp.bathrooms} bath
                        </p>
                        {/* Temperature Badge */}
                        {comp.temperature && (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${temperatureDisplay[comp.temperature].color}`}>
                            {temperatureDisplay[comp.temperature].icon} {temperatureDisplay[comp.temperature].label}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-slate-600">
                        {comp.exactSqft ? `${comp.exactSqft} sqft` : comp.livingAreaRange + ' sqft'} • {comp.parking} parking • {comp.locker === 'Owned' ? 'Has locker' : 'No locker'}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {isSale ? 'Sold' : 'Leased'}: {new Date(comp.closeDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} • {comp.daysOnMarket} days on market
                      </p>
                    </div>
                  </div>

                  {/* Match Details for BINGO / BINGO-ADJ */}
                  {(result.matchTier === 'BINGO' || result.matchTier === 'BINGO-ADJ') && (
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

                  {/* Match Details for RANGE / RANGE-ADJ */}
                  {(result.matchTier === 'RANGE' || result.matchTier === 'RANGE-ADJ') && (
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

                  {/* Match Details for MAINT / MAINT-ADJ */}
                  {(result.matchTier === 'MAINT' || result.matchTier === 'MAINT-ADJ') && (
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
                          ✨ Identical unit specifications - no adjustments needed
                        </p>
                      </div>
                    )}

                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500">Originally listed:</span>
                      <span className="text-xs text-slate-500">{formatPrice(comp.listPrice)}</span>
                    </div>
                    {comp.buildingSlug && comp.unitNumber && comp.listingKey && (
                      <a
                        href={`/${comp.buildingSlug}-unit-${comp.unitNumber}-${comp.listingKey.toLowerCase()}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block text-center text-sm font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        View Property Details →
                      </a>
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
                </div>
              )
            })}
          </div>
        </div>

        {/* W-TAX-MATCH (2026-06-11) — Tax-Matched Comparables section.
            Co-equal to the geo comparables section above: same h3 header
            level, same GeoConfidenceSpread component (just fed
            result.taxMatch.tiers instead of result.tiers), same photo tile
            (photo + info + price + View link). NO geo-tier match-detail
            panels (BINGO/RANGE/MAINT make no sense for tax-mode — the
            match was by property tax, not sqft/maint band). NO combined/
            blended headline number (backtest measured worse than tax
            alone). Gated on result.taxMatch.comparables.length > 0 — S1
            path, no-tax subjects, and lease paths leave taxMatch
            undefined or empty -> section auto-hides cleanly. */}
        {result.taxMatch && result.taxMatch.comparables.length > 0 && (
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
                      from the tax-mode cascade, not geo. The shared
                      GeoConfidenceSpread component's internal title stays
                      "Geographic Confidence Spread" (correct for the geo
                      section above); this h4 sits above it in the tax
                      section only. */}
                  <h4 className="text-xs font-bold uppercase tracking-wide text-slate-600 mb-2">Tax-Match Confidence Spread</h4>
                  <GeoConfidenceSpread
                    tiers={result.taxMatch.tiers}
                    bestGeoTier={result.taxMatch.bestGeoTier}
                    labelMap={CONDO_LABEL_MAP}
                  />
                </div>
              )}
              <div className="space-y-4 max-h-[600px] overflow-y-auto">
                {result.taxMatch.comparables.map((comp, idx) => {
                  // W-TAX-MATCH b1-fix (2026-06-11): tier indicator moved from
                  // photo-pill overlay into the tile body so it reads as
                  // descriptive content alongside unit/beds/sqft/price rather
                  // than a photo badge. Color-coded chip preserved via the
                  // same tierBadgeColor map; labels come from CONDO_LABEL_MAP
                  // (name + sub: 'Platinum · Same Building', etc.).
                  const tierKey = (comp.sourceTier || result.taxMatch?.bestGeoTier || 'gold') as 'platinum' | 'gold' | 'silver' | 'bronze'
                  const tierLabel = CONDO_LABEL_MAP[tierKey]
                  const tierBadgeColor =
                    tierKey === 'platinum' ? 'bg-emerald-600 text-white'
                    : tierKey === 'gold'   ? 'bg-amber-500 text-white'
                    : tierKey === 'silver' ? 'bg-slate-500 text-white'
                    :                        'bg-orange-700 text-white' // bronze
                  return (
                  <div key={idx} className="bg-slate-50 rounded-xl p-5 border-2 border-slate-200 hover:border-slate-300 transition-colors">
                    <div className="flex items-start gap-4 mb-3">
                      <div className="w-24 h-24 flex-shrink-0 bg-slate-100 rounded-lg relative overflow-hidden">
                        {comp.mediaUrl ? (
                          <img src={comp.mediaUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🏢</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="mb-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${tierBadgeColor}`}>
                            {tierLabel.emoji} {tierLabel.name} · {tierLabel.sub}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {comp.unitNumber && (
                            <span className="text-sm font-semibold text-slate-500">Unit {comp.unitNumber}</span>
                          )}
                          <p className="font-bold text-slate-900 text-lg">
                            {comp.bedrooms} bed, {comp.bathrooms} bath
                          </p>
                          {comp.temperature && (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${temperatureDisplay[comp.temperature].color}`}>
                              {temperatureDisplay[comp.temperature].icon} {temperatureDisplay[comp.temperature].label}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600">
                          {comp.exactSqft ? `${comp.exactSqft} sqft` : comp.livingAreaRange + ' sqft'} • {comp.parking} parking • {comp.locker === 'Owned' ? 'Has locker' : 'No locker'}
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
                      {comp.buildingSlug && comp.unitNumber && comp.listingKey && (
                        <a
                          href={`/${comp.buildingSlug}-unit-${comp.unitNumber}-${comp.listingKey.toLowerCase()}`}
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

        {/* W-CONDO-MODAL-PARITY Phase 2 (2026-06-11) — Competing-For-Sale
            rail. Mirror of HomeEstimatorResults' rail (887-985) MINUS the
            plex-only income panel (condos aren't multi-unit-income). Tile
            shows unit_number + beds/baths + LAR + price + DOM + assoc_fee +
            mediaUrl + View Property link. Gated on competingListings.length
            > 0 — empty array (S1 path, or no active comps) auto-hides. */}
        {competingListings && competingListings.length > 0 && (() => {
          const sortedByPrice = [...competingListings].sort((a, b) => a.list_price - b.list_price)
          const low = sortedByPrice[0].list_price
          const high = sortedByPrice[sortedByPrice.length - 1].list_price
          return (
            <div className="mt-8">
              <h3 className="text-lg font-bold text-slate-900 mb-1">
                Competing For Sale ({competingListings.length})
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                {competingListings.length} similar unit{competingListings.length === 1 ? '' : 's'} on the market now, {formatPrice(low)}–{formatPrice(high)} — your competition.
              </p>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {competingListings.map((cl, idx) => {
                  const lp = cl.list_price ?? 0
                  const href = `/property/${cl.id}`
                  const Inner = (
                    <>
                      <div className="w-24 h-24 flex-shrink-0 bg-slate-100 relative overflow-hidden">
                        {cl.mediaUrl ? (
                          <img src={cl.mediaUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">🏢</div>
                        )}
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-600 text-white">
                          FOR SALE{cl.unit_number ? ` · #${cl.unit_number}` : ''}
                        </span>
                      </div>
                      <div className="flex-1 px-3 py-2 min-w-0">
                        {/* W-COMPETING-GEO-PILLS (2026-06-19): geo-tier
                            badge — mirrors the tax-match condo tile
                            shape at L1087-L1093 above, using
                            CONDO_LABEL_MAP (Platinum=Same Building,
                            Gold=Community, etc.). Condo competing
                            cascade is single-level community only
                            (app/api/charlie/competing-listings/route.ts
                            L25-L92), so the condo route stamps
                            sourceTier='gold' on every returned row →
                            the badge here is uniform Gold for every
                            tile in the response. Silent-omit when
                            sourceTier absent (legacy fixtures, S1
                            path, honest-empty). */}
                        {cl.sourceTier && (() => {
                          const tierKey = cl.sourceTier as 'platinum' | 'gold' | 'silver' | 'bronze'
                          const tierLabel = CONDO_LABEL_MAP[tierKey]
                          const tierBadgeColor =
                            tierKey === 'platinum' ? 'bg-emerald-600 text-white'
                            : tierKey === 'gold'   ? 'bg-amber-500 text-white'
                            : tierKey === 'silver' ? 'bg-slate-500 text-white'
                            :                        'bg-orange-700 text-white'
                          return (
                            <div className="mb-1">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${tierBadgeColor}`}>
                                {tierLabel.emoji} {tierLabel.name} · {tierLabel.sub}
                              </span>
                            </div>
                          )
                        })()}
                        <div className="flex justify-between items-start mb-0.5">
                          <span className="text-base font-bold text-slate-900">
                            {formatPrice(lp)}
                          </span>
                          {cl.days_on_market != null && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              {cl.days_on_market}d on market
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mb-0.5">
                          {cl.unparsed_address?.split(',')[0] || '—'}
                        </div>
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                          {cl.bedrooms_total != null && <span>{cl.bedrooms_total} bed</span>}
                          {cl.bathrooms_total_integer != null && <span>{cl.bathrooms_total_integer} bath</span>}
                          {cl.living_area_range && <span>{cl.living_area_range} sqft</span>}
                          {cl.association_fee != null && cl.association_fee > 0 && (
                            <span>${Math.round(cl.association_fee)}/mo maint</span>
                          )}
                        </div>
                      </div>
                    </>
                  )
                  const tileClasses = 'flex bg-white border border-slate-200 hover:border-slate-300 rounded-xl overflow-hidden transition-colors'
                  return (
                    <a key={cl.id ?? idx} href={href} target="_blank" rel="noopener noreferrer" className={tileClasses + ' cursor-pointer'}>
                      {Inner}
                    </a>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* Standard Disclaimer */}
        <div className="text-xs text-slate-500 pt-4 border-t">
          <p>
            * This estimate is based on recent {isSale ? 'sales' : 'lease'} data and market analysis. Actual market {isSale ? 'value' : 'rent'} may vary based on unit condition, view, finishes, and current market conditions. Contact an agent for a professional evaluation.
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
                  <span>Unit condition, view quality, and upgrades significantly impact value</span>
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