import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export type SearchResultType =
  | 'neighbourhood'
  | 'community'
  | 'building'
  | 'municipality'
  | 'listing'

export interface SearchResult {
  type: SearchResultType
  id: string
  name: string
  slug: string
  subtitle: string
  url: string
}

export interface SearchResponse {
  groups: { label: string; results: SearchResult[] }[]
}

// ─── Intent detection ─────────────────────────────────────────────────────────

type Intent =
  | { mode: 'number_only'; number: string }
  | { mode: 'address'; number: string; street: string }
  | { mode: 'geo_prefix'; text: string }
  | { mode: 'name'; text: string }

function detectIntent(q: string): Intent {
  const trimmed = q.trim()

  if (/^\d+$/.test(trimmed))
    return { mode: 'number_only', number: trimmed }

  const addressMatch = trimmed.match(/^(\d+)\s+(.+)$/)
  if (addressMatch)
    return { mode: 'address', number: addressMatch[1], street: addressMatch[2].trim() }

  if (trimmed.length <= 5 && !/\d/.test(trimmed))
    return { mode: 'geo_prefix', text: trimmed }

  return { mode: 'name', text: trimmed }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildingResult(b: {
  id: string
  building_name: string
  slug: string
  street_number: string | null
  street_name: string | null
  active_listings_count?: number
}): SearchResult {
  const address = [b.street_number, b.street_name].filter(Boolean).join(' ')
  const count = b.active_listings_count
  const subtitle = [address, count ? `${count} active` : null].filter(Boolean).join(' · ')
  return {
    type: 'building',
    id: b.id,
    name: b.building_name,
    slug: b.slug,
    subtitle: subtitle || 'Condo Building',
    url: `/${b.slug}`,
  }
}

function listingResult(l: {
  id: string
  unparsed_address: string
  property_subtype?: string | null
  bedrooms_total?: number | null
  transaction_type?: string | null
  list_price?: number | null
}): SearchResult {
  const price = l.list_price ? `$${Number(l.list_price).toLocaleString()}` : ''
  const beds = l.bedrooms_total ? `${l.bedrooms_total}bd` : ''
  const txn = l.transaction_type === 'Lease' ? 'For Lease' : 'For Sale'
  return {
    type: 'listing',
    id: l.id,
    name: l.unparsed_address,
    slug: l.id,
    subtitle: [l.property_subtype, beds, txn, price].filter(Boolean).join(' · '),
    url: `/property/${l.id}`,
  }
}

function geoResult(
  type: SearchResultType,
  id: string,
  name: string,
  slug: string,
  subtitle: string,
  url: string
): SearchResult {
  return { type, id, name, slug, subtitle, url }
}

function cleanMuniSubtitle(muniName: string): string {
  return muniName.match(/^Toronto [CEW]\d+$/) ? 'Toronto' : muniName
}

// ─── Geo query (shared) ───────────────────────────────────────────────────────

async function fetchGeo(
  textPattern: string,
  usePrefix: boolean
): Promise<SearchResult[]> {
  const pattern = usePrefix ? `${textPattern}%` : `%${textPattern}%`
  const containsPattern = `%${textPattern}%`

  const [neighbourhoodsRes, munisRes, communitiesRes] = await Promise.all([
    supabase
      .from('neighbourhoods')
      .select('id, name, slug')
      .ilike('name', containsPattern)
      .eq('is_active', true)
      .order('display_order')
      .limit(3),

    supabase
      .from('municipalities')
      .select('id, name, slug, treb_areas(name)')
      .ilike('name', pattern)
      .not('name', 'ilike', 'Toronto C%')
      .not('name', 'ilike', 'Toronto E%')
      .not('name', 'ilike', 'Toronto W%')
      .eq('is_active', true)
      .limit(4),

    supabase
      .from('communities')
      .select('id, name, slug, municipalities(name)')
      .ilike('name', pattern)
      .eq('is_active', true)
      .limit(4),
  ])

  const geo: SearchResult[] = []

  for (const n of neighbourhoodsRes.data ?? []) {
    geo.push(geoResult('neighbourhood', n.id, n.name, n.slug, 'Toronto Neighbourhood', `/toronto/${n.slug}`))
  }
  for (const m of munisRes.data ?? []) {
    const area = Array.isArray(m.treb_areas) ? m.treb_areas[0] : m.treb_areas
    geo.push(geoResult('municipality', m.id, m.name, m.slug, (area as any)?.name ?? 'Ontario', `/${m.slug}`))
  }
  for (const c of communitiesRes.data ?? []) {
    const muni = Array.isArray(c.municipalities) ? c.municipalities[0] : c.municipalities
    geo.push(geoResult('community', c.id, c.name, c.slug, cleanMuniSubtitle((muni as any)?.name ?? ''), `/${c.slug}`))
  }

  return geo
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ groups: [] })

  const intent = detectIntent(q)
  const groups: SearchResponse['groups'] = []

  // ── NUMBER ONLY: "101", "55" ──────────────────────────────────────────────
  if (intent.mode === 'number_only') {
    const [byStreetNum, byName, listingsRes] = await Promise.all([
      // Buildings at this street number — ordered by most active listings
      supabase
        .from('buildings_with_listing_counts')
        .select('id, building_name, slug, street_number, street_name, active_listings_count')
        .eq('street_number', intent.number)
        .order('active_listings_count', { ascending: false })
        .limit(6),

      // Buildings whose name starts with this number — e.g. "101 Erskine"
      supabase
        .from('buildings_with_listing_counts')
        .select('id, building_name, slug, street_number, street_name, active_listings_count')
        .ilike('building_name', `${intent.number}%`)
        .order('active_listings_count', { ascending: false })
        .limit(4),

      // Active listings starting with this number
      supabase
        .from('mls_listings')
        .select('id, unparsed_address, property_subtype, list_price, transaction_type, bedrooms_total')
        .ilike('unparsed_address', `${intent.number} %`)
        .eq('available_in_idx', true)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .order('list_price', { ascending: false })
        .limit(4),
    ])

    // Merge + deduplicate by id, keep ordering from byStreetNum first
    const seen = new Set<string>()
    const merged: typeof byStreetNum.data = []

    for (const b of [...(byStreetNum.data ?? []), ...(byName.data ?? [])]) {
      if (!seen.has(b.id)) {
        seen.add(b.id)
        merged.push(b)
      }
    }

    // Re-sort merged by active_listings_count desc
    merged.sort((a, b) => (b.active_listings_count ?? 0) - (a.active_listings_count ?? 0))

    if (merged.length) {
      groups.push({
        label: `Buildings at #${intent.number}`,
        results: merged.slice(0, 8).map(buildingResult),
      })
    }

    if (listingsRes.data?.length) {
      groups.push({
        label: 'Active Listings',
        results: listingsRes.data.map(listingResult),
      })
    }

    return NextResponse.json({ groups })
  }

  // ── ADDRESS: "101 charles", "55 king st w" ────────────────────────────────
  if (intent.mode === 'address') {
    const streetPattern = `%${intent.street}%`

    const [buildingsRes, listingsRes] = await Promise.all([
      supabase
        .from('buildings_with_listing_counts')
        .select('id, building_name, slug, street_number, street_name, active_listings_count')
        .eq('street_number', intent.number)
        .ilike('street_name', streetPattern)
        .order('active_listings_count', { ascending: false })
        .limit(5),

      supabase
        .from('mls_listings')
        .select('id, unparsed_address, property_subtype, list_price, transaction_type, bedrooms_total')
        .ilike('unparsed_address', `%${intent.number} ${intent.street}%`)
        .eq('available_in_idx', true)
        .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
        .order('list_price', { ascending: false })
        .limit(5),
    ])

    if (buildingsRes.data?.length) {
      groups.push({ label: 'Buildings', results: buildingsRes.data.map(buildingResult) })
    }

    if (listingsRes.data?.length) {
      groups.push({ label: 'Units at this Address', results: listingsRes.data.map(listingResult) })
    }

    // Fallback: widen to street name only
    if (!groups.length) {
      const { data: fallback } = await supabase
        .from('buildings_with_listing_counts')
        .select('id, building_name, slug, street_number, street_name, active_listings_count')
        .ilike('street_name', streetPattern)
        .order('active_listings_count', { ascending: false })
        .limit(5)

      if (fallback?.length) {
        groups.push({
          label: `Buildings on ${intent.street}`,
          results: fallback.map(buildingResult),
        })
      }
    }

    return NextResponse.json({ groups })
  }

  // ── GEO PREFIX: "miss", "eto", "scarb" (≤5 chars, no digits) ────────────
  if (intent.mode === 'geo_prefix') {
    const geo = await fetchGeo(intent.text, true)
    if (geo.length) groups.push({ label: 'Areas & Communities', results: geo })
    return NextResponse.json({ groups })
  }

  // ── NAME MODE: "aura", "annex", "x2 condos" ──────────────────────────────
  const [geo, buildingsRes, listingsRes] = await Promise.all([
    fetchGeo(intent.text, false),

    supabase
      .from('buildings_with_listing_counts')
      .select('id, building_name, slug, street_number, street_name, active_listings_count')
      .ilike('building_name', `%${intent.text}%`)
      .order('active_listings_count', { ascending: false })
      .limit(5),

    // Listings only for longer queries
    intent.text.length >= 7
      ? supabase
          .from('mls_listings')
          .select('id, unparsed_address, property_subtype, list_price, transaction_type, bedrooms_total')
          .ilike('unparsed_address', `%${intent.text}%`)
          .eq('available_in_idx', true)
          .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
          .order('list_price', { ascending: false })
          .limit(4)
      : Promise.resolve({ data: [] as any[] }),
  ])

  if (geo.length) groups.push({ label: 'Areas & Communities', results: geo })

  if (buildingsRes.data?.length) {
    groups.push({ label: 'Buildings', results: buildingsRes.data.map(buildingResult) })
  }

  const listings = ((listingsRes as any).data ?? []).map(listingResult)
  if (listings.length) groups.push({ label: 'Active Listings', results: listings })

  return NextResponse.json({ groups })
}