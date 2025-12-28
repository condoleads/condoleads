import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { isPropertySlug, parsePropertySlug } from '@/lib/utils/slugs'
import BuildingPage, { generateMetadata as generateBuildingMetadata } from './BuildingPage'
import DevelopmentPage, { generateDevelopmentMetadata } from './DevelopmentPage'
import PropertyPage from '../property/[id]/page'
import { supabase } from '@/lib/supabase/client'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const headersList = headers()
  const host = headersList.get('host') || ''
  
  // Check if it's a property slug first
  if (isPropertySlug(params.slug)) {
    const { mlsNumber } = parsePropertySlug(params.slug)
    if (!mlsNumber) {
      return { title: 'Property Not Found' }
    }
    
    // Query listing (using client supabase - no RLS on mls_listings)
    const { data: listing } = await supabase
      .from('mls_listings')
      .select('id, unparsed_address, list_price, bedrooms_total, bathrooms_total, transaction_type, building_id, unit_number')
      .eq('listing_key', mlsNumber)
      .single()
    
    if (!listing) {
      return { title: 'Property Not Found' }
    }
    
    // Get siteName
    let siteName = 'CondoLeads'
    if (!host.includes('condoleads.ca') && !host.includes('localhost') && !host.includes('vercel.app')) {
      const cleanDomain = host.replace(/^www\./, '')
      const { data: agent } = await supabase
        .from('agents')
        .select('site_title')
        .eq('custom_domain', cleanDomain)
        .eq('is_active', true)
        .single()
      if (agent?.site_title) siteName = agent.site_title
    } else if (host.includes('.condoleads.ca')) {
      const subdomain = host.split('.')[0]
      const { data: agent } = await supabase
        .from('agents')
        .select('site_title')
        .eq('subdomain', subdomain)
        .eq('is_active', true)
        .single()
      if (agent?.site_title) siteName = agent.site_title
    }
    
    // Get building name
    const { data: building } = await supabase
      .from('buildings')
      .select('building_name')
      .eq('id', listing.building_id)
      .single()
    
    const price = listing.list_price ? `$${listing.list_price.toLocaleString()}` : ''
    const beds = listing.bedrooms_total ? `${listing.bedrooms_total} Bed` : ''
    const unit = listing.unit_number ? `Unit ${listing.unit_number}` : ''
    
    const titleParts = [listing.unparsed_address, unit, building?.building_name, price, beds, siteName].filter(Boolean)
    const title = titleParts.join(' | ')
    const description = `${beds} condo at ${listing.unparsed_address}${building ? ` in ${building.building_name}` : ''}. ${price}. View photos and schedule a showing.`
    
    return { title, description }
  }
  
  // Check if it's a development slug
  const serverSupabase = createClient()
  const { data: development } = await serverSupabase
    .from('developments')
    .select('id, name, slug')
    .eq('slug', params.slug)
    .single()
  
  if (development) {
    return generateDevelopmentMetadata(development)
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

  // Building URL: /x2-condos-101-charles-st-e-toronto
  return <BuildingPage params={params} />
}