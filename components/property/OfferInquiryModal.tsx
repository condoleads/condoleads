'use client'

import { useState, useEffect, useRef } from 'react'
import { submitLeadFromForm } from '@/app/actions/submitLeadFromForm'
import { submitActivityFromForm } from '@/app/actions/submitActivityFromForm'
import { estimateHomeSale } from '@/app/estimator/actions/estimate-home-sale'
import { estimateCondoSale } from '@/app/estimator/actions/estimate-condo-sale'
import { useAuth } from '@/components/auth/AuthContext'
import type { MLSListing } from '@/lib/types/building'
import type { EstimateResult } from '@/lib/estimator/types'

// W-OFFER-MODAL-WALLIAM-GATE (2026-06-17): props refactored.
// Was `agent: { id, full_name }` — a non-null object the parent could
// not produce on the WALLiam hero render (parent passes agent=null when
// isHero=true at HomePropertyPage.tsx:308). The modal's mount gate at
// HomePropertyPageClient.tsx:276 therefore short-circuited on the hero
// path and the modal never rendered — no form, no submit, no server
// action, no leads/activities written. Buttons looked dead.
//
// New shape: agentId + agentName as plain strings. The parent computes
// both from `agent?.id || walliamAgentId` and `agent?.full_name ||
// assistantName || 'our team'` — host-resolved, tenant-driven, no
// hardcoded WALLiam-specific anything. Matches the working
// HomeEstimatorBuyerModal pattern at HomePropertyPageClient.tsx:268.
//
// W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17): listing prop widened to the
// full MLSListing row and additive props (isHome, tenantId, buildingId,
// buildingSlug, buildingAddress, exactSqft) added so the modal can run
// the SAME estimator engine + workingDoc builder the Get Estimate path
// uses. Engine runs silently on mount — UI is UNCHANGED — purely to
// produce the rich 3-section payload that ships in the agent email.
interface OfferInquiryModalProps {
  isOpen: boolean
  onClose: () => void
  listing: MLSListing
  buildingName: string
  isSale: boolean
  agentId: string
  agentName: string
  // W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17) additive — all optional so
  // System 1 / agent-domain callers that pre-date this change continue
  // to work; without these the modal falls back to the legacy thin-
  // payload form-submit path (no engine run, no fire-on-generate).
  isHome?: boolean
  tenantId?: string
  buildingId?: string
  buildingSlug?: string
  buildingAddress?: string
  exactSqft?: number | null
}

// W-ESTIMATOR-FIRE-ON-GENERATE: workingDoc shape MUST mirror lib/email/
// working-doc-render.ts (WorkingDoc) so the email + dashboard read from
// one source of truth. Tile shapes mirror EstimatorResults.tsx and
// HomeEstimatorResults.tsx — same fields, same slice(0,10) cap, same
// null-coalescing.
function buildOfferWorkingDoc(args: {
  type: 'home' | 'condo'
  listing: MLSListing
  buildingName: string
  buildingAddress?: string
  result: EstimateResult | null
  competingListings: any[]
}): any {
  const { type, listing, buildingName, buildingAddress, result, competingListings } = args
  return {
    version: 1,
    type,
    subject: {
      listingId: listing.id,
      buildingName,
      buildingAddress: buildingAddress || listing.unparsed_address || null,
      unitNumber: listing.unit_number || null,
      bedrooms: listing.bedrooms_total ?? null,
      bathrooms: listing.bathrooms_total_integer ?? null,
      livingAreaRange: listing.living_area_range ?? null,
    },
    estimate: result ? {
      estimatedPrice: result.showPrice ? result.estimatedPrice : null,
      priceRange: result.priceRange ?? null,
      matchTier: result.matchTier ?? null,
      bestGeoTier: (result as any).bestGeoTier ?? null,
      confidence: result.confidence ?? null,
      confidenceMessage: result.confidenceMessage ?? null,
    } : null,
    // W-ESTIMATOR-TIER-RAIL (2026-06-17): 4-row "Confidence by Area"
    // rail data, sourced from EstimateResult.tiers (lib/estimator/
    // types.ts TierResult). Matcher populates every successful call;
    // we capture {count, median, range, estimatedPrice} per slot and
    // null when the matcher's cascade had no comparables at that tier.
    // ADDITIVE — does not change any existing workingDoc field.
    tiers: result && (result as any).tiers
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
    comparableSold: result && Array.isArray(result.comparables) && result.comparables.length > 0
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
            // ComparableSale already carries `mediaUrl` populated by the
            // matcher's attachMediaUrls (condo-comparable-matcher-sales.ts
            // :220-234, home-comparable-matcher-sales.ts equivalent). Tile
            // builder just needs to forward it.
            mediaUrl: c.mediaUrl ?? null,
          })),
        }
      : null,
    taxMatch: result && (result as any).taxMatch && Array.isArray((result as any).taxMatch.comparables) && (result as any).taxMatch.comparables.length > 0
      ? {
          bestGeoTier: (result as any).taxMatch.bestGeoTier ?? null,
          count: (result as any).taxMatch.count ?? (result as any).taxMatch.comparables.length,
          estimatedPrice: (result as any).taxMatch.estimatedPrice ?? null,
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
          })),
        }
      : null,
    competing: Array.isArray(competingListings) && competingListings.length > 0
      ? {
          count: competingListings.length,
          tiles: competingListings.slice(0, 10).map((c: any) => ({
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
            // competing endpoint already returns mediaUrl per listing
            // (app/api/charlie/competing-listings/route.ts:62-71). Forward.
            mediaUrl: c.mediaUrl ?? null,
          })),
        }
      : null,
  }
}

export default function OfferInquiryModal({
  isOpen,
  onClose,
  listing,
  buildingName,
  isSale,
  agentId,
  agentName,
  isHome,
  tenantId,
  buildingId,
  buildingSlug,
  buildingAddress,
  exactSqft,
}: OfferInquiryModalProps) {
  const { user } = useAuth()
  const defaultMessage = isSale
    ? `I'm interested in making an offer on Unit ${listing.unit_number || ''} at ${buildingName}. Please contact me to discuss.`
    : `I'm interested in applying for the lease on Unit ${listing.unit_number || ''} at ${buildingName}. Please contact me to discuss.`

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: defaultMessage
  })
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // W-ESTIMATOR-OFFER-FIRE-ONCE (2026-06-17): in-mount fire-once ref.
  // Kept as a fallback when sessionStorage is unavailable (SSR / privacy
  // mode / iframe sandbox). The session-persistent guard below is the
  // primary mechanism; this ref handles the within-mount race only.
  const generateFiredRef = useRef<string | null>(null)

  // Pre-fill form from auth context when available
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        ...prev,
        name: prev.name || user.user_metadata?.full_name || user.user_metadata?.name || '',
        email: prev.email || user.email || '',
        phone: prev.phone || user.user_metadata?.phone || '',
      }))
    }
  }, [user])

  // Reset transient state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSubmitted(false)
      generateFiredRef.current = null
    }
  }, [isOpen])

  // W-ESTIMATOR-FIRE-ON-GENERATE (2026-06-17) / W-ESTIMATOR-OFFER-FIRE-
  // ONCE (2026-06-17): the user CLICK on the Sale Offer / Lease Offer
  // button is itself the conversion event. The click silently runs the
  // estimator engine + competing-listings fetch, builds the rich
  // workingDoc payload, writes the click-lead, and fires the helper-
  // driven 6-layer email fan-out. The modal UI is unchanged — the
  // estimator result is NOT displayed.
  //
  // Gates:
  //   - user.email required (anonymous users fall through to the legacy
  //     form-submit path — same as pre-fix behaviour)
  //   - agentId required (public/un-routed context falls through)
  //   - listing.id required (cold render guard)
  //
  // Fire-once across mounts: session-persistent guard keyed on
  // (listing, agent, action). sessionStorage SURVIVES the parent's
  // mount-gate-driven unmount (showOfferModal=false → component
  // unmounts → component remounts on reopen), so opening the same
  // offer modal twice in one browser session does NOT produce a 2nd
  // click-lead + 2nd email. Persists for the lifetime of the tab
  // (session) — matches the spirit of "one click = one conversion".
  //
  // In-mount fallback: the useRef above still guards against React
  // re-render double-fires within a single mount, AND covers the SSR /
  // privacy-mode case where sessionStorage throws.
  useEffect(() => {
    if (!isOpen) return
    if (!user || !user.email) return
    if (!agentId) return
    if (!listing?.id) return

    const fingerprint = `${listing.id}|${agentId}|${isSale ? 's' : 'l'}`
    // In-mount guard (cheap, no I/O).
    if (generateFiredRef.current === fingerprint) return

    // Session-persistent guard. Best-effort: sessionStorage is gated on
    // window presence + try/catch so any unavailability path (SSR,
    // Safari private-mode quota, sandboxed iframe) downgrades to the
    // in-mount ref guard rather than crashing.
    const storageKey = `offer-fired:${fingerprint}`
    let alreadyFiredThisSession = false
    if (typeof window !== 'undefined') {
      try {
        if (window.sessionStorage.getItem(storageKey)) {
          alreadyFiredThisSession = true
        }
      } catch {
        // sessionStorage unavailable — fall through to ref-only guard.
      }
    }
    if (alreadyFiredThisSession) {
      // Mark the in-mount ref too so the ref-only fallback stays
      // consistent if the user closes + reopens without unmount.
      generateFiredRef.current = fingerprint
      return
    }
    generateFiredRef.current = fingerprint

    const userEmail = user.email
    const isHomePath = !!isHome

    ;(async () => {
      try {
        let result: EstimateResult | null = null
        let competing: any[] = []
        // W-ESTIMATOR-USERID-INSERT-AND-COMPETING-DIAG D3 (2026-06-18):
        // forensic diag for the competing-listings fetch. Persisted onto
        // workingDoc.competingDiag so the lead row carries WHY competing
        // was empty/missing. Shape:
        //   { gate: 'passed' | 'skipped:<reason>',
        //     status?: number,
        //     success?: boolean,
        //     listingsLen?: number,
        //     error?: string }
        // Three causes the recon listed:
        //   gate='skipped:*'             → gate didn't pass (data missing)
        //   status != 200                → fetch path failure
        //   success === false            → server-side route error
        //   success === true + listingsLen === 0 → funnel produced empty
        let competingDiag: any = { gate: 'unknown' }

        // 1) Engine
        if (isHomePath) {
          const streetNumParsed = parseInt(String((listing as any).street_number ?? ''), 10)
          const subjectStreetNameRaw = (listing as any).street_name as string | undefined
          const homeSpecs: any = {
            bedrooms: listing.bedrooms_total || 0,
            bathrooms: listing.bathrooms_total_integer || 0,
            propertySubtype: listing.property_subtype?.trim() || 'Detached',
            communityId: (listing as any).community_id || null,
            municipalityId: (listing as any).municipality_id || null,
            livingAreaRange: listing.living_area_range || '',
            parking: listing.parking_total || 0,
            lotWidth: listing.lot_width ? parseFloat(String(listing.lot_width)) : null,
            lotDepth: listing.lot_depth ? parseFloat(String(listing.lot_depth)) : null,
            lotArea: listing.lot_size_area ? parseFloat(String(listing.lot_size_area)) : null,
            lotSizeUnits: (listing as any).lot_size_units || null,
            garageType: listing.garage_type || null,
            basement: Array.isArray(listing.basement) ? listing.basement.join(', ') : listing.basement || null,
            basementRaw: Array.isArray(listing.basement) ? listing.basement : listing.basement ? [listing.basement] : null,
            architecturalStyle: Array.isArray((listing as any).architectural_style) ? (listing as any).architectural_style[0] || null : null,
            poolFeatures: Array.isArray((listing as any).pool_features) ? (listing as any).pool_features : null,
            approximateAge: listing.approximate_age || null,
            agentId,
            ...(exactSqft != null && { exactSqft }),
            ...(subjectStreetNameRaw ? { subjectStreetName: subjectStreetNameRaw } : {}),
            ...(!Number.isNaN(streetNumParsed) ? { subjectStreetNumber: streetNumParsed } : {}),
            ...((listing as any).tax_annual_amount != null ? { subjectTaxAnnualAmount: parseFloat(String((listing as any).tax_annual_amount)) } : {}),
            ...((listing as any).tax_year != null ? { subjectTaxYear: parseInt(String((listing as any).tax_year), 10) } : {}),
          }
          const resp = await estimateHomeSale(homeSpecs, false)
          if (resp?.success && resp.data) {
            result = resp.data
            // 2) Competing listings (inline fetch so we can capture the
            // result synchronously into workingDoc — using the shared hook
            // would lag a render and miss the first email payload).
            // W-ESTIMATOR-USERID-INSERT-AND-COMPETING-DIAG D3 (2026-06-18):
            // instrumented — record status/success/listingsLen/error into
            // competingDiag so the persisted lead carries the cause for
            // any empty-or-failed competing fetch (no more silent swallow).
            if (homeSpecs.propertySubtype && homeSpecs.municipalityId) {
              competingDiag = { gate: 'passed', path: 'home' }
              try {
                const cres = await fetch('/api/charlie/competing-listings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    path: 'home',
                    communityId: homeSpecs.communityId,
                    municipalityId: homeSpecs.municipalityId,
                    bedrooms: homeSpecs.bedrooms,
                    bathrooms: homeSpecs.bathrooms,
                    livingAreaRange: homeSpecs.livingAreaRange,
                    propertySubtype: homeSpecs.propertySubtype,
                    architecturalStyle: homeSpecs.architecturalStyle,
                    approximateAge: homeSpecs.approximateAge,
                  }),
                })
                competingDiag.status = cres.status
                const cdata = await cres.json().catch(() => null)
                competingDiag.success = cdata?.success ?? null
                competingDiag.listingsLen = Array.isArray(cdata?.listings) ? cdata.listings.length : null
                if (cdata && !cdata.success && cdata.error) competingDiag.error = String(cdata.error).slice(0, 200)
                if (cdata?.success && Array.isArray(cdata.listings)) {
                  competing = cdata.listings
                } else {
                  console.error('[OfferInquiryModal] competing-listings empty/failed:', competingDiag)
                }
              } catch (err: any) {
                competing = []
                competingDiag.error = String(err?.message || err).slice(0, 200)
                console.error('[OfferInquiryModal] competing-listings fetch threw:', err)
              }
            } else {
              competingDiag = {
                gate: 'skipped',
                path: 'home',
                missing: [
                  !homeSpecs.propertySubtype ? 'propertySubtype' : null,
                  !homeSpecs.municipalityId ? 'municipalityId' : null,
                ].filter(Boolean),
              }
            }
          }
        } else {
          // Condo path
          const condoSpecs: any = {
            bedrooms: listing.bedrooms_total || 0,
            bathrooms: listing.bathrooms_total_integer || 0,
            livingAreaRange: listing.living_area_range || '',
            parking: listing.parking_total || 0,
            hasLocker: !!(listing.locker && listing.locker !== 'None'),
            buildingId: buildingId || listing.building_id || '',
            buildingSlug: buildingSlug || '',
            agentId,
            ...(exactSqft != null && { exactSqft }),
            ...(listing.association_fee && { associationFee: listing.association_fee }),
            ...((listing as any).tax_annual_amount != null ? { subjectTaxAnnualAmount: parseFloat(String((listing as any).tax_annual_amount)) } : {}),
            ...((listing as any).tax_year != null ? { subjectTaxYear: parseInt(String((listing as any).tax_year), 10) } : {}),
            ...(tenantId ? { tenantId } : {}),
          }
          const resp = await estimateCondoSale(condoSpecs, false)
          if (resp?.success && resp.data) {
            result = resp.data
            // W-ESTIMATOR-USERID-INSERT-AND-COMPETING-DIAG D3 (2026-06-18):
            // instrumented condo competing fetch (mirror of home path).
            if (tenantId && (listing as any).community_id && listing.bedrooms_total != null) {
              competingDiag = { gate: 'passed', path: 'condo' }
              try {
                const cres = await fetch('/api/charlie/competing-listings', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    path: 'condo',
                    communityId: (listing as any).community_id,
                    bedrooms: listing.bedrooms_total,
                    livingAreaRange: listing.living_area_range || null,
                  }),
                })
                competingDiag.status = cres.status
                const cdata = await cres.json().catch(() => null)
                competingDiag.success = cdata?.success ?? null
                competingDiag.listingsLen = Array.isArray(cdata?.listings) ? cdata.listings.length : null
                if (cdata && !cdata.success && cdata.error) competingDiag.error = String(cdata.error).slice(0, 200)
                if (cdata?.success && Array.isArray(cdata.listings)) {
                  competing = cdata.listings
                } else {
                  console.error('[OfferInquiryModal] competing-listings empty/failed:', competingDiag)
                }
              } catch (err: any) {
                competing = []
                competingDiag.error = String(err?.message || err).slice(0, 200)
                console.error('[OfferInquiryModal] competing-listings fetch threw:', err)
              }
            } else {
              competingDiag = {
                gate: 'skipped',
                path: 'condo',
                missing: [
                  !tenantId ? 'tenantId' : null,
                  !(listing as any).community_id ? 'community_id' : null,
                  listing.bedrooms_total == null ? 'bedrooms_total' : null,
                ].filter(Boolean),
              }
            }
          }
        }

        // 3) workingDoc + lead/email + activity. forceNew=true triggers
        // the helper-driven email fan-out (agent TO + chain CC/BCC +
        // buyer copy) for this specific action.
        const message = isSale
          ? `Offer inquiry: Unit ${listing.unit_number || ''} at ${buildingName}${listing.unparsed_address ? ` (${listing.unparsed_address})` : ''}. List price: $${(listing.list_price || 0).toLocaleString()}.`
          : `Lease inquiry: Unit ${listing.unit_number || ''} at ${buildingName}${listing.unparsed_address ? ` (${listing.unparsed_address})` : ''}. List price: $${(listing.list_price || 0).toLocaleString()}.`

        const workingDoc = buildOfferWorkingDoc({
          type: isHomePath ? 'home' : 'condo',
          listing,
          buildingName,
          buildingAddress,
          result,
          competingListings: competing,
        })
        // W-ESTIMATOR-USERID-INSERT-AND-COMPETING-DIAG D3 (2026-06-18):
        // attach the forensic diag to the persisted workingDoc.
        // Internal-only — NOT rendered in the email or the lead-tab UI
        // (operator can read it directly from
        // property_details->'workingDoc'->'competingDiag' on the next
        // empty/failed competing fetch to pin the cause).
        ;(workingDoc as any).competingDiag = competingDiag

        const leadResult = await submitLeadFromForm({
          agentId,
          contactName: formData.name || user.user_metadata?.full_name || user.user_metadata?.name || '',
          contactEmail: userEmail,
          contactPhone: formData.phone || user.user_metadata?.phone || '',
          // W-ESTIMATOR-USERID-AND-STATS G3 (2026-06-17): thread user.id so
          // leads.user_id is populated → leadFamily aggregation in
          // app/admin-homes/leads/[id]/page.tsx:91 sees siblings → pill
          // selector appears in the admin Estimator + Plan tabs.
          // Authed path: user.id is always present here (user.email
          // gate above). No other behaviour change.
          userId: user.id,
          source: isSale ? 'sale_offer_inquiry' : 'lease_offer_inquiry',
          buildingId: buildingId || listing.building_id || undefined,
          listingId: listing.id,
          message,
          estimatedValueMin: result?.showPrice ? result.priceRange.low : undefined,
          estimatedValueMax: result?.showPrice ? result.priceRange.high : undefined,
          propertyDetails: {
            buildingName,
            buildingAddress: buildingAddress || listing.unparsed_address || '',
            unitNumber: listing.unit_number || '',
            listPrice: listing.list_price,
            estimatedPrice: result?.showPrice ? result.estimatedPrice : null,
            confidence: result?.confidence,
            matchTier: result?.matchTier,
            marketSpeed: result?.marketSpeed?.status,
            workingDoc,
          },
          forceNew: true,
        })
        const clickLeadOk = !!(leadResult?.success && 'lead' in leadResult && leadResult.lead?.id)
        if (!clickLeadOk) {
          const errMsg = leadResult && 'error' in leadResult ? leadResult.error : 'unknown'
          console.error('[OfferInquiryModal] click-fire lead-write failed:', errMsg)
        }
        await submitActivityFromForm({
          contactEmail: userEmail,
          agentId,
          activityType: isSale ? 'sale_offer_inquiry' : 'lease_offer_inquiry',
          activityData: {
            buildingId: buildingId || listing.building_id || '',
            buildingName,
            listingId: listing.id,
            listingAddress: listing.unparsed_address || '',
            unitNumber: listing.unit_number || '',
            listPrice: listing.list_price,
            estimatedPrice: result?.showPrice ? result.estimatedPrice : null,
            priceRangeLow: result?.showPrice ? result.priceRange.low : null,
            priceRangeHigh: result?.showPrice ? result.priceRange.high : null,
            confidence: result?.confidence,
            matchTier: result?.matchTier,
          },
        })

        // W-ESTIMATOR-OFFER-FIRE-ONCE (2026-06-17): persist the fire-once
        // key ONLY after the lead-write was acknowledged. If the lead
        // failed (transient network / DB error / agent-not-resolved),
        // we DELIBERATELY leave the key absent so a future open in this
        // session re-attempts. The in-mount ref still prevents within-
        // mount double-fires during the retry. Idempotency target: one
        // SUCCESSFUL fire per (listing, agent, action) per session.
        if (clickLeadOk && typeof window !== 'undefined') {
          try {
            window.sessionStorage.setItem(storageKey, String(Date.now()))
          } catch {
            // best-effort — ref guard already prevents within-mount
            // double-fire even if storage write fails.
          }
        }
      } catch (err) {
        console.error('[OfferInquiryModal] click-fire error:', err)
      }
    })()
  // contactForm fields are intentionally OMITTED from deps — typing in
  // the form must NOT re-trigger fire-on-generate.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.email, agentId, listing?.id, isSale, isHome, tenantId, buildingId])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // W-ESTIMATOR-OFFER-FIRE-ONCE (2026-06-17): the click-on-button
      // already fired its OWN lead+email (the conversion event). The
      // form-submit here is a SEPARATE inquiry event — distinct lead,
      // distinct email, distinct activity. forceNew=true on BOTH calls
      // so the (email, tenant, listing) dedup key does NOT collapse the
      // click-lead and the inquiry-lead into one row.
      //
      // This matches the operator-locked model:
      //   - click  → click-lead   (silent, on modal open; rich workingDoc)
      //   - submit → inquiry-lead (user-typed message; thin propertyDetails
      //                            mirrors pre-c66366f behaviour)
      //
      // Anonymous users (no auth) take the same path here — the click
      // fire-on-generate effect skipped (gated on user.email), and this
      // form-submit is their FIRST and ONLY lead/email/activity (byte-
      // equivalent to pre-c66366f).
      const lead = await submitLeadFromForm({
        contactName: formData.name,
        contactEmail: formData.email,
        contactPhone: formData.phone,
        // W-ESTIMATOR-USERID-AND-STATS G3 (2026-06-17): thread user.id
        // when the form-submitter is signed in. Anonymous form-submits
        // (no auth) still write user_id NULL — byte-equivalent to
        // pre-fix behaviour for that flow.
        userId: user?.id,
        source: isSale ? 'sale_offer_inquiry' : 'lease_offer_inquiry',
        agentId: agentId,
        buildingId: buildingId || listing.building_id || undefined,
        listingId: listing.id,
        message: formData.message,
        forceNew: true,
        propertyDetails: {
          buildingName: buildingName,
          buildingAddress: buildingAddress || listing.unparsed_address || '',
          unitNumber: listing.unit_number || '',
          listPrice: listing.list_price
        }
      })

      if (lead) {
        await submitActivityFromForm({
          contactEmail: formData.email,
          agentId: agentId,
          activityType: isSale ? 'sale_offer_inquiry' : 'lease_offer_inquiry',
          activityData: {
            buildingId: buildingId || listing.building_id || '',
            buildingName: buildingName,
            listingId: listing.id,
            listingAddress: listing.unparsed_address || '',
            unitNumber: listing.unit_number || '',
            message: formData.message,
            listPrice: listing.list_price
          }
        })
      }
      setSubmitted(true)
    } catch (error) {
      console.error('Error submitting offer inquiry:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setSubmitted(false)
    setFormData({
      name: '',
      email: '',
      phone: '',
      message: defaultMessage
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {submitted ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">Inquiry Sent!</h3>
            <p className="text-slate-600 mb-6">
              {agentName} will contact you shortly to discuss Unit {listing.unit_number}.
            </p>
            <button
              onClick={handleClose}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {isSale ? 'Make an Offer' : 'Apply for Lease'}
            </h2>
            <p className="text-slate-600 mb-6">
              Unit {listing.unit_number} at {buildingName}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Your name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="your@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="(416) 555-1234"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea
                  rows={3}
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                  isSale
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isSubmitting ? 'Sending...' : (isSale ? 'Submit Offer Inquiry' : 'Submit Lease Application')}
              </button>
            </form>

            <p className="text-xs text-slate-500 mt-4 text-center">
              By submitting, you agree to be contacted by {agentName} regarding this property.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
