'use client'

// components/property/PropertyEstimateCTA.tsx
//
// P-DEFAULT-GATE (2026-06-12): inline teaser CTA for the sidebar slot. The
// previous on-mount auto-fire (estimateCondoSale / estimateCondoRent / S1
// estimateSale / estimateRent) ran ungated and consumed zero credits while
// the "Get Sale Estimate" sticky-bar button opened a SEPARATELY-metered
// modal — two entries for one subject. Per the credit model (1 estimate
// = 1 attempt), we removed the auto-fire. This teaser CTA opens the SAME
// metered modal (via the existing onEstimateClick wiring used by the
// header + sticky bar). One metered door.
//
// Backend untouched. Credit endpoints, Charlie, AI chat, S1 routes, FKs,
// resolver, recipient hierarchy: all unchanged. The modal's existing
// checkAndEstimate (session check → if-allowed → increment → estimate)
// is the single source of truth for metering.

import type { MLSListing } from '@/lib/types/building'

interface PropertyEstimateCTAProps {
  listing: MLSListing
  status: 'Active' | 'Closed'
  isSale: boolean
  buildingName: string
  buildingAddress?: string
  buildingSlug?: string
  agentId: string
  tenantId?: string
  // P-DEFAULT-GATE (2026-06-12): opens the existing metered modal. Wired
  // from PropertyPageClient — same handler the header + sticky-bar
  // "Get Sale Estimate" buttons use.
  onEstimateClick?: () => void
}

export default function PropertyEstimateCTA({ isSale, buildingName, onEstimateClick }: PropertyEstimateCTAProps) {
  const headline = isSale ? 'Get your sale estimate' : 'Get your lease estimate'
  const subline = isSale
    ? `See the comparable sold, tax-matched, and currently-competing listings for ${buildingName || 'this unit'}.`
    : `See the comparable rented and currently-competing listings for ${buildingName || 'this unit'}.`
  const buttonLabel = isSale ? 'Get sale estimate' : 'Get lease estimate'

  return (
    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
      <div className="text-xs uppercase tracking-wide text-blue-200">Estimator</div>
      <h3 className="text-xl font-bold mt-1">{headline}</h3>
      <p className="text-sm text-blue-100 mt-2 leading-relaxed">{subline}</p>
      <button
        type="button"
        onClick={onEstimateClick}
        disabled={!onEstimateClick}
        className="mt-4 w-full bg-white text-blue-700 font-semibold py-3 px-4 rounded-xl shadow-sm hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        {buttonLabel}
      </button>
    </div>
  )
}
