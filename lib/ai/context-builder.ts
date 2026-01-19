// lib/ai/context-builder.ts
import { createClient } from '@/lib/supabase/server'

export interface MarketContext {
  building?: {
    name: string
    address: string
    communityName: string | null
    municipalityName: string | null
    saleAvgPsf: number | null
    leaseAvgPsf: number | null
    grossYield: number | null
    netYield: number | null
    avgMaintenance: number | null
    avgTax: number | null
    parkingSale: number | null
    parkingLease: number | null
    lockerSale: number | null
    lockerLease: number | null
    transactionCount: number
    saleCount: number
    leaseCount: number
  }
  community?: {
    name: string
    saleAvgPsf: number | null
    leaseAvgPsf: number | null
    grossYield: number | null
  }
  municipality?: {
    name: string
    saleAvgPsf: number | null
    leaseAvgPsf: number | null
    grossYield: number | null
  }
  listing?: {
    mlsNumber: string
    price: number
    sqft: number | null
    psf: number | null
    bedrooms: number
    bathrooms: number
    maintenance: number | null
    propertyTax: number | null
    estimatedRent: number | null
    grossYield: number | null
  }
}

export async function getBuildingMarketContext(buildingId: string): Promise<MarketContext['building'] | null> {
  const supabase = createClient()
  
  // Get building details with geographic hierarchy
  const { data: building } = await supabase
    .from('buildings')
    .select(`
      building_name,
      canonical_address,
      community_id,
      communities (
        name,
        municipality_id,
        municipalities (
          name
        )
      )
    `)
    .eq('id', buildingId)
    .single()

  if (!building) return null

  // Get building PSF summary
  const { data: psfSummary } = await supabase
    .from('building_psf_summary')
    .select('sale_avg_psf, lease_avg_psf, sale_count, lease_count')
    .eq('building_id', buildingId)
    .single()

  // Get building average expenses
  const { data: expenses } = await supabase
    .from('mls_listings')
    .select('association_fee, tax_annual_amount')
    .eq('building_id', buildingId)
    .not('association_fee', 'is', null)

  let avgMaintenance: number | null = null
  let avgTax: number | null = null
  
  if (expenses && expenses.length > 0) {
    const maintVals = expenses.map(e => parseFloat(e.association_fee)).filter(v => !isNaN(v))
    const taxVals = expenses.map(e => parseFloat(e.tax_annual_amount)).filter(v => !isNaN(v))
    if (maintVals.length > 0) avgMaintenance = Math.round(maintVals.reduce((a, b) => a + b, 0) / maintVals.length)
    if (taxVals.length > 0) avgTax = Math.round(taxVals.reduce((a, b) => a + b, 0) / taxVals.length)
  }

  // Get parking values from buildings table directly
  const { data: buildingParking } = await supabase
    .from('buildings')
    .select('parking_value_sale, parking_value_lease, locker_value_sale, locker_value_lease')
    .eq('id', buildingId)
    .single()

  // Calculate yields
  const saleAvgPsf = psfSummary?.sale_avg_psf ? parseFloat(psfSummary.sale_avg_psf) : null
  const leaseAvgPsf = psfSummary?.lease_avg_psf ? parseFloat(psfSummary.lease_avg_psf) : null
  
  let grossYield: number | null = null
  let netYield: number | null = null
  
  if (saleAvgPsf && leaseAvgPsf) {
    grossYield = parseFloat(((leaseAvgPsf * 12 / saleAvgPsf) * 100).toFixed(2))
  }

  return {
    name: building.building_name,
    address: building.canonical_address,
    communityName: (building.communities as any)?.name || null,
    municipalityName: (building.communities as any)?.municipalities?.name || null,
    saleAvgPsf,
    leaseAvgPsf,
    grossYield,
    netYield,
    avgMaintenance,
    avgTax,
    parkingSale: buildingParking?.parking_value_sale ? parseFloat(buildingParking.parking_value_sale) : null,
    parkingLease: buildingParking?.parking_value_lease ? parseFloat(buildingParking.parking_value_lease) : null,
    lockerSale: buildingParking?.locker_value_sale ? parseFloat(buildingParking.locker_value_sale) : null,
    lockerLease: buildingParking?.locker_value_lease ? parseFloat(buildingParking.locker_value_lease) : null,
    transactionCount: (psfSummary?.sale_count || 0) + (psfSummary?.lease_count || 0),
    saleCount: psfSummary?.sale_count || 0,
    leaseCount: psfSummary?.lease_count || 0
  }
}

export async function getCommunityMarketContext(communityId: string): Promise<MarketContext['community'] | null> {
  const supabase = createClient()
  
  const { data: community } = await supabase
    .from('communities')
    .select('name')
    .eq('id', communityId)
    .single()

  if (!community) return null

  // Get latest PSF data
  const { data: salePsf } = await supabase
    .from('psf_monthly_sale')
    .select('all_avg_psf')
    .eq('community_id', communityId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(1)
    .single()

  const { data: leasePsf } = await supabase
    .from('psf_monthly_lease')
    .select('all_avg_psf')
    .eq('community_id', communityId)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(1)
    .single()

  const saleAvgPsf = salePsf?.all_avg_psf ? parseFloat(salePsf.all_avg_psf) : null
  const leaseAvgPsf = leasePsf?.all_avg_psf ? parseFloat(leasePsf.all_avg_psf) : null
  
  let grossYield: number | null = null
  if (saleAvgPsf && leaseAvgPsf) {
    grossYield = parseFloat(((leaseAvgPsf * 12 / saleAvgPsf) * 100).toFixed(2))
  }

  return {
    name: community.name,
    saleAvgPsf,
    leaseAvgPsf,
    grossYield
  }
}

export async function getListingMarketContext(listingId: string, buildingContext?: MarketContext['building']): Promise<MarketContext['listing'] | null> {
  const supabase = createClient()
  
  const { data: listing } = await supabase
    .from('mls_listings')
    .select(`
      mls_number,
      list_price,
      close_price,
      calculated_sqft,
      living_area_range,
      bedrooms_total,
      bathrooms_total,
      association_fee,
      tax_annual_amount
    `)
    .eq('id', listingId)
    .single()

  if (!listing) return null

  const price = listing.close_price || listing.list_price
  let sqft: number | null = listing.calculated_sqft ? parseFloat(listing.calculated_sqft) : null
  
  // Estimate sqft from range if not available
  if (!sqft && listing.living_area_range) {
    const match = listing.living_area_range.match(/(\d+)-(\d+)/)
    if (match) sqft = (parseInt(match[1]) + parseInt(match[2])) / 2
  }

  const psf = price && sqft ? Math.round(price / sqft) : null
  const maintenance = listing.association_fee ? parseFloat(listing.association_fee) : null
  const propertyTax = listing.tax_annual_amount ? parseFloat(listing.tax_annual_amount) : null

  // Estimate rent from building lease PSF
  let estimatedRent: number | null = null
  let grossYield: number | null = null
  
  if (buildingContext?.leaseAvgPsf && sqft) {
    estimatedRent = Math.round(buildingContext.leaseAvgPsf * sqft)
    if (price) {
      grossYield = parseFloat(((estimatedRent * 12 / price) * 100).toFixed(2))
    }
  }

  return {
    mlsNumber: listing.mls_number,
    price,
    sqft,
    psf,
    bedrooms: listing.bedrooms_total || 0,
    bathrooms: listing.bathrooms_total || 0,
    maintenance,
    propertyTax,
    estimatedRent,
    grossYield
  }
}

export function buildMarketDataPrompt(context: MarketContext): string {
  let prompt = '\n\n## REAL MARKET DATA (Use this to answer questions accurately)\n'

  if (context.building) {
    const b = context.building
    prompt += `
### Building: ${b.name}
- Address: ${b.address}
- Community: ${b.communityName || 'N/A'}
- Municipality: ${b.municipalityName || 'N/A'}

**PRICING DATA (USE THIS!):**
- Average Sale PSF: ${b.saleAvgPsf ? `$${Math.round(b.saleAvgPsf)}/sqft` : 'N/A'} (based on ${b.saleCount} sales)
- Average Lease PSF: ${b.leaseAvgPsf ? `$${b.leaseAvgPsf.toFixed(2)}/sqft/month` : 'N/A'} (based on ${b.leaseCount} leases)
- Gross Yield: ${b.grossYield ? `${b.grossYield}%` : 'N/A'}

**CARRYING COSTS:**
- Avg Maintenance Fee: ${b.avgMaintenance ? `$${b.avgMaintenance}/month` : 'N/A'}
- Avg Property Tax: ${b.avgTax ? `$${b.avgTax}/year` : 'N/A'}

**PARKING & LOCKER:**
- Parking Sale Value: ${b.parkingSale ? `$${b.parkingSale.toLocaleString()}` : 'Data not available'}
- Parking Lease Value: ${b.parkingLease ? `$${b.parkingLease}/month` : 'Data not available'}
- Locker Sale Value: ${b.lockerSale ? `$${b.lockerSale.toLocaleString()}` : 'Data not available'}
- Locker Lease Value: ${b.lockerLease ? `$${b.lockerLease}/month` : 'Data not available'}

- Total Transactions Analyzed: ${b.transactionCount}
`
  }

  if (context.community) {
    const c = context.community
    prompt += `
### Community: ${c.name}
- Average Sale PSF: ${c.saleAvgPsf ? `$${c.saleAvgPsf.toLocaleString()}/sqft` : 'N/A'}
- Average Lease PSF: ${c.leaseAvgPsf ? `$${c.leaseAvgPsf.toFixed(2)}/sqft/month` : 'N/A'}
- Gross Yield: ${c.grossYield ? `${c.grossYield}%` : 'N/A'}
`
  }

  if (context.listing) {
    const l = context.listing
    prompt += `
### This Listing: ${l.mlsNumber}
- Price: $${l.price.toLocaleString()}
- Size: ${l.sqft ? `${l.sqft} sqft` : 'N/A'}
- Price/sqft: ${l.psf ? `$${l.psf}/sqft` : 'N/A'}
- Bedrooms: ${l.bedrooms} | Bathrooms: ${l.bathrooms}
- Maintenance: ${l.maintenance ? `$${l.maintenance}/month` : 'N/A'}
- Property Tax: ${l.propertyTax ? `$${l.propertyTax}/year` : 'N/A'}
- Estimated Monthly Rent: ${l.estimatedRent ? `$${l.estimatedRent.toLocaleString()}` : 'N/A'}
- Estimated Gross Yield: ${l.grossYield ? `${l.grossYield}%` : 'N/A'}
`
  }

  prompt += `
### Guidelines for Using This Data
- Always cite "Based on ${context.building?.transactionCount || 'our'} transactions..." when giving prices
- If asked about investment, use the yield data
- If asked about parking, use the parking values
- Compare to community averages when relevant
- Be honest if data is not available for something
`

  return prompt
}