import { headers } from 'next/headers'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { isCustomDomain } from '@/lib/utils/agent-detection'
import { calculateAverage, calculateInventoryRate, extractAmenities, extractFeeIncludes } from '@/lib/utils/calculations'
import BuildingHero from './components/BuildingHero'
import BuildingHighlights from './components/BuildingHighlights'
import ListingSection from './components/ListingSection'
import MarketStats from './components/MarketStats'
import MarketIntelligence from './components/MarketIntelligence'
import GeoMarketActivity from '@/components/geo/GeoMarketActivity'
import { getBuildingMarketData } from '@/lib/market/get-building-analytics'
import BuildingAmenities from './components/BuildingAmenities'
import dynamic from 'next/dynamic'
import { unstable_cache } from 'next/cache'

// Cached query functions for performance (60 second cache)
const getCachedBuilding = unstable_cache(
  async (slug: string) => {
    const { data } = await supabase
      .from('buildings')
      .select('*')
      .eq('slug', slug)
      .single()
    return data
  },
  ['building'],
  { revalidate: 60 }
)

const getCachedActiveListings = unstable_cache(
  async (buildingId: string) => {
    const { data } = await supabase
      .from('mls_listings')
      .select(`
        id, building_id, community_id, listing_id, listing_key, standard_status, transaction_type,
        list_price, close_price, close_date, unit_number, unparsed_address,
        bedrooms_total, bathrooms_total_integer, property_type, living_area_range,
        square_foot_source, parking_total, locker, association_fee, tax_annual_amount,
        days_on_market, listing_contract_date, building_area_total,
        association_amenities, association_fee_includes, property_management_company, tax_year,
        media (
          id,
          media_url,
          variant_type,
          order_number,
          preferred_photo_yn
        )
      `)
      .eq('building_id', buildingId)
      .in('standard_status', ['Active', 'Active Under Contract'])
      .order('list_price', { ascending: false })
    return data
  },
  ['active-listings'],
  { revalidate: 60 }
)

const getCachedClosedListings = unstable_cache(
  async (buildingId: string) => {
    const { data } = await supabase
      .from('mls_listings')
      .select(`
        id, building_id, community_id, listing_id, listing_key, standard_status, transaction_type,
        list_price, close_price, close_date, unit_number, unparsed_address,
        bedrooms_total, bathrooms_total_integer, property_type, living_area_range,
        square_foot_source, parking_total, locker, association_fee, tax_annual_amount,
        days_on_market, listing_contract_date, building_area_total,
        association_amenities, association_fee_includes, property_management_company, tax_year
      `)
      .eq('building_id', buildingId)
      .eq('standard_status', 'Closed')
      .order('list_price', { ascending: false })
    return data
  },
  ['closed-listings'],
  { revalidate: 60 }
)

const getCachedDevelopment = unstable_cache(
  async (developmentId: string) => {
    const { data } = await supabase
      .from('developments')
      .select('id, name, slug')
      .eq('id', developmentId)
      .single()
    return data
  },
  ['development'],
  { revalidate: 60 }
)
const PriceChart = dynamic(() => import('./components/PriceChart'), { 
  ssr: false,
  loading: () => <div className="h-96 bg-slate-100 animate-pulse rounded-lg flex items-center justify-center"><span className="text-slate-400">Loading chart...</span></div>
})
const TransactionHistory = dynamic(() => import('./components/TransactionHistory'), { 
  ssr: false,
  loading: () => <div className="h-64 bg-slate-100 animate-pulse rounded-lg"></div>
})
const TransactionInsights = dynamic(() => import('./components/TransactionInsights'), { 
  ssr: false,
  loading: () => <div className="h-64 bg-slate-100 animate-pulse rounded-lg"></div>
})
import BuildingMap from './components/BuildingMap'
import BuildingReviews from './components/BuildingReviews'
import StickyNav from './components/StickyNav'
import ListYourUnit from './components/ListYourUnit'
import SEODescription from './components/SEODescription'
import EstimatorSeller from '@/app/estimator/components/EstimatorSeller'
import DualCTASection from './components/DualCTASection'
import BuildingSchema from './components/BuildingSchema'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import { resolveCanonicalHost } from '@/lib/utils/canonical'
import { AgentCard } from '@/components/AgentCard'
import MobileContactBar from '@/components/MobileContactBar'
import Breadcrumb from '@/components/Breadcrumb'
import { buildLocalityPhrase } from '@/lib/utils/locality-phrase'
import ChatWidgetWrapper from '@/components/chat/ChatWidgetWrapper'
import { createClient, createServerClient } from '@/lib/supabase/server'
import { getDisplayAgentForBuilding } from '@/lib/utils/agent-detection'
import WalliamCTA from '@/components/WalliamCTA'
import CharliePageContext from '@/components/CharliePageContext'
import WalliamAgentCard from '@/components/WalliamAgentCard'
import WalliamContactForm from '@/components/WalliamContactForm'
import { getCurrentTenantId, isHeroTenant, resolveAgentForContext } from '@/lib/utils/tenant-resolver'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  
  // Fetch agent branding based on host
  let agentBranding: { site_title: string | null; site_tagline: string | null; og_image_url: string | null } | null = null
  const serverSupabase = createClient()
  
  if (isCustomDomain(host)) {
    const cleanDomain = host.replace(/^www\./, '')
    const { data } = await serverSupabase
      .from('agents')
      .select('site_title, site_tagline, og_image_url')
      .eq('custom_domain', cleanDomain)
      .eq('is_active', true)
      .single()
    agentBranding = data
  } else {
    // Extract subdomain
    const parts = host.split('.')
    if (parts.length >= 3 && parts[1] === 'condoleads') {
      const subdomain = parts[0]
      const { data } = await serverSupabase
        .from('agents')
        .select('site_title, site_tagline, og_image_url')
        .eq('subdomain', subdomain)
        .eq('is_active', true)
        .single()
      agentBranding = data
    }
  }
  
  // A-UNIT-3 EXTENSION (2026-07-06) / LANE-B-2 (2026-07-07): siteName resolved
  // via shared helper — no 'CondoLeads' literal fallback. Rule Zero #1.
  const { resolveSiteName } = await import('@/lib/utils/site-name')
  const _tenantForBrand = await getTenantByHost(serverSupabase, host)
  const siteName = resolveSiteName({ agentBranding, tenant: _tenantForBrand })
  // LANE-B-2 (2026-07-07): tagline no longer leaks 'Toronto' branding for
  // non-Toronto agents. Generic neutral fallback.
  const siteTagline = agentBranding?.site_tagline || 'Real Estate Specialist'
  
  const { data: building } = await supabase
    .from('buildings')
    .select('id, building_name, canonical_address, year_built, total_units, community_id')
    .eq('slug', params.slug)
    .single()
  if (!building) {
    return { title: 'Building Not Found' }
  }

  // A-UNIT-3 (2026-07-06): resolve the real municipality via
  // buildings.community_id → communities.municipality_id → municipalities.name.
  // Same two-hop join BuildingSchema (Phase 2) uses. NULL at any hop →
  // localityName stays null → the "in <locality>" phrase is OMITTED
  // (never fabricates "in Toronto"). Fixes the pre-existing hardcode
  // that shipped "in Toronto" for every building including non-Toronto.
  let localityName: string | null = null
  if (building.community_id) {
    const { data: comm } = await supabase
      .from('communities')
      .select('municipality_id')
      .eq('id', building.community_id)
      .single()
    if (comm?.municipality_id) {
      const { data: muni } = await supabase
        .from('municipalities')
        .select('name')
        .eq('id', comm.municipality_id)
        .single()
      if (muni?.name && muni.name.trim().length > 0) localityName = muni.name
    }
  }

  // Fetch listings for richer metadata
  const { data: listings, error } = await supabase
    .from('mls_listings')
    .select('list_price, bedrooms_total, transaction_type, standard_status')
    .eq('building_id', building.id)

  const activeSales = listings?.filter(l => l.transaction_type === 'For Sale' && l.standard_status === 'Active') || []
  const activeRentals = listings?.filter(l => l.transaction_type === 'For Lease' && l.standard_status === 'Active') || []
  
  // Calculate price range
  const salePrices = activeSales.map(l => l.list_price).filter(p => p > 0)
  const minPrice = salePrices.length > 0 ? Math.min(...salePrices) : null
  const maxPrice = salePrices.length > 0 ? Math.max(...salePrices) : null
  
  // Get bedroom range
  const bedrooms = listings?.map(l => l.bedrooms_total).filter(b => b !== null) || []
  const minBed = bedrooms.length > 0 ? Math.min(...bedrooms) : null
  const maxBed = bedrooms.length > 0 ? Math.max(...bedrooms) : null

  // Build dynamic description
  // A-UNIT-3 EXTENSION (2026-07-06): skip the "in <locality>" phrase when
  // canonical_address already contains the locality name.
  // LANE-B-1-VERIFY (2026-07-06): extracted the dedup logic to the shared
  // helper `buildLocalityPhrase` so PropertySEO uses the same source of
  // truth. Also caps description near ~160 chars for Google's SERP window.
  const localityPhrase = buildLocalityPhrase(building.canonical_address, localityName)
  let description = `${building.building_name} at ${building.canonical_address}${localityPhrase}. `
  
  if (activeSales.length > 0) {
    description += `${activeSales.length} unit${activeSales.length > 1 ? 's' : ''} for sale`
    if (minPrice && maxPrice) {
      description += ` from $${Math.round(minPrice/1000)}K to $${Math.round(maxPrice/1000)}K`
    }
    description += `. `
  }
  
  if (activeRentals.length > 0) {
    description += `${activeRentals.length} unit${activeRentals.length > 1 ? 's' : ''} for rent. `
  }
  
  if (minBed !== null && maxBed !== null) {
    description += `${minBed === maxBed ? minBed : `${minBed}-${maxBed}`} bedroom units available. `
  }
  
  if (building.year_built) {
    description += `Built in ${building.year_built}. `
  }
  
  if (building.total_units) {
    description += `${building.total_units} total units. `
  }

  // A-UNIT-3 EXTENSION (2026-07-06): only append the CTA tail when there's
  // room within ~160 chars (Google SERP truncation). Prior desc reached 194c
  // for Side Launch. Real content (address + counts + beds + year) stays;
  // marketing tail is dropped when it would push past the SERP window.
  const _ctaTail = `View floor plans, amenities, market stats, and transaction history.`
  if (description.length + _ctaTail.length <= 160) {
    description += _ctaTail
  } else {
    description = description.trimEnd()
  }

 const title = `${building.building_name} Condos - ${building.canonical_address} | ${siteName}`
  // LANE-B-2 (2026-07-07): keywords derived from real locality — never
  // "Toronto condos"/"Toronto real estate" for non-Toronto buildings. Uses
  // localityName already resolved above (community_id → municipality_id →
  // municipalities.name). NULL → omit locality-scoped tokens entirely.
  // Rule Zero #1 sibling closed.
  const _locKw = localityName || ''
  const _keywords = [
    building.building_name,
    building.canonical_address,
    ..._locKw ? [`${_locKw} condos`, `${_locKw} real estate`] : [],
    'condos for sale',
    'condos for rent',
    'condo listings',
    'GTA condos',
  ]
  // LANE-B-2 (2026-07-07): canonicalDomain already resolved above. og:url
  // uses it (not raw host) so canonical == og:url deterministically.
  // og:image falls back to tenant-aware /og route (not static jpg) — Gap C.
  const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
  const _canonicalDomain = await resolveCanonicalHost()
  const _ogUrl = `https://${_canonicalDomain}/${params.slug}`
  const _ogImage = agentBranding?.og_image_url || `https://${_canonicalDomain}/og`
  return {
    title,
    description,
    keywords: _keywords,
    openGraph: {
      title,
      description,
      url: _ogUrl,
      siteName: siteName,
      locale: 'en_CA',
      type: 'website',
      images: [
        {
          url: _ogImage,
          width: 1200,
          height: 630,
          alt: `${building.building_name} - ${siteName}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [_ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
      },
    },
    alternates: {
      canonical: `https://${host}/${params.slug}`,
    },
  }
}

export default async function BuildingPage({ params }: { params: { slug: string } }) {
  // First query: Get building (CACHED for performance)
  const building = await getCachedBuilding(params.slug)

  if (!building) {
    notFound()
  }

  // Get host for agent lookup
  const headersList = headers()
  const host = headersList.get('host') || ''

  // WALLiam tenant detection
  const tenantId = await getCurrentTenantId()
  const isHero = await isHeroTenant()
  // W-AILY-ESTIMATOR-GAP (2026-06-22): resolve agent for ANY tenantId
  // (see MunicipalityPage for full rationale).
  let resolvedAgentId: string | null = null
  if (tenantId) {
    resolvedAgentId = await resolveAgentForContext({
      building_id: building.id,
      community_id: building.community_id || null,
      municipality_id: building.municipality_id || null,
      area_id: building.area_id || null,
      tenant_id: tenantId,
    })
  }

  // Run all dependent queries in PARALLEL with caching for performance
  const [development, agentResult, activeListingsRaw, closedListingsRaw, marketData] = await Promise.all([
    // Development query (conditional) - CACHED
    building.development_id
      ? getCachedDevelopment(building.development_id)
      : Promise.resolve(null),
    
    // Agent query (NOT cached - depends on host)
    getDisplayAgentForBuilding(host, building.id),
    
    // Listings query - CACHED
    getCachedActiveListings(building.id),
    getCachedClosedListings(building.id),
    
    // Market intelligence data
    getBuildingMarketData(building.id)
  ])

  const { siteOwner, displayAgent, isTeamSite } = agentResult
  const agent = displayAgent // May be null — page renders without agent features

  const activeListings = activeListingsRaw || []
  const closedListings = closedListingsRaw || []
  const allListings = [...activeListings, ...closedListings]

  // Strip media for components that don't need it (reduces HTML payload)
  const listingsWithoutMedia = allListings.map(l => ({ ...l, media: undefined }))

  // Filter media to thumbnails only to reduce HTML payload
  const filterMedia = (listing: any) => ({
    ...listing,
    media: (listing.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1) // Only first photo, rest loaded on demand
  })
  
  const activeSales = activeListings.filter(l => l.transaction_type === 'For Sale').map(filterMedia)
  const activeRentals = activeListings.filter(l => l.transaction_type === 'For Lease').map(filterMedia)
  const closedSales = closedListings.filter(l => l.transaction_type === 'For Sale').map(filterMedia)
  const closedRentals = closedListings.filter(l => l.transaction_type === 'For Lease').map(filterMedia)

  const amenities = extractAmenities(allListings)
  const feeIncludes = extractFeeIncludes(allListings)

  const avgSalePrice = activeSales.length > 0
    ? calculateAverage(activeSales.map(l => l.list_price))
    : closedSales.length > 0
    ? calculateAverage(closedSales.map(l => l.list_price))
    : 0

  const salesPrices = closedSales.map(l => l.list_price)
  const highestSale = salesPrices.length > 0 ? Math.max(...salesPrices) : 0
  const lowestSale = salesPrices.length > 0 ? Math.min(...salesPrices) : 0

  const listingsWithFees = allListings.filter(l => l.association_fee && l.association_fee > 0)
  const avgMaintenanceFee = listingsWithFees.length > 0
    ? calculateAverage(listingsWithFees.map(l => l.association_fee!))
    : 0

  const inventoryRate = calculateInventoryRate(activeSales.length, building.total_units)

  const closedSalesWithDays = closedSales.filter(l => l.days_on_market !== null && l.days_on_market !== undefined)
  const avgDaysOnMarketSale = closedSalesWithDays.length > 0
    ? calculateAverage(closedSalesWithDays.map(l => l.days_on_market!))
    : 0

  const closedRentalsWithDays = closedRentals.filter(l => l.days_on_market !== null && l.days_on_market !== undefined)
  const avgDaysOnMarketLease = closedRentalsWithDays.length > 0
    ? calculateAverage(closedRentalsWithDays.map(l => l.days_on_market!))
    : 0

  const stats = {
    avgSalePrice,
    avgRent: 0,
    inventoryRate,
    highestSale,
    lowestSale,
    avgMaintenanceFee,
  }

  // Fetch market intelligence data (PSF analytics, parking/locker values)

  // C8a/D13 -- tenant for assistantName threading
  const _c8a_host = headers().get('host')
  const _c8a_supabase = createTenantClient()
  const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)
  const assistantName = _c8a_tenant?.name || 'Charlie'
  // W-AILY-CTA-BRAND-LEAK (2026-06-23): brandName + wordmarkStyle for per-tenant
  // WalliamCTA wordmark. Mount below is {isHero && (...)}-gated today.
  const brandName     = _c8a_tenant?.brandName     || 'Brand'
  const wordmarkStyle = _c8a_tenant?.wordmarkStyle || 'standard'

  // W-FUNNEL §9.2 Step 5: chatHasApiKey block from Step 2 removed -- Step 3's
  // gate (!isHero && !tenantId) means ChatWidgetWrapper renders only on
  // System 1 (tenantId null). The System-2 tenant-key branch was provably
  // unreachable; the prop is read straight from the agent row again.

  // A-UNIT-2 Phase 2 (2026-07-04): resolve the full geo chain
  // buildings.community_id → communities → municipalities → treb_areas
  // (name+slug at each level). Replaces the Phase 1 IIFE that only
  // returned muni.name. Reused by both BuildingSchema (locality prop)
  // and BreadcrumbSchema. Drops levels when any FK is null (never
  // fabricated).
  const _geoChain = await (async () => {
    const out: { community: { name: string; slug: string } | null; muni: { name: string; slug: string } | null; area: { name: string; slug: string } | null } = { community: null, muni: null, area: null }
    if (!building.community_id) return out
    const { data: comm } = await supabase
      .from('communities')
      .select('name, slug, municipality_id')
      .eq('id', building.community_id)
      .single()
    if (!comm) return out
    if (comm.name && comm.slug) out.community = { name: comm.name, slug: comm.slug }
    if (!comm.municipality_id) return out
    const { data: muni } = await supabase
      .from('municipalities')
      .select('name, slug, area_id')
      .eq('id', comm.municipality_id)
      .single()
    if (!muni) return out
    if (muni.name && muni.slug) out.muni = { name: muni.name, slug: muni.slug }
    if (!muni.area_id) return out
    const { data: area } = await supabase
      .from('treb_areas')
      .select('name, slug')
      .eq('id', muni.area_id)
      .single()
    if (area?.name && area.slug) out.area = { name: area.name, slug: area.slug }
    return out
  })()
  const _bpDomain = await resolveCanonicalHost()
  const _bpBcItems = [] as { name: string; url: string }[]
  if (_geoChain.area) _bpBcItems.push({ name: _geoChain.area.name, url: `https://${_bpDomain}/${_geoChain.area.slug}` })
  if (_geoChain.muni) _bpBcItems.push({ name: _geoChain.muni.name, url: `https://${_bpDomain}/${_geoChain.muni.slug}` })
  if (_geoChain.community) _bpBcItems.push({ name: _geoChain.community.name, url: `https://${_bpDomain}/${_geoChain.community.slug}` })
  if (development?.name && development.slug) _bpBcItems.push({ name: development.name, url: `https://${_bpDomain}/${development.slug}` })
  _bpBcItems.push({ name: building.building_name, url: `https://${_bpDomain}/${building.slug || params.slug}` })

  return (
    <>
      {agent && (
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__AGENT_DATA__ = ${JSON.stringify({
              full_name: agent.full_name,
              email: agent.email,
              phone: agent.cell_phone,
              brokerage_name: agent.brokerage_name,
              brokerage_address: agent.brokerage_address,
              title: agent.title,
              siteName: agent.site_title || agent.full_name,
              siteTagline: agent.site_tagline || 'Real Estate Specialist',
              ogImageUrl: agent.og_image_url
            })};`
          }}
        />
      )}
      <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <Breadcrumb items={[
            ...(development ? [{ label: development.name, href: `/${development.slug}` }] : []),
            { label: building.building_name }
          ]} />
        </div>
        <BuildingSchema
        building={building}
        activeSales={activeSales}
        activeRentals={activeRentals}
        avgPrice={avgSalePrice}
        // A-UNIT-2 Phase 2 (2026-07-04): locality from the resolved geo
        // chain (Phase 1 IIFE was inlined; Phase 2 lifts it above the
        // return so both BuildingSchema and BreadcrumbSchema share the
        // resolved data — single query per render).
        locality={_geoChain.muni?.name || null}
      />
      {/* A-UNIT-2 Phase 2: BreadcrumbList JSON-LD.
          Chain Home > Area > Muni > Community > (Development?) > Building.
          Each level dropped when its slug is null. */}
      <BreadcrumbSchema
        items={_bpBcItems}
        homeUrl={`https://${_bpDomain}/`}
      />
      <StickyNav agentId={agent?.id} />
      
      {isHero && <div className="h-16 bg-[#060b18]" />}
      <BuildingHero
        assistantName={assistantName}
        building={building}
        slug={params.slug}
        activeSalesCount={activeSales.length}
        activeRentalsCount={activeRentals.length}
        closedSalesCount={closedSales.length}
        closedRentalsCount={closedRentals.length}
        avgSalePrice={avgSalePrice}
        avgDaysOnMarketSale={avgDaysOnMarketSale}
        avgDaysOnMarketLease={avgDaysOnMarketLease}
        localityName={_geoChain.muni?.name || null}
      />
          {/* Compact Agent CTA - Fixed at top for lead capture */}
        {agent && !isHero && (
        <div className="bg-white border-b border-gray-200 py-3 md:py-4 fixed top-16 left-0 right-0 z-40 shadow-md">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {agent?.profile_photo_url ? (
                  <img 
                    src={agent.profile_photo_url} 
                    alt={agent.full_name}
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm md:text-base">
                      {agent?.full_name?.split(' ').map((n: string) => n[0]).join('') || 'A'}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm md:text-base font-semibold text-gray-900 truncate">{agent?.full_name}</p>
                  <p className="text-xs md:text-sm text-gray-600 truncate">Questions about {building.building_name}?</p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {agent?.cell_phone && (
                  <a 
                    href={`tel:${agent.cell_phone}`}
                    className="px-3 py-2 md:px-4 bg-green-600 hover:bg-green-700 text-white text-xs md:text-sm font-semibold rounded-lg transition-colors"
                  >
                    Call
                  </a>
                )}
                <a 
                  href="#agent-contact"
                  className="px-3 py-2 md:px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-semibold rounded-lg transition-colors"
                >
                  Chat
                </a>
              </div>
            </div>
          </div>
        </div>
        )}
      {/* Main Content Grid with Agent Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          
          {/* Main Content - 3 columns */}
          <div className="lg:col-span-3 space-y-12">
            <div id="listings">
              <ListingSection
                  activeSales={activeSales}
                  activeRentals={activeRentals}
                  closedSalesCount={closedSales.length}
                  closedRentalsCount={closedRentals.length}
                  buildingId={building.id}
                  buildingName={building.building_name}
                  buildingAddress={building.canonical_address}
                  buildingSlug={building.slug}
                  agentId={tenantId ? (resolvedAgentId || '') : (agent?.id || '')}
                  tenantId={tenantId ? (tenantId ?? undefined) : (agent?.tenant_id ?? undefined)}
                  isHero={isHero && !!resolvedAgentId}
                />
            </div>
            
            <div id="highlights">
              <BuildingHighlights 
                building={building}
                listings={listingsWithoutMedia}
              />
            </div>
            
            <div id="market-stats">
              <MarketStats stats={stats} yearBuilt={building.year_built} />
            </div>
            {/* W-MARKETING A-UNIT-4b (2026-07-03): SSR activity summary from
                geo_analytics. Sandwiched between MarketStats (property basics,
                inventory %, high/low sale) and MarketIntelligence (PSF, yield,
                parking/locker). 7 fields NON-overlapping with either sibling:
                median sale price + 6-metric grid (Sold90d / Active / Months of
                inventory / DOM / STL / Absorption). Tenant-neutral: no tenant
                gate, matches shared-exception posture of the two existing
                sibling panels. Renders for both System-1 and System-2 hosts. */}
            <GeoMarketActivity
              geoType="building"
              geoId={building.id}
              geoName={building.building_name}
            />
            <MarketIntelligence data={marketData} />
            {amenities.length > 0 && (
              <div id="amenities">
                <BuildingAmenities amenities={amenities} feeIncludes={feeIncludes} />
              </div>
            )}
            
            <div id="price-trends">
              <PriceChart closedSales={closedSales} closedRentals={closedRentals} />
            </div>
            
            <TransactionInsights 
              activeSales={activeSales}
              closedSales={closedSales}
              activeRentals={activeRentals}
              closedRentals={closedRentals}
              totalUnits={building.total_units}
            />
            
            <div id="transaction-history">
              <TransactionHistory 
                closedSales={closedSales}
                closedRentals={closedRentals}
                highestSale={highestSale}
                buildingName={building.building_name}
                buildingAddress={building.canonical_address}
              />
            </div>
            
            {/* <div id="location">
              <BuildingMap
                latitude={building.latitude}
                longitude={building.longitude}
                buildingName={building.building_name}
                address={building.full_address}
              />
            </div> */}

            <div id="reviews">
              <BuildingReviews
                buildingId={building.id}
                buildingName={building.building_name}
              />
            </div>
            
            <div id="list-your-unit">
              {agent && !isHero ? (
                <EstimatorSeller
                  buildingId={building.id}
                  buildingSlug={building.slug}
                  buildingName={building.building_name}
                  buildingAddress={building.canonical_address}
                  agentId={agent.id}
                />
              ) : isHero && resolvedAgentId && tenantId ? (
                <EstimatorSeller
                  buildingId={building.id}
                  buildingSlug={building.slug}
                  buildingName={building.building_name}
                  buildingAddress={building.canonical_address}
                  agentId={resolvedAgentId}
                  tenantId={tenantId}
                />
              ) : null}
            </div>

            <ListYourUnit buildingName={building.building_name} buildingId={building.id} agentId={agent?.id || ""} />
            
            <SEODescription
              building={building}
              totalListings={allListings.length}
              avgPrice={avgSalePrice}
              localityName={_geoChain.muni?.name || null}
            />
          </div>
          
          {/* Agent Sidebar - 1 column, sticky */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {/* W-BUILDING-PAGE UNIT 46 (2026-06-28): gate the tenant-aware
                  rail on tenantId (not isHero). isHero is a brand-flavor
                  signal (which wordmark to render), not a behavior signal.
                  Every tenant-bound host gets the tenant-aware rail; only
                  the dramatic WalliamCTA wordmark stays hero-gated. The
                  Walliam* component names are legacy carryover — each takes
                  tenant inputs via props and resolves through
                  resolve_agent_for_context (F4 audit confirmed). The
                  legacy non-tenant branch (subdomain/custom_domain agent
                  sites) is unchanged. */}
              {tenantId ? (
                <>
                  <WalliamAgentCard
                   building_id={building.id}
                   community_id={building.community_id || null}
                   municipality_id={building.municipality_id || null}
                   tenant_id={tenantId!}
                  />
                  {/* W-BUILDING-PAGE UNIT 48 (2026-06-28): UNIT 46 hero-gated
                      this on the mistaken assumption that the component was
                      the dramatic hero WORDMARK. It is actually the
                      "Get Your AI Real Estate Plan" CTA card (Ask AI +
                      Buyer Plan + Seller Plan) — the wordmark is one
                      sub-element of it that already self-branches by
                      wordmarkStyle (hero / aiglow / plain BrandWordmark)
                      per W-AILY-CTA-BRAND-LEAK + W-AILY-CTA-PANEL
                      authoring. UNIT 47 R4 leak-audit confirmed CLEAN:
                      no hardcoded WALLiam id, no host check, all flavor
                      driven by wordmarkStyle/brandName/assistantName
                      props. Render unconditionally — closes the
                      MTB-DEF-1 case UNIT 46 left open on the 4th of 4
                      tenant-rail components. */}
                  <WalliamCTA context={building.building_name} assistantName={assistantName} brandName={brandName} wordmarkStyle={wordmarkStyle} />
                  <CharliePageContext building_id={building.id} community_id={building.community_id || null} municipality_id={building.municipality_id || null} />
                  <WalliamContactForm
                    tenantId={tenantId!}
                    building_id={building.id}
                    geo_name={building.building_name}
                    source="walliam_building_inquiry"
                    contextLabel={building.building_name}
                  />
                  {/* Own a Unit CTA */}
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-200 shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                      </div>
                      <h3 className="font-bold text-slate-900">Own a Unit Here?</h3>
                    </div>
                    <p className="text-sm text-slate-600 mb-4">Get a FREE instant estimate of your unit's market value</p>
                    <a href="#list-your-unit" className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white text-center py-3 rounded-lg font-semibold transition-colors">
                      What's Your Unit Worth?
                    </a>
                  </div>
                </>
              ) : (
                <>
                  {agent && (
                    <AgentCard
                      agent={agent}
                      source="building_page"
                      buildingId={building.id}
                      buildingName={building.building_name}
                      buildingAddress={building.canonical_address}
                    />
                  )}
                  {agent && (
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-200 shadow-sm">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-emerald-600 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                          </svg>
                        </div>
                        <h3 className="font-bold text-slate-900">Own a Unit Here?</h3>
                      </div>
                      <p className="text-sm text-slate-600 mb-4">Get a FREE instant estimate of your unit's market value</p>
                      <a href="#list-your-unit" className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white text-center py-3 rounded-lg font-semibold transition-colors">
                        What's Your Unit Worth?
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
    {!isHero && agent && <MobileContactBar
      agent={agent}
      buildingId={building.id}
      buildingName={building.building_name}
      buildingAddress={building.canonical_address}
    />}
    {/* W-FUNNEL §9.2 Step 3: System 2 uses CharlieWidget (global, ConditionalLayout); System 1 keeps ChatWidgetWrapper. */}
    {!isHero && !tenantId && agent && (
      <ChatWidgetWrapper
        agent={{
          id: agent.id,
          full_name: agent.full_name,
          ai_chat_enabled: agent.ai_chat_enabled,
          has_api_key: !!agent.anthropic_api_key,
          ai_welcome_message: agent.ai_welcome_message,
          ai_free_messages: agent.ai_free_messages
        }}
        building={{
          id: building.id,
          building_name: building.building_name,
          canonical_address: building.canonical_address,
          community_id: building.community_id
        }}
      />
    )}
    </>
  )
}






