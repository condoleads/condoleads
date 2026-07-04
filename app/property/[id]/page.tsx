import { supabase } from '@/lib/supabase/client'
import { createClient, createServerClient } from '@/lib/supabase/server'
import { getDisplayAgentForBuilding, isCustomDomain } from '@/lib/utils/agent-detection'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import PropertyPageClient from './PropertyPageClient'
import ListingSchema from './components/ListingSchema'
import BreadcrumbSchema from '@/components/BreadcrumbSchema'
import { createClient as createTenantClient } from '@/lib/supabase/server'
import { getTenantByHost } from '@/lib/utils/tenant-brand'
import ChatWidgetWrapper from '@/components/chat/ChatWidgetWrapper'
import { getListingInvestmentData } from '@/lib/market/get-listing-investment-data'
import WalliamCTA from '@/components/WalliamCTA'
import { getCurrentTenantId, isHeroTenant } from '@/lib/utils/tenant-resolver'
import WalliamAgentCard from '@/components/WalliamAgentCard'
import WalliamContactForm from '@/components/WalliamContactForm'

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
    .select('id, unparsed_address, list_price, bedrooms_total, bathrooms_total_integer, transaction_type, building_id, unit_number')
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
  const baths = listing.bathrooms_total_integer ? `${listing.bathrooms_total_integer} Bath` : ''
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
  // W-MARKETING A-UNIT-1b (2026-07-01): dual-URL defense — the /property/[UUID]
  // route + the /[slug] route both serve the same listing. Canonical points
  // Google at the slug URL (SEO-friendly, address+MLS embedded) so index
  // consolidation is deterministic.
  const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
  const { generatePropertySlug } = await import('@/lib/utils/slugs')
  const canonicalDomain = await resolveCanonicalHost()
  const slug = generatePropertySlug(listing)
  // Guard: fall through to raw UUID URL only if slug-gen fell back (missing
  // listing_key). Never point canonical at a nonexistent slug.
  const canonicalPath = slug && !slug.startsWith('/property/') ? slug : `/property/${params.id}`

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
    alternates: {
      canonical: `https://${canonicalDomain}${canonicalPath}`,
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
  // WALLiam fallback ΓÇö resolve agent from tenant if no display agent
  // W-TENANT-HERO-BIAS-SWEEP T1.1 (2026-06-23): dynamic tenant-neutral
  // agent resolution for ANY tenant (not just hero). Was: can_create_children
  // heuristic via .single() that ambiguates when a tenant has multiple
  // managers (Aily admin + manager both have can_create_children=true ->
  // .single() errors -> page 404s). Now: resolveAgentForContext with the
  // full listing -> building -> community -> municipality -> area context,
  // mirroring the 5 geo pages from W-AILY-ESTIMATOR-GAP. System 1 path
  // (displayAgent non-null OR tenantId null) preserved by the
  // outer/inner guards. Agent hydration uses .maybeSingle() so a stale
  // resolved id falls to notFound() instead of throwing 500.
  let agent: any = displayAgent
  if (!agent) {
    const tenantId = await getCurrentTenantId()
    if (tenantId) {
      const { resolveAgentForContext } = await import('@/lib/utils/tenant-resolver')
      const resolvedAgentId = await resolveAgentForContext({
        listing_id: listing.id,
        building_id: listing.building_id,
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
  if (!agent) notFound()


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
    .order('order_number')
    .limit(50),

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
      .in('standard_status', ['Active', 'Active Under Contract', 'Pending'])
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

  const largePhotos = (() => {
  const raw = largePhotosResult.data || []
  const seen = new Set<string>()
  return raw.filter(p => {
    if (seen.has(p.media_url)) return false
    seen.add(p.media_url)
    return true
  }).slice(0, 20)
})()
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

  // WALLiam detection
  const tenantId = await getCurrentTenantId()
  const isHero = await isHeroTenant()

  // C8a/D13 -- tenant for assistantName threading
  const _c8a_host = headers().get('host')
  const _c8a_supabase = createTenantClient()
  const _c8a_tenant = await getTenantByHost(_c8a_supabase, _c8a_host)
  const assistantName = _c8a_tenant?.name || 'Charlie'
  // W-AILY-CTA-BRAND-LEAK (2026-06-23): brandName + wordmarkStyle for the
  // per-tenant WalliamCTA wordmark. Threaded to PropertyPageClient.
  const brandName     = _c8a_tenant?.brandName     || 'Brand'
  const wordmarkStyle = _c8a_tenant?.wordmarkStyle || 'standard'

  // W-FUNNEL §9.2 Step 5: chatHasApiKey block from Step 2 removed -- Step 3's
  // gate (!isHero && !tenantId) means ChatWidgetWrapper renders only on
  // System 1 (tenantId null). The System-2 tenant-key branch was provably
  // unreachable; the prop is read straight from the agent row again.

  // A-UNIT-2 Phase 1 (2026-07-04): resolve the canonical URL for the
  // RealEstateListing JSON-LD's `url` field so it matches the metadata
  // canonical alternate (index-consolidation guidance). Reuses the same
  // helpers that generateMetadata already uses at the top of this file.
  const _canonical = await (async () => {
    const { resolveCanonicalHost } = await import('@/lib/utils/canonical')
    const { generatePropertySlug } = await import('@/lib/utils/slugs')
    const domain = await resolveCanonicalHost()
    const s = generatePropertySlug(listing)
    const path = s && !s.startsWith('/property/') ? s : `/property/${params.id}`
    return { domain, url: `https://${domain}${path}` }
  })()

  // A-UNIT-2 Phase 2 (2026-07-04): fetch area / muni / community
  // name+slug from the listing FKs so BreadcrumbList JSON-LD has a full
  // ancestor chain. Mirrors HomePropertyPage's pattern (lines 145-155).
  // FK population VERIFIED (this session, Active listings): community
  // 96.2%, muni 99.9%, area 99.9%. When any FK is null → level dropped
  // (never fabricated).
  const [_areaRes, _muniRes, _communityRes] = await Promise.all([
    listing.area_id
      ? supabase.from('treb_areas').select('id, name, slug').eq('id', listing.area_id).single()
      : Promise.resolve({ data: null } as any),
    listing.municipality_id
      ? supabase.from('municipalities').select('id, name, slug').eq('id', listing.municipality_id).single()
      : Promise.resolve({ data: null } as any),
    listing.community_id
      ? supabase.from('communities').select('id, name, slug').eq('id', listing.community_id).single()
      : Promise.resolve({ data: null } as any),
  ])
  const _area = _areaRes?.data as { name: string; slug: string } | null
  const _muni = _muniRes?.data as { name: string; slug: string } | null
  const _community = _communityRes?.data as { name: string; slug: string } | null

  // A-UNIT-2 Phase 2: build breadcrumb items — drop levels whose
  // FK/slug/name is null. URLs match sitemap canonicals byte-for-byte.
  const _breadcrumbItems = [] as { name: string; url: string }[]
  if (_area?.name && _area.slug) {
    _breadcrumbItems.push({ name: _area.name, url: `https://${_canonical.domain}/${_area.slug}` })
  }
  if (_muni?.name && _muni.slug) {
    _breadcrumbItems.push({ name: _muni.name, url: `https://${_canonical.domain}/${_muni.slug}` })
  }
  if (_community?.name && _community.slug) {
    _breadcrumbItems.push({ name: _community.name, url: `https://${_canonical.domain}/${_community.slug}` })
  }
  if (building?.slug && building.building_name) {
    _breadcrumbItems.push({ name: building.building_name, url: `https://${_canonical.domain}/${building.slug}` })
  }
  const _selfLabel = listing.unit_number ? `Unit ${listing.unit_number}` : (listing.unparsed_address?.split(',')[0]?.trim() || 'Listing')
  _breadcrumbItems.push({ name: _selfLabel, url: _canonical.url })

  return (
    <>
      {/* A-UNIT-2 Phase 1: RealEstateListing JSON-LD. Gated on
          isSeoEnabledTenant() inside the component — emits for aily
          (seo_enabled=true), returns null for walliam (seo_enabled=false)
          and non-tenant hosts. Zero new DB queries — reuses listing,
          building, largePhotos already in scope. */}
      <ListingSchema
        listing={listing}
        building={building}
        photos={largePhotos || []}
        canonicalUrl={_canonical.url}
      />
      {/* A-UNIT-2 Phase 2: BreadcrumbList JSON-LD. Chain
          Home > Area > Muni > Community > Building > Unit — each level
          dropped if its slug/name is null. */}
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
    assistantName={assistantName}
        brandName={brandName}
        wordmarkStyle={wordmarkStyle}
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
        agent={isHero ? null : agent}
        building={building}
        development={development}
        investmentData={investmentData}
        isHero={isHero}
        walliamTenantId={tenantId}
        walliamAgentId={agent?.id ?? null}
        />
    </main>
    {/* W-FUNNEL §9.2 Step 3: System 2 uses CharlieWidget (global, ConditionalLayout); System 1 keeps ChatWidgetWrapper. */}
    {!isHero && !tenantId && (
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
      listing={{ id: listing.id, unit_number: listing.unit_number, list_price: listing.list_price, bedrooms_total: listing.bedrooms_total, bathrooms_total: listing.bathrooms_total_integer }}
    />
    )}
    </>
  )
}