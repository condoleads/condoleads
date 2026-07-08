import { headers } from 'next/headers'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'
import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { unstable_cache } from 'next/cache'
import { countDirect } from '@/lib/db/pg'
import NeighbourhoodPageTabs from '@/app/[slug]/components/NeighbourhoodPageTabs'
import GeoHero from '@/app/[slug]/components/GeoHero'
import GeoMarketActivity from '@/components/geo/GeoMarketActivity'
import { getAgentFromHost } from '@/lib/utils/agent-detection'
import { getCurrentTenantId, isHeroTenant, resolveAgentForContext } from '@/lib/utils/tenant-resolver'
import CharliePageContext from '@/components/CharliePageContext'
import WalliamCTA from '@/components/WalliamCTA'
import WalliamAgentCard from '@/components/WalliamAgentCard'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import PlaceSchema from '@/components/PlaceSchema'
import { resolveCanonicalHost } from '@/lib/utils/canonical'

interface Props {
  params: { neighbourhood: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient()
  const { data: n } = await supabase
    .from('neighbourhoods')
    .select('name')
    .eq('slug', params.neighbourhood)
    .eq('is_active', true)
    .single()

  if (!n) return { title: 'Neighbourhood Not Found' }
  // W-MARKETING A-UNIT-1b (2026-07-01): tenant-aware title (was hardcoded
  // "CondoLeads") + self-canonical (was absent). Reuses shared resolver.
  // A-UNIT-3 (2026-07-06): openGraph + Twitter card, tenant-derived.
  const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
  const { getTenantByHost } = await import('@/lib/utils/tenant-brand')
  const { headers } = await import('next/headers')
  const canonicalDomain = await resolveCanonicalHost()
  const brandTenant = await getTenantByHost(supabase, headers().get('host') || '')
  // LANE-B-2 (2026-07-07): tenant-derived brand — no 'CondoLeads' fallback.
  // Prior `|| 'CondoLeads'` was Class 1 sibling.
  const brandName = brandTenant?.name || 'Real Estate'
  const title = `${n.name} Real Estate – Condos & Homes | ${brandName}`
  const description = `Browse condos and homes for sale and lease in ${n.name}, Toronto.`
  const url = `https://${canonicalDomain}/toronto/${params.neighbourhood}`
  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: brandTenant?.name || undefined,
      type: 'website',
      // A-UNIT-3 EXTENSION (2026-07-06): og:image via tenant-aware /og.
      images: [{ url: `https://${canonicalDomain}/og`, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`https://${canonicalDomain}/og`],
    },
  }
}

const getNeighbourhoodData = unstable_cache(
  async function getNeighbourhoodData(slug: string) {
  const supabase = createClient()

  const { data: neighbourhood } = await supabase
    .from('neighbourhoods')
    .select('id, name, slug')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()

  if (!neighbourhood) return null

  const { data: mappings } = await supabase
    .from('municipality_neighbourhoods')
    .select('municipality_id, municipalities(id, name, slug)')
    .eq('neighbourhood_id', neighbourhood.id)

  const municipalities = (mappings ?? [])
    .map((m: any) => m.municipalities)
    .filter(Boolean)

  const municipalityIds = municipalities.map((m: any) => m.id)
  if (!municipalityIds.length) return { neighbourhood, municipalities: [], municipalityIds: [], stats: null }

  // Resolve community IDs for building count upfront
  const { data: communities } = await supabase
    .from('communities')
    .select('id, name, slug')
    .in('municipality_id', municipalityIds)
    .limit(10000)

  const communityIds = (communities ?? []).map((c: any) => c.id)

  // FIX: run all queries in parallel
  // FIX: initialTotal and forSaleCount were identical queries — merged into one
  // W-HOME-AND-NEIGHBOURHOOD Fix 2 (2026-06-02): sold/leased counts are now
  // computed at SSR (Option B) so they appear in initial HTML with no client
  // flicker. Matches the CommunityPage/MunicipalityPage filter pattern:
  //   available_in_vow=true + standard_status='Closed' + transaction_type.
  const [
    activeCount,
    condoCount,
    homeCount,
    { count: buildingCount },
    { data: initialListingsRaw },
    forSaleCount,
    forLeaseCount,
    soldCount,
    leasedCount,
  ] = await Promise.all([
    // W-GEO-COUNT-FIX-2 (2026-06-02): Active overall -- pg-direct (same
    // contention class as Closed; see lib/db/pg.ts anti-poisoning invariant).
    // No transaction_type filter here -- we want both For Sale + For Lease.
    // BUT countDirect requires transaction_type. We sum two pg-direct calls
    // for forSale+forLease below instead of one combined call. To avoid an
    // extra query for the overall, we keep the existing "active = forSale +
    // forLease" derivation downstream via the two main count calls.
    // For now, satisfy the Promise.all shape with an array-of-two-counts via
    // both transaction types using the multi-status countDirect.
    Promise.all([
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Sale',
        available_in_vow: true,
      }),
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Lease',
        available_in_vow: true,
      }),
    ]).then(([s, l]) => s + l),
    // Active condos (For Sale + For Lease combined to match prior semantics).
    Promise.all([
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
          'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'],
      }),
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: ['Condo Apartment', 'Condo Townhouse', 'Co-op Apartment',
          'Common Element Condo', 'Leasehold Condo', 'Detached Condo', 'Co-Ownership Apartment'],
      }),
    ]).then(([s, l]) => s + l),
    // Active homes (For Sale + For Lease combined).
    Promise.all([
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Sale',
        available_in_vow: true,
        property_subtype_in: ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
          'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'],
      }),
      countDirect({
        geo: { kind: 'municipality_ids', values: municipalityIds },
        standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
        transaction_type: 'For Lease',
        available_in_vow: true,
        property_subtype_in: ['Detached', 'Semi-Detached', 'Att/Row/Townhouse',
          'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex'],
      }),
    ]).then(([s, l]) => s + l),
    communityIds.length
      ? supabase.from('buildings')
          .select('id', { count: 'exact', head: true })
          .in('community_id', communityIds)
      : Promise.resolve({ count: 0 }),
    supabase.from('mls_listings')
      .select(`id, building_id, community_id, municipality_id, listing_id, listing_key,
        standard_status, transaction_type, list_price, close_price, close_date,
        unit_number, unparsed_address, bedrooms_total, bathrooms_total_integer,
        property_type, property_subtype, living_area_range, square_foot_source,
        building_area_total, parking_total, locker, association_fee, tax_annual_amount,
        days_on_market, listing_contract_date,
        lot_width, lot_depth, frontage_length, basement, garage_type, garage_yn,
        approximate_age, architectural_style, cooling, pool_features, fireplace_yn,
        media (id, media_url, variant_type, order_number, preferred_photo_yn)`)
      .in('municipality_id', municipalityIds)
      .eq('available_in_vow', true)
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
      .eq('transaction_type', 'For Sale')
      .order('list_price', { ascending: false })
      .range(0, 23),
    // W-GEO-COUNT-FIX-2 (2026-06-02): Active forSale + forLease via pg-direct.
    countDirect({
      geo: { kind: 'municipality_ids', values: municipalityIds },
      standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    countDirect({
      geo: { kind: 'municipality_ids', values: municipalityIds },
      standard_status_in: ['Active', 'Active Under Contract', 'Pending'],
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
    // W-GEO-COUNT-FIX (2026-06-02): Closed/Sold via pg-direct.
    // High-volume geos exceeded the PostgREST 8s authenticator timeout on
    // exact counts (silently degraded to null then to 0 via ?? 0, cached
    // by unstable_cache for 5 minutes). pg-direct (30s ceiling) returns
    // the real number or throws; a thrown timeout is not cached.
    countDirect({
      geo: { kind: 'municipality_ids', values: municipalityIds },
      standard_status: 'Closed',
      transaction_type: 'For Sale',
      available_in_vow: true,
    }),
    // W-GEO-COUNT-FIX (2026-06-02): Closed/Leased via pg-direct.
    countDirect({
      geo: { kind: 'municipality_ids', values: municipalityIds },
      standard_status: 'Closed',
      transaction_type: 'For Lease',
      available_in_vow: true,
    }),
  ])

  const initialCounts = {
    forSale: forSaleCount,
    forLease: forLeaseCount,
    sold: soldCount,
    leased: leasedCount,
  }

  // Process media thumbnails
  const initialListings = (initialListingsRaw ?? []).map((l: any) => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number ?? 999) - (b.order_number ?? 999))
      .slice(0, 1),
  }))

  return {
    neighbourhood,
    municipalities,
    municipalityIds,
    communities,
    stats: {
      active: activeCount,
      condos: condoCount,
      homes: homeCount,
      buildings: buildingCount ?? 0,
      sold: soldCount,
      leased: leasedCount,
    },
    initialListings,
    initialTotal: forSaleCount,
    initialCounts,
  }
  },
  ['neighbourhood-data'],
  { revalidate: 300, tags: ['neighbourhood'] }
)

export default async function NeighbourhoodPage({ params }: Props) {
  // W-GEO-COUNT-FIX (2026-06-02): graceful degrade outside the cache boundary.
  // A pg-direct count timeout throws; unstable_cache does not cache rejected
  // promises, so the next request retries fresh rather than serving a stale 0.
  let data: Awaited<ReturnType<typeof getNeighbourhoodData>>
  try {
    data = await getNeighbourhoodData(params.neighbourhood)
  } catch (err) {
    console.error('[NeighbourhoodPage] data fetch failed:', err)
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-2xl font-semibold mb-2">Counts temporarily unavailable</h1>
          <p className="text-gray-600">Please refresh in a moment.</p>
        </div>
      </div>
    )
  }
  if (!data) notFound()

  const headersList = headers()
  const host = headersList.get('host') || ''
  const agent = await getAgentFromHost(host)
  const tenantId = await getCurrentTenantId()
  const isHero = await isHeroTenant()
  // W-AILY-ESTIMATOR-GAP (2026-06-22): resolve agent for ANY tenantId
  // (see MunicipalityPage for full rationale).
  let resolvedAgentId: string | null = null
  if (tenantId) {
    resolvedAgentId = await resolveAgentForContext({ neighbourhood_id: data.neighbourhood.id, tenant_id: tenantId })
  }

  const { neighbourhood, municipalities, municipalityIds, communities, stats, initialListings, initialTotal, initialCounts } = data

  // C8a/D13 -- tenant for assistantName threading
  const _c8a_host = headers().get('host')
  const _c8a_supabase = createTenantClient()
  const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)
  const assistantName = _c8a_tenant?.name || 'Charlie'
  // W-AILY-CTA-BRAND-LEAK (2026-06-23): brandName + wordmarkStyle for per-tenant
  // WalliamCTA wordmark. Mount below is {isHero && (...)}-gated today.
  const brandName     = _c8a_tenant?.brandName     || 'Brand'
  const wordmarkStyle = _c8a_tenant?.wordmarkStyle || 'standard'

  // A-UNIT-2 Phase 2 (2026-07-04): Home > Neighbourhood breadcrumb + Place
  // schema. The visual GeoHero breadcrumb includes a "Toronto" crumb
  // linking to /toronto, but /toronto is a route path (not an indexed
  // page — no treb_area or municipality slug matches "toronto";
  // VERIFIED this session — Toronto municipalities are per-district
  // Toronto C01, W08, etc.). Rule Zero: never emit a schema URL for a
  // non-page. Drop the middle level in JSON-LD; visual UI stays.
  const _domain = await resolveCanonicalHost()
  const _neighUrl = `https://${_domain}/toronto/${neighbourhood.slug}`

  return (
    <div className="min-h-screen bg-white">
      <BreadcrumbSchema
        items={[{ name: neighbourhood.name, url: _neighUrl }]}
        homeUrl={`https://${_domain}/`}
      />
      <PlaceSchema
        place={{
          type: 'Place',
          name: neighbourhood.name,
          url: _neighUrl,
        }}
      />
      <GeoHero
        assistantName={assistantName}
        title={`${neighbourhood.name} Real Estate`}
        subtitle="Toronto Neighbourhood"
        breadcrumbs={[
          { label: "Home", href: "/" },
          { label: "Toronto", href: "/toronto" },
          { label: neighbourhood.name, href: "#" },
        ]}
        stats={{
          active: stats?.active ?? 0,
          sold: stats?.sold ?? 0,
          leased: stats?.leased ?? 0,
          buildings: stats?.buildings ?? 0,
        }}
        geoType="neighbourhood"
      />

      {/* Municipality pills — quick links */}
      {municipalities.length > 1 && (
        <div className="bg-gray-50 border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap gap-2">
            {municipalities.map((m: any) => (
              <Link
                key={m.id}
                href={`/${m.slug}`}
                className="px-3 py-1 text-sm bg-white border border-gray-200 rounded-full text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
              >
                {m.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Listings — tabbed */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <NeighbourhoodPageTabs
          municipalityIds={municipalityIds}
          agentId={tenantId ? (resolvedAgentId || '') : (agent?.id || '')}
          tenantId={tenantId ? (tenantId || '') : (agent?.tenant_id || '')}
          buildingCount={stats?.buildings ?? 0}
          municipalities={municipalities}
          initialListings={initialListings}
          initialTotal={initialTotal}
          counts={initialCounts}
        />
      </div>

      {/* W-MARKETING A-UNIT-4a (2026-07-02): SSR market panel (SEO-visible). */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <GeoMarketActivity geoType="neighbourhood" geoId={neighbourhood.id} geoName={neighbourhood.name} />
      </div>

      {/* Communities */}
      {communities && communities.length > 0 && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 border-t border-gray-100">
          {/* A-UNIT-3b (2026-07-07): H2 keyword-align — mirrors Municipality
              page's "Communities in {muni}" pattern. Real neighbourhood name
              in scope; NULL never happens (n row required for page render). */}
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Communities in {neighbourhood.name}</h2>
          <div className="flex flex-wrap gap-2">
            {communities.map((c: any) => (
              <Link key={c.id} href={`/${c.slug}`}
                className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {isHero && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <WalliamCTA context={neighbourhood.name} assistantName={assistantName} brandName={brandName} wordmarkStyle={wordmarkStyle} />
          <WalliamAgentCard neighbourhood_id={neighbourhood.id} tenant_id={tenantId!} />
          <CharliePageContext
            municipality_id={municipalityIds[0] || null}
            municipality_slug={municipalities[0]?.slug || null}
            neighbourhood_id={neighbourhood.id}
            neighbourhood_slug={neighbourhood.slug}
          />
        </div>
      )}
    </div>
  )
}