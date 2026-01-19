// lib/ai/context-builder.ts
import { createClient } from '@/lib/supabase/server'

export interface MarketContext {
  building?: {
    name: string
    address: string
    communityName: string | null
    communityId: string | null
    municipalityName: string | null
    municipalityId: string | null
    areaId: string | null
    // PSF data with source
    saleAvgPsf: number | null
    saleAvgPsfSource: string
    leaseAvgPsf: number | null
    leaseAvgPsfSource: string
    // Yield
    grossYield: number | null
    // Carrying costs
    avgMaintenance: number | null
    avgTax: number | null
    // Parking & locker values with sources
    parkingSale: number | null
    parkingSaleSource: string | null
    parkingLease: number | null
    parkingLeaseSource: string | null
    lockerSale: number | null
    lockerLease: number | null
    // Transaction counts
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
  area?: {
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

// Get PSF from psf_monthly tables at a specific geo level
async function getPsfFromMonthly(
  supabase: any,
  geoLevel: 'community' | 'municipality' | 'area',
  geoId: string,
  idColumn: string
): Promise<{ sale: number | null; lease: number | null }> {
  const { data: salePsf } = await supabase
    .from('psf_monthly_sale')
    .select('all_avg_psf')
    .eq(idColumn, geoId)
    .eq('geo_level', geoLevel)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(1)
    .single()

  const { data: leasePsf } = await supabase
    .from('psf_monthly_lease')
    .select('all_avg_psf')
    .eq(idColumn, geoId)
    .eq('geo_level', geoLevel)
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(1)
    .single()

  return {
    sale: salePsf?.all_avg_psf ? parseFloat(salePsf.all_avg_psf) : null,
    lease: leasePsf?.all_avg_psf ? parseFloat(leasePsf.all_avg_psf) : null
  }
}

// Get PSF with geo fallback: building → community → municipality → area
async function getPsfWithFallback(
  supabase: any,
  buildingId: string,
  communityId: string | null,
  municipalityId: string | null,
  areaId: string | null
): Promise<{
  saleAvgPsf: number | null
  saleSource: string
  leaseAvgPsf: number | null
  leaseSource: string
  saleCount: number
  leaseCount: number
}> {
  // Try building level first (from building_psf_summary)
  const { data: buildingPsf } = await supabase
    .from('building_psf_summary')
    .select('sale_avg_psf, lease_avg_psf, sale_count, lease_count')
    .eq('building_id', buildingId)
    .single()

  if (buildingPsf?.sale_avg_psf || buildingPsf?.lease_avg_psf) {
    return {
      saleAvgPsf: buildingPsf.sale_avg_psf ? parseFloat(buildingPsf.sale_avg_psf) : null,
      saleSource: 'building',
      leaseAvgPsf: buildingPsf.lease_avg_psf ? parseFloat(buildingPsf.lease_avg_psf) : null,
      leaseSource: 'building',
      saleCount: buildingPsf.sale_count || 0,
      leaseCount: buildingPsf.lease_count || 0
    }
  }

  // Fallback to community
  if (communityId) {
    const communityPsf = await getPsfFromMonthly(supabase, 'community', communityId, 'community_id')
    if (communityPsf.sale || communityPsf.lease) {
      return {
        saleAvgPsf: communityPsf.sale,
        saleSource: 'community average',
        leaseAvgPsf: communityPsf.lease,
        leaseSource: 'community average',
        saleCount: 0,
        leaseCount: 0
      }
    }
  }

  // Fallback to municipality
  if (municipalityId) {
    const municipalityPsf = await getPsfFromMonthly(supabase, 'municipality', municipalityId, 'municipality_id')
    if (municipalityPsf.sale || municipalityPsf.lease) {
      return {
        saleAvgPsf: municipalityPsf.sale,
        saleSource: 'municipality average',
        leaseAvgPsf: municipalityPsf.lease,
        leaseSource: 'municipality average',
        saleCount: 0,
        leaseCount: 0
      }
    }
  }

  // Fallback to area
  if (areaId) {
    const areaPsf = await getPsfFromMonthly(supabase, 'area', areaId, 'area_id')
    if (areaPsf.sale || areaPsf.lease) {
      return {
        saleAvgPsf: areaPsf.sale,
        saleSource: 'area average',
        leaseAvgPsf: areaPsf.lease,
        leaseSource: 'area average',
        saleCount: 0,
        leaseCount: 0
      }
    }
  }

  return {
    saleAvgPsf: null,
    saleSource: 'N/A',
    leaseAvgPsf: null,
    leaseSource: 'N/A',
    saleCount: 0,
    leaseCount: 0
  }
}

// Get parking/locker values with geo fallback: building → community → municipality → area → global
// Uses: parking_value_* (manual override) OR parking_*_calculated/parking_sale_weighted_avg (auto)
async function getParkingLockerValues(
  supabase: any,
  buildingId: string,
  communityId: string | null,
  municipalityId: string | null,
  areaId: string | null
): Promise<{
  parkingSale: number | null
  parkingSaleSource: string | null
  parkingLease: number | null
  parkingLeaseSource: string | null
  lockerSale: number | null
  lockerLease: number | null
}> {
  let parkingSale: number | null = null
  let parkingSaleSource: string | null = null
  let parkingLease: number | null = null
  let parkingLeaseSource: string | null = null
  let lockerSale: number | null = null
  let lockerLease: number | null = null

  const levels = [
    { id: buildingId, column: 'building_id', name: 'building' },
    { id: communityId, column: 'community_id', name: 'community' },
    { id: municipalityId, column: 'municipality_id', name: 'municipality' },
    { id: areaId, column: 'area_id', name: 'area' },
  ]

  for (const level of levels) {
    if (!level.id) continue

    const { data } = await supabase
      .from('adjustments')
      .select(`
        parking_value_sale, parking_sale_weighted_avg,
        parking_value_lease, parking_lease_calculated,
        locker_value_sale, locker_sale_calculated,
        locker_value_lease, locker_lease_calculated
      `)
      .eq(level.column, level.id)
      .single()

    if (!data) continue

    // Parking Sale: manual override > weighted avg
    if (!parkingSale) {
      const sale = data.parking_value_sale || data.parking_sale_weighted_avg
      if (sale) {
        parkingSale = parseFloat(sale)
        parkingSaleSource = level.name
      }
    }

    // Parking Lease: manual override > calculated
    if (!parkingLease) {
      const lease = data.parking_value_lease || data.parking_lease_calculated
      if (lease) {
        parkingLease = parseFloat(lease)
        parkingLeaseSource = level.name
      }
    }

    // Locker Sale: manual override > calculated
    if (!lockerSale) {
      const sale = data.locker_value_sale || data.locker_sale_calculated
      if (sale) {
        lockerSale = parseFloat(sale)
      }
    }

    // Locker Lease: manual override > calculated
    if (!lockerLease) {
      const lease = data.locker_value_lease || data.locker_lease_calculated
      if (lease) {
        lockerLease = parseFloat(lease)
      }
    }

    // If we have all values, stop searching
    if (parkingSale && parkingLease && lockerSale && lockerLease) break
  }

  // Fall back to global defaults for any missing values
  if (!parkingSale || !parkingLease || !lockerSale || !lockerLease) {
    const { data } = await supabase
      .from('adjustments')
      .select('parking_value_sale, parking_value_lease, locker_value_sale, locker_value_lease')
      .is('building_id', null)
      .is('community_id', null)
      .is('municipality_id', null)
      .is('area_id', null)
      .single()

    if (data) {
      if (!parkingSale && data.parking_value_sale) {
        parkingSale = parseFloat(data.parking_value_sale)
        parkingSaleSource = 'GTA average'
      }
      if (!parkingLease && data.parking_value_lease) {
        parkingLease = parseFloat(data.parking_value_lease)
        parkingLeaseSource = 'GTA average'
      }
      if (!lockerSale && data.locker_value_sale) {
        lockerSale = parseFloat(data.locker_value_sale)
      }
      if (!lockerLease && data.locker_value_lease) {
        lockerLease = parseFloat(data.locker_value_lease)
      }
    }
  }

  return {
    parkingSale,
    parkingSaleSource,
    parkingLease,
    parkingLeaseSource,
    lockerSale,
    lockerLease
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
          name,
          area_id
        )
      )
    `)
    .eq('id', buildingId)
    .single()

  if (!building) {
    console.log('getBuildingMarketContext: Building not found', { buildingId })
    return null
  }

  const communityId = building.community_id
  const communityName = (building.communities as any)?.name || null
  const municipalityId = (building.communities as any)?.municipality_id || null
  const municipalityName = (building.communities as any)?.municipalities?.name || null
  const areaId = (building.communities as any)?.municipalities?.area_id || null

  // Get PSF with geo fallback
  const psfData = await getPsfWithFallback(supabase, buildingId, communityId, municipalityId, areaId)

  // Get building average expenses from listings
  const { data: expenses } = await supabase
    .from('mls_listings')
    .select('association_fee, tax_annual_amount')
    .eq('building_id', buildingId)
    .not('association_fee', 'is', null)

  let avgMaintenance: number | null = null
  let avgTax: number | null = null

  if (expenses && expenses.length > 0) {
    const maintVals = expenses.map((e: any) => parseFloat(e.association_fee)).filter((v: number) => !isNaN(v) && v > 0)
    const taxVals = expenses.map((e: any) => parseFloat(e.tax_annual_amount)).filter((v: number) => !isNaN(v) && v > 0)
    if (maintVals.length > 0) avgMaintenance = Math.round(maintVals.reduce((a, b) => a + b, 0) / maintVals.length)
    if (taxVals.length > 0) avgTax = Math.round(taxVals.reduce((a, b) => a + b, 0) / taxVals.length)
  }

  // Get parking/locker values with geo fallback
  const parkingLocker = await getParkingLockerValues(supabase, buildingId, communityId, municipalityId, areaId)

  // Calculate yield
  let grossYield: number | null = null
  if (psfData.saleAvgPsf && psfData.leaseAvgPsf) {
    grossYield = parseFloat(((psfData.leaseAvgPsf * 12 / psfData.saleAvgPsf) * 100).toFixed(2))
  }

  return {
    name: building.building_name,
    address: building.canonical_address,
    communityName,
    communityId,
    municipalityName,
    municipalityId,
    areaId,
    saleAvgPsf: psfData.saleAvgPsf,
    saleAvgPsfSource: psfData.saleSource,
    leaseAvgPsf: psfData.leaseAvgPsf,
    leaseAvgPsfSource: psfData.leaseSource,
    grossYield,
    avgMaintenance,
    avgTax,
    parkingSale: parkingLocker.parkingSale,
    parkingSaleSource: parkingLocker.parkingSaleSource,
    parkingLease: parkingLocker.parkingLease,
    parkingLeaseSource: parkingLocker.parkingLeaseSource,
    lockerSale: parkingLocker.lockerSale,
    lockerLease: parkingLocker.lockerLease,
    transactionCount: psfData.saleCount + psfData.leaseCount,
    saleCount: psfData.saleCount,
    leaseCount: psfData.leaseCount
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

  const psfData = await getPsfFromMonthly(supabase, 'community', communityId, 'community_id')

  let grossYield: number | null = null
  if (psfData.sale && psfData.lease) {
    grossYield = parseFloat(((psfData.lease * 12 / psfData.sale) * 100).toFixed(2))
  }

  return {
    name: community.name,
    saleAvgPsf: psfData.sale,
    leaseAvgPsf: psfData.lease,
    grossYield
  }
}

export async function getMunicipalityMarketContext(municipalityId: string): Promise<MarketContext['municipality'] | null> {
  const supabase = createClient()

  const { data: municipality } = await supabase
    .from('municipalities')
    .select('name')
    .eq('id', municipalityId)
    .single()

  if (!municipality) return null

  const psfData = await getPsfFromMonthly(supabase, 'municipality', municipalityId, 'municipality_id')

  let grossYield: number | null = null
  if (psfData.sale && psfData.lease) {
    grossYield = parseFloat(((psfData.lease * 12 / psfData.sale) * 100).toFixed(2))
  }

  return {
    name: municipality.name,
    saleAvgPsf: psfData.sale,
    leaseAvgPsf: psfData.lease,
    grossYield
  }
}

export async function getAreaMarketContext(areaId: string): Promise<MarketContext['area'] | null> {
  const supabase = createClient()

  const psfData = await getPsfFromMonthly(supabase, 'area', areaId, 'area_id')

  if (!psfData.sale && !psfData.lease) return null

  let grossYield: number | null = null
  if (psfData.sale && psfData.lease) {
    grossYield = parseFloat(((psfData.lease * 12 / psfData.sale) * 100).toFixed(2))
  }

  return {
    saleAvgPsf: psfData.sale,
    leaseAvgPsf: psfData.lease,
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

  if (!sqft && listing.living_area_range) {
    const match = listing.living_area_range.match(/(\d+)-(\d+)/)
    if (match) sqft = (parseInt(match[1]) + parseInt(match[2])) / 2
  }

  const psf = price && sqft ? Math.round(price / sqft) : null
  const maintenance = listing.association_fee ? parseFloat(listing.association_fee) : null
  const propertyTax = listing.tax_annual_amount ? parseFloat(listing.tax_annual_amount) : null

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
  let prompt = '\n\n## REAL MARKET DATA - Powered by Our Internal Market Intelligence\n'
  prompt += '**You MUST use this data to answer questions. Never say "I don\'t have data" if data is provided below.**\n'

  if (context.building) {
    const b = context.building
    prompt += `
### Building: ${b.name}
- Address: ${b.address}
- Community: ${b.communityName || 'N/A'}
- Municipality: ${b.municipalityName || 'N/A'}

**SALE PRICING:**
- Average Sale PSF: ${b.saleAvgPsf ? `$${Math.round(b.saleAvgPsf)}/sqft` : 'N/A'}${b.saleCount > 0 ? ` (from ${b.saleCount} sales)` : ` (${b.saleAvgPsfSource})`}

**LEASE PRICING:**
- Average Lease PSF: ${b.leaseAvgPsf ? `$${b.leaseAvgPsf.toFixed(2)}/sqft/month` : 'N/A'}${b.leaseCount > 0 ? ` (from ${b.leaseCount} leases)` : ` (${b.leaseAvgPsfSource})`}

**INVESTMENT METRICS:**
- Gross Yield: ${b.grossYield ? `${b.grossYield}%` : 'N/A'}

**CARRYING COSTS:**
- Avg Maintenance Fee: ${b.avgMaintenance ? `$${b.avgMaintenance}/month` : 'N/A'}
- Avg Property Tax: ${b.avgTax ? `$${b.avgTax}/year` : 'N/A'}

**PARKING & LOCKER:**
- Parking Purchase Price: ${b.parkingSale ? `${Math.round(b.parkingSale).toLocaleString()}` : 'N/A'}${b.parkingSaleSource ? ` (${b.parkingSaleSource})` : ''}
- Parking Monthly Rent: ${b.parkingLease ? `${Math.round(b.parkingLease)}/month` : 'N/A'}${b.parkingLeaseSource ? ` (${b.parkingLeaseSource})` : ''}
- Locker Purchase Price: ${b.lockerSale ? `${Math.round(b.lockerSale).toLocaleString()}` : 'N/A'}
- Locker Monthly Rent: ${b.lockerLease ? `${Math.round(b.lockerLease)}/month` : 'N/A'}

- Total Transactions Analyzed: ${b.transactionCount > 0 ? b.transactionCount : 'Using ' + b.saleAvgPsfSource + ' data'}
`
  }

  if (context.community) {
    const c = context.community
    prompt += `
### Community Comparison: ${c.name}
- Community Sale PSF: ${c.saleAvgPsf ? `$${Math.round(c.saleAvgPsf)}/sqft` : 'N/A'}
- Community Lease PSF: ${c.leaseAvgPsf ? `$${c.leaseAvgPsf.toFixed(2)}/sqft/month` : 'N/A'}
- Community Yield: ${c.grossYield ? `${c.grossYield}%` : 'N/A'}
`
  }

  if (context.municipality) {
    const m = context.municipality
    prompt += `
### Municipality Comparison: ${m.name}
- Municipality Sale PSF: ${m.saleAvgPsf ? `$${Math.round(m.saleAvgPsf)}/sqft` : 'N/A'}
- Municipality Lease PSF: ${m.leaseAvgPsf ? `$${m.leaseAvgPsf.toFixed(2)}/sqft/month` : 'N/A'}
- Municipality Yield: ${m.grossYield ? `${m.grossYield}%` : 'N/A'}
`
  }

  if (context.area) {
    const a = context.area
    prompt += `
### Area (Broader Region) Comparison:
- Area Sale PSF: ${a.saleAvgPsf ? `$${Math.round(a.saleAvgPsf)}/sqft` : 'N/A'}
- Area Lease PSF: ${a.leaseAvgPsf ? `$${a.leaseAvgPsf.toFixed(2)}/sqft/month` : 'N/A'}
- Area Yield: ${a.grossYield ? `${a.grossYield}%` : 'N/A'}
`
  }

  if (context.listing) {
    const l = context.listing
    prompt += `
### Current Listing: ${l.mlsNumber}
- List Price: $${l.price.toLocaleString()}
- Size: ${l.sqft ? `${l.sqft} sqft` : 'N/A'}
- Price/sqft: ${l.psf ? `$${l.psf}/sqft` : 'N/A'}
- Bedrooms: ${l.bedrooms} | Bathrooms: ${l.bathrooms}
- Maintenance: ${l.maintenance ? `$${l.maintenance}/month` : 'N/A'}
- Property Tax: ${l.propertyTax ? `$${l.propertyTax}/year` : 'N/A'}
- Estimated Rent: ${l.estimatedRent ? `$${l.estimatedRent.toLocaleString()}/month` : 'N/A'}
- Estimated Yield: ${l.grossYield ? `${l.grossYield}%` : 'N/A'}
`
  }

  prompt += `
### INSTRUCTIONS FOR USING THIS DATA:
1. ALWAYS use the pricing data above when answering PSF, price, or parking questions
2. Cite sources: "Based on X sales..." or "Using community average data..."
3. Compare building to community/municipality when relevant
4. For parking: use the values above, mention if it's from GTA average
5. If specific data is truly N/A, offer to connect with the agent
`

  return prompt
}