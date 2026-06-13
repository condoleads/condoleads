'use client'

// app/charlie/components/InChatWorkingDoc.tsx
//
// C-CHAT-VALUATION (2026-06-13) — in-chat render of the seller-estimate
// runner's working document. UI-only. The chat-stream route, all 13 tools,
// plan gating + increment, SSE events, system prompt, per-tenant key, and
// Charlie's VIP email are UNTOUCHED by this change.
//
// REUSE STRATEGY:
//   - Shape the runner's raw EstimateResult into the shared WorkingDoc form
//     via buildWorkingDocFromResult (same helper C-PLAN-DOC uses for the
//     plan email).
//   - Render via the React WorkingDocView built for the dashboard
//     (components/dashboard/WorkingDocView.tsx, P-WORKING-DOC-DASHBOARD).
//     NOT the email-HTML emitters — those produce inline-styled HTML strings.
//   - Listing-id resolution (listingKey → mls_listings.id for tile hrefs):
//     done client-side via the existing supabase singleton (same client the
//     SellerEstimateRunner uses). Mirrors lib/email/working-doc-render.ts
//     resolveListingIds logic on the client.
//   - baseUrl: window.location.origin — browser-native, inherently tenant-
//     correct (the chat widget runs on the tenant's host; links resolve to
//     the same host). No tenant-domain threading needed in client state.
//
// Graceful when sellerEstimate is absent / incomplete (buyer flow, no
// runner fired, matcher CONTACT-tier with no comps) — the component renders
// nothing. The parent's existing summary sections (SellerEstimateBlock,
// ActiveListingCard, PricingRiskBlock, Strategy card) stay the panel's
// visible content.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import WorkingDocView from '@/components/dashboard/WorkingDocView'
import {
  buildWorkingDocFromResult,
  collectListingKeys,
  type WorkingDoc,
} from '@/lib/email/working-doc-render'

interface Props {
  sellerEstimate: any
}

export default function InChatWorkingDoc({ sellerEstimate }: Props) {
  // Shape the runner's data into the shared WorkingDoc form. Memoized so a
  // parent re-render with the same sellerEstimate object doesn't reshape.
  const workingDoc: WorkingDoc | null = useMemo(() => {
    const se = sellerEstimate
    if (!se || !se.estimate) return null
    return buildWorkingDocFromResult({
      type: se.path === 'home' ? 'home' : 'condo',
      subject: {
        buildingName: se.buildingName ?? null,
        buildingAddress: se.subjectAddress ?? null,
        unitNumber: null,
        bedrooms: se.bedrooms ?? null,
        bathrooms: null,
        livingAreaRange: se.livingAreaRange ?? null,
      },
      result: se.estimate,
      competingListings: se.competingListings ?? null,
    })
  }, [sellerEstimate])

  const [idMap, setIdMap] = useState<Record<string, string>>({})

  // Client-side batch resolve listing_key → mls_listings.id for tile hrefs.
  // Mirrors lib/email/working-doc-render.ts resolveListingIds. Idempotent —
  // re-runs only when workingDoc reference changes.
  useEffect(() => {
    let cancelled = false
    if (!workingDoc) { setIdMap({}); return }
    const keys = collectListingKeys(workingDoc)
    if (keys.length === 0) { setIdMap({}); return }
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('mls_listings')
          .select('id, listing_key')
          .in('listing_key', keys)
        if (cancelled) return
        if (error) {
          console.warn('[InChatWorkingDoc] listing-id resolve failed:', error.message)
          setIdMap({})
          return
        }
        const out: Record<string, string> = {}
        for (const row of data || []) {
          if (row.listing_key) out[row.listing_key] = row.id
        }
        setIdMap(out)
      } catch (e) {
        console.warn('[InChatWorkingDoc] listing-id resolve exception:', e)
        if (!cancelled) setIdMap({})
      }
    })()
    return () => { cancelled = true }
  }, [workingDoc])

  if (!workingDoc) return null

  // Browser-native tenant-correct base URL. The widget runs on the tenant's
  // host (walliam.ca, aily.ca, ...) — window.location.origin matches the
  // tenant domain by construction. No buildBaseUrl threading needed
  // client-side.
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200 mt-4 overflow-hidden">
      <WorkingDocView workingDoc={workingDoc} baseUrl={baseUrl} idMap={idMap} />
    </div>
  )
}
