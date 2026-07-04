import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'
import { getDisplayAgentForHome } from '@/lib/utils/agent-detection'
import { isCustomDomain } from '@/lib/utils/agent-detection'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import HomePropertyPageClient from './HomePropertyPageClient'
import ListingSchema from './components/ListingSchema'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'
import ChatWidgetWrapper from '@/components/chat/ChatWidgetWrapper'
import WalliamCTA from '@/components/WalliamCTA'
import { getCurrentTenantId, isHeroTenant } from '@/lib/utils/tenant-resolver'

const RESIDENTIAL_TYPES = ['Detached', 'Semi-Detached', 'Att/Row/Townhouse', 'Link', 'Duplex', 'Triplex', 'Fourplex', 'Multiplex']

export const dynamic = 'force-dynamic'

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
    .select('id, unparsed_address, list_price, bedrooms_total, bathrooms_total_integer, transaction_type, property_subtype, architectural_style, listing_key, street_number, street_name')
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

  // W-MARKETING A-UNIT-1b (2026-07-01): dual-URL defense — /property/[UUID]
  // canonicals to the slug URL (SEO-friendly, address+MLS embedded).
  const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
  const { generateHomePropertySlug } = await import('@/lib/utils/slugs')
  const canonicalDomain = await resolveCanonicalHost()
  const slug = generateHomePropertySlug(listing)
  const canonicalPath = slug && !slug.startsWith('/property/') ? slug : `/property/${params.id}`

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
    alternates: {
      canonical: `https://${canonicalDomain}${canonicalPath}`,
    },
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

  console.log('[HomePropertyPage] listing check:', { id: params.id, found: !!listing, error: error?.message })
  if (error || !listing) notFound()

  // Verify this is a residential property
  if (!RESIDENTIAL_TYPES.includes(listing.property_subtype)) notFound()

  // Get agent
  const headersList = headers()
  const host = headersList.get('host') || ''
  const { displayAgent } = await getDisplayAgentForHome(host)
  // WALLiam fallback — resolve agent from tenant if no display agent
  // W-TENANT-HERO-BIAS-SWEEP T1.1 (2026-06-23): dynamic tenant-neutral
  // agent resolution (see app/property/[id]/page.tsx for full rationale).
  // System 1 path preserved by displayAgent-non-null / tenantId-null guards.
  // Agent hydration uses .maybeSingle() so a stale id falls to notFound().
  let agent: any = displayAgent
  if (!agent) {
    const tenantId = await getCurrentTenantId()
    if (tenantId) {
      const { resolveAgentForContext } = await import('@/lib/utils/tenant-resolver')
      const resolvedAgentId = await resolveAgentForContext({
        listing_id: listing.id,
        community_id: listing.community_id || null,
        municipality_id: listing.municipality_id || null,
        area_id: listing.area_id || null,
        tenant_id: tenantId,
      })
      if (resolvedAgentId) {
        const { createClient: _sc } = await import('@supabase/supabase-js')
        const _db = _sc(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
        const { data: resolvedAgent } = await _db.from('agents').select('*').eq('id', resolvedAgentId).maybeSingle()
        if (resolvedAgent) agent = resolvedAgent
      }
    }
  }
  console.log('[HomePropertyPage] agent check:', { agent: !!agent, host })
  if (!agent) notFound()

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
          .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
          .eq('available_in_idx', true)
          .gt('list_price', 100000)  // h2 F-PLEX-TILE-JUNK-PRICE: exclude $1 call-for-price placeholders
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
  const tenantId = await getCurrentTenantId()
  const isHero = await isHeroTenant()
  const isClosed = listing.standard_status === 'Closed'
  const status = isClosed ? 'Closed' : 'Active'

  // C8a/D13 -- tenant for assistantName threading
  const _c8a_host = headers().get('host')
  const _c8a_supabase = createTenantClient()
  const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)
  const assistantName = _c8a_tenant?.name || 'Charlie'
  // W-AILY-CTA-BRAND-LEAK (2026-06-23): brandName + wordmarkStyle for the
  // per-tenant WalliamCTA wordmark. Threaded to HomePropertyPageClient.
  const brandName     = _c8a_tenant?.brandName     || 'Brand'
  const wordmarkStyle = _c8a_tenant?.wordmarkStyle || 'standard'

  // W-FUNNEL §9.2 Step 5: chatHasApiKey block from Step 2 removed -- Step 3's
  // gate (!isHero && !tenantId) means ChatWidgetWrapper renders only on
  // System 1 (tenantId null). The System-2 tenant-key branch was provably
  // unreachable; the prop is read straight from the agent row again.

  // A-UNIT-2 Phase 2 (2026-07-04): resolve canonical URL for JSON-LD
  // emitters (ListingSchema, BreadcrumbSchema). Reuses the same helpers
  // generateMetadata already uses at the top of this file. Home-specific
  // slug builder.
  const _canonical = await (async () => {
    const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
    const { generateHomePropertySlug } = await import('@/lib/utils/slugs')
    const domain = await resolveCanonicalHost()
    const s = generateHomePropertySlug(listing)
    const path = s && !s.startsWith('/property/') ? s : `/property/${params.id}`
    return { domain, url: `https://${domain}${path}` }
  })()

  // A-UNIT-2 Phase 2: breadcrumb items from in-scope area / muni /
  // community (all fetched at lines 145/150/155). Drop levels whose
  // FK/slug is null — never fabricate.
  const _breadcrumbItems = [] as { name: string; url: string }[]
  if (area && area.name && area.slug) {
    _breadcrumbItems.push({ name: area.name, url: `https://${_canonical.domain}/${area.slug}` })
  }
  if (municipality && municipality.name && municipality.slug) {
    _breadcrumbItems.push({ name: municipality.name, url: `https://${_canonical.domain}/${municipality.slug}` })
  }
  if (community && community.name && community.slug) {
    _breadcrumbItems.push({ name: community.name, url: `https://${_canonical.domain}/${community.slug}` })
  }
  // Self crumb — label is the short address; URL is the canonical listing URL.
  const _selfLabel = listing.unparsed_address?.split(',')[0]?.trim() || 'Listing'
  _breadcrumbItems.push({ name: _selfLabel, url: _canonical.url })

  return (
    <>
      {/* A-UNIT-2 Phase 2: RealEstateListing JSON-LD (Rule Zero coverage
          fix — home listings now also emit schema). Gated by
          isSeoEnabledTenant() inside the component. building=null on
          home listings (freehold); component null-guards. */}
      <ListingSchema
        listing={listing}
        building={null}
        photos={largePhotos || []}
        canonicalUrl={_canonical.url}
      />
      {/* A-UNIT-2 Phase 2: BreadcrumbList JSON-LD. Full chain in scope from
          the existing area/muni/community joins. */}
      <BreadcrumbSchema
        items={_breadcrumbItems}
        homeUrl={`https://${_canonical.domain}/`}
      />
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
    assistantName={assistantName}
          brandName={brandName}
          wordmarkStyle={wordmarkStyle}
          listing={listing}
          largePhotos={largePhotos || []}
          rooms={rooms || []}
          addressHistory={addressHistory || []}
          similarListings={similarListings}
          availableNearby={filteredNearby}
          isSale={isSale}
          status={status}
          isClosed={isClosed}
          agent={isHero ? null : agent}
          community={community}
          municipality={municipality}
          area={area}
          isHero={isHero}
          walliamTenantId={tenantId}
          walliamAgentId={agent?.id ?? null}
        />
      </main>
      {/* W-FUNNEL §9.2 Step 3: System 2 uses CharlieWidget (global, ConditionalLayout); System 1 keeps ChatWidgetWrapper. */}
      {!isHero && !tenantId && <ChatWidgetWrapper
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
      />}
    </>
  )
}



