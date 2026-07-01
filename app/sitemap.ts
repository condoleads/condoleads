// W-MARKETING A-UNIT-1b (2026-07-01): sitemap index + child sitemaps.
//
// generateSitemaps() returns 5 numeric ids -> Next serves /sitemap/[id].xml
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
// SCOPE: mirrors what the site actually serves (per Part 1 recon):
//   - Active predicate = IN ('Active','Active Under Contract') per BuildingPage.tsx:52
//   - Listings: emit ALL active; slug generated in-flight; rows where
//     slug-gen falls to /property/UUID fallback are counted + skipped
//     (indicates missing listing_key or unmappable address).
//   - Buildings: quality-gated (slug + cover_photo + at least one active listing)
//   - Geo: slug NOT NULL + is_active where applicable (communities, neighbourhoods)

import type { MetadataRoute } from 'next'
import { headers } from 'next/headers'
import { getCurrentTenantId } from '@/lib/utils/tenant-resolver'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { generatePropertySlug, generateHomePropertySlug } from '@/lib/utils/slugs'

// W-MARKETING A-UNIT-1b HOTFIX (2026-07-01 post-push): explicit runtime +
// dynamic. Without these, Next 14.2.5 on Vercel returned 404 for
// /sitemap.xml and every /sitemap.xml/[id] — the pg import in this file
// requires Node runtime, and revalidate needed the dynamic export to be
// picked up on the metadata route.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 3600

const OWNER_PROMO_HOSTS = new Set<string>(['condoleads.ca', '01leads.com'])
const LISTINGS_CHUNK_SIZE = 50_000
const NUM_LISTING_CHUNKS = 3  // 3 x 50k = 150k capacity; today ~102k active

// Service-role client for sitemap generation. MLS/geo tables have NO
// tenant_id (per CLAUDE.md); reads are tenant-neutral market data. Explicit
// column allow-lists on every query (never SELECT *) even on the tables
// that carry no secrets — Rule Zero enforced uniformly.
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
    return await getListingsChunk(host, id)
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
// Listings — chunk of LISTINGS_CHUNK_SIZE rows via pg-direct.
// Predicate: standard_status IN ('Active','Active Under Contract').
//
// Uses pg-direct (not Supabase-js) because PostgREST's default
// statement_timeout kills the ORDER BY + OFFSET scan on the 1.36M-row
// mls_listings table (~10s exceeded). Matches the reroll-worker pattern
// in the repo (SET statement_timeout = 0 for one-shot large scans).
// Slug generation is in-memory (pure functions) — 1 DB round-trip per chunk.
async function getListingsChunk(host: string, chunkIndex: number): Promise<MetadataRoute.Sitemap> {
  const t0 = Date.now()
  const offset = chunkIndex * LISTINGS_CHUNK_SIZE

  const connStr = process.env.DATABASE_URL
  if (!connStr) {
    console.warn('[sitemap] listings: DATABASE_URL not set — skipping')
    return []
  }
  const c = new Client({ connectionString: connStr })
  c.on('error', e => console.error('[sitemap] pg client error:', e.message))
  await c.connect()

  try {
    // Disable statement_timeout for this one-shot large scan (mirrors the
    // reroll-worker pattern per CLAUDE.md: 'large set-based UPDATEs over
    // the MLS table exceed the 60s default pool timeout — disable timeout
    // for those sessions').
    await c.query('SET statement_timeout = 0')

    // Filter to listings that will actually render:
    //   - Condos: property_type = 'Residential Condo & Other'  → renders via PropertyPage
    //   - Homes:  property_type = 'Residential Freehold'
    //             AND property_subtype IN residential home subtypes
    //             (mirrors HomePropertyPage.tsx:87 gate)
    // Commercial listings + Freehold-with-non-residential-subtype (vacant
    // land, farms, etc.) don't have a serving route → excluded.
    const { rows } = await c.query(
      `SELECT listing_key, unparsed_address, unit_number, property_type,
              modification_timestamp, updated_at, street_number, street_name
         FROM mls_listings
        WHERE standard_status IN ('Active', 'Active Under Contract')
          AND (
            property_type = 'Residential Condo & Other'
            OR (
              property_type = 'Residential Freehold'
              AND property_subtype IN (
                'Detached', 'Semi-Detached', 'Att/Row/Townhouse',
                'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'
              )
            )
          )
        ORDER BY id
        LIMIT $1 OFFSET $2`,
      [LISTINGS_CHUNK_SIZE, offset]
    )

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
      // Skip if generator fell to its "no listing_key" fallback (/property/…)
      // which points at the UUID route we're de-canonicalizing away from.
      if (!slug || slug.startsWith('/property/')) { skipped++; continue }
      const lastmodRaw = listing.modification_timestamp || listing.updated_at
      urls.push({
        url: `https://${host}${slug}`,
        lastModified: lastmodRaw ? new Date(lastmodRaw) : undefined,
      })
    }
    console.log(`[sitemap] listings chunk ${chunkIndex}: ${urls.length} URLs, ${skipped} skipped, ${Date.now() - t0}ms`)
    return urls
  } finally {
    await c.end()
  }
}

// ---------------------------------------------------------------------------
// Buildings — slug NOT NULL AND cover_photo_url NOT NULL AND has at least
// one active mls_listing. Two-query set-intersection (avoids fragile
// PostgREST inner-join distinct semantics for ~thousands of rows).
async function getBuildings(_supabase: ReturnType<typeof serviceClient>, host: string): Promise<MetadataRoute.Sitemap> {
  const t0 = Date.now()
  // pg-direct (Supabase-js caps results at 5000 server-side; even
  // .range(0, 100000) truncates — verified during A-UNIT-1b build).
  // pg-direct + SET statement_timeout=0 returns all rows in one shot.
  const connStr = process.env.DATABASE_URL
  if (!connStr) {
    console.warn('[sitemap] buildings: DATABASE_URL not set — skipping')
    return []
  }
  const c = new Client({ connectionString: connStr })
  c.on('error', e => console.error('[sitemap] pg client error:', e.message))
  await c.connect()

  try {
    await c.query('SET statement_timeout = 0')

    // Single SQL: buildings with slug + cover_photo + at least one active listing.
    const { rows } = await c.query(
      `SELECT DISTINCT b.slug, b.updated_at
         FROM buildings b
        WHERE b.slug IS NOT NULL
          AND b.cover_photo_url IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM mls_listings ml
             WHERE ml.building_id = b.id
               AND ml.standard_status IN ('Active', 'Active Under Contract')
          )`
    )

    const urls: MetadataRoute.Sitemap = []
    for (const b of rows) {
      if (!b.slug) continue
      urls.push({
        url: `https://${host}/${b.slug}`,
        lastModified: b.updated_at ? new Date(b.updated_at) : undefined,
      })
    }
    console.log(`[sitemap] buildings: ${urls.length} URLs, ${Date.now() - t0}ms`)
    return urls
  } finally {
    await c.end()
  }
}

// ---------------------------------------------------------------------------
// Geo — 5 geo tables. Predicate: slug NOT NULL (+ is_active for
// communities/neighbourhoods that have that column).
//
// Route conventions per app/[slug]/page.tsx + comprehensive-site routes:
//   - communities, municipalities, treb_areas, developments -> /${slug}
//   - neighbourhoods -> /toronto/${slug}   (permanentRedirect fires from
//     /${slug} to /toronto/${slug} — sitemap lists only the canonical target)
async function getGeo(supabase: ReturnType<typeof serviceClient>, host: string): Promise<MetadataRoute.Sitemap> {
  const t0 = Date.now()
  const [comm, muni, area, nbhd, dev] = await Promise.all([
    supabase.from('communities').select('slug, updated_at').eq('is_active', true).not('slug', 'is', null),
    supabase.from('municipalities').select('slug, updated_at').not('slug', 'is', null),
    supabase.from('treb_areas').select('slug, updated_at').not('slug', 'is', null),
    supabase.from('neighbourhoods').select('slug, updated_at').eq('is_active', true).not('slug', 'is', null),
    supabase.from('developments').select('slug, updated_at').not('slug', 'is', null),
  ])

  const urls: MetadataRoute.Sitemap = []
  const pushRows = (rows: Array<{ slug: string | null; updated_at: string | null }> | null, pathPrefix: string) => {
    for (const r of rows ?? []) {
      if (!r.slug) continue
      urls.push({
        url: `https://${host}${pathPrefix}${r.slug}`,
        lastModified: r.updated_at ? new Date(r.updated_at) : undefined,
      })
    }
  }
  pushRows(comm.data as any, '/')
  pushRows(muni.data as any, '/')
  pushRows(area.data as any, '/')
  pushRows(nbhd.data as any, '/toronto/')
  pushRows(dev.data as any, '/')
  console.log(`[sitemap] geo: ${urls.length} URLs (comm=${comm.data?.length ?? 0} muni=${muni.data?.length ?? 0} area=${area.data?.length ?? 0} nbhd=${nbhd.data?.length ?? 0} dev=${dev.data?.length ?? 0}), ${Date.now() - t0}ms`)
  return urls
}
