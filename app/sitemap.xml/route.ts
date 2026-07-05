// W-MARKETING A-UNIT-1b STAGE 2 (2026-07-01): sitemap INDEX as Route Handler.
//
// Emits <sitemapindex> listing all child chunks. Child count is dynamic:
//   listingChunks = ceil(activeListingCount / LISTINGS_CHUNK_SIZE)
//   plus one buildings child, plus one geo child.
//
// URL SHAPE:
//   /sitemap.xml            <- this handler (the index)
//   /sitemap/0../sitemap/N-1  <- listings chunks (see app/sitemap/[id]/route.ts)
//   /sitemap/N              <- buildings
//   /sitemap/N+1            <- geo
//
// HOST GATE: non-tenant hosts (owner promo / legacy / unknown) get an
// empty <sitemapindex> — mirrors robots.ts Branch 1's "not a tenant"
// treatment. Fires BEFORE any DB call.
//
// SHARED LOGIC BLOCK: computeListingChunks(), OWNER_PROMO_HOSTS,
// resolveRequestContext(), serviceClient(), LISTINGS_CHUNK_SIZE — MUST
// STAY IN SYNC with app/sitemap/[id]/route.ts. Both handlers must
// compute the same chunk map. Operator's Stage 2 spec: "explicit paths
// only" — no shared helper file this commit; keep the two in sync by
// eye until a follow-up refactor extracts a helper.

// A-UNIT-2 SEO-FLAG (2026-07-04): eligibility gate moved from
// getCurrentTenantId() to isSeoEnabledTenant() — reads tenants.seo_enabled
// so aily emits full index, walliam emits the existing empty-index
// (matches the existing not-eligible response shape — HTTP 200 empty
// <sitemapindex/>). Non-SEO callers of getCurrentTenantId() unaffected.

import { headers } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { isSeoEnabledTenant } from '@/lib/utils/seo-scope'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 3600

// ─── shared config (KEEP IN SYNC with app/sitemap/[id]/route.ts) ────────
const LISTINGS_CHUNK_SIZE = 50_000
const OWNER_PROMO_HOSTS = new Set<string>(['condoleads.ca', '01leads.com'])

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

// Count listings matching the sitemap predicate. Uses two head:true count
// queries (one per property_type) to avoid PostgREST's fragile nested-OR
// syntax with an IN list. Predicate mirrors public.get_sitemap_listings
// (migration 373640a) — keep in sync.
// A-UNIT-2 FINAL (2026-07-05): mirrors HomePropertyPage RESIDENTIAL_TYPES +
// public.get_sitemap_listings predicate.
const HOME_SUBTYPES = [
  'Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link',
  'Duplex', 'Triplex', 'Fourplex', 'Multiplex',
  'Modular Home', 'Upper Level', 'Lower Level', 'Room', 'Shared Room',
  'Rural Residential', 'MobileTrailer',
  'Farm', 'Store W Apt/Office', 'Other', 'Vacant Land',
]
const ACTIVE_STATUSES = ['Active', 'Active Under Contract']

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
  if (total === 0) {
    console.warn('[sitemap:index] listing count returned 0 — likely error; falling back to 2 chunks')
    return 2
  }
  return Math.max(1, Math.ceil(total / LISTINGS_CHUNK_SIZE))
}

// ─── handler ────────────────────────────────────────────────────────────
function emptyIndex(): Response {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>\n'
  return new Response(xml, { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}

export async function GET(): Promise<Response> {
  const t0 = Date.now()
  const { host, isTenant } = await resolveRequestContext()
  if (!isTenant) {
    console.log(`[sitemap:index] non-tenant host ${host} — empty index, ${Date.now() - t0}ms`)
    return emptyIndex()
  }

  const supabase = serviceClient()
  const listingChunks = await computeListingChunks(supabase)
  const buildingsId = listingChunks
  const geoId = listingChunks + 1

  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
  for (let i = 0; i < listingChunks; i++) {
    lines.push(`  <sitemap><loc>https://${host}/sitemap/${i}</loc></sitemap>`)
  }
  lines.push(`  <sitemap><loc>https://${host}/sitemap/${buildingsId}</loc></sitemap>`)
  lines.push(`  <sitemap><loc>https://${host}/sitemap/${geoId}</loc></sitemap>`)
  lines.push('</sitemapindex>')

  const total = listingChunks + 2
  console.log(`[sitemap:index] emitted ${total} children (listings=${listingChunks}, buildings=1, geo=1), ${Date.now() - t0}ms`)
  return new Response(lines.join('\n') + '\n', {
    status: 200,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
