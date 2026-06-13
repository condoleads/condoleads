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

// C-CHAT-VALUATION-STYLE (2026-06-13): optional theme prop. Default 'light'
// is BYTE-IDENTICAL to the pre-change render (same class strings, same DOM)
// so the dashboard's appearance is preserved exactly. 'dark' is used by
// Charlie's InChatWorkingDoc to match the panel palette (slate-900 / white
// text / subtle borders / blue-400 links). One component, two themes; no
// duplicate logic, no email-HTML import.
export type WorkingDocViewTheme = 'light' | 'dark'

interface ThemeClasses {
  container: string
  heading: string
  headerCard: string
  headerCaption: string
  subjectLine: string
  estimatePrice: string
  rangeText: string
  confidenceText: string
  sectionWrap: string
  sectionTitle: string
  sectionSubtitle: string
  sectionHeader: string
  tableText: string
  tileRow: string
  tileAddrLink: string
  tileAddrNoLink: string
  tileUnit: string
  tileSpecs: string
  tilePrice: string
  tileAdjusted: string
  tileTier: string
  tileDate: string
  tileDom: string
  footer: string
}

const LIGHT: ThemeClasses = {
  container: 'bg-white rounded-lg shadow p-6 mt-6',
  heading: 'text-lg font-semibold mb-4',
  headerCard: 'bg-slate-50 border border-slate-200 rounded-lg p-4',
  headerCaption: 'text-[10px] uppercase tracking-wide text-gray-500',
  subjectLine: 'text-sm font-semibold text-gray-900 mt-1',
  estimatePrice: 'text-2xl font-extrabold text-gray-900 mt-2',
  rangeText: 'text-xs text-gray-500 mt-0.5',
  confidenceText: 'text-xs text-gray-600 mt-1.5',
  sectionWrap: 'mt-6',
  sectionTitle: 'text-sm font-semibold text-gray-900',
  sectionSubtitle: 'text-xs text-gray-500 mt-0.5',
  sectionHeader: 'text-xs text-gray-600 mt-1.5',
  tableText: 'w-full mt-2 text-sm',
  tileRow: 'border-b border-gray-200 last:border-0',
  tileAddrLink: 'text-sm font-medium text-blue-700 hover:text-blue-900',
  tileAddrNoLink: 'text-sm font-medium text-gray-900',
  tileUnit: 'text-xs text-gray-500 mt-0.5',
  tileSpecs: 'text-xs text-gray-500 mt-0.5',
  tilePrice: 'text-sm font-bold text-gray-900',
  tileAdjusted: 'text-xs font-normal text-gray-500 ml-1',
  tileTier: 'text-[10px] text-gray-500 mt-0.5',
  tileDate: 'text-[10px] text-gray-500 mt-0.5',
  tileDom: 'text-[10px] text-gray-400 mt-0.5',
  footer: 'mt-5 pt-4 border-t border-gray-100 text-[11px] text-gray-400 leading-relaxed',
}

const DARK: ThemeClasses = {
  container: 'rounded-lg p-6 mt-6 bg-[#0f172a] border border-white/5',
  heading: 'text-lg font-semibold mb-4 text-white',
  headerCard: 'rounded-lg p-4 bg-white/[0.04] border border-white/[0.07]',
  headerCaption: 'text-[10px] uppercase tracking-wide text-white/40',
  subjectLine: 'text-sm font-semibold text-white mt-1',
  estimatePrice: 'text-2xl font-extrabold text-emerald-400 mt-2',
  rangeText: 'text-xs text-white/50 mt-0.5',
  confidenceText: 'text-xs text-white/60 mt-1.5',
  sectionWrap: 'mt-6',
  sectionTitle: 'text-sm font-semibold text-white',
  sectionSubtitle: 'text-xs text-white/40 mt-0.5',
  sectionHeader: 'text-xs text-white/60 mt-1.5',
  tableText: 'w-full mt-2 text-sm',
  tileRow: 'border-b border-white/[0.06] last:border-0',
  tileAddrLink: 'text-sm font-medium text-blue-300 hover:text-blue-200',
  tileAddrNoLink: 'text-sm font-medium text-white',
  tileUnit: 'text-xs text-white/40 mt-0.5',
  tileSpecs: 'text-xs text-white/40 mt-0.5',
  tilePrice: 'text-sm font-bold text-white',
  tileAdjusted: 'text-xs font-normal text-white/40 ml-1',
  tileTier: 'text-[10px] text-white/50 mt-0.5',
  tileDate: 'text-[10px] text-white/40 mt-0.5',
  tileDom: 'text-[10px] text-white/30 mt-0.5',
  footer: 'mt-5 pt-4 border-t border-white/[0.06] text-[11px] text-white/40 leading-relaxed',
}

const THEMES: Record<WorkingDocViewTheme, ThemeClasses> = { light: LIGHT, dark: DARK }

interface Props {
  workingDoc: WorkingDoc | null | undefined
  baseUrl: string
  idMap: Record<string, string>
  // Default 'light' preserves dashboard byte-identity.
  theme?: WorkingDocViewTheme
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
  tile, baseUrl, idMap, priceKind, t,
}: { tile: WorkingDocTile; baseUrl: string; idMap: Record<string, string>; priceKind: 'close' | 'list'; t: ThemeClasses }) {
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
    <tr className={t.tileRow}>
      <td className="py-2.5 pr-3 align-top">
        {href ? (
          <a href={href} className={t.tileAddrLink} target="_blank" rel="noopener noreferrer">
            {addr}
          </a>
        ) : (
          <span className={t.tileAddrNoLink}>{addr}</span>
        )}
        {unit && <div className={t.tileUnit}>{unit}</div>}
        {specs && <div className={t.tileSpecs}>{specs}</div>}
      </td>
      <td className="py-2.5 pl-3 text-right align-top whitespace-nowrap">
        <div className={t.tilePrice}>
          {fmtPrice(price)}
          {adjusted && <span className={t.tileAdjusted}>(adj {fmtPrice(adjusted)})</span>}
        </div>
        {tier && <div className={t.tileTier}>{tier}</div>}
        {date && <div className={t.tileDate}>{date}</div>}
        {dom && <div className={t.tileDom}>{dom}</div>}
      </td>
    </tr>
  )
}

function Section({
  title, subtitle, section, baseUrl, idMap, priceKind, t,
}: { title: string; subtitle: string; section: WorkingDocSection | null | undefined; baseUrl: string; idMap: Record<string, string>; priceKind: 'close' | 'list'; t: ThemeClasses }) {
  if (!section || !section.tiles || section.tiles.length === 0) return null
  const median = section.median != null ? `Median ${fmtPrice(section.median)}` : null
  const est = section.estimatedPrice != null ? `Section estimate ${fmtPrice(section.estimatedPrice)}` : null
  const anchor = section.bestGeoTier ? `${tierLabel(section.bestGeoTier)} anchor` : null
  const count = `${section.count} comp${section.count === 1 ? '' : 's'}`
  const header = [anchor, est, median, count].filter(Boolean).join(' · ')
  return (
    <div className={t.sectionWrap}>
      <div className={t.sectionTitle}>{title}</div>
      <div className={t.sectionSubtitle}>{subtitle}</div>
      <div className={t.sectionHeader}>{header}</div>
      <table className={t.tableText}>
        <tbody>
          {section.tiles.slice(0, 10).map((tile, i) => (
            <TileRow key={(tile.listingKey || tile.id || i) + ''} tile={tile} baseUrl={baseUrl} idMap={idMap} priceKind={priceKind} t={t} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function WorkingDocView({ workingDoc, baseUrl, idMap, theme = 'light' }: Props) {
  if (!workingDoc) return null
  const est = workingDoc.estimate || {}
  const subj = workingDoc.subject || {}
  const subjectLine = [subj.buildingName, subj.buildingAddress, subj.unitNumber ? `#${subj.unitNumber}` : null].filter(Boolean).join(' · ')
  const hasAnySection = !!(workingDoc.comparableSold?.tiles?.length
    || workingDoc.taxMatch?.tiles?.length
    || workingDoc.competing?.tiles?.length)
  if (!hasAnySection && est.estimatedPrice == null) return null

  // Theme lookup. theme='light' restores today's class strings VERBATIM
  // (dashboard byte-identity). theme='dark' uses panel-matching classes
  // for Charlie's in-chat render.
  const t = THEMES[theme]

  return (
    <div className={t.container}>
      <h2 className={t.heading}>Estimator working document</h2>
      <div className={t.headerCard}>
        <div className={t.headerCaption}>Submitted estimate</div>
        {subjectLine && <div className={t.subjectLine}>{subjectLine}</div>}
        {est.estimatedPrice != null && (
          <div className={t.estimatePrice}>{fmtPrice(est.estimatedPrice)}</div>
        )}
        {est.priceRange && (
          <div className={t.rangeText}>
            Range {fmtPrice(est.priceRange.low)} — {fmtPrice(est.priceRange.high)}
          </div>
        )}
        {(est.confidence || est.matchTier) && (
          <div className={t.confidenceText}>
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
        t={t}
      />
      <Section
        title="Tax-Matched"
        subtitle="Comparables in the same property-tax band (±20%)."
        section={workingDoc.taxMatch}
        baseUrl={baseUrl}
        idMap={idMap}
        priceKind="close"
        t={t}
      />
      <Section
        title="Competing For Sale"
        subtitle="Currently active listings competing for the same buyer."
        section={workingDoc.competing}
        baseUrl={baseUrl}
        idMap={idMap}
        priceKind="list"
        t={t}
      />

      <div className={t.footer}>
        Snapshot of the working document at submission. Tile links open the live property page.
      </div>
    </div>
  )
}
