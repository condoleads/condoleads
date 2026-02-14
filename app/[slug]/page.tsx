import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { isPropertySlug, parsePropertySlug, isHomePropertySlug, parseHomePropertySlug } from '@/lib/utils/slugs'
import DevelopmentPage, { generateDevelopmentMetadata } from './DevelopmentPage'
import AreaPage, { generateAreaMetadata } from './AreaPage'
import MunicipalityPage, { generateMunicipalityMetadata } from './MunicipalityPage'
import CommunityPage, { generateCommunityMetadata } from './CommunityPage'
import BuildingPage, { generateMetadata as generateBuildingMetadata } from './BuildingPage'
import PropertyPage, { generateMetadata as generatePropertyMetadata } from '../property/[id]/page'
import HomePropertyPage, { generateHomeMetadata } from '../property/[id]/HomePropertyPage'
import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  const serverSupabase = createClient()

  // Check if it's a property slug first
  if (isPropertySlug(params.slug)) {
    const { mlsNumber } = parsePropertySlug(params.slug)
    if (!mlsNumber) {
      return { title: 'Property Not Found' }
    }
    
     
    // Query listing ID only
    const { data: listing } = await serverSupabase
      .from('mls_listings')
      .select('id')
      .eq('listing_key', mlsNumber)
      .single()
    
    if (!listing) {
      return { title: 'Property Not Found' }
    }
    // Reuse property page metadata
    return generatePropertyMetadata({ params: { id: listing.id } })
  }


  // Check if it's a home property slug (e.g., 123-main-street-burlington-w12569682)
  if (isHomePropertySlug(params.slug)) {
    const { mlsNumber: homeMls } = parseHomePropertySlug(params.slug)
    if (!homeMls) return { title: 'Property Not Found' }
    const { data: homeListing } = await serverSupabase
      .from('mls_listings').select('id').eq('listing_key', homeMls).single()
    if (!homeListing) return { title: 'Property Not Found' }
    return generateHomeMetadata({ params: { id: homeListing.id } })
  }

  // Check if it's a development slug
    const { data: development } = await serverSupabase
    .from('developments')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (development) {
    return generateDevelopmentMetadata(development)
  }

  // Check if it's an area slug
  const { data: area } = await serverSupabase
    .from('treb_areas')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (area) {
    return generateAreaMetadata(area)
  }

  // Check if it's a municipality slug
  const { data: municipality } = await serverSupabase
    .from('municipalities')
    .select('id, name, slug, area_id')
    .eq('slug', params.slug)
    .single()

  if (municipality) {
    return generateMunicipalityMetadata(municipality)
  }

  // Check if it's a community slug
  const { data: community } = await serverSupabase
    .from('communities')
    .select('id, name, slug, municipality_id')
    .eq('slug', params.slug)
    .single()

  if (community) {
    return generateCommunityMetadata(community)
  }

  // Fall back to building metadata
  return generateBuildingMetadata({ params })
}

export default async function DynamicSlugPage({
  params
}: {
  params: { slug: string }
}) {
    // Property URL: /101-charles-st-e-unit-2503-c7351578
    if (isPropertySlug(params.slug)) {
      const { mlsNumber } = parsePropertySlug(params.slug)
      if (!mlsNumber) {
        notFound()
      }
      // Lookup property ID by MLS number (use server supabase and case-insensitive match)
      const { createClient } = await import('@/lib/supabase/server')
      const serverSupabase = createClient()
      const { data: listing } = await serverSupabase
        .from('mls_listings')
        .select('id')
        .eq('listing_key', mlsNumber)
        .single()

      if (!listing) {
        notFound()
      }
      // Render property page with the found ID
      return <PropertyPage params={{ id: listing.id }} />
    }


  // Home Property URL: /123-main-street-burlington-w12569682
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

  // Check if it's a development slug
  const { data: development } = await supabase
    .from('developments')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (development) {
    // Development URL: /playground-condos-30-50-ordnance-st-toronto
    return <DevelopmentPage params={params} development={development} />
  }

  // Check if it's an area slug
  const { data: area } = await supabase
    .from('treb_areas')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()

  if (area) {
    return <AreaPage area={area} />
  }

  // Check if it's a municipality slug
  const { data: municipality } = await supabase
    .from('municipalities')
    .select('id, name, slug, area_id')
    .eq('slug', params.slug)
    .single()

  if (municipality) {
    return <MunicipalityPage municipality={municipality} />
  }

  // Check if it's a community slug
  const { data: community } = await supabase
    .from('communities')
    .select('id, name, slug, municipality_id')
    .eq('slug', params.slug)
    .single()

  if (community) {
    return <CommunityPage community={community} />
  }

  // Building URL: /x2-condos-101-charles-st-e-toronto
  return <BuildingPage params={params} />
}



