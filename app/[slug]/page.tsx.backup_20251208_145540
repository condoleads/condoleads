import { notFound } from 'next/navigation'
import { isPropertySlug, parsePropertySlug } from '@/lib/utils/slugs'
import BuildingPage from './BuildingPage'
import PropertyPage from '../property/[id]/page'
import { supabase } from '@/lib/supabase/client'

export { generateMetadata } from './BuildingPage'

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

    // Lookup property ID by MLS number
    const { data: listing } = await supabase
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

  // Building URL: /x2-condos-101-charles-st-e-toronto
  return <BuildingPage params={params} />
}
