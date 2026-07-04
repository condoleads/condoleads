// W-MARKETING A-UNIT-1b STAGE 2 (2026-07-01): sitemap CHILD as Route Handler.
//
// Dispatches by id:
//   id < listingChunks         -> listings chunk (offset = id * LISTINGS_CHUNK_SIZE)
//   id == listingChunks        -> buildings
//   id == listingChunks + 1    -> geo
//   otherwise                  -> empty <urlset>
//
// listingChunks recomputed the same way as the index (identical SQL
// predicate + math). Must stay in sync with app/sitemap.xml/route.ts.
//
// HOST GATE: non-tenant hosts (owner promo / legacy / unknown) get an
// empty <urlset> — mirrors robots.ts Branch 1's "not a tenant" treatment.
// Fires BEFORE any DB call.

// A-UNIT-2 SEO-FLAG (2026-07-04): eligibility gate moved from
// getCurrentTenantId() to isSeoEnabledTenant() — reads tenants.seo_enabled
// so aily emits full urlset, walliam emits the existing empty-urlset
// (matches the existing not-eligible response shape — HTTP 200 empty
// <urlset/>). Non-SEO callers of getCurrentTenantId() unaffected.

import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { isSeoEnabledTenant } from '@/lib/utils/seo-scope'
import { generatePropertySlug, generateHomePropertySlug } from '@/lib/utils/slugs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 3600

// ─── shared config (KEEP IN SYNC with app/sitemap.xml/route.ts) ─────────
const LISTINGS_CHUNK_SIZE = 50_000
const RPC_PAGE_SIZE = 5000              // PGRST_MAX_ROWS on this project
const OWNER_PROMO_HOSTS = new Set<string>(['condoleads.ca', '01leads.com'])
const HOME_SUBTYPES = [
  'Detached', 'Semi-Detached', 'Att/Row/Townhouse',
  'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex',
]
const ACTIVE_STATUSES = ['Active', 'Active Under Contract']

// Kind -> URL path prefix. Route conventions live in the app, not the DB.
const GEO_PATH_PREFIX: Record<string, string> = {
  community:     '/',
  municipality:  '/',
  treb_area:     '/',
  neighbourhood: '/toronto/',
  development:   '/',
}

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function resolveRequestContext(): Promise<{ host: string; isTenant: boolean }> {
  const rawHost = (headers().get('host') || '').toLowerCase()
  const cleanHost = rawHost.replace(/^www\./, '')
  if (OWNER_PROMO_HOSTS.has(cleanHost)) return { host: rawHost, isTenant: false }
  // A-UNIT-2 SEO-FLAG: gate on tenants.seo_enabled, not raw tenant presence.
  // Preserves the isTenant field name for minimal-diff; semantics now mean
  // "eligible to emit sitemap contents" (aily=true, walliam=false, new
  // tenants default false).
  const eligible = await isSeoEnabledTenant()
  return { host: rawHost, isTenant: eligible }
}

async function computeListingChunks(supabase: ReturnType<typeof serviceClient>): Promise<number> {
  const [condoRes, homeRes] = await Promise.all([
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('standard_status', ACTIVE_STATUSES)
      .eq('property_type', 'Residential Condo & Other'),
    supabase.from('mls_listings').select('id', { count: 'exact', head: true })
      .in('standard_status', ACTIVE_STATUSES)
      .eq('property_type', 'Residential Freehold')
      .in('property_subtype', HOME_SUBTYPES),
  ])
  const total = (condoRes.count ?? 0) + (homeRes.count ?? 0)
  if (total === 0) return 2
  return Math.max(1, Math.ceil(total / LISTINGS_CHUNK_SIZE))
}

// ─── data-access ────────────────────────────────────────────────────────
type ListingRow = {
  listing_key: string | null
  unparsed_address: string | null
  unit_number: string | null
  property_type: string | null
  street_number: string | null
  street_name: string | null
  lastmod: string | null
}

type UrlEntry = { loc: string; lastmod?: string }

async function getListingsChunk(
  supabase: ReturnType<typeof serviceClient>,
  host: string,
  chunkIndex: number
): Promise<{ urls: UrlEntry[]; skipped: number; ms: number }> {
  const t0 = Date.now()
  const chunkOffset = chunkIndex * LISTINGS_CHUNK_SIZE

  const pageOffsets: number[] = []
  for (let off = 0; off < LISTINGS_CHUNK_SIZE; off += RPC_PAGE_SIZE) {
    pageOffsets.push(chunkOffset + off)
  }
  const pages = await Promise.all(
    pageOffsets.map(async pageOffset => {
      const { data, error } = await supabase.rpc('get_sitemap_listings', {
        p_limit: RPC_PAGE_SIZE,
        p_offset: pageOffset,
      })
      if (error) {
        console.error(`[sitemap:child ${chunkIndex}] rpc @ off ${pageOffset} error:`, error.message)
        return [] as ListingRow[]
      }
      return (data ?? []) as ListingRow[]
    })
  )
  const rows: ListingRow[] = pages.flat()

  const urls: UrlEntry[] = []
  let skipped = 0
  for (const listing of rows) {
    if (!listing.listing_key) { skipped++; continue }
    let slug: string
    if (listing.property_type === 'Residential Freehold') {
      slug = generateHomePropertySlug(listing)
    } else {
      slug = generatePropertySlug(listing)
    }
    if (!slug || slug.startsWith('/property/')) { skipped++; continue }
    urls.push({
      loc: `https://${host}${slug}`,
      lastmod: listing.lastmod ?? undefined,
    })
  }
  return { urls, skipped, ms: Date.now() - t0 }
}

type BuildingRow = { slug: string | null; lastmod: string | null }
async function getBuildings(
  supabase: ReturnType<typeof serviceClient>,
  host: string
): Promise<{ urls: UrlEntry[]; ms: number }> {
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('get_sitemap_buildings')
  if (error) {
    console.error('[sitemap:child buildings] rpc error:', error.message)
    return { urls: [], ms: Date.now() - t0 }
  }
  const rows = (data ?? []) as BuildingRow[]
  const urls: UrlEntry[] = []
  for (const b of rows) {
    if (!b.slug) continue
    urls.push({ loc: `https://${host}/${b.slug}`, lastmod: b.lastmod ?? undefined })
  }
  return { urls, ms: Date.now() - t0 }
}

type GeoRow = { kind: string | null; slug: string | null; lastmod: string | null }
async function getGeo(
  supabase: ReturnType<typeof serviceClient>,
  host: string
): Promise<{ urls: UrlEntry[]; ms: number; byKind: Record<string, number> }> {
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('get_sitemap_geo_slugs')
  if (error) {
    console.error('[sitemap:child geo] rpc error:', error.message)
    return { urls: [], ms: Date.now() - t0, byKind: {} }
  }
  const rows = (data ?? []) as GeoRow[]
  const urls: UrlEntry[] = []
  const byKind: Record<string, number> = {}
  for (const r of rows) {
    if (!r.slug || !r.kind) continue
    const prefix = GEO_PATH_PREFIX[r.kind]
    if (!prefix) continue
    urls.push({ loc: `https://${host}${prefix}${r.slug}`, lastmod: r.lastmod ?? undefined })
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
  }
  return { urls, ms: Date.now() - t0, byKind }
}

// ─── XML emitter ────────────────────────────────────────────────────────
function emitUrlset(urls: UrlEntry[]): Response {
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  for (const u of urls) {
    if (u.lastmod) {
      lines.push(`  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod></url>`)
    } else {
      lines.push(`  <url><loc>${u.loc}</loc></url>`)
    }
  }
  lines.push('</urlset>')
  return new Response(lines.join('\n') + '\n', {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}

// ─── handler ────────────────────────────────────────────────────────────
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const t0 = Date.now()
  const idNum = Number.parseInt(params.id, 10)
  if (!Number.isFinite(idNum) || idNum < 0) {
    console.log(`[sitemap:child] bad id "${params.id}" — empty urlset`)
    return emitUrlset([])
  }

  // HOST GATE — fires BEFORE any DB call.
  const { host, isTenant } = await resolveRequestContext()
  if (!isTenant) {
    console.log(`[sitemap:child ${idNum}] non-tenant host ${host} — empty urlset, ${Date.now() - t0}ms`)
    return emitUrlset([])
  }

  const supabase = serviceClient()
  const listingChunks = await computeListingChunks(supabase)

  if (idNum < listingChunks) {
    const { urls, skipped, ms } = await getListingsChunk(supabase, host, idNum)
    console.log(`[sitemap:child ${idNum}] listings: ${urls.length} URLs, ${skipped} skipped, ${ms}ms fetch, ${Date.now() - t0}ms total`)
    return emitUrlset(urls)
  }
  if (idNum === listingChunks) {
    const { urls, ms } = await getBuildings(supabase, host)
    console.log(`[sitemap:child ${idNum}] buildings: ${urls.length} URLs, ${ms}ms fetch, ${Date.now() - t0}ms total`)
    return emitUrlset(urls)
  }
  if (idNum === listingChunks + 1) {
    const { urls, ms, byKind } = await getGeo(supabase, host)
    console.log(`[sitemap:child ${idNum}] geo: ${urls.length} URLs (${
      Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(' ')
    }), ${ms}ms fetch, ${Date.now() - t0}ms total`)
    return emitUrlset(urls)
  }

  console.log(`[sitemap:child ${idNum}] out-of-range (listingChunks=${listingChunks}) — empty urlset`)
  return emitUrlset([])
}
