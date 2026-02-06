import { supabase } from '@/lib/supabase/client'
import { createClient, createServerClient } from '@/lib/supabase/server'
import { getDisplayAgentForBuilding, isCustomDomain } from '@/lib/utils/agent-detection'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import PropertyPageClient from './PropertyPageClient'
import ChatWidgetWrapper from '@/components/chat/ChatWidgetWrapper'
import { getListingInvestmentData } from '@/lib/market/get-listing-investment-data'

export async function generateMetadata({ params }: { params: { id: string } }) {
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
  
  // Fetch listing data
  const { data: listing } = await serverSupabase
    .from('mls_listings')
    .select('id, unparsed_address, list_price, bedrooms_total, bathrooms_total, transaction_type, building_id, unit_number')
    .eq('id', params.id)
    .single()
  
  if (!listing) {
    return { title: 'Property Not Found' }
  }
  
  // Fetch building name
  const { data: building } = await serverSupabase
    .from('buildings')
    .select('building_name, canonical_address')
    .eq('id', listing.building_id)
    .single()
  
  const price = listing.list_price ? `$${listing.list_price.toLocaleString()}` : ''
  const beds = listing.bedrooms_total ? `${listing.bedrooms_total} Bed` : ''
  const baths = listing.bathrooms_total ? `${listing.bathrooms_total} Bath` : ''
  const type = listing.transaction_type === 'For Sale' ? 'For Sale' : 'For Rent'
  const unit = listing.unit_number ? `Unit ${listing.unit_number}` : ''
  
  const titleParts = [
    listing.unparsed_address,
    unit,
    building?.building_name,
    price,
    beds,
    siteName
  ].filter(Boolean)
  
  const title = titleParts.join(' | ')
  const description = `${beds} ${baths} condo ${type.toLowerCase()} at ${listing.unparsed_address}${building ? ` in ${building.building_name}` : ''}. ${price}. View photos, floor plans, and schedule a showing.`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://${host}/property/${params.id}`,
      siteName: siteName,
      locale: 'en_CA',
      type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630, alt: listing.unparsed_address }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
    },
  }
}

export default async function PropertyPage({ params }: { params: { id: string } }) {
  const supabaseServer = createClient()

  // Fetch listing data
  const { data: listing, error } = await supabase
    .from('mls_listings')
    .select('*')
    .eq('id', params.id)
    .single()
  
  if (error || !listing) {
    notFound()
  }

  // Fetch building data
  const { data: building } = await supabase
    .from('buildings')
    .select('id, building_name, slug, canonical_address, development_id, community_id')
    .eq('id', listing.building_id)
    .single()

  // Fetch development if building belongs to one
  let development: { id: string; name: string; slug: string } | null = null
  if (building?.development_id) {
    const { data: devData } = await supabase
      .from('developments')
      .select('id, name, slug')
      .eq('id', building.development_id)
      .single()
    development = devData
  }

  // Get agent from subdomain with access verification
  const headersList = headers()
  const host = headersList.get('host') || ''
  const { displayAgent } = await getDisplayAgentForBuilding(host, listing.building_id)
  // If no agent (not assigned to this building), show 404
  if (!displayAgent) {
    notFound()
  }
  const agent = displayAgent


// Run ALL independent queries in PARALLEL
  const [
    largePhotosResult,
    unitHistoryResult,
    roomsResult,
    amenitiesResult,
    availableListingsResult,
    investmentData,
    similarResult1
  ] = await Promise.all([
    // 1. Media - large photos only
    supabase
      .from('media')
      .select('media_url, order_number')
      .eq('listing_id', listing.id)
      .eq('variant_type', 'large')
      .order('order_number'),

    // 2. Unit history
    supabase
      .from('mls_listings')
      .select('id, list_price, close_price, close_date, listing_contract_date, days_on_market, transaction_type, standard_status, mls_status, listing_key')
      .eq('building_id', listing.building_id)
      .eq('unit_number', listing.unit_number)
      .neq('id', listing.id)
      .order('close_date', { ascending: false, nullsFirst: false })
      .order('listing_contract_date', { ascending: false })
      .limit(20),

    // 3. Room dimensions
    supabase
      .from('property_rooms')
      .select('*')
      .eq('listing_id', listing.id)
      .order('order_number'),

    // 4. Amenities
    supabase
      .from('property_amenities')
      .select('*')
      .eq('listing_id', listing.id),

    // 5. Available listings in same building
    supabase
      .from('mls_listings')
      .select(`
        *,
        media (
          id,
          media_url,
          order_number,
          variant_type
        )
      `)
      .eq('building_id', listing.building_id)
      .eq('transaction_type', listing.transaction_type)
      .eq('standard_status', 'Active')
      .neq('id', listing.id)
      .order('list_price', { ascending: true })
      .limit(8),

    // 6. Investment data
    getListingInvestmentData(
      listing.building_id,
      listing.list_price,
      listing.calculated_sqft,
      listing.living_area_range,
      listing.association_fee,
      listing.tax_annual_amount,
      listing.transaction_type
    ),

    // 7. Similar SOLD - Try 1: exact bed/bath match
    supabase
      .from('mls_listings')
      .select(`
        *,
        media (
          id,
          media_url,
          order_number,
          variant_type
        )
      `)
      .eq('building_id', listing.building_id)
      .eq('transaction_type', listing.transaction_type)
      .eq('standard_status', 'Closed')
      .eq('bedrooms_total', listing.bedrooms_total)
      .eq('bathrooms_total_integer', listing.bathrooms_total_integer)
      .neq('id', listing.id)
      .order('close_date', { ascending: false })
      .limit(8)
  ])

  const largePhotos = largePhotosResult.data
  const unitHistory = unitHistoryResult.data
  const rooms = roomsResult.data
  const amenitiesData = amenitiesResult.data
  const amenities = amenitiesData?.filter(a => a.category === 'amenity') || []
  const feeIncludes = amenitiesData?.filter(a => a.category === 'fee_includes') || []

  // Similar listings - cascading fallback (sequential, but runs AFTER parallel batch)
  let similarListings = similarResult1.data || []

  // Try 2: If less than 4, get same bedrooms only
  if (similarListings.length < 4) {
    const { data: moreSimilar } = await supabase
      .from('mls_listings')
      .select(`
        *,
        media (
          id,
          media_url,
          order_number,
          variant_type
        )
      `)
      .eq('building_id', listing.building_id)
      .eq('transaction_type', listing.transaction_type)
      .eq('standard_status', 'Closed')
      .eq('bedrooms_total', listing.bedrooms_total)
      .neq('id', listing.id)
      .order('close_date', { ascending: false })
      .limit(8)

    if (moreSimilar) {
      const existingIds = new Set(similarListings.map(l => l.id))
      const newListings = moreSimilar.filter(l => !existingIds.has(l.id))
      similarListings = [...similarListings, ...newListings]
    }
  }

  // Try 3: If still less than 4, get any sold units
  if (similarListings.length < 4) {
    const { data: anySold } = await supabase
      .from('mls_listings')
      .select(`
        *,
        media (
          id,
          media_url,
          order_number,
          variant_type
        )
      `)
      .eq('building_id', listing.building_id)
      .eq('transaction_type', listing.transaction_type)
      .eq('standard_status', 'Closed')
      .neq('id', listing.id)
      .order('close_date', { ascending: false })
      .limit(8)

    if (anySold) {
      const existingIds = new Set(similarListings.map(l => l.id))
      const newListings = anySold.filter(l => !existingIds.has(l.id))
      similarListings = [...similarListings, ...newListings]
    }
  }

  // Limit to 8 and strip to thumbnail media only
  similarListings = similarListings.slice(0, 8).map(l => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1)
  }))

  // Strip available listings to thumbnail media only
  const filteredAvailable = (availableListingsResult.data || []).map(l => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1)
  }))

  const isSale = listing.transaction_type === 'For Sale'
  const isClosed = listing.standard_status === 'Closed'
  const status = isClosed ? 'Closed' : 'Active'

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
            id: agent.id,
            buildingId: listing.building_id,
            buildingName: building?.building_name || '',
            buildingAddress: building?.canonical_address || '',
            listingId: listing.id,
            listingAddress: listing.unparsed_address || '',
            unitNumber: listing.unit_number || '',
            siteName: agent.site_title || agent.full_name,
            siteTagline: agent.site_tagline || 'Toronto Condo Specialist',
            ogImageUrl: agent.og_image_url
          })};`
        }}
      />
    <main className="min-h-screen bg-gray-50">
      <PropertyPageClient
        listing={listing}
        largePhotos={largePhotos || []}
        rooms={rooms || []}
        unitHistory={unitHistory || []}
        amenities={amenities}
        feeIncludes={feeIncludes}
        similarListings={similarListings || []}
        availableListings={filteredAvailable}
        isSale={isSale}
        status={status}
        isClosed={isClosed}
        agent={agent}
        building={building}
        development={development}
        investmentData={investmentData}
        />
    </main>
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
      building={building ? { 
        id: building.id, 
        building_name: building.building_name, 
        canonical_address: building.canonical_address,
        community_id: building.community_id
      } : null}
      listing={{ id: listing.id, unit_number: listing.unit_number, list_price: listing.list_price, bedrooms_total: listing.bedrooms_total, bathrooms_total: listing.bathrooms_total }}
    />
    </>
  )
}
