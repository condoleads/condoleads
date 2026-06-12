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

// ─── Persisted JSON shape ────────────────────────────────────────────────────

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
}

export interface WorkingDocSection {
  bestGeoTier?: string | null
  count: number
  estimatedPrice?: number | null
  median?: number | null
  tiles: WorkingDocTile[]                     // capped at 10 per section
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
}

export interface WorkingDoc {
  version: 1
  type: 'home' | 'condo'
  subject: WorkingDocSubject
  estimate: WorkingDocEstimate
  comparableSold?: WorkingDocSection | null
  taxMatch?: WorkingDocSection | null
  competing?: WorkingDocSection | null
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

// ─── Tile + section renderers ────────────────────────────────────────────────

function renderTile(
  tile: WorkingDocTile,
  baseUrl: string,
  idMap: Record<string, string>,
  priceKind: 'close' | 'list',
): string {
  const href = tileHref(baseUrl, tile, idMap)
  const price = priceKind === 'list' ? tile.listPrice : tile.closePrice
  const adjusted = tile.adjustedPrice && tile.adjustedPrice !== price ? tile.adjustedPrice : null
  const addr = escapeHtml(tile.unparsedAddress || 'Address unavailable')
  const beds = tile.bedrooms != null ? `${tile.bedrooms}BR` : '—'
  const baths = tile.bathrooms != null ? `${tile.bathrooms}BA` : '—'
  const lar = tile.livingAreaRange ? `${escapeHtml(tile.livingAreaRange)} sqft` : ''
  const dom = tile.daysOnMarket != null ? `${tile.daysOnMarket}d on market` : ''
  const date = priceKind === 'close' ? fmtDate(tile.closeDate) : ''
  const tier = tile.sourceTier ? tierLabel(tile.sourceTier) : ''
  const unit = tile.unitNumber ? `Unit ${escapeHtml(tile.unitNumber)}` : ''

  const priceCell = adjusted
    ? `<span style="font-weight:700;color:#0f172a;">${fmtPrice(price as number)}</span> <span style="font-size:11px;color:#64748b;">(adj ${fmtPrice(adjusted)})</span>`
    : `<span style="font-weight:700;color:#0f172a;">${fmtPrice(price as number)}</span>`

  const linkOpen = href ? `<a href="${href}" style="color:#1d4ed8;text-decoration:none;">` : ''
  const linkClose = href ? `</a>` : ''

  return `
    <tr>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
        ${linkOpen}<div style="font-size:13px;color:#0f172a;font-weight:600;">${addr}</div>${linkClose}
        ${unit ? `<div style="font-size:11px;color:#64748b;margin-top:2px;">${unit}</div>` : ''}
        <div style="font-size:11px;color:#64748b;margin-top:2px;">${beds} · ${baths}${lar ? ' · ' + lar : ''}</div>
      </td>
      <td style="padding:10px 8px;border-bottom:1px solid #e2e8f0;text-align:right;vertical-align:top;white-space:nowrap;">
        ${priceCell}
        ${tier ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">${tier}</div>` : ''}
        ${date ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${date}</div>` : ''}
        ${dom ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${dom}</div>` : ''}
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
): string {
  if (!section || !section.tiles || section.tiles.length === 0) return ''
  const tilesHtml = section.tiles.slice(0, 10).map(t => renderTile(t, baseUrl, idMap, priceKind)).join('')
  const median = section.median != null ? `Median ${fmtPrice(section.median)}` : ''
  const est = section.estimatedPrice != null ? `Section estimate ${fmtPrice(section.estimatedPrice)}` : ''
  const anchor = section.bestGeoTier ? `${tierLabel(section.bestGeoTier)} anchor` : ''
  const subHeader = [anchor, est, median, `${section.count} comp${section.count === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  return `
    <div style="margin-top:24px;">
      <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(title)}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(subtitle)}</div>
      <div style="font-size:11px;color:#475569;margin-top:6px;">${subHeader}</div>
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
  const sold = renderSection(
    'Comparable Sold',
    opts.audience === 'agent'
      ? 'Recent sold comparables in the area, scored against the subject.'
      : 'Recent sold homes in your area that match your property.',
    doc.comparableSold,
    baseUrl, idMap, 'close',
  )
  const tax = renderSection(
    'Tax-Matched',
    opts.audience === 'agent'
      ? 'Comparables in the same property-tax band (±20%).'
      : 'Recent sales of homes paying similar property tax to yours.',
    doc.taxMatch,
    baseUrl, idMap, 'close',
  )
  const competing = renderSection(
    'Competing For Sale',
    opts.audience === 'agent'
      ? 'Currently active listings competing for the same buyer.'
      : 'Other homes currently for sale that buyers may compare with yours.',
    doc.competing,
    baseUrl, idMap, 'list',
  )
  if (!sold && !tax && !competing) return ''
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
  return `
    <div style="margin-top:20px;padding:18px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(heading)}</div>
      ${subjectLine ? `<div style="font-size:14px;color:#0f172a;font-weight:600;margin-top:4px;">${escapeHtml(subjectLine)}</div>` : ''}
      ${price ? `<div style="font-size:24px;color:#0f172a;font-weight:800;margin-top:8px;">${price}</div>` : ''}
      ${range ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">Range ${range}</div>` : ''}
      ${est.confidence ? `<div style="font-size:11px;color:#475569;margin-top:6px;">Confidence: ${escapeHtml(est.confidence)}${est.matchTier ? ' · ' + escapeHtml(est.matchTier) : ''}</div>` : ''}
    </div>
  `
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
