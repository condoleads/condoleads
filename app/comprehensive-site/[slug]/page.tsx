import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { isPropertySlug, parsePropertySlug, isHomePropertySlug, parseHomePropertySlug } from '@/lib/utils/slugs'
import DevelopmentPage, { generateDevelopmentMetadata } from '@/app/[slug]/DevelopmentPage'
import AreaPage, { generateAreaMetadata } from '@/app/[slug]/AreaPage'
import MunicipalityPage, { generateMunicipalityMetadata } from '@/app/[slug]/MunicipalityPage'
import CommunityPage, { generateCommunityMetadata } from '@/app/[slug]/CommunityPage'
import BuildingPage, { generateMetadata as generateBuildingMetadata } from '@/app/[slug]/BuildingPage'
import PropertyPage, { generateMetadata as generatePropertyMetadata } from '@/app/property/[id]/page'
import HomePropertyPage, { generateHomeMetadata } from '@/app/property/[id]/HomePropertyPage'
import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'

// FIX: area slugs in DB have '-area' suffix (e.g. 'durham-area') but URLs are clean (e.g. '/durham')
// This helper tries the exact slug first, then falls back to slug + '-area'
async function findArea(slug: string) {
  const { data: exact } = await supabase
    .from('treb_areas').select('id, name, slug').eq('slug', slug).single()
  if (exact) return exact
  const { data: withSuffix } = await supabase
    .from('treb_areas').select('id, name, slug').eq('slug', slug + '-area').single()
  return withSuffix ?? null
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const serverSupabase = createClient()

  if (isPropertySlug(params.slug)) {
    const { mlsNumber } = parsePropertySlug(params.slug)
    if (!mlsNumber) return { title: 'Property Not Found' }
    const { data: listing } = await serverSupabase
      .from('mls_listings').select('id').eq('listing_key', mlsNumber).single()
    if (!listing) return { title: 'Property Not Found' }
    return generatePropertyMetadata({ params: { id: listing.id } })
  }

  if (isHomePropertySlug(params.slug)) {
    const { mlsNumber: homeMls } = parseHomePropertySlug(params.slug)
    if (!homeMls) return { title: 'Property Not Found' }
    const { data: homeListing } = await serverSupabase
      .from('mls_listings').select('id').eq('listing_key', homeMls).single()
    if (!homeListing) return { title: 'Property Not Found' }
    return generateHomeMetadata({ params: { id: homeListing.id } })
  }

  const { data: development } = await serverSupabase
    .from('developments').select('id, name, slug').eq('slug', params.slug).single()
  if (development) return generateDevelopmentMetadata(development)

  // FIX: use fallback helper for area lookup
  const area = await findArea(params.slug)
  if (area) return generateAreaMetadata(area)

  const { data: municipality } = await serverSupabase
    .from('municipalities').select('id, name, slug, area_id').eq('slug', params.slug).single()
  if (municipality) return generateMunicipalityMetadata(municipality)

  const { data: community } = await serverSupabase
    .from('communities').select('id, name, slug, municipality_id').eq('slug', params.slug).single()
  if (community) return generateCommunityMetadata(community)

  return generateBuildingMetadata({ params })
}

export default async function ComprehensiveSlugPage({
  params
}: {
  params: { slug: string }
}) {
  // Property URL
  if (isPropertySlug(params.slug)) {
    const { mlsNumber } = parsePropertySlug(params.slug)
    if (!mlsNumber) notFound()
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const serverSupabase = createServerClient()
    const { data: listing, error } = await serverSupabase
      .from('mls_listings').select('id').eq('listing_key', mlsNumber).single()
    if (!listing) notFound()
    return <PropertyPage params={{ id: listing.id }} />
  }

  // Home Property URL
  if (isHomePropertySlug(params.slug)) {
    const { mlsNumber: homeMls } = parseHomePropertySlug(params.slug)
    if (!homeMls) notFound()
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const homeSupabase = createServerClient()
    const { data: homeListing } = await homeSupabase
      .from('mls_listings').select('id').eq('listing_key', homeMls).single()
    if (!homeListing) notFound()
    return <HomePropertyPage params={{ id: homeListing.id }} />
  }

  // Development
  const { data: development } = await supabase
    .from('developments').select('id, name, slug').eq('slug', params.slug).single()
  if (development) return <DevelopmentPage params={params} development={development} />

  // FIX: Area — try exact slug first, then slug + '-area'
  const area = await findArea(params.slug)
  if (area) return <AreaPage area={area} />

  // Municipality
  const { data: municipality } = await supabase
    .from('municipalities').select('id, name, slug, area_id').eq('slug', params.slug).single()
  if (municipality) return <MunicipalityPage municipality={municipality} />

  // Community
  const { data: community } = await supabase
    .from('communities').select('id, name, slug, municipality_id').eq('slug', params.slug).single()
  if (community) return <CommunityPage community={community} />

  // Building
  return <BuildingPage params={params} />
}