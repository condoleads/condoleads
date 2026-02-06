import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { getDisplayAgentForDevelopment, isCustomDomain } from '@/lib/utils/agent-detection'
import { AgentCard } from '@/components/AgentCard'
import Link from 'next/link'
import DevelopmentListings from './components/DevelopmentListings'
import DevelopmentSEO from './components/DevelopmentSEO'
import Breadcrumb from '@/components/Breadcrumb'
import MobileContactBar from '@/components/MobileContactBar'
import DevelopmentStickyNav from './components/DevelopmentStickyNav'
import { unstable_cache } from 'next/cache'

// Cached query functions for performance (60 second cache)
const getCachedDevelopmentBuildings = unstable_cache(
  async (developmentId: string) => {
    const { data } = await supabase
      .from('buildings')
      .select('*')
      .eq('development_id', developmentId)
      .order('building_name')
    return data
  },
  ['dev-buildings'],
  { revalidate: 60 }
)

 { revalidate: 60 }

const getCachedListingsForBuilding = unstable_cache(
  async (buildingId: string) => {
    const { data } = await supabase
      .from('mls_listings')
      .select('id, building_id, listing_id, listing_key, standard_status, transaction_type, list_price, close_price, unit_number, unparsed_address, bedrooms_total, bathrooms_total_integer, property_type, living_area_range, square_foot_source, parking_total, locker, association_fee, tax_annual_amount, days_on_market, listing_contract_date, media (id, media_url, variant_type, order_number, preferred_photo_yn)')
      .eq('building_id', buildingId)
      .order('list_price', { ascending: false })
    return data || []
  },
  ['dev-building-listings'],
  { revalidate: 60 }
)

interface DevelopmentPageProps {
  params: { slug: string }
  development: { id: string; name: string; slug: string }
}

export async function generateDevelopmentMetadata(development: { id: string; name: string; slug: string }) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const serverSupabase = createClient()
  
  // Fetch agent branding based on host
  let agentBranding: { site_title: string | null; site_tagline: string | null; og_image_url: string | null } | null = null
  
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
  const ogImage = agentBranding?.og_image_url || '/og-image.jpg'
  
  // Get buildings with addresses
  const { data: buildings } = await serverSupabase
    .from('buildings')
    .select('id, canonical_address')
    .eq('development_id', development.id)
  
  const buildingCount = buildings?.length || 0
  const addresses = buildings?.map(b => b.canonical_address).filter(Boolean).join(', ') || ''
  
  const title = `${development.name} | ${addresses} | ${siteName}`
  const description = `Explore ${development.name} at ${addresses}. ${buildingCount} buildings with condos for sale and rent. View floor plans, amenities, and market insights.`
  
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://${host}/${development.slug}`,
      siteName: siteName,
      locale: 'en_CA',
      type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630, alt: development.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function DevelopmentPage({ params, development }: DevelopmentPageProps) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const serverSupabase = createClient()
  const { displayAgent, isTeamSite } = await getDisplayAgentForDevelopment(host, development.id)
  
  if (!displayAgent) {
    notFound()
  }
  const agent = displayAgent

  const buildings = await getCachedDevelopmentBuildings(development.id)

  if (!buildings || buildings.length === 0) { notFound() }

  const buildingIds = buildings.map((b: any) => b.id)

  // Fetch listings per building in PARALLEL (each cached separately for reliability)
  const listingsPerBuilding = await Promise.all(
    buildingIds.map(id => getCachedListingsForBuilding(id))
  )
  const allListings = listingsPerBuilding.flat()

  // Filter media to thumbnails only to reduce HTML payload
  // Create a map of building_id to building_slug
  const buildingSlugMap = new Map(buildings.map((b: any) => [b.id, b.slug]))

  const filterMedia = (listing: any) => ({
    ...listing,
    building_slug: buildingSlugMap.get(listing.building_id) || '',
    media: (listing.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1) // Only first photo, rest loaded on demand
  })

  const forSaleActive = (allListings || []).filter((l: any) => l.transaction_type === 'For Sale' && l.standard_status === 'Active').map(filterMedia)
  const forLeaseActive = (allListings || []).filter((l: any) => l.transaction_type === 'For Lease' && l.standard_status === 'Active').map(filterMedia)
  const soldListings = (allListings || []).filter((l: any) => l.transaction_type === 'For Sale' && l.standard_status === 'Closed').map(filterMedia)
  const leasedListings = (allListings || []).filter((l: any) => l.transaction_type === 'For Lease' && l.standard_status === 'Closed').map(filterMedia)
  const totalUnits = buildings.reduce((sum: number, b: any) => sum + (b.total_units || 0), 0)
  const addresses = buildings.map((b: any) => b.canonical_address).join(' & ')

  const formatPrice = (price: number) => {
    if (price >= 1000000) return `$${(price / 1000000).toFixed(2)}M`
    return `$${(price / 1000).toFixed(0)}K`
  }

  const getListingPhoto = (listing: any) => {
    const photos = listing.media?.filter((m: any) => m.variant_type === 'large') || []
    return photos[0]?.media_url || '/placeholder-unit.jpg'
  }

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__AGENT_DATA__ = ${JSON.stringify({
            id: agent.id,
            full_name: agent.full_name,
            email: agent.email,
            phone: agent.cell_phone,
            brokerage_name: agent.brokerage_name,
            brokerage_address: agent.brokerage_address,
            title: agent.title,
            siteName: agent.site_title || agent.full_name,
            siteTagline: agent.site_tagline || 'Toronto Condo Specialist',
            ogImageUrl: agent.og_image_url,
            buildingName: development.name,
            buildingAddress: addresses
         })};`
        }}
      />
      <DevelopmentStickyNav
        forSaleCount={forSaleActive.length}
        forLeaseCount={forLeaseActive.length}
        soldCount={soldListings.length}
        leasedCount={leasedListings.length}
        agentId={agent?.id}
      />
      <div className="min-h-screen bg-gray-50 pt-16 md:pt-20">
        <div className="max-w-7xl mx-auto px-4 pt-4">
          <Breadcrumb items={[{ label: development.name }]} />
        </div>
        
        {/* Hero - Compact on mobile */}
        <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white">
          <div className="max-w-7xl mx-auto px-4 py-6 md:py-16 text-center">
            <h1 className="text-2xl md:text-5xl font-bold mb-2 md:mb-4">{development.name}</h1>
            <p className="text-sm md:text-xl text-blue-100 mb-1 md:mb-2">{addresses}</p>
            <p className="text-xs md:text-base text-blue-200">{buildings.length} Buildings - {totalUnits} Total Units</p>
            {/* Stats grid - compact on mobile */}
            <div className="grid grid-cols-4 gap-2 md:gap-4 mt-4 md:mt-8 max-w-3xl mx-auto">
              <a href="#for-sale" className="bg-white/10 rounded-lg p-2 md:p-4 hover:bg-white/20 transition-colors cursor-pointer">
                <div className="text-xl md:text-3xl font-bold">{forSaleActive.length}</div>
                <div className="text-blue-200 text-xs md:text-sm">For Sale</div>
              </a>
              <a href="#for-lease" className="bg-white/10 rounded-lg p-2 md:p-4 hover:bg-white/20 transition-colors cursor-pointer">
                <div className="text-xl md:text-3xl font-bold">{forLeaseActive.length}</div>
                <div className="text-blue-200 text-xs md:text-sm">For Lease</div>
              </a>
              <a href="#sold" className="bg-white/10 rounded-lg p-2 md:p-4 hover:bg-white/20 transition-colors cursor-pointer">
                <div className="text-xl md:text-3xl font-bold">{soldListings.length}</div>
                <div className="text-blue-200 text-xs md:text-sm">Sold</div>
              </a>
              <a href="#leased" className="bg-white/10 rounded-lg p-2 md:p-4 hover:bg-white/20 transition-colors cursor-pointer">
                <div className="text-xl md:text-3xl font-bold">{leasedListings.length}</div>
                <div className="text-blue-200 text-xs md:text-sm">Leased</div>
              </a>
            </div>
          </div>
        </div>
        {/* Compact Agent CTA - Early lead capture */}
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
                  <p className="text-xs md:text-sm text-gray-600 truncate">Questions about {development.name}?</p>
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
        {/* Main content - use flex with order for mobile-first listings */}
        <div className="max-w-7xl mx-auto px-4 py-4 md:py-8 flex flex-col">
          
          {/* Listings - FIRST on mobile (order-1), normal on desktop (md:order-2) */}
          <div className="order-1 md:order-2">
            <DevelopmentListings
              forSaleActive={forSaleActive}
              forLeaseActive={forLeaseActive}
              soldListings={soldListings}
              leasedListings={leasedListings}
              developmentName={development.name}
              developmentAddresses={addresses}
              agentId={agent?.id || ''}
            />
          </div>

          {/* Buildings grid - hidden on mobile, visible on desktop (order-1) */}
          <div id="buildings" className="hidden md:block order-1 mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Buildings in {development.name}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {buildings.map((building: any) => {
                const bListings = (allListings || []).filter((l: any) => l.building_id === building.id)
                const bForSale = bListings.filter((l: any) => l.transaction_type === 'For Sale' && l.standard_status === 'Active').length
                const bForLease = bListings.filter((l: any) => l.transaction_type === 'For Lease' && l.standard_status === 'Active').length
                return (
                  <div key={building.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                    <h3 className="font-bold text-lg text-gray-900 mb-1">{building.building_name}</h3>
                    <p className="text-gray-600 text-sm mb-3">{building.canonical_address}</p>
                    <div className="flex gap-4 text-sm mb-4">
                      <span className="text-green-600 font-medium">{bForSale} For Sale</span>
                      <span className="text-blue-600 font-medium">{bForLease} For Lease</span>
                    </div>
                    <Link href={'/' + building.slug} className="block w-full text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
                      View Building
                    </Link>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Agent Card - last on mobile (order-3), after buildings on desktop (md:order-3) */}
          <div className="order-3 mt-8 md:mt-0 md:mb-12">
            {agent && <AgentCard agent={agent} source="building_page" buildingId={buildings[0]?.id} buildingName={development.name} buildingAddress={addresses} />}
          </div>

        </div>

        <DevelopmentSEO
          developmentName={development.name}
          buildings={buildings}
          totalForSale={forSaleActive.length}
          totalForLease={forLeaseActive.length}
          totalSold={soldListings.length}
          totalLeased={leasedListings.length}
          addresses={addresses}
        />
        <MobileContactBar
          agent={agent} 
          buildingId={buildings[0]?.id}
          buildingName={development.name}
          buildingAddress={addresses}
        />
      </div>
    </>
  )
}
