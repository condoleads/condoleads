'use client'

// components/dashboard/WorkingDocView.tsx
//
// P-WORKING-DOC-DASHBOARD (2026-06-12) — agent-side render of the persisted
// estimator working document on the lead-detail view. Consumes the SAME
// WorkingDoc/WorkingDocSection/WorkingDocTile types that the emails read
// (lib/email/working-doc-render.ts). Reuse strategy: import the SHAPING
// (types) but NOT the email-HTML emitters (renderEstimateHeader /
// renderWorkingDocSections) — those produce inline-styled email HTML strings;
// the dashboard renders Tailwind JSX. ONE schema, two surfaces.
//
// Listing-id resolution (server-side via resolveListingIds) is done in
// app/dashboard/leads/[id]/page.tsx and passed in as idMap; baseUrl is the
// tenant-resolved buildBaseUrl(tenantDomain) value also computed server-side.
//
// Graceful when workingDoc is null/absent (legacy leads pre-b9336dc) — the
// component renders nothing; the parent shows its existing summary block.

import type {
  WorkingDoc,
  WorkingDocSection,
  WorkingDocTile,
} from '@/lib/email/working-doc-render'

interface Props {
  workingDoc: WorkingDoc | null | undefined
  baseUrl: string
  idMap: Record<string, string>
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '$' + Math.round(n).toLocaleString()
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return s
  }
}

function tileHref(baseUrl: string, tile: WorkingDocTile, idMap: Record<string, string>): string | null {
  const id = tile.id || (tile.listingKey ? idMap[tile.listingKey] : null)
  if (!id) return null
  return `${baseUrl}/property/${id}`
}

function tierLabel(t?: string | null): string {
  if (!t) return ''
  const m: Record<string, string> = {
    platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze',
  }
  return m[t] || t.charAt(0).toUpperCase() + t.slice(1)
}

function TileRow({
  tile, baseUrl, idMap, priceKind,
}: { tile: WorkingDocTile; baseUrl: string; idMap: Record<string, string>; priceKind: 'close' | 'list' }) {
  const href = tileHref(baseUrl, tile, idMap)
  const price = priceKind === 'list' ? tile.listPrice : tile.closePrice
  const adjusted = tile.adjustedPrice && tile.adjustedPrice !== price ? tile.adjustedPrice : null
  const addr = tile.unparsedAddress || 'Address unavailable'
  const unit = tile.unitNumber ? `Unit ${tile.unitNumber}` : null
  const beds = tile.bedrooms != null ? `${tile.bedrooms}BR` : null
  const baths = tile.bathrooms != null ? `${tile.bathrooms}BA` : null
  const lar = tile.livingAreaRange ? `${tile.livingAreaRange} sqft` : null
  const dom = tile.daysOnMarket != null ? `${tile.daysOnMarket}d on market` : null
  const date = priceKind === 'close' ? fmtDate(tile.closeDate) : ''
  const tier = tile.sourceTier ? tierLabel(tile.sourceTier) : null
  const specs = [beds, baths, lar].filter(Boolean).join(' · ')

  return (
    <tr className="border-b border-gray-200 last:border-0">
      <td className="py-2.5 pr-3 align-top">
        {href ? (
          <a href={href} className="text-sm font-medium text-blue-700 hover:text-blue-900" target="_blank" rel="noopener noreferrer">
            {addr}
          </a>
        ) : (
          <span className="text-sm font-medium text-gray-900">{addr}</span>
        )}
        {unit && <div className="text-xs text-gray-500 mt-0.5">{unit}</div>}
        {specs && <div className="text-xs text-gray-500 mt-0.5">{specs}</div>}
      </td>
      <td className="py-2.5 pl-3 text-right align-top whitespace-nowrap">
        <div className="text-sm font-bold text-gray-900">
          {fmtPrice(price)}
          {adjusted && <span className="text-xs font-normal text-gray-500 ml-1">(adj {fmtPrice(adjusted)})</span>}
        </div>
        {tier && <div className="text-[10px] text-gray-500 mt-0.5">{tier}</div>}
        {date && <div className="text-[10px] text-gray-500 mt-0.5">{date}</div>}
        {dom && <div className="text-[10px] text-gray-400 mt-0.5">{dom}</div>}
      </td>
    </tr>
  )
}

function Section({
  title, subtitle, section, baseUrl, idMap, priceKind,
}: { title: string; subtitle: string; section: WorkingDocSection | null | undefined; baseUrl: string; idMap: Record<string, string>; priceKind: 'close' | 'list' }) {
  if (!section || !section.tiles || section.tiles.length === 0) return null
  const median = section.median != null ? `Median ${fmtPrice(section.median)}` : null
  const est = section.estimatedPrice != null ? `Section estimate ${fmtPrice(section.estimatedPrice)}` : null
  const anchor = section.bestGeoTier ? `${tierLabel(section.bestGeoTier)} anchor` : null
  const count = `${section.count} comp${section.count === 1 ? '' : 's'}`
  const header = [anchor, est, median, count].filter(Boolean).join(' · ')
  return (
    <div className="mt-6">
      <div className="text-sm font-semibold text-gray-900">{title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
      <div className="text-xs text-gray-600 mt-1.5">{header}</div>
      <table className="w-full mt-2 text-sm">
        <tbody>
          {section.tiles.slice(0, 10).map((t, i) => (
            <TileRow key={(t.listingKey || t.id || i) + ''} tile={t} baseUrl={baseUrl} idMap={idMap} priceKind={priceKind} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function WorkingDocView({ workingDoc, baseUrl, idMap }: Props) {
  if (!workingDoc) return null
  const est = workingDoc.estimate || {}
  const subj = workingDoc.subject || {}
  const subjectLine = [subj.buildingName, subj.buildingAddress, subj.unitNumber ? `#${subj.unitNumber}` : null].filter(Boolean).join(' · ')
  const hasAnySection = !!(workingDoc.comparableSold?.tiles?.length
    || workingDoc.taxMatch?.tiles?.length
    || workingDoc.competing?.tiles?.length)
  if (!hasAnySection && est.estimatedPrice == null) return null

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <h2 className="text-lg font-semibold mb-4">Estimator working document</h2>
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
        <div className="text-[10px] uppercase tracking-wide text-gray-500">Submitted estimate</div>
        {subjectLine && <div className="text-sm font-semibold text-gray-900 mt-1">{subjectLine}</div>}
        {est.estimatedPrice != null && (
          <div className="text-2xl font-extrabold text-gray-900 mt-2">{fmtPrice(est.estimatedPrice)}</div>
        )}
        {est.priceRange && (
          <div className="text-xs text-gray-500 mt-0.5">
            Range {fmtPrice(est.priceRange.low)} — {fmtPrice(est.priceRange.high)}
          </div>
        )}
        {(est.confidence || est.matchTier) && (
          <div className="text-xs text-gray-600 mt-1.5">
            Confidence: {est.confidence || '—'}{est.matchTier ? ` · ${est.matchTier}` : ''}
          </div>
        )}
      </div>

      <Section
        title="Comparable Sold"
        subtitle="Recent sold comparables in the area, scored against the subject."
        section={workingDoc.comparableSold}
        baseUrl={baseUrl}
        idMap={idMap}
        priceKind="close"
      />
      <Section
        title="Tax-Matched"
        subtitle="Comparables in the same property-tax band (±20%)."
        section={workingDoc.taxMatch}
        baseUrl={baseUrl}
        idMap={idMap}
        priceKind="close"
      />
      <Section
        title="Competing For Sale"
        subtitle="Currently active listings competing for the same buyer."
        section={workingDoc.competing}
        baseUrl={baseUrl}
        idMap={idMap}
        priceKind="list"
      />

      <div className="mt-5 pt-4 border-t border-gray-100 text-[11px] text-gray-400 leading-relaxed">
        Snapshot of the working document at submission. Tile links open the live property page.
      </div>
    </div>
  )
}
