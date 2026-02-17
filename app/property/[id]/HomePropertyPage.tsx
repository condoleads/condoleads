import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { getDisplayAgentForHome } from '@/lib/utils/agent-detection'
import { isCustomDomain } from '@/lib/utils/agent-detection'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import HomePropertyPageClient from './HomePropertyPageClient'
import ChatWidgetWrapper from '@/components/chat/ChatWidgetWrapper'

const RESIDENTIAL_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']

export async function generateHomeMetadata({ params }: { params: { id: string } }) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const serverSupabase = createClient()

  let agentBranding: { site_title: string | null; og_image_url: string | null } | null = null
  if (isCustomDomain(host)) {
    const cleanDomain = host.replace(/^www\./, '')
    const { data } = await serverSupabase
      .from('agents').select('site_title, og_image_url')
      .eq('custom_domain', cleanDomain).eq('is_active', true).single()
    agentBranding = data
  } else {
    const parts = host.split('.')
    if (parts.length >= 3 && parts[1] === 'condoleads') {
      const { data } = await serverSupabase
        .from('agents').select('site_title, og_image_url')
        .eq('subdomain', parts[0]).eq('is_active', true).single()
      agentBranding = data
    }
  }

  const siteName = agentBranding?.site_title || 'CondoLeads'
  const ogImage = agentBranding?.og_image_url || '/og-image.jpg'

  const { data: listing } = await serverSupabase
    .from('mls_listings')
    .select('id, unparsed_address, list_price, bedrooms_total, bathrooms_total_integer, transaction_type, property_subtype, architectural_style')
    .eq('id', params.id)
    .single()

  if (!listing) return { title: 'Property Not Found' }

  const price = listing.list_price ? `$${listing.list_price.toLocaleString()}` : ''
  const beds = listing.bedrooms_total ? `${listing.bedrooms_total} Bed` : ''
  const baths = listing.bathrooms_total_integer ? `${listing.bathrooms_total_integer} Bath` : ''
  const type = listing.transaction_type === 'For Sale' ? 'For Sale' : 'For Rent'
  const style = listing.architectural_style?.[0] || listing.property_subtype || 'Home'

  const title = [listing.unparsed_address, style, price, beds, siteName].filter(Boolean).join(' | ')
  const description = `${beds} ${baths} ${style.toLowerCase()} ${type.toLowerCase()} at ${listing.unparsed_address}. ${price}. View photos, room dimensions, and get a free home estimate.`

  return {
    title,
    description,
    openGraph: {
      title, description,
      url: `https://${host}/property/${params.id}`,
      siteName, locale: 'en_CA', type: 'website',
      images: [{ url: ogImage, width: 1200, height: 630, alt: listing.unparsed_address }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

export default async function HomePropertyPage({ params }: { params: { id: string } }) {
  const supabaseServer = createClient()

  // Fetch listing
  const { data: listing, error } = await supabase
    .from('mls_listings')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !listing) notFound()

  // Verify this is a residential property
  if (!RESIDENTIAL_TYPES.includes(listing.property_subtype)) notFound()

  // Get agent
  const headersList = headers()
  const host = headersList.get('host') || ''
  const { displayAgent } = await getDisplayAgentForHome(host)
  if (!displayAgent) notFound()
  const agent = displayAgent

  // Run all independent queries in parallel
  const [
    communityResult,
    municipalityResult,
    areaResult,
    largePhotosResult,
    roomsResult,
    addressHistoryResult,
    similarResult1,
    nearbyActiveResult
  ] = await Promise.all([
    // Community
    listing.community_id
      ? supabaseServer.from('communities').select('id, name, slug, municipality_id').eq('id', listing.community_id).single()
      : Promise.resolve({ data: null }),

    // Municipality
    listing.municipality_id
      ? supabaseServer.from('municipalities').select('id, name, slug, area_id').eq('id', listing.municipality_id).single()
      : Promise.resolve({ data: null }),

    // Area
    listing.area_id
      ? supabaseServer.from('treb_areas').select('id, name, slug').eq('id', listing.area_id).single()
      : Promise.resolve({ data: null }),

    // Photos
    supabase
      .from('media')
      .select('media_url, order_number')
      .eq('listing_id', listing.id)
      .eq('variant_type', 'large')
      .order('order_number')
      .limit(20),

    // Room dimensions
    supabase
      .from('property_rooms')
      .select('*')
      .eq('listing_id', listing.id)
      .order('order_number'),

    // Address history  same address, different transactions
    supabase
      .from('mls_listings')
      .select('id, list_price, close_price, close_date, listing_contract_date, days_on_market, transaction_type, standard_status, mls_status, listing_key')
      .eq('unparsed_address', listing.unparsed_address)
      .neq('id', listing.id)
      .order('close_date', { ascending: false, nullsFirst: false })
      .order('listing_contract_date', { ascending: false })
      .limit(20),

    // Similar sold  same community + same property subtype, exact bed/bath match
    listing.community_id
      ? supabase
          .from('mls_listings')
          .select(`*, media (id, media_url, order_number, variant_type)`)
          .eq('community_id', listing.community_id)
          .eq('property_subtype', listing.property_subtype)
          .eq('transaction_type', listing.transaction_type)
          .eq('standard_status', 'Closed')
          .eq('bedrooms_total', listing.bedrooms_total)
          .neq('id', listing.id)
          .order('close_date', { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),

    // Available nearby  same community + same property subtype, active
    listing.community_id
      ? supabase
          .from('mls_listings')
          .select(`*, media (id, media_url, order_number, variant_type)`)
          .eq('community_id', listing.community_id)
          .eq('property_subtype', listing.property_subtype)
          .eq('transaction_type', listing.transaction_type)
          .eq('standard_status', 'Active')
          .eq('available_in_idx', true)
          .neq('id', listing.id)
          .order('list_price', { ascending: true })
          .limit(8)
      : Promise.resolve({ data: [] })
  ])

  const community = communityResult.data
  const municipality = municipalityResult.data
  const area = areaResult.data
  const largePhotos = largePhotosResult.data
  const rooms = roomsResult.data
  const addressHistory = addressHistoryResult.data

  // Similar sold  cascading fallback
  let similarListings = similarResult1.data || []

  // Fallback: same community + subtype, any bedrooms
  if (similarListings.length < 4 && listing.community_id) {
    const { data: moreSimilar } = await supabase
      .from('mls_listings')
      .select(`*, media (id, media_url, order_number, variant_type)`)
      .eq('community_id', listing.community_id)
      .eq('property_subtype', listing.property_subtype)
      .eq('transaction_type', listing.transaction_type)
      .eq('standard_status', 'Closed')
      .neq('id', listing.id)
      .order('close_date', { ascending: false })
      .limit(8)

    if (moreSimilar) {
      const existingIds = new Set(similarListings.map(l => l.id))
      similarListings = [...similarListings, ...moreSimilar.filter(l => !existingIds.has(l.id))]
    }
  }

  // Fallback: municipality level
  if (similarListings.length < 4 && listing.municipality_id) {
    const { data: muniSimilar } = await supabase
      .from('mls_listings')
      .select(`*, media (id, media_url, order_number, variant_type)`)
      .eq('municipality_id', listing.municipality_id)
      .eq('property_subtype', listing.property_subtype)
      .eq('transaction_type', listing.transaction_type)
      .eq('standard_status', 'Closed')
      .eq('bedrooms_total', listing.bedrooms_total)
      .neq('id', listing.id)
      .order('close_date', { ascending: false })
      .limit(8)

    if (muniSimilar) {
      const existingIds = new Set(similarListings.map(l => l.id))
      similarListings = [...similarListings, ...muniSimilar.filter(l => !existingIds.has(l.id))]
    }
  }

  // Limit and strip to thumbnails
  similarListings = similarListings.slice(0, 8).map(l => ({
    ...l,
    media: (l.media?.filter((m: any) => m.variant_type === 'thumbnail') || [])
      .sort((a: any, b: any) => (a.order_number || 999) - (b.order_number || 999))
      .slice(0, 1)
  }))

  const filteredNearby = (nearbyActiveResult.data || []).map(l => ({
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
            buildingId: '',
            buildingName: '',
            buildingAddress: '',
            listingId: listing.id,
            listingAddress: listing.unparsed_address || '',
            unitNumber: '',
            siteName: agent.site_title || agent.full_name,
            siteTagline: agent.site_tagline || 'Real Estate Specialist',
            ogImageUrl: agent.og_image_url
          })};`
        }}
      />
      <main className="min-h-screen bg-gray-50">
        <HomePropertyPageClient
          listing={listing}
          largePhotos={largePhotos || []}
          rooms={rooms || []}
          addressHistory={addressHistory || []}
          similarListings={similarListings}
          availableNearby={filteredNearby}
          isSale={isSale}
          status={status}
          isClosed={isClosed}
          agent={agent}
          community={community}
          municipality={municipality}
          area={area}
        />
      </main>
      <ChatWidgetWrapper
        agent={{
          id: agent.id,
          full_name: agent.full_name,
          ai_chat_enabled: agent.ai_chat_enabled,
          has_api_key: !!agent.anthropic_api_key,
          ai_welcome_message: agent.ai_welcome_message,
          ai_free_messages: agent.ai_free_messages
        }}
        building={null}
        listing={{ id: listing.id, unit_number: undefined, list_price: listing.list_price, bedrooms_total: listing.bedrooms_total, bathrooms_total: listing.bathrooms_total_integer }}
      />
    </>
  )
}



