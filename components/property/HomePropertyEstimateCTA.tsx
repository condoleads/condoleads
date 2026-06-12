'use client'

// components/property/HomePropertyEstimateCTA.tsx
//
// P-DEFAULT-GATE (2026-06-12): inline teaser CTA for the sidebar slot. The
// previous on-mount auto-fire (estimateHomeSale, sale-only — home lease
// already early-exited) ran ungated and consumed zero credits while the
// "Get Sale Estimate" sticky-bar button opened a SEPARATELY-metered modal
// — two entries for one subject. Per the credit model (1 estimate =
// 1 attempt), we removed the auto-fire. This teaser CTA opens the SAME
// metered modal (via the existing onEstimateClick wiring used by the
// header + sticky bar). One metered door.
//
// Home lease is not implemented in the auto-fire today and stays that way;
// the modal supports it via estimateHomeRent (dynamic import). The teaser
// renders for sale only — lease comes through the modal-path only.

import type { MLSListing } from '@/lib/types/building'

interface HomePropertyEstimateCTAProps {
  listing: MLSListing
  isSale: boolean
  agentId: string
  // P-DEFAULT-GATE (2026-06-12): opens the existing metered modal. Wired
  // from HomePropertyPageClient — same handler the header + sticky-bar
  // "Get Sale Estimate" buttons use.
  onEstimateClick?: () => void
}

export default function HomePropertyEstimateCTA({ listing, isSale, onEstimateClick }: HomePropertyEstimateCTAProps) {
  // Lease is not built for the home seller-side teaser today (matches
  // pre-fix behavior: HomePropertyEstimateCTA early-exited on !isSale).
  if (!isSale) return null

  const shortAddress = (listing as any)?.unparsed_address
    ? String((listing as any).unparsed_address).split(',')[0].trim()
    : 'this home'

  return (
    <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white">
      <div className="text-xs uppercase tracking-wide text-blue-200">Estimator</div>
      <h3 className="text-xl font-bold mt-1">Get your sale estimate</h3>
      <p className="text-sm text-blue-100 mt-2 leading-relaxed">
        See the comparable sold, tax-matched, and currently-competing listings for {shortAddress}.
      </p>
      <button
        type="button"
        onClick={onEstimateClick}
        disabled={!onEstimateClick}
        className="mt-4 w-full bg-white text-blue-700 font-semibold py-3 px-4 rounded-xl shadow-sm hover:bg-blue-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
      >
        Get sale estimate
      </button>
    </div>
  )
}
