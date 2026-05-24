'use client'
// components/admin-homes/cockpit/territory/TerritoryCoverageSummary.tsx
// W-COCKPIT P-B-2 Commit 2b: coverage + health panel above the cascade chart.
//
// Renders three blocks:
//   1. Coverage counts per scope (assigned / phantom / inherited-shown)
//   2. Buildings + Listings counts
//   3. Health row with phantom + orphan-building flags + highlight toggles
//
// All numbers come from cascade-walker.computeSummary. No data fetching here.

import { useState } from 'react'
import type { SummaryCounts } from './cascade-walker'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Props {
  summary: SummaryCounts
  onHighlightPhantoms: (on: boolean) => void
  onHighlightOrphans: (on: boolean) => void
  highlightPhantoms: boolean
  highlightOrphans: boolean
  // C2c: clicking the phantom alert text opens the cleanup modal.
  onOpenCleanup?: () => void
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'normal' | 'warn' | 'good' }) {
  const cls = tone === 'warn' ? 'text-amber-700'
    : tone === 'good' ? 'text-green-700'
    : 'text-gray-800'
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${cls}`}>{value}</span>
    </div>
  )
}

function ScopeRow({ label, counts }: { label: string; counts: { assigned: number; phantom: number; inheritedShown: number } }) {
  return (
    <div className="flex items-center gap-4 py-1">
      <div className="w-32 text-xs text-gray-600">{label}</div>
      <Stat label="assigned" value={counts.assigned} tone={counts.assigned > 0 ? 'good' : 'normal'} />
      <Stat label="phantom" value={counts.phantom} tone={counts.phantom > 0 ? 'warn' : 'normal'} />
      <Stat label="inherited (shown)" value={counts.inheritedShown} />
    </div>
  )
}

export default function TerritoryCoverageSummary({
  summary, onHighlightPhantoms, onHighlightOrphans, highlightPhantoms, highlightOrphans, onOpenCleanup,
}: Props) {
  const healthy = summary.health.phantomCount === 0 && summary.health.orphanBuildings === 0
  return (
    <div className="bg-white border border-gray-200 rounded-md p-3 mb-3 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700">Coverage</div>
        {healthy ? (
          <div className="flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> healthy
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-amber-700">
            <AlertTriangle className="w-3.5 h-3.5" /> attention needed
          </div>
        )}
      </div>

      <div className="space-y-0.5">
        <ScopeRow label="Areas" counts={summary.areas} />
        <ScopeRow label="Munis" counts={summary.munis} />
        <ScopeRow label="Communities" counts={summary.communities} />
        <div className="flex items-center gap-4 py-1">
          <div className="w-32 text-xs text-gray-600">Neighbourhoods</div>
          <Stat label="cards" value={summary.neighbourhoods.cards} />
        </div>
        <div className="flex items-center gap-4 py-1">
          <div className="w-32 text-xs text-gray-600">Buildings</div>
          <Stat label="claimed" value={summary.buildings.total} tone={summary.buildings.total > 0 ? 'good' : 'normal'} />
        </div>
        <div className="flex items-center gap-4 py-1">
          <div className="w-32 text-xs text-gray-600">Listings</div>
          <Stat label="pinned" value={summary.listings.pinned} />
        </div>
      </div>

      {!healthy && (
        <div className="mt-3 pt-3 border-t border-gray-200 space-y-1.5">
          {summary.health.phantomCount > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                {onOpenCleanup ? (
                  <button
                    type="button"
                    onClick={onOpenCleanup}
                    className="text-left hover:underline focus:underline cursor-pointer"
                  >
                    <strong>{summary.health.phantomCount}</strong> PHANTOM card{summary.health.phantomCount === 1 ? '' : 's'} -- exists in DB but no access flags; routes nothing. <span className="text-blue-700 underline">Clean up</span>
                  </button>
                ) : (
                  <span><strong>{summary.health.phantomCount}</strong> PHANTOM card{summary.health.phantomCount === 1 ? '' : 's'} -- exists in DB but no access flags; routes nothing.</span>
                )}
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={highlightPhantoms}
                  onChange={e => onHighlightPhantoms(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Highlight phantoms
              </label>
            </div>
          )}
          {summary.health.orphanBuildings > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-xs text-amber-700 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span><strong>{summary.health.orphanBuildings}</strong> building{summary.health.orphanBuildings === 1 ? '' : 's'} in munis with no apa coverage.</span>
              </div>
              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={highlightOrphans}
                  onChange={e => onHighlightOrphans(e.target.checked)}
                  className="w-3.5 h-3.5"
                />
                Highlight orphans
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
