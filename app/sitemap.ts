// W-MARKETING A-UNIT-1b (2026-07-01): sitemap index + child sitemaps.
//
// generateSitemaps() returns 5 numeric ids -> Next serves /sitemap.xml/[id]
// for each and /sitemap.xml as the index that lists them.
//
//   id 0..2 -> listings chunks (50k rows each, ~102k active listings total)
//   id 3    -> quality-gated buildings (~4,634 — slug + cover_photo + active listing)
//   id 4    -> geo (communities + munis + areas + neighbourhoods + developments)
//
// HOST GATE: only emits URLs when the request resolves to a comprehensive
// tenant (mirrors app/robots.ts Branch 1). Non-tenant hosts (owner promo,
// legacy agent, unknown) get an empty sitemap. Tenant #3 onboarding is
// auto-included by their tenants.domain row.
//
// EFFICIENCY: revalidate 3600 (1 hour) so bulk sitemap generation isn't
// re-run per crawler hit. MLS refreshes hourly; matched cadence.
//
// DATA ACCESS — WHY RPC INSTEAD OF pg-DIRECT (RPC REWRITE, 2026-07-01):
//   The prior pg-direct implementation (ed9de36 + e03a35d hotfix) caused
//   Next 14.2.5's metadata-route loader to silently drop this file from
//   the compiled route table on Vercel — /sitemap.xml + every child 404'd
//   despite the deploy succeeding. Diagnostic (d324c22) proved: a trivial
//   pg-free sitemap.ts registers fine. Root cause: pg's native-binding
//   graph (bindings/node-gyp paths) trips build-time module analysis.
//   Fix: move each large scan into a Postgres function; call it via
//   supabase.rpc(). See supabase/migrations/20260701_w_marketing_sitemap_rpc_functions.sql
//   for function definitions.

import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getCurrentTenantId } from '@/lib/utils/tenant-resolver'
import { createClient } from '@supabase/supabase-js'
import { generatePropertySlug, generateHomePropertySlug } from '@/lib/utils/slugs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 3600

const OWNER_PROMO_HOSTS = new Set<string>(['condoleads.ca', '01leads.com'])
const LISTINGS_CHUNK_SIZE = 50_000
const NUM_LISTING_CHUNKS = 3  // 3 x 50k = 150k capacity; today ~102k active

// PGRST_MAX_ROWS on this Supabase project is 5000 — verified empirically
// during A-UNIT-1b build. Any single rpc() response is capped at 5000 rows.
// Listings function is paginated (p_limit, p_offset); app calls it in
// parallel to fill each 50k chunk (10 pages of 5000 = 50k).
const RPC_PAGE_SIZE = 5000

// Service-role client for sitemap generation. MLS/geo tables have NO
// tenant_id (per CLAUDE.md); reads are tenant-neutral market data. Column
// allow-lists live inside the SQL functions (never SELECT *).
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
  // Owner promo hosts return isTenant=false (never emit a sitemap for
  // condoleads.ca or 01leads.com — they're not tenant sites).
  if (OWNER_PROMO_HOSTS.has(cleanHost)) return { host: rawHost, isTenant: false }
  const tenantId = await getCurrentTenantId()
  return { host: rawHost, isTenant: !!tenantId }
}

export async function generateSitemaps(): Promise<{ id: number }[]> {
  // Always emit the same shape; per-id sitemap() handler decides whether
  // to return URLs or [] based on host. Keeps the index stable.
  const ids: { id: number }[] = []
  for (let i = 0; i < NUM_LISTING_CHUNKS; i++) ids.push({ id: i })
  ids.push({ id: NUM_LISTING_CHUNKS })       // 3 = buildings
  ids.push({ id: NUM_LISTING_CHUNKS + 1 })   // 4 = geo
  return ids
}

export default async function sitemap({ id }: { id: number }): Promise<MetadataRoute.Sitemap> {
  const { host, isTenant } = await resolveRequestContext()
  if (!isTenant) return []

  const supabase = serviceClient()

  if (id >= 0 && id < NUM_LISTING_CHUNKS) {
    return await getListingsChunk(supabase, host, id)
  }
  if (id === NUM_LISTING_CHUNKS) {
    return await getBuildings(supabase, host)
  }
  if (id === NUM_LISTING_CHUNKS + 1) {
    return await getGeo(supabase, host)
  }
  return []
}

// ---------------------------------------------------------------------------
// Listings — chunk of LISTINGS_CHUNK_SIZE rows via paginated RPC.
// Predicate lives in public.get_sitemap_listings (see migration).
// Slug generation stays in-memory (lib/utils/slugs.ts) — same functions
// the app uses everywhere else. Function returns raw fields; app builds
// slug per row.
type ListingRow = {
  listing_key: string | null
  unparsed_address: string | null
  unit_number: string | null
  property_type: string | null
  street_number: string | null
  street_name: string | null
  lastmod: string | null
}

async function getListingsChunk(
  supabase: ReturnType<typeof serviceClient>,
  host: string,
  chunkIndex: number
): Promise<MetadataRoute.Sitemap> {
  const t0 = Date.now()
  const chunkOffset = chunkIndex * LISTINGS_CHUNK_SIZE

  // Fill this chunk via parallel RPC pages. LISTINGS_CHUNK_SIZE / RPC_PAGE_SIZE
  // = 10 pages per chunk. All 10 fired in parallel; wall-clock = slowest one.
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
        console.error(`[sitemap] listings rpc (chunk ${chunkIndex} @ off ${pageOffset}) error:`, error.message)
        return [] as ListingRow[]
      }
      return (data ?? []) as ListingRow[]
    })
  )
  const rows: ListingRow[] = pages.flat()

  const urls: MetadataRoute.Sitemap = []
  let skipped = 0
  for (const listing of rows) {
    if (!listing.listing_key) { skipped++; continue }
    let slug: string
    if (listing.property_type === 'Residential Freehold') {
      slug = generateHomePropertySlug(listing)
    } else {
      // 'Residential Condo & Other' and any other type -> condo slug shape
      slug = generatePropertySlug(listing)
    }
    // Skip if generator fell to its "no listing_key" fallback (/property/...)
    // which points at the UUID route we're de-canonicalizing away from.
    if (!slug || slug.startsWith('/property/')) { skipped++; continue }
    urls.push({
      url: `https://${host}${slug}`,
      lastModified: listing.lastmod ? new Date(listing.lastmod) : undefined,
    })
  }
  console.log(`[sitemap] listings chunk ${chunkIndex}: ${urls.length} URLs, ${skipped} skipped, ${Date.now() - t0}ms`)
  return urls
}

// ---------------------------------------------------------------------------
// Buildings — single RPC call. Quality gate lives in
// public.get_sitemap_buildings (see migration). Row count (~4,634) fits
// under PGRST_MAX_ROWS=5000 in one call.
type BuildingRow = { slug: string | null; lastmod: string | null }

async function getBuildings(
  supabase: ReturnType<typeof serviceClient>,
  host: string
): Promise<MetadataRoute.Sitemap> {
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('get_sitemap_buildings')
  if (error) {
    console.error('[sitemap] buildings rpc error:', error.message)
    return []
  }
  const rows = (data ?? []) as BuildingRow[]

  const urls: MetadataRoute.Sitemap = []
  for (const b of rows) {
    if (!b.slug) continue
    urls.push({
      url: `https://${host}/${b.slug}`,
      lastModified: b.lastmod ? new Date(b.lastmod) : undefined,
    })
  }
  console.log(`[sitemap] buildings: ${urls.length} URLs, ${Date.now() - t0}ms`)
  return urls
}

// ---------------------------------------------------------------------------
// Geo — single RPC call union of the 5 geo tables. Kind -> path prefix
// mapping stays in the app (route conventions are app concerns).
type GeoRow = { kind: string | null; slug: string | null; lastmod: string | null }

const GEO_PATH_PREFIX: Record<string, string> = {
  community:     '/',
  municipality:  '/',
  treb_area:     '/',
  neighbourhood: '/toronto/',
  development:   '/',
}

async function getGeo(
  supabase: ReturnType<typeof serviceClient>,
  host: string
): Promise<MetadataRoute.Sitemap> {
  const t0 = Date.now()
  const { data, error } = await supabase.rpc('get_sitemap_geo_slugs')
  if (error) {
    console.error('[sitemap] geo rpc error:', error.message)
    return []
  }
  const rows = (data ?? []) as GeoRow[]

  const urls: MetadataRoute.Sitemap = []
  const byKind: Record<string, number> = {}
  for (const r of rows) {
    if (!r.slug || !r.kind) continue
    const prefix = GEO_PATH_PREFIX[r.kind]
    if (!prefix) continue  // unknown kind; skip defensively
    urls.push({
      url: `https://${host}${prefix}${r.slug}`,
      lastModified: r.lastmod ? new Date(r.lastmod) : undefined,
    })
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
  }
  console.log(`[sitemap] geo: ${urls.length} URLs (${
    Object.entries(byKind).map(([k, n]) => `${k}=${n}`).join(' ')
  }), ${Date.now() - t0}ms`)
  return urls
}
