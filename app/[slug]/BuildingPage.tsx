import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { supabase } from '@/lib/supabase/client'
import { isCustomDomain } from '@/lib/utils/agent-detection'
import { calculateAverage, calculateInventoryRate, extractAmenities, extractFeeIncludes } from '@/lib/utils/calculations'
import BuildingHero from './components/BuildingHero'
import BuildingHighlights from './components/BuildingHighlights'
import ListingSection from './components/ListingSection'
import MarketStats from './components/MarketStats'
import MarketIntelligence from './components/MarketIntelligence'
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

const getCachedListings = unstable_cache(
  async (buildingId: string) => {
    const { data } = await supabase
      .from('mls_listings')
      .select(`
        id, building_id, listing_id, listing_key, standard_status, transaction_type,
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
      .order('list_price', { ascending: false })
    return data
  },
  ['listings'],
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
import { AgentCard } from '@/components/AgentCard'
import MobileContactBar from '@/components/MobileContactBar'
import Breadcrumb from '@/components/Breadcrumb'
import ChatWidgetWrapper from '@/components/chat/ChatWidgetWrapper'
import { createClient, createServerClient } from '@/lib/supabase/server'
import { getDisplayAgentForBuilding } from '@/lib/utils/agent-detection'

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
  
  const siteName = agentBranding?.site_title || 'CondoLeads'
  const siteTagline = agentBranding?.site_tagline || 'Toronto Condo Specialist'
  const ogImage = agentBranding?.og_image_url || '/og-image.jpg'
  
  const { data: building } = await supabase
    .from('buildings')
    .select('id, building_name, canonical_address, year_built, total_units')
    .eq('slug', params.slug)
    .single()
  if (!building) {
    return { title: 'Building Not Found' }
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
  let description = `${building.building_name} at ${building.canonical_address} in Toronto. `
  
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
  
  description += `View floor plans, amenities, market stats, and transaction history.`

 const title = `${building.building_name} Condos - ${building.canonical_address} | ${siteName}`
  return {
    title,
    description,
    keywords: [
      building.building_name,
      'Toronto condos',
      'condos for sale',
      'condos for rent',
      building.canonical_address,
      'Toronto real estate',
      'condo listings',
      'GTA condos'
    ],
    openGraph: {
      title,
      description,
      url: `https://${host}/${params.slug}`,
      siteName: siteName,
      locale: 'en_CA',
      type: 'website',
      images: [
        {
          url: ogImage,
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
      images: [ogImage],
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

  // Run all dependent queries in PARALLEL with caching for performance
  const [development, agentResult, listings, marketData] = await Promise.all([
    // Development query (conditional) - CACHED
    building.development_id
      ? getCachedDevelopment(building.development_id)
      : Promise.resolve(null),
    
    // Agent query (NOT cached - depends on host)
    getDisplayAgentForBuilding(host, building.id),
    
    // Listings query - CACHED
    getCachedListings(building.id),
    
    // Market intelligence data
    getBuildingMarketData(building.id)
  ])

  const { siteOwner, displayAgent, isTeamSite } = agentResult

  // If no display agent (not assigned to this building/team), show 404
  if (!displayAgent) {
    notFound()
  }
  const agent = displayAgent

  const allListings = listings || []

  // Strip media for components that don't need it (reduces HTML payload)
  const listingsWithoutMedia = allListings.map(l => ({ ...l, media: undefined }))
  
  // Filter media to thumbnails only to reduce HTML payload
  const filterMedia = (listing: any) => ({
    ...listing,
    media: (listing.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1) // Only first photo, rest loaded on demand
  })
  
  const activeListings = allListings.filter(l => l.standard_status === 'Active')
  const closedListings = allListings.filter(l => l.standard_status === 'Closed')
  
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

  return (
    <>
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
            siteTagline: agent.site_tagline || 'Toronto Condo Specialist',
            ogImageUrl: agent.og_image_url
          })};`
        }}
      />
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
      />
      <StickyNav agentId={agent?.id} />
      
      <BuildingHero 
        building={building}
        slug={params.slug}
        activeSalesCount={activeSales.length}
        activeRentalsCount={activeRentals.length}
        closedSalesCount={closedSales.length}
        closedRentalsCount={closedRentals.length}
        avgSalePrice={avgSalePrice}
        avgDaysOnMarketSale={avgDaysOnMarketSale}
        avgDaysOnMarketLease={avgDaysOnMarketLease}
      />
          {/* Compact Agent CTA - Fixed at top for lead capture */}
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
      {/* Main Content Grid with Agent Sidebar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-4 gap-8">
          
          {/* Main Content - 3 columns */}
          <div className="lg:col-span-3 space-y-12">
            <div id="listings">
              <ListingSection
                  activeSales={activeSales}
                  activeRentals={activeRentals}
                  closedSales={closedSales}
                  closedRentals={closedRentals}
                  buildingId={building.id}
                  buildingName={building.building_name}
                  buildingAddress={building.canonical_address}
                  buildingSlug={building.slug}
                  agentId={agent?.id || ""}
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
              {agent ? (
                <EstimatorSeller
                  buildingId={building.id}
                  buildingSlug={building.slug}
                  buildingName={building.building_name}
                  buildingAddress={building.canonical_address}
                  agentId={agent.id}
                />
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                  <p className="text-amber-800">Estimator will be available once an agent is assigned to this building.</p>
                </div>
              )}
            </div>

            <ListYourUnit buildingName={building.building_name} buildingId={building.id} agentId={agent?.id || ""} />
            
            <SEODescription 
              building={building}
              totalListings={allListings.length}
              avgPrice={avgSalePrice}
            />
          </div>
          
          {/* Agent Sidebar - 1 column, sticky */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-6">
              {agent && (
                <AgentCard
                  agent={agent}
                  source="building_page"
                  buildingId={building.id}
                  buildingName={building.building_name}
                  buildingAddress={building.canonical_address}
                />
              )}
              
              {/* Own a Unit CTA */}
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
                  <a
                    href="#list-your-unit"
                    className="block w-full bg-emerald-600 hover:bg-emerald-700 text-white text-center py-3 rounded-lg font-semibold transition-colors"
                  >
                    What's Your Unit Worth?
                  </a>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
    <MobileContactBar 
      agent={agent} 
      buildingId={building.id} 
      buildingName={building.building_name} 
      buildingAddress={building.canonical_address} 
    />
    {/* AI Chat Widget */}
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
    </>
  )
}






