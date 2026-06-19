// lib/email/working-doc-render.ts
//
// P-WORKING-DOC (2026-06-12) — shared 3-section render helper for the
// estimator working document. ONE render implementation reused by:
//   - the agent lead email (lib/actions/leads.ts buildLeadEmail)
//   - the NEW property-page buyer copy (lib/actions/leads.ts buildBuyerWorkingDocEmail)
//   - the existing estimator VIP buyer email (app/api/walliam/estimator/vip-request)
//
// Reads strictly from the persisted JSON (leads.property_details.workingDoc)
// — does NOT re-run the matcher. Tile property hrefs use buildBaseUrl(tenantDomain)
// for tenant-correctness; mls_listings.id is resolved at render time via batch
// listing_key lookup (resolveListingIds helper below).
//
// Audience flag controls PII visibility:
//   - 'agent' : agent-facing labels, contact info table, agent CTAs
//   - 'buyer' : buyer-safe phrasing, NO "New Lead" / "Reply to {name}",
//               NO other recipients' info, NO agent PII
//
// Care: Charlie + S1 builders untouched. This file is additive — does not
// modify existing email infrastructure.

import type { SupabaseClient } from '@supabase/supabase-js'
// W-ESTIMATOR-LEAD-RENDER-AND-EMAIL P2-LINKS (2026-06-17): swap the bare-
// UUID `/property/<id>` href for the descriptive `/<slug>` pattern that
// walliam.ca's route actually resolves. buildPropertySlug is the SAME
// helper Charlie's plan email (lib/email/charlie-plan-email-html.ts) and
// the admin lead Plan tab tiles (components/admin-homes/lead-workbench/
// PlanRenderer.tsx BuyerListingTile) already use; reusing it keeps the
// estimator email URLs byte-equivalent to Charlie's (which are curl-
// verified to return 200 — see property-slug.ts header).
import { buildPropertySlug } from '@/lib/utils/property-slug'
// W-ESTIMATOR-CONTENT-PARITY (2026-06-18): per-tile colored chip via the
// same helper Charlie's plan email + dashboard surface use. Source of
// truth = lib/charlie/tier-chip.ts (CV-0). The chip resolution rule —
// per-tile sourceTier wins, anchor (section.bestGeoTier) is the
// fallback — is encapsulated in tierChipFor.
import { tierChipFor, type TierBestSlot as _TierBestSlotChip } from '@/lib/charlie/tier-chip'

// ─── Persisted JSON shape ────────────────────────────────────────────────────

// W-ESTIMATOR-CONTENT-PARITY (2026-06-18): per-comp price adjustment shape,
// mirrors lib/estimator/types.ts:33-38 PriceAdjustment. The 3 mappers now
// forward this from ComparableSale so email + lead tab can render the
// adjustment story (the seller surface shows it; estimator dropped it
// pre-fix). Slots are nullable for renderer resilience on partial data.
export interface WorkingDocTileAdjustment {
  type?: string | null            // 'parking' | 'locker' | 'bathroom' (ComparableSale)
  difference?: number | null      // +1 or -1 (how the comp differs from subject)
  adjustmentAmount?: number | null
  reason?: string | null          // human-readable
}

export interface WorkingDocTile {
  // Identifiers
  listingKey?: string | null
  id?: string | null                          // pre-resolved (CompetingListing), optional for comps
  // Price / market
  closePrice?: number | null
  listPrice?: number | null                   // competing
  adjustedPrice?: number | null
  closeDate?: string | null
  daysOnMarket?: number | null
  // Subject features
  bedrooms?: number | null
  bathrooms?: number | null
  livingAreaRange?: string | null
  unitNumber?: string | null
  unparsedAddress?: string | null
  // Match labels
  matchTier?: string | null
  sourceTier?: string | null                  // platinum/gold/silver/bronze for tax-match list
  temperature?: string | null
  // C-PLAN-DOC-DEDUP (2026-06-13): additive optional fields carried for the
  // email-HTML render so the plan email can drop the legacy duplicate blocks
  // without losing visible content. Dashboard React (WorkingDocView) imports
  // the type but doesn't render these — its appearance stays byte-identical.
  mediaUrl?: string | null                    // photo URL for the email tile
  matchQuality?: string | null                // matcher's quality string (e.g. "Same building")
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): per-comp adjustment story (the
  // ±$amount diffs that turn closePrice into adjustedPrice). Engine produces
  // every run; pre-fix mappers dropped. Renderer shows under the tile when
  // populated.
  adjustments?: WorkingDocTileAdjustment[] | null
}

export interface WorkingDocSection {
  bestGeoTier?: string | null
  count: number
  estimatedPrice?: number | null
  median?: number | null
  tiles: WorkingDocTile[]                     // capped at 10 per section
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): tax-match section fields.
  // taxMatch carries its own priceRange + matchTier + tiers (the SECOND
  // 4-tier breakdown — distinct from the geo cascade's tiers at the
  // doc level). Optional so comparableSold + competing sections
  // (which don't use them) type-check unchanged.
  priceRange?: { low: number; high: number } | null
  matchTier?: string | null
  tiers?: WorkingDocTiers | null
}

export interface WorkingDocSubject {
  listingId?: string | null
  buildingName?: string | null
  buildingAddress?: string | null
  unitNumber?: string | null
  bedrooms?: number | null
  bathrooms?: number | null
  livingAreaRange?: string | null
}

export interface WorkingDocEstimate {
  estimatedPrice?: number | null
  priceRange?: { low: number; high: number } | null
  matchTier?: string | null
  bestGeoTier?: string | null
  confidence?: string | null
  confidenceMessage?: string | null
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): marketSpeed block — engine
  // computes this every run; pre-fix mappers dropped. The seller
  // surface's MarketIntel grid renders DOM + status; estimator gains
  // the same block on email + lead.
  marketSpeed?: {
    avgDaysOnMarket?: number | null
    status?: string | null   // 'Fast' | 'Moderate' | 'Slow'
    message?: string | null
  } | null
}

// W-ESTIMATOR-TIER-RAIL (2026-06-17): 4-row "Confidence by Area" tier
// rail data, sourced from EstimateResult.tiers (lib/estimator/types.ts
// TierResult). The seller surface has used this shape since CV-0; the
// estimator workingDoc now persists it too so email + admin Estimator
// tab can render the SAME rail Charlie's plan email/dashboard render.
// Slot is null when the matcher's cascade had no comparables at that
// tier — renderer shows "no data" honestly per slot.
export interface WorkingDocTierSlot {
  count: number | null
  median: number | null
  range?: { low: number; high: number } | null
  estimatedPrice?: number | null
}

export interface WorkingDocTiers {
  platinum: WorkingDocTierSlot | null
  gold:     WorkingDocTierSlot | null
  silver:   WorkingDocTierSlot | null
  bronze:   WorkingDocTierSlot | null
}

// W-COMPETING-DIAG-IN-LITERAL (2026-06-18): forensic diag for the
// competing-listings fetch. Lives at workingDoc.competingDiag — same
// shape as the post-hoc mutation introduced in bf6af2e + bb8fbe6, but
// declared on the interface so it survives Next.js 14.2.5 server-action
// Flight serialization (recon/competing-diag-read-final.txt proved the
// mutation strategy never persisted: PART A literal fields survived,
// the post-hoc `(workingDoc as any).competingDiag = ...` was stripped).
// Internal-only — not rendered in email/tab.
export interface WorkingDocCompetingDiag {
  gate?: 'unknown' | 'passed' | 'skipped'
  path?: 'home' | 'condo'
  status?: number | null            // HTTP status from /api/charlie/competing-listings
  success?: boolean | null          // response body's success flag
  listingsLen?: number | null       // length of returned listings array
  error?: string | null             // error message (route catch OR fetch throw), 200-char cap
  missing?: string[] | null         // on gate='skipped', which subject fields were absent
}

export interface WorkingDoc {
  version: 1
  type: 'home' | 'condo'
  subject: WorkingDocSubject
  estimate: WorkingDocEstimate
  comparableSold?: WorkingDocSection | null
  taxMatch?: WorkingDocSection | null
  competing?: WorkingDocSection | null
  // W-ESTIMATOR-TIER-RAIL (2026-06-17): 4-row rail data. Absent on pre-
  // fix leads → renderer + admin tab gracefully omit the rail.
  tiers?: WorkingDocTiers | null
  // W-COMPETING-DIAG-IN-LITERAL (2026-06-18): see WorkingDocCompetingDiag.
  // MUST live on the return literal of buildOfferWorkingDoc — Next.js
  // Flight stripped post-hoc mutations on the workingDoc object.
  competingDiag?: WorkingDocCompetingDiag | null
}

// ─── Listing id resolver (listing_key → mls_listings.id) ─────────────────────
//
// /property/[id] is keyed by mls_listings.id (UUID). ComparableSale carries
// listingKey (MLS string key); CompetingListing carries both. Batch-resolve
// any listingKey-only tiles in a single query.

export async function resolveListingIds(
  supabase: SupabaseClient,
  listingKeys: string[],
): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const uniqueKeys = Array.from(new Set(listingKeys.filter(Boolean)))
  if (uniqueKeys.length === 0) return out
  const { data, error } = await supabase
    .from('mls_listings')
    .select('id, listing_key')
    .in('listing_key', uniqueKeys)
  if (error) {
    console.warn('[working-doc] resolveListingIds failed:', error.message)
    return out
  }
  for (const row of data || []) {
    if (row.listing_key) out[row.listing_key] = row.id
  }
  return out
}

// ─── Formatting helpers (no deps) ────────────────────────────────────────────

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '$' + Math.round(n).toLocaleString()
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return s
  }
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// W-ESTIMATOR-LEAD-RENDER-AND-EMAIL P2-LINKS (2026-06-17): switched from
// bare `/property/<uuid>` (404s on walliam.ca per property-slug.ts header
// comment — getDisplayAgentForBuilding miss on comparable buildings →
// notFound() at app/property/[id]/page.tsx:153) to the descriptive
// `/<slug>` pattern Charlie's email + the admin Plan tab tiles use.
// idMap is now unused — kept in the signature so callers don't change
// in this turn (buildLeadEmail / buildBuyerWorkingDocEmail will pass it
// harmlessly until a follow-up turn cleans the call sites).
function tileHref(
  baseUrl: string,
  tile: WorkingDocTile,
  _idMap: Record<string, string>,
  docType: 'home' | 'condo',
): string | null {
  const slug = buildPropertySlug({
    listingKey: tile.listingKey ?? null,
    unparsedAddress: tile.unparsedAddress ?? null,
    unitNumber: tile.unitNumber ?? null,
    path: docType,
  })
  if (!slug) return null
  return `${baseUrl}/${slug}`
}

function tierLabel(t?: string | null): string {
  if (!t) return ''
  const m: Record<string, string> = {
    platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze',
  }
  return m[t] || t.charAt(0).toUpperCase() + t.slice(1)
}

// ─── Tile + section renderers ────────────────────────────────────────────────

function renderTile(
  tile: WorkingDocTile,
  baseUrl: string,
  idMap: Record<string, string>,
  priceKind: 'close' | 'list',
  docType: 'home' | 'condo',
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): section anchor + showChip
  // gate. anchorTier is used as the FALLBACK for tile.sourceTier in
  // the tier-chip render (geo-cascade comparableSold tiles have
  // sourceTier null but the section's bestGeoTier names a winning
  // tier — established surface relies on this fallback so the tile
  // still shows a chip). showChip=false for COMPETING tiles
  // (deliberate omission matching CharlieLeadEstimate.tsx:108).
  anchorTier: string | null,
  showChip: boolean,
): string {
  const href = tileHref(baseUrl, tile, idMap, docType)
  const price = priceKind === 'list' ? tile.listPrice : tile.closePrice
  const adjusted = tile.adjustedPrice && tile.adjustedPrice !== price ? tile.adjustedPrice : null
  const addr = escapeHtml(tile.unparsedAddress || 'Address unavailable')
  const beds = tile.bedrooms != null ? `${tile.bedrooms}BR` : '—'
  const baths = tile.bathrooms != null ? `${tile.bathrooms}BA` : '—'
  const lar = tile.livingAreaRange ? `${escapeHtml(tile.livingAreaRange)} sqft` : ''
  const dom = tile.daysOnMarket != null ? `${tile.daysOnMarket}d on market` : ''
  const date = priceKind === 'close' ? fmtDate(tile.closeDate) : ''
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): per-tile chip via the
  // established helper. Mirrors charlie-plan-email-html.ts:358-368
  // (Outlook-safe inline-style <div>). Empty string when neither
  // sourceTier nor anchorTier is a valid TierName, OR when showChip
  // is false (competing).
  const chipHtml = showChip
    ? (() => {
        const chip = tierChipFor(tile.sourceTier ?? null, (anchorTier as _TierBestSlotChip | null) ?? null, docType)
        if (!chip) return ''
        return `<div style="display:inline-block;font-size:10px;font-weight:700;color:#fff;background:${chip.color};padding:2px 6px;border-radius:3px;margin-bottom:4px;">${chip.marker} ${chip.label} &middot; ${escapeHtml(chip.sub)}</div>`
      })()
    : ''
  const unit = tile.unitNumber ? `Unit ${escapeHtml(tile.unitNumber)}` : ''
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): adjustment story under the
  // tile. ComparableSale.adjustments is captured by the 3 mappers now;
  // each entry shows `reason · ±$amount`. Empty when no adjustments
  // (perfect-match comps); rendered as a compact list.
  const adjustmentsHtml = Array.isArray(tile.adjustments) && tile.adjustments.length > 0
    ? `<div style="font-size:10px;color:#475569;margin-top:4px;line-height:1.5;">${
        tile.adjustments.map(a => {
          const reason = a?.reason ? escapeHtml(a.reason) : (a?.type ? escapeHtml(String(a.type)) : 'Adjustment')
          const amt = a?.adjustmentAmount != null && Number.isFinite(a.adjustmentAmount)
            ? (a.adjustmentAmount >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(a.adjustmentAmount)).toLocaleString()
            : ''
          return `<div>• ${reason}${amt ? ` &middot; <span style="color:${a!.adjustmentAmount! >= 0 ? '#059669' : '#dc2626'};">${amt}</span>` : ''}</div>`
        }).join('')
      }</div>`
    : ''

  // C-PLAN-DOC-DEDUP (2026-06-13): photo + temperature badge + matchQuality +
  // Sold/For Sale affordance. Each is conditional — present only when its
  // underlying data is populated. Other email surfaces gain these too (a UX
  // improvement; the data was already in EstimateResult, just not rendered).
  // Dashboard React component is untouched.
  const photo = tile.mediaUrl ? escapeHtml(tile.mediaUrl) : ''
  const tempColor = tile.temperature === 'HOT' ? '#ef4444'
    : tile.temperature === 'WARM' ? '#f59e0b'
    : tile.temperature === 'COLD' ? '#3b82f6'
    : '#64748b'
  const tempBadge = priceKind === 'close' && tile.temperature
    ? `<div style="background:${tempColor};color:#fff;font-size:9px;font-weight:700;padding:2px 5px;margin-top:3px;text-align:center;border-radius:3px;">${escapeHtml(tile.temperature)}</div>`
    : ''
  const matchQ = tile.matchQuality
    ? `<div style="font-size:10px;color:#94a3b8;margin-top:3px;">${escapeHtml(tile.matchQuality)}</div>`
    : ''
  const priceColor = priceKind === 'close' ? '#059669' : '#1d4ed8'
  const affordance = priceKind === 'close' ? 'Sold →' : 'For Sale →'

  const priceCell = adjusted
    ? `<span style="font-weight:700;color:${priceColor};">${fmtPrice(price as number)}</span> <span style="font-size:11px;color:#64748b;">(adj ${fmtPrice(adjusted)})</span>`
    : `<span style="font-weight:700;color:${priceColor};">${fmtPrice(price as number)}</span>`

  const linkOpen = href ? `<a href="${href}" style="color:#1d4ed8;text-decoration:none;">` : ''
  const linkClose = href ? `</a>` : ''

  const photoCell = photo ? `
      <td width="80" style="padding:10px 0 10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
        <img src="${photo}" alt="" width="80" height="72" style="display:block;width:80px;height:72px;object-fit:cover;border-radius:6px;">
        ${tempBadge}
      </td>` : ''

  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): chip placed ABOVE address
  // (same layout as charlie-plan-email-html.ts:411 — chip line, then
  // address). Removed the old plain-grey-text tier label on the price
  // column (it was misaligned with the established surface and
  // duplicated the chip information). adjustment story rendered under
  // the meta line. matchQ (matchQuality caption) already wired at L260.
  return `
    <tr>${photoCell}
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
        ${chipHtml}
        ${linkOpen}<div style="font-size:13px;color:#0f172a;font-weight:600;">${addr}</div>${linkClose}
        ${unit ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${unit}</div>` : ''}
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${beds} · ${baths}${lar ? ' · ' + lar : ''}</div>
        ${matchQ}
        ${adjustmentsHtml}
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;vertical-align:top;white-space:nowrap;">
        ${priceCell}
        ${date ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${date}</div>` : ''}
        ${dom ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${dom}</div>` : ''}
        <div style="font-size:10px;color:#94a3b8;margin-top:3px;">${affordance}</div>
      </td>
    </tr>
  `
}

function renderSection(
  title: string,
  subtitle: string,
  section: WorkingDocSection | null | undefined,
  baseUrl: string,
  idMap: Record<string, string>,
  priceKind: 'close' | 'list',
  docType: 'home' | 'condo',
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): showChip threaded so the
  // Competing section can opt out (matches the deliberate
  // CharlieLeadEstimate.tsx:108 omission for active competition).
  showChip: boolean,
  // W-ESTIMATOR-TAXRAIL-POSITION (2026-06-18): optional HTML block
  // injected BETWEEN the subheader and the tiles table. Used by the
  // tax section to put its 4-row "Tax-Match Confidence by Area" rail
  // ABOVE the comp tiles, matching how the top-of-email geo rail sits
  // above Comparable Sold. Empty string = no insert = pre-fix layout
  // for every other caller (comparableSold + competing pass nothing).
  topInsertHtml: string = '',
): string {
  if (!section || !section.tiles || section.tiles.length === 0) return ''
  const tilesHtml = section.tiles.slice(0, 10).map(t => renderTile(t, baseUrl, idMap, priceKind, docType, section.bestGeoTier ?? null, showChip)).join('')
  const median = section.median != null ? `Median ${fmtPrice(section.median)}` : ''
  const est = section.estimatedPrice != null ? `Section estimate ${fmtPrice(section.estimatedPrice)}` : ''
  const anchor = section.bestGeoTier ? `${tierLabel(section.bestGeoTier)} anchor` : ''
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): include section.priceRange
  // in the subheader when present (tax-match section carries it on
  // EstimateResult.taxMatch.priceRange; comparableSold + competing
  // don't carry it). Format matches "Range $X – $Y".
  const range = section.priceRange
    ? `Range ${fmtPrice(section.priceRange.low)} – ${fmtPrice(section.priceRange.high)}`
    : ''
  const subHeader = [anchor, est, range, median, `${section.count} comp${section.count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  return `
    <div style="margin-top:24px;">
      <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(subtitle)}</div>
      <div style="font-size:11px;color:#475569;margin-top:6px;">${subHeader}</div>
      ${topInsertHtml}
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;font-size:13px;">
        ${tilesHtml}
      </table>
    </div>
  `
}

// ─── Top-level render functions ──────────────────────────────────────────────

interface RenderOptions {
  audience: 'agent' | 'buyer'
  brandName?: string                          // tenant brand (e.g. "WALLiam")
}

export function renderWorkingDocSections(
  doc: WorkingDoc | null | undefined,
  baseUrl: string,
  idMap: Record<string, string>,
  opts: RenderOptions,
): string {
  if (!doc) return ''
  // W-ESTIMATOR-LEAD-RENDER-AND-EMAIL P2-LINKS (2026-06-17): thread the
  // doc.type into the chain so tileHref picks home- vs condo-style slug.
  const docType: 'home' | 'condo' = doc.type === 'home' ? 'home' : 'condo'
  const sold = renderSection(
    'Comparable Sold',
    opts.audience === 'agent'
      ? 'Recent sold comparables in the area, scored against the subject.'
      : 'Recent sold homes in your area that match your property.',
    doc.comparableSold,
    baseUrl, idMap, 'close', docType,
    /* showChip */ true,
  )
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): build the SECOND tier rail
  // (tax-match cascade's own 4-tier breakdown) for the Tax-Matched
  // section. Reuses renderTierRailFromSlots with a distinct caption.
  // W-ESTIMATOR-TAXRAIL-POSITION (2026-06-18): build the rail BEFORE
  // renderSection runs and inject it as `topInsertHtml` so the rail
  // sits ABOVE the tax tiles (mirrors how the geo rail sits above
  // Comparable Sold). Was previously concatenated AFTER the section.
  const taxTierRail = doc.taxMatch?.tiers
    ? renderTierRailFromSlots(
        doc.taxMatch.tiers,
        (doc.taxMatch.bestGeoTier as any) || 'none',
        docType,
        'Tax-Match Confidence by Area',
      )
    : ''
  const tax = renderSection(
    'Tax-Matched',
    opts.audience === 'agent'
      ? 'Comparables in the same property-tax band (±20%).'
      : 'Recent sales of homes paying similar property tax to yours.',
    doc.taxMatch,
    baseUrl, idMap, 'close', docType,
    /* showChip */ true,
    /* topInsertHtml */ taxTierRail,
  )
  const competing = renderSection(
    'Competing For Sale',
    opts.audience === 'agent'
      ? 'Currently active listings competing for the same buyer.'
      : 'Other homes currently for sale that buyers may compare with yours.',
    doc.competing,
    baseUrl, idMap, 'list', docType,
    // W-COMPETING-GEO-PILLS (2026-06-19): flipped false → true. Tier is
    // now stamped at the matcher source and carried on each tile's
    // sourceTier (working-doc-render.ts tileFromCompeting + the inline
    // tile-builder in HomeEstimatorResults.tsx). renderTile's chip block
    // at L298-L304 reads sourceTier (falling back to anchorTier =
    // section.bestGeoTier) and emits the same Outlook-safe inline chip
    // used by Comparable Sold + Tax-Matched. Cross-surface consistency:
    // matches the in-chat tile badge + lead WorkingDocView TileRow.
    /* showChip */ true,
  )
  if (!sold && !tax && !competing) return ''
  // W-ESTIMATOR-TAXRAIL-POSITION (2026-06-18): the tax-match rail is
  // now injected ABOVE the tax tiles inside `tax` (via
  // renderSection's topInsertHtml arg), so the top-level concat is
  // just the 3 sections. Pre-fix tax sections that lack the rail
  // (no doc.taxMatch.tiers) get topInsertHtml='' → byte-equivalent.
  return sold + tax + competing
}

export function renderEstimateHeader(
  doc: WorkingDoc | null | undefined,
  opts: RenderOptions,
): string {
  if (!doc) return ''
  const est = doc.estimate || {}
  const subj = doc.subject || {}
  const price = est.estimatedPrice != null ? fmtPrice(est.estimatedPrice) : null
  const range = est.priceRange ? `${fmtPrice(est.priceRange.low)} — ${fmtPrice(est.priceRange.high)}` : null
  const subjectLine = [subj.buildingName, subj.buildingAddress, subj.unitNumber ? '#' + subj.unitNumber : ''].filter(Boolean).join(' · ')
  const heading = opts.audience === 'agent' ? 'Estimator working document' : 'Your estimate'
  // W-ESTIMATOR-TIER-RAIL (2026-06-17): rail appended to the header
  // output so both lib/actions/leads.ts:buildLeadEmail and
  // :buildBuyerWorkingDocEmail pick it up via their existing
  // renderEstimateHeader call sites — no leads.ts plumbing change
  // needed. Returns empty string when doc.tiers is absent (pre-fix
  // leads omit the rail gracefully).
  const tierRail = renderTierRail(doc)
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): confidenceMessage rendered
  // beneath the confidence/matchTier line. The mapper captures it (per
  // the WorkingDocEstimate type at L86); pre-fix renderer never read it.
  const confidenceMsg = est.confidenceMessage
    ? `<div style="font-size:11px;color:#64748b;margin-top:4px;line-height:1.4;">${escapeHtml(est.confidenceMessage)}</div>`
    : ''
  // W-ESTIMATOR-CONTENT-PARITY (2026-06-18): marketSpeed block — Avg DOM
  // + status (Fast/Moderate/Slow) + optional message. Mirrors the
  // seller surface MarketIntel grid (CharlieLeadEstimate.tsx MarketIntel
  // block; same engine field).
  const ms = (est as any).marketSpeed as { avgDaysOnMarket?: number | null; status?: string | null; message?: string | null } | null | undefined
  const marketSpeedHtml = ms && (ms.avgDaysOnMarket != null || ms.status || ms.message)
    ? `<div style="margin-top:12px;padding:10px 12px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;">
         <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.08em;">Market Speed</div>
         <div style="font-size:12px;color:#0f172a;margin-top:4px;">${[
            ms.avgDaysOnMarket != null ? `Avg DOM: <strong>${ms.avgDaysOnMarket}d</strong>` : '',
            ms.status ? `Status: <strong>${escapeHtml(ms.status)}</strong>` : '',
          ].filter(Boolean).join(' &middot; ')}</div>
         ${ms.message ? `<div style="font-size:11px;color:#64748b;margin-top:3px;">${escapeHtml(ms.message)}</div>` : ''}
       </div>`
    : ''
  return `
    <div style="margin-top:20px;padding:18px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(heading)}</div>
      ${subjectLine ? `<div style="font-size:14px;color:#0f172a;font-weight:600;margin-top:4px;">${escapeHtml(subjectLine)}</div>` : ''}
      ${price ? `<div style="font-size:24px;color:#0f172a;font-weight:800;margin-top:8px;">${price}</div>` : ''}
      ${range ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">Range ${range}</div>` : ''}
      ${est.confidence ? `<div style="font-size:11px;color:#475569;margin-top:6px;">Confidence: ${escapeHtml(est.confidence)}${est.matchTier ? ' · ' + escapeHtml(est.matchTier) : ''}</div>` : ''}
      ${confidenceMsg}
      ${marketSpeedHtml}
    </div>
    ${tierRail}
  `
}

// ─── Tier rail (email HTML) ──────────────────────────────────────────────────
//
// W-ESTIMATOR-TIER-RAIL (2026-06-17): 4-row "Confidence by Area" rail
// mirroring Charlie's plan email (lib/email/charlie-plan-email-html.ts
// :664-688). Outlook-safe nested <table>-per-row layout — CSS grid /
// flexbox would not render reliably in Outlook Desktop. Same TIER_META
// + TIER_ORDER as the seller surface (single source of truth). Slot
// null → renders "no data" honestly per slot (mirrors the seller
// renderer).
//
// `path` decides home vs condo sub-text per slot (street vs building
// for Platinum, etc.). Mirrors the seller's TIER_META[slot].homeSub /
// .condoSub split.
//
// Returns empty string when doc.tiers is absent (pre-fix leads have no
// tiers field — graceful omission).

import {
  TIER_META as _TIER_META_EMAIL,
  TIER_ORDER as _TIER_ORDER_EMAIL,
  type TierBestSlot as _TierBestSlot_EMAIL,
} from '@/lib/charlie/tier-chip'

function tierRailRightCell(tr: WorkingDocTierSlot | null): string {
  if (!tr) return `<span style="font-size:11px;color:#94a3b8;font-style:italic;">no data</span>`
  const med = tr.median != null
    ? '$' + Number(tr.median).toLocaleString('en-CA')
    : '&mdash;'
  const cnt = tr.count ?? 0
  return `<span style="font-size:14px;font-weight:700;color:#0f172a;">${med}</span> <span style="font-size:11px;color:#64748b;margin-left:8px;">${cnt} comp${cnt === 1 ? '' : 's'}</span>`
}

// W-ESTIMATOR-CONTENT-PARITY (2026-06-18): rail render extracted to a
// slots-taking helper so the SAME renderer can drive both the geo rail
// (doc.tiers) at the top of the email AND the tax-match rail
// (doc.taxMatch.tiers) under the Tax-Matched section. Caption is the
// only visual difference between the two rails.
export function renderTierRailFromSlots(
  slots: WorkingDocTiers | null | undefined,
  bestGeoTier: _TierBestSlot_EMAIL,
  docType: 'home' | 'condo',
  caption: string = 'Confidence by Area',
): string {
  if (!slots) return ''
  const rowsHtml = _TIER_ORDER_EMAIL.map(slot => {
    const tr = slots[slot]
    const meta = _TIER_META_EMAIL[slot]
    const sub = docType === 'home' ? meta.homeSub : meta.condoSub
    const isBest = bestGeoTier === slot
    const bg = isBest ? '#ecfdf5' : '#f8fafc'
    const border = isBest ? '#34d399' : '#e2e8f0'
    return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:6px;"><tr><td style="padding: 10px 12px; background: ${bg}; border: 1px solid ${border}; border-radius: 8px;"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align: middle;">
        <span style="display:inline-block;background:${meta.color};color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px;">${meta.marker} ${meta.label}</span>
        <span style="font-size:12px;color:#475569;margin-left:8px;">${sub}</span>
        ${isBest ? '<span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#047857;background:#d1fae5;padding:2px 6px;border-radius:3px;margin-left:8px;">Anchor</span>' : ''}
      </td>
      <td style="text-align: right; vertical-align: middle; white-space: nowrap;">${tierRailRightCell(tr)}</td>
    </tr></table></td></tr></table>`
  }).join('')

  return `
    <div style="margin: 20px 0;">
      <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px;">${escapeHtml(caption)}</div>
      ${rowsHtml}
      <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">Narrow spread = high confidence. Wide spread = subject&apos;s block sold differently than the community.</div>
    </div>
  `
}

export function renderTierRail(
  doc: WorkingDoc | null | undefined,
): string {
  if (!doc || !doc.tiers) return ''
  const sellerPath: 'home' | 'condo' = doc.type === 'home' ? 'home' : 'condo'
  const bestGeoTier: _TierBestSlot_EMAIL =
    (doc.estimate?.bestGeoTier as _TierBestSlot_EMAIL) || 'none'
  return renderTierRailFromSlots(doc.tiers, bestGeoTier, sellerPath)
}

// ─── Working-doc subset builders (server-side from EstimateResult) ───────────
// Used by callers that want to compute the persisted JSON from the in-memory
// EstimateResult + competingListings + subject. Kept here for shape-symmetry
// with the renderers. Callers may also build the JSON inline.

export function buildWorkingDocFromResult(input: {
  type: 'home' | 'condo'
  subject: WorkingDocSubject
  result: any                                 // EstimateResult shape (lib/estimator/types)
  competingListings?: any[] | null
}): WorkingDoc {
  const { result } = input

  const tileFromComp = (c: any): WorkingDocTile => ({
    listingKey: c?.listingKey ?? null,
    closePrice: c?.closePrice ?? null,
    adjustedPrice: c?.adjustedPrice ?? null,
    closeDate: c?.closeDate ?? null,
    daysOnMarket: c?.daysOnMarket ?? null,
    bedrooms: c?.bedrooms ?? null,
    bathrooms: c?.bathrooms ?? null,
    livingAreaRange: c?.livingAreaRange ?? null,
    unitNumber: c?.unitNumber ?? null,
    unparsedAddress: c?.unparsedAddress ?? null,
    matchTier: c?.matchTier ?? null,
    sourceTier: c?.sourceTier ?? null,
    temperature: c?.temperature ?? null,
    // C-PLAN-DOC-DEDUP: carry photo + matchQuality forward so the working-doc
    // render covers what the legacy comparableSoldHtml block used to show.
    mediaUrl: c?.mediaUrl ?? c?.media?.[0]?.media_url ?? c?.media?.[0]?.url ?? null,
    matchQuality: c?.matchQuality ?? null,
  })

  const tileFromCompeting = (c: any): WorkingDocTile => ({
    id: c?.id ?? null,
    listingKey: c?.listing_key ?? null,
    listPrice: c?.list_price ?? null,
    daysOnMarket: c?.days_on_market ?? null,
    bedrooms: c?.bedrooms_total ?? null,
    bathrooms: c?.bathrooms_total_integer ?? null,
    livingAreaRange: c?.living_area_range ?? null,
    unitNumber: c?.unit_number ?? null,
    unparsedAddress: c?.unparsed_address ?? null,
    // C-PLAN-DOC-DEDUP: same — covers what legacy competingHtml used to show.
    mediaUrl: c?.mediaUrl ?? c?.media?.[0]?.media_url ?? c?.media?.[0]?.url ?? null,
    // W-COMPETING-GEO-PILLS (2026-06-19): tier stamped at the matcher
    // source. Uniform per response. Email chip + lead TileRow read this
    // field (TileRow already wired; email chip flipped on at the
    // renderSection showChip arg).
    sourceTier: c?.sourceTier ?? null,
  })

  const comparableSold: WorkingDocSection | null =
    Array.isArray(result?.comparables) && result.comparables.length > 0
      ? {
          bestGeoTier: result?.bestGeoTier ?? null,
          count: result?.tiers?.[result?.bestGeoTier]?.count ?? result.comparables.length,
          estimatedPrice: result?.estimatedPrice ?? null,
          median: result?.tiers?.[result?.bestGeoTier]?.median ?? null,
          tiles: result.comparables.slice(0, 10).map(tileFromComp),
        }
      : null

  const taxMatch: WorkingDocSection | null =
    result?.taxMatch && Array.isArray(result.taxMatch.comparables) && result.taxMatch.comparables.length > 0
      ? {
          bestGeoTier: result.taxMatch.bestGeoTier ?? null,
          count: result.taxMatch.count ?? result.taxMatch.comparables.length,
          estimatedPrice: result.taxMatch.estimatedPrice ?? null,
          tiles: result.taxMatch.comparables.slice(0, 10).map(tileFromComp),
        }
      : null

  const competing: WorkingDocSection | null =
    Array.isArray(input.competingListings) && input.competingListings.length > 0
      ? {
          // W-COMPETING-GEO-PILLS (2026-06-19): section-level bestGeoTier
          // = tile-level tier (uniform — cascade returns one level). Lets
          // the email subheader render the anchor label and the chip
          // fallback work via anchorTier when individual tiles lack
          // sourceTier (pre-stamp rows passing through legacy fixtures).
          bestGeoTier: (input.competingListings[0] as any)?.sourceTier ?? null,
          count: input.competingListings.length,
          tiles: input.competingListings.slice(0, 10).map(tileFromCompeting),
        }
      : null

  return {
    version: 1,
    type: input.type,
    subject: input.subject,
    estimate: {
      estimatedPrice: result?.estimatedPrice ?? null,
      priceRange: result?.priceRange ?? null,
      matchTier: result?.matchTier ?? null,
      bestGeoTier: result?.bestGeoTier ?? null,
      confidence: result?.confidence ?? null,
      confidenceMessage: result?.confidenceMessage ?? null,
    },
    comparableSold,
    taxMatch,
    competing,
  }
}

// ─── Collect all listingKeys in a doc (for resolveListingIds batch) ─────────

export function collectListingKeys(doc: WorkingDoc | null | undefined): string[] {
  if (!doc) return []
  const keys: string[] = []
  const grab = (s?: WorkingDocSection | null) => {
    if (!s) return
    for (const t of s.tiles) {
      if (t.listingKey && !t.id) keys.push(t.listingKey)
    }
  }
  grab(doc.comparableSold)
  grab(doc.taxMatch)
  grab(doc.competing)
  return keys
}
